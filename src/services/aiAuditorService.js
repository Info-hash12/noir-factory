/**
 * AI Auditor Service
 * Handles content evaluation using OpenRouter API
 */

const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Evaluates content using AI and returns a score and analysis
 * @param {Object} post - Post object containing title and content
 * @returns {Promise<Object>} Object with score (0-100) and analysis (string)
 */
async function auditContent(post) {
  try {
    const apiUrl = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    logger.info(`Auditing content for post: ${post.title}`);

    // Construct the audit prompt
    const prompt = `You are a content quality auditor for a "Noir Factory" system. Analyze the following Reddit post and provide:
1. A quality score from 0 to 100 (where 100 is highest quality, most engaging content)
2. A brief analysis explaining the score

Consider these factors:
- Content originality and depth
- Engagement potential
- Relevance and timeliness
- Writing quality
- Discussion value

Post Title: "${post.title}"
Post URL: ${post.url}
${post.selftext ? `Post Content: ${post.selftext}` : ''}

You must respond with a valid JSON object in this exact format:
{
  "score": <number between 0-100>,
  "analysis": "<your analysis as a string>"
}`;

    // Make request to OpenRouter API
    const response = await axios.post(
      apiUrl,
      {
        model: model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://noir-factory.local',
          'X-Title': 'Noir Factory'
        },
        timeout: 30000 // 30 second timeout
      }
    );

    // Parse the AI response
    const aiResponse = response.data.choices[0].message.content;
    let result;

    try {
      result = JSON.parse(aiResponse);
    } catch (parseError) {
      logger.warn('Failed to parse AI response as JSON, attempting extraction');
      // Try to extract JSON from response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse AI response');
      }
    }

    // Validate response structure
    if (typeof result.score !== 'number' || typeof result.analysis !== 'string') {
      throw new Error('Invalid AI response structure');
    }

    // Ensure score is within valid range
    result.score = Math.max(0, Math.min(100, Math.round(result.score)));

    logger.info(`Content audit completed with score: ${result.score}`);

    return {
      score: result.score,
      analysis: result.analysis
    };

  } catch (error) {
    logger.error('AI audit failed:', {
      error: error.message,
      post: post.title,
      response: error.response?.data
    });

    throw new Error(`AI audit failed: ${error.message}`);
  }
}

/**
 * Batch audit multiple posts
 * @param {Array} posts - Array of post objects
 * @returns {Promise<Array>} Array of audit results
 */
async function auditBatch(posts) {
  const results = [];

  for (const post of posts) {
    try {
      const result = await auditContent(post);
      results.push({
        postId: post.id || post.reddit_id,
        ...result
      });

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      logger.error(`Failed to audit post ${post.title}:`, error.message);
      results.push({
        postId: post.id || post.reddit_id,
        score: 0,
        analysis: `Audit failed: ${error.message}`,
        error: true
      });
    }
  }

  return results;
}

module.exports = {
  auditContent,
  auditBatch
};
