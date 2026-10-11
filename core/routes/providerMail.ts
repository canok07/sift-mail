import {Router} from 'express';
import {z} from 'zod';
import {requireApiToken,sensitiveApiLimiter} from '../security';
import {ImapConnectSchema,SmtpSendSchema} from '../security/validation';
import {saveProviderDraft,openProviderDraft,changeProviderLabel} from '../mail/providerWorkflows';

const account=ImapConnectSchema.extend({accountId:z.string().min(1).max(100),accountEmail:z.string().email().max(254)})
  .refine(data=>data.accountEmail.toLowerCase()===data.auth.user.trim().toLowerCase());
const identity=account.safeExtend({folder:z.string().min(1).max(255),uid:z.number().int().positive().max(4294967295),
  expectedUidValidity:z.string().regex(/^[1-9]\d{0,9}$/).refine(value=>Number(value)<=4294967295),messageId:z.string().max(500).optional()});
const draftMail=SmtpSendSchema.shape.mail.extend({to:z.string().max(500),subject:z.string().max(500),text:z.string().max(200000)});
export function createProviderMailRouter() {
  const router=Router();
  router.use('/api/mail/provider',sensitiveApiLimiter,requireApiToken,(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  router.post('/api/mail/provider/draft',async(req,res)=>{
    const parsed=z.object({config:account,mail:draftMail,confirmSaveCopy:z.literal(true)}).strict().safeParse(req.body);
    if(!parsed.success)return res.status(400).json({success:false,error:'Invalid draft request.'});
    try{res.json(await saveProviderDraft(parsed.data.config,parsed.data.mail));}
    catch{res.status(409).json({success:false,error:'Draft copy could not be confirmed. Check the provider Drafts folder before saving again.'});}
  });
  router.post('/api/mail/provider/draft/open',async(req,res)=>{
    const parsed=identity.strict().safeParse(req.body);
    if(!parsed.success)return res.status(400).json({success:false,error:'Invalid draft identity.'});
    try{res.json(await openProviderDraft(parsed.data));}catch{res.status(409).json({success:false,error:'Draft could not be opened safely. Refresh the folder and reconnect if necessary.'});}
  });
  router.post('/api/mail/provider/label',async(req,res)=>{
    const parsed=z.object({config:identity,label:z.string().min(1).max(200),remove:z.boolean().default(false),confirm:z.literal(true)}).strict().safeParse(req.body);
    if(!parsed.success)return res.status(400).json({success:false,error:'Invalid label request or missing confirmation.'});
    try{res.json(await changeProviderLabel(parsed.data.config,parsed.data.label,parsed.data.remove));}
    catch{res.status(409).json({success:false,error:'Provider label update was not confirmed. The server may not support labels/keywords, or the message identity changed. Local labels are unchanged.'});}
  });
  return router;
}
