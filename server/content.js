const sanitizerOptions = {
  allowedTags: [
    'a', 'blockquote', 'br', 'code', 'del', 'em', 'figcaption', 'figure',
    'h2', 'h3', 'h4', 'hr', 'img', 'ins', 'li', 'ol', 'p', 'pre', 's',
    'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr',
    'u', 'ul', 'iframe',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    iframe: ['src', 'width', 'height', 'title', 'allow', 'allowfullscreen', 'frameborder'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com'],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: 'noopener noreferrer' },
    }),
  },
};

let sanitizeHtmlPromise;

export async function cleanEditorHtml(html) {
  if (!sanitizeHtmlPromise) {
    const { default: sanitizeHtml } = await import('sanitize-html');
    sanitizeHtmlPromise = sanitizeHtml;
  }
  return sanitizeHtmlPromise(html, sanitizerOptions).trim();
}

export function toSlug(title) {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}
