/**
 * Test Script Generator
 * Tests the AI script generation service independently
 */

require('dotenv').config();
const { generateScript } = require('./src/services/scriptService');

// Test job data matching what the orchestrator sends
const testJob = {
  id: 'test-123',
  source_title: "Ceiling hasn't been repaired in months. Not sure what to do [OR]",
  source_content: "Hi all, I moved to my apartment July 2024. When I toured it there was a mark on the ceiling that the leasing agent said would be repaired when i moved in. I move in- maintenance shows up while im at work and \"fix\" it...honestly probably white paint. We've put in at least 2 more maintenance request since then and nothing. They showed up 3 weeks ago, snapped a photo and said \"great that's all I need\". The ceiling is now worse and it looks like some kind of mold is forming? I emailed them last Friday asking when is the soonest date they can come repair the ceiling because it's starting to feel unsafe. I am so frustrated, it's been months and I don't want to be held liable if it gets worse. What do I do?",
  source_author: 'berryirritated',
  source_url: 'https://www.reddit.com/r/Renters/comments/1qqyhlu/ceiling_hasnt_been_repaired_in_months_not_sure/',
  
  // Customization fields (from your database)
  selected_characters: ['narrator'],
  character_count: 1,
  response_style: 'conversational',
  emotional_range: ['neutral', 'curious', 'surprised', 'amused', 'skeptical', 'empathetic'],
  dialogue_turns: 2,
  target_video_duration: 22,
  max_video_duration: 59,
  character_timing: { character_1: 3, character_2: 3, character_3: 3, character_4: 3 }
};

async function runTest() {
  try {
    console.log('🚀 Testing AI Script Generation...');
    console.log('📝 Job Title:', testJob.source_title);
    console.log('📊 Constraints:', {
      duration: `${testJob.target_video_duration}s`,
      turns: testJob.dialogue_turns,
      characters: testJob.selected_characters,
      emotion: testJob.emotional_range.join(', ')
    });

    console.log('\n🤖 Calling OpenRouter API...');
    
    const startTime = Date.now();
    const result = await generateScript(testJob);
    const endTime = Date.now();
    
    console.log(`✅ Success! (${endTime - startTime}ms)`);
    console.log('\n📋 Generated Script:');
    console.log('---');
    console.log(result.script);
    console.log('---');
    console.log(`\n📱 Caption: ${result.caption}`);
    console.log(`🎣 Hook: ${result.hook}`);
    console.log(`\n📏 Script Length: ${result.script.length} characters`);
    console.log(`🔢 Estimated Duration: ${Math.ceil(result.script.length / 15)} seconds`);

  } catch (error) {
    console.error('❌ Test Failed:', error.message);
    console.error('Stack:', error.stack);
    
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
  }
}

// Run test
runTest();
