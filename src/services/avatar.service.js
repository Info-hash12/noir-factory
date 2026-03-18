/**
 * Avatar Service
 * Generates AI avatar videos using pre-existing reference images and audio files
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { listFilesInFolder, downloadFile, uploadFile } = require('./drive.service');
const logger = require('../utils/logger');

// Character reference image folder paths in Google Drive
const CAST_LIBRARY_PATH = 'RawFunds Media/Cast Library';

/**
 * Gets reference image file IDs for a character from Google Drive
 * @param {string} characterName - Character name (e.g., "Bianca")
 * @param {number} count - Number of images to fetch (default: 1)
 * @returns {Promise<Array>} Array of file IDs
 */
async function getReferenceImages(characterName, count = 1) {
  try {
    const folderPath = `${CAST_LIBRARY_PATH}/${characterName}`;
    logger.info(`📁 Fetching reference images for ${characterName} from: ${folderPath}`);
    
    // List all files in the character's folder
    const files = await listFilesInFolder(folderPath);
    
    if (!files || files.length === 0) {
      throw new Error(`No reference images found for ${characterName} in ${folderPath}`);
    }
    
    // Filter for image files (jpg, jpeg, png)
    const imageFiles = files.filter(file => 
      file.name.match(/\.(jpg|jpeg|png)$/i)
    );
    
    if (imageFiles.length === 0) {
      throw new Error(`No image files found for ${characterName}`);
    }
    
    // Get the requested number of images (or all if less)
    const selectedImages = imageFiles.slice(0, Math.min(count, imageFiles.length));
    
    logger.info(`✅ Found ${selectedImages.length} reference image(s) for ${characterName}`);
    
    return selectedImages.map(file => file.id);
    
  } catch (error) {
    logger.error(`Failed to get reference images for ${characterName}:`, error.message);
    throw error;
  }
}

/**
 * Downloads a file from Google Drive to temp directory
 * @param {string} fileId - Google Drive file ID
 * @param {string} filename - Local filename
 * @returns {Promise<string>} Local file path
 */
async function downloadToTemp(fileId, filename) {
  try {
    const tempDir = path.join(__dirname, '../../temp');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const filePath = path.join(tempDir, filename);
    
    // Download file from Google Drive
    await downloadFile(fileId, filePath);
    
    logger.info(`💾 Downloaded to temp: ${filePath}`);
    
    return filePath;
    
  } catch (error) {
    logger.error(`Failed to download file ${fileId}:`, error.message);
    throw error;
  }
}

/**
 * Generates avatar video using LaoZhang.ai or LivePortrait API
 * @param {string} imagePath - Path to reference image
 * @param {string} audioPath - Path to audio file
 * @param {number} retries - Number of retries remaining
 * @returns {Promise<Buffer>} Video buffer
 */
async function generateAvatarWithAPI(imagePath, audioPath, retries = 3) {
  try {
    // Check which API is configured
    const laozhangKey = process.env.LAOZHANG_API_KEY;
    const liveportraitKey = process.env.LIVEPORTRAIT_API_KEY;
    
    if (!laozhangKey && !liveportraitKey) {
      throw new Error('No avatar API key configured (LAOZHANG_API_KEY or LIVEPORTRAIT_API_KEY)');
    }
    
    // Use LaoZhang.ai if available, otherwise LivePortrait
    const useLaoZhang = !!laozhangKey;
    
    if (useLaoZhang) {
      return await generateWithLaoZhang(imagePath, audioPath, laozhangKey, retries);
    } else {
      return await generateWithLivePortrait(imagePath, audioPath, liveportraitKey, retries);
    }
    
  } catch (error) {
    logger.error('Avatar API generation failed:', error.message);
    
    // Retry logic for transient errors
    if (retries > 0 && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
      const backoffDelay = (4 - retries) * 3000;
      logger.warn(`⏳ Retrying avatar generation in ${backoffDelay}ms... (${retries - 1} retries left)`);
      
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      return generateAvatarWithAPI(imagePath, audioPath, retries - 1);
    }
    
    throw error;
  }
}

/**
 * Generates avatar video using LaoZhang.ai API
 * @param {string} imagePath - Path to reference image
 * @param {string} audioPath - Path to audio file
 * @param {string} apiKey - API key
 * @param {number} retries - Number of retries
 * @returns {Promise<Buffer>} Video buffer
 */
async function generateWithLaoZhang(imagePath, audioPath, apiKey, retries) {
  try {
    logger.info('🎬 Generating avatar with LaoZhang.ai API');
    
    const formData = new FormData();
    formData.append('image', fs.createReadStream(imagePath));
    formData.append('audio', fs.createReadStream(audioPath));
    formData.append('quality', 'high');
    
    const response = await axios.post(
      process.env.LAOZHANG_API_URL || 'https://api.laozhang.ai/v1/generate',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          ...formData.getHeaders()
        },
        responseType: 'arraybuffer',
        timeout: 180000, // 3 minute timeout for video generation
        maxContentLength: 100 * 1024 * 1024, // 100MB max
        maxBodyLength: 100 * 1024 * 1024
      }
    );
    
    logger.info('✅ Avatar generated with LaoZhang.ai');
    
    return Buffer.from(response.data);
    
  } catch (error) {
    logger.error('LaoZhang.ai API error:', error.message);
    throw error;
  }
}

/**
 * Generates avatar video using LivePortrait API
 * @param {string} imagePath - Path to reference image
 * @param {string} audioPath - Path to audio file
 * @param {string} apiKey - API key
 * @param {number} retries - Number of retries
 * @returns {Promise<Buffer>} Video buffer
 */
async function generateWithLivePortrait(imagePath, audioPath, apiKey, retries) {
  try {
    logger.info('🎬 Generating avatar with LivePortrait API');
    
    const formData = new FormData();
    formData.append('source_image', fs.createReadStream(imagePath));
    formData.append('driven_audio', fs.createReadStream(audioPath));
    formData.append('still_mode', 'true');
    formData.append('preprocess', 'full');
    
    const response = await axios.post(
      process.env.LIVEPORTRAIT_API_URL || 'https://api.liveportrait.ai/v1/generate',
      formData,
      {
        headers: {
          'X-API-Key': apiKey,
          ...formData.getHeaders()
        },
        responseType: 'arraybuffer',
        timeout: 180000, // 3 minute timeout
        maxContentLength: 100 * 1024 * 1024,
        maxBodyLength: 100 * 1024 * 1024
      }
    );
    
    logger.info('✅ Avatar generated with LivePortrait');
    
    return Buffer.from(response.data);
    
  } catch (error) {
    logger.error('LivePortrait API error:', error.message);
    throw error;
  }
}

/**
 * Generates avatar video for a single character
 * @param {string} character - Character name
 * @param {string} audioFileId - Google Drive audio file ID
 * @param {string} jobId - Job ID for folder organization
 * @returns {Promise<string>} Google Drive video file ID
 */
async function generateAvatarForCharacter(character, audioFileId, jobId) {
  let imagePath, audioPath, videoPath;
  
  try {
    logger.info(`🎭 Generating avatar for ${character}`);
    
    // Step 1: Get reference image(s) from Google Drive
    const imageFileIds = await getReferenceImages(character, 1); // Use first image
    
    // Step 2: Download reference image to temp
    imagePath = await downloadToTemp(imageFileIds[0], `${character.toLowerCase()}_ref.jpg`);
    
    // Step 3: Download audio file to temp
    audioPath = await downloadToTemp(audioFileId, `${character.toLowerCase()}_audio.mp3`);
    
    // Step 4: Generate avatar video using API
    logger.info(`🎬 Calling avatar API for ${character}...`);
    const videoBuffer = await generateAvatarWithAPI(imagePath, audioPath);
    
    // Step 5: Save video to temp
    const tempDir = path.join(__dirname, '../../temp');
    videoPath = path.join(tempDir, `${character.toLowerCase()}_avatar_${jobId}.mp4`);
    fs.writeFileSync(videoPath, videoBuffer);
    
    logger.info(`💾 Avatar video saved: ${videoPath} (${videoBuffer.length} bytes)`);
    
    // Step 6: Upload to Google Drive
    const avatarFolder = `RawFunds Media/Renders/${jobId}/avatar`;
    const videoFilename = `${character.toLowerCase()}_avatar.mp4`;
    
    logger.info(`☁️ Uploading ${character}'s avatar to Google Drive...`);
    const driveFileId = await uploadFile(videoPath, videoFilename, avatarFolder);
    
    logger.info(`✅ ${character}'s avatar uploaded to Drive: ${driveFileId}`);
    
    // Step 7: Clean up temp files
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    
    logger.info(`🗑️ Cleaned up temp files for ${character}`);
    
    return driveFileId;
    
  } catch (error) {
    // Clean up on error
    if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    
    logger.error(`❌ Avatar generation failed for ${character}:`, error.message);
    throw error;
  }
}

/**
 * Main function to generate avatar videos for all characters in a job
 * @param {Object} job - Job object
 * @param {Object} audioFileIds - Mapping of character names to audio file IDs
 * @returns {Promise<Object>} Mapping of character names to avatar video file IDs
 */
async function generateAvatarVideo(job, audioFileIds) {
  try {
    logger.info(`🎬 Starting avatar generation for job ${job.id}`);
    
    // Validate inputs
    if (!audioFileIds || Object.keys(audioFileIds).length === 0) {
      throw new Error('No audio file IDs provided');
    }
    
    const characters = Object.keys(audioFileIds);
    logger.info(`📋 Generating avatars for ${characters.length} character(s): ${characters.join(', ')}`);
    
    const avatarVideoIds = {};
    
    // Generate avatar for each character
    for (const character of characters) {
      try {
        const audioFileId = audioFileIds[character];
        const videoFileId = await generateAvatarForCharacter(character, audioFileId, job.id);
        
        avatarVideoIds[character] = videoFileId;
        
        logger.info(`✅ Avatar complete for ${character}`);
        
      } catch (characterError) {
        logger.error(`❌ Failed to generate avatar for ${character}:`, characterError.message);
        throw new Error(`Avatar generation failed for ${character}: ${characterError.message}`);
      }
    }
    
    logger.info(`🎉 Avatar generation complete for job ${job.id}`);
    logger.info(`📊 Generated avatars for: ${Object.keys(avatarVideoIds).join(', ')}`);
    
    return avatarVideoIds;
    
  } catch (error) {
    logger.error(`❌ Avatar generation failed for job ${job.id}:`, error.message);
    throw new Error(`Avatar generation failed: ${error.message}`);
  }
}

module.exports = {
  generateAvatarVideo,
  generateAvatarForCharacter,
  getReferenceImages
};
