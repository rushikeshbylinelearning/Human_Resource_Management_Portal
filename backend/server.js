// backend/server.js
// CRITICAL: Set timezone to IST before any other code executes
process.env.TZ = 'Asia/Kolkata';

require('dotenv').config();

console.log(`🌏 Process timezone set to: ${process.env.TZ}`);

// Validate environment variables before starting
const { validateAndExit } = require('./utils/envValidator');
validateAndExit();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const connectDB = require('./db');
const path = require('path');
const session = require('express-session');
const { startScheduledJobs } = require('./services/cronService');

const { corsOptions } = require('./config/security');
const { requestLogger, logError, logger } = require('./utils/logger');
const { optimizeConnection, createIndexes } = require('./utils/database');
const { sanitizeInput } = require('./middleware/validation');
const authenticateToken = require('./middleware/authenticateToken');
const isAdminOrHr = require('./middleware/requireAdminOrHr');
const ssoService = require('./services/ssoService');
const performanceMonitor = require('./services/performanceMonitor');
const cacheService = require('./services/cacheService');
const ssoTokenAuth = require('./middleware/ssoTokenAuth');

// Pre-load all Mongoose models
require('./models/User');
require('./models/Shift');
require('./models/AttendanceLog');
require('./models/AttendanceSession');
require('./models/BreakLog');
require('./models/LeaveRequest');
require('./models/Setting');
require('./models/ExtraBreakRequest');
require('./models/EarlyCheckoutRequest');
require('./models/NewNotification');
require('./models/Holiday');
require('./models/LeaveYear');
require('./models/OfficeLocation');
require('./models/LeaveLedger');
require('./models/LeaveAccrualLock');
require('./models/EmployeeResourceRequest');
require('./models/RefreshToken');
require('./models/PolicyAcceptanceLog');
require('./models/EmployeeDocument');
require('./models/DocumentTemplate');
require('./models/EmployeeKycDocument');
require('./models/HRQuery');

// Route Imports
const authRoutes = require('./routes/auth');
const autoLoginRoutes = require('./routes/autoLogin');
const attendanceRoutes = require('./routes/attendance');
const breakRoutes = require('./routes/breaks');
const adminRoutes = require('./routes/admin/index');
const employeeRoutes = require('./routes/employees');
const shiftRoutes = require('./routes/shifts');
const leaveRoutes = require('./routes/leaves');
const settingsRoutes = require('./routes/settingsRoutes');
const reportsRoutes = require('./routes/reports');
const userRoutes = require('./routes/userRoutes');
const newNotificationRoutes = require('./routes/newNotifications');
const resourceRequestRoutes = require('./routes/resourceRequests');
const officeLocationRoutes = require('./routes/officeLocations');
const manageRoutes = require('./routes/manage');
const payrollRoutes = require('./routes/payrollRoutes');
const probationRoutes = require('./routes/probation');
const analyticsRoutes = require('./routes/analytics');
const leaveYearRoutes = require('./routes/leaveYearRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const datasetRoutes = require('./routes/datasetRoutes');

const User = require('./models/User');

const SSO_CONFIG = {
  secret: process.env.SSO_SECRET,
  issuer: process.env.SSO_ISSUER || 'sso-portal',
  audience: process.env.SSO_AUDIENCE || 'sso-apps',
  sessionSecret: (() => {
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
      throw new Error(
        'SESSION_SECRET is not set. Refusing to start with an insecure default. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
      );
    }
    return sessionSecret;
  })(),
  sessionMaxAge: 24 * 60 * 60 * 1000,
  jwksUrl: process.env.SSO_JWKS_URL,
  publicKey: process.env.SSO_PUBLIC_KEY,
  validateUrl: process.env.SSO_VALIDATE_URL,
};

const app = express();
app.set('trust proxy', 1);

// ─── PERFORMANCE FIX: Reduce per-request overhead ────────────────────────────
// Previously the server had THREE separate middleware layers that all manipulated
// X-Frame-Options and CSP frame-ancestors on EVERY request (including /api calls).
// Each intercepted res.setHeader(), res.writeHead(), and res.on('finish') with
// closures that were allocated anew per request.  On A2 Hosting's slower CPU
// this added measurable overhead per request.
//
// Fix: Use a single, lightweight middleware that only touches frame-related headers.
// X-Frame-Options removal is handled once in the helmet config (frameguard: false)
// and the CSP frame-ancestors is baked in statically by helmet itself.
// ─────────────────────────────────────────────────────────────────────────────

// Determine allowed iframe origins once at startup, not per-request.
const FRAME_ANCESTORS = process.env.NODE_ENV === 'development'
    ? ["'self'", "http://localhost:5173", "http://localhost:5174", "http://localhost:5175"]
    : ["'self'", "https://attendance.bylinelms.com", "https://sso.legatolxp.online", "https://sso.bylinelms.com"];

const defaultDirectives = helmet.contentSecurityPolicy.getDefaultDirectives();
delete defaultDirectives['frame-ancestors'];

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...defaultDirectives,
        'frame-ancestors': FRAME_ANCESTORS,
      },
    },
    frameguard: false, // We use CSP frame-ancestors instead of X-Frame-Options
  })
);

// Single lightweight middleware to ensure X-Frame-Options is absent
// (some Express/Node versions re-add it; one cheap removeHeader() is enough).
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  next();
});

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024,
}));

app.use(cors(corsOptions));

// Session middleware
app.use(session({
  secret: SSO_CONFIG.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    maxAge: SSO_CONFIG.sessionMaxAge,
    domain: undefined
  },
  name: 'connect.sid'
}));

const cookieParser = require('cookie-parser');
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInput);
app.use(requestLogger);
app.use(performanceMonitor.trackRequest.bind(performanceMonitor));

// Static file serving
const staticOptions = {
    setHeaders: (res, filepath) => {
        res.removeHeader('X-Frame-Options');
        const ext = path.extname(filepath).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (['.css', '.js'].includes(ext)) {
            res.set('Cache-Control', 'public, max-age=86400');
        } else if (ext === '.html') {
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else {
            res.set('Cache-Control', 'public, max-age=3600');
        }
        res.set('X-Content-Type-Options', 'nosniff');
    },
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
    etag: true,
    lastModified: true,
};

// Medical certificates via GridFS
app.get('/medical-certificates/:fileId', (req, res, next) => {
    const id = req.params.fileId;
    if (/^[a-fA-F0-9]{24}$/.test(id) && mongoose.connection.readyState === 1) {
        const { GridFSBucket } = require('mongodb');
        const { ObjectId } = require('mongodb');
        const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'medicalCertificates' });
        const downStream = bucket.openDownloadStream(new ObjectId(id));
        downStream.on('data', (chunk) => res.write(chunk));
        downStream.on('end', () => res.end());
        downStream.on('error', () => {
            if (!res.headersSent) res.status(404).json({ error: 'File not found' });
        });
        return;
    }
    next();
});
app.use('/medical-certificates', express.static(path.join(__dirname, 'uploads/medical-certificates'), staticOptions));
app.use('/public', express.static(path.join(__dirname, 'public'), staticOptions));

// Static-404 guard (before auth)
app.use((req, res, next) => {
  if (req.path.startsWith('/medical-certificates/') ||
      req.path.startsWith('/public/') ||
      req.path.startsWith('/policies/')) {
    return res.status(404).json({ error: 'File not found' });
  }
  next();
});

// ─── PUBLIC ROUTES ─────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

const ssoValidationRoutes = require('./routes/ssoValidation');
app.use('/api/auth', ssoValidationRoutes);

const ssoRoutes = require('./routes/ssoRoutes');
app.use('/api/sso', ssoRoutes);

app.use('/api/auto-login', autoLoginRoutes);

// Public form routes (no authentication required)
const publicFormRoutes = require('./routes/publicForm');
app.use('/api/public', publicFormRoutes);

// ─── SSO MIDDLEWARE ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/avatars') ||
      req.path.startsWith('/medical-certificates') ||
      req.path.startsWith('/public')) {
    return next();
  }
  return ssoTokenAuth(SSO_CONFIG)(req, res, next);
});

// ─── PROTECTED ROUTES ─────────────────────────────────────────────────────
app.use('/api/attendance', attendanceRoutes);
app.use('/api/breaks', breakRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/users', userRoutes);
app.use('/api/user', userRoutes);
app.use('/api/new-notifications', newNotificationRoutes);
app.use('/api/resource-requests', resourceRequestRoutes);
app.use('/api/admin/employees', employeeRoutes);
app.use('/api/admin/shifts', authenticateToken, isAdminOrHr, shiftRoutes); // F-HIGH-003: auth at router level
app.use('/api/admin/settings', settingsRoutes);
app.use('/api/admin/reports', reportsRoutes);
app.use('/api/admin/office-locations', officeLocationRoutes);
app.use('/api/admin/manage', manageRoutes);
app.use('/api/probation', probationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/admin/leave-years', leaveYearRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/admin/holiday-dataset', datasetRoutes);

const leaveAccrualRoutes = require('./routes/leaveAccrual');
app.use('/api/admin/leave-accrual', leaveAccrualRoutes);

const announcementRoutes = require('./routes/announcementRoutes');
app.use('/api/announcements', announcementRoutes);

const teaBreakRoutes = require('./routes/teaBreakRoutes');
app.use('/api/tea-break', teaBreakRoutes);

const cifRoutes = require('./modules/cif/cif.routes');
app.use('/api/admin/cif', cifRoutes);

const policiesRoutes = require('./routes/policies');
app.use('/api/policies', policiesRoutes);

const policiesGridFSRoutes = require('./routes/policiesGridFS');
app.use('/api/policies-gridfs', policiesGridFSRoutes);

const policyTemplatesRoutes = require('./routes/policyTemplates');
app.use('/api/policy-templates', policyTemplatesRoutes);

const consentRoutes = require('./routes/consent');
app.use('/api/consent', consentRoutes);

const onboardingRoutes = require('./routes/onboarding');
const employeeDocumentRoutes = require('./routes/employeeDocuments');
const kycRoutes = require('./routes/kyc');
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/employee-documents', employeeDocumentRoutes);
app.use('/api/kyc', kycRoutes);

const publicFormAdminRoutes = require('./routes/admin/publicFormAdmin');
app.use('/api/admin/public-form', publicFormAdminRoutes);

const hrQueryRoutes = require('./routes/hrQueries');
app.use('/api/hr-queries', hrQueryRoutes);

// ─── INTERNAL SERVICE ROUTES ──────────────────────────────────────────────────
// Read-only payroll feed consumed exclusively by salary-service.
// Protected by X-Service-Token (separate from user JWT).
// Bind this prefix at the reverse-proxy level to salary-service's server IP only
// for belt-and-suspenders on top of the token check.
const payrollFeedRoutes = require('./routes/internal/payrollFeed');
app.use('/internal/payroll-feed', payrollFeedRoutes);

// Read-only employee feed for salary-service to fetch employee list
const employeeFeedRoutes = require('./routes/internal/employeeFeed');
app.use('/internal/employees', employeeFeedRoutes);

// Health check endpoint — minimal public response; no internals exposed (A05-MED)
app.get('/health', async (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  res.json({ status: isConnected ? 'ok' : 'unhealthy' });
});

app.get('/metrics', authenticateToken, isAdminOrHr, (req, res) => res.json(performanceMonitor.getMetrics()));
app.get('/cache-stats', authenticateToken, isAdminOrHr, (req, res) => res.json(cacheService.getStats()));

app.post('/sso/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ success: false, message: 'Logout failed' });
    const redirectUrl = process.env.NODE_ENV === 'production'
      ? 'https://sso.bylinelms.com/login'
      : 'http://localhost:5173/login';
    res.json({ success: true, message: 'Logged out', redirectUrl });
  });
});

// 404 for unmatched /api routes
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'API route not found',
    path: req.path,
    method: req.method,
  });
});

const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// Frontend static serving — supports frontend/dist (local build) or frontend/ (A2 deploy)
const fs = require('fs');
const resolveFrontendDir = () => {
  if (process.env.FRONTEND_DIST_PATH) {
    return path.resolve(__dirname, process.env.FRONTEND_DIST_PATH);
  }
  const candidates = [
    path.join(__dirname, '../frontend/dist'),
    path.join(__dirname, '../frontend'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return candidates[0];
};
const FRONTEND_DIR = resolveFrontendDir();

const frontendStaticOptions = {
    setHeaders: (res, filepath) => {
        res.removeHeader('X-Frame-Options');
        const ext = path.extname(filepath).toLowerCase();
        if (filepath.includes('-') && ['.js', '.css', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.woff', '.woff2'].includes(ext)) {
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
            res.set('Cache-Control', 'public, max-age=31536000');
        } else if (['.css', '.js'].includes(ext)) {
            res.set('Cache-Control', 'public, max-age=86400');
        } else if (ext === '.html') {
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else {
            res.set('Cache-Control', 'public, max-age=3600');
        }
        res.set('X-Content-Type-Options', 'nosniff');
    },
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
    etag: true,
    lastModified: true,
    index: false,
};

app.use(express.static(FRONTEND_DIR, frontendStaticOptions));

// SPA fallback
app.use((req, res, next) => {
  if (req.path.startsWith('/api') ||
      req.path.startsWith('/internal') ||
      req.path.startsWith('/avatars') ||
      req.path.startsWith('/medical-certificates') ||
      req.path.startsWith('/public') ||
      req.path.startsWith('/api/socket.io')) {
    return next();
  }

  res.removeHeader('X-Frame-Options');

  const indexPath = path.join(FRONTEND_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    res.set('Cache-Control', 'no-cache');
    return res.status(503).send(
      '<!DOCTYPE html><html><body><h1>Frontend not built</h1><p>Deploy frontend/dist (or frontend/) or set FRONTEND_DIST_PATH.</p></body></html>'
    );
  }
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(indexPath, (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: 'Internal server error' });
  });
});

const PORT = process.env.PORT || 3011;
const httpServer = require('http').createServer(app);

const { init } = require('./socket');
init(httpServer);

const startServer = async () => {
  try {
    console.log('🔗 Starting server initialization...');
    await connectDB();
    console.log('✅ MongoDB connected');

    try {
      const jwtUtils = require('./utils/jwtUtils');
      jwtUtils.validateRS256Configuration();
    } catch (jwtConfigError) {
      console.error('❌ JWT config error:', jwtConfigError.message);
    }

    try {
      await createIndexes();
      console.log('✅ Database indexes ready');
    } catch (error) {
      console.error('Failed to create indexes:', error);
    }

    startScheduledJobs();

    try {
      const { restoreActiveTeaBreakJobs } = require('./jobs/teaBreakEnforcer');
      await restoreActiveTeaBreakJobs();
    } catch (teaErr) {
      console.error('[TeaBreak] Failed to restore active jobs:', teaErr.message);
    }

    const activeYearCache = require('./services/activeYearCache');
    require('./services/attendanceSync');
    await activeYearCache.warmUp();

    const ssoPublicKeyUrl = process.env.SSO_PUBLIC_KEY_URL;
    const ssoJwksUrl = process.env.SSO_JWKS_URL;

    if (ssoPublicKeyUrl) {
      await ssoService.initialize();
      console.log('[SSO] Legacy SSO initialized');
    } else if (ssoJwksUrl) {
      console.log('[SSO] JWKS SSO enabled:', ssoJwksUrl);
    } else {
      console.log('[SSO] SSO disabled');
    }

    const fs = require('fs');
    const privateKeyPath = path.resolve(__dirname, process.env.JWT_PRIVATE_KEY_PATH || './keys/private.pem');
    const publicKeyPath  = path.resolve(__dirname, process.env.JWT_PUBLIC_KEY_PATH  || './keys/public.pem');
    if (!fs.existsSync(privateKeyPath)) console.error('❌ Private key MISSING at:', privateKeyPath);
    else console.log('✅ Private key found');
    if (!fs.existsSync(publicKeyPath)) console.error('❌ Public key MISSING at:', publicKeyPath);
    else console.log('✅ Public key found');

    console.log(`📁 Frontend static dir: ${FRONTEND_DIR}`);

    // Docker needs 0.0.0.0 so other containers can reach this process.
    // Local non-Docker dev stays on 127.0.0.1 unless HOST is set.
    const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
    httpServer.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on ${HOST}:${PORT} (${process.env.NODE_ENV || 'development'})`);
    });

  } catch (err) {
    console.error('❌ CRITICAL SERVER STARTUP ERROR:', err.message);
    console.error(err.stack);
    setTimeout(() => process.exit(1), 2000);
  }
};

startServer();
