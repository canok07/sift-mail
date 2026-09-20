import React from 'react';
import { AppTheme } from './Header';
import { EmailMessage, SafeCategory } from '../types';
import { useTranslation } from 'react-i18next';

interface EmailCardProps {
  email: EmailMessage;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onOpenDetail: (email: EmailMessage) => void;
  onAnalyze: (email: EmailMessage) => void;
  onUnsubscribe: (email: EmailMessage) => void;
  onRequestTrash: (email: EmailMessage) => void;
  onReply?: (email: EmailMessage) => void;
  onUpdateCategory?: (emailId: string, category: SafeCategory) => void;
  onMarkSafeArchive?: (email: EmailMessage) => void;
  onUnsubscribeAndPurge?: (email: EmailMessage) => void;
  onOpenAssistant?: (email: EmailMessage) => void;
  theme?: AppTheme;
}

export const EmailCard: React.FC<EmailCardProps> = ({email,isSelected,onToggleSelect,onOpenDetail,theme='dark'}) => {
 const {i18n}=useTranslation();
 const parsedDate=new Date(email.date);
 const date=Number.isNaN(parsedDate.getTime())?email.date:parsedDate.toLocaleString(i18n.language);
 return <div className={`theme-panel theme-border flex items-start gap-3 px-4 py-3 rounded-lg border ${isSelected?'ring-1 ring-emerald-500':''}`}>
   <input aria-label={email.subject} type="checkbox" className="mt-1 accent-emerald-500" checked={isSelected} onChange={()=>onToggleSelect(email.id)}/>
   <button onClick={()=>onOpenDetail(email)} className="min-w-0 flex-1 text-left">
    <div className="flex justify-between gap-3"><span className={`truncate text-sm ${!email.isRead?'font-semibold':''}`}>{email.fromName || email.from}</span><time className="text-[11px] shrink-0 text-zinc-500">{date}</time></div>
    <p className={`truncate text-sm mt-0.5 ${!email.isRead?'font-semibold':''}`}>{email.subject}</p>
    <p className="truncate text-xs text-zinc-500 mt-1">{email.snippet}</p>
   </button>
 </div>;
};
