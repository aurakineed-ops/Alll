const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============ CONFIG ============
const API_EXPIRY = '01-09-2026';
const DEVELOPER = '@sahilxalone';
const CACHE_TTL = 3600;

// Rate Limits
const RATE_LIMITS = {
  search: parseInt(process.env.SEARCH_LIMIT) || 5000,
  vehicle: parseInt(process.env.VEHICLE_LIMIT) || 5000,
  mobile: parseInt(process.env.MOBILE_LIMIT) || 5000,
  tg: parseInt(process.env.TG_LIMIT) || 1000
};

// ============ REDIS SETUP ============
let redis = null;
try {
  const { Redis } = require('@upstash/redis');
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv();
    console.log('✅ Redis connected');
  }
} catch (e) {
  console.log('⚠️ Redis not configured, using memory fallback');
}

// ============ IN-MEMORY FALLBACK ============
const memoryStore = {
  search: { count: 0, resetTime: Date.now() + 86400000 },
  vehicle: { count: 0, resetTime: Date.now() + 86400000 },
  mobile: { count: 0, resetTime: Date.now() + 86400000 },
  tg: { count: 0, resetTime: Date.now() + 86400000 }
};

// ============ RATE LIMITER ============
async function checkRateLimit(type, identifier = 'global') {
  const key = `rate_limit:${type}:${identifier}`;
  const limit = RATE_LIMITS[type];

  if (redis) {
    try {
      const current = await redis.get(key);
      
      if (!current) {
        await redis.setex(key, 86400, 1);
        return { allowed: true, remaining: limit - 1, total: limit, used: 1 };
      }

      const count = parseInt(current);
      if (count >= limit) {
        return { allowed: false, remaining: 0, total: limit, used: count };
      }

      const newCount = await redis.incr(key);
      return { allowed: true, remaining: limit - newCount, total: limit, used: newCount };
    } catch (error) {
      console.error('Redis error, using memory:', error.message);
    }
  }

  // Memory fallback
  const now = Date.now();
  const store = memoryStore[type];

  if (now > store.resetTime) {
    store.count = 0;
    store.resetTime = now + 86400000;
  }

  if (store.count >= limit) {
    return { allowed: false, remaining: 0, total: limit, used: store.count };
  }

  store.count++;
  return { allowed: true, remaining: limit - store.count, total: limit, used: store.count };
}

// ============ CACHE FUNCTIONS ============
async function getCache(key) {
  if (!redis) return null;
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (e) { return null; }
}

async function setCache(key, data, ttl = CACHE_TTL) {
  if (!redis) return false;
  try {
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

function getCacheKey(endpoint, params) {
  return `cache:${endpoint}:${JSON.stringify(params)}`;
}

// ============ MIDDLEWARE ============
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============ API ROUTES ============

// 1. SEARCH API
app.get('/search', async (req, res) => {
  const { q } = req.query;
  
  if (!q) {
    return res.status(400).json({
      success: false,
      error: 'Missing parameter: q',
      usage: '/search?q=9876543210',
      expiry: API_EXPIRY,
      developer: DEVELOPER
    });
  }

  try {
    const cacheKey = getCacheKey('search', { q });
    const cached = await getCache(cacheKey);
    
    if (cached) {
      return res.json({
        ...cached,
        cached: true,
        response_time: '0ms'
      });
    }

    const rateCheck = await checkRateLimit('search');
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded (5000/day)',
        rate_info: {
          req_left: 0,
          req_total: rateCheck.total,
          used: rateCheck.used,
          expiry: API_EXPIRY,
          developer: DEVELOPER
        }
      });
    }

    const startTime = Date.now();
    const response = await axios.get('https://leakapi.dpdns.org/search', {
      params: { q },
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const responseTime = `${Date.now() - startTime}ms`;

    const apiData = response.data;
    const result = {
      success: true,
      data: apiData.data || apiData,
      rate_info: {
        req_left: apiData.req_left || rateCheck.remaining,
        req_total: apiData.req_total || rateCheck.total,
        expiry: apiData.expiry || API_EXPIRY,
        developer: apiData.developer || DEVELOPER,
        cached: false,
        response_time: apiData.response_time || responseTime
      },
      your_rate_remaining: rateCheck.remaining,
      api_expiry: API_EXPIRY,
      timestamp: new Date().toISOString()
    };

    await setCache(cacheKey, result);
    return res.json(result);

  } catch (error) {
    console.error('[SEARCH] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch search data',
      message: error.message,
      expiry: API_EXPIRY,
      developer: DEVELOPER
    });
  }
});

// 2. VEHICLE API
app.get('/vehicle', async (req, res) => {
  const { vehicle } = req.query;
  
  if (!vehicle) {
    return res.status(400).json({
      success: false,
      error: 'Missing parameter: vehicle',
      usage: '/vehicle?vehicle=KL41V3504',
      expiry: API_EXPIRY,
      developer: DEVELOPER
    });
  }

  try {
    const cacheKey = getCacheKey('vehicle', { vehicle });
    const cached = await getCache(cacheKey);
    
    if (cached) {
      return res.json({
        ...cached,
        cached: true,
        response_time: '0ms'
      });
    }

    const rateCheck = await checkRateLimit('vehicle');
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded (5000/day)',
        rate_info: {
          req_left: 0,
          req_total: rateCheck.total,
          used: rateCheck.used,
          expiry: API_EXPIRY,
          developer: DEVELOPER
        }
      });
    }

    const startTime = Date.now();
    const response = await axios.get('https://leakapi.dpdns.org/api/vehicle', {
      params: { vehicle },
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const responseTime = `${Date.now() - startTime}ms`;

    const apiData = response.data;
    
    if (!apiData.success) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found',
        message: 'Invalid vehicle number or no data available',
        expiry: API_EXPIRY,
        developer: DEVELOPER
      });
    }

    const result = {
      success: true,
      data: apiData.data,
      rate_info: {
        req_left: rateCheck.remaining,
        req_total: rateCheck.total,
        expiry: API_EXPIRY,
        developer: DEVELOPER,
        cached: false,
        response_time: responseTime
      },
      your_rate_remaining: rateCheck.remaining,
      api_expiry: API_EXPIRY,
      timestamp: new Date().toISOString()
    };

    await setCache(cacheKey, result);
    return res.json(result);

  } catch (error) {
    console.error('[VEHICLE] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch vehicle data',
      message: error.message,
      expiry: API_EXPIRY,
      developer: DEVELOPER
    });
  }
});

// 3. MOBILE API
app.get('/mobile', async (req, res) => {
  const { vehicle } = req.query;
  
  if (!vehicle) {
    return res.status(400).json({
      success: false,
      error: 'Missing parameter: vehicle',
      usage: '/mobile?vehicle=KL41V3504',
      expiry: API_EXPIRY,
      developer: DEVELOPER
    });
  }

  try {
    const cacheKey = getCacheKey('mobile', { vehicle });
    const cached = await getCache(cacheKey);
    
    if (cached) {
      return res.json({
        ...cached,
        cached: true,
        response_time: '0ms'
      });
    }

    const rateCheck = await checkRateLimit('mobile');
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded (5000/day)',
        rate_info: {
          req_left: 0,
          req_total: rateCheck.total,
          used: rateCheck.used,
          expiry: API_EXPIRY,
          developer: DEVELOPER
        }
      });
    }

    const startTime = Date.now();
    const response = await axios.get('https://leakapi.dpdns.org/api/mobile', {
      params: { vehicle },
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const responseTime = `${Date.now() - startTime}ms`;

    const apiData = response.data;
    
    if (!apiData.success) {
      return res.status(404).json({
        success: false,
        error: 'Mobile number not found',
        message: 'Invalid vehicle number or no mobile data available',
        expiry: API_EXPIRY,
        developer: DEVELOPER
      });
    }

    const result = {
      success: true,
      data: {
        chassis_number: apiData.chassis_number,
        engine_number: apiData.engine_number,
        mobile_number: apiData.mobile_number
      },
      rate_info: {
        req_left: rateCheck.remaining,
        req_total: rateCheck.total,
        expiry: API_EXPIRY,
        developer: DEVELOPER,
        cached: false,
        response_time: responseTime,
        response_time_seconds: apiData.response_time_seconds || 'N/A'
      },
      your_rate_remaining: rateCheck.remaining,
      api_expiry: API_EXPIRY,
      timestamp: new Date().toISOString()
    };

    await setCache(cacheKey, result);
    return res.json(result);

  } catch (error) {
    console.error('[MOBILE] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch mobile data',
      message: error.message,
      expiry: API_EXPIRY,
      developer: DEVELOPER
    });
  }
});

// 4. TELEGRAM OSINT API (FINAL FIX - NO DUPLICATE)
app.get('/tg', async (req, res) => {
  const { query } = req.query;
  
  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'Missing parameter: query',
      usage: '/tg?query=123456789',
      expiry: API_EXPIRY,
      developer: DEVELOPER
    });
  }

  try {
    const cacheKey = getCacheKey('tg', { query });
    const cached = await getCache(cacheKey);
    
    if (cached) {
      return res.json({
        ...cached,
        cached: true,
        response_time: '0ms'
      });
    }

    const rateCheck = await checkRateLimit('tg');
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded (1000/day)',
        rate_info: {
          req_left: 0,
          req_total: rateCheck.total,
          used: rateCheck.used,
          expiry: API_EXPIRY,
          developer: DEVELOPER
        }
      });
    }

    const startTime = Date.now();
    const response = await axios.get('https://rootx-osint.in/', {
      params: {
        type: 'tg_num',
        key: 'm3tary',
        query: query
      },
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const responseTime = `${Date.now() - startTime}ms`;

    const apiData = response.data;
    
    // ✅ FINAL FIX: Sirf required data lo, baaki sab ignore
    const cleanData = {
      msg: apiData.msg || apiData.data?.msg || 'Details fetched',
      tg_id: apiData.tg_id || apiData.data?.tg_id || query,
      country: apiData.country || apiData.data?.country || 'N/A',
      country_code: apiData.country_code || apiData.data?.country_code || 'N/A',
      number: apiData.number || apiData.data?.number || 'N/A'
    };

    const rateInfo = {
      req_left: apiData.req_left || apiData.data?.req_left || rateCheck.remaining,
      req_total: apiData.req_total || apiData.data?.req_total || rateCheck.total,
      expiry: apiData.expiry || apiData.data?.expiry || API_EXPIRY,
      developer: DEVELOPER,
      cached: false,
      response_time: apiData.response_time || apiData.data?.response_time || responseTime
    };

    const result = {
      success: true,
      data: cleanData,
      rate_info: rateInfo,
      your_rate_remaining: rateCheck.remaining,
      api_expiry: API_EXPIRY,
      timestamp: new Date().toISOString()
    };

    await setCache(cacheKey, result);
    return res.json(result);

  } catch (error) {
    console.error('[TG] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch Telegram data',
      message: error.message,
      expiry: API_EXPIRY,
      developer: DEVELOPER
    });
  }
});

// 5. RATE STATUS
app.get('/rates', async (req, res) => {
  try {
    let searchStats, vehicleStats, mobileStats, tgStats;

    if (redis) {
      const [s, v, m, t] = await Promise.all([
        redis.get('rate_limit:search:global'),
        redis.get('rate_limit:vehicle:global'),
        redis.get('rate_limit:mobile:global'),
        redis.get('rate_limit:tg:global')
      ]);
      
      searchStats = {
        limit: RATE_LIMITS.search,
        remaining: Math.max(0, RATE_LIMITS.search - (parseInt(s) || 0)),
        used: parseInt(s) || 0
      };
      vehicleStats = {
        limit: RATE_LIMITS.vehicle,
        remaining: Math.max(0, RATE_LIMITS.vehicle - (parseInt(v) || 0)),
        used: parseInt(v) || 0
      };
      mobileStats = {
        limit: RATE_LIMITS.mobile,
        remaining: Math.max(0, RATE_LIMITS.mobile - (parseInt(m) || 0)),
        used: parseInt(m) || 0
      };
      tgStats = {
        limit: RATE_LIMITS.tg,
        remaining: Math.max(0, RATE_LIMITS.tg - (parseInt(t) || 0)),
        used: parseInt(t) || 0
      };
    } else {
      searchStats = {
        limit: RATE_LIMITS.search,
        remaining: Math.max(0, RATE_LIMITS.search - memoryStore.search.count),
        used: memoryStore.search.count
      };
      vehicleStats = {
        limit: RATE_LIMITS.vehicle,
        remaining: Math.max(0, RATE_LIMITS.vehicle - memoryStore.vehicle.count),
        used: memoryStore.vehicle.count
      };
      mobileStats = {
        limit: RATE_LIMITS.mobile,
        remaining: Math.max(0, RATE_LIMITS.mobile - memoryStore.mobile.count),
        used: memoryStore.mobile.count
      };
      tgStats = {
        limit: RATE_LIMITS.tg,
        remaining: Math.max(0, RATE_LIMITS.tg - memoryStore.tg.count),
        used: memoryStore.tg.count
      };
    }

    const now = new Date();
    const expiryDate = new Date('2026-09-01');
    const daysUntilExpiry = Math.max(0, Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24)));

    return res.json({
      success: true,
      rate_limits: {
        search: searchStats,
        vehicle: vehicleStats,
        mobile: mobileStats,
        tg: tgStats
      },
      api_info: {
        expiry: API_EXPIRY,
        days_until_expiry: daysUntilExpiry,
        developer: DEVELOPER,
        status: daysUntilExpiry > 0 ? 'Active' : 'Expired'
      },
      cache_status: redis ? 'Redis Enabled' : 'Memory Mode',
      timestamp: now.toISOString()
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch rate stats',
      expiry: API_EXPIRY,
      developer: DEVELOPER
    });
  }
});

// 6. HOME
app.get('/', async (req, res) => {
  const now = new Date();
  const expiryDate = new Date('2026-09-01');
  const daysUntilExpiry = Math.max(0, Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24)));

  let searchUsed = 0, vehicleUsed = 0, mobileUsed = 0, tgUsed = 0;
  
  if (redis) {
    const [s, v, m, t] = await Promise.all([
      redis.get('rate_limit:search:global'),
      redis.get('rate_limit:vehicle:global'),
      redis.get('rate_limit:mobile:global'),
      redis.get('rate_limit:tg:global')
    ]);
    searchUsed = parseInt(s) || 0;
    vehicleUsed = parseInt(v) || 0;
    mobileUsed = parseInt(m) || 0;
    tgUsed = parseInt(t) || 0;
  } else {
    searchUsed = memoryStore.search.count;
    vehicleUsed = memoryStore.vehicle.count;
    mobileUsed = memoryStore.mobile.count;
    tgUsed = memoryStore.tg.count;
  }

  res.json({
    success: true,
    status: '🚀 API Clone Running',
    version: '2.0.0',
    endpoints: {
      search: '/search?q=9876543210 (5000/day)',
      vehicle: '/vehicle?vehicle=KL41V3504 (5000/day)',
      mobile: '/mobile?vehicle=KL41V3504 (5000/day)',
      tg: '/tg?query=123456789 (1000/day)',
      rates: '/rates (Check all limits)'
    },
    rate_limits: {
      search: { limit: RATE_LIMITS.search, used: searchUsed, remaining: Math.max(0, RATE_LIMITS.search - searchUsed) },
      vehicle: { limit: RATE_LIMITS.vehicle, used: vehicleUsed, remaining: Math.max(0, RATE_LIMITS.vehicle - vehicleUsed) },
      mobile: { limit: RATE_LIMITS.mobile, used: mobileUsed, remaining: Math.max(0, RATE_LIMITS.mobile - mobileUsed) },
      tg: { limit: RATE_LIMITS.tg, used: tgUsed, remaining: Math.max(0, RATE_LIMITS.tg - tgUsed) }
    },
    api_info: {
      expiry: API_EXPIRY,
      days_until_expiry: daysUntilExpiry,
      developer: DEVELOPER,
      status: daysUntilExpiry > 0 ? '✅ Active' : '❌ Expired'
    },
    cache: {
      status: redis ? 'Redis Enabled' : 'Memory Mode',
      ttl: `${CACHE_TTL}s (${Math.floor(CACHE_TTL/60)}m)`
    },
    timestamp: now.toISOString()
  });
});

// 7. 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    available: ['/', '/search', '/vehicle', '/mobile', '/tg', '/rates'],
    expiry: API_EXPIRY,
    developer: DEVELOPER
  });
});

// ============ START ============
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🚀 API CLONE PRO`);
    console.log(`${'='.repeat(50)}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`📅 Expiry: ${API_EXPIRY}`);
    console.log(`👨‍💻 Developer: ${DEVELOPER}`);
    console.log(`\n📌 Endpoints:`);
    console.log(`  GET  /search?q=9876543210`);
    console.log(`  GET  /vehicle?vehicle=KL41V3504`);
    console.log(`  GET  /mobile?vehicle=KL41V3504`);
    console.log(`  GET  /tg?query=123456789  (FIXED)`);
    console.log(`  GET  /rates`);
    console.log(`\n⚡ Rate Limits: Search:5k | Vehicle:5k | Mobile:5k | TG:1k`);
    console.log(`💾 Cache: ${redis ? 'Redis' : 'Memory'}`);
    console.log(`${'='.repeat(50)}\n`);
  });
}

module.exports = app;
