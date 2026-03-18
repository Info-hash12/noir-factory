/**
 * Script Generation Service
 * Generates video scripts and captions using OpenRouter API with configurable prompts and LLMs
 */

const axios = require('axios');
const { getDatabase } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Retrieves a configuration value from the app_config table
 * @param {string} key - Configuration key to retrieve
 * @returns {Promise<any>} Configuration value
 */
async function getConfig(key) {
  try {
    const db = getDatabase();

    const { data, error } = await db
      .from('app_config')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      // Check if table doesn't exist (common during initial setup)
      if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('does not exist')) {
        logger.debug(`app_config table not found or empty for key "${key}" - using fallback`);
        return null;
      }
      throw error;
    }

    if (!data) {
      logger.debug(`No config found for key "${key}" - using default`);
      return null;
    }

    logger.debug(`Retrieved config for "${key}"`);
    return data.value;

  } catch (error) {
    logger.warn(`Failed to get config for key "${key}":`, error.message);
    return null;
  }
}

/**
 * Calculates average timing per dialogue turn
 * @param {Object} characterTiming - Character timing JSON object
 * @param {number} dialogueTurns - Number of dialogue turns
 * @returns {string} Formatted timing string
 */
function calculateTimingPerTurn(characterTiming, dialogueTurns) {
  if (characterTiming && typeof characterTiming === 'object') {
    const timings = Object.values(characterTiming);
    if (timings.length > 0) {
      const avgTiming = timings.reduce((sum, t) => sum + t, 0) / timings.length;
      return `~${avgTiming.toFixed(1)} seconds`;
    }
  }
  
  if (dialogueTurns && dialogueTurns > 0) {
    // Rough estimate: 30 seconds / turns
    const estimate = 30 / dialogueTurns;
    return `~${estimate.toFixed(1)} seconds`;
  }
  
  return '~3 seconds';
}

/**
 * Generates a video script and caption for a content job
 * @param {Object} jobData - Job data containing source content and configuration
 * @returns {Promise<Object>} Object with script, caption, and hook
 */
async function generateScript(jobData) {
  try {
    logger.info(`Generating script for job ${jobData.id}: ${jobData.source_title}`);

    // Step 1: Fetch ALL relevant global configurations
    const defaultPromptConfig = await getConfig('default_script_prompt');
    const availableLlms = await getConfig('available_llms');
    const timingPresets = await getConfig('timing_presets');
    const responseStyles = await getConfig('response_styles');
    const emotionalRanges = await getConfig('emotional_ranges');
    const defaultCharacterTiming = await getConfig('default_character_timing');

    // Step 2: Extract character data
    const selectedCharacters = jobData.selected_characters || [];
    const characterCount = jobData.character_count || selectedCharacters.length || 1;
    const characterList = selectedCharacters.join(', ') || 'narrator';

    // Step 3: Determine timing parameters
    const targetDuration = jobData.target_video_duration || 30;
    const maxDuration = jobData.max_video_duration || 60;
    const dialogueTurns = jobData.dialogue_turns || (characterCount > 1 ? characterCount * 2 : 0);
    const characterTiming = jobData.character_timing || defaultCharacterTiming;
    const timingPerTurn = calculateTimingPerTurn(characterTiming, dialogueTurns);

    // Step 4: Determine style parameters
    const responseStyle = jobData.response_style || 'conversational';
    const emotionalRange = Array.isArray(jobData.emotional_range) 
      ? jobData.emotional_range.join(', ') 
      : 'neutral, enthusiastic';

    // Log calculated constraints
    logger.info(`Script constraints for job ${jobData.id}: Target: ${targetDuration}s, Max: ${maxDuration}s, ${dialogueTurns} turns, Chars: ${characterList}, Style: ${responseStyle}, Emotion: ${emotionalRange}`);

    // Step 5: Determine final prompt and system message
    let systemPrompt = '';
    let userPrompt = '';

    if (jobData.custom_prompt) {
      // Custom prompt is a FULL OVERRIDE
      userPrompt = jobData.custom_prompt;
      logger.info(`Using custom prompt override for job ${jobData.id}`);
    } else if (defaultPromptConfig && typeof defaultPromptConfig === 'object') {
      // Use structured template from config
      systemPrompt = defaultPromptConfig.system || '';
      userPrompt = defaultPromptConfig.user_template || '';
      
      // Replace ALL dynamic placeholders
      userPrompt = userPrompt
        .replace(/{response_style}/g, responseStyle)
        .replace(/{character_count}/g, characterCount)
        .replace(/{character_list}/g, characterList)
        .replace(/{emotional_range}/g, emotionalRange)
        .replace(/{dialogue_turns}/g, dialogueTurns)
        .replace(/{target_duration}/g, targetDuration)
        .replace(/{max_duration}/g, maxDuration)
        .replace(/{timing_per_turn}/g, timingPerTurn)
        .replace(/{title}/g, jobData.source_title || 'Untitled')
        .replace(/{content}/g, jobData.source_content || '');

      logger.info(`Using template-based prompt from config for job ${jobData.id}`);
    } else {
      // Fallback to hardcoded default
      systemPrompt = 'You are a viral content script writer specializing in creating engaging, timed video scripts with precise emotional control.';
      userPrompt = `Create an engaging video script based on the following content.

Title: ${jobData.source_title || 'Untitled'}
Content: ${jobData.source_content || ''}

Script Requirements:
- Style: ${responseStyle}
- Emotional Range: ${emotionalRange}
- Target Duration: ${targetDuration} seconds (Max: ${maxDuration} seconds)
- Characters: ${characterCount} (${characterList})
- Dialogue Turns: ${dialogueTurns} (approximately ${timingPerTurn} per turn)

Generate a script that:
1. Hooks viewers in the first 3 seconds
2. Matches the target duration precisely
3. Uses ${responseStyle} language with ${emotionalRange} emotions
4. Includes a strong call-to-action at the end

Respond with valid JSON:
{
  "script": "The full script with timing",
  "caption": "Social media caption with hashtags",
  "hook": "The opening hook line"
}`;
      
      logger.info(`Using hardcoded fallback prompt for job ${jobData.id}`);
    }

    // Step 6: Determine final LLM (job-specific overrides global)
    let finalLlm = jobData.selected_llm;
    
    if (!finalLlm && availableLlms && Array.isArray(availableLlms) && availableLlms.length > 0) {
      finalLlm = availableLlms[0];
      logger.info(`Using first available LLM from config: ${finalLlm}`);
    }

    if (!finalLlm) {
      // Fallback to default LLM
      finalLlm = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
      logger.info(`Using fallback LLM: ${finalLlm}`);
    } else {
      logger.info(`Using selected LLM: ${finalLlm}`);
    }

    // Step 7: Build messages array for API
    const messages = [];
    
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }
    
    messages.push({
      role: 'user',
      content: userPrompt
    });

    // Step 8: Call OpenRouter API
    const apiUrl = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    logger.info(`Calling OpenRouter API with model: ${finalLlm} (${messages.length} messages)`);

    const response = await axios.post(
      apiUrl,
      {
        model: finalLlm,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://noir-factory.local',
          'X-Title': 'Noir Factory'
        },
        timeout: 60000 // 60 second timeout
      }
    );

    // Step 7: Parse the response
    const aiResponse = response.data.choices[0].message.content;
    
    // Log the raw AI response for debugging
    logger.info(`Raw AI response for job ${jobData.id}: ${aiResponse.substring(0, 500)}${aiResponse.length > 500 ? '...' : ''}`);
    
    let result;

    try {
      result = JSON.parse(aiResponse);
    } catch (parseError) {
      logger.warn('Failed to parse AI response as JSON, attempting extraction');
      logger.debug(`Parse error: ${parseError.message}`);
      logger.debug(`Full raw response: ${aiResponse}`);
      
      // Try to extract JSON from response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        logger.error(`No JSON found in AI response: ${aiResponse}`);
        throw new Error('Could not parse AI response as JSON');
      }
    }

    // Step 8: Validate response structure
    if (!result.script || typeof result.script !== 'string') {
      throw new Error('Invalid AI response: missing or invalid script field');
    }

    // Ensure all required fields exist
    const scriptResult = {
      script: result.script,
      caption: result.caption || 'Generated content - check it out!',
      hook: result.hook || result.script.split('.')[0] // Use first sentence as fallback hook
    };

    logger.info(`Script generated successfully for job ${jobData.id} (${scriptResult.script.length} characters)`);

    return scriptResult;

  } catch (error) {
    logger.error(`Script generation failed for job ${jobData.id}:`, {
      error: error.message,
      response: error.response?.data
    });

    throw new Error(`Script generation failed: ${error.message}`);
  }
}

module.exports = {
  generateScript,
  getConfig
};
