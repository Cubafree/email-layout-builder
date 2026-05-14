'use strict';

function normalizeEscapedString(value) {
  let s = String(value ?? '');
  for (let i = 0; i < 5; i++) {
    const before = s;
    s = s
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"');
    if (s === before) break;
  }
  return s;
}

function compactHtml(value) {
  return String(value ?? '')
    .replace(/\\r\\n/g, ' ')
    .replace(/\\n/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function replaceOrThrow(html, regex, replacement, label) {
  const next = html.replace(regex, replacement);
  if (next === html) throw new Error(`Replacement failed: ${label}`);
  return next;
}

function replaceAttribute(tag, attrName, newValue) {
  const escapedValue = escapeHtml(newValue);
  const attrRegex = new RegExp(
    `\\b${attrName}\\s*=\\s*(?:""[^"]*""|"[^"]*"|'[^']*')`,
    'i'
  );
  if (attrRegex.test(tag)) {
    return tag.replace(attrRegex, `${attrName}="${escapedValue}"`);
  }
  return tag.replace(/^<\w+\b/i, (opening) => `${opening} ${attrName}="${escapedValue}"`);
}

function replaceCtaAnchor(html, ctaUrl, ctaText) {
  const idPattern = /id=""?ilc14""?/;
  const ctaIndex = html.search(idPattern);
  if (ctaIndex === -1) throw new Error('CTA anchor id="ilc14" not found');

  const start = html.lastIndexOf('<a', ctaIndex);
  const end = html.indexOf('</a>', ctaIndex);
  if (start === -1 || end === -1) throw new Error('CTA anchor boundaries not found');

  const before = html.slice(0, start);
  const anchor = html.slice(start, end + '</a>'.length);
  const after = html.slice(end + '</a>'.length);

  const openingMatch = anchor.match(/<a\b[^>]*>/i);
  if (!openingMatch) throw new Error('CTA opening tag not found');

  let openingTag = openingMatch[0];
  openingTag = replaceAttribute(openingTag, 'href', ctaUrl);

  return before + `${openingTag}${escapeHtml(ctaText)}</a>` + after;
}

function buildHtml(source, parsed) {
  const { template, image_URL: imageUrl, CTA_URL: ctaUrl } = source;

  if (!template) throw new Error('Missing template');
  if (!imageUrl) throw new Error('Missing image URL');
  if (!ctaUrl) throw new Error('Missing CTA URL');

  const subjectRaw = parsed.subject;
  const preheaderRaw = parsed.preheader;
  const ctaRaw = parsed.cta;

  if (!subjectRaw) throw new Error('Missing parsed subject');
  if (!preheaderRaw) throw new Error('Missing parsed preheader');
  if (!ctaRaw) throw new Error('Missing parsed CTA');

  const subject = escapeHtml(subjectRaw);
  const preheader = escapeHtml(preheaderRaw);

  const bodyParagraphs = Array.isArray(parsed.body_paragraphs)
    ? parsed.body_paragraphs
        .map((p) => normalizeEscapedString(String(p)).trim())
        .filter(Boolean)
    : [];

  if (!bodyParagraphs.length) throw new Error('Missing parsed body paragraphs');

  const bodyRows = bodyParagraphs
    .map((paragraph, index) => {
      const isLast = index === bodyParagraphs.length - 1 && bodyParagraphs.length > 1;
      const fontWeight = isLast ? 700 : 500;
      const fontSize = isLast ? 16 : 17;
      return `<tr style="box-sizing: border-box;"><td align="center" style="box-sizing: border-box; font-family: 'Outfit', Arial, Helvetica, sans-serif; text-align: center; padding-top: 17px; font-weight: ${fontWeight}; font-size: ${fontSize}px; line-height: 28px; color: #ffffff;">${escapeHtml(paragraph)}</td></tr>`;
    })
    .join('');

  let html = normalizeEscapedString(template);

  html = replaceOrThrow(html, /<title>[\s\S]*?<\/title>/i, `<title>${subject}</title>`, 'title');

  html = replaceOrThrow(
    html,
    /(<span[^>]*class\s*=\s*(?:""[^"]*\besd-hidden-preheader\b[^"]*""|"[^"]*\besd-hidden-preheader\b[^"]*"|'[^']*\besd-hidden-preheader\b[^']*')[^>]*>)[\s\S]*?(<\/span>)/i,
    `$1${preheader}$2`,
    'preheader'
  );

  html = replaceOrThrow(
    html,
    /(<strong[^>]*\bid\s*=\s*(?:""i9t4f""|"i9t4f"|'i9t4f')[^>]*>)[\s\S]*?(<\/strong>)/i,
    `$1${subject}$2`,
    'main headline'
  );

  html = replaceOrThrow(
    html,
    /<img\b(?=[^>]*\bid\s*=\s*(?:""i8ayl""|"i8ayl"|'i8ayl'))[^>]*>/i,
    (imgTag) => {
      let updated = replaceAttribute(imgTag, 'src', imageUrl);
      updated = replaceAttribute(updated, 'alt', subjectRaw);
      return updated;
    },
    'main image src/alt'
  );

  html = replaceOrThrow(
    html,
    /(<table[^>]*\bid\s*=\s*(?:""i1ocu""|"i1ocu"|'i1ocu')[^>]*>[\s\S]*?<tbody[^>]*>)[\s\S]*?(<\/tbody>\s*<\/table>)/i,
    `$1${bodyRows}$2`,
    'body copy'
  );

  html = replaceCtaAnchor(html, ctaUrl, ctaRaw);
  html = compactHtml(html);

  // Safety checks
  if (!html.includes(imageUrl)) throw new Error('Final HTML missing image URL');
  if (!html.includes(`href="${escapeHtml(ctaUrl)}"`)) throw new Error('Final HTML missing CTA href');
  if (!html.includes('{{player.name}}')) throw new Error('Final HTML lost {{player.name}}');
  if (!html.includes('{{unsubscribeLink}}')) throw new Error('Final HTML lost {{unsubscribeLink}}');
  if (!html.includes('id=""iafmf""') && !html.includes('id="iafmf"')) throw new Error('Final HTML lost Download section');
  if (!html.includes('id=""iu8k3m""') && !html.includes('id="iu8k3m"')) throw new Error('Final HTML lost Social section');
  if (!html.includes('id=""iagdte""') && !html.includes('id="iagdte"')) throw new Error('Final HTML lost Footer section');

  return { html, subject: subjectRaw, preheader: preheaderRaw, bodyParagraphs, cta: ctaRaw };
}

module.exports = { buildHtml };
