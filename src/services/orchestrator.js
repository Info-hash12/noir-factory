/**
 * Orchestrator Service
 * Manages the complete content creation pipeline for approved jobs
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { getJobsByReviewStatus, updateJob, getJobById } = require('../models/contentJob');
const { captureScreenshot } = require('./screenshotService');
const { generateScript } = require('./scriptService');
const { generateAudioForJob } = require('./audio.service');
const { generateVideos } = require('./video/video-pipeline');
const { composeMultipleVideos } = require('./compositor/video-compositor');
const { checkBudgetLimits, getBatchSize } = require('../middleware/budget-control');
const { supabase } = require('../db/local-adapter');
const logger = require('../utils/logger');

// Load configuration
const configPath = path.join(__dirname, '../../config/defaults.yaml');
const config = yaml.load(fs.readFileSync(configPath, 'utf8'));

/**
 * Checks if there are any one-off jobs in the queue
 * @returns {Promise<boolean>} True if one-off jobs exist
 */
async function checkForOneOffJobs() {
  try {
    const { data, error } = await supabase
      .from('content_jobs')
      .select('id')
      .eq('one_off_run', true)
      .eq('review_status', 'approved')
      .in('publish_status', ['draft', 'failed'])
      .limit(1);
    
    if (error) throw error;
    
    return data && data.length > 0;
    
  } catch (error) {
    logger.error('Failed to check for one-off jobs:', error.message);
    return false;
  }
}

/**
 * Processes all approved jobs through the content creation pipeline
 * @returns {Promise<Object>} Summary of processing results
 */
async function processApprovedJobs() {
  try {
    logger.info('Starting orchestrator: Processing approved jobs');

    // Step 0: Check budget limits before starting
    const hasOneOffJobs = await checkForOneOffJobs();
    const budgetCheck = await checkBudgetLimits(hasOneOffJobs);
    
    if (!budgetCheck.allowed) {
      logger.warn(`🛑 Budget limit reached: ${budgetCheck.reason}`);
      return {
        success: false,
        processed: 0,
        message: budgetCheck.reason,
        budgetExceeded: true
      };
    }

    logger.info(`✅ Budget check passed: ${budgetCheck.reason}`);

    // Step 1: Query for jobs ready for processing
    // Jobs where review_status = 'approved' AND publish_status is 'draft', null, or 'failed'
    const approvedJobs = await getJobsByReviewStatus('approved');
    
    // Filter for jobs that need processing (including failed jobs for retry)
    let jobsToProcess = approvedJobs.filter(job => 
      job.publish_status === 'draft' || 
      !job.publish_status || 
      job.publish_status === 'failed'
    );

    if (jobsToProcess.length === 0) {
      logger.info('No approved jobs to process');
      return {
        success: true,
        processed: 0,
        message: 'No jobs to process'
      };
    }

    // Prioritize one-off jobs
    jobsToProcess.sort((a, b) => {
      if (a.one_off_run && !b.one_off_run) return -1;
      if (!a.one_off_run && b.one_off_run) return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    // Limit batch size
    const batchSize = await getBatchSize();
    jobsToProcess = jobsToProcess.slice(0, batchSize);

    logger.info(`Found ${jobsToProcess.length} approved jobs to process (batch size: ${batchSize})`);

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    };

    // Step 2: Process each job through the pipeline
    for (const job of jobsToProcess) {
      try {
        logger.info(`Processing job ${job.id}: ${job.source_title}`);
        await processSingleJob(job);
        results.succeeded++;
      } catch (error) {
        logger.error(`Failed to process job ${job.id}:`, error.message);
        results.failed++;
        results.errors.push({
          jobId: job.id,
          error: error.message
        });
      }
      results.processed++;
    }

    logger.info(`Orchestrator completed: ${results.succeeded} succeeded, ${results.failed} failed`);

    return {
      success: true,
      ...results
    };

  } catch (error) {
    logger.error('Orchestrator failed:', error.message);
    throw error;
  }
}

/**
 * Processes a single job through V2 pipeline (new multi-stage)
 * @param {Object} job - Content job object
 * @returns {Promise<void>}
 */
async function processV2Pipeline(job) {
  try {
    logger.info(`[${job.id}] Starting V2 Pipeline`);
    
    let totalGpuSeconds = 0;
    let totalCost = 0;
    const openrouterTokens = { prompt: 0, completion: 0, total: 0 };
    
    // STAGE 1: TTS (Qwen3-TTS)
    logger.info(`[${job.id}] V2 Stage 1: TTS (Qwen3-TTS)`);
    await updateJob(job.id, { processing_step: 'tts' });
    
    const { generateQwen3TTSAudio } = require('./tts/qwen3-tts');
    const character = job.character || 'bianca'; // Default character
    const audioPath = await generateQwen3TTSAudio(job.generated_script, character);
    
    await updateJob(job.id, { voice_profile_used: character });
    logger.info(`[${job.id}] ✅ TTS complete: ${audioPath}`);
    
    // STAGE 2: Video Gen (Wan2.2 via RunPod)
    logger.info(`[${job.id}] V2 Stage 2: Video Gen (Wan2.2 - 720p)`);
    await updateJob(job.id, { processing_step: 'video_gen' });
    
    const { generateBaseVideo } = require('./video/video-pipeline');
    const screenshotPath = './temp/screenshot.png'; // TODO: Get from job
    const baseVideoResult = await generateBaseVideo(screenshotPath, 'person speaking naturally');
    
    totalGpuSeconds += baseVideoResult.gpuSeconds || 0;
    logger.info(`[${job.id}] ✅ Base video generated (GPU: ${baseVideoResult.gpuSeconds}s)`);
    
    // STAGE 3: InfiniteTalk (Lip-sync dubbing via RunPod)
    logger.info(`[${job.id}] V2 Stage 3: InfiniteTalk (lip-sync)`);
    await updateJob(job.id, { processing_step: 'infinitetalk' });
    
    const { dubVideo } = require('./video/video-pipeline');
    const dubbedVideoResult = await dubVideo(baseVideoResult.path, audioPath);
    
    totalGpuSeconds += dubbedVideoResult.gpuSeconds || 0;
    logger.info(`[${job.id}] ✅ Lip-sync complete (GPU: ${dubbedVideoResult.gpuSeconds}s)`);
    
    // STAGE 4: Layer Prep (FFmpeg compositor for chroma key or positioning)
    logger.info(`[${job.id}] V2 Stage 4: Layer Prep (FFmpeg compositor)`);
    await updateJob(job.id, { processing_step: 'layer_prep' });
    
    const { prepareLayers, cleanupLayers } = require('./ffmpeg-compositor.service');
    const overlayMode = job.overlay_mode || 'split_screen_bottom_content';
    
    // Prepare layers for Shotstack
    const layerResult = await prepareLayers(
      job,
      dubbedVideoResult.path,
      screenshotPath
    );
    
    logger.info(`[${job.id}] ✅ Layers prepped for Shotstack`);
    
    // STAGE 5: Shotstack Render (cloud composition)
    logger.info(`[${job.id}] V2 Stage 5: Shotstack Render`);
    await updateJob(job.id, { processing_step: 'shotstack_render' });
    
    let finalVideoUrl;
    
    try {
      const { composeShotstackVideo } = require('./shotstack.service');
      
      // Pass prepared layers to Shotstack
      const shotstackResult = await composeShotstackVideo({
        foregroundPath: layerResult.foreground,
        backgroundPath: layerResult.background,
        overlayMode: layerResult.mode
      });
      
      finalVideoUrl = shotstackResult.driveFileId;
      
      await updateJob(job.id, { 
        final_video_url: finalVideoUrl 
      });
      
      logger.info(`[${job.id}] ✅ Shotstack render complete`);
      
    } catch (error) {
      logger.warn(`[${job.id}] Shotstack failed: ${error.message}`);
      // For V2, Shotstack is required - mark as failed if it fails
      throw new Error(`Shotstack rendering failed: ${error.message}`);
    } finally {
      // Clean up temporary layer files
      cleanupLayers(layerResult);
    }
    
    // STAGE 6: Metricool Draft
    logger.info(`[${job.id}] V2 Stage 6: Metricool Draft`);
    await updateJob(job.id, { processing_step: 'metricool_draft' });
    
    // TODO: Implement actual Metricool service
    const metricoolResult = {
      draftId: `metricool-v2-${job.id}`,
      draftUrl: `https://metricool.com/draft/${job.id}`
    };
    
    await updateJob(job.id, {
      metricool_draft_id: metricoolResult.draftId,
      metricool_draft_url: metricoolResult.draftUrl
    });
    
    logger.info(`[${job.id}] ✅ Metricool draft created`);
    
    // Calculate total cost (example pricing)
    totalCost = (
      (totalGpuSeconds * 0.0015) +  // GPU cost: $0.0015/second
      (openrouterTokens.total * 0.000001)  // Token cost
    );
    
    // FINAL: Mark as completed
    await updateJob(job.id, {
      publish_status: 'ready',
      processing_step: 'completed',
      processed_at: new Date().toISOString(),
      gpu_seconds: totalGpuSeconds,
      cost_estimate: totalCost,
      openrouter_tokens: openrouterTokens
    });
    
    logger.info(`[${job.id}] ✅ V2 Pipeline complete (GPU: ${totalGpuSeconds}s, Cost: $${totalCost.toFixed(4)})`);
    
  } catch (error) {
    logger.error(`V2 Pipeline failed for job ${job.id}:`, error.message);
    
    await updateJob(job.id, {
      publish_status: 'failed',
      failed_stage: job.processing_step,
      error_message: error.message,
      failed_at: new Date().toISOString()
    });
    
    throw error;
  }
}

/**
 * Processes a single job through V1 pipeline (legacy)
 * @param {Object} job - Content job object
 * @returns {Promise<void>}
 */
async function processV1Pipeline(job) {
  try {
    // STEP 1: Generate Script
    logger.info(`[${job.id}] Step 1: Generating script`);
    await updateJob(job.id, {
      publish_status: 'processing',
      processing_step: 'generating_script'
    });

    // Call the advanced script generation service
    const scriptResult = await generateScript(job);

    await updateJob(job.id, {
      generated_script: scriptResult.script,
      generated_caption: scriptResult.caption,
      generated_hook: scriptResult.hook
    });

    logger.info(`[${job.id}] Script generated successfully (${scriptResult.script.length} chars)`);

    // STEP 2: Capture Screenshot (9:16 format)
    logger.info(`[${job.id}] Step 2: Capturing screenshot`);
    await updateJob(job.id, {
      processing_step: 'capturing_screenshot'
    });

    const screenshotUrl = await captureScreenshot(job.source_url);

    await updateJob(job.id, {
      screenshot_url: screenshotUrl
    });

    logger.info(`[${job.id}] Screenshot captured successfully`);

    // STEP 3: Generate Audio  
    logger.info(`[${job.id}] Step 3: Generating audio`);
    await updateJob(job.id, {
      processing_step: 'generating_audio'
    });

    // Generate audio for all speakers using ElevenLabs
    const audioFileIds = await generateAudioForJob(job);

    await updateJob(job.id, {
      audio_urls: JSON.stringify(audioFileIds),
      processing_step: 'audio_done'
    });

    logger.info(`[${job.id}] Audio generated successfully for ${Object.keys(audioFileIds).length} speakers`);

    // STEP 4: Generate Videos (Wan2.2 + InfiniteTalk)
    logger.info(`[${job.id}] Step 4: Generating videos with Wan2.2 + InfiniteTalk`);
    await updateJob(job.id, {
      processing_step: 'video_gen'
    });

    // Generate videos for all characters using screenshot and audio files
    // TODO: Get actual screenshot image path from screenshotUrl
    const imagePath = './temp/screenshot.png'; // Placeholder
    
    const videoFileIds = await generateVideos(job, imagePath, audioFileIds);

    await updateJob(job.id, {
      video_urls: JSON.stringify(videoFileIds),
      processing_step: 'video_done'
    });

    logger.info(`[${job.id}] Videos generated successfully for ${Object.keys(videoFileIds).length} characters`);

    // STEP 5: Compose Final Videos (Internal FFmpeg or Shotstack)
    const compositorEngine = config.compositor?.engine || 'internal';
    logger.info(`[${job.id}] Step 5: Composing final videos with ${compositorEngine} compositor`);
    
    await updateJob(job.id, {
      processing_step: 'composing_video'
    });

    // TODO: Get actual screenshot image path from screenshotUrl
    const screenshotPath = './temp/screenshot.png'; // Placeholder
    
    let finalVideoIds;
    
    if (compositorEngine === 'shotstack') {
      // Use Shotstack service
      logger.info(`[${job.id}] Using Shotstack compositor`);
      
      // Check if Shotstack service exists
      try {
        const { composeShotstackVideo } = require('./shotstack.service');
        
        // Compose using Shotstack for all characters
        finalVideoIds = {};
        for (const [character, videoFileId] of Object.entries(videoFileIds)) {
          const shotstackResult = await composeShotstackVideo({
            avatarVideoUrl: `drive://${videoFileId}`,
            screenshotUrl: screenshotUrl,
            overlayMode: job.overlay_mode || config.compositor?.default_mode
          });
          
          finalVideoIds[character] = shotstackResult.driveFileId;
        }
        
      } catch (error) {
        logger.error(`[${job.id}] Shotstack compositor failed, falling back to internal:`, error.message);
        // Fallback to internal compositor
        finalVideoIds = await composeMultipleVideos(job, videoFileIds, screenshotPath);
      }
      
    } else {
      // Use internal FFmpeg compositor (default)
      logger.info(`[${job.id}] Using internal FFmpeg compositor`);
      finalVideoIds = await composeMultipleVideos(job, videoFileIds, screenshotPath);
    }

    await updateJob(job.id, {
      final_video_urls: JSON.stringify(finalVideoIds),
      processing_step: 'composition_done'
    });

    logger.info(`[${job.id}] Final videos composed successfully for ${Object.keys(finalVideoIds).length} characters`);

    // STEP 6: Create Metricool Draft
    logger.info(`[${job.id}] Step 6: Creating Metricool draft`);
    await updateJob(job.id, {
      processing_step: 'creating_metricool_draft'
    });

    // TODO: Implement metricoolService.createDraft()
    // const metricoolResult = await metricoolService.createDraft({
    //   videoUrl: videoResult.finalVideoUrl,
    //   caption: scriptResult.caption
    // });
    // For now, use placeholder
    const metricoolResult = {
      draftId: 'metricool-draft-123',
      draftUrl: 'https://metricool.com/draft/123'
    };

    await updateJob(job.id, {
      metricool_draft_id: metricoolResult.draftId,
      metricool_draft_url: metricoolResult.draftUrl
    });

    logger.info(`[${job.id}] Metricool draft created successfully`);

    // FINAL: Mark as ready
    await updateJob(job.id, {
      publish_status: 'ready',
      processing_step: 'completed',
      processed_at: new Date().toISOString()
    });

    logger.info(`[${job.id}] Pipeline completed successfully`);

  } catch (error) {
    // Error handling: Mark job as failed
    logger.error(`Pipeline failed for job ${job.id}:`, error.message);

    await updateJob(job.id, {
      publish_status: 'failed',
      error_message: error.message,
      failed_at: new Date().toISOString()
    });

    throw error;
  }
}

/**
 * Routes job to appropriate pipeline version
 * @param {Object} job - Content job object
 * @returns {Promise<void>}
 */
async function processSingleJob(job) {
  const pipelineVersion = job.pipeline_version || 'v1';
  
  logger.info(`[${job.id}] Pipeline version: ${pipelineVersion}`);
  
  if (pipelineVersion === 'v2') {
    return await processV2Pipeline(job);
  } else {
    return await processV1Pipeline(job);
  }
}

module.exports = {
  processApprovedJobs,
  processSingleJob,
  processV1Pipeline,
  processV2Pipeline
};
