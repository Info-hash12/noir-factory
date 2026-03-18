/**
 * Authentication Routes
 * Handles Supabase OAuth callbacks, user info, and company switching
 */

const express = require('express');
const router = express.Router();
const { getSupabaseAdmin } = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * POST /api/auth/callback
 * Receives Supabase session after Google SSO
 * Creates user_companies entry if first login
 */
router.post('/callback', async (req, res) => {
  try {
    const { session, companyId } = req.body;

    if (!session || !session.user) {
      return res.status(400).json({
        success: false,
        error: 'Missing session data'
      });
    }

    const userId = session.user.id;
    const email = session.user.email;
    const supabase = getSupabaseAdmin();

    // Check if user already has companies
    const { data: existingCompanies } = await supabase
      .from('user_companies')
      .select('company_id')
      .eq('user_id', userId);

    // First login - create entry for default company or provided companyId
    if (!existingCompanies || existingCompanies.length === 0) {
      let targetCompanyId = companyId;

      // If no company specified, get the first company (RawFunds by default)
      if (!targetCompanyId) {
        const { data: companies } = await supabase
          .from('companies')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(1);

        targetCompanyId = companies?.[0]?.id;
      }

      if (targetCompanyId) {
        const { error: insertError } = await supabase
          .from('user_companies')
          .insert({
            user_id: userId,
            company_id: targetCompanyId
          });

        if (insertError) {
          logger.error('Error creating user_company entry:', insertError);
        }
      }
    }

    // Load user's companies
    const { data: companies, error: companiesError } = await supabase
      .from('user_companies')
      .select('company_id, companies(id, slug, name)')
      .eq('user_id', userId);

    if (companiesError) {
      logger.error('Error loading companies:', companiesError);
    }

    res.json({
      success: true,
      session,
      user: {
        id: userId,
        email,
        companies: (companies || []).map(uc => ({
          id: uc.companies?.id,
          slug: uc.companies?.slug,
          name: uc.companies?.name
        }))
      }
    });
  } catch (error) {
    logger.error('Auth callback error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/auth/me
 * Returns current user info + their companies
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        companies: req.user.companies,
        isService: req.user.isService || false
      }
    });
  } catch (error) {
    logger.error('Get me error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/auth/switch-company
 * Sets the active company for this user
 * (Client-side just stores this in localStorage, this endpoint is optional)
 */
router.post('/switch-company', requireAuth, async (req, res) => {
  try {
    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'Missing companyId'
      });
    }

    // Verify user has access to this company
    const hasAccess = req.user.companies?.some(c => c.id === companyId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this company'
      });
    }

    const selectedCompany = req.user.companies.find(c => c.id === companyId);

    res.json({
      success: true,
      company: selectedCompany
    });
  } catch (error) {
    logger.error('Switch company error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
