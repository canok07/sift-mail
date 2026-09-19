import React from 'react';
import { AppTheme } from './Header';
import { Inbox, Send, AlertTriangle, Layers, Plus, Sparkles } from 'lucide-react';
import { FilterTab, SafeCategory, ScanStats, ConnectedAccount } from '../types';
import { useTranslation } from 'react-i18next';

interface SidebarProps {
  accounts?: ConnectedAccount[];
  activeAccountId?: string | 'all';
  onSelectAccount: (accountId: string | 'all') => void;
  onRemoveAccount?: (accountId: string) => void;
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  selectedCategory: SafeCategory | 'all';
  onSelectCategory: (category: SafeCategory | 'all') => void;
  stats: ScanStats;
  onOpenAccountModal: () => void;
  onOpenRulesModal: () => void;
  onAutoCategorizeAll: () => void;
  isCategorizing: boolean;
  activeRulesCount: number;
  onToggleAssistant?: () => void;
  isAssistantOpen?: boolean;
  theme?: AppTheme;
}

export const Sidebar: React.FC<SidebarProps> = ({accounts = [], activeAccountId = 'all', onSelectAccount, activeTab, onTabChange, onOpenAccountModal, onToggleAssistant, theme = 'dark'}) => {
  const {t} = useTranslation();
  const boxes = accounts.filter(a => activeAccountId === 'all' || a.id === activeAccountId);
  const count = (type: string) => boxes.reduce((n,a) => n + (a.mailboxes || []).filter(m => m.type === type).reduce((s,m) => s + (m.totalMessages || 0),0),0);
  const items: {id: FilterTab; label: string; icon: typeof Inbox; total?: number}[] = [
    {id:'inbox',label:t('nav.inbox', {defaultValue:'Gelen Kutusu'}),icon:Inbox,total:count('inbox')},
    {id:'sent',label:t('nav.sent', {defaultValue:'Gönderilenler'}),icon:Send,total:count('sent')},
    {id:'threats',label:'Spam',icon:AlertTriangle,total:count('spam')},
    {id:'all',label:t('nav.allMessages'),icon:Layers},
  ];
  return <aside className={`w-56 shrink-0 border-r border-black/10 dark:border-white/10 p-3 space-y-6 overflow-y-auto ${theme === 'light' ? 'bg-zinc-50 text-zinc-800' : 'bg-zinc-950 text-zinc-200'}`}>
    <div className="space-y-1">
      <button className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-zinc-500/10" onClick={()=>onSelectAccount('all')}>{t('nav.allAccounts', {defaultValue:'Tüm hesaplar'})}</button>
      {accounts.map(a=><button key={a.id} title={a.email} onClick={()=>onSelectAccount(a.id)} className={`block w-full truncate text-left px-3 py-2 text-xs rounded-lg ${activeAccountId===a.id?'bg-emerald-500/15 text-emerald-500':'hover:bg-zinc-500/10'}`}>{a.email}</button>)}
      <button onClick={onOpenAccountModal} className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-500"><Plus size={15}/>{t('nav.addAccount',{defaultValue:'Hesap ekle'})}</button>
    </div>
    <nav className="space-y-1">{items.map(item=><button key={item.id} onClick={()=>onTabChange(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${activeTab===item.id?'bg-emerald-500/15 text-emerald-500':'hover:bg-zinc-500/10'}`}><item.icon size={17}/><span className="flex-1 text-left">{item.label}</span>{item.total!==undefined&&<span className="text-xs opacity-60">{item.total}</span>}</button>)}</nav>
    <button onClick={onToggleAssistant} className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-500"><Sparkles size={15}/>AI Asistan</button>
    <p className="px-3 text-[10px] text-zinc-500">Sift v15 · 0.5.2</p>
  </aside>;
};
