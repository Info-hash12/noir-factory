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
    },
    {
      title: 'Just got scammed trying to buy airport wifi 😭',
      excerpt: 'Anyone else get hit with a fake airport wifi scam? Tried to connect and lost access to my accounts. Be careful out there!',
      source: 'r/cybersecurity',
      platform: 'reddit',
      hashtag: '#SecurityAware',
      url: 'https://reddit.com/r/cybersecurity/airport_wifi_scam',
      score: 5200,
      volume: 420
    },
    {
      title: 'Airport WiFi hack gone wrong - TSA got involved',
      excerpt: 'One traveler\'s security research at DFW airport took an unexpected turn. Here\'s what happened and why you should never try this.',
      source: '@CyberSecurityNow',
      platform: 'twitter',
      hashtag: '#CyberSecurity',
      url: 'https://twitter.com/CyberSecurityNow/airport_wifi_hack',
      score: 7100,
      volume: 680
    },
    {
      title: '@TravelSecureTV: Airport WiFi Safety Tips for Digital Nomads',
      excerpt: 'Just published our latest guide on staying safe on public WiFi while traveling. VPN recommendations + best practices included!',
      source: '@TravelSecureTV',
      platform: 'instagram',
      hashtag: '#TravelSafety',
      url: 'https://instagram.com/TravelSecureTV/airport_wifi_guide',
      score: 4800,
      volume: 350
    },
    {
      title: 'POV: You forgot your airport WiFi password and now you\'re texting customer service',
      excerpt: 'Hilarious compilation of airport wifi struggles. Watch as travelers battle the weakest connection in existence. 😂',
      source: '@TravelHumor',
      platform: 'tiktok',
      hashtag: '#TravelFails',
      url: 'https://tiktok.com/@TravelHumor/airport_wifi',
      score: 6200,
      volume: 890
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
    },
    {
      title: 'Share your travel safety stories - has tech helped you feel safer?',
      excerpt: 'Discussion thread about the best safety gadgets and apps for solo travelers. From door locks to location sharing, users share their favorites.',
      source: 'r/solotravel',
      platform: 'reddit',
      hashtag: '#SoloTravel',
      url: 'https://reddit.com/r/solotravel/travel_safety_tech',
      score: 6500,
      volume: 520
    },
    {
      title: '@TravelSecurityGuru: 10 essential items every traveler needs in 2026',
      excerpt: 'Just dropped our updated travel safety checklist. Includes latest tech recommendations and proven tips from seasoned travelers worldwide.',
      source: '@TravelSecurityGuru',
      platform: 'twitter',
      hashtag: '#TravelSafety',
      url: 'https://twitter.com/TravelSecurityGuru/safety_checklist',
      score: 8100,
      volume: 940
    },
    {
      title: '@NomadSafety: Travel security tips that actually work',
      excerpt: 'Quick guide to keeping your valuables safe, avoiding scams, and staying aware while traveling abroad. Save this for your next trip!',
      source: '@NomadSafety',
      platform: 'instagram',
      hashtag: '#NomadLife',
      url: 'https://instagram.com/NomadSafety/security_tips',
      score: 5800,
      volume: 670
    },
    {
      title: 'TRAVEL SAFETY FAILS 😱 Why you should ALWAYS do this',
      excerpt: 'Watch travelers learn hard lessons about security abroad. Hilarious and educational compilation of travel safety mistakes.',
      source: '@TravelFails2026',
      platform: 'tiktok',
      hashtag: '#TravelFails',
      url: 'https://tiktok.com/@TravelFails2026/security_fails',
      score: 6900,
      volume: 1100
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
    },
    {
      title: 'Privacy communities are THRIVING - Here\'s what changed',
      excerpt: 'Deep dive into the r/privacy subreddit. Users share best practices, privacy tools, and strategies to protect personal data.',
      source: 'r/privacy',
      platform: 'reddit',
      hashtag: '#PrivacyMatters',
      url: 'https://reddit.com/r/privacy/best_practices_2026',
      score: 7200,
      volume: 890
    },
    {
      title: '@EFForg: Your data rights explained in 2026',
      excerpt: 'Breaking down new privacy laws and what they mean for you. Learn about GDPR, CCPA, and emerging regulations worldwide.',
      source: '@EFForg',
      platform: 'twitter',
      hashtag: '#DataPrivacy',
      url: 'https://twitter.com/EFForg/data_rights_2026',
      score: 7800,
      volume: 1050
    },
    {
      title: '@PrivacyTips: How to check if your data was leaked',
      excerpt: 'Simple step-by-step guide to checking if your personal data is on the dark web. Tools + resources included. Protect yourself!',
      source: '@PrivacyTips',
      platform: 'instagram',
      hashtag: '#CyberSecurity',
      url: 'https://instagram.com/PrivacyTips/data_leak_check',
      score: 5600,
      volume: 420
    },
    {
      title: 'Big Tech can\'t stop us from protecting our privacy 🔒',
      excerpt: 'Creator reviews the best privacy tools for 2026. VPNs, password managers, encrypted messaging apps, and more.',
      source: '@PrivacyGamer',
      platform: 'tiktok',
      hashtag: '#PrivacyFirst',
      url: 'https://tiktok.com/@PrivacyGamer/privacy_tools_2026',
      score: 6400,
      volume: 750
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
    },
    {
      title: 'Best VPN providers of 2026 - Speed + Security tested',
      excerpt: 'Honest comparison of top VPNs. We tested speed, security, logging policies, and support for each major provider.',
      source: 'r/VPN',
      platform: 'reddit',
      hashtag: '#Privacy',
      url: 'https://reddit.com/r/VPN/best_vpn_2026',
      score: 8400,
      volume: 1200
    },
    {
      title: '@VPNSecure: Which VPN will you choose in 2026? Here\'s our verdict',
      excerpt: 'Comprehensive VPN guide including speed tests, price comparisons, and privacy policy analysis for top providers.',
      source: '@VPNSecure',
      platform: 'twitter',
      hashtag: '#OnlineSecurity',
      url: 'https://twitter.com/VPNSecure/vpn_guide_2026',
      score: 7300,
      volume: 850
    },
    {
      title: '@VPNTips: How to pick the right VPN for YOUR needs',
      excerpt: 'Not all VPNs are created equal. Find out what to look for when choosing a VPN provider. Privacy, speed, pricing breakdown.',
      source: '@VPNTips',
      platform: 'instagram',
      hashtag: '#CyberSecurity',
      url: 'https://instagram.com/VPNTips/choosing_vpn',
      score: 5200,
      volume: 380
    },
    {
      title: 'Stop using FREE VPNs 🚨 Here\'s why',
      excerpt: 'Exposing the hidden costs of free VPN services. They sell your data, inject ads, and compromise security.',
      source: '@TechSecurityNow',
      platform: 'tiktok',
      hashtag: '#CyberSecurity',
      url: 'https://tiktok.com/@TechSecurityNow/free_vpn_risks',
      score: 6700,
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
    },
    {
      title: 'Cybersecurity professionals discuss latest threats and defenses',
      excerpt: 'Active community sharing security updates, threat analysis, and defense strategies. Expert advice from industry veterans.',
      source: 'r/cybersecurity',
      platform: 'reddit',
      hashtag: '#CyberSecurity',
      url: 'https://reddit.com/r/cybersecurity/threats_2026',
      score: 8200,
      volume: 1100
    },
    {
      title: '@CISA: Critical vulnerability alert - Patch immediately',
      excerpt: 'Government agency alerts on newly discovered vulnerability affecting millions. Patch details and workarounds available.',
      source: '@CISA',
      platform: 'twitter',
      hashtag: '#CriticalAlert',
      url: 'https://twitter.com/CISA/critical_vuln_2026',
      score: 9100,
      volume: 1800
    },
    {
      title: '@CyberSecurityGuru: Cybersecurity trends shaping 2026',
      excerpt: 'Security trends to watch: AI-powered attacks, quantum threats, supply chain risks. Expert analysis and preparation tips.',
      source: '@CyberSecurityGuru',
      platform: 'instagram',
      hashtag: '#InfoSec',
      url: 'https://instagram.com/CyberSecurityGuru/trends_2026',
      score: 6400,
      volume: 580
    },
    {
      title: 'HACKED 😱 Here\'s what attackers can do in 5 minutes',
      excerpt: 'Real demonstration of common hacking techniques and how to protect yourself. Cybersecurity education through real examples.',
      source: '@HackerEducation',
      platform: 'tiktok',
      hashtag: '#CyberSecurity',
      url: 'https://tiktok.com/@HackerEducation/hacking_demo',
      score: 7600,
      volume: 1400
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
    },
    {
      title: 'First time homebuying in 2026? Here\'s what you need to know',
      excerpt: 'Real estate community sharing tips, market analysis, and first-buyer advice. Thousands discuss mortgage rates and neighborhoods.',
      source: 'r/RealEstate',
      platform: 'reddit',
      hashtag: '#HomeBuying',
      url: 'https://reddit.com/r/RealEstate/first_time_buyer',
      score: 8600,
      volume: 1250
    },
    {
      title: '@RealEstateNews: Market report for March 2026 is OUT',
      excerpt: 'Latest housing market data: prices, trends, and predictions. Median home prices, inventory levels, and regional analysis.',
      source: '@RealEstateNews',
      platform: 'twitter',
      hashtag: '#HousingMarket',
      url: 'https://twitter.com/RealEstateNews/march_2026_report',
      score: 7200,
      volume: 650
    },
    {
      title: '@PropertyInvestorTips: Real estate investing in 2026',
      excerpt: 'Guide to real estate investment strategies, rental property tips, and market analysis. Build wealth through real estate.',
      source: '@PropertyInvestorTips',
      platform: 'instagram',
      hashtag: '#RealEstateInvesting',
      url: 'https://instagram.com/PropertyInvestorTips/investing_guide',
      score: 5900,
      volume: 480
    },
    {
      title: 'This house sold for 10x the listing price 🤯 Here\'s why',
      excerpt: 'Viral real estate story: tiny house attracts bidding war. Learn what made this property so desirable.',
      source: '@RealEstateTrends',
      platform: 'tiktok',
      hashtag: '#RealEstate',
      url: 'https://tiktok.com/@RealEstateTrends/viral_house_sale',
      score: 6800,
      volume: 1050
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
    },
    {
      title: 'Stock market discussion: What are you investing in now?',
      excerpt: 'Community sharing investment picks, portfolio strategies, and market analysis. Popular stocks, ETFs, and long-term plans discussed.',
      source: 'r/investing',
      platform: 'reddit',
      hashtag: '#StockMarket',
      url: 'https://reddit.com/r/investing/portfolio_discussion',
      score: 8800,
      volume: 1400
    },
    {
      title: '@InvestingPros: Top tech stocks to watch in Q2 2026',
      excerpt: 'Detailed analysis of growth stocks, earnings reports, and market trends. Data-driven investment insights and predictions.',
      source: '@InvestingPros',
      platform: 'twitter',
      hashtag: '#TechStocks',
      url: 'https://twitter.com/InvestingPros/tech_stocks_q2',
      score: 7500,
      volume: 920
    },
    {
      title: '@FinanceWithMe: Investing basics for beginners',
      excerpt: 'Step-by-step guide to starting your investment journey. ETFs, index funds, and building your first portfolio.',
      source: '@FinanceWithMe',
      platform: 'instagram',
      hashtag: '#PersonalFinance',
      url: 'https://instagram.com/FinanceWithMe/investing_basics',
      score: 6200,
      volume: 520
    },
    {
      title: 'I made $50K day trading in 2026 - Here\'s what I learned 💰',
      excerpt: 'Success story: young investor shares strategies for day trading profits. Risk management, psychology, and market timing tips.',
      source: '@DayTraderLife',
      platform: 'tiktok',
      hashtag: '#Investing',
      url: 'https://tiktok.com/@DayTraderLife/50k_profit',
      score: 7100,
      volume: 1100
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
    },
    {
      title: 'Best budgeting strategies for 2026 - What actually works?',
      excerpt: 'Community shares effective budgeting methods: 50/30/20 rule, zero-based budgeting, envelope method. Real results from real people.',
      source: 'r/personalfinance',
      platform: 'reddit',
      hashtag: '#MoneyManagement',
      url: 'https://reddit.com/r/personalfinance/budgeting_2026',
      score: 9200,
      volume: 1600
    },
    {
      title: '@FinancialFreedom: How to save $10K in 90 days',
      excerpt: 'Actionable tips for aggressive saving. Budget breakdowns, expense cutting strategies, and income boosting methods.',
      source: '@FinancialFreedom',
      platform: 'twitter',
      hashtag: '#MoneyTips',
      url: 'https://twitter.com/FinancialFreedom/save_10k',
      score: 8100,
      volume: 1100
    },
    {
      title: '@MoneyMavens: Personal finance tips that changed my life',
      excerpt: 'Money management hacks: automatic savings, negotiating bills, tracking spending. Build financial confidence step by step.',
      source: '@MoneyMavens',
      platform: 'instagram',
      hashtag: '#FinancialHealth',
      url: 'https://instagram.com/MoneyMavens/life_changing_tips',
      score: 6600,
      volume: 620
    },
    {
      title: 'I eliminated $50K debt in 2 years 🎉 This is how',
      excerpt: 'Debt payoff success story with clear strategy breakdown. Debt snowball vs avalanche, motivation tips, and timeline.',
      source: '@DebtFreeJourney',
      platform: 'tiktok',
      hashtag: '#DebtFree',
      url: 'https://tiktok.com/@DebtFreeJourney/50k_paid_off',
      score: 7800,
      volume: 1300
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
    },
    {
      title: 'Side hustle ideas that actually pay - Share your wins!',
      excerpt: 'Community marketplace of side gigs: freelancing, tutoring, content creation, dropshipping. Real earnings and honest reviews.',
      source: 'r/sidehustle',
      platform: 'reddit',
      hashtag: '#MoneyMaking',
      url: 'https://reddit.com/r/sidehustle/ideas_2026',
      score: 9500,
      volume: 1800
    },
    {
      title: '@SideHustleKing: Top 10 side hustles making $1K/month',
      excerpt: 'Ranked side businesses by earning potential: content creation, consulting, freelancing, dropshipping, and more with income proof.',
      source: '@SideHustleKing',
      platform: 'twitter',
      hashtag: '#Entrepreneurship',
      url: 'https://twitter.com/SideHustleKing/top_10_hustles',
      score: 8400,
      volume: 1250
    },
    {
      title: '@FreelanceLife: How to start your freelance side hustle',
      excerpt: 'Beginner\'s guide: setting rates, finding clients, delivering quality work, and scaling your freelance business.',
      source: '@FreelanceLife',
      platform: 'instagram',
      hashtag: '#Freelance',
      url: 'https://instagram.com/FreelanceLife/start_freelancing',
      score: 6800,
      volume: 750
    },
    {
      title: 'I make $5K per month from my side hustle 💸',
      excerpt: 'Real story: passive income streams, content monetization, and diversified income. What works and what doesn\'t.',
      source: '@HustleWins',
      platform: 'tiktok',
      hashtag: '#PassiveIncome',
      url: 'https://tiktok.com/@HustleWins/5k_monthly',
      score: 7900,
      volume: 1600
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
 * POST /api/trending/save-search
 * Save a keyword search string
 * Body: { query: "airport wifi" }
 */
router.post('/save-search', requireAuth, async (req, res) => {
  try {
    const { query } = req.body;
    const companyId = req.headers['x-company-id'];

    if (!companyId) {
      return res.status(401).json({ success: false, error: 'Company ID required' });
    }
    if (!query || query.trim() === '') {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    const supabase = getSupabaseAdmin();
    const searchKey = `saved_search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const { data, error } = await supabase.from('app_config').insert({
      company_id: companyId,
      key: searchKey,
      value: query
    }).select().single();

    if (error) throw error;

    res.json({
      success: true,
      data: { id: searchKey, query: query },
      message: 'Search saved successfully'
    });

  } catch (error) {
    logger.error('POST /trending/save-search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/trending/saved-searches
 * Get all saved keyword searches for the company
 */
router.get('/saved-searches', requireAuth, async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) {
      return res.status(401).json({ success: false, error: 'Company ID required' });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('app_config')
      .select('*')
      .eq('company_id', companyId)
      .like('key', 'saved_search_%')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const searches = (data || []).map(item => ({
      id: item.key,
      query: item.value
    }));

    res.json({
      success: true,
      data: searches,
      count: searches.length
    });

  } catch (error) {
    logger.error('GET /trending/saved-searches error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/trending/saved-searches/:id
 * Delete a saved search
 */
router.delete('/saved-searches/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.headers['x-company-id'];

    if (!companyId) {
      return res.status(401).json({ success: false, error: 'Company ID required' });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('app_config')
      .delete()
      .eq('company_id', companyId)
      .eq('key', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Search deleted successfully'
    });

  } catch (error) {
    logger.error('DELETE /trending/saved-searches/:id error:', error);
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
