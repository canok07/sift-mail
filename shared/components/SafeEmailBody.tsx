import React from 'react';
import { AppTheme } from '../stores/useSettingsStore';

interface SafeEmailBodyProps { htmlContent?: string; plainText?: string; theme?: AppTheme; isOled?: boolean; }

export const SafeEmailBody: React.FC<SafeEmailBodyProps> = ({ htmlContent, plainText, theme = 'dark', isOled }) => {
  const resolvedTheme = isOled ? 'oled' : theme;
  const dark = resolvedTheme !== 'light';
  const background = resolvedTheme === 'oled' ? '#090909' : dark ? '#111827' : '#f4f1eb';
  const foreground = dark ? '#e5e7eb' : '#292524';
  const link = dark ? '#34d399' : '#047857';
  const policy = "default-src 'none'; script-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
  const document = `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="${dark ? 'dark' : 'light'}"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>:root{color-scheme:${dark ? 'dark' : 'light'}}html,body{background:${background}!important;color:${foreground}!important}body{margin:18px;font:14px/1.65 system-ui,-apple-system,sans-serif;overflow-wrap:anywhere}a{color:${link}!important}img{max-width:100%;height:auto}table{max-width:100%!important;background:transparent!important}pre{white-space:pre-wrap}*{max-width:100%;border-color:${dark ? '#374151' : '#d6d3d1'}!important}</style></head><body>${htmlContent || ''}</body></html>`;
  return <div>{htmlContent ? <><p className="text-[11px] opacity-60 mb-2">Dış görseller ve izleme pikselleri gizlilik için engellendi.</p><iframe title="E-posta içeriği" sandbox="" referrerPolicy="no-referrer" srcDoc={document} style={{background}} className="w-full h-[440px] rounded-xl border border-black/10 dark:border-white/10" /></> : <div style={{background, color: foreground}} className="whitespace-pre-wrap break-words text-sm leading-relaxed p-4 rounded-xl">{plainText || 'Bu iletinin metin içeriği yok.'}</div>}</div>;
};
