/**
 * Company Context Middleware
 * Scopes requests to a specific company via X-Company-ID header
 */

const { getSupabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');

// Cache companies in memory (refresh every 5 min)
let companiesCache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function loadCompanies() {
  if (companiesCache && Date.now() - cacheTime < CACHE_TTL) return companiesCache;

  try {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase.from('companies').select('id, slug, name').eq('is_active', true);
      if (data) { companiesCache = data; cacheTime = Date.now(); return data; }
    }
  } catch (err) {
    logger.warn('Could not load companies from Supabase, using defaults');
  }

  // Fallback hardcoded companies
  return [
    { id: '8b36e7e6-c942-41b1-81b7-a70204a37811', slug: 'rawfunds', name: 'RawFunds' },
    { id: 'cc1c8956-efbf-48d5-969c-ca58022fb76c', slug: 'proxitap', name: 'Proxitap' }
  ];
}

/**
 * Require company context — reads X-Company-ID header
 * Admin/password-gate users have access to all companies
 */
async function requireCompanyContext(req, res, next) {
  try {
    const companyId = req.headers['x-company-id'] || req.query.company_id;

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Missing X-Company-ID header' });
    }

    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const companies = await loadCompanies();
    const company = companies.find(c => c.id === companyId || c.slug === companyId);

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Admin and service users have access to all companies
    if (req.user.isAdmin || req.user.isService) {
      req.company = company;
      return next();
    }

    // Regular users — check membership
    const userCompany = req.user.companies?.find(c => c.id === companyId);
    if (!userCompany) {
      return res.status(403).json({ success: false, error: 'Access denied to this company' });
    }

    req.company = userCompany;
    next();
  } catch (error) {
    logger.error('Company context error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Optional company context
 */
async function optionalCompanyContext(req, res, next) {
  try {
    const companyId = req.headers['x-company-id'] || req.query.company_id;
    if (!companyId || !req.user) { req.company = null; return next(); }

    const companies = await loadCompanies();
    req.company = companies.find(c => c.id === companyId || c.slug === companyId) || null;
    next();
  } catch (error) {
    logger.error('Optional company context error:', error);
    req.company = null;
    next();
  }
}

module.exports = { requireCompanyContext, optionalCompanyContext, loadCompanies };
