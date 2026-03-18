/**
 * Video Compositor Service
 * Combines avatar videos with screenshots using FFmpeg (native child_process)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { uploadFile } = require('../drive.service');
const logger = require('../../utils/logger');

// Load configuration
const configPath = path.join(__dirname, '../../../config/defaults.yaml');
const config = yaml.load(fs.readFileSync(configPath, 'utf8'));

// Output dimensions (9:16 vertical format)
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;

/**
 * Gets overlay mode from job config or defaults
 * @param {Object} job - Job object
 * @returns {string} Overlay mode ('split_screen_bottom_content' or 'greenscreen_overlay')
 */
function getOverlayMode(job) {
  return job.overlay_mode || config.compositor?.default_mode || 'split_screen_bottom_content';
}

/**
 * Runs FFmpeg command using spawn
 * @param {Array} args - FFmpeg arguments
 * @param {string} outputPath - Output file path
 * @returns {Promise<string>} Output file path
 */
function runFFmpeg(args, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);
    
    let stderr = '';
    let lastProgress = 0;
    
    ffmpeg.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      
      // Parse progress from FFmpeg output
      const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        
        // Log progress every 5 seconds
        if (Math.floor(totalSeconds) % 5 === 0 && Math.floor(totalSeconds) !== lastProgress) {
          logger.info(`📊 FFmpeg processing... ${Math.floor(totalSeconds)}s`);
          lastProgress = Math.floor(totalSeconds);
        }
      }
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.substring(0, 500)}`));
      }
    });
    
    ffmpeg.on('error', (error) => {
      reject(new Error(`FFmpeg spawn error: ${error.message}`));
    });
  });
}

/**
 * Composes video in split-screen mode (avatar on left, screenshot on right)
 * @param {string} avatarVideoPath - Path to avatar video
 * @param {string} screenshotPath - Path to screenshot image
 * @param {string} outputPath - Path for output video
 * @returns {Promise<string>} Path to composed video
 */
async function composeSplitScreen(avatarVideoPath, screenshotPath, outputPath) {
  logger.info('🎬 Composing split-screen video (native FFmpeg)');
  logger.info(`📹 Avatar: ${avatarVideoPath}`);
  logger.info(`🖼️  Screenshot: ${screenshotPath}`);
  
  // Complex filter for split-screen layout
  const filter = [
    // Scale avatar to fit left half (540x1920)
    '[0:v]scale=540:1920:force_original_aspect_ratio=decrease,' +
    'pad=540:1920:(ow-iw)/2:(oh-ih)/2:black[avatar]',
    
    // Scale screenshot to fit right half (540x1920)
    '[1:v]scale=540:1920:force_original_aspect_ratio=decrease,' +
    'pad=540:1920:(ow-iw)/2:(oh-ih)/2:black[screenshot]',
    
    // Place side by side
    '[avatar][screenshot]hstack=inputs=2[combined]',
    
    // Ensure final output is exactly 1080x1920
    '[combined]scale=1080:1920:force_original_aspect_ratio=increase,' +
    'crop=1080:1920[out]'
  ].join(';');
  
  const args = [
    '-i', avatarVideoPath,
    '-i', screenshotPath,
    '-filter_complex', filter,
    '-map', '[out]',
    '-map', '0:a?',  // Include audio from avatar if available
    '-c:v', 'libx264',
    '-preset', config.compositor?.ffmpeg?.preset || 'medium',
    '-crf', String(config.compositor?.ffmpeg?.crf || 23),
    '-c:a', 'aac',
    '-b:a', config.compositor?.ffmpeg?.audio_bitrate || '128k',
    '-pix_fmt', 'yuv420p',
    '-r', String(config.compositor?.ffmpeg?.fps || 24),
    '-y',  // Overwrite output file
    outputPath
  ];
  
  logger.debug('FFmpeg args:', args.join(' '));
  
  try {
    await runFFmpeg(args, outputPath);
    logger.info(`✅ Split-screen video composed: ${outputPath}`);
    return outputPath;
  } catch (error) {
    logger.error('❌ FFmpeg split-screen composition failed:', error.message);
    throw error;
  }
}

/**
 * Composes video in greenscreen mode (avatar overlaid on screenshot)
 * @param {string} avatarVideoPath - Path to avatar video (with green background)
 * @param {string} screenshotPath - Path to screenshot image (background)
 * @param {string} outputPath - Path for output video
 * @returns {Promise<string>} Path to composed video
 */
async function composeGreenscreen(avatarVideoPath, screenshotPath, outputPath) {
  logger.info('🎬 Composing greenscreen video (native FFmpeg)');
  logger.info(`📹 Avatar: ${avatarVideoPath}`);
  logger.info(`🖼️  Screenshot: ${screenshotPath}`);
  
  // Greenscreen config from defaults
  const greenscreen = config.compositor?.greenscreen || {};
  const chromaColor = greenscreen.color || '0x00FF00';
  const similarity = greenscreen.similarity || 0.3;
  const blend = greenscreen.blend || 0.1;
  const avatarScale = greenscreen.avatar_scale || 0.5;
  
  // Calculate avatar height based on scale
  const avatarHeight = Math.floor(OUTPUT_HEIGHT * avatarScale);
  
  // Complex filter for greenscreen overlay
  const filter = [
    // Scale background to 1080x1920
    '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,' +
    'crop=1080:1920[bg]',
    
    // Remove greenscreen from avatar
    `[1:v]chromakey=${chromaColor}:${similarity}:${blend}[keyed]`,
    
    // Scale avatar
    `[keyed]scale=-1:${avatarHeight}:force_original_aspect_ratio=decrease[avatar]`,
    
    // Overlay avatar on background (bottom center)
    '[bg][avatar]overlay=(W-w)/2:H-h-100[out]'
  ].join(';');
  
  const args = [
    '-i', screenshotPath,  // Background first
    '-i', avatarVideoPath,  // Foreground second
    '-filter_complex', filter,
    '-map', '[out]',
    '-map', '1:a?',  // Include audio from avatar if available
    '-c:v', 'libx264',
    '-preset', config.compositor?.ffmpeg?.preset || 'medium',
    '-crf', String(config.compositor?.ffmpeg?.crf || 23),
    '-c:a', 'aac',
    '-b:a', config.compositor?.ffmpeg?.audio_bitrate || '128k',
    '-pix_fmt', 'yuv420p',
    '-r', String(config.compositor?.ffmpeg?.fps || 24),
    '-y',  // Overwrite output file
    outputPath
  ];
  
  logger.debug('FFmpeg args:', args.join(' '));
  
  try {
    await runFFmpeg(args, outputPath);
    logger.info(`✅ Greenscreen video composed: ${outputPath}`);
    return outputPath;
  } catch (error) {
    logger.error('❌ FFmpeg greenscreen composition failed:', error.message);
    throw error;
  }
}

/**
 * Composes final video from avatar and screenshot
 * @param {Object} job - Job object
 * @param {string} avatarVideoPath - Path to avatar video
 * @param {string} screenshotPath - Path to screenshot
 * @returns {Promise<string>} Google Drive file ID of composed video
 */
async function composeFinalVideo(job, avatarVideoPath, screenshotPath) {
  let composedVideoPath;
  
  try {
    logger.info(`🎬 Starting video composition for job ${job.id}`);
    
    // Validate inputs
    if (!fs.existsSync(avatarVideoPath)) {
      throw new Error(`Avatar video not found: ${avatarVideoPath}`);
    }
    if (!fs.existsSync(screenshotPath)) {
      throw new Error(`Screenshot not found: ${screenshotPath}`);
    }
    
    // Get overlay mode
    const overlayMode = getOverlayMode(job);
    logger.info(`📐 Using overlay mode: ${overlayMode}`);
    
    // Prepare output path
    const tempDir = path.join(__dirname, '../../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    composedVideoPath = path.join(tempDir, `final_${job.id}_${Date.now()}.mp4`);
    
    // Compose video based on mode
    if (overlayMode === 'greenscreen_overlay') {
      await composeGreenscreen(avatarVideoPath, screenshotPath, composedVideoPath);
    } else {
      // Default to split-screen (split_screen_bottom_content)
      await composeSplitScreen(avatarVideoPath, screenshotPath, composedVideoPath);
    }
    
    // Verify output file exists and has content
    const stats = fs.statSync(composedVideoPath);
    if (stats.size === 0) {
      throw new Error('Composed video file is empty');
    }
    
    logger.info(`✅ Video composed: ${composedVideoPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Upload to Google Drive
    const videoFolder = `RawFunds Media/Renders/${job.id}/final`;
    const videoFilename = `final_video.mp4`;
    
    logger.info(`☁️ Uploading final video to Google Drive...`);
    const driveFileId = await uploadFile(composedVideoPath, videoFilename, videoFolder);
    
    logger.info(`✅ Final video uploaded to Drive: ${driveFileId}`);
    
    // Clean up temp file
    fs.unlinkSync(composedVideoPath);
    logger.info(`🗑️ Cleaned up temp file: ${composedVideoPath}`);
    
    return driveFileId;
    
  } catch (error) {
    // Clean up on error
    if (composedVideoPath && fs.existsSync(composedVideoPath)) {
      fs.unlinkSync(composedVideoPath);
    }
    
    logger.error(`❌ Video composition failed for job ${job.id}:`, error.message);
    throw new Error(`Video composition failed: ${error.message}`);
  }
}

/**
 * Composes multiple videos (one per character) into final videos
 * @param {Object} job - Job object
 * @param {Object} videoFileIds - Mapping of characters to video Drive file IDs
 * @param {string} screenshotPath - Path to screenshot
 * @returns {Promise<Object>} Mapping of characters to final video Drive file IDs
 */
async function composeMultipleVideos(job, videoFileIds, screenshotPath) {
  try {
    logger.info(`🎬 Starting composition for ${Object.keys(videoFileIds).length} videos`);
    
    const finalVideoIds = {};
    
    for (const [character, videoFileId] of Object.entries(videoFileIds)) {
      try {
        logger.info(`🎭 Composing final video for ${character}`);
        
        // TODO: Download video from Google Drive using videoFileId
        const avatarVideoPath = `/temp/avatar_${character}_${job.id}.mp4`; // Placeholder
        
        // Compose final video
        const finalVideoId = await composeFinalVideo(job, avatarVideoPath, screenshotPath);
        
        finalVideoIds[character] = finalVideoId;
        
        logger.info(`✅ ${character}'s final video composed: ${finalVideoId}`);
        
      } catch (characterError) {
        logger.error(`❌ Failed to compose video for ${character}:`, characterError.message);
        throw new Error(`Composition failed for ${character}: ${characterError.message}`);
      }
    }
    
    logger.info(`🎉 All videos composed successfully`);
    
    return finalVideoIds;
    
  } catch (error) {
    logger.error('❌ Multiple video composition failed:', error.message);
    throw error;
  }
}

module.exports = {
  composeFinalVideo,
  composeMultipleVideos,
  composeSplitScreen,
  composeGreenscreen
};
