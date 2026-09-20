import { z } from 'zod';
import crypto from 'crypto';
import { deleteVaultSecret, getVaultSecret, saveVaultSecret } from '../security/vault';
import { getAiProvidersStatus, testAiProviderConnection } from '../ai/multiModelService';

export type PluginKind = 'ai-provider' | 'decision-provider';
export type PluginStatus = 'NOT_CONFIGURED' | 'CONFIGURED' | 'CONNECTED' | 'DISABLED' | 'ERROR';
export type PluginCapability = 'generate' | 'summarize' | 'classify' | 'draft-reply' | 'constrained-decision';

export interface PluginDescriptor {
  id: string;
  name: string;
  kind: PluginKind;
  capabilities: PluginCapability[];
  enabled: boolean;
  status: PluginStatus;
  message?: string;
}

export const DecisionOutputSchema = z.object({
  category: z.enum(['work', 'finance', 'shopping', 'official', 'personal', 'travel', 'promotion', 'other']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  phishingRisk: z.number().min(0).max(1),
  promotionProbability: z.number().min(0).max(1),
  needsReview: z.boolean(),
}).strict();
export type DecisionOutput = z.infer<typeof DecisionOutputSchema>;

export interface DecisionInput {
  senderDomain?: string;
  subject?: string;
  snippet?: string;
  existingLabels?: string[];
}

export interface SiftPlugin {
  readonly id: string;
  readonly name: string;
  readonly kind: PluginKind;
  readonly capabilities: PluginCapability[];
  describe(): PluginDescriptor;
  configure(config: { apiKey?: string; endpoint?: string; model?: string }): Promise<PluginDescriptor>;
  test(): Promise<PluginDescriptor>;
  enable(): Promise<PluginDescriptor>;
  disable(): Promise<PluginDescriptor>;
}

export interface DecisionProviderPlugin extends SiftPlugin {
  readonly kind: 'decision-provider';
  decide(input: DecisionInput): Promise<DecisionOutput>;
}

type PluginRun = { id:string; pluginId:string; operation:string; startedAt:string; durationMs:number; status:'completed'|'failed'|'fallback'; errorCode?:string };

const boolSecret = (key: string) => getVaultSecret(key) === 'true';
const setEnabled = (id: string, enabled: boolean) => saveVaultSecret(`plugin_${id}_enabled`, String(enabled), 'custom_token', `${id} enabled`);

class AIProviderPlugin implements SiftPlugin {
  readonly kind = 'ai-provider' as const;
  readonly capabilities: PluginCapability[] = ['generate','summarize','classify','draft-reply'];
  constructor(readonly id:'gemini'|'openai'|'anthropic'|'ollama', readonly name:string) {}
  private configured() { return Boolean(getAiProvidersStatus()[this.id]?.configured); }
  describe(): PluginDescriptor {
    const configured=this.configured(), enabled=configured&&getVaultSecret(`plugin_${this.id}_enabled`)!=='false', tested=boolSecret(`plugin_${this.id}_tested`);
    return {id:this.id,name:this.name,kind:this.kind,capabilities:this.capabilities,enabled,status:!configured?'NOT_CONFIGURED':!enabled?'DISABLED':tested?'CONNECTED':'CONFIGURED'};
  }
  async configure(config:{apiKey?:string;endpoint?:string;model?:string}) {
    if(config.apiKey){const key=this.id==='gemini'?'gemini_custom_api_key':`${this.id}_api_key`;saveVaultSecret(key,config.apiKey,'custom_token',`${this.name} API Key`)}
    if(config.endpoint)saveVaultSecret(`${this.id}_endpoint`,config.endpoint,'custom_token',`${this.name} endpoint`);
    if(config.model)saveVaultSecret(`${this.id}_model`,config.model,'custom_token',`${this.name} model`);
    deleteVaultSecret(`plugin_${this.id}_tested`); return this.describe();
  }
  async test() {
    const result=await testAiProviderConnection({provider:this.id,endpoint:getVaultSecret(`${this.id}_endpoint`)||undefined,model:getVaultSecret(`${this.id}_model`)||undefined});
    if(result.success)saveVaultSecret(`plugin_${this.id}_tested`,'true','custom_token',`${this.name} tested`);
    else deleteVaultSecret(`plugin_${this.id}_tested`);
    return {...this.describe(),status:result.success?'CONNECTED':'ERROR',message:result.message} as PluginDescriptor;
  }
  async enable(){if(!this.configured())throw new Error('PLUGIN_NOT_CONFIGURED');setEnabled(this.id,true);return this.describe()}
  async disable(){setEnabled(this.id,false);return this.describe()}
}

class SiftLocalDecisionPlugin implements DecisionProviderPlugin {
  readonly id='sift-local'; readonly name='Sift Local'; readonly kind='decision-provider' as const;
  readonly capabilities:PluginCapability[]=['constrained-decision','classify'];
  describe():PluginDescriptor{return{id:this.id,name:this.name,kind:this.kind,capabilities:this.capabilities,enabled:true,status:'CONNECTED'}}
  async configure(){return this.describe()} async test(){return this.describe()} async enable(){return this.describe()} async disable(){return this.describe()}
  async decide(input:DecisionInput):Promise<DecisionOutput>{
    const text=`${input.subject||''} ${input.snippet||''}`.toLocaleLowerCase();
    const promotion=/(indirim|kampanya|fırsat|offer|sale|rabatt|newsletter)/.test(text)?0.9:0.1;
    const phishing=/(şifren|password|verify now|acil doğrula|hesabınız kapatılacak)/.test(text)?0.7:0.05;
    const category=/(fatura|ödeme|invoice|rechnung|bank)/.test(text)?'finance':/(kargo|sipariş|order|delivery)/.test(text)?'shopping':promotion>0.7?'promotion':'other';
    return DecisionOutputSchema.parse({category,priority:phishing>=0.7?'high':'normal',phishingRisk:phishing,promotionProbability:promotion,needsReview:phishing>=0.7});
  }
}

class JevDecisionPlugin implements DecisionProviderPlugin {
  readonly id='jev'; readonly name='Jev'; readonly kind='decision-provider' as const;
  readonly capabilities:PluginCapability[]=['constrained-decision'];
  private unavailable():PluginDescriptor{return{id:this.id,name:this.name,kind:this.kind,capabilities:this.capabilities,enabled:false,status:'NOT_CONFIGURED',message:'JEV_NATIVE_INTEGRATION_UNAVAILABLE'}}
  describe(){return this.unavailable()}
  async configure(config:{apiKey?:string;endpoint?:string}){if(config.apiKey)saveVaultSecret('jev_api_key',config.apiKey,'custom_token','Jev API Key');if(config.endpoint)saveVaultSecret('jev_endpoint',config.endpoint,'custom_token','Jev endpoint');return this.unavailable()}
  async test(){return this.unavailable()} async enable():Promise<PluginDescriptor>{throw new Error('JEV_NATIVE_INTEGRATION_UNAVAILABLE')} async disable(){setEnabled(this.id,false);return this.unavailable()}
  async decide():Promise<DecisionOutput>{throw new Error('JEV_NATIVE_INTEGRATION_UNAVAILABLE')}
}

export class PluginManager {
  private plugins=new Map<string,SiftPlugin>(); private runs:PluginRun[]=[];
  register(plugin:SiftPlugin){this.plugins.set(plugin.id,plugin)}
  list(){return [...this.plugins.values()].map(plugin=>plugin.describe())}
  get(id:string){const plugin=this.plugins.get(id);if(!plugin)throw new Error('PLUGIN_NOT_FOUND');return plugin}
  getRuns(){return [...this.runs].reverse()}
  private async isolated<T>(pluginId:string,operation:string,work:()=>Promise<T>):Promise<T>{const started=Date.now();try{const value=await work();this.record(pluginId,operation,started,'completed');return value}catch(error:any){this.record(pluginId,operation,started,'failed',String(error?.message||'PLUGIN_FAILED'));throw error}}
  private record(pluginId:string,operation:string,started:number,status:PluginRun['status'],errorCode?:string){this.runs.push({id:crypto.randomUUID(),pluginId,operation,startedAt:new Date(started).toISOString(),durationMs:Date.now()-started,status,errorCode});this.runs=this.runs.slice(-100)}
  configure(id:string,config:{apiKey?:string;endpoint?:string;model?:string}){return this.isolated(id,'configure',()=>this.get(id).configure(config))}
  test(id:string){return this.isolated(id,'test',()=>this.get(id).test())}
  enable(id:string){return this.isolated(id,'enable',()=>this.get(id).enable())}
  disable(id:string){return this.isolated(id,'disable',()=>this.get(id).disable())}
  async decide(id:string,input:DecisionInput):Promise<{provider:string;decision:DecisionOutput;fallback:boolean}>{
    try{const plugin=this.get(id) as DecisionProviderPlugin;if(plugin.kind!=='decision-provider')throw new Error('PLUGIN_CAPABILITY_MISMATCH');const decision=DecisionOutputSchema.parse(await plugin.decide(input));this.record(id,'decide',Date.now(),'completed');return{provider:id,decision,fallback:false}}
    catch{const local=this.get('sift-local') as DecisionProviderPlugin;const decision=DecisionOutputSchema.parse(await local.decide(input));this.record(id,'decide',Date.now(),'fallback');return{provider:'sift-local',decision,fallback:true}}
  }
}

export function createPluginManager(){const manager=new PluginManager();manager.register(new SiftLocalDecisionPlugin());manager.register(new JevDecisionPlugin());manager.register(new AIProviderPlugin('gemini','Google Gemini'));manager.register(new AIProviderPlugin('openai','OpenAI'));manager.register(new AIProviderPlugin('anthropic','Anthropic Claude'));manager.register(new AIProviderPlugin('ollama','Ollama'));return manager}
