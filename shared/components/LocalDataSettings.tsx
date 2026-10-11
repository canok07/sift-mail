import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { safeFetchJson } from '../services/apiClient';

export function LocalDataSettings({prepare,complete}:{prepare?:()=>Promise<void>;complete?:()=>void}) {
  const {t}=useTranslation();
  const [password,setPassword]=useState(''),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
  const transfer=async(restore:boolean)=>{
    if(busy||!prepare||!complete)return;
    if(password.length<12){setStatus(t('localData.passwordHint'));return;}
    if(restore&&(!file||!window.confirm(t('localData.confirm'))))return;
    setBusy(true);setStatus('');let restoring=false;
    try{
      if(file&&file.size>55*1024*1024)throw new Error('oversize');
      await prepare();
      if(restore){
        const archive=await file!.text();
        await safeFetchJson('/api/local/mail-store/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,archive,confirmReplace:true})});
        restoring=true;window.location.reload();
      }else{
        const result=await safeFetchJson<{archive:string}>('/api/local/mail-store/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
        const url=URL.createObjectURL(new Blob([result.archive],{type:'application/json'}));
        const link=document.createElement('a');link.href=url;link.download=`Sift-Mail-backup-${new Date().toISOString().slice(0,10)}.siftbackup`;
        document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
        setStatus(t('localData.exported'));
      }
    }catch{setStatus(t('localData.failed'));}
    finally{setPassword('');if(!restoring)complete();setBusy(false);}
  };
  return <section data-testid="local-data-settings" className="rounded-2xl bg-zinc-500/[.08] p-6 space-y-5">
    <h2 className="font-bold">{t('localData.title')}</h2><p className="text-sm opacity-70">{t('localData.description')}</p>
    <label className="block text-sm">{t('localData.password')}<input type="password" autoComplete="new-password" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)} className="block w-full mt-2"/></label>
    <p className="text-xs opacity-70">{t('localData.passwordHint')}</p>
    <button className="btn-primary" disabled={busy||!prepare||password.length<12} onClick={()=>void transfer(false)}>{t('localData.export')}</button>
    <label className="block text-sm">{t('localData.file')}<input type="file" accept=".siftbackup,application/json" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)} className="block mt-2"/></label>
    <p className="text-sm opacity-70">{t('localData.restoreHint')}</p>
    <button className="btn" disabled={busy||!prepare||!file||password.length<12} onClick={()=>void transfer(true)}>{t('localData.restore')}</button>
    <p role="status" className="text-sm">{busy?t('localData.busy'):status}</p>
  </section>;
}
