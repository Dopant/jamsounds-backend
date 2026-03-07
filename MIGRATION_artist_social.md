# Migration: Artist social links on posts

To enable **artist social media links** on blog posts (Facebook, X, Spotify, YouTube), run this SQL once on your database:

```sql
ALTER TABLE blog_posts ADD COLUMN artist_social_links JSON DEFAULT NULL;
```

File: `src/models/add_artist_social_links.sql`

If the column already exists, you can ignore the duplicate-column error.
