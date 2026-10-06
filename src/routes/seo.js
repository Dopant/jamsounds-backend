import express from 'express';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../db.js';
import { getPostById } from '../models/blogPost.js';
import { articleMetadata, articleBody, defaultDescription, escapeHtml, siteOrigin, sitemapXml, renderDocument } from '../utils/seo.js';

export function createSeoRouter({ getPost = getPostById, getPosts = async () => {
  const [rows] = await pool.query('SELECT id, title, excerpt, created_at, updated_at FROM blog_posts ORDER BY created_at DESC');
  return rows;
}, readShell } = {}) {
  const router = express.Router();
  const dist = process.env.FRONTEND_DIST_PATH || fileURLToPath(new URL('../../../jamsounds-frontend/dist/', import.meta.url));
  let cachedShell; let cachedMtime;
  const shell = readShell || (async () => {
    const file = path.join(dist, 'index.html'); const info = await stat(file);
    if (cachedMtime !== info.mtimeMs) { cachedShell = await readFile(file, 'utf8'); cachedMtime = info.mtimeMs; }
    return cachedShell;
  });
  router.get('/sitemap.xml', async (req, res) => {
    try { res.type('application/xml').set('Cache-Control', 'public, max-age=300').send(sitemapXml(await getPosts())); }
    catch (error) { console.error('Sitemap failed', error); res.status(503).send('Sitemap temporarily unavailable'); }
  });
  router.get('/robots.txt', (req, res) => res.type('text').send(`User-agent: *\nAllow: /\nSitemap: ${siteOrigin()}/sitemap.xml\n`));
  router.get('/api/seo/article/:id', async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.sendStatus(404);
    try {
      const post = await getPost(req.params.id); if (!post) return res.sendStatus(404);
      res.set('Cache-Control', 'public, max-age=60').json(articleMetadata(post));
    } catch (error) { console.error('Article metadata failed', error); res.sendStatus(503); }
  });
  router.get('*', async (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || /\.[a-z0-9]+$/i.test(req.path)) return next();
    const origin = siteOrigin();
    const pages = {
      '/': ['JamJournal | Independent Music Reviews & Emerging Artists', defaultDescription],
      '/blog': ['Music Reviews & Artist Stories | JamJournal', 'Explore independent music reviews, new releases, and emerging artists from around the world.'],
      '/about': ['About JamJournal', 'JamJournal shares independent music reviews and artist stories with curious listeners around the world.'],
      '/contact': ['Contact JamJournal', 'Get in touch with JamJournal about music reviews, editorial enquiries, and artist stories.'],
      '/blog/submit': ['Submit Your Music | JamJournal', 'Share your music with JamJournal for editorial consideration.'],
      '/privacy': ['Privacy Policy | JamJournal', 'Read the JamJournal privacy policy.'],
      '/terms': ['Terms | JamJournal', 'Read the JamJournal terms.'],
      '/dmca': ['DMCA | JamJournal', 'Contact JamJournal about copyright concerns.'],
      '/disclaimer': ['Disclaimer | JamJournal', 'Read the JamJournal editorial disclaimer.']
    };
    let status = 200; let noindex = false;
    let metadata = { title: 'Page Not Found | JamJournal', description: defaultDescription, url: origin + req.path, image: origin + '/jamjournal-logo.png', schema: { '@context': 'https://schema.org', '@type': 'Organization', name: 'JamJournal', url: origin } };
    let body = '<h1>Page Not Found</h1><a href="/blog">Explore music reviews</a>';
    const match = req.path.match(/^\/blog\/post\/(\d+)$/);
    try {
      if (match) {
        const post = await getPost(match[1]);
        if (!post) { status = 404; noindex = true; }
        else { metadata = articleMetadata(post, origin); body = articleBody(post, origin); }
      } else if (pages[req.path]) {
        metadata = { ...metadata, title: pages[req.path][0], description: pages[req.path][1] };
        body = `<h1>${escapeHtml(pages[req.path][0])}</h1><p>${escapeHtml(pages[req.path][1])}</p>`;
        if (req.path === '/' || req.path === '/blog') {
          const posts = await getPosts();
          body += '<ul>' + posts.slice(0, req.path === '/' ? 12 : 100).map(post => `<li><a href="/blog/post/${post.id}">${escapeHtml(post.title)}</a><p>${escapeHtml(post.excerpt || '')}</p></li>`).join('') + '</ul>';
          metadata.schema = { '@context': 'https://schema.org', '@type': 'Blog', name: 'JamJournal', url: metadata.url, description: metadata.description };
        }
      } else if (req.path.startsWith('/admin/') || req.path === '/unsubscribe') { noindex = true; metadata.title = 'JamJournal'; body = '<h1>JamJournal</h1>'; }
      else { status = 404; noindex = true; }
      res.status(status).set('Cache-Control', 'no-cache').type('html').send(renderDocument(await shell(), metadata, body, { noindex, article: !!match && status === 200 }));
    } catch (error) {
      console.error('Public rendering failed:', error);
      res.status(503).set('Retry-After', '60').type('html').send('<h1>JamJournal is temporarily unavailable</h1><p>Please try again shortly.</p>');
    }
  });
  return router;
}
export default createSeoRouter();
