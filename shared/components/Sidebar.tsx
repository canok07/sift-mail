import React, { useState } from 'react';
import { AlertTriangle, Inbox, Layers, Plus, Send, Sparkles, Tag, X } from 'lucide-react';
import { ConnectedAccount, FilterTab, SafeCategory, ScanStats, UserLabel } from '../types';
import { AppTheme } from '../stores/useSettingsStore';
import { useTranslation } from 'react-i18next';

interface SidebarProps {
  accounts?: ConnectedAccount[]; activeAccountId?: string | 'all'; onSelectAccount: (id: string | 'all') => void;
  onRemoveAccount?: (id: string) => void; activeTab: FilterTab; onTabChange: (tab: FilterTab) => void;
  selectedCategory: SafeCategory | 'all'; onSelectCategory: (category: SafeCategory | 'all') => void; stats: ScanStats;
  onOpenAccountModal: () => void; onOpenRulesModal: () => void; onAutoCategorizeAll: () => void; isCategorizing: boolean;
  activeRulesCount: number; onToggleAssistant?: () => void; isAssistantOpen?: boolean; theme?: AppTheme;
  onCompose?: () => void; labels?: UserLabel[]; activeLabel?: string | null; onSelectLabel?: (id: string | null) => void;
  onCreateLabel?: (name: string, color: string) => void; onDeleteLabel?: (id: string) => void;
  aiEnabled?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ accounts = [], activeAccountId = 'all', onSelectAccount, activeTab, onTabChange, onOpenAccountModal, onToggleAssistant, theme = 'dark', onCompose, labels = [], activeLabel, onSelectLabel, onCreateLabel, onDeleteLabel, aiEnabled = false }) => {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false); const [labelName, setLabelName] = useState('');
  const visible = accounts.filter(a => activeAccountId === 'all' || a.id === activeAccountId);
  const count = (type: string) => visible.reduce((n,a) => n + (a.mailboxes || []).filter(m => m.type === type).reduce((s,m) => s + (m.totalMessages || 0), 0), 0);
  const items: {id: FilterTab; label: string; icon: typeof Inbox; total?: number}[] = [
    {id:'all', label:t('nav.allMessages'), icon:Layers},
    {id:'inbox', label:t('nav.inbox'), icon:Inbox, total:count('inbox')},
    {id:'sent', label:t('nav.sent'), icon:Send, total:count('sent')},
    {id:'threats', label:t('nav.spam'), icon:AlertTriangle, total:count('spam')},
  ];
  const submitLabel = () => { const name=labelName.trim(); if(name){onCreateLabel?.(name,'#10b981');setLabelName('');setAdding(false);} };
  return <aside className="theme-panel theme-border w-64 shrink-0 border-r p-3 overflow-y-auto">
    <button onClick={onCompose} className="w-full mb-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white py-3 text-sm font-bold"><Plus size={17}/>{t('compose.title')}</button>
    <p className="px-3 mb-2 text-[10px] uppercase tracking-widest opacity-50">{t('nav.accounts')}</p>
    <div className="space-y-1 mb-4">
      <button className={`w-full text-left px-3 py-2 text-sm rounded-lg ${activeAccountId==='all'?'bg-emerald-500/15 text-emerald-500':'hover:bg-zinc-500/10'}`} onClick={()=>onSelectAccount('all')}>{t('nav.allAccounts')}</button>
      {accounts.map((a,index)=><button key={a.id} title={a.email} onClick={()=>onSelectAccount(a.id)} className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg ${activeAccountId===a.id?'bg-emerald-500/15 text-emerald-500':'hover:bg-zinc-500/10'}`}><span className="w-6 h-6 rounded-full bg-zinc-500/15 grid place-items-center font-bold">{index+1}</span><span className="min-w-0 text-left"><span className="block truncate">{a.displayName || `${index+1}. Mail`}</span><span className="block truncate opacity-50">{a.email}</span></span>{a.status==='syncing'&&<span className="ml-auto w-2 h-2 rounded-full bg-amber-400 animate-pulse"/>}</button>)}
      <button onClick={onOpenAccountModal} className="flex items-center gap-2 px-3 py-2 text-xs opacity-60 hover:opacity-100"><Plus size={15}/>{t('nav.addAccount')}</button>
    </div>
    <nav className="space-y-1 pb-4 border-b border-black/10 dark:border-white/10">{items.map(item=><button key={item.id} onClick={()=>{onSelectLabel?.(null);onTabChange(item.id)}} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${activeTab===item.id&&!activeLabel?'bg-emerald-500/15 text-emerald-500':'hover:bg-zinc-500/10'}`}><item.icon size={17}/><span className="flex-1 text-left">{item.label}</span>{item.total!==undefined&&<span className="text-xs opacity-60">{item.total}</span>}</button>)}</nav>
    <div className="py-4">
      <div className="flex items-center justify-between px-3 mb-2"><p className="text-[10px] uppercase tracking-widest opacity-50">{t('labels.title')}</p><button aria-label={t('labels.create')} onClick={()=>setAdding(!adding)}><Plus size={15}/></button></div>
      {adding&&<div className="flex gap-1 mb-2"><input autoFocus value={labelName} onChange={e=>setLabelName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submitLabel()} placeholder={t('labels.name')} className="min-w-0 flex-1 rounded-lg bg-zinc-500/10 px-2 py-1.5 text-xs outline-none"/><button onClick={submitLabel} className="text-emerald-500"><Plus size={16}/></button></div>}
      {labels.length===0?<p className="px-3 text-xs opacity-45">{t('labels.empty')}</p>:labels.map(label=><div key={label.id} className={`group flex items-center rounded-lg ${activeLabel===label.id?'bg-emerald-500/15':''}`}><button onClick={()=>onSelectLabel?.(label.id)} className="flex-1 flex items-center gap-2 px-3 py-2 text-xs"><Tag size={14} style={{color:label.color}}/><span className="truncate">{label.name}</span></button><button onClick={()=>onDeleteLabel?.(label.id)} className="p-2 opacity-0 group-hover:opacity-50"><X size={13}/></button></div>)}
    </div>
    {aiEnabled&&<button onClick={onToggleAssistant} className="flex items-center gap-2 px-3 py-2 text-xs opacity-60 hover:opacity-100"><Sparkles size={15}/>{t('ai.assistant')}</button>}
    <p className="px-3 mt-3 text-[10px] opacity-40">Sift Mail · 0.7.3</p>
  </aside>;
};
