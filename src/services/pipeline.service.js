const runPodService = require('./runpod.service');
const ttsService = require('./tts.service');
const shotstackService = require('./shotstack.service');
const metricoolService = require('./metricool.service');
const { captureScreenshot } = require('./screenshotService');
const { getSupabase } = require('../db/local-adapter');
const logger = require('../utils/logger');

class VideoPipelineService {
  constructor() {
    this.supabase = getSupabase();
    logger.info('Video pipeline service initialized');
  }

  async processJob(jobId) {
    try {
      logger.info(`====== STARTING PIPELINE FOR JOB ${jobId} ======`);

      await this.updateJobStatus(jobId, 'processing', 'Pipeline started');

      const { data: job, error } = await this.supabase
        .from('content_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error || !job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      logger.info(`Job loaded: ${job.title}`);

      const steps = {
        screenshot: null,
        baseVideo: null,
        audio: null,
        timeline: null,
        render: null,
        draft: null
      };

      try {
        await this.updateJobStatus(jobId, 'processing', 'Step 1/6: Capturing screenshot');
        steps.screenshot = await this.captureScreenshot(job);
        
        await this.updateJobStatus(jobId, 'processing', 'Step 2/6: Generating base video');
        steps.baseVideo = await this.generateBaseVideo(job, steps.screenshot);
        
        await this.updateJobStatus(jobId, 'processing', 'Step 3/6: Generating audio');
        steps.audio = await this.generateAudio(job);
        
        await this.updateJobStatus(jobId, 'processing', 'Step 4/6: Creating captions');
        steps.captions = await this.generateCaptions(job.script || job.title, 15);
        
        await this.updateJobStatus(jobId, 'processing', 'Step 5/6: Assembling timeline');
        steps.timeline = await this.assembleTimeline(
          steps.baseVideo.videoUrl,
          steps.audio.audioUrl,
          steps.captions
        );
        
        await this.updateJobStatus(jobId, 'processing', 'Step 6/6: Rendering final video');
        steps.render = await this.renderVideo(jobId, steps.timeline);
        
        await this.updateJobStatus(jobId, 'processing', 'Creating Metricool draft');
        steps.draft = await this.createMetricoolDraft(job, steps.render.videoUrl);

        await this.updateJobStatus(jobId, 'completed', 'Pipeline completed successfully', {
          shotstack_render_id: steps.render.renderId,
          shotstack_video_url: steps.render.videoUrl,
          metricool_draft_id: steps.draft.draftId,
          tts_audio_url: steps.audio.audioUrl,
          pipeline_status: 'completed'
        });

        logger.info(`====== PIPELINE COMPLETED FOR JOB ${jobId} ======`);

        return {
          success: true,
          jobId: jobId,
          steps: steps
        };

      } catch (stepError) {
        logger.error(`Pipeline step failed for job ${jobId}:`, stepError.message);
        await this.updateJobStatus(jobId, 'failed', `Pipeline failed: ${stepError.message}`);
        throw stepError;
      }

    } catch (error) {
      logger.error(`Pipeline failed for job ${jobId}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async captureScreenshot(job) {
    try {
      logger.info('Capturing screenshot for:', job.source_url);
      
      const screenshotUrl = await captureScreenshot(job.source_url);

      await this.supabase
        .from('content_jobs')
        .update({ screenshot_url: screenshotUrl })
        .eq('id', job.id);

      return { screenshotUrl };

    } catch (error) {
      throw new Error(`Screenshot capture failed: ${error.message}`);
    }
  }

  async generateBaseVideo(job, screenshot) {
    try {
      logger.info('Generating base video with RunPod');

      const videoJob = await runPodService.generateVideo(
        'generate_base',
        screenshot.screenshotUrl,
        job.script || `Person speaking about: ${job.title}`,
        {
          num_frames: 120,
          fps: 30,
          width: 1080,
          height: 1920
        }
      );

      if (!videoJob.success) {
        throw new Error(videoJob.error);
      }

      let videoUrl = null;
      let pollAttempts = 0;
      const maxPollAttempts = 60;

      while (pollAttempts < maxPollAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const status = await runPodService.getJobStatus(videoJob.jobId);
        
        if (status.status === 'COMPLETED') {
          videoUrl = status.output?.video_url || status.url;
          break;
        } else if (status.status === 'FAILED') {
          throw new Error(`RunPod job failed: ${status.error}`);
        }
        
        pollAttempts++;
      }

      if (!videoUrl) {
        throw new Error('RunPod job timeout');
      }

      return { videoUrl, jobId: videoJob.jobId };

    } catch (error) {
      throw new Error(`Base video generation failed: ${error.message}`);
    }
  }

  async generateAudio(job) {
    try {
      logger.info('Generating TTS audio');

      const text = job.script || job.title || 'No content available';
      
      const audioResult = await ttsService.generateSpeech(text, 'noir_male');

      if (!audioResult.success) {
        throw new Error(audioResult.error);
      }

      return {
        audioUrl: audioResult.audioUrl,
        duration: audioResult.duration
      };

    } catch (error) {
      throw new Error(`Audio generation failed: ${error.message}`);
    }
  }

  generateCaptions(text, duration) {
    try {
      logger.info('Generating captions');

      const words = text.split(' ');
      const wordsPerCaption = 5;
      const captions = [];
      const captionDuration = duration / Math.ceil(words.length / wordsPerCaption);

      for (let i = 0; i < words.length; i += wordsPerCaption) {
        const captionText = words.slice(i, i + wordsPerCaption).join(' ');
        const startTime = (i / wordsPerCaption) * captionDuration;

        captions.push({
          text: captionText,
          start: startTime,
          duration: captionDuration
        });
      }

      return captions;

    } catch (error) {
      logger.error('Caption generation failed:', error.message);
      return [];
    }
  }

  async assembleTimeline(videoUrl, audioUrl, captions) {
    try {
      logger.info('Assembling video timeline');

      const timeline = shotstackService.createNoirEdit(videoUrl, audioUrl, captions, {
        duration: 15,
        width: 1080,
        height: 1920,
        fps: 30,
        quality: 'high'
      });

      return timeline;

    } catch (error) {
      throw new Error(`Timeline assembly failed: ${error.message}`);
    }
  }

  async renderVideo(jobId, timeline) {
    try {
      logger.info('Rendering video with Shotstack');

      const renderResult = await shotstackService.renderVideo(timeline);

      if (!renderResult.success) {
        throw new Error(renderResult.error);
      }

      let videoUrl = null;
      let pollAttempts = 0;
      const maxPollAttempts = 60;

      while (pollAttempts < maxPollAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        const status = await shotstackService.getRenderStatus(renderResult.renderId);
        
        if (status.status === 'done') {
          videoUrl = status.url;
          break;
        } else if (status.status === 'failed') {
          throw new Error(`Shotstack render failed: ${status.error}`);
        }
        
        pollAttempts++;
      }

      if (!videoUrl) {
        throw new Error('Shotstack render timeout');
      }

      return {
        videoUrl,
        renderId: renderResult.renderId
      };

    } catch (error) {
      throw new Error(`Video rendering failed: ${error.message}`);
    }
  }

  async createMetricoolDraft(job, videoUrl) {
    try {
      logger.info('Creating Metricool draft');

      const videoData = {
        url: videoUrl,
        title: job.title || 'Noir Factory Video',
        description: job.script || job.description || '',
        tags: job.tags || ['noir', 'factory', 'ai']
      };

      const draftResult = await metricoolService.createDraft(videoData, 'instagram');

      if (!draftResult.success) {
        throw new Error(draftResult.error);
      }

      return {
        draftId: draftResult.draftId,
        platform: draftResult.platform
      };

    } catch (error) {
      throw new Error(`Metricool draft creation failed: ${error.message}`);
    }
  }

  async updateJobStatus(jobId, status, message, additionalData = {}) {
    try {
      const updates = {
        status: status,
        pipeline_status: message,
        updated_at: new Date().toISOString(),
        ...additionalData
      };

      await this.supabase
        .from('content_jobs')
        .update(updates)
        .eq('id', jobId);

      logger.info(`Job ${jobId} status updated: ${status} - ${message}`);

    } catch (error) {
      logger.error(`Failed to update job status for ${jobId}:`, error.message);
    }
  }
}

const videoPipelineService = new VideoPipelineService();
module.exports = videoPipelineService;
