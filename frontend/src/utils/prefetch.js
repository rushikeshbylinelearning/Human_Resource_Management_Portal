// Route prefetching — hover/focus only. Eager prefetch of unused routes
// was loading Admin dashboard, Employees, and Attendance Summary on every
// dashboard Lighthouse run.

const prefetchedRoutes = new Set();
const prefetchTimeouts = new Map();

const NO_PREFETCH_ROUTES = ['/profile', '/leaves'];

const prefetchRoute = (route, importFn, delay = 100) => {
    if (NO_PREFETCH_ROUTES.includes(route)) {
        return;
    }

    if (prefetchedRoutes.has(route) || !importFn) {
        return;
    }

    if (prefetchTimeouts.has(route)) {
        clearTimeout(prefetchTimeouts.get(route));
    }

    const timeoutId = setTimeout(async () => {
        try {
            await importFn();
            prefetchedRoutes.add(route);
        } catch (error) {
            console.warn(`[Prefetch] Failed to prefetch: ${route}`, error);
        }
    }, delay);

    prefetchTimeouts.set(route, timeoutId);
};

const cancelPrefetch = (route) => {
    if (prefetchTimeouts.has(route)) {
        clearTimeout(prefetchTimeouts.get(route));
        prefetchTimeouts.delete(route);
    }
};

export const setupPrefetchListeners = (routeMap) => {
    document.addEventListener('mouseover', handleNavigationIntent, true);
    document.addEventListener('focusin', handleNavigationIntent, true);
    document.addEventListener('mouseout', handleNavigationCancel, true);
    document.addEventListener('focusout', handleNavigationCancel, true);

    function handleNavigationIntent(event) {
        const link = event.target.closest('a[href]');
        if (!link) return;

        const href = link.getAttribute('href');
        if (routeMap[href]) {
            prefetchRoute(href, routeMap[href]);
        }
    }

    function handleNavigationCancel(event) {
        const link = event.target.closest('a[href]');
        if (!link) return;

        const href = link.getAttribute('href');
        if (routeMap[href]) {
            cancelPrefetch(href);
        }
    }
};

export const routePrefetchMap = {
    '/dashboard': () => import('../pages/EmployeeDashboardPage'),
    '/admin/dashboard': () => import('../pages/AdminDashboardPage'),
    '/leaves': () => import('../pages/LeavesPage'),
    '/employees': () => import('../pages/EmployeesPage'),
    '/admin/leaves': () => import('../pages/AdminLeavesPage'),
    '/reports': () => import('../pages/ReportsPage'),
    '/profile': () => import('../pages/ProfilePage'),
    '/attendance-summary': () => import('../pages/AttendanceSummaryPage'),
    '/admin/attendance-summary': () => import('../pages/AdminAttendanceSummaryPage'),
    '/activity-log': () => import('../pages/NewActivityLogPage'),
    '/shifts': () => import('../pages/SchedulingManagementPage'),
    '/scheduling-management': () => import('../pages/SchedulingManagementPage'),
    '/probation': () => import('../pages/ProbationPage'),
};
