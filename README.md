# JamJournal backend

Express/MySQL API for JamJournal's music articles, genres, media, editorial settings, newsletters, and administration.

## Setup

Use Node.js 22 or later:

```bash
npm ci
npm test
npm start
```

The API listens on port 4000. Existing MySQL tables must already be provisioned: `admin`, `settings`, `blog_posts`, `genres`, `blog_post_media`, `post_categories`, `visits`, and newsletter tables. The SQL files in `src/models` contain incremental migrations, not a complete database bootstrap. This change requires no new tables or columns; artist links use the existing JSON column.

Environment variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `GMAIL_USER`, `GMAIL_PASS`.

For public rendering:

```dotenv
PUBLIC_SITE_URL=https://jamjournal.com
FRONTEND_DIST_PATH=/jamsounds/jamsounds-frontend/dist
```

The default frontend build path is the sibling `jamsounds-frontend/dist` directory. Keep this build readable by the backend process. Missing build files or database outages produce HTTP 503, rather than indexing an empty successful page.

## Deploy the coordinated frontend/backend changes

1. Install backend dependencies with `npm ci`; run `npm test`.
2. Install frontend dependencies with `npm ci`; set `VITE_PUBLIC_SITE_URL` to the same public origin, and run `npm run typecheck` and `npm run build`.
3. Set `PUBLIC_SITE_URL` and `FRONTEND_DIST_PATH` for the backend, then restart it.
4. Apply the JamJournal frontend server block changes in `server-nginx.conf` to your active configuration. This file includes unrelated existing server blocks: copy only the JamJournal changes into an installation that manages its virtual hosts separately. Preserve existing certificates and paths. Run `nginx -t` before reloading Nginx.
5. Confirm `/`, `/blog`, and a known `/blog/post/:id` return actual content, unique titles, canonical links, and structured data in the initial HTML. Unknown article IDs must return 404.
6. Confirm `/sitemap.xml` returns XML and `/robots.txt` advertises the sitemap; `/assets/*` must serve the frontend build directly through Nginx.

Public HTML uses the same response for readers and crawlers. Article content is sanitized for initial HTML. Sitemap contents derive from current articles; metadata and sitemap reads do not change readership metrics. Ratings are retired (the former public rating endpoint returns 410); historical values remain stored. The rediscovery endpoint returns shuffled compact cards sampled from up to 500 recent reviews.

## Google Search Console after deployment

- Verify ownership of the `jamjournal.com` domain property using the DNS record supplied by Search Console.
- Submit `https://jamjournal.com/sitemap.xml`.
- Inspect the homepage, blog page, and representative article URLs. Check rendered content, canonical selection, crawl errors, and indexing status; request indexing where appropriate.
- Monitor impressions/clicks for global artist, release, and music-review queries. Technical SEO improves crawlability; it does not guarantee indexing or ranking.

Do not block admin URLs in robots.txt: they are served with `noindex` metadata so crawlers can see that directive. Admin API mutations continue to require JWT authentication.

## Dependency hygiene

Install from `package-lock.json` with `npm ci` on each host so native packages match the host platform.
