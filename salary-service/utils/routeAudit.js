'use strict';
// utils/routeAudit.js
//
// Startup self-check: diffs the Express router stack against a registry of
// routes that MUST have authentication middleware.
//
// Inspired by the AMS audit finding F-HIGH-003 — unauthenticated route shipped
// because the auth middleware was applied at a different level and not caught in review.
//
// How it works:
//   1. Walk the Express app's router stack, collecting all registered path+method combos.
//   2. Cross-reference each against EXEMPT_ROUTES (public by design).
//   3. For every non-exempt route, verify that the route's middleware chain includes
//      at least one of the KNOWN_AUTH_MIDDLEWARE function names.
//   4. Log a clear error (and optionally exit) if any route has no auth middleware.
//
// Limitation: this only inspects middleware *names* in the stack. Anonymous
// arrow functions or wrapped middleware will appear as '' or 'bound ' — name
// your middleware functions explicitly (as done throughout this service).

const KNOWN_AUTH_MIDDLEWARE = new Set([
    'authenticateToken',
    'requireAdmin',
    'requirePayrollAccess',
    // The share route is explicitly public — handled via EXEMPT_ROUTES
]);

// Routes that are deliberately public (no auth required)
const EXEMPT_ROUTES = new Set([
    'POST /api/auth/login',
    'POST /api/auth/refresh',
    'POST /api/auth/logout',
    'GET /health',
    'OPTIONS *',   // CORS preflight — app.options('*', cors(...))
    // share redemption — token-gated, not session-gated
    // matched by prefix below
]);

const EXEMPT_PREFIXES = ['/share/'];

/**
 * Extract the mount path from a router layer's regexp.
 * Express stores it as /^\/api\/users\/?(?=\/|$)/i — we recover the prefix.
 */
function extractMountPath(layer) {
    // layer.path is set for simple string mounts; prefer it when available
    if (layer.path) return layer.path;
    const src = layer.regexp?.source || '';
    // Matches patterns like: ^\/api\/users\/?(?=\/|$)
    const m = src.match(/^\^\\\/(.+?)\\\/\?/);
    if (m) return '/' + m[1].replace(/\\\//g, '/');
    return '';
}

/**
 * Collects all route entries from an Express app's router stack.
 * Returns array of { method, path, middlewareNames[] }
 *
 * inheritedMw: middleware names collected from parent router.use() calls
 * that apply to every route inside that sub-router.
 */
function collectRoutes(app) {
    const routes = [];

    function walk(stack, basePath, inheritedMw) {
        // First pass: collect any router-level middleware applied via router.use()
        // These are plain function layers (no layer.route, no layer.handle.stack).
        const routerLevelMw = [];
        for (const layer of stack) {
            if (!layer) continue;
            if (!layer.route && !(layer.handle && layer.handle.stack)) {
                // It's a plain middleware function registered with router.use()
                const name = layer.handle?.name || '';
                if (name && KNOWN_AUTH_MIDDLEWARE.has(name)) {
                    routerLevelMw.push(name);
                }
            }
        }
        const allInherited = [...inheritedMw, ...routerLevelMw];

        // Second pass: process routes and sub-routers
        for (const layer of stack) {
            if (!layer) continue;

            if (layer.route) {
                // Leaf route — merge inherited + route-own middleware names
                const routePath = basePath + (layer.route.path || '');
                const methods = Object.keys(layer.route.methods || {}).map(m => m.toUpperCase());
                const ownMw = (layer.route.stack || []).map(l => l.handle?.name || '').filter(Boolean);
                const middlewareNames = [...allInherited, ...ownMw];
                for (const method of methods) {
                    routes.push({ method, path: routePath, middlewareNames });
                }
            } else if (layer.handle && layer.handle.stack) {
                // Sub-router — recurse, passing down accumulated middleware
                // Collect any middleware functions registered inline on this router.use() call
                // e.g. app.use('/api/users', authenticate, requireAdmin, router)
                const inlineMw = [];
                // layer itself may have been registered as router.use(path, mw1, mw2, router)
                // Express flattens these into separate layers, so we just capture the mount path here
                const mountPath = extractMountPath(layer);
                walk(layer.handle.stack, basePath + mountPath, allInherited);
            }
        }
    }

    walk(app._router?.stack || [], '', []);
    return routes;
}

/**
 * Runs the auth check at startup.
 * @param {object} app  Express app instance
 * @param {boolean} exitOnFailure  If true, calls process.exit(1) on violation
 */
function auditRoutes(app, exitOnFailure = true) {
    const routes = collectRoutes(app);
    const violations = [];

    for (const route of routes) {
        const key = `${route.method} ${route.path}`;

        if (EXEMPT_ROUTES.has(key)) continue;
        if (EXEMPT_PREFIXES.some(p => route.path.startsWith(p))) continue;

        const hasAuth = route.middlewareNames.some(name => KNOWN_AUTH_MIDDLEWARE.has(name));
        if (!hasAuth) {
            violations.push(key);
        }
    }

    if (violations.length > 0) {
        console.error('\n❌ [RouteAudit] UNPROTECTED ROUTES DETECTED — these routes have no auth middleware:');
        for (const v of violations) {
            console.error(`   ⚠  ${v}`);
        }
        console.error('\nThis is the pattern that caused AMS F-HIGH-003. Fix before deploying.\n');
        if (exitOnFailure) {
            process.exit(1);
        }
    } else {
        console.log(`✅ [RouteAudit] All ${routes.length} routes have auth middleware (${EXEMPT_ROUTES.size} explicitly exempt)`);
    }

    return violations;
}

module.exports = { auditRoutes };
