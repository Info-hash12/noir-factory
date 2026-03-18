const logger = require('../utils/logger');

class ShotstackService {
  constructor() {
    this.apiKey = process.env.SHOTSTACK_API_KEY;
    this.env = process.env.SHOTSTACK_ENV || 'stage';
    this.baseUrl = `https://api.shotstack.io/${this.env}`;
    this.callbackUrl = process.env.SHOTSTACK_CALLBACK_URL;
    logger.info(`Shotstack service initialized (${this.env} environment)`);
  }

  async renderVideo(editConfig) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Missing Shotstack API key. Check SHOTSTACK_API_KEY environment variable.'
        };
      }

      logger.info('Submitting render to Shotstack:', JSON.stringify(editConfig, null, 2));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(`${this.baseUrl}/render`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey
          },
          body: JSON.stringify(editConfig),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        logger.info(`Shotstack render submitted: ${data.response.id}`);

        return {
          success: true,
          renderId: data.response.id,
          status: 'queued',
          message: data.response.message
        };
      } finally {
        clearTimeout(timeout);
      }

    } catch (error) {
      logger.error('Shotstack render submission failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getRenderStatus(renderId) {
    try {
      if (!this.apiKey) {
        return {
          status: 'error',
          error: 'Missing Shotstack API key'
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(`${this.baseUrl}/render/${renderId}`, {
          method: 'GET',
          headers: {
            'x-api-key': this.apiKey
          },
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        const renderData = data.response;

        logger.info(`Shotstack render ${renderId}: ${renderData.status}`);

        return {
          renderId: renderData.id,
          status: renderData.status,
          url: renderData.url || null,
          error: renderData.error || null,
          progress: renderData.data?.progress || 0
        };
      } finally {
        clearTimeout(timeout);
      }

    } catch (error) {
      logger.error(`Shotstack status check failed for ${renderId}:`, error.message);
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  createNoirEdit(baseVideoUrl, audioUrl, captions, options = {}) {
    const {
      duration = 15,
      width = 1080,
      height = 1920,
      fps = 30,
      quality = 'high'
    } = options;

    const timeline = {
      soundtrack: {
        src: audioUrl,
        effect: 'fadeInFadeOut',
        volume: 0.8
      },
      tracks: [
        {
          clips: [
            {
              asset: {
                type: 'video',
                src: baseVideoUrl,
                volume: 0.5
              },
              start: 0,
              length: duration,
              fit: 'cover',
              scale: 1.0,
              effect: 'zoomIn',
              filter: 'greyscale'
            }
          ]
        },
        {
          clips: [
            {
              asset: {
                type: 'html',
                html: '<p style="font-family: Courier; font-size: 48px; color: white; text-shadow: 2px 2px 4px black;">Noir Factory</p>',
                css: 'p { text-align: center; }'
              },
              start: 0,
              length: 2,
              position: 'bottom',
              offset: {
                x: 0,
                y: -0.1
              },
              transition: {
                in: 'fade',
                out: 'fade'
              }
            }
          ]
        }
      ]
    };

    if (captions && captions.length > 0) {
      const captionTrack = {
        clips: captions.map(caption => ({
          asset: {
            type: 'html',
            html: `<p style="font-family: Courier; font-size: 36px; color: white; background: rgba(0,0,0,0.7); padding: 10px;">${caption.text}</p>`,
            css: 'p { text-align: center; }'
          },
          start: caption.start,
          length: caption.duration,
          position: 'bottom',
          offset: {
            x: 0,
            y: -0.3
          }
        }))
      };
      timeline.tracks.push(captionTrack);
    }

    const edit = {
      timeline: timeline,
      output: {
        format: 'mp4',
        resolution: `${height}p`,
        aspectRatio: `${width}:${height}`,
        size: {
          width: width,
          height: height
        },
        fps: fps,
        quality: quality
      }
    };

    if (this.callbackUrl) {
      edit.callback = this.callbackUrl;
    }

    return edit;
  }
}

const shotstackService = new ShotstackService();
module.exports = shotstackService;
