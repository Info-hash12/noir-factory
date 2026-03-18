/**
 * Qwen3-TTS Service
 * Interfaces with local Qwen3-TTS Docker container for voice synthesis
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const yaml = require('js-yaml');
const logger = require('../../utils/logger');

// Load configuration
const configPath = path.join(__dirname, '../../../config/defaults.yaml');
const config = yaml.load(fs.readFileSync(configPath, 'utf8'));

/**
 * Gets the reference audio path for a character
 * @param {string} characterId - Character ID (e.g., "bianca", "larry", "malik")
 * @returns {string} Path to reference audio file
 */
function getReferenceAudioPath(characterId) {
  const characterConfig = config.characters[characterId.toLowerCase()];
  
  if (!characterConfig) {
    throw new Error(`Character "${characterId}" not found in configuration`);
  }
  
  const profilePath = path.join(__dirname, '../../../', characterConfig.profile_path);
  const audioPath = path.join(profilePath, characterConfig.reference_audio);
  
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Reference audio not found for ${characterId}: ${audioPath}`);
  }
  
  return audioPath;
}

/**
 * Synthesizes speech using Qwen3-TTS
 * @param {string} text - Text to synthesize
 * @param {string} characterId - Character ID for voice profile
 * @param {number} retries - Number of retries remaining
 * @returns {Promise<Buffer>} Audio buffer (WAV format)
 */
async function synthesizeSpeech(text, characterId, retries = 3) {
  try {
    const ttsServiceUrl = process.env.TTS_SERVICE_URL || config.tts.service_url;
    const timeout = parseInt(process.env.TTS_TIMEOUT) || config.tts.timeout;
    
    logger.info(`🎙️ Synthesizing speech for ${characterId} using Qwen3-TTS`);
    logger.info(`📝 Text: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
    
    // Get reference audio for character
    const referenceAudioPath = getReferenceAudioPath(characterId);
    logger.info(`📁 Using reference audio: ${referenceAudioPath}`);
    
    // Get voice settings from config
    const characterConfig = config.characters[characterId.toLowerCase()];
    const voiceSettings = characterConfig.voice_settings || {};
    
    // Prepare form data
    const formData = new FormData();
    formData.append('text', text);
    formData.append('reference_audio', fs.createReadStream(referenceAudioPath));
    formData.append('speed', voiceSettings.speed || 1.0);
    formData.append('temperature', voiceSettings.temperature || 0.7);
    formData.append('sample_rate', config.tts.sample_rate);
    formData.append('format', config.tts.format);
    
    // Call Qwen3-TTS API
    const response = await axios.post(
      `${ttsServiceUrl}/synthesize`,
      formData,
      {
        headers: {
          ...formData.getHeaders()
        },
        responseType: 'arraybuffer',
        timeout: timeout,
        maxContentLength: 50 * 1024 * 1024, // 50MB max
        maxBodyLength: 50 * 1024 * 1024
      }
    );
    
    const audioBuffer = Buffer.from(response.data);
    
    logger.info(`✅ Speech synthesized for ${characterId}: ${audioBuffer.length} bytes`);
    
    return audioBuffer;
    
  } catch (error) {
    logger.error(`❌ TTS synthesis failed for ${characterId}:`, error.message);
    
    // Retry logic for transient errors
    if (retries > 0 && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED')) {
      const backoffDelay = (4 - retries) * config.processing.retry_delay_base;
      logger.warn(`⏳ Retrying TTS in ${backoffDelay}ms... (${retries - 1} retries left)`);
      
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      return synthesizeSpeech(text, characterId, retries - 1);
    }
    
    throw error;
  }
}

/**
 * Checks if TTS service is available
 * @returns {Promise<boolean>} True if service is reachable
 */
async function checkServiceHealth() {
  try {
    const ttsServiceUrl = process.env.TTS_SERVICE_URL || config.tts.service_url;
    
    const response = await axios.get(`${ttsServiceUrl}/health`, {
      timeout: 5000
    });
    
    return response.status === 200;
    
  } catch (error) {
    logger.warn('TTS service health check failed:', error.message);
    return false;
  }
}

/**
 * Gets available characters from configuration
 * @returns {Array<string>} List of character IDs
 */
function getAvailableCharacters() {
  return Object.keys(config.characters);
}

module.exports = {
  synthesizeSpeech,
  checkServiceHealth,
  getAvailableCharacters,
  getReferenceAudioPath
};
