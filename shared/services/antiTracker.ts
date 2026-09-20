/**
 * Anti-Tracker & Spy Pixel Filter for Email HTML Rendering
 * Detects and intercepts external 1x1 tracking beacons / spy pixels,
 * preventing email senders from tracking IP address, read timestamps, and location.
 */

export interface BlockedTracker {
  id: string;
  originalSrc: string;
  domain: string;
  reason: '1x1_dimensions' | 'inline_hidden_style' | 'known_tracker_signature';
  elementTag: string;
}

export interface AntiTrackerResult {
  sanitizedHtml: string;
  blockedTrackers: BlockedTracker[];
  totalTrackersBlocked: number;
  isShieldActive: boolean;
}

// Known email open-tracker domains and path signatures
const TRACKER_SIGNATURES = [
  /wf\/open\?/i,
  /\/track\/open/i,
  /\/email\/open/i,
  /open\.aspx/i,
  /pixel\.gif/i,
  /spacer\.gif\?/i,
  /beacon/i,
  /mailtrack\.io/i,
  /sendgrid\.net\/wf\/open/i,
  /mandrillapp\.com\/track/i,
  /list-manage\.com\/track\/open/i,
  /hubspotemail\.net/i,
  /click\.pstmrk\.it\/open/i,
  /trk\.klaviyo\.com/i,
  /t\.signaux\.io/i,
  /open\.mailmunch\.co/i,
  /email-tracker/i,
  /campaign-archive\.com\/open/i,
];

/**
 * Filter an email HTML string to eliminate tracking beacons.
 */
export function filterEmailTrackingPixels(htmlContent: string): AntiTrackerResult {
  if (!htmlContent || typeof window === 'undefined') {
    return {
      sanitizedHtml: htmlContent || '',
      blockedTrackers: [],
      totalTrackersBlocked: 0,
      isShieldActive: true,
    };
  }

  const blockedTrackers: BlockedTracker[] = [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // 1. Inspect all <img> tags
    const images = Array.from(doc.querySelectorAll('img'));
    images.forEach((img, index) => {
      const src = img.getAttribute('src') || '';
      const widthAttr = img.getAttribute('width');
      const heightAttr = img.getAttribute('height');
      const styleAttr = (img.getAttribute('style') || '').toLowerCase();

      let isTracker = false;
      let reason: BlockedTracker['reason'] = '1x1_dimensions';

      // Check 1: 1x1 or 0x0 HTML dimensions
      const is1x1Dimensions =
        (widthAttr === '1' && heightAttr === '1') ||
        (widthAttr === '0' && heightAttr === '0') ||
        (widthAttr === '1' && !heightAttr && styleAttr.includes('1px')) ||
        (heightAttr === '1' && !widthAttr && styleAttr.includes('1px'));

      // Check 2: CSS hidden / 1px styles
      const isHiddenViaStyle =
        (styleAttr.includes('width:1px') || styleAttr.includes('width: 1px')) &&
        (styleAttr.includes('height:1px') || styleAttr.includes('height: 1px')) ||
        styleAttr.includes('opacity:0') ||
        styleAttr.includes('opacity: 0') ||
        (styleAttr.includes('display:none') && src.length > 0);

      // Check 3: Known signature match
      const matchesSignature = TRACKER_SIGNATURES.some((regex) => regex.test(src));

      if (is1x1Dimensions) {
        isTracker = true;
        reason = '1x1_dimensions';
      } else if (isHiddenViaStyle) {
        isTracker = true;
        reason = 'inline_hidden_style';
      } else if (matchesSignature) {
        isTracker = true;
        reason = 'known_tracker_signature';
      }

      if (isTracker && src && !src.startsWith('data:image/gif;base64,R0lGODlhAQABAAD/')) {
        let domain = 'unknown';
        try {
          domain = new URL(src).hostname;
        } catch {
          domain = src.slice(0, 30);
        }

        blockedTrackers.push({
          id: `tracker-${index}-${Date.now()}`,
          originalSrc: src,
          domain,
          reason,
          elementTag: 'img',
        });

        // Neutralize the tracker: Replace with a safe transparent 1x1 placeholder
        img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=');
        img.setAttribute('data-blocked-tracker', 'true');
        img.setAttribute('data-original-src', src);
        img.style.display = 'none';
      }
    });

    // 2. Inspect external CSS background-images in styles for tracking pixels
    const allStyledElements = Array.from(doc.querySelectorAll('[style*="url("]'));
    allStyledElements.forEach((el, index) => {
      const style = el.getAttribute('style') || '';
      const urlMatch = style.match(/url\(['"]?([^'"()]+)['"]?\)/i);
      if (urlMatch && urlMatch[1]) {
        const bgUrl = urlMatch[1];
        if (TRACKER_SIGNATURES.some((regex) => regex.test(bgUrl))) {
          let domain = 'unknown';
          try {
            domain = new URL(bgUrl).hostname;
          } catch {
            domain = bgUrl.slice(0, 30);
          }

          blockedTrackers.push({
            id: `bg-tracker-${index}-${Date.now()}`,
            originalSrc: bgUrl,
            domain,
            reason: 'known_tracker_signature',
            elementTag: el.tagName.toLowerCase(),
          });

          // Strip tracking background
          el.setAttribute('style', style.replace(/url\(['"]?[^'"()]+['"]?\)/i, 'none'));
        }
      }
    });

    return {
      sanitizedHtml: doc.body.innerHTML,
      blockedTrackers,
      totalTrackersBlocked: blockedTrackers.length,
      isShieldActive: true,
    };
  } catch (err) {
    console.error('Anti-Tracker filter execution failed:', err);
    return {
      sanitizedHtml: htmlContent,
      blockedTrackers: [],
      totalTrackersBlocked: 0,
      isShieldActive: false,
    };
  }
}
