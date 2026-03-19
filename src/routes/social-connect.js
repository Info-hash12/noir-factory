/**
 * Social Media OAuth Connect Routes
 * GET /api/connect/:platform - Get OAuth authorization URL
 * GET /api/connect/:platform/callback - Handle OAuth callback
 * GET /api/connect/status - Get connection status for all platforms
 * DELETE /api/connect/:platform - Disconnect a platform
 */

const express = require('express');
const oauthService = require('../services/social-oauth.service');
const { getDatabase } = require('../db/local-adapter');
const logger = require('../utils/logger');

const router = express.Router();

const PLATFORMS = ['instagram', 'facebook', 'threads', 'tiktok', 'twitter', 'linkedin'];

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
    const callbackUrl = `${process.env.APP_URL || 'http://localhost:8080'}/api/connect/${platform}/callback`;

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

    // Store in database
    const db = getDatabase();
    if (db) {
      try {
        // Create company_integrations table if it doesn't exist
        db.run(`
          CREATE TABLE IF NOT EXISTS company_integrations (
            id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
            company_id TEXT NOT NULL,
            platform TEXT NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            account_name TEXT,
            account_id TEXT,
            expires_at TEXT,
            connected_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            disconnected_at TEXT,
            is_active INTEGER DEFAULT 1,
            error_message TEXT,
            created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            UNIQUE(company_id, platform)
          )
        `);

        // Insert or update integration
        const exists = db.exec(`
          SELECT id FROM company_integrations
          WHERE company_id = ? AND platform = ?
        `, [companyId, platform]);

        if (exists[0]?.values?.length > 0) {
          // Update existing
          db.run(`
            UPDATE company_integrations
            SET access_token = ?, refresh_token = ?, account_name = ?,
                account_id = ?, expires_at = ?, is_active = 1,
                error_message = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE company_id = ? AND platform = ?
          `, [
            tokenData.access_token,
            tokenData.refresh_token,
            tokenData.account_name,
            tokenData.account_id,
            tokenData.expires_at,
            companyId,
            platform,
          ]);
        } else {
          // Insert new
          db.run(`
            INSERT INTO company_integrations
            (company_id, platform, access_token, refresh_token, account_name,
             account_id, expires_at, connected_at, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
          `, [
            companyId,
            platform,
            tokenData.access_token,
            tokenData.refresh_token,
            tokenData.account_name,
            tokenData.account_id,
            tokenData.expires_at,
            new Date().toISOString(),
          ]);
        }

        logger.info(`Stored integration for ${platform} / ${companyId}`);
      } catch (dbError) {
        logger.error('Failed to store integration:', dbError.message);
      }
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
    const db = getDatabase();

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

    const db = getDatabase();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
      });
    }

    // Get integration
    const result = db.exec(
      `SELECT id, access_token FROM company_integrations
       WHERE company_id = ? AND platform = ?`,
      [companyId, platform]
    );

    if (!result[0]?.values?.length) {
      return res.status(404).json({
        success: false,
        error: `No integration found for ${platform}`,
      });
    }

    const [integrationId, accessToken] = result[0].values[0];

    // Revoke token with platform
    try {
      await oauthService.revokeToken(platform, accessToken);
    } catch (revokeError) {
      logger.warn(`Failed to revoke token for ${platform}:`, revokeError.message);
    }

    // Mark as inactive in database
    db.run(`
      UPDATE company_integrations
      SET is_active = 0, disconnected_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
          updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ?
    `, [integrationId]);

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
