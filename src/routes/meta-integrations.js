/**
 * Meta Business Suite Integration Routes
 * OAuth flow, token management, and direct posting
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireCompanyContext } = require('../middleware/companyContext');
const logger = require('../utils/logger');
const metaService = require('../services/meta.service');
const { getSupabaseAdmin } = require('../db/supabase');

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const REDIRECT_URI = process.env.META_REDIRECT_URI || 'http://localhost:8080/api/integrations/meta/callback';

/**
 * POST /api/integrations/meta/connect
 * Start OAuth flow - returns redirect URL
 */
router.post('/connect', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    if (!META_APP_ID) {
      return res.status(400).json({
        success: false,
        error: 'META_APP_ID not configured'
      });
    }

    const { platform = 'facebook' } = req.body;

    // Generate authorization URL
    const state = Buffer.from(
      JSON.stringify({
        company_id: req.company.id,
        platform,
        timestamp: Date.now()
      })
    ).toString('base64');

    const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
    authUrl.searchParams.append('client_id', META_APP_ID);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('scope', [
      'pages_manage_posts',
      'pages_read_engagement',
      'instagram_basic',
      'instagram_content_publish',
      'threads_basic',
      'threads_content_publish'
    ].join(','));
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('response_type', 'code');

    res.json({
      success: true,
      auth_url: authUrl.toString(),
      platform
    });
  } catch (error) {
    logger.error('Error starting OAuth flow:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/integrations/meta/callback
 * Handle OAuth callback
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.status(400).json({
        success: false,
        error: `OAuth error: ${oauthError}`
      });
    }

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: 'Missing code or state parameter'
      });
    }

    // Decode state
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid state parameter'
      });
    }

    const { company_id, platform } = stateData;

    // Exchange code for token
    const axios = require('axios');
    const tokenResponse = await axios.post('https://graph.facebook.com/v18.0/oauth/access_token', {
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      redirect_uri: REDIRECT_URI,
      code
    });

    const { access_token, expires_in } = tokenResponse.data;

    if (!access_token) {
      throw new Error('No access token in response');
    }

    // Get user's pages/accounts
    const pagesResponse = await metaService.getConnectedPages(access_token);

    if (!pagesResponse || pagesResponse.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No pages/accounts found. Please ensure you have permission to manage pages.'
      });
    }

    // Store first page's token
    const page = pagesResponse[0];
    await metaService.storeIntegrationToken(company_id, platform, {
      access_token: page.access_token || access_token,
      expires_in,
      page_id: page.id,
      page_name: page.name,
      metadata: {
        all_pages: pagesResponse
      }
    });

    logger.info(`Successfully integrated ${platform} for company ${company_id}`);

    // Redirect to success page or return JSON
    const successUrl = new URL('http://localhost:3000/integrations/success');
    successUrl.searchParams.append('platform', platform);
    successUrl.searchParams.append('page_name', page.name);

    res.redirect(successUrl.toString());
  } catch (error) {
    logger.error('Error handling OAuth callback:', error);
    const errorUrl = new URL('http://localhost:3000/integrations/error');
    errorUrl.searchParams.append('error', error.message);
    res.redirect(errorUrl.toString());
  }
});

/**
 * POST /api/integrations/meta/publish
 * Publish a ready content job directly to Meta
 * Body: { job_id, platform, media_id?, caption? }
 */
router.post('/publish', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { job_id, platform } = req.body;

    if (!job_id || !platform) {
      return res.status(400).json({
        success: false,
        error: 'job_id and platform required'
      });
    }

    const supabase = getSupabaseAdmin();

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('content_jobs')
      .select('*')
      .eq('id', job_id)
      .eq('company_id', req.company.id)
      .single();

    if (jobError || !job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    // Get access token
    const { data: integration, error: integError } = await supabase
      .from('company_integrations')
      .select('*')
      .eq('company_id', req.company.id)
      .eq('platform', platform)
      .eq('is_active', true)
      .single();

    if (integError || !integration) {
      return res.status(400).json({
        success: false,
        error: `No active ${platform} integration found`
      });
    }

    let result;

    if (platform === 'facebook') {
      result = await metaService.publishToFacebook(integration.access_token, {
        message: job.content_text,
        imageUrl: job.media_url,
        link: job.link_url,
        title: job.title,
        description: job.description
      });
    } else if (platform === 'instagram') {
      result = await metaService.publishToInstagram(
        integration.access_token,
        integration.page_id, // IG User ID
        {
          imageUrl: job.media_url,
          caption: job.content_text,
          alt_text: job.alt_text
        }
      );
    } else if (platform === 'threads') {
      result = await metaService.publishToThreads(
        integration.access_token,
        integration.page_id, // Threads User ID
        {
          text: job.content_text,
          imageUrl: job.media_url,
          alt_text: job.alt_text
        }
      );
    } else {
      return res.status(400).json({
        success: false,
        error: `Unsupported platform: ${platform}`
      });
    }

    // Update job status
    await supabase
      .from('content_jobs')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        published_url: result.permalink || result.thread_id || result.media_id,
        external_post_id: result.post_id || result.media_id || result.thread_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', job_id);

    res.json({
      success: true,
      job_id,
      platform,
      result
    });
  } catch (error) {
    logger.error('Error publishing to Meta:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/integrations/meta/pages
 * List connected Facebook pages
 */
router.get('/pages', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();

    const { data: integration, error } = await supabase
      .from('company_integrations')
      .select('*')
      .eq('company_id', req.company.id)
      .eq('platform', 'facebook')
      .eq('is_active', true)
      .single();

    if (error || !integration) {
      return res.status(400).json({
        success: false,
        error: 'No active Facebook integration found'
      });
    }

    const pages = await metaService.getConnectedPages(integration.access_token);

    res.json({
      success: true,
      pages: pages || []
    });
  } catch (error) {
    logger.error('Error fetching pages:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/integrations/meta/status
 * Check token validity and integration status
 */
router.get('/status', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { platform = 'facebook' } = req.query;

    const supabase = getSupabaseAdmin();

    const { data: integration, error } = await supabase
      .from('company_integrations')
      .select('*')
      .eq('company_id', req.company.id)
      .eq('platform', platform)
      .eq('is_active', true)
      .single();

    if (error || !integration) {
      return res.json({
        success: true,
        connected: false,
        platform
      });
    }

    // Check if token is expired
    const isExpired = integration.expires_at
      ? new Date(integration.expires_at) < new Date()
      : false;

    // Try to validate token
    let isValid = false;
    try {
      const tokenInfo = await metaService.validateToken(integration.access_token);
      isValid = tokenInfo.is_valid;
    } catch (error) {
      logger.warn('Token validation failed:', error.message);
    }

    res.json({
      success: true,
      connected: true,
      platform,
      page_name: integration.page_name,
      page_id: integration.page_id,
      is_valid: isValid,
      is_expired: isExpired,
      expires_at: integration.expires_at,
      updated_at: integration.updated_at
    });
  } catch (error) {
    logger.error('Error checking integration status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/integrations/meta/disconnect
 * Disconnect/deactivate an integration
 */
router.post('/disconnect', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { platform = 'facebook' } = req.body;

    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('company_integrations')
      .update({ is_active: false })
      .eq('company_id', req.company.id)
      .eq('platform', platform);

    if (error) throw error;

    logger.info(`Disconnected ${platform} integration for company ${req.company.id}`);

    res.json({
      success: true,
      message: `${platform} integration disconnected`,
      platform
    });
  } catch (error) {
    logger.error('Error disconnecting integration:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/integrations/meta/first-comment
 * Post first comment on a published post
 * Body: { platform, post_id, comment_text }
 */
router.post('/first-comment', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { platform, post_id, comment_text } = req.body;

    if (!platform || !post_id || !comment_text) {
      return res.status(400).json({
        success: false,
        error: 'platform, post_id, and comment_text required'
      });
    }

    const supabase = getSupabaseAdmin();

    const { data: integration, error } = await supabase
      .from('company_integrations')
      .select('*')
      .eq('company_id', req.company.id)
      .eq('platform', platform)
      .eq('is_active', true)
      .single();

    if (error || !integration) {
      return res.status(400).json({
        success: false,
        error: `No active ${platform} integration found`
      });
    }

    const result = await metaService.postFirstComment(
      integration.access_token,
      post_id,
      comment_text
    );

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('Error posting first comment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
