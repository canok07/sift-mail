import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bold, FileUp, Italic, Link, MailPlus, Maximize2, Minimize2, Paperclip, Send, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConnectedAccount, EmailMessage } from '../types';
import { DynamicSyncCredentials, ensureFreshMicrosoftCredentials } from '../services/mailSyncService';
import { detectMailProvider } from '../../core/mail/providerManager';
import { safeFetchJson } from '../services/apiClient';
import { composeHtmlToText, safeComposeLink, sanitizeComposeHtml, textToComposeHtml } from '../services/composeFormatting';
import type { ComposeDraft } from '../services/localMailStore';
import { AppTheme } from '../stores/useSettingsStore';

type Attachment = ComposeDraft['attachments'][number];
interface Props {
  isOpen: boolean; onClose: () => void; draft?: ComposeDraft | null;
  onDraftChange?: (draft: ComposeDraft | null) => void;
  accounts: ConnectedAccount[]; contacts: string[]; credentials: Record<string, DynamicSyncCredentials>;
  onCredentialsUpdated?: (accountId: string, credentials: DynamicSyncCredentials) => void;
  theme: AppTheme; availableEmails?: EmailMessage[]; initialForward?: EmailMessage | null;
  onSent: (data: { to: string; subject: string; body: string; bodyHtml: string; accountId: string }) => void;
}
const MAX_TOTAL = 25 * 1024 * 1024;
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

export const ComposeModal: React.FC<Props> = ({ isOpen, onClose, draft, onDraftChange, accounts, contacts, credentials, onCredentialsUpdated, availableEmails = [], initialForward, onSent }) => {
  const { t } = useTranslation();
  const [accountId, setAccountId] = useState('');
  const [to, setTo] = useState(''), [cc, setCc] = useState(''), [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(''), [body, setBody] = useState(''), [bodyHtml, setBodyHtml] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showCc, setShowCc] = useState(false), [showMailPicker, setShowMailPicker] = useState(false);
  const [expanded, setExpanded] = useState(false), [minimized, setMinimized] = useState(false);
  const [busy, setBusy] = useState(false), [attaching, setAttaching] = useState(false), [error, setError] = useState('');
  const [showLink, setShowLink] = useState(false), [linkUrl, setLinkUrl] = useState('');
  const fileInput = useRef<HTMLInputElement>(null), bodyRef = useRef<HTMLDivElement>(null);
  const selectedRange = useRef<Range | null>(null), wasOpen = useRef(false), skipDraftWrite = useRef(false);
  const attachmentGeneration = useRef(0);
  const totalSize = useMemo(() => attachments.reduce((sum, item) => sum + item.size, 0), [attachments]);

  useEffect(() => { if (!isOpen) return; const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [isOpen, onClose]);
  useEffect(() => {
    if (!isOpen) { wasOpen.current = false; setMinimized(false); attachmentGeneration.current++; return; }
    if (wasOpen.current) return;
    wasOpen.current = true; skipDraftWrite.current = true; selectedRange.current = null; setError(''); setAttaching(false);
    setAccountId(draft?.accountId || accounts[0]?.id || '');
    setTo(draft?.to || ''); setCc(draft?.cc || ''); setBcc(draft?.bcc || ''); setShowCc(Boolean(draft?.cc || draft?.bcc));
    setSubject(draft?.subject || ''); setBody(draft?.body || '');
    setBodyHtml(sanitizeComposeHtml(draft?.bodyHtml || textToComposeHtml(draft?.body || '')));
    setAttachments(draft?.attachments || []);
    if (initialForward) {
      const forwarded = `\n\n---------- ${t('ui.compose.forwardedMessage')} ----------\n${t('compose.from')}: ${initialForward.from}\n${t('ui.compose.date')}: ${initialForward.date}\n${t('compose.subject')}: ${initialForward.subject}\n\n${initialForward.bodyText || initialForward.snippet}`;
      setSubject(initialForward.subject.startsWith('Fwd:') ? initialForward.subject : `Fwd: ${initialForward.subject}`);
      setBody(forwarded); setBodyHtml(textToComposeHtml(forwarded));
    }
  }, [isOpen, draft, accounts, initialForward, t]);
  useEffect(() => {
    const editor = bodyRef.current;
    if (editor && document.activeElement !== editor && editor.innerHTML !== bodyHtml) editor.innerHTML = bodyHtml;
  }, [isOpen, minimized, bodyHtml]);
  useEffect(() => {
    if (!isOpen || !onDraftChange) return;
    if (skipDraftWrite.current) { skipDraftWrite.current = false; return; }
    onDraftChange(to || cc || bcc || subject || body || attachments.length ? { accountId, to, cc, bcc, subject, body, bodyHtml, attachments } : null);
  }, [isOpen, accountId, to, cc, bcc, subject, body, bodyHtml, attachments, onDraftChange]);

  const rememberSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && bodyRef.current?.contains(selection.getRangeAt(0).commonAncestorContainer)) selectedRange.current = selection.getRangeAt(0).cloneRange();
  };
  const editorChanged = () => {
    if (!bodyRef.current) return;
    const html = sanitizeComposeHtml(bodyRef.current.innerHTML);
    setBodyHtml(html); setBody(composeHtmlToText(html)); rememberSelection();
  };
  const rangeInEditor = () => {
    const editor = bodyRef.current; if (!editor) return null;
    editor.focus();
    let range = selectedRange.current;
    if (!range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) { range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); }
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    return range;
  };
  const format = (tag: 'strong' | 'em' | 'a', href?: string) => {
    const range = rangeInEditor(); if (!range) return;
    const element = document.createElement(tag);
    if (href) { element.setAttribute('href', href); element.setAttribute('rel', 'noopener noreferrer'); }
    if (range.collapsed) element.textContent = href || '\u200b';
    else element.appendChild(range.extractContents());
    range.insertNode(element); range.selectNodeContents(element);
    if (!href && element.textContent === '\u200b') range.collapse(false);
    selectedRange.current = range.cloneRange();
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    editorChanged();
  };
  const pasteText = (text: string) => {
    rememberSelection(); const range = rangeInEditor(); if (!range) return;
    range.deleteContents(); const fragment = range.createContextualFragment(textToComposeHtml(text));
    const last = fragment.lastChild; range.insertNode(fragment);
    if (last) range.setStartAfter(last); range.collapse(true); selectedRange.current = range.cloneRange();
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); editorChanged();
  };
  const addFiles = async (files: FileList | null) => {
    if (!files || busy || attaching) return;
    const generation = attachmentGeneration.current; setAttaching(true); setError('');
    try {
      if (attachments.length + files.length > 20) throw new Error(t('ui.compose.tooManyAttachments'));
      if (totalSize + Array.from(files).reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL) throw new Error(t('ui.compose.attachmentsTooLarge', { max: 25 }));
      const next: Attachment[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) throw new Error(t('ui.compose.fileTooLarge', { filename: file.name, max: 20 }));
        next.push({ filename: file.name, content: bytesToBase64(new Uint8Array(await file.arrayBuffer())), encoding: 'base64', contentType: file.type || 'application/octet-stream', size: file.size, source: 'file' });
      }
      if (generation === attachmentGeneration.current) setAttachments(prev => [...prev, ...next]);
    } catch (e: any) { if (generation === attachmentGeneration.current) setError(e.message); }
    finally { if (generation === attachmentGeneration.current) setAttaching(false); if (fileInput.current) fileInput.current.value = ''; }
  };
  const attachEmail = async (email: EmailMessage) => {
    if (busy || attaching) return;
    const generation = attachmentGeneration.current; setAttaching(true); setError('');
    try {
      if (attachments.length >= 20) throw new Error(t('ui.compose.tooManyAttachments'));
      if (totalSize >= MAX_TOTAL) throw new Error(t('ui.compose.attachmentsTooLarge', { max: 25 }));
      const account = accounts.find(a => a.id === email.accountId), cred = credentials[email.accountId || ''];
      if (!account || !email.uid || !email.folder) throw new Error(t('ui.compose.originalUnavailable'));
      if (!cred?.password && !cred?.accessToken) throw new Error(t('compose.loginRequired'));
      const activeCred = await ensureFreshMicrosoftCredentials(cred);
      if (activeCred !== cred) onCredentialsUpdated?.(account.id, activeCred);
      const provider = detectMailProvider(account.email);
      const expectedUidValidity = email.uidValidity || (email.id.startsWith('imap-') ? email.id.match(/-(\d+)-\d+$/)?.[1] : undefined);
      const result = await safeFetchJson<{ success: boolean; filename: string; contentType: string; content: string; size: number }>('/api/imap/raw-message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          host: account.imapConfig?.host || activeCred.host || provider.imapHost, port: account.imapConfig?.port || activeCred.port || provider.imapPort,
          secure: account.imapConfig?.secure ?? activeCred.secure ?? true,
          auth: { user: account.email, ...(activeCred.accessToken ? { accessToken: activeCred.accessToken } : { pass: activeCred.password }) },
          folder: email.folder, uid: email.uid, expectedUidValidity, messageId: email.messageId, maxBytes: MAX_TOTAL - totalSize,
        }),
      });
      if (!result.success || !result.content || !Number.isInteger(result.size) || result.size < 1 || totalSize + result.size > MAX_TOTAL) throw new Error(t('ui.compose.originalUnavailable'));
      if (generation === attachmentGeneration.current) {
        setAttachments(prev => [...prev, { filename: result.filename, content: result.content, encoding: 'base64', contentType: 'message/rfc822', size: result.size, source: 'email' }]); setShowMailPicker(false);
      }
    } catch (e: any) { if (generation === attachmentGeneration.current) setError(e.message || t('ui.compose.originalUnavailable')); }
    finally { if (generation === attachmentGeneration.current) setAttaching(false); }
  };
  const reset = () => { setTo(''); setCc(''); setBcc(''); setSubject(''); setBody(''); setBodyHtml(''); setAttachments([]); setError(''); setShowCc(false); setShowMailPicker(false); setShowLink(false); selectedRange.current = null; };
  const send = async () => {
    if (busy || attaching) return;
    const account = accounts.find(a => a.id === accountId), cred = credentials[accountId];
    if (!account || (!cred?.password && !cred?.accessToken)) { setError(t('compose.loginRequired')); return; }
    const html = sanitizeComposeHtml(bodyRef.current?.innerHTML ?? bodyHtml), text = composeHtmlToText(html);
    if (!to.trim() || !subject.trim() || !text.trim()) { setError(t('compose.required')); return; }
    if (totalSize > MAX_TOTAL) { setError(t('ui.compose.attachmentsTooLarge', { max: 25 })); return; }
    setBusy(true); setError('');
    try {
      const activeCred = await ensureFreshMicrosoftCredentials(cred);
      if (activeCred !== cred) onCredentialsUpdated?.(accountId, activeCred);
      const provider = detectMailProvider(account.email);
      const port = account.imapConfig?.smtpPort || activeCred.smtpPort || provider.smtpPort;
      const result = await safeFetchJson<{ success: boolean; error?: string }>('/api/smtp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: {
          host: account.imapConfig?.smtpHost || activeCred.smtpHost || provider.smtpHost, port,
          secure: account.imapConfig?.smtpSecure ?? activeCred.smtpSecure ?? port === 465,
          auth: { user: account.email, ...(activeCred.accessToken ? { accessToken: activeCred.accessToken } : { pass: activeCred.password }) },
        }, mail: { to, cc: cc || undefined, bcc: bcc || undefined, subject, text, html, attachments: attachments.map(({ size, source, ...item }) => item) } }),
      });
      if (!result.success) throw new Error(result.error || t('compose.error'));
      onSent({ to, subject, body: text, bodyHtml: html, accountId }); onDraftChange?.(null); reset(); onClose();
    } catch (e: any) { setError(e.message || t('compose.error')); }
    finally { setBusy(false); }
  };
  if (!isOpen) return null;
  if (minimized) return <div data-testid="compose-minimized" className="fixed bottom-4 right-4 z-50 w-72 max-w-[calc(100vw-2rem)] theme-panel border theme-border rounded-xl shadow-2xl flex items-center gap-2 p-3"><button onClick={() => setMinimized(false)} className="flex-1 min-w-0 text-left text-sm font-semibold truncate" aria-label={t('ui.compose.restore')}>{subject || t('compose.title')}</button><button onClick={() => setMinimized(false)} aria-label={t('ui.compose.restore')} className="p-1.5 theme-hover rounded"><Maximize2 size={15}/></button><button onClick={onClose} aria-label={t('actions.close')} className="p-1.5 theme-hover rounded"><X size={16}/></button></div>;
  return <div className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center sm:justify-end p-0 sm:p-5" data-testid="compose-modal"><div className={`${expanded ? 'w-full h-full' : 'w-full sm:w-[650px] sm:h-[76vh]'} theme-panel border theme-border flex flex-col shadow-2xl sm:rounded-2xl overflow-hidden`}>
    <header className="theme-elevated flex items-center justify-between px-4 py-3 border-b theme-border"><h2 className="text-sm font-semibold">{t('compose.title')}</h2><div className="flex gap-1"><button aria-label={t('compose.minimize')} onClick={() => setMinimized(true)} className="p-1.5 theme-hover rounded"><Minimize2 size={15}/></button><button aria-label={t('compose.expand')} onClick={() => setExpanded(!expanded)} className="p-1.5 theme-hover rounded"><Maximize2 size={15}/></button><button aria-label={t('actions.close')} onClick={onClose} className="p-1.5 theme-hover rounded"><X size={16}/></button></div></header>
    <fieldset disabled={busy} className="px-4 border-b border-zinc-500/20"><label className="flex items-center gap-3 py-2 text-sm"><span className="w-16 opacity-55">{t('compose.from')}</span><select aria-label={t('compose.from')} value={accountId} onChange={e => setAccountId(e.target.value)} className="flex-1 bg-transparent border-0 py-1">{accounts.map(a => <option key={a.id} value={a.id}>{a.displayName} &lt;{a.email}&gt;</option>)}</select></label>
      <div className="flex items-center gap-3 py-2 border-t border-zinc-500/15"><span className="w-16 text-sm opacity-55">{t('compose.to')}</span><input aria-label={t('compose.to')} autoFocus list="sift-contacts" value={to} onChange={e => setTo(e.target.value)} placeholder="ad@example.com" className="flex-1 bg-transparent border-0 p-0"/><button onClick={() => setShowCc(!showCc)} className="text-xs opacity-65 hover:opacity-100">Cc / Bcc</button></div><datalist id="sift-contacts">{contacts.map(x => <option key={x} value={x}/>)}</datalist>
      {showCc && <><label className="flex items-center gap-3 py-2 border-t border-zinc-500/15"><span className="w-16 text-sm opacity-55">Cc</span><input value={cc} onChange={e => setCc(e.target.value)} className="flex-1 bg-transparent border-0 p-0"/></label><label className="flex items-center gap-3 py-2 border-t border-zinc-500/15"><span className="w-16 text-sm opacity-55">Bcc</span><input value={bcc} onChange={e => setBcc(e.target.value)} className="flex-1 bg-transparent border-0 p-0"/></label></>}
      <input aria-label={t('compose.subject')} value={subject} onChange={e => setSubject(e.target.value)} placeholder={t('compose.subject')} className="w-full bg-transparent border-0 border-t border-zinc-500/15 px-0 py-3"/>
    </fieldset>
    <div ref={bodyRef} role="textbox" aria-label={t('compose.body')} aria-multiline="true" contentEditable={!busy} suppressContentEditableWarning onInput={editorChanged} onMouseUp={rememberSelection} onKeyUp={rememberSelection}
      onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && ['b', 'i'].includes(e.key.toLowerCase())) { e.preventDefault(); rememberSelection(); format(e.key.toLowerCase() === 'b' ? 'strong' : 'em'); } }}
      onPaste={e => { e.preventDefault(); pasteText(e.clipboardData.getData('text/plain')); }} onDrop={e => e.preventDefault()}
      className="flex-1 overflow-y-auto whitespace-pre-wrap bg-transparent border-0 p-4 leading-relaxed min-h-48 outline-none"/>
    {showLink && <div className="px-4 py-2 flex gap-2"><input aria-label={t('ui.compose.linkUrl')} value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://example.com" className="flex-1"/><button className="btn" onClick={() => { const href = safeComposeLink(linkUrl); if (!href) { setError(t('ui.compose.invalidLink')); return; } format('a', href); setShowLink(false); setLinkUrl(''); setError(''); }}>{t('ui.compose.insertLink')}</button></div>}
    {attachments.length > 0 && <div className="px-4 py-2 flex flex-wrap gap-2 border-t border-zinc-500/15">{attachments.map((item, index) => <span key={`${item.filename}-${index}`} className="inline-flex items-center gap-2 rounded-full bg-zinc-500/10 px-3 py-1.5 text-xs"><Paperclip size={13}/>{item.filename}<span className="opacity-50">{(item.size / 1024).toFixed(0)} KB</span><button disabled={busy || attaching} onClick={() => setAttachments(v => v.filter((_, i) => i !== index))}><X size={13}/></button></span>)}</div>}
    {showMailPicker && <div className="mx-4 mb-2 max-h-36 overflow-y-auto rounded-xl border theme-border p-2"><p className="text-xs opacity-55 px-2 py-1">{t('compose.pickEmail')}</p>{availableEmails.slice(0, 50).map(email => <button key={email.id} disabled={busy || attaching} onClick={() => void attachEmail(email)} className="w-full text-left px-2 py-2 rounded-lg theme-hover"><span className="block text-xs font-semibold truncate">{email.subject}</span><span className="block text-[11px] opacity-50 truncate">{email.from}</span></button>)}</div>}
    {error && <p role="alert" className="px-4 pb-2 text-sm text-rose-500">{error}</p>}
    <footer className="theme-elevated flex items-center gap-1 px-4 py-3 border-t theme-border"><button disabled={busy || attaching} onClick={() => void send()} className="btn-primary flex items-center gap-2 px-5"><Send size={16}/>{busy ? t('compose.sending') : t('compose.send')}</button><input ref={fileInput} type="file" multiple className="hidden" onChange={e => void addFiles(e.target.files)}/><button disabled={busy || attaching} title={t('compose.attachFile')} onClick={() => fileInput.current?.click()} className="p-2.5 rounded-lg theme-hover"><FileUp size={18}/></button><button disabled={busy || attaching} title={t('compose.attachEmail')} onClick={() => setShowMailPicker(!showMailPicker)} className="p-2.5 rounded-lg theme-hover"><MailPlus size={17}/></button><button disabled={busy} title={t('compose.bold')} onMouseDown={e => e.preventDefault()} onClick={() => format('strong')} className="p-2.5 rounded-lg theme-hover"><Bold size={17}/></button><button disabled={busy} title={t('compose.italic')} onMouseDown={e => e.preventDefault()} onClick={() => format('em')} className="p-2.5 rounded-lg theme-hover"><Italic size={17}/></button><button disabled={busy} title={t('compose.link')} onMouseDown={e => e.preventDefault()} onClick={() => { rememberSelection(); setShowLink(!showLink); }} className="p-2.5 rounded-lg theme-hover"><Link size={17}/></button><span className="flex-1"/><button disabled={busy || attaching} title={t('compose.discard')} onClick={() => { onDraftChange?.(null); reset(); }} className="p-2.5 rounded-lg hover:bg-rose-500/10 text-rose-500"><Trash2 size={17}/></button></footer>
  </div></div>;
};
