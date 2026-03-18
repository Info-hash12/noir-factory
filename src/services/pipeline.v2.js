/**
 * Pipeline Orchestrator v2
 * Full end-to-end: RSS → Airtable → Approve → Screenshot → Script → TTS → Lip-sync → Compose → Publer
 */

const { getSupabase } = require('../db/local-adapter');
const airtable = require('./airtable.service');
const { captureRedditScreenshot } = require('./screenshot.service');
const { generateScript } = require('./openrouter.service');
const {
  generateTTS,
  generateLipSync,
  restoreAndUploadAvatar,
  restoreVideoFaces,
  validateVideoFile,
} = require('./segmind.service');
const { composeVideo } = require('./compositor.service');
const { publishVideo } = require('./publer.service');
const { generateStaticPost, generateCarousel, generateStory } = require('./pipeline-static');
const logger = require('../utils/logger');
const fs = require('fs');

// Job tracking for graceful shutdown — prevents SIGTERM from killing in-flight pipelines
let trackJob, untrackJob;
try {
  ({ trackJob, untrackJob } = require('../server'));
} catch {
  trackJob = () => {};
  untrackJob = () => {};
}

/**
 * Run the full pipeline for a single approved job (SQLite record)
 * @param {Object} job - SQLite content_jobs record
 * @param {Object} overrides - settings from dashboard (layout, avatar, etc.)
 */
async function runPipeline(job, overrides = {}) {
  const db = getSupabase();
  const jobId = job.id;

  async function updateJob(fields) {
    await db.from('content_jobs').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', jobId);
  }

  async function updateAirtable(fields) {
    if (job.airtable_record_id) {
      try {
        await airtable.updateContentRecord(job.airtable_record_id, fields);
      } catch (e) {
        logger.warn(`Airtable update failed for ${job.airtable_record_id}: ${e.message}`);
      }
    }
  }

  trackJob(jobId);  // Register so graceful shutdown waits for us
  logger.info(`[Pipeline] Starting job ${jobId}: ${job.source_title}`);

  // ─── ROUTE BY JOB TYPE ────────────────────────────────────────────────────
  const jobType = job.job_type || job.type || 'video_with_avatar';

  if (jobType === 'static_post') {
    try {
      const result = await generateStaticPost(job, { id: job.company_id });
      untrackJob(jobId);
      return { success: true, jobId, ...result };
    } catch (error) {
      logger.error(`[Pipeline] Static post job ${jobId} failed: ${error.message}`);
      await updateJob({
        publish_status: 'failed',
        error_message: error.message,
        processing_step: 'error'
      });
      untrackJob(jobId);
      throw error;
    }
  }

  if (jobType === 'carousel') {
    try {
      const result = await generateCarousel(job, { id: job.company_id });
      untrackJob(jobId);
      return { success: true, jobId, jobType: 'carousel', ...result };
    } catch (error) {
      logger.error(`[Pipeline] Carousel job ${jobId} failed: ${error.message}`);
      await updateJob({
        publish_status: 'failed',
        error_message: error.message,
        processing_step: 'error'
      });
      untrackJob(jobId);
      throw error;
    }
  }

  if (jobType === 'story') {
    try {
      const result = await generateStory(job, { id: job.company_id });
      untrackJob(jobId);
      return { success: true, jobId, jobType: 'story', ...result };
    } catch (error) {
      logger.error(`[Pipeline] Story job ${jobId} failed: ${error.message}`);
      await updateJob({
        publish_status: 'failed',
        error_message: error.message,
        processing_step: 'error'
      });
      untrackJob(jobId);
      throw error;
    }
  }

  // Default to video pipeline for video_with_avatar and reel types

  try {
    // ─── STEP 1: Screenshot ────────────────────────────────────────────────
    await updateJob({ processing_step: 'screenshot', publish_status: 'processing' });

    const zoomPreset = overrides.reddit_zoom || await getConfig(db, 'default_reddit_zoom') || 'title_first_para';
    const { imageUrl: screenshotUrl } = await captureRedditScreenshot({
      title: job.source_title,
      content: job.source_content,
      author: job.source_author,
      subreddit: overrides.subreddit || 'r/realestate'
    }, zoomPreset);

    await updateJob({ screenshot_url: screenshotUrl });
    await updateAirtable({ 'Screenshot url': screenshotUrl, Status: 'Screenshot Captured' });
    logger.info(`[Pipeline] Screenshot done: ${screenshotUrl}`);

    // ─── STEP 2: Script Generation ─────────────────────────────────────────
    await updateJob({ processing_step: 'script_generation' });

    const scriptResult = await generateScript(job, {
      model: overrides.model || await getConfig(db, 'openrouter_model'),
      temperature: overrides.temperature || await getConfig(db, 'openrouter_temperature'),
      max_tokens: overrides.max_tokens || await getConfig(db, 'openrouter_max_tokens'),
      system_prompt: overrides.system_prompt || await getConfig(db, 'script_system_prompt'),
      video_length: overrides.video_length || await getConfig(db, 'default_video_length')
    });

    await updateJob({
      script_text: scriptResult.script,
      generation_cost_estimate: scriptResult.ai_cost
    });

    await updateAirtable({
      'Generated Script': scriptResult.script,
      Hook: scriptResult.hook,
      Caption: scriptResult.caption,
      'First Comment': scriptResult.first_comment,
      'On-Screen Text': scriptResult.on_screen_text,
      'Total Cost': scriptResult.ai_cost,
      Status: 'Script Created'
    });
    logger.info(`[Pipeline] Script done (${scriptResult.tokens} tokens, $${scriptResult.ai_cost})`);

    // ─── STEP 3: Select Avatar ─────────────────────────────────────────────
    await updateJob({ processing_step: 'avatar_selection' });

    // Priority: override > job's saved avatar_name > default_avatar config > random fallback
    const avatarName = overrides.avatar_name || job.avatar_name || await getConfig(db, 'default_avatar');
    let avatar;
    if (avatarName) {
      avatar = await airtable.getAvatarByName(avatarName);
      logger.info(`[Pipeline] Using avatar: ${avatarName}`);
    } else {
      avatar = await airtable.getRandomAvatar();
      logger.warn(`[Pipeline] No avatar specified — picked random: ${avatar.name}`);
    }

    if (!avatar.image_url) throw new Error(`Avatar "${avatar.name}" has no image URL`);
    await updateJob({ avatar_name: avatar.name });

    // Voice fallback: if avatar has no voice sample, find one from the same character
    let voiceUrl = avatar.voice_url;
    if (!voiceUrl) {
      logger.warn(`[Pipeline] ⚠️ Avatar "${avatar.name}" has no Voice Sample — searching character fallback…`);
      voiceUrl = await airtable.getCharacterVoiceFallback(avatar.name);
      if (voiceUrl) {
        logger.info(`[Pipeline] ✅ Using character voice fallback for "${avatar.name}"`);
      } else {
        logger.warn(`[Pipeline] ⚠️ No voice fallback found — TTS will use generic voice`);
      }
    }
    logger.info(`[Pipeline] Avatar: ${avatar.name} (image: ${avatar.image_url}, voice: ${voiceUrl ? 'yes' : 'GENERIC'})`);

    // ─── STEP 4: TTS Audio ─────────────────────────────────────────────────
    await updateJob({ processing_step: 'tts_generation' });

    const ttsOptions = {
      exaggeration: overrides.tts_exaggeration || await getConfig(db, 'tts_exaggeration') || 0.5,
      cfg_weight: overrides.tts_cfg_weight || await getConfig(db, 'tts_cfg_weight') || 0.3,  // Lower = closer voice match
      temperature: overrides.tts_temperature || await getConfig(db, 'tts_temperature') || 0.8,
      voice_url: voiceUrl || null
    };

    const { audioPath } = await generateTTS(scriptResult.script, ttsOptions);
    await updateJob({ audio_url: `file://${audioPath}` });
    logger.info(`[Pipeline] TTS done: ${audioPath}`);

    // ─── STEP 4.5: Pre-process Avatar with CodeFormer ─────────────────────
    await updateJob({ processing_step: 'face_restoration_pre' });

    let processedAvatarUrl = avatar.image_url;
    const enablePreRestore = overrides.skip_face_restore !== true;
    if (enablePreRestore) {
      try {
        processedAvatarUrl = await restoreAndUploadAvatar(avatar.image_url);
        logger.info(`[Pipeline] Avatar face restored: ${processedAvatarUrl}`);
      } catch (e) {
        logger.warn(`[Pipeline] Avatar face restore failed (${e.message}) — using original`);
      }
    }

    // ─── STEP 5: Lip-Sync Video (InfiniteTalk) ─────────────────────────────
    await updateJob({ processing_step: 'video_generation' });

    const infiniteTalkSettings = {
      resolution: overrides.resolution || await getConfig(db, 'infinitetalk_resolution') || '720p',
      fps: parseInt(overrides.fps || await getConfig(db, 'infinitetalk_fps') || '25'),
      enhance_prompt: overrides.enhance_prompt !== undefined
        ? overrides.enhance_prompt
        : await getConfigBool(db, 'infinitetalk_enhance_prompt', true),
      prompt: overrides.infinitetalk_prompt || await getConfig(db, 'infinitetalk_prompt') || undefined,
      seed: overrides.seed ? parseInt(overrides.seed) : undefined,
    };

    // Retry up to 2 times on timeout/network errors — Segmind GPU queues can be slow
    let avatarVideoPath;
    const MAX_LIPSYNC_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_LIPSYNC_ATTEMPTS; attempt++) {
      try {
        const result = await generateLipSync(processedAvatarUrl, audioPath, infiniteTalkSettings);
        avatarVideoPath = result.videoPath;
        break;
      } catch (e) {
        const isRetryable = e.message.includes('timeout') || e.message.includes('ECONNRESET') || e.message.includes('ETIMEDOUT');
        if (attempt < MAX_LIPSYNC_ATTEMPTS && isRetryable) {
          logger.warn(`[Pipeline] InfiniteTalk attempt ${attempt} failed (${e.message}) — retrying in 15s…`);
          await new Promise(r => setTimeout(r, 15000));
        } else {
          throw e;
        }
      }
    }

    // Validate the video file is real (not a JSON error saved as .mp4)
    if (!validateVideoFile(avatarVideoPath)) {
      throw new Error(`InfiniteTalk produced an invalid video file: ${avatarVideoPath}`);
    }
    logger.info(`[Pipeline] InfiniteTalk lip-sync done: ${avatarVideoPath}`);

    // ─── STEP 6: Compose Final Video ───────────────────────────────────────
    await updateJob({ processing_step: 'compositing' });

    const compositorParams = {
      avatarVideoPath,
      screenshotUrl,
      audioPath,
      layout: overrides.layout || await getConfig(db, 'default_layout') || 'pip_reddit_bg',
      avatarShape: overrides.avatar_shape || await getConfig(db, 'default_avatar_shape') || 'circle',
      avatarPosition: overrides.avatar_position || await getConfig(db, 'default_avatar_position') || 'bottom_right',
      redditZoom: zoomPreset,
      transition: overrides.transition || await getConfig(db, 'default_transition') || 'hard_cut',
      bgBlur: overrides.bg_blur !== undefined ? overrides.bg_blur : await getConfigBool(db, 'default_bg_blur', true),
      hookDuration: parseInt(overrides.hook_duration || await getConfig(db, 'default_hook_duration') || '2')
    };

    let finalVideoPath = await composeVideo(compositorParams);
    await updateJob({ video_url: `file://${finalVideoPath}` });
    logger.info(`[Pipeline] Composition done: ${finalVideoPath}`);

    // ─── STEP 6.5: Post-process Face Restoration (CodeFormer) ─────────────
    const enablePostRestore = overrides.enable_video_face_restore !== undefined
      ? overrides.enable_video_face_restore
      : await getConfigBool(db, 'enable_video_face_restore', false);

    if (enablePostRestore) {
      await updateJob({ processing_step: 'face_restoration_post' });
      try {
        const restoreOpts = {
          concurrency: parseInt(overrides.restore_concurrency || await getConfig(db, 'restore_concurrency') || '5'),
          frameSkip: parseInt(overrides.restore_frame_skip || await getConfig(db, 'restore_frame_skip') || '1'),
          fidelity: parseFloat(overrides.restore_fidelity || await getConfig(db, 'restore_fidelity') || '0.7'),
          fps: infiniteTalkSettings.fps,
        };
        logger.info(`[Pipeline] Running CodeFormer face restoration on final video (skip=${restoreOpts.frameSkip})...`);
        const restored = await restoreVideoFaces(finalVideoPath, restoreOpts);

        // Swap to restored video and clean up original
        try { fs.unlinkSync(finalVideoPath); } catch {}
        finalVideoPath = restored.videoPath;

        logger.info(`[Pipeline] Video face restoration complete: ${finalVideoPath}`);
      } catch (e) {
        logger.warn(`[Pipeline] Video face restoration failed (${e.message}) — using unrestored video`);
      }
    }

    // Validate final video before uploading to Publer
    if (!validateVideoFile(finalVideoPath)) {
      throw new Error(`Final composed video is invalid — cannot publish: ${finalVideoPath}`);
    }

    // ─── STEP 7: Publish to Publer ─────────────────────────────────────────
    await updateJob({ processing_step: 'publishing' });

    const publishMode = overrides.publish_mode || await getConfig(db, 'default_publish_mode') || 'draft';
    const platforms = overrides.platforms || (await getConfig(db, 'default_platforms'))?.split(',') || ['instagram'];

    const publerResult = await publishVideo({
      videoPath: finalVideoPath,
      caption: scriptResult.caption,
      hashtags: scriptResult.hashtags,
      firstComment: scriptResult.first_comment,
      platforms,
      publishMode
    });

    await updateJob({
      publish_status: 'ready',
      processing_step: 'complete',
      video_url: publerResult.postUrl || finalVideoPath
    });

    await updateAirtable({
      'Final Video URL': publerResult.postUrl || '',
      Status: 'Done'
    });

    // Cleanup tmp files
    cleanup([audioPath, avatarVideoPath, finalVideoPath]);

    logger.info(`[Pipeline] ✅ Job ${jobId} complete! Publer post: ${publerResult.postId}`);
    untrackJob(jobId);
    return { success: true, jobId, publerResult };

  } catch (err) {
    logger.error(`[Pipeline] ❌ Job ${jobId} failed at ${(await getJobStep(db, jobId))}: ${err.message}`);
    await updateJob({
      publish_status: 'failed',
      failed_at: new Date().toISOString(),
      error_message: err.message,
      failed_stage: await getJobStep(db, jobId)
    });
    await updateAirtable({ Status: 'Failed', 'Generated Script': `ERROR: ${err.message}` });
    untrackJob(jobId);
    throw err;
  }
}

/**
 * Process all approved jobs (called by cron or API trigger)
 */
async function processApprovedJobs() {
  const db = getSupabase();
  const { data: jobs } = await db
    .from('content_jobs')
    .select('*')
    .eq('review_status', 'approved')
    .in('publish_status', ['draft'])
    .order('created_at', { ascending: true })
    .limit(3);

  if (!jobs || jobs.length === 0) {
    logger.info('No approved jobs to process');
    return { processed: 0 };
  }

  logger.info(`Processing ${jobs.length} approved jobs`);
  let succeeded = 0, failed = 0;

  for (const job of jobs) {
    try {
      await runPipeline(job);
      succeeded++;
    } catch (e) {
      failed++;
    }
  }

  return { processed: jobs.length, succeeded, failed };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function getConfig(db, key) {
  try {
    const { data } = await db.from('app_config').select('value').eq('key', key).maybeSingle();
    return data?.value || null;
  } catch { return null; }
}

async function getConfigBool(db, key, defaultVal = false) {
  const v = await getConfig(db, key);
  if (v === null) return defaultVal;
  return v === 'true' || v === true || v === '1';
}

async function getJobStep(db, jobId) {
  try {
    const { data } = await db.from('content_jobs').select('processing_step').eq('id', jobId).maybeSingle();
    return data?.processing_step || 'unknown';
  } catch { return 'unknown'; }
}

function cleanup(paths) {
  for (const p of paths) {
    try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch {}
  }
}

module.exports = { runPipeline, processApprovedJobs };
