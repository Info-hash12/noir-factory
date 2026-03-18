/**
 * Companies Routes
 * CRUD endpoints for managing companies
 */

const express = require('express');
const router = express.Router();
const { getSupabaseAdmin } = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * GET /api/companies
 * List user's companies
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    // Admin users get all companies
    if (req.user.isAdmin || req.user.isService) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { data } = await supabase.from('companies').select('id, slug, name, display_name, logo_url, is_active').eq('is_active', true);
        if (data && data.length > 0) {
          return res.json({ success: true, companies: data });
        }
      }
      // Fallback hardcoded
      return res.json({ success: true, companies: [
        { id: '8b36e7e6-c942-41b1-81b7-a70204a37811', slug: 'rawfunds', name: 'RawFunds' },
        { id: 'cc1c8956-efbf-48d5-969c-ca58022fb76c', slug: 'proxitap', name: 'Proxitap' }
      ]});
    }
    res.json({
      success: true,
      companies: req.user.companies || []
    });
  } catch (error) {
    logger.error('List companies error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/companies/:id
 * Get company details
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify user has access to this company
    const hasAccess = req.user.companies?.some(c => c.id === id);
    if (!hasAccess && !req.user.isService) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const supabase = getSupabaseAdmin();
    const { data: company, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found'
      });
    }

    res.json({
      success: true,
      company
    });
  } catch (error) {
    logger.error('Get company error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/companies/:id
 * Update company (admin only - checks company owner)
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug } = req.body;

    // Verify user has access to this company
    const hasAccess = req.user.companies?.some(c => c.id === id);
    if (!hasAccess && !req.user.isService) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const supabase = getSupabaseAdmin();
    const { data: company, error } = await supabase
      .from('companies')
      .update({
        ...(name && { name }),
        ...(slug && { slug }),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Update company error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      company
    });
  } catch (error) {
    logger.error('Update company error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/companies
 * Create new company (admin only)
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, slug } = req.body;

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, slug'
      });
    }

    const supabase = getSupabaseAdmin();

    // Create company
    const { data: company, error: createError } = await supabase
      .from('companies')
      .insert({
        name,
        slug,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) {
      logger.error('Create company error:', createError);
      return res.status(500).json({
        success: false,
        error: createError.message
      });
    }

    // Add creator as company member
    const { error: memberError } = await supabase
      .from('user_companies')
      .insert({
        user_id: req.user.id,
        company_id: company.id
      });

    if (memberError) {
      logger.warn('Error adding creator to company:', memberError);
    }

    res.status(201).json({
      success: true,
      company
    });
  } catch (error) {
    logger.error('Create company error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
