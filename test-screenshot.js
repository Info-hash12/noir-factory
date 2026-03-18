/**
 * Screenshot Service Test
 * Tests the ScreenshotOne API capture independently
 */

require('dotenv').config();
const { captureScreenshot } = require('./src/services/screenshotService');

// Test URL (Reddit post about ceiling repair issue)
const testUrl = 'https://www.reddit.com/r/Renters/comments/1qqyhlu/ceiling_hasnt_been_repaired_in_months_not_sure/';

async function runTest() {
  console.log('🚀 SCREENSHOT SERVICE TEST');
  console.log('=' .repeat(60));
  
  // Step 1: Verify environment variables
  console.log('\n📋 STEP 1: Verifying Environment Variables');
  console.log('-'.repeat(60));
  
  const envCheck = {
    SCREENSHOTONE_API_KEY: !!process.env.SCREENSHOTONE_API_KEY,
    SCREENSHOTONE_API_URL: process.env.SCREENSHOTONE_API_URL || 'default',
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_KEY: !!process.env.SUPABASE_KEY
  };
  
  console.log('Environment Variables:', {
    SCREENSHOTONE_API_KEY: envCheck.SCREENSHOTONE_API_KEY ? '✅ SET' : '❌ MISSING',
    SCREENSHOTONE_API_URL: envCheck.SCREENSHOTONE_API_URL === 'default' ? '✅ Using default' : '✅ Custom',
    SUPABASE_URL: envCheck.SUPABASE_URL ? '✅ SET' : '⚠️  MISSING (not needed for screenshot test)',
    SUPABASE_KEY: envCheck.SUPABASE_KEY ? '✅ SET' : '⚠️  MISSING (not needed for screenshot test)'
  });
  
  if (!envCheck.SCREENSHOTONE_API_KEY) {
    console.error('\n❌ ERROR: SCREENSHOTONE_API_KEY is required!');
    console.error('Add to .env file: SCREENSHOTONE_API_KEY=your_api_key_here');
    process.exit(1);
  }
  
  // Step 2: Test screenshot capture
  console.log('\n📸 STEP 2: Testing Screenshot Capture');
  console.log('-'.repeat(60));
  console.log('Test URL:', testUrl);
  console.log('Expected: 9:16 vertical format (1080x1920)');
  console.log('Features: old.reddit.com conversion, ignore_host_errors, retry logic\n');
  
  try {
    console.log('⏳ Calling ScreenshotOne API...\n');
    
    const startTime = Date.now();
    const screenshotUrl = await captureScreenshot(testUrl);
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS!');
    console.log('='.repeat(60));
    console.log(`⏱️  Time taken: ${duration} seconds`);
    console.log(`\n📸 Screenshot URL (copy to browser):`);
    console.log(screenshotUrl);
    console.log('\n✅ Screenshot Format: 1080x1920 (9:16 vertical)');
    console.log('✅ Using old.reddit.com (less bot protection)');
    console.log('✅ ignore_host_errors enabled (bypasses 403)');
    console.log('\n📝 Next Steps:');
    console.log('   1. Copy the URL above and paste it in your browser');
    console.log('   2. You should see a vertical screenshot of the Reddit post');
    console.log('   3. Verify it\'s 9:16 format (portrait/vertical)');
    console.log('   4. If you see an image, the service works! ✅');
    console.log('\n💡 Note: The URL contains your API key in the query params');
    console.log('   This is normal for ScreenshotOne API v2');
    
  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ FAILED');
    console.log('='.repeat(60));
    console.error('Error:', error.message);
    console.error('\n🔍 Troubleshooting:');
    console.error('   1. Check SCREENSHOTONE_API_KEY is valid');
    console.error('   2. Verify API has not exceeded quota');
    console.error('   3. Check network/firewall settings');
    console.error('   4. Review logs above for specific error details');
    console.error('\n📚 ScreenshotOne API Docs:');
    console.error('   https://screenshotone.com/docs');
    
    if (error.stack) {
      console.error('\n📋 Full Stack Trace:');
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

// Run test
console.log('Starting screenshot service test...\n');
runTest();
