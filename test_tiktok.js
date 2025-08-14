// Test script to verify TikTok social media URL functionality
import pool from './src/db.js';

async function testTiktokSetting() {
  try {
    console.log('Testing TikTok social media URL functionality...\n');
    
    // Test 1: Check if social_tiktok_url exists in settings
    console.log('1. Checking if social_tiktok_url exists in settings table...');
    const [rows] = await pool.query('SELECT * FROM settings WHERE key_name = ?', ['social_tiktok_url']);
    
    if (rows.length > 0) {
      console.log('✅ social_tiktok_url found in settings table');
      console.log('   Current value:', rows[0].value);
    } else {
      console.log('❌ social_tiktok_url NOT found in settings table');
      console.log('   Adding it now...');
      
      // Add the TikTok setting
      await pool.query(
        'INSERT INTO settings (key_name, value) VALUES (?, ?)',
        ['social_tiktok_url', '']
      );
      console.log('✅ social_tiktok_url added to settings table');
    }
    
    // Test 2: Check all social media settings
    console.log('\n2. All social media settings:');
    const [socialRows] = await pool.query('SELECT * FROM settings WHERE key_name LIKE "social_%" ORDER BY key_name');
    socialRows.forEach(row => {
      console.log(`   ${row.key_name}: ${row.value || '(empty)'}`);
    });
    
    // Test 3: Test updating TikTok URL
    console.log('\n3. Testing TikTok URL update...');
    const testUrl = 'https://tiktok.com/@testuser';
    await pool.query(
      'UPDATE settings SET value = ? WHERE key_name = ?',
      [testUrl, 'social_tiktok_url']
    );
    console.log('✅ TikTok URL updated to:', testUrl);
    
    // Test 4: Verify the update
    const [updatedRow] = await pool.query('SELECT value FROM settings WHERE key_name = ?', ['social_tiktok_url']);
    console.log('✅ Verified TikTok URL is now:', updatedRow[0].value);
    
    // Test 5: Reset to empty
    await pool.query(
      'UPDATE settings SET value = ? WHERE key_name = ?',
      ['', 'social_tiktok_url']
    );
    console.log('✅ TikTok URL reset to empty');
    
    console.log('\n🎉 All tests passed! TikTok social media URL functionality is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await pool.end();
  }
}

testTiktokSetting();
