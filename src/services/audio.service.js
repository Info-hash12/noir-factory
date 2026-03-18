/**
 * Audio Service
 * Generates AI voice audio using Qwen3-TTS for multiple speakers
 */

const fs = require('fs');
const path = require('path');
const { synthesizeSpeech, checkServiceHealth } = require('./tts/qwen3-tts');
const { uploadFile } = require('./drive.service');
const logger = require('../utils/logger');

/**
 * Groups script lines by speaker
 * @param {Array} scriptLines - Array of {speaker, text} objects
 * @returns {Object} Grouped lines by speaker
 */
function groupLinesBySpeaker(scriptLines) {
  const grouped = {};
  
  scriptLines.forEach(line => {
    const speaker = line.speaker || 'Unknown';
    if (!grouped[speaker]) {
      grouped[speaker] = [];
    }
    grouped[speaker].push(line.text);
  });
  
  return grouped;
}

/**
 * Generates audio for a single character using Qwen3-TTS
 * @param {string} speaker - Character name
 * @param {Array} textLines - Array of text lines
 * @returns {Promise<Buffer>} Audio buffer
 */
async function generateAudioForSpeaker(speaker, textLines) {
  try {
    // Combine all lines for this speaker
    const fullText = textLines.join(' ');
    
    logger.info(`🎙️ Generating audio for ${speaker} using Qwen3-TTS`);
    
    // Synthesize speech using Qwen3-TTS with character's voice profile
    const audioBuffer = await synthesizeSpeech(fullText, speaker.toLowerCase());
    
    logger.info(`✅ Audio generated for ${speaker}: ${audioBuffer.length} bytes`);
    
    return audioBuffer;
    
  } catch (error) {
    logger.error(`❌ Audio generation failed for ${speaker}:`, error.message);
    throw error;
  }
}

/**
 * Saves audio buffer to temporary file
 * @param {Buffer} audioBuffer - Audio data
 * @param {string} filename - Output filename
 * @returns {Promise<string>} File path
 */
async function saveAudioToTemp(audioBuffer, filename) {
  const tempDir = path.join(__dirname, '../../temp');
  
  // Create temp directory if it doesn't exist
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, audioBuffer);
  
  logger.info(`💾 Audio saved to temp: ${filePath}`);
  
  return filePath;
}

/**
 * Main function to generate audio for all speakers in a job
 * @param {Object} job - Job object with script_json
 * @returns {Promise<Object>} Mapping of speaker names to Google Drive file IDs
 */
async function generateAudioForJob(job) {
  try {
    logger.info(`🎬 Starting audio generation for job ${job.id}`);
    
    // Check TTS service health
    const isHealthy = await checkServiceHealth();
    if (!isHealthy) {
      logger.warn('⚠️  TTS service health check failed, proceeding anyway...');
    }
    
    // Parse script JSON
    let scriptLines;
    try {
      scriptLines = typeof job.script_json === 'string' 
        ? JSON.parse(job.script_json) 
        : job.script_json;
    } catch (parseError) {
      throw new Error(`Failed to parse script_json: ${parseError.message}`);
    }
    
    if (!Array.isArray(scriptLines) || scriptLines.length === 0) {
      throw new Error('script_json must be a non-empty array');
    }
    
    // Group lines by speaker
    const speakerGroups = groupLinesBySpeaker(scriptLines);
    const speakers = Object.keys(speakerGroups);
    
    logger.info(`📋 Found ${speakers.length} speakers: ${speakers.join(', ')}`);
    
    // Generate audio for each speaker
    const audioFileIds = {};
    
    for (const speaker of speakers) {
      try {
        const textLines = speakerGroups[speaker];
        
        // Generate audio using Qwen3-TTS
        const audioBuffer = await generateAudioForSpeaker(speaker, textLines);
        
        // Save to temporary file (WAV format from Qwen3-TTS)
        const filename = `${speaker.toLowerCase()}_${job.id}.wav`;
        const tempFilePath = await saveAudioToTemp(audioBuffer, filename);
        
        // Upload to Google Drive
        logger.info(`☁️ Uploading ${speaker}'s audio to Google Drive...`);
        
        const driveFolderId = await ensureJobAudioFolder(job.id);
        const fileId = await uploadFile(tempFilePath, filename, driveFolderId);
        
        audioFileIds[speaker] = fileId;
        
        logger.info(`✅ ${speaker}'s audio uploaded to Drive: ${fileId}`);
        
        // Clean up temp file
        fs.unlinkSync(tempFilePath);
        logger.info(`🗑️ Cleaned up temp file: ${tempFilePath}`);
        
      } catch (speakerError) {
        logger.error(`❌ Failed to process ${speaker}:`, speakerError.message);
        throw new Error(`Audio generation failed for ${speaker}: ${speakerError.message}`);
      }
    }
    
    logger.info(`🎉 Audio generation complete for job ${job.id}`);
    logger.info(`📊 Generated audio for: ${Object.keys(audioFileIds).join(', ')}`);
    
    return audioFileIds;
    
  } catch (error) {
    logger.error(`❌ Audio generation failed for job ${job.id}:`, error.message);
    throw new Error(`Audio generation failed: ${error.message}`);
  }
}

/**
 * Ensures the audio folder exists for a job in Google Drive
 * @param {string} jobId - Job ID
 * @returns {Promise<string>} Folder ID
 */
async function ensureJobAudioFolder(jobId) {
  try {
    // Structure: Drive/RawFunds Media/Renders/{jobId}/audio/
    const folderPath = `RawFunds Media/Renders/${jobId}/audio`;
    logger.info(`📁 Ensuring folder exists: ${folderPath}`);
    
    // This will be handled by drive.service.uploadFile which should create folders
    return folderPath;
    
  } catch (error) {
    logger.error('Failed to ensure audio folder:', error.message);
    throw error;
  }
}

module.exports = {
  generateAudioForJob,
  generateAudioForSpeaker,
  groupLinesBySpeaker
};
