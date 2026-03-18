const logger = require('../utils/logger');

class TTSService {
  constructor() {
    this.serviceUrl = process.env.TTS_SERVICE_URL || 'http://localhost:5000';
    this.defaultVoice = process.env.TTS_VOICE || 'noir_male';
    this.timeout = parseInt(process.env.TTS_TIMEOUT || '120000');
    logger.info(`TTS service initialized (URL: ${this.serviceUrl}, default voice: ${this.defaultVoice})`);
  }

  async generateSpeech(text, voice, options = {}) {
    try {
      if (!this.serviceUrl) {
        return {
          success: false,
          error: 'Missing TTS service URL. Check TTS_SERVICE_URL environment variable.'
        };
      }

      const targetVoice = voice || this.defaultVoice;

      const payload = {
        text: text,
        voice: targetVoice,
        speed: options.speed || 1.0,
        pitch: options.pitch || 1.0,
        volume: options.volume || 1.0,
        format: options.format || 'wav'
      };

      logger.info('Generating speech with TTS:', {
        text: text.substring(0, 50) + '...',
        voice: targetVoice,
        length: text.length
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(`${this.serviceUrl}/synthesize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        logger.info(`TTS generation completed: ${data.jobId || data.audioUrl}`);

        return {
          success: true,
          jobId: data.jobId,
          audioUrl: data.audioUrl || data.url,
          duration: data.duration || null
        };
      } finally {
        clearTimeout(timeout);
      }

    } catch (error) {
      logger.error('TTS generation failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getAudioUrl(jobId) {
    try {
      if (!this.serviceUrl) {
        return {
          success: false,
          error: 'Missing TTS service URL'
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(`${this.serviceUrl}/audio/${jobId}`, {
          method: 'GET',
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();

        return {
          success: true,
          audioUrl: data.audioUrl || data.url,
          status: data.status || 'completed',
          duration: data.duration || null
        };
      } finally {
        clearTimeout(timeout);
      }

    } catch (error) {
      logger.error(`TTS audio URL fetch failed for ${jobId}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async checkHealth() {
    try {
      if (!this.serviceUrl) {
        return {
          success: false,
          status: 'error',
          error: 'Missing TTS service URL'
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${this.serviceUrl}/health`, {
          method: 'GET',
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        return {
          success: true,
          status: 'healthy',
          data: data
        };
      } finally {
        clearTimeout(timeout);
      }

    } catch (error) {
      logger.error('TTS health check failed:', error.message);
      return {
        success: false,
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

const ttsService = new TTSService();
module.exports = ttsService;
