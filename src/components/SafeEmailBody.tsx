import React from 'react';
interface SafeEmailBodyProps {htmlContent?: string; plainText?: string; isOled?: boolean;}
export const SafeEmailBody: React.FC<SafeEmailBodyProps> = ({htmlContent,plainText}) => {
 const policy="default-src 'none'; script-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
 const document='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+policy+'"><style>body{margin:16px;font:14px/1.6 system-ui;color:#222;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style></head><body>'+htmlContent+'</body></html>';
 return <div>
  {htmlContent ? <><p className="text-[11px] text-zinc-500 mb-2">Gizlilik için dış görseller engellendi.</p><iframe title="E-posta içeriği" sandbox="" referrerPolicy="no-referrer" srcDoc={document} className="w-full h-[440px] rounded-lg border-0 bg-white"/></> : <div className="whitespace-pre-wrap break-words text-sm leading-relaxed py-3">{plainText || 'Bu iletinin metin içeriği yok.'}</div>}
 </div>;
};
