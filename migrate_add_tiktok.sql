-- Migration: Add TikTok social media URL setting
-- Run this script in your MySQL database to add TikTok support

-- Add TikTok social media URL setting
INSERT INTO settings (key_name, value) 
VALUES ('social_tiktok_url', '') 
ON DUPLICATE KEY UPDATE value = VALUES(value);

-- Verify the migration
SELECT 
    id,
    key_name,
    CASE 
        WHEN value = '' THEN '(empty)'
        ELSE value 
    END as value,
    'TikTok social media URL setting added' as migration_note
FROM settings 
WHERE key_name = 'social_tiktok_url';

-- Show all social media settings after migration
SELECT 
    id,
    key_name,
    CASE 
        WHEN value = '' THEN '(empty)'
        ELSE value 
    END as value
FROM settings 
WHERE key_name LIKE 'social_%' 
ORDER BY key_name;
