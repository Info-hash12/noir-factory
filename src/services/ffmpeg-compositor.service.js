/**
 * FFmpeg Layer Preparation Service
 * Prepares video layers for Shotstack composition
 * Uses native child_process.spawn (NOT fluent-ffmpeg)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const logger = require('../utils/logger');

// Load configuration
const configPath = path.join(__dirname, '../../config/defaults.yaml');
const config = yaml.load(fs.readFileSync(configPath, 'utf8'));

/**
 * Runs FFmpeg command using spawn
 * @param {Array} args - FFmpeg arguments
 * @param {string} description - Description of the operation
 * @returns {Promise<void>}
 */
function runFFmpeg(args, description) {
  return new Promise((resolve, reject) => {
    logger.info(`🎬 FFmpeg: ${description}`);
    logger.debug('FFmpeg args:', args.join(' '));
    
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
          logger.info(`📊 ${description}: ${Math.floor(totalSeconds)}s processed`);
          lastProgress = Math.floor(totalSeconds);
        }
      }
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        logger.info(`✅ ${description}: Complete`);
        resolve();
      } else {
        const errorMsg = stderr.substring(stderr.length - 500); // Last 500 chars
        logger.error(`❌ ${description}: Failed (exit code ${code})`);
        logger.error('FFmpeg error:', errorMsg);
        reject(new Error(`FFmpeg failed: ${errorMsg}`));
      }
    });
    
    ffmpeg.on('error', (error) => {
      logger.error(`❌ ${description}: Spawn error`, error.message);
      reject(new Error(`FFmpeg spawn error: ${error.message}`));
    });
  });
}

/**
 * Prepares greenscreen layer - removes green background for transparency
 * @param {string} avatarVideoPath - Path to avatar video with green background
 * @param {string} outputPath - Path for output transparent video
 * @returns {Promise<string>} Path to transparent video (MOV with alpha channel)
 */
async function prepareGreenscreenLayer(avatarVideoPath, outputPath) {
  try {
    logger.info('🎬 Preparing greenscreen layer (transparent MOV)');
    
    // Get greenscreen config
    const greenscreen = config.compositor?.greenscreen || {};
    const chromaColor = greenscreen.color || '0x00FF00';
    const similarity = greenscreen.similarity || 0.3;
    const blend = greenscreen.blend || 0.1;
    
    // FFmpeg command to remove green background and create transparent video
    // Output as MOV with ProRes 4444 (supports alpha channel)
    const args = [
      '-i', avatarVideoPath,
      '-filter_complex', `chromakey=${chromaColor}:${similarity}:${blend}`,
      '-c:v', 'prores_ks',  // ProRes 4444 codec
      '-profile:v', '4',     // ProRes 4444 profile (with alpha)
      '-pix_fmt', 'yuva444p10le',  // Pixel format with alpha
      '-c:a', 'pcm_s16le',   // Uncompressed audio
      '-y',  // Overwrite output
      outputPath
    ];
    
    await runFFmpeg(args, 'Greenscreen removal');
    
    // Verify output exists and has content
    if (!fs.existsSync(outputPath)) {
      throw new Error('Greenscreen output file not created');
    }
    
    const stats = fs.statSync(outputPath);
    if (stats.size === 0) {
      throw new Error('Greenscreen output file is empty');
    }
    
    logger.info(`✅ Greenscreen layer prepared: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    return outputPath;
    
  } catch (error) {
    logger.error('Failed to prepare greenscreen layer:', error.message);
    throw error;
  }
}

/**
 * Prepares split-screen layers - scales and positions for top/bottom split
 * @param {string} avatarVideoPath - Path to avatar video
 * @param {string} screenshotPath - Path to content screenshot
 * @param {string} outputDir - Directory for output files
 * @returns {Promise<Object>} Paths to prepared layers
 */
async function prepareSplitScreenLayers(avatarVideoPath, screenshotPath, outputDir) {
  try {
    logger.info('🎬 Preparing split-screen layers (avatar top, content bottom)');
    
    const avatarOutputPath = path.join(outputDir, 'avatar_top.mp4');
    const screenshotOutputPath = path.join(outputDir, 'content_bottom.jpg');
    
    // LAYER 1: Scale avatar to top half (1080x960)
    const avatarArgs = [
      '-i', avatarVideoPath,
      '-vf', 'scale=1080:960:force_original_aspect_ratio=decrease,pad=1080:960:(ow-iw)/2:(oh-ih)/2:black',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-pix_fmt', 'yuv420p',
      '-y',
      avatarOutputPath
    ];
    
    await runFFmpeg(avatarArgs, 'Avatar layer (top half)');
    
    // LAYER 2: Scale screenshot to bottom half (1080x960)
    const screenshotArgs = [
      '-i', screenshotPath,
      '-vf', 'scale=1080:960:force_original_aspect_ratio=decrease,pad=1080:960:(ow-iw)/2:(oh-ih)/2:black',
      '-q:v', '2',  // High quality JPEG
      '-y',
      screenshotOutputPath
    ];
    
    await runFFmpeg(screenshotArgs, 'Screenshot layer (bottom half)');
    
    // Verify both outputs
    if (!fs.existsSync(avatarOutputPath) || !fs.existsSync(screenshotOutputPath)) {
      throw new Error('Split-screen output files not created');
    }
    
    const avatarStats = fs.statSync(avatarOutputPath);
    const screenshotStats = fs.statSync(screenshotOutputPath);
    
    if (avatarStats.size === 0 || screenshotStats.size === 0) {
      throw new Error('Split-screen output files are empty');
    }
    
    logger.info(`✅ Split-screen layers prepared:`);
    logger.info(`   Avatar: ${avatarOutputPath} (${(avatarStats.size / 1024 / 1024).toFixed(2)} MB)`);
    logger.info(`   Screenshot: ${screenshotOutputPath} (${(screenshotStats.size / 1024).toFixed(0)} KB)`);
    
    return {
      avatar: avatarOutputPath,
      screenshot: screenshotOutputPath
    };
    
  } catch (error) {
    logger.error('Failed to prepare split-screen layers:', error.message);
    throw error;
  }
}

/**
 * Main function: Prepares video layers for Shotstack based on overlay mode
 * @param {Object} job - Job object containing overlay_mode
 * @param {string} avatarVideoPath - Path to avatar/talking head video
 * @param {string} screenshotPath - Path to content screenshot (optional for greenscreen)
 * @returns {Promise<Object>} Prepared layer file paths
 */
async function prepareLayers(job, avatarVideoPath, screenshotPath = null) {
  let tempDir;
  
  try {
    const overlayMode = job.overlay_mode || config.compositor?.default_mode || 'split_screen_bottom_content';
    
    logger.info(`🎬 Preparing layers for job ${job.id}`);
    logger.info(`📐 Overlay mode: ${overlayMode}`);
    logger.info(`📹 Avatar video: ${avatarVideoPath}`);
    if (screenshotPath) {
      logger.info(`🖼️  Screenshot: ${screenshotPath}`);
    }
    
    // Validate avatar video exists
    if (!fs.existsSync(avatarVideoPath)) {
      throw new Error(`Avatar video not found: ${avatarVideoPath}`);
    }
    
    // Create temp directory for this job
    tempDir = path.join(__dirname, '../../temp/layers', job.id);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    let result;
    
    if (overlayMode === 'greenscreen_overlay') {
      // GREENSCREEN MODE: Remove green background for transparent overlay
      const transparentVideoPath = path.join(tempDir, 'avatar_transparent.mov');
      
      await prepareGreenscreenLayer(avatarVideoPath, transparentVideoPath);
      
      result = {
        foreground: transparentVideoPath,
        background: screenshotPath || null,
        mode: 'greenscreen_overlay',
        tempDir: tempDir
      };
      
    } else {
      // SPLIT-SCREEN MODE: Prepare top and bottom layers
      if (!screenshotPath || !fs.existsSync(screenshotPath)) {
        throw new Error(`Screenshot required for split-screen mode: ${screenshotPath}`);
      }
      
      const layers = await prepareSplitScreenLayers(avatarVideoPath, screenshotPath, tempDir);
      
      result = {
        foreground: layers.avatar,    // Top half (1080x960)
        background: layers.screenshot, // Bottom half (1080x960)
        mode: 'split_screen_bottom_content',
        tempDir: tempDir
      };
    }
    
    logger.info(`✅ Layers prepared for Shotstack:`);
    logger.info(`   Foreground: ${result.foreground}`);
    logger.info(`   Background: ${result.background || 'N/A'}`);
    logger.info(`   Mode: ${result.mode}`);
    
    return result;
    
  } catch (error) {
    // Clean up temp directory on error
    if (tempDir && fs.existsSync(tempDir)) {
      logger.warn(`🗑️ Cleaning up temp directory after error: ${tempDir}`);
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        logger.error('Failed to clean up temp directory:', cleanupError.message);
      }
    }
    
    logger.error(`❌ Layer preparation failed for job ${job.id}:`, error.message);
    throw new Error(`Layer preparation failed: ${error.message}`);
  }
}

/**
 * Cleans up temporary layer files after Shotstack processing
 * @param {Object} layerResult - Result object from prepareLayers()
 */
function cleanupLayers(layerResult) {
  try {
    if (!layerResult || !layerResult.tempDir) {
      logger.warn('No temp directory to clean up');
      return;
    }
    
    if (fs.existsSync(layerResult.tempDir)) {
      logger.info(`🗑️ Cleaning up layer temp directory: ${layerResult.tempDir}`);
      fs.rmSync(layerResult.tempDir, { recursive: true, force: true });
      logger.info('✅ Layer cleanup complete');
    }
    
  } catch (error) {
    logger.error('Failed to clean up layers:', error.message);
    // Don't throw - cleanup errors shouldn't break the pipeline
  }
}

module.exports = {
  prepareLayers,
  cleanupLayers,
  prepareGreenscreenLayer,
  prepareSplitScreenLayers
};
