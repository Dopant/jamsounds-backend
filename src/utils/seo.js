import sanitizeHtml from 'sanitize-html';
export const defaultDescription = 'Discover emerging artists from around the world through independent music reviews, artist stories, and new releases on JamJournal.';
export function siteOrigin() {
  const url = new URL(process.env.PUBLIC_SITE_URL || 'https://jamjournal.com');
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('PUBLIC_SITE_URL must use HTTP or HTTPS');
  return url.origin;
}
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const plainText = value => sanitizeHtml(String(value || ''), { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
export function safeUrl(value, origin = siteOrigin()) {
  if (!value) return '';
  try { const url = new URL(value, origin); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
export function articleMetadata(post, origin = siteOrigin()) {
  const url = `${origin}/blog/post/${post.id}`;
  const image = safeUrl(post.hero_image_url, origin) || `${origin}/jamjournal-logo.png`;
  const description = plainText(post.excerpt || post.content).slice(0, 160) || defaultDescription;
  const date = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? undefined : date.toISOString(); };
  return {
    title: `${String(post.title || "Music Review")} | JamJournal`, description, url, image,
    schema: { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: String(post.title || "Music Review"), description, image, url,
      mainEntityOfPage: url, datePublished: date(post.created_at), dateModified: date(post.updated_at || post.created_at),
      author: { '@type': 'Person', name: post.author_name || 'JamJournal Editorial' },
      publisher: { '@type': 'Organization', name: 'JamJournal', url: origin, logo: { '@type': 'ImageObject', url: `${origin}/jamjournal-logo.png` } } }
  };
}
export function articleBody(post, origin = siteOrigin()) {
  const image = safeUrl(post.hero_image_url, origin);
  const content = sanitizeHtml(String(post.content || ''), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ['src', 'alt', 'width', 'height'] },
    allowedSchemes: ['http', 'https'], allowProtocolRelative: false
  });
  return `<article><h1>${escapeHtml(post.title)}</h1><p>By ${escapeHtml(post.author_name || 'JamJournal Editorial')}</p>${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(post.title)}">` : ''}${content}</article>`;
}
export function renderDocument(shell, metadata, body, { noindex = false, article = false } = {}) {
  // Replace generic shell metadata while preserving Vite's asset tags.
  shell = shell.replace(/<title>[\s\S]*?<\/title>/gi, '').replace(/<meta\b[^>]*(?:name|property)=["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, '').replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '');
  const json = JSON.stringify(metadata.schema || {}).replace(/</g, '\\u003c');
  const head = `<title>${escapeHtml(metadata.title)}</title><meta name="description" content="${escapeHtml(metadata.description)}"><meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow'}"><link rel="canonical" href="${escapeHtml(metadata.url)}"><meta property="og:title" content="${escapeHtml(metadata.title)}"><meta property="og:description" content="${escapeHtml(metadata.description)}"><meta property="og:type" content="${article ? 'article' : 'website'}"><meta property="og:url" content="${escapeHtml(metadata.url)}"><meta property="og:image" content="${escapeHtml(metadata.image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(metadata.title)}"><meta name="twitter:description" content="${escapeHtml(metadata.description)}"><meta name="twitter:image" content="${escapeHtml(metadata.image)}"><script id="page-schema" type="application/ld+json">${json}</script>`;
  return shell.replace('</head>', () => head + '</head>').replace(/<div id="root"><\/div>/, () => `<div id="root"><header><a href="/">JamJournal</a> · <a href="/blog">Music Reviews</a> · <a href="/about">About</a></header><main>${body}</main></div>`);
}
export function sitemapXml(posts, origin = siteOrigin()) {
  const fixed = ['/', '/blog', '/about', '/contact', '/blog/submit'];
  const urls = fixed.map(path => `<url><loc>${escapeHtml(origin + path)}</loc></url>`);
  for (const post of posts) {
    const date = new Date(post.updated_at || post.created_at);
    urls.push(`<url><loc>${escapeHtml(`${origin}/blog/post/${post.id}`)}</loc>${Number.isNaN(date.getTime()) ? '' : `<lastmod>${date.toISOString()}</lastmod>`}</url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
}
