/**
 * Audio Generation Service
 * Generates AI voice audio using ElevenLabs Text-to-Speech API
 */

const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Generates audio from script text using ElevenLabs API
 * @param {string} script - The script text to convert to speech
 * @param {string} voiceId - ElevenLabs voice ID (defaults to env or Adam voice)
 * @param {Object} options - Additional options (stability, similarity_boost, etc.)
 * @returns {Promise<Object>} Object with audioUrl and estimated duration
 */
async function generateAudio(script, voiceId = null, options = {}) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    // Use provided voiceId or default to Adam (ElevenLabs default)
    const finalVoiceId = voiceId || process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';

    logger.info(`Generating audio with voice ${finalVoiceId}`);

    // Check if script has multiple characters (formatted as "CHARACTER: dialogue")
    const hasMultipleCharacters = /^[A-Z_]+\s*:/.test(script);

    if (hasMultipleCharacters) {
      logger.info('Multi-character script detected, generating separate audio clips');
      return await generateMultiCharacterAudio(script, options);
    }

    // Single voice generation
    const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${finalVoiceId}`;

    const voiceSettings = {
      stability: options.stability || 0.5,
      similarity_boost: options.similarity_boost || 0.75,
      style: options.style || 0,
      use_speaker_boost: options.use_speaker_boost || true
    };

    logger.info(`Calling ElevenLabs API for ${script.length} characters of text`);

    const response = await axios.post(
      endpoint,
      {
        text: script,
        model_id: options.model_id || 'eleven_monolingual_v1',
        voice_settings: voiceSettings
      },
      {
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer',
        timeout: 120000 // 2 minute timeout for audio generation
      }
    );

    // ElevenLabs returns audio data directly
    // In production, you'd save this to cloud storage (S3, etc.)
    // For now, we'll return a placeholder URL
    // TODO: Implement cloud storage upload
    
    const audioBuffer = response.data;
    const audioSizeKB = (audioBuffer.length / 1024).toFixed(2);
    
    // Estimate duration based on text length (rough: ~150 words per minute)
    const wordCount = script.split(/\s+/).length;
    const estimatedDuration = Math.ceil((wordCount / 150) * 60);

    logger.info(`Audio generated successfully: ${audioSizeKB}KB, estimated ${estimatedDuration}s`);

    // TODO: Upload audio buffer to cloud storage and return real URL
    const audioUrl = `https://placeholder-storage.com/audio-${Date.now()}.mp3`;

    return {
      audioUrl: audioUrl,
      duration: estimatedDuration,
      sizeKB: parseFloat(audioSizeKB),
      voiceId: finalVoiceId
    };

  } catch (error) {
    logger.error('Audio generation failed:', {
      error: error.message,
      response: error.response?.data
    });

    throw new Error(`Audio generation failed: ${error.message}`);
  }
}

/**
 * Generates audio for multi-character scripts with dialogue
 * @param {string} script - Script with character labels (e.g., "CHARACTER_1: Hello")
 * @param {Object} options - Voice generation options
 * @returns {Promise<Object>} Object with audio clips and metadata
 */
async function generateMultiCharacterAudio(script, options = {}) {
  try {
    logger.info('Processing multi-character audio generation');

    // Parse script into character lines
    const lines = script.split('\n').filter(line => line.trim());
    const characterLines = [];

    for (const line of lines) {
      const match = line.match(/^([A-Z_]+)\s*:\s*(.+)$/);
      if (match) {
        characterLines.push({
          character: match[1],
          text: match[2].trim()
        });
      }
    }

    if (characterLines.length === 0) {
      throw new Error('No character dialogue found in script');
    }

    logger.info(`Found ${characterLines.length} dialogue lines across characters`);

    // Get unique characters
    const characters = [...new Set(characterLines.map(l => l.character))];
    
    // Assign different voices to each character
    const characterVoices = assignCharacterVoices(characters);

    // Generate audio for each line
    const audioClips = [];
    let totalDuration = 0;

    for (const line of characterLines) {
      const voiceId = characterVoices[line.character];
      
      logger.info(`Generating audio for ${line.character}: "${line.text.substring(0, 50)}..."`);
      
      const audioResult = await generateAudio(line.text, voiceId, options);
      
      audioClips.push({
        character: line.character,
        text: line.text,
        audioUrl: audioResult.audioUrl,
        duration: audioResult.duration,
        voiceId: voiceId
      });

      totalDuration += audioResult.duration;

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    logger.info(`Multi-character audio generation complete: ${audioClips.length} clips, ${totalDuration}s total`);

    return {
      audioUrl: audioClips[0].audioUrl, // Return first clip as primary
      duration: totalDuration,
      multiCharacter: true,
      clips: audioClips,
      characterCount: characters.length
    };

  } catch (error) {
    logger.error('Multi-character audio generation failed:', error.message);
    throw error;
  }
}

/**
 * Assigns different ElevenLabs voice IDs to characters
 * @param {Array} characters - Array of character names
 * @returns {Object} Map of character names to voice IDs
 */
function assignCharacterVoices(characters) {
  // ElevenLabs pre-made voices (free tier voices)
  const availableVoices = [
    'pNInz6obpgDQGcFmaJgB', // Adam - Deep and resonant
    '21m00Tcm4TlvDq8ikWAM', // Rachel - Calm and composed
    'EXAVITQu4vr4xnSDxMaL', // Bella - Soft and warm
    'ErXwobaYiN019PkySvjV', // Antoni - Well-rounded and soothing
    'MF3mGyEYCl7XYWbV9V6O', // Elli - Energetic and expressive
    'TxGEqnHWrfWFTfGW9XjX', // Josh - Deep and resonant
    'VR6AewLTigWG4xSOukaG', // Arnold - Crisp and authoritative
    'pqHfZKP75CvOlQylNhV4'  // Bill - Strong and confident
  ];

  const voiceMap = {};
  
  characters.forEach((character, index) => {
    // Assign voices cyclically if we have more characters than voices
    voiceMap[character] = availableVoices[index % availableVoices.length];
  });

  logger.info('Character voice assignments:', voiceMap);

  return voiceMap;
}

/**
 * Gets list of available ElevenLabs voices
 * @returns {Promise<Array>} Array of available voices
 */
async function getAvailableVoices() {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': apiKey
      }
    });

    const voices = response.data.voices || [];
    
    logger.info(`Retrieved ${voices.length} available voices from ElevenLabs`);

    return voices;

  } catch (error) {
    logger.error('Failed to get available voices:', error.message);
    throw error;
  }
}

module.exports = {
  generateAudio,
  generateMultiCharacterAudio,
  getAvailableVoices
};
