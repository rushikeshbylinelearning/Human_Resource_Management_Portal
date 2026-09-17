// frontend/src/pages/AdminDashboardPage.jsx
import React, { Suspense, useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Alert, Avatar, Button, Tooltip, Snackbar, Chip, Dialog, DialogTitle, DialogContent, Typography, Box, DialogActions, Stack, Skeleton } from '@mui/material';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import WorkIcon from '@mui/icons-material/Work';
import AccessAlarmIcon from '@mui/icons-material/AccessAlarm';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import LinkIcon from '@mui/icons-material/Link';
import NotesIcon from '@mui/icons-material/Notes';
import MoreTimeIcon from '@mui/icons-material/MoreTime';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import AssessmentIcon from '@mui/icons-material/Assessment';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import PageHeroHeader from '../components/PageHeroHeader';
import { formatLeaveRequestType } from '../utils/saturdayUtils';
import { formatISTTime, formatISTDate } from '../utils/istTime';
import DashboardIcon from '@mui/icons-material/Dashboard';
import socket from '../socket';
import { SkeletonBox } from '../components/SkeletonLoaders';
import {
  getDashboardCache,
  isDashboardCacheFresh,
  isDashboardCacheServable,
  setDashboardCache,
  invalidateDashboardCache,
  DASHBOARD_CACHE_KEYS,
  DASHBOARD_CACHE_TTL_MS,
  DASHBOARD_PENDING_TTL_MS,
} from '../utils/apiCache';

import '../styles/AdminDashboardPage.css';

const EmployeeListModal = lazyWithRetry(() => import('../components/EmployeeListModal'));
const EnhancedLeaveRequestModal = lazyWithRetry(() => import('../components/EnhancedLeaveRequestModal'));

// --- Memoized Child Components ---
const SummaryCard = memo(({ title, value, icon, iconBgClass, onClick, clickable = false }) => (
    <div 
        className={`card summary-card ${clickable ? 'clickable-card' : ''}`}
        onClick={clickable ? onClick : undefined}
        style={{ cursor: clickable ? 'pointer' : 'default' }}
    >
        <div className="summary-card-content">
            <div className="title">{title}</div>
            <div className="value">{value}</div>
        </div>
        <div className={`summary-card-icon ${iconBgClass}`}>{icon}</div>
    </div>
));

const RequestItem = memo(({ request, onStatusChange, onViewDetails }) => {
    if (!request) return null;
    const employeeName = request?.employee?.fullName ?? '—';
    return (
        <div 
            className="request-item" 
            onClick={() => onViewDetails?.(request)}
            style={{ cursor: 'pointer' }}
        >
            <Tooltip title={`${request?.reason ?? ''}`} placement="top-start">
                <div className="request-info">
                    <strong>{employeeName}</strong>
                    <span className="date">{request?.createdAt ? formatISTDate(request.createdAt) : 'N/A'}</span>
                </div>
            </Tooltip>
            <div className="applied-date">
                {request?.leaveDates?.length > 0 
                    ? formatISTDate(request.leaveDates[0])
                    : 'N/A'}
            </div>
            <div><Chip label={formatLeaveRequestType(request?.requestType)} size="small" variant="outlined" /></div>
            <div className="request-actions" onClick={(e) => e.stopPropagation()}>
                <Button size="small" variant="contained" color="success" onClick={() => onStatusChange(request._id, 'Approved')}>Approve</Button>
                <Button size="small" variant="outlined" color="error" onClick={() => onStatusChange(request._id, 'Rejected')}>Reject</Button>
            </div>
        </div>
    );
});

// Defensive: calculatedLogoutTime may be null (backend returns null to avoid N+1); UI shows "N/A".
const WhosInItem = memo(({ employee }) => {
    const [liveLogoutTime, setLiveLogoutTime] = useState(null);
    const dataReceivedTimeRef = useRef(null);
    const intervalRef = useRef(null);
    const rafRef = useRef(null);

    useEffect(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        if (!employee?.calculatedLogoutTime) {
            if (liveLogoutTime !== null) setLiveLogoutTime(null);
            dataReceivedTimeRef.current = null;
            return;
        }

        dataReceivedTimeRef.current = new Date();
        const baseLogoutTime = new Date(employee.calculatedLogoutTime);
        setLiveLogoutTime(baseLogoutTime);
    }, [employee?.calculatedLogoutTime, employee?.activeBreak]);

    const formatTime = (time) => {
        if (!time) return 'N/A';
        return formatISTTime(time, { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    if (!employee) return null;
    const fullName = employee?.fullName ?? '';
    const designation = employee?.designation ?? '';

    return (
        <div className="whos-in-item">
            <Avatar sx={{ bgcolor: 'var(--accent-teal)' }}>
                {fullName.charAt(0) || '?'}
            </Avatar>
            <div className="item-details">
                <div className="name">{fullName}</div>
                <div className="role">{designation}</div>
            </div>
            <div className="item-times">
                <div className="time-column">
                    <div className="time-label">Log In</div>
                    <div className="time-value">
                        {formatTime(employee?.startTime)}
                    </div>
                </div>
                <div className="time-column">
                    <div className="time-label">Required Log Out</div>
                    <div className="time-value logout-time">
                        {liveLogoutTime ? formatTime(liveLogoutTime) : 'N/A'}
                    </div>
                </div>
            </div>
        </div>
    );
});

const ActivityItem = memo(({ item, onOpenActivityModal }) => {
    if (!item) return null;
    const isBreakRequest = item.type === 'ExtraBreakRequest';
    const isLeaveRequest = item.type === 'BackdatedLeaveRequest';
    const isEarlyCheckoutRequest = item.type === 'EarlyCheckoutRequest';
    const userName = item?.user?.fullName ?? '—';
    const getProps = () => {
        if (isBreakRequest) {
            return { icon: <MoreTimeIcon sx={{fontSize: '1rem'}}/>, chipLabel: 'Break Request', avatarBg: 'var(--accent-purple)', chipClass: 'activity-chip-break' };
        }
        if (isLeaveRequest) {
            return { icon: <HistoryEduIcon sx={{fontSize: '1rem'}}/>, chipLabel: 'Backdate Leave', avatarBg: 'var(--accent-orange)', chipClass: 'activity-chip-leave' };
        }
        if (isEarlyCheckoutRequest) {
            return { icon: <AccessAlarmIcon sx={{fontSize: '1rem'}}/>, chipLabel: 'Early Checkout Request', avatarBg: '#ed6c02', chipClass: 'activity-chip-early-checkout' };
        }
        return { icon: userName.charAt(0), chipLabel: null, avatarBg: 'var(--accent-blue)', chipClass: '' };
    };

    const { icon, chipLabel, avatarBg, chipClass } = getProps();

    return (
        <div className="activity-item" onClick={() => onOpenActivityModal?.(item)}>
            <Avatar sx={{ bgcolor: avatarBg, width: 32, height: 32, fontSize: '0.9rem' }}>
                {icon}
            </Avatar>
            <div className="activity-details">
                <div className="name">
                    {userName}
                    {chipLabel && <Chip label={chipLabel} size="small" className={`activity-chip ${chipClass}`} />}
                </div>
                <div className="activity-preview">"{item?.content ?? ''}"</div>
            </div>
            <div className="activity-time">
                {item?.timestamp ? formatISTTime(item.timestamp, { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
            </div>
        </div>
    );
});


const AdminDashboardPage = () => {
    // Get auth state at component level (will be used in useEffect)
    const { user, loading: authLoading } = useAuth();
    const [summary, setSummary] = useState(null);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [snackbar, setSnackbar] = useState({ open: false, message: '' });
    const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
    const [selectedCardType, setSelectedCardType] = useState(null);
    const [selectedCardTitle, setSelectedCardTitle] = useState('');
    const [viewLeaveRequestDialog, setViewLeaveRequestDialog] = useState({ open: false, request: null });

    // =================================================================
    // NON-BLOCKING: Show skeleton if authStatus is 'unknown' (auth still resolving)
    // ProtectedRoute handles most cases, but this is a safety check
    // If user is null but we're authenticated, show skeleton (user data loading)
    const { authStatus } = useAuth();
    const authReady = authStatus !== 'unknown' && !!user;
    // =================================================================

    const fetchAllDataRef = useRef(null);
    const refetchSummaryOnlyRef = useRef(null);
    const refetchPendingOnlyRef = useRef(null);
    const lastFetchTimeRef = useRef(0);

    // OPTIMIZED: Single request for base summary + pending leaves (avoids sequential double call).
    fetchAllDataRef.current = async (isInitialLoad = false, forceRefresh = false) => {
        const summaryKey = DASHBOARD_CACHE_KEYS.summary;
        
        // --- Serve from cache if available ---
        const cached = getDashboardCache(summaryKey);
        const fresh = isDashboardCacheFresh(summaryKey);
        const servable = isDashboardCacheServable(summaryKey);
        
        if (cached && fresh && !forceRefresh) {
            // Fresh cache: apply immediately, no network call
            const baseSummary = cached.data?.summary ?? cached.data ?? null;
            const pendingLeaveRequests = cached.data?.pendingLeaveRequests ?? [];
            setSummary(baseSummary);
            setPendingRequests(
                Array.isArray(pendingLeaveRequests)
                    ? [...pendingLeaveRequests].sort((a, b) =>
                        new Date(b?.createdAt ?? 0) - new Date(a?.createdAt ?? 0)
                      )
                    : []
            );
            if (isInitialLoad) setLoading(false);
            return;
        }
        
        if (cached && servable && !forceRefresh) {
            // Stale but servable: show cached data instantly, refresh in background
            const baseSummary = cached.data?.summary ?? cached.data ?? null;
            const pendingLeaveRequests = cached.data?.pendingLeaveRequests ?? [];
            setSummary(baseSummary);
            setPendingRequests(
                Array.isArray(pendingLeaveRequests)
                    ? [...pendingLeaveRequests].sort((a, b) =>
                        new Date(b?.createdAt ?? 0) - new Date(a?.createdAt ?? 0)
                      )
                    : []
            );
            if (isInitialLoad) setLoading(false);
            // Fall through to background fetch (do NOT return here)
        } else {
            // No usable cache: show loading spinner
            if (isInitialLoad) setLoading(true);
        }
        
        setError('');
        try {
            const res = await api.get('/admin/dashboard-summary', {
                params: { includePendingLeaves: true },
            });
            const data = res?.data ?? null;
            const baseSummary = data?.summary ?? data ?? null;
            const pendingLeaveRequests = data?.pendingLeaveRequests ?? [];
            
            // Write to frontend cache
            setDashboardCache(summaryKey, data, DASHBOARD_CACHE_TTL_MS);
            lastFetchTimeRef.current = Date.now();
            
            setSummary(baseSummary);
            setPendingRequests(
                Array.isArray(pendingLeaveRequests)
                    ? [...pendingLeaveRequests].sort((a, b) =>
                        new Date(b?.createdAt ?? 0) - new Date(a?.createdAt ?? 0)
                      )
                    : []
            );
        } catch (err) {
            // Only show error if we have nothing to display (no stale cache in use)
            if (!cached) {
                setError('Failed to load dashboard data. Please try again later.');
            }
            if (import.meta.env?.DEV) console.error('[AdminDashboard] fetch error:', err);
        } finally {
            if (isInitialLoad) setLoading(false);
        }
    };

    // Targeted refetch: summary only (no full dashboard + pending). Used after break approve/reject.
    refetchSummaryOnlyRef.current = async () => {
        try {
            const res = await api.get('/admin/dashboard-summary', { params: { includePendingLeaves: false } });
            const data = res?.data ?? null;
            setSummary(data);
            // Update cache: merge new summary into cached combined object
            const summaryKey = DASHBOARD_CACHE_KEYS.summary;
            const existing = getDashboardCache(summaryKey);
            setDashboardCache(
                summaryKey,
                existing?.data ? { ...existing.data, summary: data } : data,
                DASHBOARD_CACHE_TTL_MS
            );
            lastFetchTimeRef.current = Date.now();
        } catch (e) {
            if (import.meta.env?.DEV) console.error('[AdminDashboard] refetchSummaryOnly error:', e);
        }
    };

    // Targeted refetch: pending leaves only. Used after leave approve/reject.
    refetchPendingOnlyRef.current = async () => {
        try {
            const res = await api.get('/admin/dashboard-pending-leaves');
            const list = res?.data?.pendingLeaveRequests ?? [];
            const sorted = Array.isArray(list)
                ? [...list].sort((a, b) =>
                    new Date(b?.createdAt ?? 0) - new Date(a?.createdAt ?? 0)
                  )
                : [];
            setPendingRequests(sorted);
            // Update cache: merge fresh pending list into cached combined object
            const summaryKey = DASHBOARD_CACHE_KEYS.summary;
            const existing = getDashboardCache(summaryKey);
            if (existing?.data) {
                setDashboardCache(
                    summaryKey,
                    { ...existing.data, pendingLeaveRequests: list },
                    DASHBOARD_PENDING_TTL_MS
                );
            }
            lastFetchTimeRef.current = Date.now();
        } catch (e) {
            if (import.meta.env?.DEV) console.error('[AdminDashboard] refetchPendingOnly error:', e);
        }
    };
    
    const fetchAllData = useCallback((isInitialLoad = false, forceRefresh = false) => {
        return fetchAllDataRef.current?.(isInitialLoad, forceRefresh);
    }, []);

    useEffect(() => {
        if (authLoading || !user) return;
        
        let mounted = true;
        
        const INITIAL_LOAD_COOLDOWN_MS = 500; // Prevents StrictMode double-fire only
        const now = Date.now();
        
        // Only skip if a fetch just ran within the cooldown window
        if (now - lastFetchTimeRef.current < INITIAL_LOAD_COOLDOWN_MS) {
            return;
        }
        
        const loadData = async () => {
            if (!mounted) return;
            if (fetchAllDataRef.current) {
                await fetchAllDataRef.current(true, false); // isInitialLoad=true, forceRefresh=false
            }
        };
        
        loadData();
        
        const handleVisibilityChange = () => {
            if (!document.hidden && mounted && fetchAllDataRef.current) {
                const timeSinceLastFetch = Date.now() - lastFetchTimeRef.current;
                // Refetch on revisit if data is older than 60 seconds (regardless of socket state)
                if (timeSinceLastFetch > DASHBOARD_CACHE_TTL_MS) {
                    fetchAllDataRef.current(false, false);
                }
            }
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        return () => {
            mounted = false;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user?.id, user?._id, authLoading]);

    // Real-time consistency: delta updates on socket events (throttled; minimal API calls).
    // attendance_log_updated → refetch summary only. leave_* → refetch pending leaves only.
    useEffect(() => {
        if (!authReady) return;

        const THROTTLE_MS = 500; // Reduced from 1800 for faster dashboard updates after socket events
        let lastRunSummary = 0;
        let lastRunPending = 0;
        let scheduledSummaryTimer = null;
        let scheduledPendingTimer = null;

        const runSummaryRefetch = async () => {
            lastRunSummary = Date.now();
            if (refetchSummaryOnlyRef.current) await refetchSummaryOnlyRef.current();
        };

        const runPendingRefetch = async () => {
            lastRunPending = Date.now();
            if (refetchPendingOnlyRef.current) await refetchPendingOnlyRef.current();
        };

        const scheduleSummaryRefetch = () => {
            if (document.hidden) return;
            const now = Date.now();
            if (now - lastRunSummary >= THROTTLE_MS) {
                runSummaryRefetch();
                return;
            }
            if (scheduledSummaryTimer) return;
            scheduledSummaryTimer = setTimeout(() => {
                scheduledSummaryTimer = null;
                runSummaryRefetch();
            }, THROTTLE_MS - (now - lastRunSummary));
        };

        const schedulePendingRefetch = () => {
            if (document.hidden) return;
            const now = Date.now();
            if (now - lastRunPending >= THROTTLE_MS) {
                runPendingRefetch();
                return;
            }
            if (scheduledPendingTimer) return;
            scheduledPendingTimer = setTimeout(() => {
                scheduledPendingTimer = null;
                runPendingRefetch();
            }, THROTTLE_MS - (now - lastRunPending));
        };

        const onAttendanceEvent = () => scheduleSummaryRefetch();
        const onLeaveEvent = () => schedulePendingRefetch();

        socket.on('attendance_log_updated', onAttendanceEvent);
        socket.on('leave_request_updated', onLeaveEvent);
        socket.on('leave_status_updated', onLeaveEvent);

        return () => {
            socket.off('attendance_log_updated', onAttendanceEvent);
            socket.off('leave_request_updated', onLeaveEvent);
            socket.off('leave_status_updated', onLeaveEvent);
            if (scheduledSummaryTimer) {
                clearTimeout(scheduledSummaryTimer);
                scheduledSummaryTimer = null;
            }
            if (scheduledPendingTimer) {
                clearTimeout(scheduledPendingTimer);
                scheduledPendingTimer = null;
            }
        };
    }, [authReady]);

    const handleRequestStatusChange = async (requestId, status) => {
        const originalRequests = [...pendingRequests];
        setPendingRequests(prevRequests => prevRequests.filter(req => req._id !== requestId));
        try {
            // CRITICAL FIX: Pass overrideReason to allow admin to approve/reject at any time
            // This bypasses policy validations (advance notice, weekday restrictions, etc.)
            await api.patch(`/admin/leaves/${requestId}/status`, { 
                status,
                overrideReason: `Admin ${status.toLowerCase()} from dashboard by ${user?.fullName || 'admin'}`
            });
            invalidateDashboardCache();
            setSnackbar({ open: true, message: `Leave request has been ${status.toLowerCase()}.` });
            // Targeted refetch: summary + pending so "On Leave" count and list update immediately (no full fetchAllData)
            if (refetchSummaryOnlyRef.current && refetchPendingOnlyRef.current) {
                await Promise.all([refetchSummaryOnlyRef.current(), refetchPendingOnlyRef.current()]);
            }
        } catch (err) {
            setPendingRequests(originalRequests);
            setError(err.response?.data?.error || 'Action failed. Please try again.');
        }
    };

    
    // After approve/reject: targeted refetch only (no full fetchAllData) for faster UI update.
    const handleActivityResponse = async (activityId, status, type, extraPayload = null) => {
        setActionLoading(true);
        try {
            if (type === 'ExtraBreakRequest') {
                await api.patch(`/admin/breaks/extra/${activityId}/status`, { status });
                invalidateDashboardCache();
                setSnackbar({ open: true, message: `Request has been ${status.toLowerCase()}.` });
                handleCloseActivityModal();
                if (refetchSummaryOnlyRef.current) await refetchSummaryOnlyRef.current();
            } else if (type === 'BackdatedLeaveRequest') {
                await api.patch(`/admin/leaves/${activityId}/status`, { status });
                invalidateDashboardCache();
                setSnackbar({ open: true, message: `Request has been ${status.toLowerCase()}.` });
                handleCloseActivityModal();
                if (refetchSummaryOnlyRef.current && refetchPendingOnlyRef.current) {
                    await Promise.all([refetchSummaryOnlyRef.current(), refetchPendingOnlyRef.current()]);
                }
            } else if (type === 'EarlyCheckoutRequest') {
                const url = status === 'Approved'
                    ? `/admin/early-checkout-requests/${activityId}/approve`
                    : `/admin/early-checkout-requests/${activityId}/reject`;
                await api.post(url, status === 'Rejected' && extraPayload?.rejectionNote ? { rejectionNote: extraPayload.rejectionNote } : {});
                invalidateDashboardCache();
                setSnackbar({ open: true, message: `Early checkout request ${status.toLowerCase()}.` });
                handleCloseActivityModal();
                if (refetchSummaryOnlyRef.current) await refetchSummaryOnlyRef.current();
            } else {
                setActionLoading(false);
                return;
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to action request.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleOpenActivityModal = useCallback((activity) => {
        setSelectedActivity(activity);
        setIsActivityModalOpen(true);
    }, []);

    const handleCloseActivityModal = () => {
        setIsActivityModalOpen(false);
        setSelectedActivity(null);
    };

    const handleCardClick = useCallback((cardType, cardTitle) => {
        setSelectedCardType(cardType);
        setSelectedCardTitle(cardTitle);
        setIsEmployeeModalOpen(true);
    }, []);

    const handleCloseEmployeeModal = () => {
        setIsEmployeeModalOpen(false);
        setSelectedCardType(null);
        setSelectedCardTitle('');
    };

    const handleViewLeaveRequestDetails = useCallback((request) => {
        setViewLeaveRequestDialog({ open: true, request });
    }, []);

    const handleCloseLeaveRequestDetails = () => {
        setViewLeaveRequestDialog({ open: false, request: null });
    };

    const summaryCardsData = useMemo(() => (
        summary ? [
            { 
                title: 'Employees Present', 
                value: `${summary.presentCount || 0}`, 
                icon: <WorkIcon />, 
                iconBgClass: 'icon-bg-blue',
                cardType: 'present',
                clickable: true,
                onClick: () => handleCardClick('present', 'Employees Present')
            },
            { 
                title: 'Late Comers', 
                value: summary.lateCount || 0, 
                icon: <AccessAlarmIcon />, 
                iconBgClass: 'icon-bg-orange',
                cardType: 'late',
                clickable: true,
                onClick: () => handleCardClick('late', 'Late Comers')
            },
            { 
                title: 'On Leave', 
                value: summary.onLeaveCount || 0, 
                icon: <EventBusyIcon />, 
                iconBgClass: 'icon-bg-red',
                cardType: 'on-leave',
                clickable: true,
                onClick: () => handleCardClick('on-leave', 'On Leave')
            },
            { 
                title: 'Total Employees', 
                value: summary.totalEmployees || 0, 
                icon: <PeopleAltIcon />, 
                iconBgClass: 'icon-bg-teal',
                cardType: 'total',
                clickable: true,
                onClick: () => handleCardClick('total', 'Total Employees')
            }
        ] : Array(4).fill({}).map((_, i) => ({ key: `skeleton-${i}` }))
    ), [summary, handleCardClick]);

    // Filter recent activity to show only items from the last 3 hours
    const filteredRecentActivity = useMemo(() => {
        if (!summary?.recentActivity) return [];
        
        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours in milliseconds
        
        return summary.recentActivity.filter(item => {
            if (!item.timestamp) return false;
            const itemTime = new Date(item.timestamp);
            return itemTime >= threeHoursAgo;
        });
    }, [summary]);


    const showSkeletons = !authReady || loading || !summary;

    return (
        <div className="dashboard-page-container">
            <PageHeroHeader
                eyebrow="Overview"
                title="Admin Dashboard"
                description="Monitor attendance, leave requests, and real-time activity."
                icon={<DashboardIcon />}
            />
            
            {error && <Alert severity="error" onClose={() => setError('')} style={{ marginBottom: 16 }}>{error}</Alert>}
            
            {/* Top Row: 4 Small Summary Cards */}
            <div className="top-cards-grid">
                {showSkeletons ? (
                    Array.from({ length: 4 }).map((_, idx) => (
                        <div key={`summary-skel-${idx}`} className="card summary-card">
                            <div className="summary-card-content">
                                <div className="title"><Skeleton width="60%" /></div>
                                <div className="value"><Skeleton width="40%" height={40} /></div>
                            </div>
                            <div className="summary-card-icon icon-bg-teal">
                                <Skeleton variant="circular" width={32} height={32} />
                            </div>
                        </div>
                    ))
                ) : (
                    summaryCardsData.map((card, index) => (
                        <SummaryCard key={card.key || index} {...card} />
                    ))
                )}
            </div>

            {/* Bottom Row: 3 Large Cards */}
            <div className="bottom-cards-grid">
                {/* Left Large Card: Pending Leave Requests */}
                <div className="large-card pending-requests-card">
                    <div className="card-header">
                        <h2 className="card-title">Pending Leave Requests</h2>
                        <a href="/admin/leaves" className="view-all-link">View All</a>
                    </div>
                    <div className="requests-table">
                        <div className="table-header">
                            <span>Employee & Reason</span>
                            <span>Leave Date</span>
                            <span>Type</span>
                            <span>Actions</span>
                        </div>
                        <div className="requests-list">
                            {showSkeletons ? (
                                Array.from({ length: 4 }).map((_, idx) => (
                                    <div key={`pending-skel-${idx}`} className="request-item">
                                        <div className="request-info">
                                            <strong><Skeleton width="60%" /></strong>
                                            <span className="date"><Skeleton width="40%" /></span>
                                        </div>
                                        <div className="applied-date"><Skeleton width="60%" /></div>
                                        <div><Skeleton width="60%" /></div>
                                        <div className="request-actions" style={{ justifyContent: 'flex-end' }}>
                                            <Skeleton variant="rectangular" width={70} height={32} sx={{ borderRadius: 1 }} />
                                            <Skeleton variant="rectangular" width={70} height={32} sx={{ borderRadius: 1 }} />
                                        </div>
                                    </div>
                                ))
                            ) : pendingRequests.length > 0 ? (
                                pendingRequests.map(req => (
                                    <RequestItem 
                                        key={req._id} 
                                        request={req} 
                                        onStatusChange={handleRequestStatusChange} 
                                        onViewDetails={handleViewLeaveRequestDetails}
                                    />
                                ))
                            ) : (
                                <div className="empty-state">No pending leave or work requests</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Middle Large Card: Who's In Today */}
                <div className="large-card whos-in-card">
                    <div className="card-header">
                        <h2 className="card-title">Who's In Today?</h2>
                    </div>
                    <div className="whos-in-list">
                        {showSkeletons ? (
                            Array.from({ length: 5 }).map((_, idx) => (
                                <div key={`whos-skel-${idx}`} className="whos-in-item">
                                    <Avatar sx={{ bgcolor: 'var(--accent-teal)' }}>
                                        <Skeleton variant="circular" width={24} height={24} />
                                    </Avatar>
                                    <div className="item-details">
                                        <div className="name"><Skeleton width="50%" /></div>
                                        <div className="role"><Skeleton width="35%" /></div>
                                    </div>
                                    <div className="item-times">
                                        <div className="time-column">
                                            <div className="time-label">Log In</div>
                                            <div className="time-value"><Skeleton width={70} /></div>
                                        </div>
                                        <div className="time-column">
                                            <div className="time-label">Required Log Out</div>
                                            <div className="time-value logout-time"><Skeleton width={70} /></div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : summary?.whosInList?.length > 0 ? (
                            summary.whosInList.map(emp => (
                                <WhosInItem key={emp._id} employee={emp} />
                            ))
                        ) : (
                            <div className="empty-state">No employees are clocked in.</div>
                        )}
                    </div>
                </div>

                {/* Right Large Card: Recent Activity Feed & Quick Links */}
                <div className="large-card activity-card">
                    <div className="card-header">
                        <h2 className="card-title">Recent Activity & Quick Links</h2>
                    </div>
                    <div className="activity-section">
                        <div className="activity-subsection">
                            <h3 className="subsection-title">Recent Activity</h3>
                            <div className="activity-list">
                                {showSkeletons ? (
                                    Array.from({ length: 4 }).map((_, idx) => (
                                        <div key={`activity-skel-${idx}`} className="activity-item">
                                            <Avatar sx={{ bgcolor: 'var(--accent-blue)', width: 32, height: 32 }}>
                                                <Skeleton variant="circular" width={20} height={20} />
                                            </Avatar>
                                            <div className="activity-details" style={{ flex: 1 }}>
                                                <div className="name"><Skeleton width="55%" /></div>
                                                <div className="activity-preview"><Skeleton width="80%" /></div>
                                            </div>
                                            <div className="activity-time"><Skeleton width={50} /></div>
                                        </div>
                                    ))
                                ) : filteredRecentActivity.length > 0 ? (
                                    filteredRecentActivity.slice(0, 4).map(item => (
                                        <ActivityItem key={item.type + item._id} item={item} onOpenActivityModal={handleOpenActivityModal} />
                                    ))
                                ) : (
                                    <div className="empty-state-small">
                                        <NotesIcon /><p>No recent activity.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="quick-links-subsection">
                            <h3 className="subsection-title">Quick Links</h3>
                            <div className="quick-links-grid">
                                <a href="/employees" className="quick-link-item">
                                    <PeopleAltIcon />
                                    <span>Manage Employees</span>
                                </a>
                                <button
                                    type="button"
                                    className="quick-link-item"
                                    onClick={() => handleCardClick('absent', 'Absent Today')}
                                >
                                    <PersonOffIcon />
                                    <span>Absent Today</span>
                                </button>
                                <a href="/manage-section" className="quick-link-item">
                                    <AccessAlarmIcon />
                                    <span>Settings</span>
                                </a>
                                <a href="/admin/leaves" className="quick-link-item">
                                    <EventBusyIcon />
                                    <span>Leave Management</span>
                                </a>
                                <a 
                                    href="/admin/leaves" 
                                    className="quick-link-item"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        // Navigate to Employee Leave Count Summary tab
                                        window.location.href = '/admin/leaves?tab=leave-count';
                                    }}
                                >
                                    <AssessmentIcon />
                                    <span>Employee Leave Count</span>
                                </a>
                                <a 
                                    href="/admin/leaves" 
                                    className="quick-link-item"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        // Navigate to Intern Leave Count Summary tab
                                        window.location.href = '/admin/leaves?tab=intern-leave-count';
                                    }}
                                >
                                    <AssessmentIcon />
                                    <span>Intern Leave Count</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {selectedActivity && (
                <Dialog 
                    open={isActivityModalOpen} 
                    onClose={handleCloseActivityModal}
                    fullWidth
                    maxWidth="sm"
                    PaperProps={{
                        sx: {
                            borderRadius: { xs: '16px 16px 0 0', sm: 3 },
                            p: { xs: 0, sm: 2 },
                            minWidth: 0,
                        },
                    }}
                >
                    <DialogTitle sx={{ fontWeight: 600, pb: 1, pt: 1 }}>
                        {selectedActivity.type === 'Note' && 'Note from '}
                        {selectedActivity.type === 'EarlyCheckoutRequest' && 'Early Checkout Request from '}
                        {(selectedActivity.type === 'ExtraBreakRequest' || selectedActivity.type === 'BackdatedLeaveRequest') && 'Request from '}
                        {selectedActivity.user?.fullName}
                    </DialogTitle>
                    <DialogContent>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            Employee Code: {selectedActivity.user?.employeeCode} | Submitted: {new Date(selectedActivity.timestamp).toLocaleString()}
                            {selectedActivity.type === 'EarlyCheckoutRequest' && selectedActivity.remainingTimeMinutes != null && (
                                <span style={{ display: 'block', marginTop: 4 }}>
                                    Remaining time: {Math.floor(selectedActivity.remainingTimeMinutes / 60)}h {selectedActivity.remainingTimeMinutes % 60}m
                                </span>
                            )}
                        </Typography>
                        <Typography variant="body1" sx={{ mt: 2, whiteSpace: 'pre-wrap', backgroundColor: '#f8f9fa', p: 2, borderRadius: 2 }}>
                            {selectedActivity.content}
                        </Typography>
                    </DialogContent>
                    
                    {(selectedActivity.type === 'ExtraBreakRequest' || selectedActivity.type === 'BackdatedLeaveRequest' || selectedActivity.type === 'EarlyCheckoutRequest') && (
                        <DialogActions>
                            <Stack direction="row" spacing={2} sx={{width: '100%', justifyContent: 'flex-end'}}>
                                <Button onClick={() => handleActivityResponse(selectedActivity._id, 'Rejected', selectedActivity.type)} color="error" disabled={actionLoading}>Reject</Button>
                                <Button onClick={() => handleActivityResponse(selectedActivity._id, 'Approved', selectedActivity.type)} variant="contained" color="success" disabled={actionLoading}>
                                    {actionLoading ? <SkeletonBox width="24px" height="24px" borderRadius="50%" /> : 'Approve'}
                                </Button>
                            </Stack>
                        </DialogActions>
                    )}
                </Dialog>
            )}

            <Snackbar 
                open={snackbar.open} 
                autoHideDuration={4000} 
                onClose={() => setSnackbar({ ...snackbar, open: false })} 
                message={snackbar.message} 
            />

            <Suspense fallback={null}>
            {isEmployeeModalOpen && (
            <EmployeeListModal
                open={isEmployeeModalOpen}
                onClose={handleCloseEmployeeModal}
                cardType={selectedCardType}
                cardTitle={selectedCardTitle}
            />
            )}

            {viewLeaveRequestDialog.open && (
            <EnhancedLeaveRequestModal
                open={viewLeaveRequestDialog.open}
                onClose={handleCloseLeaveRequestDetails}
                request={viewLeaveRequestDialog.request}
                onStatusChange={async (requestId, status, rejectionNotes) => {
                    const originalRequests = [...pendingRequests];
                    setPendingRequests(prevRequests => prevRequests.filter(req => req._id !== requestId));
                    try {
                        await api.patch(`/admin/leaves/${requestId}/status`, { 
                            status,
                            ...(rejectionNotes && { rejectionNotes }),
                            // CRITICAL FIX: Pass overrideReason to allow admin to approve/reject at any time
                            overrideReason: `Admin ${status.toLowerCase()} from dashboard modal by ${user?.fullName || 'admin'}`
                        });
                        invalidateDashboardCache();
                        setSnackbar({ open: true, message: `Leave request has been ${status.toLowerCase()}.` });
                        // Targeted refetch: pending leaves + summary only (no full fetchAllData)
                        if (refetchSummaryOnlyRef.current && refetchPendingOnlyRef.current) {
                            await Promise.all([refetchSummaryOnlyRef.current(), refetchPendingOnlyRef.current()]);
                        }
                        // Modal will close itself after successful status change
                    } catch (err) {
                        setPendingRequests(originalRequests);
                        setError(err.response?.data?.error || 'Action failed. Please try again.');
                        throw err; // Re-throw so modal can handle the error state
                    }
                }}
                onEdit={(request) => {
                    handleCloseLeaveRequestDetails();
                    // Navigate to leaves page for editing
                    window.location.href = `/admin/leaves`;
                }}
                onDelete={(request) => {
                    handleCloseLeaveRequestDetails();
                    // Navigate to leaves page for deletion
                    window.location.href = `/admin/leaves`;
                }}
            />
            )}
            </Suspense>
        </div>
    );
};

export default AdminDashboardPage;