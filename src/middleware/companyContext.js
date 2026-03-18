/**
 * Company Context Middleware
 * Ensures requests are scoped to a specific company
 * Reads company from X-Company-ID header or ?company_id query parameter
 */

const { getSupabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');

/**
 * Middleware that attaches company context to request
 * Verifies user has access to the specified company
 */
async function requireCompanyContext(req, res, next) {
  try {
    // Get company ID from header or query param
    const companyId = req.headers['x-company-id'] || req.query.company_id;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'Missing company context (X-Company-ID header or ?company_id query param)'
      });
    }

    // If no user, reject (company context requires auth)
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Service accounts have access to all companies
    if (req.user.isService) {
      const supabase = getSupabaseAdmin();
      const { data: company, error } = await supabase
        .from('companies')
        .select('id, slug, name')
        .eq('id', companyId)
        .single();

      if (error || !company) {
        return res.status(404).json({
          success: false,
          error: 'Company not found'
        });
      }

      req.company = company;
      return next();
    }

    // Check if user has access to this company
    const userCompany = req.user.companies?.find(c => c.id === companyId);
    if (!userCompany) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this company'
      });
    }

    // Attach company to request
    req.company = userCompany;
    next();
  } catch (error) {
    logger.error('Company context middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Optional company context - doesn't fail if missing
 * Useful for endpoints that can work with or without a specific company
 */
async function optionalCompanyContext(req, res, next) {
  try {
    const companyId = req.headers['x-company-id'] || req.query.company_id;

    // No company specified, continue
    if (!companyId || !req.user) {
      req.company = null;
      return next();
    }

    // Service accounts have access to all companies
    if (req.user.isService) {
      const supabase = getSupabaseAdmin();
      const { data: company } = await supabase
        .from('companies')
        .select('id, slug, name')
        .eq('id', companyId)
        .single();

      req.company = company || null;
      return next();
    }

    // Check if user has access to this company
    const userCompany = req.user.companies?.find(c => c.id === companyId);
    req.company = userCompany || null;

    // If user specified a company they don't have access to, reject
    if (!req.company && companyId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this company'
      });
    }

    next();
  } catch (error) {
    logger.error('Optional company context middleware error:', error);
    req.company = null;
    next();
  }
}

module.exports = {
  requireCompanyContext,
  optionalCompanyContext
};
