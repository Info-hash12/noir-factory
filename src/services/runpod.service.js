const logger = require('../utils/logger');

class RunPodService {
  constructor() {
    this.apiKey = process.env.RUNPOD_API_KEY;
    this.workerUrl = process.env.RUNPOD_WORKER_URL;
    logger.info(`RunPod service initialized with worker: ${this.workerUrl}`);
  }

  async checkHealth() {
    try {
      if (!this.apiKey || !this.workerUrl) {
        return {
          success: false,
          status: 'error',
          error: 'Missing RunPod configuration. Check environment variables.'
        };
      }

      logger.info('Checking RunPod health at:', `${this.workerUrl}/health`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(`${this.workerUrl}/health`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`HTTP ${response.status}: ${body}`);
        }

        const data = await response.json();
        logger.info('RunPod health response:', data);

        const isHealthy = (data.workers?.ready > 0) || (data.workers?.idle > 0);

        return {
          success: isHealthy,
          status: isHealthy ? 'healthy' : 'unhealthy',
          data: data
        };
      } finally {
        clearTimeout(timeout);
      }

    } catch (error) {
      logger.error('RunPod health check failed:', error.message);
      return {
        success: false,
        status: 'error',
        error: error.message
      };
    }
  }

  async generateVideo(taskType, imageUrl, prompt, options = {}) {
    try {
      if (!this.apiKey || !this.workerUrl) {
        return {
          success: false,
          error: 'Missing RunPod configuration. Check environment variables.'
        };
      }

      const payload = {
        input: {
          task_type: taskType,
          image_url: imageUrl,
          prompt: prompt,
          ...options
        }
      };

      logger.info('Sending to RunPod:', payload);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const response = await fetch(`${this.workerUrl}/run`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`HTTP ${response.status}: ${body}`);
        }

        const data = await response.json();
        logger.info(`Job created with ID: ${data.id}`);

        return {
          success: true,
          jobId: data.id,
          status: data.status || 'pending'
        };
      } finally {
        clearTimeout(timeout);
      }

    } catch (error) {
      logger.error('RunPod video generation failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getJobStatus(jobId) {
    try {
      if (!this.apiKey || !this.workerUrl) {
        return {
          status: 'error',
          error: 'Missing RunPod configuration. Check environment variables.'
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(`${this.workerUrl}/status/${jobId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`HTTP ${response.status}: ${body}`);
        }

        const data = await response.json();
        return data;
      } finally {
        clearTimeout(timeout);
      }

    } catch (error) {
      logger.error('RunPod job status check failed:', error.message);
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

const runPodService = new RunPodService();
module.exports = runPodService;
