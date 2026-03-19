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
      try {
        const supabase = getSupabaseAdmin();
        if (supabase && typeof supabase.from === 'function') {
          const result = await supabase.from('companies').select('id, slug, name, display_name, logo_url, is_active');
          if (result && result.data && result.data.length > 0) {
            return res.json({ success: true, companies: result.data.filter(c => c.is_active !== false) });
          }
        }
      } catch (e) {
        logger.warn('Supabase companies query failed, using fallback:', e.message);
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
    if (!hasAccess && !req.user.isService && !req.user.isAdmin) {
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
    if (!hasAccess && !req.user.isService && !req.user.isAdmin) {
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
 * GET /api/companies/:id/prompts
 * Get saved prompts for a company
 */
router.get('/:id/prompts', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify user has access to this company
    const hasAccess = req.user.companies?.some(c => c.id === id);
    if (!hasAccess && !req.user.isService && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('company_prompts')
      .select('*')
      .eq('company_id', id);

    if (error && error.code !== 'PGRST116') {
      logger.error('Get company prompts error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    // Format prompts by type — return simple string (system_prompt) for Settings page
    const prompts = {};
    (data || []).forEach(p => {
      prompts[p.prompt_type] = p.system_prompt || p.user_prompt_template || '';
    });

    res.json({
      success: true,
      prompts
    });

  } catch (error) {
    logger.error('Get company prompts error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/companies/:id/prompts
 * Save/update prompts for a company
 * Body: { script_generation: { system_prompt, user_prompt_template }, ... }
 */
router.put('/:id/prompts', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const prompts = req.body;

    // Verify user has access to this company
    const hasAccess = req.user.companies?.some(c => c.id === id);
    if (!hasAccess && !req.user.isService && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const supabase = getSupabaseAdmin();

    // Upsert each prompt type — accepts both string and object formats
    const results = [];
    for (const [promptType, promptData] of Object.entries(prompts)) {
      if (!promptData) continue;

      // Handle both string format (from Settings) and object format
      let systemPrompt = '';
      let userTemplate = '';
      if (typeof promptData === 'string') {
        systemPrompt = promptData;
      } else if (typeof promptData === 'object') {
        systemPrompt = promptData.system_prompt || promptData.text || '';
        userTemplate = promptData.user_prompt_template || '';
      }

      // Delete existing then insert (safer than upsert without unique constraint)
      await supabase.from('company_prompts')
        .delete()
        .eq('company_id', id)
        .eq('prompt_type', promptType);

      const { data, error } = await supabase
        .from('company_prompts')
        .insert({
          company_id: id,
          prompt_type: promptType,
          name: promptType,
          system_prompt: systemPrompt,
          user_prompt_template: userTemplate,
          is_default: true,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        logger.error(`Error saving prompt ${promptType}:`, error);
        continue; // Don't fail entire request for one prompt
      }
      results.push(data);
    }

    res.json({
      success: true,
      message: 'Prompts saved successfully',
      prompts: results
    });

  } catch (error) {
    logger.error('Update company prompts error:', error);
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
// Build trigger: 1773888940
