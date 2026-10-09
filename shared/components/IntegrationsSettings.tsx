import React, { useEffect, useState } from 'react';
import { CheckCircle2, CircleOff, Plug, RefreshCw, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { safeFetchJson } from '../services/apiClient';
import { AIProvider, useSettingsStore } from '../stores/useSettingsStore';
import { ConnectionPlugin, PluginStatus, notifyAIConnectionChange, refreshAIConnections } from '../services/aiConnections';

type Config = { apiKey: string; endpoint: string; model: string };
export function IntegrationsSettings({ aiOnly = false }: { aiOnly?: boolean }) {
  const { t } = useTranslation();
  const activeProvider = useSettingsStore(s => s.aiProvider);
  const [plugins, setPlugins] = useState<ConnectionPlugin[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [config, setConfig] = useState<Record<string, Config>>({});
  const load = async () => {
    try { setPlugins(await refreshAIConnections()); }
    catch (e: any) { useSettingsStore.getState().setAIEnabled(false); setMessage(e.message); }
  };
  useEffect(() => { void load(); }, []);
  const values = (plugin: ConnectionPlugin): Config => config[plugin.id] || {
    apiKey: '', model: plugin.configuration?.model || '', endpoint: plugin.configuration?.endpoint || '',
  };
  const act = async (plugin: ConnectionPlugin, action: 'configure' | 'test' | 'enable' | 'disable') => {
    setBusy(`${plugin.id}:${action}`); setMessage('');
    const c = values(plugin);
    const payload = { apiKey: c.apiKey || undefined, model: c.model || undefined,
      endpoint: plugin.id === 'ollama' ? c.endpoint || undefined : undefined };
    const command = async (name: string, body = {}) => {
      const data = await safeFetchJson<any>(`/api/plugins/${plugin.id}/${name}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!data.success) throw new Error(data.plugin?.message || t('integrations.failed'));
      return data;
    };
    try {
      let data;
      if (action === 'configure') {
        await command('configure', payload);
        await load();
        await command('test');
        data = await command('enable');
      } else data = await command(action, action === 'test' && open === plugin.id ? payload : {});
      if (plugin.kind === 'ai-provider' && (action === 'enable' || action === 'configure')) useSettingsStore.getState().setAIProvider(plugin.id as AIProvider);
      setMessage(data.plugin?.message || t('integrations.done'));
      if (action === 'configure') setOpen(null);
    } catch (e: any) { setMessage(e.data?.plugin?.message || e.message || t('integrations.failed')); }
    finally {
      if (action === 'configure') setConfig(prev => ({ ...prev, [plugin.id]: { ...c, apiKey: '' } }));
      await load(); notifyAIConnectionChange(); setBusy('');
    }
  };
  return <section className="max-w-4xl mx-auto rounded-2xl bg-zinc-500/[.08] p-6">
    <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-lg">{t(aiOnly ? 'settings.ai.title' : 'integrations.title')}</h2><p className="text-sm opacity-60">{t(aiOnly ? 'settings.ai.description' : 'integrations.description')}</p></div><button className="btn" disabled={Boolean(busy)} onClick={() => void load()} aria-label={t('integrations.refresh')}><RefreshCw size={16}/></button></div>
    <p className="text-xs opacity-55 mb-4">{t('ui.settings.testHint')}</p>
    <label className="block text-sm mb-4"><span className="block opacity-60 mb-2">{t('ui.settings.activeProvider')}</span><select aria-label={t('ui.settings.activeProvider')} value={activeProvider} disabled={Boolean(busy) || !plugins.length} onChange={e => { const settings = useSettingsStore.getState(); settings.setAIProvider(e.target.value as AIProvider); settings.setAIEnabled(false); void load(); notifyAIConnectionChange(); }}>{plugins.filter(p => p.kind === 'ai-provider').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    {message && <p role="status" className="mb-4 text-sm rounded-xl bg-zinc-500/10 p-3">{message}</p>}
    <div className="grid md:grid-cols-2 gap-3">{plugins.filter(p => aiOnly ? p.kind === 'ai-provider' : p.id !== 'sift-local').map(plugin => {
      const c = values(plugin), isJev = plugin.id === 'jev';
      return <article key={plugin.id} className="rounded-2xl border border-zinc-500/20 p-4" data-testid={`plugin-${plugin.id}`}>
        <div className="flex gap-3 items-start"><div className="p-2 rounded-xl bg-zinc-500/10"><Plug size={18}/></div><div className="min-w-0 flex-1"><h3 className="font-bold">{plugin.name}</h3><p className="text-xs opacity-55">{t(`integrations.kinds.${plugin.kind}`)}</p></div><Status value={plugin.status}/></div>
        <p className="text-xs opacity-60 mt-3">{plugin.capabilities.map(x => t(`integrations.capabilities.${x}`)).join(' · ')}</p>
        {plugin.message && <p className="text-xs text-amber-500 mt-2">{plugin.message}</p>}
        <div className="flex flex-wrap gap-2 mt-4">
          <button className="btn" disabled={Boolean(busy) || isJev} onClick={() => { setOpen(open === plugin.id ? null : plugin.id); setConfig(v => ({ ...v, [plugin.id]: { ...c, apiKey: '' } })); }}><Settings2 size={14}/>{t('integrations.configure')}</button>
          <button className="btn" disabled={Boolean(busy) || isJev} onClick={() => void act(plugin, 'test')}>{t('integrations.test')}</button>
          {plugin.enabled ? <button className="btn" disabled={Boolean(busy)} onClick={() => void act(plugin, 'disable')}><CircleOff size={14}/>{t('integrations.disable')}</button>
            : <button className="btn-primary" disabled={Boolean(busy) || isJev || !['DISABLED', 'CONNECTED'].includes(plugin.status)} onClick={() => void act(plugin, 'enable')}><CheckCircle2 size={14}/>{t('integrations.enable')}</button>}
        </div>
        {open === plugin.id && <div className="space-y-2 mt-4 pt-4 border-t border-zinc-500/20">
          {plugin.id !== 'ollama' && <input aria-label={t('integrations.apiKey')} type="password" value={c.apiKey} onChange={e => setConfig(v => ({ ...v, [plugin.id]: { ...c, apiKey: e.target.value } }))} placeholder={t('integrations.apiKey')} autoComplete="new-password"/>}
          {plugin.id === 'ollama' && <input aria-label={t('integrations.endpoint')} value={c.endpoint} onChange={e => setConfig(v => ({ ...v, [plugin.id]: { ...c, endpoint: e.target.value } }))} placeholder={t('integrations.endpoint')}/>}
          <input aria-label={t('integrations.model')} value={c.model} onChange={e => setConfig(v => ({ ...v, [plugin.id]: { ...c, model: e.target.value } }))} placeholder={t('integrations.model')}/>
          <button className="btn-primary" disabled={Boolean(busy)} onClick={() => void act(plugin, 'configure')}>{t('ui.settings.connect')}</button>
        </div>}
      </article>;
    })}</div>
    {!aiOnly && <p className="text-xs opacity-55 mt-5">{t('integrations.localFallback')}</p>}
  </section>;
}
const Status = ({ value }: { value: PluginStatus }) => {
  const { t } = useTranslation();
  return <span className={`text-[10px] font-bold ${value === 'CONNECTED' ? 'text-emerald-500' : value === 'ERROR' ? 'text-rose-500' : 'text-amber-500'}`}>{t(`integrations.status.${value}`)}</span>;
};
