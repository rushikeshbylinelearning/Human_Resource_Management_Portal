import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { muiIconPathImports } from './vite-plugin-mui-icon-paths.js'

// Docker Compose: BACKEND_PROXY_TARGET=http://backend:5000
// Local (non-Docker): Vite proxies to this machine's backend.
const backendTarget = process.env.BACKEND_PROXY_TARGET || 'http://127.0.0.1:3011'

export default defineConfig({
  plugins: [
    muiIconPathImports(),
    react({
      // Use automatic JSX runtime (modern standard for React 17+)
      // This doesn't require explicit React imports in every file
      jsxRuntime: 'automatic',
    }),
    tailwindcss(),
    // Vite plugin to set iframe embedding headers
    {
      name: 'configure-response-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Remove X-Frame-Options
          res.removeHeader('X-Frame-Options');
          
          // Set CSP frame-ancestors for HTML responses
          if (req.url === '/' || req.url.endsWith('.html') || (!req.url.includes('.') && !req.url.startsWith('/api'))) {
            const allowedOrigins = process.env.NODE_ENV === 'development' 
              ? "http://localhost:5173"
              : "https://attendance.bylinelms.com";
            
            const existingCSP = res.getHeader('Content-Security-Policy') || '';
            if (existingCSP && !existingCSP.includes('frame-ancestors')) {
              res.setHeader('Content-Security-Policy', `${existingCSP}; frame-ancestors ${allowedOrigins};`);
            } else if (!existingCSP) {
              res.setHeader('Content-Security-Policy', `frame-ancestors ${allowedOrigins};`);
            }
          }
          
          next();
        });
      },
    },







    // Bundle analyzer for production builds
    process.env.ANALYZE && visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    })
  ].filter(Boolean),
  server: {
    // Increase HMR timeout to prevent connection issues
    hmr: {
      overlay: true,
    },
    proxy: {
      // --- WebSocket proxy MUST come before /api to avoid being intercepted ---
      '/api/socket.io': {
        target: backendTarget,
        ws: true,
        changeOrigin: true,
        secure: false,
      },
      // --- Development proxy configuration ---
      '/api': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        // Rewrite cookie domain so Set-Cookie headers from the backend
        // (domain: 127.0.0.1:3011) are accepted by the browser under localhost:5173.
        // Without this the Vite proxy strips / blocks httpOnly cookies on the
        // /api/auth/login and /api/auth/refresh responses.
        cookieDomainRewrite: {
          '127.0.0.1': 'localhost',
          '*': '',
        },
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, res) => {
            // Only log if it's not a connection refused error (server might be starting)
            if (err.code !== 'ECONNREFUSED') {
              console.log('[Vite Proxy] Error:', err.message);
            }
            // Don't send response if already sent
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                error: `Backend server is not available. Please ensure the backend is reachable at ${backendTarget}.` 
              }));
            }
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Add timeout handling
            proxyReq.setTimeout(10000, () => {
              if (!res.headersSent) {
                res.writeHead(504, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Request timeout' }));
              }
            });
          });
        },
      },
      // --- Avatar images proxy for development ---
      '/avatars': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, res) => {
            // Only log if it's not a connection refused error (server might be starting)
            if (err.code !== 'ECONNREFUSED') {
              console.log('[Vite Proxy] Avatar error:', err.message);
            }
            // Don't send response if already sent
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                error: 'Backend server is not available.' 
              }));
            }
          });
        },
      },
      // --- Policy PDFs proxy for development ---
      '/policies': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, res) => {
            if (err.code !== 'ECONNREFUSED') {
              console.log('[Vite Proxy] Policies error:', err.message);
            }
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                error: 'Backend server is not available.' 
              }));
            }
          });
        },
      }
    }
  },
  build: {
    // Optimized build configuration for production
    target: 'es2015',
    minify: 'terser',
    // Native modulepreload is supported in current browsers. Keep the runtime
    // helper so lazy CSS/JS deps are still preloaded; isolate it below so it
    // cannot live inside a heavy vendor chunk.
    modulePreload: {
      polyfill: true,
      // The entry graph contains lazy(() => import(page)) for every route.
      // Default modulepreload would fetch PDF/export stacks on /dashboard.
      resolveDependencies: (_filename, deps) => {
        const deny = /vendor-(jspdf|pdfjs|xlsx|html2canvas|recharts|mui-datagrid|mui-datepickers)|ReportsPage|EmployeesPage|AdminLeaves|LeavesTracker|AnalyticsPage|CIFManagement|PolicyTemplate|HolidayManagement|PublicProfileForm|LogDetailModal|EnhancedLeaveRequest|AttendanceSummary|ActivityLog|SchedulingManagement|ProbationPage|MusterRoll|DeactivatedEmployees|LiveAttendance/;
        return deps.filter((dep) => !deny.test(dep.replace(/\\/g, '/')));
      },
    },
    terserOptions: {
      compress: {
        drop_console: true, // Remove console logs in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      },
      format: {
        comments: false, // Remove comments
      },
    },
    // Optimized chunking strategy for better performance
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico|webp/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`;
          } else if (/woff|woff2|eot|ttf|otf/i.test(ext)) {
            return `assets/fonts/[name]-[hash][extname]`;
          }
          return `assets/[ext]/[name]-[hash][extname]`;
        },
        // Manual chunks to split vendor libraries and reduce main bundle size.
        // Match on the npm package name, not a substring of the path.
        // `id.includes('react')` previously put @emotion/react and react-pdf into
        // vendor-react while their internals stayed in other chunks, creating a
        // circular graph and "Cannot access 'b' before initialization" in production.
        manualChunks: (id) => {
          // Vite's import() preload helper must not share a chunk with a heavy
          // vendor library. Rollup otherwise places it in vendor-jspdf, and the
          // entry statically imports that 360KB chunk on every page.
          if (id.includes('preload-helper')) return 'vite-preload';

          if (!id.includes('node_modules')) return;

          const afterNm = id.replace(/\\/g, '/').split('node_modules/').pop();
          const pkg = afterNm.startsWith('@')
            ? afterNm.split('/').slice(0, 2).join('/')
            : afterNm.split('/')[0];

          if (pkg === 'xlsx') return 'vendor-xlsx';
          if (pkg === 'jspdf' || pkg === 'jspdf-autotable') return 'vendor-jspdf';
          if (pkg === 'html2canvas') return 'vendor-html2canvas';
          if (pkg === 'recharts' || pkg === 'victory-vendor') return 'vendor-recharts';
          if (pkg === 'pdfjs-dist' || pkg === 'react-pdf') return 'vendor-pdfjs';
          if (pkg === 'dompurify') return 'vendor-dompurify';

          // Emotion must live with MUI — never with vendor-react.
          if (pkg.startsWith('@emotion/') || pkg === 'stylis' || pkg === 'react-transition-group') {
            return 'vendor-mui-core';
          }
          if (pkg === '@mui/x-data-grid') return 'vendor-mui-datagrid';
          if (pkg === '@mui/x-date-pickers') return 'vendor-mui-datepickers';
          if (pkg === '@mui/icons-material') return 'vendor-mui-icons';
          if (pkg.startsWith('@mui/') || pkg === '@popperjs/core') return 'vendor-mui-core';

          if (
            pkg === 'react' ||
            pkg === 'react-dom' ||
            pkg === 'scheduler' ||
            pkg === 'react-is' ||
            pkg === 'react-router' ||
            pkg === 'react-router-dom' ||
            pkg === 'hoist-non-react-statics'
          ) {
            return 'vendor-react';
          }

          if (
            pkg === 'socket.io-client' ||
            pkg === 'engine.io-client' ||
            pkg === 'socket.io-parser'
          ) {
            return 'vendor-socket';
          }

          if (pkg === 'date-fns' || pkg === 'dayjs') return 'vendor-dates';

          return 'vendor-other';
        },
      },
    },
    // Enable hidden source maps for production error tracking (not publicly served)
    sourcemap: 'hidden',
    // Increase chunk size limit (after splitting, individual chunks should be smaller)
    chunkSizeWarningLimit: 600,
    // Optimize assets
    assetsInlineLimit: 4096, // 4kb - inline small assets as base64
    cssCodeSplit: true, // Split CSS for better caching
    reportCompressedSize: true, // Report compressed size
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      '@emotion/react',
      '@emotion/styled',
      '@emotion/cache',
      '@mui/material',
      '@mui/utils',
      '@mui/icons-material/Add',
      '@mui/icons-material/EditOutlined',
      '@mui/icons-material/DeleteOutline',
      // Pre-bundle deps used by lazy-loaded pages (prevents "Outdated Optimize Dep" 504s)
      'date-fns',
      'jspdf',
      'jspdf-autotable',
      'xlsx',
      '@mui/x-date-pickers',
      '@mui/x-date-pickers/LocalizationProvider',
      '@mui/x-date-pickers/AdapterDateFns',
      '@mui/x-date-pickers/DatePicker',
      '@mui/x-date-pickers/DesktopDatePicker',
      // Icon subpath imports used in ReportsPage (and similar routes)
      '@mui/icons-material/Download',
      '@mui/icons-material/PictureAsPdf',
      '@mui/icons-material/TableChart',
      '@mui/icons-material/Description',
      '@mui/icons-material/Assessment',
      '@mui/icons-material/EventNote',
      '@mui/icons-material/History',
      // Leave side panels (LeaveRequestForm)
      '@mui/icons-material/BeachAccess',
      '@mui/icons-material/WorkspacePremium',
      '@mui/icons-material/LocalHospital',
      '@mui/icons-material/Update',
      '@mui/icons-material/WarningAmber',
      '@mui/icons-material/Category',
      '@mui/icons-material/KeyboardArrowDown',
      '@mui/icons-material/Close',
      '@mui/icons-material/CalendarToday',
      '@mui/icons-material/EventAvailable',
      '@mui/icons-material/WbSunnyOutlined',
      '@mui/icons-material/WbTwilight',
      '@mui/icons-material/Schedule',
      '@mui/icons-material/CheckCircle',
      '@mui/x-date-pickers/StaticDatePicker',
      '@mui/x-date-pickers/StaticDateTimePicker',
      'react-is',
      'prop-types',
      // PDF.js dependencies
      'react-pdf',
      'pdfjs-dist',
    ],
    exclude: [
      // Exclude worker files from optimization
      'pdfjs-dist/build/pdf.worker.min.mjs',
      // Never prebundle icon barrels — they become a 6MB+ parse on every page.
      // Per-icon files are rewritten by vite-plugin-mui-icon-paths.js.
      '@mui/icons-material',
      'lucide-react',
    ],
    esbuildOptions: {
      // Ensure proper initialization order
      target: 'es2015',
    },
    // Do not force re-optimization on every dev start — it invalidates browser
    // module hashes and causes "Failed to fetch dynamically imported module".
  },
  // Resolve configuration to prevent React duplication
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      '@emotion/react',
      '@emotion/styled',
      'react-is',
      'prop-types',
      '@mui/x-date-pickers',
    ],
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js'),
      '@emotion/react': path.resolve(__dirname, 'node_modules/@emotion/react'),
      '@emotion/styled': path.resolve(__dirname, 'node_modules/@emotion/styled'),
      'react-is': path.resolve(__dirname, 'node_modules/react-is'),
      'prop-types': path.resolve(__dirname, 'node_modules/prop-types'),
      '@mui/x-date-pickers': path.resolve(__dirname, 'node_modules/@mui/x-date-pickers'),
    },
  },
  // CSS optimization
  css: {
    devSourcemap: false,
  },
});