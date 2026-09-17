// Idle-time helpers. Do not prefetch unused routes on dashboard load —
// that pulled AdminDashboard, Employees, and Attendance Summary into
// every Lighthouse run.

export const preloadCriticalResources = () => {};
