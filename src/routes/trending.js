/**
 * Trending Routes - Keyword-Based Search
 * Handles trending topics search by keywords across various platforms
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { getSupabaseAdmin } = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { requireCompanyContext } = require('../middleware/companyContext');

// Keyword-based content templates for search simulation
const KEYWORD_CONTENT_MAP = {
  'airport wifi': [
    {
      title: 'Security Researchers Uncover Major Vulnerability in Airport Networks',
      excerpt: 'Study reveals travelers at major airports exposed to data theft. Airlines announce emergency patching across global network. Privacy advocates demand stricter regulations.',
      source: 'TechCrunch',
      platform: 'news',
      hashtag: '#CyberSecurity',
      url: 'https://techcrunch.com/security/airport_wifi_vulnerability_2026',
      score: 8200,
      volume: 890
    },
    {
      title: 'TSA Implements New Security Protocols to Reduce Airport Wait Times',
      excerpt: 'Biometric screening system accelerates boarding process significantly. Airlines report 45% faster processing during peak hours. Travelers praise smoother experience at major hubs.',
      source: 'CNN Travel',
      platform: 'news',
      hashtag: '#Travel',
      url: 'https://cnn.com/travel/tsa_new_protocols_2026',
      score: 7500,
      volume: 720
    },
    {
      title: 'Airport WiFi Gets Major Security Upgrade in 2026',
      excerpt: 'Major airports worldwide implement new encryption standards. Travelers report faster and safer connections. Investment reaches $2B across global infrastructure.',
      source: 'Forbes',
      platform: 'news',
      hashtag: '#Travel',
      url: 'https://forbes.com/travel/airport_wifi_upgrade',
      score: 6800,
      volume: 650
    }
  ],
  'travel security': [
    {
      title: 'New Travel Security Standards Adopted by International Airport Council',
      excerpt: 'Biometric systems and AI-powered threat detection now standard. Travelers experience faster screening with enhanced safety. 150+ airports implement new protocols.',
      source: 'Reuters',
      platform: 'news',
      hashtag: '#Travel',
      url: 'https://reuters.com/travel/security_standards_2026',
      score: 7900,
      volume: 810
    },
    {
      title: 'Personal Safety Apps Surge in Popularity Among Travelers',
      excerpt: 'Real-time alerts and location sharing features gain traction. Solo travelers report increased confidence with new tools. App downloads exceed 50M globally.',
      source: 'TechCrunch',
      platform: 'news',
      hashtag: '#TravelTech',
      url: 'https://techcrunch.com/travel_safety_apps_2026',
      score: 7100,
      volume: 720
    }
  ],
  'data privacy': [
    {
      title: 'EU Expands GDPR to Require Encryption on All Public Networks',
      excerpt: 'New regulation mandates end-to-end encryption for coffee shops and public spaces. Tech companies scramble to implement compliance. Digital rights groups celebrate major win.',
      source: 'Wired',
      platform: 'news',
      hashtag: '#Privacy',
      url: 'https://wired.com/privacy/eu_gdpr_wifi_2026',
      score: 6900,
      volume: 550
    },
    {
      title: 'Data Privacy Becomes Top Consumer Concern in 2026 Survey',
      excerpt: 'Study shows 78% of users prioritize privacy over convenience. Companies invest heavily in privacy-first solutions. New regulations emerge in 50+ countries.',
      source: 'Pew Research',
      platform: 'news',
      hashtag: '#Privacy',
      url: 'https://pewresearch.com/privacy_2026',
      score: 6200,
      volume: 480
    }
  ],
  'vpn': [
    {
      title: 'VPN Usage Doubles Amid Privacy Concerns',
      excerpt: 'Millions migrate to encrypted networks for online protection. VPN providers report unprecedented demand surge. Industry experts debate effectiveness of regulations.',
      source: 'Ars Technica',
      platform: 'news',
      hashtag: '#Privacy',
      url: 'https://arstechnica.com/vpn_usage_2026',
      score: 7600,
      volume: 920
    }
  ],
  'cybersecurity': [
    {
      title: 'Industry Leaders Sign AI Safety Charter at Tech Summit',
      excerpt: 'Major AI companies commit to responsible development practices. Research consortium launches safety testing framework. Governments praise industry self-regulation efforts.',
      source: '@TechSummit2026',
      platform: 'twitter',
      hashtag: '#AIEthics',
      url: 'https://twitter.com/TechSummit2026/status/ai_safety_charter',
      score: 8500,
      volume: 820
    },
    {
      title: 'New Cybersecurity Framework Adopted by Fortune 500 Companies',
      excerpt: 'Zero-trust security model becomes industry standard. Companies report 60% reduction in breach incidents. Investment in cyber defense reaches record levels.',
      source: 'SC Magazine',
      platform: 'news',
      hashtag: '#CyberSecurity',
      url: 'https://scmagazine.com/cyber_framework_2026',
      score: 7800,
      volume: 750
    }
  ],
  'real estate': [
    {
      title: 'Digital Nomads Drive Real Estate Market Transformation',
      excerpt: 'Remote work fuels demand for flexible housing solutions. Co-living spaces surge 200% in major cities. Investors flood market with new opportunities.',
      source: 'CNBC',
      platform: 'news',
      hashtag: '#RealEstate',
      url: 'https://cnbc.com/real_estate_nomads_2026',
      score: 8100,
      volume: 920
    },
    {
      title: 'Housing Market Shifts: What Buyers Need to Know in 2026',
      excerpt: 'Interest rates stabilize as market finds new equilibrium. First-time homebuyers see improved opportunities. Experts predict steady growth across regions.',
      source: 'Forbes',
      platform: 'news',
      hashtag: '#Housing',
      url: 'https://forbes.com/housing_market_2026',
      score: 7400,
      volume: 810
    }
  ],
  'investing': [
    {
      title: 'AI Transforms Investment Strategies for Retail Traders',
      excerpt: 'Machine learning algorithms democratize professional-grade analysis. Retail investor success rates climb to new highs. Financial advisors embrace automated tools.',
      source: 'MarketWatch',
      platform: 'news',
      hashtag: '#Investing',
      url: 'https://marketwatch.com/ai_investing_2026',
      score: 8300,
      volume: 1050
    },
    {
      title: 'Sustainable Investing Reaches $50 Trillion Milestone',
      excerpt: 'ESG funds attract unprecedented capital flows. Young investors drive shift toward ethical investments. Traditional funds accelerate green transition.',
      source: 'Bloomberg',
      platform: 'news',
      hashtag: '#SustainableInvesting',
      url: 'https://bloomberg.com/sustainable_investing_2026',
      score: 7900,
      volume: 850
    }
  ],
  'personal finance': [
    {
      title: 'Credit Score Algorithm Changes Expected in 2026',
      excerpt: 'New factors improve scores for millions of consumers. Credit unions gain market share from traditional banks. Financial inclusion efforts show measurable results.',
      source: 'Reuters',
      platform: 'news',
      hashtag: '#Finance',
      url: 'https://reuters.com/credit_scores_2026',
      score: 6800,
      volume: 720
    },
    {
      title: 'Gen Z Redefines Budgeting with AI-Powered Apps',
      excerpt: 'Smart spending trackers gain mainstream adoption. Young people save more than previous generations at same age. Financial literacy improves through gamification.',
      source: 'TechCrunch',
      platform: 'news',
      hashtag: '#FinTech',
      url: 'https://techcrunch.com/fintech_gen_z_2026',
      score: 7200,
      volume: 680
    }
  ],
  'side hustle': [
    {
      title: 'Gig Economy Creators Report Record Earnings in 2026',
      excerpt: 'Side hustles now generate average $500/month for participants. Platforms compete for talent with improved benefits. Economic impact exceeds $100B globally.',
      source: 'FastCompany',
      platform: 'news',
      hashtag: '#SideHustle',
      url: 'https://fastcompany.com/gig_economy_2026',
      score: 7600,
      volume: 850
    },
    {
      title: 'Best Side Hustles for 2026: What Actually Works',
      excerpt: 'Content creators and freelancers lead earnings charts. AI tools lower barriers to entry for beginners. Success stories inspire millions to start.',
      source: 'Entrepreneur',
      platform: 'news',
      hashtag: '#Business',
      url: 'https://entrepreneur.com/side_hustles_2026',
      score: 7300,
      volume: 920
    }
  ],
  'aita': [
    {
      title: 'Reddit\'s AITA Forum Reaches 500M Post Milestone',
      excerpt: 'Community debates reach millions as moral questions go viral. Users crowdsource ethical decisions. Psychology researchers study decision-making patterns.',
      source: 'r/AmItheAsshole',
      platform: 'reddit',
      hashtag: '#AITA',
      url: 'https://reddit.com/r/AmItheAsshole/top',
      score: 9200,
      volume: 1500
    }
  ]
};

/**
 * Generate mock results for a keyword search
 */
function generateSearchResults(query) {
  const keywords = query.toLowerCase().split(/\s+/);
  const results = [];
  const used = new Set();

  // Search for matching content
  for (const [keyword, templates] of Object.entries(KEYWORD_CONTENT_MAP)) {
    const keywordParts = keyword.split(/\s+/);
    const matchesAny = keywordParts.some(part =>
      keywords.some(k => k.includes(part) || part.includes(k))
    );

    if (matchesAny) {
      templates.forEach((template, idx) => {
        if (used.size < 12) {
          const id = `trend-${used.size + 1}-${Date.now()}`;
          used.add(id);
          results.push({
            id,
            ...template,
            image_url: `https://picsum.photos/seed/${encodeURIComponent(query)}-${idx}/600/400`,
            timestamp: new Date(Date.now() - Math.random() * 8 * 60 * 60 * 1000).toISOString()
          });
        }
      });
    }
  }

  // If no keyword matches, return empty
  return results.sort((a, b) => b.score - a.score).slice(0, 12);
}

/**
 * GET /api/trending?q=keyword
 * Search for trending topics by keyword
 * Query params:
 *   - q: search query (required)
 */
router.get('/', async (req, res) => {
  try {
    const { q } = req.query;

    // If no query, prompt user to search
    if (!q || q.trim() === '') {
      return res.json({
        success: true,
        data: [],
        query: null,
        message: 'Enter a search query to discover trending topics',
        count: 0
      });
    }

    // Generate mock results based on keywords
    const results = generateSearchResults(q);

    res.json({
      success: true,
      data: results,
      query: q,
      count: results.length
    });

  } catch (error) {
    logger.error('GET /trending error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/trending/save
 * Save a trending item to content_items table
 * Body: { item_id, title, excerpt, url, source, platform, image_url }
 */
router.post('/save', requireAuth, async (req, res) => {
  try {
    const { item_id, title, excerpt, url, source, platform, image_url } = req.body;
    const companyId = req.headers['x-company-id'];

    if (!companyId) {
      return res.status(401).json({ success: false, error: 'Company ID required' });
    }
    if (!title || !url || !platform) {
      return res.status(400).json({ success: false, error: 'Missing required fields: title, url, platform' });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('content_items').insert({
      company_id: companyId,
      source_title: title,
      source_content: excerpt || '',
      source_url: url,
      source_author: source || platform,
      source_image_url: image_url,
      source_guid: 'trending-' + (item_id || Date.now()),
      review_status: 'pending'
    }).select().single();

    if (error) throw error;

    res.json({
      success: true,
      data: { id: data.id, title: data.source_title, excerpt: data.source_content, url: data.source_url, source: data.source_author, platform, created_at: data.created_at },
      message: 'Content saved successfully'
    });

  } catch (error) {
    logger.error('POST /trending/save error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/trending/saved
 * Get all saved trending items for the current company
 */
router.get('/saved', requireAuth, async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) {
      return res.status(401).json({ success: false, error: 'Company ID required' });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('content_items')
      .select('*')
      .eq('company_id', companyId)
      .like('source_guid', 'trending-%')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const items = (data || []).map(item => ({
      id: item.id,
      title: item.source_title,
      excerpt: item.source_content,
      url: item.source_url,
      source: item.source_author,
      platform: 'news',
      image_url: item.source_image_url || `https://picsum.photos/seed/saved-${item.id}/600/400`,
      timestamp: item.created_at
    }));

    res.json({
      success: true,
      data: items,
      count: items.length
    });

  } catch (error) {
    logger.error('GET /trending/saved error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
