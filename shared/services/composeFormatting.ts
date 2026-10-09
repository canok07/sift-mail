const allowed = new Set(['STRONG', 'EM', 'U', 'S', 'A', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'BLOCKQUOTE']);
const blocked = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'IMG', 'VIDEO', 'AUDIO', 'FORM', 'INPUT', 'TEMPLATE']);
export function safeComposeLink(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

/** A small formatting allowlist; pasted styles, handlers and remote images never survive. */
export function sanitizeComposeHtml(value: string): string {
  const template = document.createElement('template'); template.innerHTML = value;
  const root = document.createElement('div');
  const copy = (source: Node, destination: Node) => {
    if (source.nodeType === 3) { destination.appendChild(document.createTextNode(source.textContent || '')); return; }
    if (source.nodeType !== 1) return;
    const element = source as HTMLElement;
    if (blocked.has(element.tagName)) return;
    const tag = element.tagName === 'B' ? 'STRONG' : element.tagName === 'I' ? 'EM' : element.tagName;
    const href = tag === 'A' ? safeComposeLink(element.getAttribute('href') || '') : null;
    const target = allowed.has(tag) && (tag !== 'A' || href) ? document.createElement(tag.toLowerCase()) : destination;
    if (href && target instanceof HTMLElement) { target.setAttribute('href', href); target.setAttribute('rel', 'noopener noreferrer'); }
    Array.from(source.childNodes).forEach(child => copy(child, target));
    if (target !== destination) destination.appendChild(target);
  };
  Array.from(template.content.childNodes).forEach(node => copy(node, root));
  return root.innerHTML;
}

export function textToComposeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
}

export function composeHtmlToText(html: string): string {
  const template = document.createElement('template'); template.innerHTML = sanitizeComposeHtml(html);
  const blocks = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'UL', 'OL']);
  let result = '';
  const visit = (node: Node) => {
    if (node.nodeType === 3) { result += node.textContent || ''; return; }
    const tag = (node as HTMLElement).tagName;
    if (tag === 'BR') { result += '\n'; return; }
    const block = blocks.has(tag);
    if (block && result && !result.endsWith('\n')) result += '\n';
    Array.from(node.childNodes).forEach(visit);
    if (block && !result.endsWith('\n')) result += '\n';
  };
  Array.from(template.content.childNodes).forEach(visit);
  return result.replace(/\u200b/g, '').replace(/\n$/, '');
}
