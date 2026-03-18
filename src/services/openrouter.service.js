/**
 * Script Generation Service
 * Calls OpenRouter/Claude to generate script, caption, hashtags, first_comment, on_screen_text
 * in a single JSON response
 */

const axios = require('axios');
const { getSupabase } = require('../db/local-adapter');
const logger = require('../utils/logger');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const VIDEO_LENGTH_PRESETS = {
  'swipe_stopper':  { label: 'Swipe-stopper (7–15s)',   range: '7-15 seconds',  words: '20-45' },
  'viral_short':    { label: 'Viral short (15–30s)',     range: '15-30 seconds', words: '45-90' },
  'story_short':    { label: 'Story short (30–60s)',     range: '30-60 seconds', words: '90-180' },
  'deep_short':     { label: 'Deep short (60–90s)',      range: '60-90 seconds', words: '180-270' },
  'short_xl':       { label: 'Short XL (90s+)',          range: '90+ seconds',   words: '270+' }
};

// Always appended to every system prompt — ensures JSON output regardless of custom persona
const JSON_OUTPUT_REQUIREMENT = `

CRITICAL OUTPUT FORMAT: Respond ONLY in valid JSON with these exact keys. No prose, no markdown fences, no explanation before or after — just the raw JSON object:
{
  "script": "the full spoken script for the video",
  "hook": "first 1-2 sentences that grab attention",
  "caption": "short punchy caption — NO hashtags, NO emojis, plain text only",
  "hashtags": "",
  "first_comment": "the pinned first comment that drives engagement — NO hashtags, NO emojis, plain text only",
  "on_screen_text": "bold text overlaid on screen during key moments"
}
IMPORTANT: The caption and first_comment must contain NO emojis and NO hashtags. Keep them clean, plain text only.`;

const DEFAULT_SYSTEM_PROMPT = `You create short viral video scripts for RawFunds — a real estate platform offering owner financing in Alabama, Indiana, and Georgia. No bank approval needed. Target: homebuyers who've been denied mortgages or don't qualify traditionally.

Your tone: authentic, conversational, punchy. Not salesy. Empathetic to the struggle of homebuying.` + JSON_OUTPUT_REQUIREMENT;

/**
 * Ensure any system prompt ends with the JSON output requirement.
 * Custom prompts define tone/persona — they don't need to repeat the format spec.
 */
function withJsonRequirement(prompt) {
  if (!prompt) return DEFAULT_SYSTEM_PROMPT;
  // Already has it (verbatim or user wrote their own JSON spec)
  if (prompt.includes('"script"') && prompt.includes('"caption"')) return prompt;
  return prompt + JSON_OUTPUT_REQUIREMENT;
}

/**
 * Get config value from SQLite
 */
async function getConfig(key) {
  try {
    const db = getSupabase();
    const { data } = await db.from('app_config').select('value').eq('key', key).maybeSingle();
    return data?.value || null;
  } catch {
    return null;
  }
}

/**
 * Generate script, caption, hook, hashtags, first_comment, on_screen_text
 * @param {Object} jobData
 * @param {Object} options - overrides from dashboard (model, prompt, videoLength, temperature)
 */
async function generateScript(jobData, options = {}) {
  const model = options.model || await getConfig('openrouter_model') || process.env.OPENROUTER_DEFAULT_MODEL || 'anthropic/claude-3.5-sonnet';
  const temperature = parseFloat(options.temperature || await getConfig('openrouter_temperature') || '0.75');
  const maxTokens = parseInt(options.max_tokens || await getConfig('openrouter_max_tokens') || '1200');
  const rawPrompt = options.system_prompt;
  const dbPrompt = await getConfig('script_system_prompt');
  const basePrompt = (rawPrompt && rawPrompt !== 'DEFAULT')
    ? rawPrompt
    : (dbPrompt && dbPrompt !== 'DEFAULT' ? dbPrompt : null);
  const systemPrompt = withJsonRequirement(basePrompt);
  const videoLength = options.video_length || await getConfig('default_video_length') || 'story_short';
  const lengthPreset = VIDEO_LENGTH_PRESETS[videoLength] || VIDEO_LENGTH_PRESETS.story_short;

  const userPrompt = `Write a ${lengthPreset.range} video script (approx ${lengthPreset.words} words) for this Reddit post:

TITLE: ${jobData.source_title || jobData.title || ''}

CONTENT: ${jobData.source_content || jobData.content || ''}

URL: ${jobData.source_url || jobData.url || ''}`;

  logger.info(`Generating script for: ${(jobData.source_title || '').substring(0, 60)} [model: ${model}]`);

  try {
    const response = await axios.post(
      OPENROUTER_URL,
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        max_tokens: maxTokens
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://rawfunds.com',
          'X-Title': 'RawFunds Media Machine',
          'Content-Type': 'application/json'
        },
        timeout: 45000
      }
    );

    const raw = response.data?.choices?.[0]?.message?.content;
    if (!raw) throw new Error('OpenRouter returned empty response');

    const usage = response.data?.usage || {};
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const costUsd = ((promptTokens / 1000) * 0.003 + (completionTokens / 1000) * 0.015).toFixed(6);

    // Parse JSON — strip markdown fences if present
    let parsed;
    try {
      const cleaned = raw
        .replace(/^```json\s*/im, '')
        .replace(/^```\s*/im, '')
        .replace(/```\s*$/im, '')
        .trim();
      // Find outermost JSON object
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      parsed = JSON.parse(cleaned.substring(start, end + 1));
    } catch (e) {
      logger.warn('JSON parse failed — using fallback values');
      parsed = {
        script: raw,
        hook: raw.split('.')[0] || '',
        caption: 'You can buy a home without bank approval.',
        hashtags: '',
        first_comment: 'Have you been denied a mortgage? Comment below and let us know your story.',
        on_screen_text: 'No Bank Needed'
      };
    }

    return {
      script: parsed.script || '',
      hook: parsed.hook || '',
      caption: parsed.caption || '',
      hashtags: parsed.hashtags || '',
      first_comment: parsed.first_comment || '',
      on_screen_text: parsed.on_screen_text || '',
      ai_cost: parseFloat(costUsd),
      tokens: promptTokens + completionTokens,
      model_used: model
    };

  } catch (err) {
    logger.error('Script generation failed:', err.message);
    throw new Error(`Script generation failed: ${err.message}`);
  }
}

module.exports = {
  generateScript,
  VIDEO_LENGTH_PRESETS,
  DEFAULT_SYSTEM_PROMPT
};
