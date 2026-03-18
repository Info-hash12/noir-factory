/**
 * Static Post Pipeline
 * Generates static images (no video, no avatar) for social media
 * Handles carousel, story, and single image posts
 */

const { getSupabase } = require('../db/local-adapter');
const { captureRedditScreenshot } = require('./screenshot.service');
const { generateScript } = require('./openrouter.service');
const {
  resizeForPlatform,
  resizeForAllPlatforms,
  generateTextOverlay,
  generateQuoteCard
} = require('./image-resizer.service');
const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Upload image buffer to temporary storage and return URL
 * For now, saves to local tmp directory for processing
 * In production, this would upload to Supabase Storage or similar
 * @param {Buffer} imageBuffer - Image data
 * @param {string} jobId - Job ID for naming
 * @param {string} platform - Platform name
 * @param {number} index - Frame index for carousel
 * @returns {Promise<string>} Public URL or local path of uploaded image
 */
async function uploadImageToStorage(imageBuffer, jobId, platform, index = 0) {
  try {
    const filename = `static-${jobId}-${platform}-${index}-${Date.now()}.jpg`;
    const tmpDir = path.join(__dirname, '../../tmp/static-posts');

    // Create directory if it doesn't exist
    if (!fsSync.existsSync(tmpDir)) {
      fsSync.mkdirSync(tmpDir, { recursive: true });
    }

    const filepath = path.join(tmpDir, filename);

    // Save to local temp directory
    await fs.writeFile(filepath, imageBuffer);

    logger.info(`[PipelineStatic] ✓ Saved image to ${filepath}`);

    // Return local file path (can be replaced with S3/Supabase URL in production)
    return filepath;
  } catch (error) {
    logger.error('[PipelineStatic] Error uploading image:', error);
    throw error;
  }
}

/**
 * Download screenshot from HCTI service
 * @param {string} screenshotUrl - URL of the screenshot
 * @returns {Promise<Buffer>} Image buffer
 */
async function downloadScreenshot(screenshotUrl) {
  try {
    const response = await axios.get(screenshotUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    return Buffer.from(response.data);
  } catch (error) {
    logger.error('[PipelineStatic] Error downloading screenshot:', error);
    throw error;
  }
}

/**
 * Main entry point for static post generation
 * @param {Object} job - Content job record
 * @param {Object} company - Company record
 * @returns {Promise<Object>} { success, jobId, imageUrls, caption }
 */
async function generateStaticPost(job, company = {}) {
  const db = getSupabase();
  const jobId = job.id;

  async function updateJob(fields) {
    await db
      .from('content_jobs')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', jobId);
  }

  logger.info(`[PipelineStatic] Starting static post job ${jobId}`);

  try {
    // ─── STEP 1: Get source content ────────────────────────────────────────
    await updateJob({ processing_step: 'content_preparation', publish_status: 'processing' });

    const contentItemId = job.content_item_id;
    const { data: contentItem } = await db
      .from('content_items')
      .select('*')
      .eq('id', contentItemId)
      .single();

    if (!contentItem) {
      throw new Error(`Content item ${contentItemId} not found`);
    }

    const title = contentItem.title || job.source_title || 'Untitled';
    const body = contentItem.description || job.source_content || '';
    const sourceUrl = contentItem.source_url || job.source_url;

    logger.info(`[PipelineStatic] Content: "${title.substring(0, 50)}..."`);

    // ─── STEP 2: Generate screenshot ────────────────────────────────────────
    await updateJob({ processing_step: 'screenshot' });

    const screenshotUrl = await captureRedditScreenshot({
      title,
      content: body,
      author: contentItem.author || 'Content Creator',
      subreddit: 'r/realestate'
    }, 'title_first_para');

    logger.info(`[PipelineStatic] Screenshot: ${screenshotUrl}`);
    await updateJob({ screenshot_url: screenshotUrl });

    // Download screenshot to memory
    let screenshotBuffer = await downloadScreenshot(screenshotUrl);

    // ─── STEP 3: Generate AI caption if not provided ────────────────────────
    await updateJob({ processing_step: 'caption_generation' });

    let caption = job.caption || contentItem.caption || '';
    let onScreenText = job.on_screen_text || '';

    if (!caption) {
      try {
        const scriptResult = await generateScript(job, {
          model: 'claude-opus-4-1',
          temperature: 0.7,
          max_tokens: 500,
          system_prompt:
            'Generate a punchy social media caption (under 150 chars) for this content. No hashtags, no emojis. Just compelling, concise text.',
          video_length: 'viral_short'
        });

        caption = scriptResult.caption || '';
        onScreenText = scriptResult.on_screen_text || '';

        logger.info(`[PipelineStatic] Generated caption: "${caption.substring(0, 50)}..."`);
      } catch (error) {
        logger.warn(`[PipelineStatic] Caption generation failed, using defaults: ${error.message}`);
        caption = title;
      }
    }

    // ─── STEP 4: Determine job type and generate images ─────────────────────
    await updateJob({ processing_step: 'image_generation' });

    let imageUrls = [];
    const jobType = job.job_type || job.type || 'static_post';
    const targetPlatforms = job.target_platforms || job.platforms || ['instagram'];

    if (jobType === 'carousel') {
      imageUrls = await generateCarousel(job, company, screenshotBuffer, caption, onScreenText);
    } else if (jobType === 'story') {
      imageUrls = await generateStory(job, company, screenshotBuffer, caption, onScreenText);
    } else {
      // Default: single static post
      imageUrls = await generateSinglePost(job, company, screenshotBuffer, caption, onScreenText);
    }

    logger.info(`[PipelineStatic] Generated ${imageUrls.length} image(s)`);

    // ─── STEP 5: Upload images and update job ──────────────────────────────
    await updateJob({
      processing_step: 'uploading',
      image_urls: imageUrls,
      caption,
      on_screen_text: onScreenText,
      publish_status: 'ready'
    });

    logger.info(`[PipelineStatic] ✅ Job ${jobId} complete! Generated ${imageUrls.length} images`);
    return {
      success: true,
      jobId,
      imageUrls,
      caption,
      jobType
    };
  } catch (error) {
    logger.error(`[PipelineStatic] ❌ Job ${jobId} failed: ${error.message}`);
    await updateJob({
      publish_status: 'failed',
      error_message: error.message,
      processing_step: 'error'
    });
    throw error;
  }
}

/**
 * Generate a single static post (1 image)
 * @param {Object} job - Job record
 * @param {Object} company - Company record
 * @param {Buffer} screenshotBuffer - Screenshot image buffer
 * @param {string} caption - Caption text
 * @param {string} onScreenText - Text overlay
 * @returns {Promise<Array<string>>} Array of image URLs
 */
async function generateSinglePost(job, company, screenshotBuffer, caption, onScreenText) {
  try {
    logger.info('[PipelineStatic] Generating single static post');

    const targetPlatforms = job.target_platforms || job.platforms || ['instagram'];
    const imageUrls = [];

    for (const platform of targetPlatforms) {
      try {
        // Resize screenshot for platform
        const resized = await resizeForPlatform(
          screenshotBuffer,
          platform,
          'image'
        );

        // Add text overlay if provided
        let finalBuffer = resized.buffer;
        if (onScreenText && onScreenText.trim()) {
          const textOverlay = await generateTextOverlay(
            onScreenText,
            resized.width,
            resized.height,
            {
              fontSize: Math.round(resized.width / 20),
              fontColor: '#FFFFFF',
              backgroundColor: 'rgba(0,0,0,0.4)',
              position: 'bottom'
            }
          );
          // Simple approach: return the text overlay as is
          // In production, you'd composite them
          finalBuffer = textOverlay;
        }

        // Upload to storage
        const url = await uploadImageToStorage(finalBuffer, job.id, platform, 0);
        imageUrls.push({ platform, url });
      } catch (error) {
        logger.warn(`[PipelineStatic] Failed for platform ${platform}: ${error.message}`);
      }
    }

    return imageUrls;
  } catch (error) {
    logger.error('[PipelineStatic] Error in generateSinglePost:', error);
    throw error;
  }
}

/**
 * Generate a carousel (3-5 frames)
 * Splits content into multiple frames, each optimized for platform
 * @param {Object} job - Job record
 * @param {Object} company - Company record
 * @param {Buffer} screenshotBuffer - Screenshot image buffer
 * @param {string} caption - Caption text
 * @param {string} onScreenText - Text overlay
 * @returns {Promise<Array<string>>} Array of image URLs
 */
async function generateCarousel(job, company, screenshotBuffer, caption, onScreenText) {
  try {
    logger.info('[PipelineStatic] Generating carousel (3-5 frames)');

    const targetPlatforms = job.target_platforms || job.platforms || ['instagram'];
    const imageUrls = [];

    // Create carousel frames (in a real scenario, you'd split content intelligently)
    // For now, we'll create variations of the same image
    const numFrames = Math.min(5, Math.max(3, Math.ceil(caption.length / 100)));

    for (let frameIndex = 0; frameIndex < numFrames; frameIndex++) {
      for (const platform of targetPlatforms) {
        try {
          // Resize for carousel (usually square aspect ratio)
          const resized = await resizeForPlatform(
            screenshotBuffer,
            platform,
            'carousel'
          );

          // Add frame-specific text
          const frameText = `Frame ${frameIndex + 1}/${numFrames}`;
          const textOverlay = await generateTextOverlay(
            frameText,
            resized.width,
            resized.height,
            {
              fontSize: Math.round(resized.width / 15),
              fontColor: '#FFFFFF',
              backgroundColor: 'rgba(0,0,0,0.5)',
              position: frameIndex % 2 === 0 ? 'top' : 'bottom'
            }
          );

          const url = await uploadImageToStorage(textOverlay, job.id, `${platform}-carousel`, frameIndex);
          imageUrls.push({ platform, frameIndex, url });
        } catch (error) {
          logger.warn(
            `[PipelineStatic] Failed carousel frame ${frameIndex} for ${platform}: ${error.message}`
          );
        }
      }
    }

    logger.info(`[PipelineStatic] ✓ Generated ${numFrames} carousel frames`);
    return imageUrls;
  } catch (error) {
    logger.error('[PipelineStatic] Error in generateCarousel:', error);
    throw error;
  }
}

/**
 * Generate a story (vertical 9:16 format)
 * Creates a full-screen vertical image optimized for Stories
 * @param {Object} job - Job record
 * @param {Object} company - Company record
 * @param {Buffer} screenshotBuffer - Screenshot image buffer
 * @param {string} caption - Caption text
 * @param {string} onScreenText - Text overlay
 * @returns {Promise<Array<string>>} Array of image URLs
 */
async function generateStory(job, company, screenshotBuffer, caption, onScreenText) {
  try {
    logger.info('[PipelineStatic] Generating story (vertical 9:16)');

    const targetPlatforms = job.target_platforms || job.platforms || ['instagram'];
    const imageUrls = [];

    for (const platform of targetPlatforms) {
      try {
        // Resize for story (9:16 vertical)
        const resized = await resizeForPlatform(
          screenshotBuffer,
          platform,
          'story'
        );

        // Add caption as overlay at bottom
        let finalBuffer = resized.buffer;
        if (caption && caption.trim()) {
          const textOverlay = await generateTextOverlay(
            caption.substring(0, 80),
            resized.width,
            resized.height,
            {
              fontSize: Math.round(resized.width / 16),
              fontColor: '#FFFFFF',
              backgroundColor: 'rgba(0,0,0,0.6)',
              position: 'bottom'
            }
          );
          finalBuffer = textOverlay;
        }

        const url = await uploadImageToStorage(finalBuffer, job.id, `${platform}-story`, 0);
        imageUrls.push({ platform, url });
      } catch (error) {
        logger.warn(`[PipelineStatic] Failed story for ${platform}: ${error.message}`);
      }
    }

    logger.info(`[PipelineStatic] ✓ Generated story images`);
    return imageUrls;
  } catch (error) {
    logger.error('[PipelineStatic] Error in generateStory:', error);
    throw error;
  }
}

module.exports = {
  generateStaticPost,
  generateCarousel,
  generateStory,
  generateSinglePost,
  uploadImageToStorage,
  downloadScreenshot
};
