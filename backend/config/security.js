// Security configuration for the application
const cors = require('cors');

const PRODUCTION_AMS_ORIGINS = [
  'https://attendance.bylinelms.com',
  'https://attendance-test.bylinelms.com', // staging
];

const SSO_ORIGINS = [
  'https://sso.legatolxp.online',
  'https://sso.bylinelms.com',
];

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3011',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3011',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
];

function normalizeOrigin(url) {
  if (!url) return null;
  const trimmed = String(url).trim().replace(/\/$/, '');
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
}

/** Shared allow-list for Express CORS and Socket.IO */
function buildAllowedOrigins() {
  const origins = new Set([
    ...PRODUCTION_AMS_ORIGINS,
    ...SSO_ORIGINS,
  ]);

  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',')
      .map((o) => normalizeOrigin(o))
      .filter(Boolean)
      .forEach((o) => origins.add(o));
  }

  const frontendOrigin = normalizeOrigin(process.env.FRONTEND_URL);
  if (frontendOrigin) origins.add(frontendOrigin);

  if (process.env.NODE_ENV === 'development') {
    DEV_ORIGINS.forEach((o) => origins.add(o));
  }

  return [...origins];
}

// CORS configuration
// NOTE: In production, only HTTPS origins should be allowed for SSO
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, same-origin via Apache proxy, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = buildAllowedOrigins();
    
    // In production, enforce HTTPS for SSO origins
    if (process.env.NODE_ENV === 'production' && origin.startsWith('http://')) {
      console.warn('[CORS] Rejecting non-HTTPS origin in production:', origin);
      return callback(new Error('HTTPS required in production'));
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('[CORS] Origin not allowed:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Connection',
    'Upgrade',
    'Sec-WebSocket-Key',
    'Sec-WebSocket-Version',
    'Sec-WebSocket-Protocol',
    'Sec-WebSocket-Extensions'
  ]
};

module.exports = {
  corsOptions,
  buildAllowedOrigins,
};
