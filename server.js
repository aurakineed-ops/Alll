const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============ IN-MEMORY RATE LIMITING ============
const rateLimits = {
  search: { limit: 5000, count: 0, resetTime: Date.now() + 86400000 },
  vehicle: { limit: 5000, count: 0, resetTime: Date.now() + 86400000 },
  tg: { limit: 1000, count: 0, resetTime: Date.now() + 86400000 }
};

function checkRateLimit(type) {
  const now = Date.now();
  const limit = rateLimits[type];
  
  if (now > limit.resetTime) {
    limit.count = 0;
    limit.resetTime = now + 86400000;
  }
  
  if (limit.count >= limit.limit) {
    return { allowed: false, remaining: 0, total: limit.limit };
  }
  
  limit.count++;
  return { allowed: true, remaining: limit.limit - limit.count, total: limit.limit };
}

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============ ROUTES ============

// 1. SEARCH API
app.get('/search', async (req, res) => {
  const { q } = req.query;
  
  if (!q) {
    return res.status(400).json({ 
      error: 'Missing parameter', 
      usage: '/search?q=9876543210' 
    });
  }

  const rateCheck = checkRateLimit('search');
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      limit: 5000,
      remaining: 0,
      reset: '24 hours',
      expiry: '01-09-2026'
    });
  }

  try {
    console.log(`[SEARCH] Fetching: ${q}`);
    
    const startTime = Date.now();
    const response = await axios.get('https://leakapi.dpdns.org/search', {
      params: { q },
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const responseTime = `${Date.now() - startTime}ms`;

    // Get rate info from original API response
    const apiData = response.data;
    const rateInfo = {
      req_left: apiData.req_left || rateCheck.remaining,
      req_total: apiData.req_total || rateCheck.total,
      expiry: apiData.expiry || '01-09-2026',
      developer: apiData.developer || '@simpleguy444',
      cached: apiData.cached || false,
      response_time: apiData.response_time || responseTime
    };

    return res.json({
      success: true,
      data: apiData.data || apiData,
      rate_info: rateInfo,
      your_rate_remaining: rateCheck.remaining,
      api_expiry: '01-09-2026'
    });

  } catch (error) {
    console.error('[SEARCH] Error:', error.message);
    
    if (error.response) {
      return res.status(error.response.status).json({
        error: 'Original API error',
        status: error.response.status,
        data: error.response.data,
        rate_info: {
          req_left: 'Unknown',
          req_total: 'Unknown',
          expiry: '01-09-2026',
          developer: '@simpleguy444'
        }
      });
    }
    
    return res.status(500).json({
      error: 'Failed to fetch search data',
      message: error.message,
      rate_info: {
        expiry: '01-09-2026',
        developer: '@simpleguy444'
      }
    });
  }
});

// 2. VEHICLE API
app.get('/vehicle', async (req, res) => {
  const { vehicle } = req.query;
  
  if (!vehicle) {
    return res.status(400).json({ 
      error: 'Missing parameter', 
      usage: '/vehicle?vehicle=KL41V3504' 
    });
  }

  const rateCheck = checkRateLimit('vehicle');
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      limit: 5000,
      remaining: 0,
      reset: '24 hours',
      expiry: '01-09-2026'
    });
  }

  try {
    console.log(`[VEHICLE] Fetching: ${vehicle}`);
    
    const startTime = Date.now();
    const response = await axios.get('https://leakapi.dpdns.org/api/vehicle', {
      params: { vehicle },
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const responseTime = `${Date.now() - startTime}ms`;

    const apiData = response.data;
    const rateInfo = {
      req_left: apiData.req_left || rateCheck.remaining,
      req_total: apiData.req_total || rateCheck.total,
      expiry: apiData.expiry || '01-09-2026',
      developer: apiData.developer || '@simpleguy444',
      cached: apiData.cached || false,
      response_time: apiData.response_time || responseTime
    };

    return res.json({
      success: true,
      data: apiData.data || apiData,
      rate_info: rateInfo,
      your_rate_remaining: rateCheck.remaining,
      api_expiry: '01-09-2026'
    });

  } catch (error) {
    console.error('[VEHICLE] Error:', error.message);
    
    if (error.response) {
      return res.status(error.response.status).json({
        error: 'Original API error',
        status: error.response.status,
        data: error.response.data,
        rate_info: {
          req_left: 'Unknown',
          req_total: 'Unknown',
          expiry: '01-09-2026',
          developer: '@simpleguy444'
        }
      });
    }
    
    return res.status(500).json({
      error: 'Failed to fetch vehicle data',
      message: error.message,
      rate_info: {
        expiry: '01-09-2026',
        developer: '@simpleguy444'
      }
    });
  }
});

// 3. TELEGRAM OSINT API
app.get('/tg', async (req, res) => {
  const { query } = req.query;
  
  if (!query) {
    return res.status(400).json({ 
      error: 'Missing parameter', 
      usage: '/tg?query=123456789' 
    });
  }

  const rateCheck = checkRateLimit('tg');
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      limit: 1000,
      remaining: 0,
      reset: '24 hours',
      expiry: '01-09-2026'
    });
  }

  try {
    console.log(`[TG] Fetching: ${query}`);
    
    const startTime = Date.now();
    const response = await axios.get('https://rootx-osint.in/', {
      params: {
        type: 'tg_num',
        key: 'm3tary',
        query: query
      },
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const responseTime = `${Date.now() - startTime}ms`;

    const apiData = response.data;
    const rateInfo = {
      req_left: apiData.req_left || rateCheck.remaining,
      req_total: apiData.req_total || rateCheck.total,
      expiry: apiData.expiry || '01-09-2026',
      developer: apiData.developer || '@simpleguy444',
      cached: apiData.cached || false,
      response_time: apiData.response_time || responseTime
    };

    return res.json({
      success: true,
      data: apiData.data || apiData,
      rate_info: rateInfo,
      your_rate_remaining: rateCheck.remaining,
      api_expiry: '01-09-2026'
    });

  } catch (error) {
    console.error('[TG] Error:', error.message);
    
    if (error.response) {
      return res.status(error.response.status).json({
        error: 'Original API error',
        status: error.response.status,
        data: error.response.data,
        rate_info: {
          req_left: 'Unknown',
          req_total: 'Unknown',
          expiry: '01-09-2026',
          developer: '@simpleguy444'
        }
      });
    }
    
    return res.status(500).json({
      error: 'Failed to fetch Telegram data',
      message: error.message,
      rate_info: {
        expiry: '01-09-2026',
        developer: '@simpleguy444'
      }
    });
  }
});

// 4. CHECK RATE LIMITS - SEE ALL API RATES
app.get('/rates', (req, res) => {
  const now = Date.now();
  
  res.json({
    success: true,
    rate_limits: {
      search: {
        limit: 5000,
        remaining: rateLimits.search.limit - rateLimits.search.count,
        used: rateLimits.search.count,
        resets_in: Math.max(0, Math.floor((rateLimits.search.resetTime - now) / 1000 / 60 / 60)) + ' hours',
        expiry: '01-09-2026'
      },
      vehicle: {
        limit: 5000,
        remaining: rateLimits.vehicle.limit - rateLimits.vehicle.count,
        used: rateLimits.vehicle.count,
        resets_in: Math.max(0, Math.floor((rateLimits.vehicle.resetTime - now) / 1000 / 60 / 60)) + ' hours',
        expiry: '01-09-2026'
      },
      tg: {
        limit: 1000,
        remaining: rateLimits.tg.limit - rateLimits.tg.count,
        used: rateLimits.tg.count,
        resets_in: Math.max(0, Math.floor((rateLimits.tg.resetTime - now) / 1000 / 60 / 60)) + ' hours',
        expiry: '01-09-2026'
      }
    },
    api_expiry: '01-09-2026',
    developer: '@simpleguy444',
    timestamp: new Date().toISOString()
  });
});

// 5. HOME - SHOW ALL INFO
app.get('/', (req, res) => {
  const now = Date.now();
  
  res.json({
    status: '✅ API Clone Running',
    endpoints: {
      search: '/search?q=9876543210 (5000/day)',
      vehicle: '/vehicle?vehicle=KL41V3504 (5000/day)',
      tg: '/tg?query=123456789 (1000/day)',
      rates: '/rates (Check all rate limits)'
    },
    rate_limits: {
      search: {
        limit: 5000,
        remaining: rateLimits.search.limit - rateLimits.search.count,
        used: rateLimits.search.count
      },
      vehicle: {
        limit: 5000,
        remaining: rateLimits.vehicle.limit - rateLimits.vehicle.count,
        used: rateLimits.vehicle.count
      },
      tg: {
        limit: 1000,
        remaining: rateLimits.tg.limit - rateLimits.tg.count,
        used: rateLimits.tg.count
      }
    },
    api_expiry: '01-09-2026',
    developer: '@simpleguy444',
    timestamp: new Date().toISOString()
  });
});

// 6. 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    available: ['/', '/search', '/vehicle', '/tg', '/rates'],
    api_expiry: '01-09-2026',
    developer: '@simpleguy444'
  });
});

// ============ START SERVER ============
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 API Clone Server Running!`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`\n📌 Endpoints:`);
    console.log(`  GET  /search?q=9876543210`);
    console.log(`  GET  /vehicle?vehicle=KL41V3504`);
    console.log(`  GET  /tg?query=123456789`);
    console.log(`  GET  /rates (Check all rates)`);
    console.log(`\n⚠️  Rate Limits: Search:5k | Vehicle:5k | TG:1k (per day)`);
    console.log(`📅 API Expiry: 01-09-2026`);
    console.log(`👨‍💻 Developer: @simpleguy444\n`);
  });
}

module.exports = app;
