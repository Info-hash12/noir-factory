/**
 * Video Pipeline Service
 * Wan2.2 + InfiniteTalk pipeline for video generation and dubbing
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { submitAndWait, checkWorkerHealth } = require('./runpod-client');
const { uploadFile } = require('../drive.service');
const logger = require('../../utils/logger');

const VIDEO_GEN_TIMEOUT = 300000; // 5 minutes
const INFINITETALK_TIMEOUT = 600000; // 10 minutes

/**
 * Downloads a file from URL to temp directory
 * @param {string} url - File URL
 * @param {string} filename - Local filename
 * @returns {Promise<string>} Local file path
 */
async function downloadFromUrl(url, filename) {
  try {
    const tempDir = path.join(__dirname, '../../../temp');
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const filePath = path.join(tempDir, filename);
    
    logger.info(`📥 Downloading from URL: ${url.substring(0, 100)}...`);
    
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000
    });
    
    fs.writeFileSync(filePath, response.data);
    
    logger.info(`✅ Downloaded to: ${filePath}`);
    
    return filePath;
    
  } catch (error) {
    logger.error('Failed to download from URL:', error.message);
    throw error;
  }
}

/**
 * Uploads a local file to temporary storage and returns URL
 * @param {string} filePath - Local file path
 * @returns {Promise<string>} Temporary URL accessible by RunPod
 */
async function uploadToTempStorage(filePath) {
  try {
    // For now, we'll assume files are accessible or use base64 encoding
    // In production, upload to S3/R2/similar and return public URL
    
    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString('base64');
    const mimeType = filePath.endsWith('.mp4') ? 'video/mp4' : 
                     filePath.endsWith('.mp3') ? 'audio/mpeg' :
                     filePath.endsWith('.wav') ? 'audio/wav' :
                     filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') ? 'image/jpeg' :
                     filePath.endsWith('.png') ? 'image/png' : 'application/octet-stream';
    
    // Return as data URL (for small files) or upload to temp storage
    if (fileBuffer.length < 10 * 1024 * 1024) { // If less than 10MB, use data URL
      return `data:${mimeType};base64,${base64}`;
    }
    
    // For larger files, would need to upload to S3/R2
    // TODO: Implement actual temp storage upload
    throw new Error('File too large for data URL, implement temp storage upload');
    
  } catch (error) {
    logger.error('Failed to upload to temp storage:', error.message);
    throw error;
  }
}

/**
 * Generates base video using Wan2.2
 * @param {string} imagePath - Path to source image
 * @param {string} prompt - Text prompt for video generation
 * @param {number} retries - Number of retries remaining
 * @returns {Promise<string>} Path to generated video file
 */
async function generateBaseVideo(imagePath, prompt, retries = 3) {
  let tempVideoPath;
  
  try {
    logger.info(`🎬 Generating base video with Wan2.2`);
    logger.info(`📝 Prompt: "${prompt}"`);
    logger.info(`🖼️  Image: ${imagePath}`);
    
    // Upload image to temp storage for RunPod access
    const imageUrl = await uploadToTempStorage(imagePath);
    
    // Submit job to RunPod worker
    const payload = {
      image_url: imageUrl,
      prompt: prompt,
      num_frames: 120, // 5 seconds at 24fps
      fps: 24
    };
    
    const result = await submitAndWait('generate-video', payload, VIDEO_GEN_TIMEOUT);
    
    if (!result.video_url) {
      throw new Error('No video URL returned from Wan2.2');
    }
    
    // Record GPU seconds
    const gpuSeconds = result.gpu_seconds || 0;
    logger.info(`⚡ GPU time: ${gpuSeconds.toFixed(2)}s`);
    
    // Download generated video
    const videoFilename = `wan2_${Date.now()}.mp4`;
    tempVideoPath = await downloadFromUrl(result.video_url, videoFilename);
    
    logger.info(`✅ Base video generated: ${tempVideoPath}`);
    
    return { path: tempVideoPath, gpuSeconds };
    
  } catch (error) {
    // Clean up on error
    if (tempVideoPath && fs.existsSync(tempVideoPath)) {
      fs.unlinkSync(tempVideoPath);
    }
    
    logger.error('❌ Base video generation failed:', error.message);
    
    // Retry logic
    if (retries > 0 && (error.message.includes('timeout') || error.message.includes('ECONNRESET'))) {
      const backoffDelay = (4 - retries) * 5000;
      logger.warn(`⏳ Retrying in ${backoffDelay}ms... (${retries - 1} retries left)`);
      
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      return generateBaseVideo(imagePath, prompt, retries - 1);
    }
    
    throw new Error(`Base video generation failed: ${error.message}`);
  }
}

/**
 * Dubs video with audio using InfiniteTalk
 * @param {string} videoPath - Path to source video
 * @param {string} audioPath - Path to audio file
 * @param {number} retries - Number of retries remaining
 * @returns {Promise<string>} Path to dubbed video file
 */
async function dubVideo(videoPath, audioPath, retries = 3) {
  let tempDubbedPath;
  
  try {
    logger.info(`🎙️ Dubbing video with InfiniteTalk`);
    logger.info(`🎥 Video: ${videoPath}`);
    logger.info(`🔊 Audio: ${audioPath}`);
    
    // Upload video and audio to temp storage
    const videoUrl = await uploadToTempStorage(videoPath);
    const audioUrl = await uploadToTempStorage(audioPath);
    
    // Submit job to RunPod worker
    const payload = {
      video_url: videoUrl,
      audio_url: audioUrl,
      lip_sync_strength: 1.0
    };
    
    const result = await submitAndWait('dub-video', payload, INFINITETALK_TIMEOUT);
    
    if (!result.video_url) {
      throw new Error('No dubbed video URL returned from InfiniteTalk');
    }
    
    // Download dubbed video
    const dubbedFilename = `infinitetalk_${Date.now()}.mp4`;
    tempDubbedPath = await downloadFromUrl(result.video_url, dubbedFilename);
    
    logger.info(`✅ Video dubbed: ${tempDubbedPath}`);
    
    return tempDubbedPath;
    
  } catch (error) {
    // Clean up on error
    if (tempDubbedPath && fs.existsSync(tempDubbedPath)) {
      fs.unlinkSync(tempDubbedPath);
    }
    
    logger.error('❌ Video dubbing failed:', error.message);
    
    // Retry logic
    if (retries > 0 && (error.message.includes('timeout') || error.message.includes('ECONNRESET'))) {
      const backoffDelay = (4 - retries) * 5000;
      logger.warn(`⏳ Retrying in ${backoffDelay}ms... (${retries - 1} retries left)`);
      
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      return dubVideo(videoPath, audioPath, retries - 1);
    }
    
    throw new Error(`Video dubbing failed: ${error.message}`);
  }
}

/**
 * Complete video pipeline: generate base video and dub with audio
 * @param {Object} job - Job object
 * @param {string} imagePath - Path to source image
 * @param {Object} audioFileIds - Mapping of characters to audio Drive file IDs
 * @returns {Promise<Object>} Mapping of characters to video Drive file IDs
 */
async function generateVideos(job, imagePath, audioFileIds) {
  try {
    logger.info(`🎬 Starting video pipeline for job ${job.id}`);
    
    // Check RunPod worker health
    const isHealthy = await checkWorkerHealth();
    if (!isHealthy) {
      logger.warn('⚠️  RunPod worker health check failed, proceeding anyway...');
    }
    
    const characters = Object.keys(audioFileIds);
    logger.info(`📋 Generating videos for ${characters.length} character(s): ${characters.join(', ')}`);
    
    const videoFileIds = {};
    
    for (const character of characters) {
      let baseVideoPath, dubbedVideoPath;
      
      try {
        logger.info(`🎭 Processing video for ${character}`);
        
        // Step 1: Generate base video with Wan2.2
        const prompt = `A professional headshot photo of a person speaking naturally, subtle head movements, professional lighting`;
        baseVideoPath = await generateBaseVideo(imagePath, prompt);
        
        // Step 2: Download audio from Google Drive
        // TODO: Implement drive download
        const audioPath = `/temp/audio_${character}_${job.id}.wav`;
        
        // Step 3: Dub video with InfiniteTalk
        dubbedVideoPath = await dubVideo(baseVideoPath, audioPath);
        
        // Step 4: Upload to Google Drive
        const videoFolder = `RawFunds Media/Renders/${job.id}/video`;
        const videoFilename = `${character.toLowerCase()}_final.mp4`;
        
        logger.info(`☁️ Uploading ${character}'s video to Google Drive...`);
        const driveFileId = await uploadFile(dubbedVideoPath, videoFilename, videoFolder);
        
        videoFileIds[character] = driveFileId;
        
        logger.info(`✅ ${character}'s video uploaded to Drive: ${driveFileId}`);
        
        // Clean up temp files
        if (baseVideoPath && fs.existsSync(baseVideoPath)) fs.unlinkSync(baseVideoPath);
        if (dubbedVideoPath && fs.existsSync(dubbedVideoPath)) fs.unlinkSync(dubbedVideoPath);
        
      } catch (characterError) {
        // Clean up on error
        if (baseVideoPath && fs.existsSync(baseVideoPath)) fs.unlinkSync(baseVideoPath);
        if (dubbedVideoPath && fs.existsSync(dubbedVideoPath)) fs.unlinkSync(dubbedVideoPath);
        
        logger.error(`❌ Failed to process video for ${character}:`, characterError.message);
        throw new Error(`Video generation failed for ${character}: ${characterError.message}`);
      }
    }
    
    logger.info(`🎉 Video pipeline complete for job ${job.id}`);
    logger.info(`📊 Generated videos for: ${Object.keys(videoFileIds).join(', ')}`);
    
    return videoFileIds;
    
  } catch (error) {
    logger.error(`❌ Video pipeline failed for job ${job.id}:`, error.message);
    throw new Error(`Video pipeline failed: ${error.message}`);
  }
}

module.exports = {
  generateBaseVideo,
  dubVideo,
  generateVideos
};
