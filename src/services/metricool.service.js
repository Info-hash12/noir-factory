const logger = require('../utils/logger');
const FormData = require('form-data');

class MetricoolService {
  constructor() {
    this.apiKey = process.env.METRICOOL_API_KEY;
    this.baseUrl = process.env.METRICOOL_BASE_URL || 'https://api.metricool.com/v1';
    this.defaultPlatform = process.env.METRICOOL_DEFAULT_PLATFORM || 'instagram';
    logger.info(`Metricool service initialized (default platform: ${this.defaultPlatform})`);
  }

  async uploadMedia(mediaUrl, title, description) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Missing Metricool API key. Check METRICOOL_API_KEY environment variable.'
        };
      }

      logger.info('Uploading media to Metricool:', mediaUrl);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const videoResponse = await fetch(mediaUrl, { signal: controller.signal });
        
        if (!videoResponse.ok) {
          throw new Error(`Failed to fetch video from URL: ${mediaUrl}`);
        }

        const videoBuffer = await videoResponse.arrayBuffer();

        const formData = new FormData();
        formData.append('file', Buffer.from(videoBuffer), {
          filename: 'video.mp4',
          contentType: 'video/mp4'
        });
        formData.append('title', title);
        formData.append('description', description || '');

        const response = await fetch(`${this.baseUrl}/media/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            ...formData.getHeaders()
          },
          body: formData,
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        logger.info(`Media uploaded to Metricool: ${data.mediaId || data.id}`);

        return {
          success: true,
          mediaId: data.mediaId || data.id,
          url: data.url
        };
      } finally {
        clearTimeout(timeout);
      }

    } catch (error) {
      logger.error('Metricool media upload failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createDraft(videoData, platform, schedule = null) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Missing Metricool API key'
        };
      }

      const targetPlatform = platform || this.defaultPlatform;

      const draftPayload = {
        platform: targetPlatform,
        media: {
          type: 'video',
          url: videoData.url || videoData.mediaUrl,
          mediaId: videoData.mediaId
        },
        content: {
          title: videoData.title || 'Noir Factory Video',
          description: videoData.description || '',
          caption: videoData.caption || videoData.description || '',
          tags: videoData.tags || []
        },
        status: 'draft'
      };

      if (schedule) {
        draftPayload.schedule = {
          publishAt: schedule.publishAt,
          timezone: schedule.timezone || 'America/New_York'
        };
      }

      logger.info('Creating Metricool draft:', JSON.stringify(draftPayload, null, 2));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(`${this.baseUrl}/posts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(draftPayload),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        logger.info(`Metricool draft created: ${data.draftId || data.id}`);

        return {
          success: true,
          draftId: data.draftId || data.id,
          status: 'draft',
          platform: targetPlatform
        };
      } finally {
        clearTimeout(timeout);
      }

    } catch (error) {
      logger.error('Metricool draft creation failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getDraftStatus(draftId) {
    try {
      if (!this.apiKey) {
        return {
          status: 'error',
          error: 'Missing Metricool API key'
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(`${this.baseUrl}/posts/${draftId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        logger.info(`Metricool draft ${draftId}: ${data.status}`);

        return {
          draftId: data.id,
          status: data.status,
          platform: data.platform,
          publishedAt: data.publishedAt || null,
          scheduledFor: data.scheduledFor || null
        };
      } finally {
        clearTimeout(timeout);
      }

    } catch (error) {
      logger.error(`Metricool draft status check failed for ${draftId}:`, error.message);
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  async publishDraft(draftId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Missing Metricool API key'
        };
      }

      logger.info(`Publishing Metricool draft: ${draftId}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(`${this.baseUrl}/posts/${draftId}/publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({ immediate: true }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        logger.info(`Metricool draft ${draftId} published successfully`);

        return {
          success: true,
          draftId: draftId,
          status: 'published',
          publishedAt: data.publishedAt || new Date().toISOString()
        };
      } finally {
        clearTimeout(timeout);
      }

    } catch (error) {
      logger.error(`Metricool draft publish failed for ${draftId}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

const metricoolService = new MetricoolService();
module.exports = metricoolService;
