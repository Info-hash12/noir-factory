/**
 * Social Media OAuth Connect Routes
 * GET /api/connect/:platform - Get OAuth authorization URL
 * GET /api/connect/:platform/callback - Handle OAuth callback
 * GET /api/connect/status - Get connection status for all platforms
 * DELETE /api/connect/:platform - Disconnect a platform
 */

const express = require('express');
const oauthService = require('../services/social-oauth.service');
const { getSupabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');

const router = express.Router();

const PLATFORMS = ['instagram', 'facebook', 'threads', 'tiktok', 'twitter', 'linkedin'];

/**
 * GET /api/connect/status — MUST be before /:platform to avoid matching "status" as a platform
 */
router.get('/status', async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || 'default-company';
    const platforms = {};

    // Check each platform
    for (const platform of PLATFORMS) {
      const configured = oauthService.isPlatformConfigured(platform);
      if (!configured) {
        const envName = {
          instagram: 'META_APP_ID', facebook: 'META_APP_ID', threads: 'META_APP_ID',
          tiktok: 'TIKTOK_CLIENT_KEY', twitter: 'TWITTER_CLIENT_ID', linkedin: 'LINKEDIN_CLIENT_ID'
        }[platform] || `${platform.toUpperCase()}_CLIENT_ID`;
        platforms[platform] = { connected: false, reason: `Set ${envName} in environment to connect` };
        continue;
      }

      // Check Supabase for stored integration
      try {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase.from('company_integrations')
          .select('*')
          .eq('company_id', companyId)
          .eq('platform', platform)
          .eq('status', 'active')
          .limit(1);

        if (data && data.length > 0) {
          platforms[platform] = {
            connected: true,
            account_name: data[0].account_name || platform,
            expires_at: data[0].token_expires_at
          };
        } else {
          platforms[platform] = { connected: false, reason: 'Not connected — tap Connect to authorize' };
        }
      } catch (dbErr) {
        platforms[platform] = { connected: false, reason: 'Not connected — tap Connect to authorize' };
      }
    }

    res.json({ success: true, company_id: companyId, platforms });
  } catch (error) {
    logger.error('Error in /connect/status:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/connect/:platform
 * Returns the OAuth authorization URL for the requested platform
 */
router.get('/:platform', (req, res) => {
  try {
    const { platform } = req.params;
    const companyId = req.headers['x-company-id'] || 'default-company';

    // Validate platform
    if (!PLATFORMS.includes(platform)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid platform. Valid platforms: ' + PLATFORMS.join(', '),
      });
    }

    // Check if platform is configured
    if (!oauthService.isPlatformConfigured(platform)) {
      return res.status(400).json({
        success: false,
        error: `${platform.toUpperCase()}_CLIENT_ID not configured in environment`,
        reason: 'missing_credentials',
      });
    }

    // Build callback URL
    const callbackUrl = `${process.env.APP_URL || 'https://noir-factory.onrender.com'}/api/connect/${platform}/callback`;

    // Get authorization URL
    const authUrl = oauthService.getAuthUrl(platform, companyId, callbackUrl);

    if (!authUrl) {
      return res.status(400).json({
        success: false,
        error: `Failed to generate authorization URL for ${platform}`,
      });
    }

    res.json({
      success: true,
      authUrl,
      platform,
    });
  } catch (error) {
    logger.error('Error in /connect/:platform:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/connect/:platform/callback
 * Handle OAuth provider callback
 */
router.get('/:platform/callback', async (req, res) => {
  try {
    const { platform } = req.params;
    const { code, state: companyId, error: oauthError, error_description } = req.query;

    // Handle OAuth errors
    if (oauthError) {
      logger.warn(`OAuth error from ${platform}: ${oauthError} - ${error_description}`);
      return res.status(400).json({
        success: false,
        error: oauthError,
        description: error_description,
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'No authorization code received',
      });
    }

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'No company ID in state parameter',
      });
    }

    // Exchange code for access token
    const tokenData = await oauthService.handleCallback(platform, code, companyId);

    // Store in Supabase
    try {
      const supabase = getSupabaseAdmin();

      // Delete existing integration for this company+platform
      await supabase.from('company_integrations')
        .delete()
        .eq('company_id', companyId)
        .eq('platform', platform);

      // Insert new integration
      const { error: insertError } = await supabase.from('company_integrations').insert({
        company_id: companyId,
        platform: platform,
        integration_type: 'oauth',
        account_name: tokenData.account_name || platform,
        account_id: tokenData.account_id || '',
        credentials: { access_token: tokenData.access_token, refresh_token: tokenData.refresh_token },
        status: 'active',
        token_expires_at: tokenData.expires_at || null,
        last_used_at: new Date().toISOString()
      });

      if (insertError) {
        logger.error('Failed to store integration:', insertError.message);
      } else {
        logger.info(`Stored integration for ${platform} / ${companyId}`);
      }
    } catch (dbError) {
      logger.error('Failed to store integration:', dbError.message);
    }

    // Return success and redirect to bot page
    res.json({
      success: true,
      message: `Successfully connected ${platform}!`,
      platform,
      account_name: tokenData.account_name,
      redirect: '/bot', // Frontend will redirect
    });
  } catch (error) {
    logger.error('Error in /connect/:platform/callback:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/connect/status
 * Get connection status for all platforms for the current company
 */
router.get('/status', (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || 'default-company';
    const db = getSupabaseAdmin();

    const platforms = {};

    for (const platform of PLATFORMS) {
      // Check if credentials are configured
      if (!oauthService.isPlatformConfigured(platform)) {
        platforms[platform] = {
          connected: false,
          reason: `${platform.toUpperCase()}_CLIENT_ID not configured`,
        };
        continue;
      }

      // Check database for stored integration
      if (db) {
        try {
          const result = db.exec(
            `SELECT id, access_token, account_name, expires_at, is_active, error_message
             FROM company_integrations
             WHERE company_id = ? AND platform = ? AND is_active = 1
             ORDER BY updated_at DESC LIMIT 1`,
            [companyId, platform]
          );

          if (result[0]?.values?.length > 0) {
            const row = result[0].values[0];
            const [id, token, accountName, expiresAt, isActive, errorMsg] = row;

            platforms[platform] = {
              connected: isActive === 1,
              account_name: accountName,
              expires_at: expiresAt,
              ...(errorMsg && { error: errorMsg }),
            };
          } else {
            platforms[platform] = { connected: false };
          }
        } catch (dbError) {
          logger.warn(`Error checking ${platform} status:`, dbError.message);
          platforms[platform] = { connected: false, error: dbError.message };
        }
      } else {
        platforms[platform] = { connected: false };
      }
    }

    res.json({
      success: true,
      company_id: companyId,
      platforms,
    });
  } catch (error) {
    logger.error('Error in /connect/status:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/connect/:platform
 * Disconnect a platform by marking its integration as inactive
 */
router.delete('/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const companyId = req.headers['x-company-id'] || 'default-company';

    // Validate platform
    if (!PLATFORMS.includes(platform)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid platform',
      });
    }

    const supabase = getSupabaseAdmin();

    // Delete integration
    const { error: delError } = await supabase.from('company_integrations')
      .delete()
      .eq('company_id', companyId)
      .eq('platform', platform);

    if (delError) {
      logger.error('Failed to disconnect:', delError.message);
    }

    logger.info(`Disconnected ${platform} for company ${companyId}`);

    res.json({
      success: true,
      message: `Successfully disconnected ${platform}`,
      platform,
    });
  } catch (error) {
    logger.error('Error in DELETE /connect/:platform:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
