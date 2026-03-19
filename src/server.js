/**
 * Noir Factory - Main Server
 * Autonomous pipeline for Reddit RSS monitoring, screenshot capture, and AI content auditing
 */

require('dotenv').config();
const express = require('express');
const { initializeDatabase, testConnection } = require('./db/local-adapter');
const { startRSSMonitor } = require('./jobs/rssMonitor.v2');
const apiRoutes = require('./routes/api');
const reviewRoutes = require('./routes/review');
const dashboardRoutes = require('./routes/dashboard');
const cronRoutes = require('./routes/cron');
const pubsubRoutes = require('./routes/pubsub');
const runpodRoutes = require('./routes/runpod');
const productionRoutes = require('./routes/production');
const authRoutes = require('./routes/auth');
const companiesRoutes = require('./routes/companies');
const feedsRoutes = require('./routes/feeds');
const contentItemsRoutes = require('./routes/content-items');
const contentJobsRoutes = require('./routes/content-jobs');
const engagementRoutes = require('./routes/engagement');
const engagementBotRoutes = require('./routes/engagement-bot');
const schedulerRoutes = require('./routes/scheduler');
const metaIntegrationsRoutes = require('./routes/meta-integrations');
const socialConnectRoutes = require('./routes/social-connect');
const trendingRoutes = require('./routes/trending');
const analyticsRoutes = require('./routes/analytics');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 8080;

// Parse CORS_ORIGINS from environment (comma-separated)
const corsOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()) 
  : [];

// Default allowed origins
const defaultOrigins = [
  'https://noir-factory-production-control-230432435181.us-west1.run.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  'https://app.noir-factory.com'
];

const allowedOrigins = [...new Set([...defaultOrigins, ...corsOrigins])];

logger.info(`CORS enabled for origins: ${allowedOrigins.join(', ')}`);

// Robust CORS Middleware - Must be FIRST
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Check if origin is allowed
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Allow requests with no origin (like curl, Postman, server-to-server)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  // Set other CORS headers
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  
  // Echo back requested headers for maximum compatibility
  const requestHeaders = req.headers['access-control-request-headers'];
  if (requestHeaders) {
    res.setHeader('Access-Control-Allow-Headers', requestHeaders);
  } else {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check endpoint (must be before other routes)
app.get('/healthz', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'noir-factory-backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    node: process.version
  });
});

// API Routes - ORDER MATTERS! More specific routes first
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/runpod', runpodRoutes); // RunPod GPU worker endpoints
app.use('/api/production', productionRoutes); // Video production pipeline endpoints
app.use('/cron', cronRoutes); // For Cloud Scheduler (HTTP)
app.use('/pubsub', pubsubRoutes); // For Cloud Scheduler (Pub/Sub)
app.use('/review', reviewRoutes);
app.use('/api/pipeline', require('./routes/pipeline'));   // New pipeline routes
app.use('/api/avatars', require('./routes/avatars'));     // Avatar management

// Multi-tenant authentication routes (no company context needed)
app.use('/api/auth', authRoutes);

// Multi-tenant routes (company-scoped)
app.use('/api/companies', companiesRoutes);
app.use('/api/feeds', feedsRoutes);
app.use('/api/content-items', contentItemsRoutes);
app.use('/api/content-jobs', contentJobsRoutes);
app.use('/api/engagement', engagementRoutes);
app.use('/api/engagement', engagementBotRoutes); // Engagement bot routes (shares prefix)
app.use('/api/schedule', schedulerRoutes); // Smart scheduling
app.use('/api/integrations/meta', metaIntegrationsRoutes); // Meta Business Suite
app.use('/api/connect', socialConnectRoutes); // Social media OAuth
app.use('/api/trending', trendingRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use('/api', apiRoutes); // Mount general API routes LAST to avoid conflicts

// Serve static dashboard frontend
const path = require('path');
app.use(express.static(path.join(__dirname, '../public')));

// Root → serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// SPA fallback - serve index.html for non-API routes (React Router)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/cron') || req.path.startsWith('/pubsub') || req.path.startsWith('/review')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 404 handler for API routes (must be before error handler)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Crash-safe error handling middleware (MUST BE LAST)
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Ensure CORS headers are set even on errors
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Send error response
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err.details 
    })
  });
});

/**
 * Initialize the application (runs after server starts)
 */
async function initializeApp() {
  try {
    logger.info('⏳ Initializing Noir Factory services...');

    // Start Engagement Bot if configured
    try {
      const { startEngagementBot } = require('./jobs/engagementBot');
      const botInterval = process.env.ENGAGEMENT_BOT_INTERVAL || '*/5 * * * *'; // Every 5 minutes by default
      startEngagementBot(botInterval);
      logger.info('✅ Engagement bot started');
    } catch (botError) {
      logger.warn('⚠️  Engagement bot not started:', botError.message);
    }

    // Start Telegram bot if configured
    try {
      const { startBot } = require('./services/telegram-bot');
      startBot();
      logger.info('✅ Telegram bot started');
    } catch (botError) {
      logger.warn('⚠️  Telegram bot not started:', botError.message);
    }

    // Validate required environment variables (non-blocking)
    const requiredEnvVars = [
      'AIRTABLE_TOKEN',
      'HCTI_USER_ID',
      'HCTI_API_KEY',
      'OPENROUTER_API_KEY',
      'SEGMIND_API_KEY',
      'PUBLER_API_KEY'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      logger.warn(`⚠️  Missing environment variables: ${missingVars.join(', ')}`);
      logger.warn('Some features may not work correctly');
    }

    // Initialize database connection (non-blocking)
    try {
      logger.info('📊 Connecting to database...');
      initializeDatabase();
      
      // Test database connection
      const dbConnected = await testConnection();
      if (dbConnected) {
        logger.info('✅ Database connected');
      } else {
        logger.warn('⚠️  Database connection test failed, but continuing...');
      }
    } catch (dbError) {
      logger.error('❌ Database initialization error:', dbError.message);
      logger.warn('Continuing without database...');
    }

    // Start RSS monitor (non-blocking)
    try {
      if (process.env.REDDIT_RSS_URL) {
        logger.info('📡 Starting RSS monitor...');
        startRSSMonitor();
        logger.info('✅ RSS monitor started');
      } else {
        logger.warn('⚠️  REDDIT_RSS_URL not set, skipping RSS monitor');
      }
    } catch (rssError) {
      logger.error('❌ RSS monitor error:', rssError.message);
      logger.warn('Continuing without RSS monitor...');
    }

    // Start RSS Feed Fetcher (non-blocking)
    try {
      const { startFeedFetcher } = require('./jobs/feedFetcher');
      startFeedFetcher();
      logger.info('✅ RSS feed fetcher started');
    } catch (err) {
      logger.warn('⚠️ RSS feed fetcher not started:', err.message);
    }

    // Start Viral Content Finder (non-blocking)
    try {
      const { startViralFinder } = require('./jobs/viralFinder');
      startViralFinder();
      logger.info('✅ Viral content finder started');
    } catch (err) {
      logger.warn('⚠️ Viral content finder not started:', err.message);
    }

    logger.info('✅ Noir Factory initialization complete');

  } catch (error) {
    logger.error('❌ Initialization error:', error.message);
    logger.warn('Server running with limited functionality');
  }
}

/**
 * Start the server
 */
async function startServer() {
  // Start listening IMMEDIATELY (Cloud Run requirement)
  const server = app.listen(PORT, () => {
    logger.info(`🚀 Noir Factory server running on port ${PORT}`);
    logger.info(`📡 Health check: http://localhost:${PORT}/healthz`);
    
    // Initialize services AFTER server is listening
    setImmediate(() => {
      initializeApp().catch(err => {
        logger.error('Post-startup initialization failed:', err.message);
      });
    });
  });

  // Graceful shutdown
  server.on('error', (error) => {
    logger.error('Server error:', error.message);
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${PORT} is already in use`);
      process.exit(1);
    }
  });
}

// ─── Graceful Shutdown ──────────────────────────────────────────────────────
// Track in-flight pipeline jobs so we don't kill them mid-process
const activeJobs = new Set();

function trackJob(jobId) { activeJobs.add(jobId); }
function untrackJob(jobId) { activeJobs.delete(jobId); }

async function gracefulShutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully...`);

  if (activeJobs.size > 0) {
    logger.info(`⏳ Waiting for ${activeJobs.size} in-flight pipeline job(s) to finish: ${[...activeJobs].join(', ')}`);
    const maxWait = 15 * 60 * 1000; // 15 minutes max wait
    const start = Date.now();
    while (activeJobs.size > 0 && (Date.now() - start) < maxWait) {
      await new Promise(r => setTimeout(r, 2000));
    }
    if (activeJobs.size > 0) {
      logger.warn(`⚠️ Force-exiting with ${activeJobs.size} jobs still running after 15m timeout`);
    } else {
      logger.info('✅ All pipeline jobs completed — exiting cleanly');
    }
  }

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit process - just log it
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // In production, we might want to exit and let the orchestrator restart
  // For now, just log it
});

// Export job tracking for pipeline to use
module.exports = { trackJob, untrackJob };

// Start the server
startServer();
