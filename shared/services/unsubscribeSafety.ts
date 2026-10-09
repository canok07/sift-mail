/** Parse actual header targets, never extract a URL from arbitrary script/text. */
export function safeUnsubscribeTarget(value?: string): string | null {
  if (!value || value.length > 4000) return null;
  const text = value.trim();
  const bracketed = [...text.matchAll(/<([^<>]+)>/g)].map(match => match[1].trim());
  const candidates = bracketed.length && /^<[^<>]+>(?:\s*,\s*<[^<>]+>)*$/.test(text)
    ? bracketed : [text];
  const valid: URL[] = [];
  for (const candidate of candidates) {
    if (/\s|[<>]|%0[ad]|%00/i.test(candidate)) continue;
    try {
      const url = new URL(candidate);
      if (url.username || url.password) continue;
      if (['https:', 'http:'].includes(url.protocol) && url.hostname) valid.push(url);
      else if (url.protocol === 'mailto:') {
        const recipients = decodeURIComponent(url.pathname).split(',');
        if (recipients.length && recipients.every(address => /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address))) valid.push(url);
      }
    } catch { /* Invalid targets are unavailable, not executable fallbacks. */ }
  }
  return (valid.find(url => url.protocol === 'https:') || valid.find(url => url.protocol === 'http:') || valid[0])?.href || null;
}
