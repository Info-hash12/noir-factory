/**
 * Authentication Middleware
 * Supports password-gate mode (X-Auth-Token) and Supabase JWT
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const PASSWORD_TOKEN = process.env.AUTH_PASSWORD || 'noirfactory2026';

/**
 * Verify auth via:
 * 1. X-Auth-Token header (password gate)
 * 2. X-Service-Key (server-to-server)
 * 3. Bearer JWT (Supabase)
 */
async function requireAuth(req, res, next) {
  try {
    // 1. Password gate
    const authToken = req.headers['x-auth-token'];
    if (authToken === PASSWORD_TOKEN) {
      req.user = { id: 'admin', email: 'info@rawfunds.com', isAdmin: true, companies: [] };
      return next();
    }

    // 2. Service key
    const serviceKey = req.headers['x-service-key'];
    if (serviceKey && serviceKey === process.env.SUPABASE_SERVICE_KEY) {
      req.user = { id: 'service', email: 'service@noir-factory.local', companies: [], isService: true };
      return next();
    }

    // 3. Supabase JWT
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.decode(token, { complete: true });
        if (decoded?.payload?.sub) {
          req.user = { id: decoded.payload.sub, email: decoded.payload.email || null, companies: [], token };
          return next();
        }
      } catch (err) { /* fall through */ }
    }

    return res.status(401).json({ success: false, error: 'Authentication required' });
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({ success: false, error: 'Authentication error' });
  }
}

/**
 * Optional auth — doesn't fail if missing
 */
async function optionalAuth(req, res, next) {
  const authToken = req.headers['x-auth-token'];
  if (authToken === PASSWORD_TOKEN) {
    req.user = { id: 'admin', email: 'info@rawfunds.com', isAdmin: true, companies: [] };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.decode(authHeader.substring(7), { complete: true });
      if (decoded?.payload?.sub) {
        req.user = { id: decoded.payload.sub, email: decoded.payload.email, companies: [] };
        return next();
      }
    } catch (err) { /* ignore */ }
  }

  req.user = null;
  next();
}

module.exports = { requireAuth, optionalAuth };
