import React from 'react';
import { useTranslation } from 'react-i18next';
import { AppTheme } from '../stores/useSettingsStore';

interface SafeEmailBodyProps { htmlContent?: string; plainText?: string; theme?: AppTheme; isOled?: boolean; }

export const SafeEmailBody: React.FC<SafeEmailBodyProps> = ({ htmlContent, plainText, theme = 'dark', isOled }) => {
  const { t } = useTranslation();
  const resolvedTheme = isOled ? 'oled' : theme;
  const dark = resolvedTheme !== 'light';
  const palettes: Record<AppTheme, { background:string; foreground:string; link:string; border:string }> = {
    light: { background:'#ffffff', foreground:'#172033', link:'#087f5b', border:'#d8e0e8' },
    dark: { background:'#171a21', foreground:'#f1f3f5', link:'#34d399', border:'#2d3440' },
    oled: { background:'#090b0f', foreground:'#f4f4f5', link:'#a78bfa', border:'#242a35' },
    ocean: { background:'#0d202b', foreground:'#edf9ff', link:'#38bdf8', border:'#244857' },
    forest: { background:'#122219', foreground:'#eff8f1', link:'#34d399', border:'#2b4b37' },
  };
  const { background, foreground, link, border } = palettes[resolvedTheme];
  const policy = "default-src 'none'; script-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
  const document = `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="${dark ? 'dark' : 'light'}"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>:root{color-scheme:${dark ? 'dark' : 'light'}}html,body{background:${background}!important;color:${foreground}!important}body{margin:18px;font:14px/1.65 system-ui,-apple-system,sans-serif;overflow-wrap:anywhere}a{color:${link}!important}img{max-width:100%;height:auto}table{max-width:100%!important;background:transparent!important}pre{white-space:pre-wrap}*{max-width:100%;border-color:${border}!important}</style></head><body>${htmlContent || ''}</body></html>`;
  return <div>{htmlContent ? <><p className="text-[11px] opacity-60 mb-2">{t('detail.remoteImagesBlocked')}</p><iframe title={t('detail.emailContent')} sandbox="" referrerPolicy="no-referrer" srcDoc={document} style={{background,borderColor:border}} className="w-full h-[440px] rounded-xl border" /></> : <div style={{background, color: foreground, borderColor:border}} className="whitespace-pre-wrap break-words text-sm leading-relaxed p-4 rounded-xl border">{plainText || t('detail.noTextContent')}</div>}</div>;
};
