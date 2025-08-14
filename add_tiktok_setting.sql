-- Add TikTok social media URL setting to the settings table
INSERT INTO settings (key_name, value) VALUES ('social_tiktok_url', '') ON DUPLICATE KEY UPDATE value = VALUES(value);

-- Verify the insertion
SELECT * FROM settings WHERE key_name LIKE 'social_%' ORDER BY key_name;
