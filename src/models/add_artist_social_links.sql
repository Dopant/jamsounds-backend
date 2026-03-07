-- Add artist social links to blog_posts (run once; ignore error if column already exists)
-- Stores JSON: {"facebook":"","x":"","spotify":"","youtube":""}
ALTER TABLE blog_posts ADD COLUMN artist_social_links JSON DEFAULT NULL;
