// frontend/src/pages/EmployeeDashboardPage.jsx
// AUDIT: Employee Dashboard – single API GET /attendance/dashboard/employee on load; auth guards; socket debounce; LiveClock isolated (memo); cleanup on unmount.
// VALIDATION: One initial call, no duplicate on auth resolution, manual Retry on error, socket/visibility refresh, no memory leaks.
import React, { useState, useEffect, useCallback, useMemo, memo, useRef, forwardRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Typography, Button, Alert, Stack, Box, Grid, Paper,
    Avatar, Divider, Chip, IconButton, Dialog, DialogTitle, DialogContent,
    DialogActions, Slide, Fade, TextField, Snackbar, Tooltip, Skeleton
} from '@mui/material';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useOnboarding } from '../context/OnboardingContext';
import { useBreakUI } from '../context/BreakUIContext';
import { useTeaBreak } from '../context/TeaBreakContext';
import { usePermissions } from '../hooks/usePermissions';
import { useBreakWindowScheduler } from '../hooks/useBreakWindowScheduler';
import { getCurrentLocation, getCachedLocationOnly } from '../services/locationService';
import socket from '../socket';
import WorkTimeTracker from '../components/WorkTimeTracker';
import BreakTimer from '../components/BreakTimer';
import ShiftInfoDisplay from '../components/ShiftInfoDisplay';
import WeeklyTimeCards from '../components/WeeklyTimeCards';
import LiveClock from '../components/LiveClock';
import SaturdaySchedule from '../components/SaturdaySchedule';
import RecentActivityCard from '../components/RecentActivityCard';
import ShiftProgressBar from '../components/ShiftProgressBar';
import UserAvatar from '../components/common/UserAvatar'; // CENTRALIZED AVATAR COMPONENT
import PendingPolicyBanner from '../components/PendingPolicyBanner';
import { ShiftInfoSkeleton, RecentActivitySkeleton, SaturdayScheduleSkeleton, WeeklyTimeCardsSkeleton } from '../components/DashboardSkeletons';
import { EmployeeDashboardSkeleton, SkeletonBox } from '../components/SkeletonLoaders';
import { getISTNow, formatISTDate } from '../utils/istTime';
import { computeTeaBreakRemainingSeconds } from '../utils/teaBreakTimer';
import { getUnifiedShiftTimeState } from '../utils/shiftTimeCalculation';
import {
  getEmployeeDashboardCache,
  isEmployeeDashboardCacheFresh,
  isEmployeeDashboardCacheServable,
  setEmployeeDashboardCache,
  invalidateEmployeeDashboardCache,
  EMPLOYEE_DASHBOARD_CACHE_TTL_MS,
} from '../utils/apiCache';
import '../styles/EmployeeDashboardPage.css';

// Icons
import FreeBreakfastIcon from '@mui/icons-material/FreeBreakfast';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import LogoutIcon from '@mui/icons-material/Logout';
import CloseIcon from '@mui/icons-material/Close';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import NoMealsIcon from '@mui/icons-material/NoMeals';
import MoreTimeIcon from '@mui/icons-material/MoreTime';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';

const MemoizedWeeklyTimeCards = memo(WeeklyTimeCards);
const MemoizedLiveClock = memo(LiveClock);
const MemoizedSaturdaySchedule = memo(SaturdaySchedule);
const MemoizedShiftInfoDisplay = memo(ShiftInfoDisplay);
const MemoizedRecentActivityCard = memo(RecentActivityCard);
const MemoizedWorkTimeTracker = memo(WorkTimeTracker);
const MemoizedBreakTimer = memo(BreakTimer);
const MemoizedShiftProgressBar = memo(ShiftProgressBar);
const DialogTransition = forwardRef(function Transition(props, ref) {
    return <Slide direction="up" ref={ref} {...props} />;
});
const BreakModalTransition = forwardRef(function Transition(props, ref) {
    return <Fade ref={ref} {...props} timeout={400} />;
});

// Skip echo socket refetches for this user's own just-completed attendance mutation.
const OWN_MUTATION_REFETCH_SUPPRESS_MS = 2500;

// CRITICAL: Use IST timezone for date string to match backend
// This ensures the frontend sends the same date as the backend expects
const getLocalDateString = (date = new Date()) => {
    // Use Intl.DateTimeFormat to get the date in IST (Asia/Kolkata)
    const istFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return istFormatter.format(date);
};


const EmployeeDashboardPage = () => {
    const { user: contextUser, updateUserContext, loading: authLoading } = useAuth();
    const { showTour } = useOnboarding();
    const tourPreview = showTour;
    const { uiBreakState, startUiBreak, endUiBreak, setUiBreakState, reconcileFromBackend, applyLocallyEndedOverlay, clearLocallyEndedBreak } = useBreakUI();
    const { teaBreakData, clearTeaBreak } = useTeaBreak();
    const { canAccess, breakLimits, privilegeLevel } = usePermissions();
    const location = useLocation();
    const [dailyData, setDailyData] = useState(null);
    const [weeklyLogs, setWeeklyLogs] = useState([]);
    const [myRequests, setMyRequests] = useState([]);
    // Server-derived: required-logout checkout control (feature-toggled). No frontend recalculation.
    const [canCheckout, setCanCheckout] = useState(true);
    const [requiredLogoutAt, setRequiredLogoutAt] = useState(null);
    const [remainingTime, setRemainingTime] = useState(null);
    const [hasHalfDayLeave, setHasHalfDayLeave] = useState(false);
    const [requiredWorkMinutes, setRequiredWorkMinutes] = useState(510);
    const [earlyCheckoutWarningOpen, setEarlyCheckoutWarningOpen] = useState(false);
    const [earlyCheckoutNote, setEarlyCheckoutNote] = useState('');
    const [requireAdminApprovalForEarlyCheckout, setRequireAdminApprovalForEarlyCheckout] = useState(false);
    const [pendingEarlyCheckoutRequest, setPendingEarlyCheckoutRequest] = useState(null);
    const [loading, setLoading] = useState(true);
    const [hasInitialLoadFinished, setHasInitialLoadFinished] = useState(false);
    const [showTimeTrackingContentVisible, setShowTimeTrackingContentVisible] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');
    const [isBreakModalOpen, setIsBreakModalOpen] = useState(false);
    const [tourPreviewSelectedBreak, setTourPreviewSelectedBreak] = useState(null);
    const [tourPreviewCheckoutConfirmed, setTourPreviewCheckoutConfirmed] = useState(false);
    
    const [isReasonModalOpen, setIsReasonModalOpen] = useState(false);
    const [breakReason, setBreakReason] = useState('');
    const [isSubmittingReason, setIsSubmittingReason] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '' });
    const [weeklyLateDialog, setWeeklyLateDialog] = useState({ open: false, lateCount: 0, lateDates: [] });
    const [breakTriggerTick, setBreakTriggerTick] = useState(0); // Event-driven break window boundary trigger
    const breakActionInFlightRef = useRef(false);
    const clockInActionInFlightRef = useRef(false);
    const clockOutActionInFlightRef = useRef(false);
    const fetchInFlightRef = useRef(false);
    const fetchSeqRef = useRef(0);
    const refetchQueuedRef = useRef(false);
    const refetchQueuedForceRef = useRef(false);
    const lastMutationFetchAtRef = useRef(0);
    // When we last received calculatedLogoutTime from the server (used for real-time projection during break).
    const lastLogoutBaselineReceivedAtRef = useRef(0);
    const lastFetchTimeRef = useRef(0);

    const markOwnMutationRefetch = () => {
        lastMutationFetchAtRef.current = Date.now();
    };

    const isOnBreakUI = !!uiBreakState;
    const isClockedInForWork = dailyData?.status === 'Clocked In' || isOnBreakUI;
    // Tea break state is only applied server-side for clocked-in employees; gate UI defensively too.
    const isOnTeaBreak = !!teaBreakData && isClockedInForWork;
    const isShowingBreakTimer = isOnBreakUI || isOnTeaBreak;
    const breaksForUi = useMemo(() => {
        const raw = Array.isArray(dailyData?.breaks) ? dailyData.breaks : [];
        const base = applyLocallyEndedOverlay(raw);
        if (!uiBreakState) return base;
        const hasActive = base.some(b => b && !b.endTime);
        if (hasActive) return base;
        return [
            ...base,
            {
                _id: uiBreakState.id,
                breakType: uiBreakState.type,
                startTime: uiBreakState.startTime,
                endTime: null,
            },
        ];
    }, [dailyData?.breaks, uiBreakState, applyLocallyEndedOverlay]);
    const hasActiveBreakForUi = useMemo(
        () => !!uiBreakState || (breaksForUi || []).some(b => b && !b.endTime),
        [uiBreakState, breaksForUi]
    );
    // After a local end, dailyData.status can linger as 'On Break' until a fetch lands.
    const resolvedStatus = (dailyData?.status === 'On Break' && !hasActiveBreakForUi && !isOnTeaBreak)
        ? 'Clocked In'
        : dailyData?.status;
    const displayStatus = isShowingBreakTimer ? 'On Break' : resolvedStatus;
    const statusForUi = isShowingBreakTimer ? 'On Break' : resolvedStatus;

    // Only show timer when actually in a work session (not merely logged in while clocked out).
    const isClockedInSession = Boolean(
        dailyData && (dailyData.status === 'Clocked In' || dailyData.status === 'On Break' || dailyData.status === 'On Auto-Break' || isOnBreakUI || isOnTeaBreak)
    );

    const showTourPreviewUi = tourPreview && !isClockedInSession;

    const tourPreviewDailyData = useMemo(() => {
        if (!showTourPreviewUi) return null;
        const now = new Date();
        const logout = new Date(now);
        logout.setHours(19, 0, 0, 0);
        if (logout <= now) {
            logout.setTime(now.getTime() + 9 * 60 * 60 * 1000);
        }
        return {
            status: 'Clocked In',
            hasLog: true,
            attendanceLog: {
                penaltyMinutes: 0,
                isLate: false,
                isHalfDay: false,
                paidBreakMinutesTaken: 0,
                unpaidBreakMinutesTaken: 0,
            },
            sessions: [{ startTime: now.toISOString() }],
            shift: dailyData?.shift || contextUser?.shift,
            calculatedLogoutTime: logout.toISOString(),
            breaks: [],
        };
    }, [showTourPreviewUi, dailyData?.shift, contextUser?.shift]);

    const uiDailyData = tourPreviewDailyData || dailyData;
    const effectiveIsClockedInSession = isClockedInSession || showTourPreviewUi;
    const effectiveCanCheckout = showTourPreviewUi ? false : canCheckout;

    const dataReady = !!dailyData;
    const timeTrackingReady = dataReady && !loading && hasInitialLoadFinished;
    const attendanceUiReady = timeTrackingReady || (tourPreview && !!contextUser);

    const fetchAllDataRef = useRef(null);

    // Fingerprint for dashboard payload to avoid setState when data unchanged (reduces re-renders and UI flicker).
    const dashboardFingerprint = (dailyStatus, weeklyLogsArr, leaveRequestsArr) => {
        const s = dailyStatus;
        const sess = s?.sessions;
        const br = s?.breaks;
        return [
            s?.status,
            sess?.length,
            sess?.[sess.length - 1]?.endTime ?? null,
            br?.length,
            br?.[br?.length - 1]?.endTime ?? null,
            s?.attendanceLog?.penaltyMinutes,
            Array.isArray(weeklyLogsArr) ? weeklyLogsArr.length : 0,
            Array.isArray(leaveRequestsArr) ? leaveRequestsArr.length : 0,
        ].join('|');
    };

    // Create stable fetch function
    // PHASE 5: Use aggregate endpoint - single call instead of 3
    
    const _applyDashboardPayload = (data, isInitialLoad) => {
        const {
            dailyStatus,
            weeklyLogs,
            leaveRequests: leaveRequestsRaw,
            requiredLogoutAt: reqLogoutAt,
            canCheckout: canCheckoutFromServer,
            remainingTime: remTime,
            hasHalfDayLeave: halfDay,
            requiredWorkMinutes: reqWorkMins,
            requireAdminApprovalForEarlyCheckout: reqApproval,
            pendingEarlyCheckoutRequest: pendingReq,
        } = data;

        const wLogs = Array.isArray(weeklyLogs) ? weeklyLogs : [];
        const lRequests = Array.isArray(leaveRequestsRaw) ? leaveRequestsRaw : [];

        setRequiredLogoutAt(reqLogoutAt ?? null);
        setCanCheckout(canCheckoutFromServer !== false);
        setRemainingTime(remTime != null ? remTime * 60 : null);
        setHasHalfDayLeave(!!halfDay);
        setRequiredWorkMinutes(reqWorkMins ?? 510);
        setRequireAdminApprovalForEarlyCheckout(!!reqApproval);
        setPendingEarlyCheckoutRequest(pendingReq && pendingReq._id ? pendingReq : null);

        // Fingerprint comparison (only skip setState on background/non-initial refreshes)
        if (!isInitialLoad && dailyData) {
            const newFp = dashboardFingerprint(dailyStatus, wLogs, lRequests);
            const curFp = dashboardFingerprint(dailyData, weeklyLogs, myRequests);
            if (newFp === curFp) return;
        }

        setDailyData(dailyStatus);
        reconcileFromBackend(dailyStatus);
        setWeeklyLogs(wLogs);
        setMyRequests(lRequests);
        lastLogoutBaselineReceivedAtRef.current = Date.now();

        if (isInitialLoad) {
            setLoading(false);
            setHasInitialLoadFinished(true);
        }
    };
    
    fetchAllDataRef.current = async (isInitialLoad = false, forceRefresh = false) => {
        // Don't drop post-action refetches: queue a follow-up if a poll is already in flight.
        if (fetchInFlightRef.current && !isInitialLoad) {
            refetchQueuedRef.current = true;
            if (forceRefresh) refetchQueuedForceRef.current = true;
            // Invalidate the in-flight response so it cannot overwrite newer intended state.
            fetchSeqRef.current += 1;
            return;
        }

        const localDate = getLocalDateString();
        const seq = ++fetchSeqRef.current;

        const applyIfLatest = (payload, initial) => {
            if (seq !== fetchSeqRef.current) return;
            _applyDashboardPayload(payload, initial);
        };

        // --- Cache check (only for non-forced calls) ---
        if (!forceRefresh) {
            const cached = getEmployeeDashboardCache();
            const fresh = isEmployeeDashboardCacheFresh();
            const servable = isEmployeeDashboardCacheServable();

            if (cached && fresh) {
                // Fresh cache: apply immediately, skip network call
                applyIfLatest(cached.data, isInitialLoad);
                if (refetchQueuedRef.current) {
                    refetchQueuedRef.current = false;
                    const queuedForce = refetchQueuedForceRef.current;
                    refetchQueuedForceRef.current = false;
                    void fetchAllDataRef.current?.(false, queuedForce);
                }
                return;
            }

            if (cached && servable) {
                // Stale-but-servable: show data immediately, then refresh in background
                applyIfLatest(cached.data, isInitialLoad);
                // Fall through to background fetch (do NOT return)
            }
            // If no servable cache: fall through to fetch with loading state
        }

        fetchInFlightRef.current = true;

        if (isInitialLoad && !getEmployeeDashboardCache()) {
            // Only show loading spinner if we have no cached data to show
            setLoading(true);
        }

        try {
            const dashboardRes = await api.get(`/attendance/dashboard/employee?date=${localDate}`);
            const payload = dashboardRes.data;

            // Write fresh data to cache only if this request is still the latest —
            // otherwise a stale payload would poison the cache for the next read.
            if (seq === fetchSeqRef.current) {
                setEmployeeDashboardCache(payload);
                lastFetchTimeRef.current = Date.now();
            }

            applyIfLatest(payload, isInitialLoad);
        } catch (err) {
            console.error("Dashboard fetch error:", err);
            if (isInitialLoad && !getEmployeeDashboardCache()) {
                // Only show error if we have nothing at all to display
                setError('Failed to load dashboard data. Please refresh the page.');
                setLoading(false);
                setHasInitialLoadFinished(true);
            }
        } finally {
            fetchInFlightRef.current = false;
            if (refetchQueuedRef.current) {
                refetchQueuedRef.current = false;
                const queuedForce = refetchQueuedForceRef.current;
                refetchQueuedForceRef.current = false;
                void fetchAllDataRef.current?.(false, queuedForce);
            }
        }
    };
    
    const fetchAllData = useCallback((isInitialLoad = false) => {
        return fetchAllDataRef.current?.(isInitialLoad);
    }, []);

    // AUDIT: Initial data fetch - ONE call on load. Guards: authLoading + contextUser. Cleanup: visibility + timestamp cooldown.
    useEffect(() => {
        if (authLoading || !contextUser) {
            return;
        }

        let mounted = true;
        const STRICT_MODE_COOLDOWN_MS = 500;
        const now = Date.now();

        // Prevent StrictMode double-fire only (not legitimate revisits)
        if (now - lastFetchTimeRef.current < STRICT_MODE_COOLDOWN_MS) return;

        const loadData = async () => {
            if (!mounted) return;
            if (fetchAllDataRef.current) {
                await fetchAllDataRef.current(true, false);
            }
        };

        loadData();

        const handleVisibilityChange = () => {
            if (!document.hidden && mounted && fetchAllDataRef.current) {
                const timeSinceLastFetch = Date.now() - lastFetchTimeRef.current;
                // Refetch on revisit if data is older than the cache TTL
                // This fires regardless of socket state — socket handles real-time
                // while this handles the case of returning after a long absence
                if (timeSinceLastFetch > EMPLOYEE_DASHBOARD_CACHE_TTL_MS) {
                    fetchAllDataRef.current(false, false);
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            mounted = false;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
     }, [contextUser?.id, contextUser?._id, authLoading]); // Depend on user IDs (stable) and authLoading to trigger when auth is ready

    // Defer applying .visible by one frame so the element paints at opacity 0 first, then fades in (prevents flash).
    useEffect(() => {
        if (!attendanceUiReady || !effectiveIsClockedInSession) {
            setShowTimeTrackingContentVisible(false);
            return;
        }
        const raf = requestAnimationFrame(() => setShowTimeTrackingContentVisible(true));
        return () => cancelAnimationFrame(raf);
    }, [attendanceUiReady, effectiveIsClockedInSession]);

    useEffect(() => {
        if (location.state?.refresh) {
            console.log("Dashboard received refresh signal, refetching data...");
            if (fetchAllDataRef.current) {
                invalidateEmployeeDashboardCache();
                fetchAllDataRef.current(false, true);
            }
            window.history.replaceState({}, document.title);
        }
    }, [location.state]); // Remove fetchAllData from deps to prevent re-runs

    // Socket debounce: prevent multiple refetches when several events fire in short succession
    const socketDebounceRef = useRef(null);
    const SOCKET_DEBOUNCE_MS = 600;

    // Socket.IO listeners for real-time updates (attendance + leave requests)
    // AUDIT: Listeners registered once per user; cleanup on unmount. Debounce avoids duplicate fetches.
    useEffect(() => {
        if (!contextUser) return;

        const scheduleRefetch = () => {
            if (socketDebounceRef.current) clearTimeout(socketDebounceRef.current);
            socketDebounceRef.current = setTimeout(() => {
                socketDebounceRef.current = null;
                if (fetchAllDataRef.current) {
                    fetchAllDataRef.current(false).catch(err => {
                        console.error('Failed to refresh after socket update:', err);
                    });
                }
            }, SOCKET_DEBOUNCE_MS);
        };

        const handleAttendanceLogUpdate = (data) => {
            const isRelevant = !data?.userId || [contextUser.id, contextUser._id].some(
                id => id != null && String(data.userId) === String(id)
            );
            if (!isRelevant) return;
            // Own just-completed mutation already issued a refetch; skip the echo socket.
            if (Date.now() - lastMutationFetchAtRef.current < OWN_MUTATION_REFETCH_SUPPRESS_MS) {
                return;
            }
            scheduleRefetch();
        };

        const handleLeaveRequestUpdate = (data) => {
            // Employee dashboard shows myRequests; any leave update for this user is relevant
            const isRelevant = !data?.userId || [contextUser.id, contextUser._id].some(
                id => id != null && String(data.userId) === String(id)
            );
            if (isRelevant) scheduleRefetch();
        };

        const handleUserProfileUpdate = (data) => {
            // Refresh user context when Saturday policy or other profile fields are updated
            const isRelevant = !data?.userId || [contextUser.id, contextUser._id].some(
                id => id != null && String(data.userId) === String(id)
            );
            if (isRelevant && data.field === 'alternateSaturdayPolicy') {
                // Refresh user data from AuthContext to get updated Saturday policy
                if (updateUserContext) {
                    updateUserContext({ alternateSaturdayPolicy: data.newValue });
                }
                // Also refresh dashboard data to reflect the change
                scheduleRefetch();
            }
        };

        socket.on('attendance_log_updated', handleAttendanceLogUpdate);
        socket.on('leave_request_updated', handleLeaveRequestUpdate);
        socket.on('user_profile_updated', handleUserProfileUpdate);

        return () => {
            if (socketDebounceRef.current) clearTimeout(socketDebounceRef.current);
            socketDebounceRef.current = null;
            socket.off('attendance_log_updated', handleAttendanceLogUpdate);
            socket.off('leave_request_updated', handleLeaveRequestUpdate);
            socket.off('user_profile_updated', handleUserProfileUpdate);
        };
    }, [contextUser?.id, contextUser?._id, updateUserContext]);

    const workedMinutes = useMemo(() => {
        if (!uiDailyData?.sessions?.[0]?.startTime) return 0;
        const now = new Date();
        const grossTimeMs = uiDailyData.sessions.reduce((total, s) => total + ((s.endTime ? new Date(s.endTime) : now) - new Date(s.startTime)), 0);
        const breakTimeMs = (breaksForUi || []).reduce((total, b) => total + ((b.endTime ? new Date(b.endTime) : now) - new Date(b.startTime)), 0);
        return Math.floor(Math.max(0, grossTimeMs - breakTimeMs) / 60000);
    }, [uiDailyData?.sessions, breaksForUi]);
    
    const serverCalculated = useMemo(() => {
        const paidMinutesTaken = uiDailyData?.attendanceLog?.paidBreakMinutesTaken || 0;
        const unpaidBreakMinutesTaken = uiDailyData?.attendanceLog?.unpaidBreakMinutesTaken || 0;
        const paidBreakAllowance = uiDailyData?.shift?.paidBreakMinutes || 30;
        const paidBreakExcess = Math.max(0, paidMinutesTaken - paidBreakAllowance);
        
        return {
            penaltyMinutes: uiDailyData?.attendanceLog?.penaltyMinutes || 0,
            paidMinutesTaken,
            unpaidBreakMinutesTaken,
            paidBreakExcess,
        };
    }, [uiDailyData?.attendanceLog, uiDailyData?.shift]);
    
    const paidBreakAllowance = uiDailyData?.shift?.paidBreakMinutes || 30;
    const rawDurationHours = uiDailyData?.shift?.durationHours;
    const scheduledShiftMinutes = (rawDurationHours != null && Number(rawDurationHours) > 0 ? Number(rawDurationHours) * 60 : null) ?? 9 * 60;

    // Unified time model: single source for timer, progress bar, and required logout (updates every second when clocked in).
    const [tickNow, setTickNow] = useState(() => new Date());
    useEffect(() => {
        const isClockedInOrBreak = statusForUi === 'Clocked In' || statusForUi === 'On Break';
        const needsTick = isClockedInOrBreak || isOnTeaBreak || showTourPreviewUi;
        if (!needsTick) return;
        if (isClockedInOrBreak && !uiDailyData?.sessions?.length && !isOnTeaBreak && !showTourPreviewUi) return;
        const intervalId = setInterval(() => setTickNow(new Date()), 1000);
        return () => clearInterval(intervalId);
    }, [statusForUi, uiDailyData?.sessions?.length, isOnTeaBreak, showTourPreviewUi]);

    const tourPreviewStatusForUi = showTourPreviewUi ? 'Clocked In' : statusForUi;
    const tourPreviewDisplayStatus = showTourPreviewUi ? 'Clocked In' : displayStatus;

    const teaBreakRemainingSec = useMemo(
        () => computeTeaBreakRemainingSeconds(teaBreakData, tickNow.getTime()),
        [teaBreakData, tickNow]
    );

    // Tea break: show End Break only in the last minute (never Check Out).
    const canEndTeaBreak = isOnTeaBreak && !isOnBreakUI && teaBreakRemainingSec <= 60;
    const showEndBreakButton = isOnBreakUI || canEndTeaBreak;

    const unifiedState = useMemo(() => {
        const clockIn = uiDailyData?.sessions?.[0]?.startTime;
        if (!clockIn || !uiDailyData?.sessions?.length) return null;
        return getUnifiedShiftTimeState(clockIn, uiDailyData.sessions, breaksForUi, tickNow, {
            scheduledShiftMinutes,
            allowedPaidBreakMinutes: paidBreakAllowance,
            backendRequiredLogoutTime: uiDailyData?.calculatedLogoutTime || null,
        });
    }, [uiDailyData?.sessions, uiDailyData?.calculatedLogoutTime, breaksForUi, tickNow, scheduledShiftMinutes, paidBreakAllowance]);

    // Real-time checkout availability: only write canCheckout when the boolean actually flips.
    // Remaining time is derived during render so we do not trigger a second dashboard commit every second.
    useEffect(() => {
        const isClockedInOrBreak = statusForUi === 'Clocked In' || statusForUi === 'On Break';
        if (!isClockedInOrBreak || pendingEarlyCheckoutRequest) {
            // If not clocked in or pending request, keep current state (server controls)
            return;
        }

        const requiredLogoutTime = unifiedState?.requiredLogoutTime
            ? new Date(unifiedState.requiredLogoutTime)
            : (requiredLogoutAt ? new Date(requiredLogoutAt) : null);

        if (!requiredLogoutTime) {
            setCanCheckout((prev) => (prev === true ? prev : true));
            return;
        }

        const canCheckoutNow = tickNow >= requiredLogoutTime;
        setCanCheckout((prev) => (prev === canCheckoutNow ? prev : canCheckoutNow));
    }, [tickNow, unifiedState?.requiredLogoutTime, requiredLogoutAt, statusForUi, pendingEarlyCheckoutRequest]);

    const effectiveRemainingTime = useMemo(() => {
        if (showTourPreviewUi) return 7200;
        const isClockedInOrBreak = statusForUi === 'Clocked In' || statusForUi === 'On Break';
        if (!isClockedInOrBreak || pendingEarlyCheckoutRequest) return remainingTime;
        const requiredLogoutTime = unifiedState?.requiredLogoutTime
            ? new Date(unifiedState.requiredLogoutTime)
            : (requiredLogoutAt ? new Date(requiredLogoutAt) : null);
        if (!requiredLogoutTime) return remainingTime;
        const remainingSecs = Math.ceil((requiredLogoutTime.getTime() - tickNow.getTime()) / 1000);
        return remainingSecs > 0 ? remainingSecs : null;
    }, [showTourPreviewUi, statusForUi, pendingEarlyCheckoutRequest, remainingTime, unifiedState?.requiredLogoutTime, requiredLogoutAt, tickNow]);

    const hasExhaustedPaidBreak = (serverCalculated.paidMinutesTaken || 0) >= paidBreakAllowance;
    const hasTakenUnpaidBreak = useMemo(() => dailyData?.breaks?.some(b => b.breakType === 'Unpaid'), [dailyData?.breaks]);
    const hasTakenExtraBreak = useMemo(() => dailyData?.breaks?.some(b => b.breakType === 'Extra'), [dailyData?.breaks]);
    const hasPendingExtraBreak = !!dailyData?.pendingExtraBreakRequest;
    const hasApprovedExtraBreak = !!dailyData?.approvedExtraBreak;
    
    // Event-driven break window scheduler (NO polling/intervals)
    // Automatically triggers re-evaluation at exact break window boundaries
    useBreakWindowScheduler({
        breakWindows: contextUser?.featurePermissions?.breakWindows,
        isClockedIn: dailyData?.status === 'Clocked In',
        onTrigger: () => setBreakTriggerTick(prev => prev + 1)
    });
    
    // Break eligibility checks - re-evaluated on breakTriggerTick (scheduled timeout events)
    const paidBreakCheck = useMemo(() => breakLimits.canTakeBreakNow('Paid'), [breakLimits, breakTriggerTick]);
    const unpaidBreakCheck = useMemo(() => breakLimits.canTakeBreakNow('Unpaid'), [breakLimits, breakTriggerTick]);
    const extraBreakCheck = useMemo(() => breakLimits.canTakeBreakNow('Extra'), [breakLimits, breakTriggerTick]);

    const activeBreakOverride = useMemo(
        () => (isOnBreakUI && uiBreakState
            ? { _id: uiBreakState.id, breakType: uiBreakState.type, startTime: uiBreakState.startTime, endTime: null }
            : null),
        [isOnBreakUI, uiBreakState?.id, uiBreakState?.type, uiBreakState?.startTime]
    );

    const isAnyBreakPossible = useMemo(() => {
        if (!canAccess.breaks() || !canAccess.takeBreak()) return false;
        
        const paidAllowed = !hasExhaustedPaidBreak && paidBreakCheck.allowed;
        const unpaidAllowed = !hasTakenUnpaidBreak && unpaidBreakCheck.allowed;
        const extraAllowed = hasApprovedExtraBreak && !hasTakenExtraBreak && extraBreakCheck.allowed;
        const requestExtraAllowed = !hasPendingExtraBreak && !hasTakenExtraBreak && extraBreakCheck.allowed;

        return paidAllowed || unpaidAllowed || extraAllowed || requestExtraAllowed;
    }, [
        canAccess, hasExhaustedPaidBreak, paidBreakCheck, hasTakenUnpaidBreak, 
        unpaidBreakCheck, hasApprovedExtraBreak, hasTakenExtraBreak, 
        hasPendingExtraBreak, extraBreakCheck
    ]);
    
    const handleActionWithOptimisticUpdate = async (apiCall, optimisticUpdate) => {
        setActionLoading(true); setError('');
        const previousDailyData = dailyData;
        optimisticUpdate();
        try { await apiCall(); await fetchAllData(); } 
        catch (err) { setDailyData(previousDailyData); setError(err.response?.data?.error || 'An unexpected error occurred.'); } 
        finally { setActionLoading(false); }
    };

    const handleClockIn = async () => {
        if (clockInActionInFlightRef.current) return;
        
        try {
            let location = getCachedLocationOnly();
            if (!location) location = await getCurrentLocation();

            // Immediate optimistic UI update for instant feedback
            clockInActionInFlightRef.current = true;
            setActionLoading(true);
            setError('');
            const previousDailyData = dailyData;
            setDailyData(prev => ({ ...prev, status: 'Clocked In', sessions: [{ startTime: new Date().toISOString(), endTime: null }] }));
            setSnackbar({ open: true, message: 'Checked in successfully!' });

            try {
                const res = await api.post('/attendance/clock-in', location);

                // If backend signals weekly late warning (3+), show a popup but DO NOT lock account
                const warning = res?.data?.weeklyLateWarning;
                if (warning && warning.showPopup) {
                    setWeeklyLateDialog({ open: true, lateCount: warning.lateCount || 0, lateDates: warning.lateDates || [] });
                }

                // Refresh data from server (non-blocking for UI)
                invalidateEmployeeDashboardCache();
                markOwnMutationRefetch();
                window.dispatchEvent(new CustomEvent('dashboard-refresh-requested'));
                if (fetchAllDataRef.current) {
                    fetchAllDataRef.current(false, true).catch(err => {
                        console.error('Failed to refresh data after clock-in:', err);
                    });
                }
            } catch (err) {
                // Revert optimistic update on error and show message
                setDailyData(previousDailyData);
                setError(err.response?.data?.error || 'Failed to clock in.');
                setSnackbar({ open: true, message: 'Check in failed. Please try again.' });
            } finally {
                setActionLoading(false);
                clockInActionInFlightRef.current = false;
            }
        } catch (locationError) {
            clockInActionInFlightRef.current = false;
            setActionLoading(false);
            setError('Location access is required to clock in. Please enable location permissions.');
        }
    };
    const handleClockOut = async () => {
        if (tourPreview) {
            setSnackbar({ open: true, message: 'Check-out preview — no attendance recorded during onboarding.' });
            return;
        }
        if (clockOutActionInFlightRef.current) return;
        clockOutActionInFlightRef.current = true;
        setActionLoading(true);
        setError('');
        const previousDailyData = dailyData;
        setDailyData(prev => ({ ...prev, status: 'Clocked Out' }));
        setSnackbar({ open: true, message: 'Checked out successfully!' });
        try {
            await api.post('/attendance/clock-out');
            clearTeaBreak();
            invalidateEmployeeDashboardCache();
            markOwnMutationRefetch();
            if (fetchAllDataRef.current) fetchAllDataRef.current(false, true).catch(() => {});
        } catch (err) {
            setDailyData(previousDailyData);
            setError(err.response?.data?.error || 'Failed to clock out. Please try again.');
            setSnackbar({ open: true, message: 'Check out failed. Please try again.' });
        } finally {
            setActionLoading(false);
            clockOutActionInFlightRef.current = false;
        }
    };

    const handleCheckOutClick = () => {
        if (pendingEarlyCheckoutRequest && !tourPreview) return;
        if (effectiveCanCheckout) {
            handleClockOut();
        } else {
            if (tourPreview) setTourPreviewCheckoutConfirmed(false);
            setEarlyCheckoutWarningOpen(true);
        }
    };

    const handleEarlyCheckoutClose = () => {
        setEarlyCheckoutWarningOpen(false);
        setEarlyCheckoutNote('');
        setTourPreviewCheckoutConfirmed(false);
    };

    const handleEarlyCheckoutConfirm = async () => {
        const note = (earlyCheckoutNote || '').trim();
        if (!note || note.length < 25) return;
        if (tourPreview) {
            setTourPreviewCheckoutConfirmed(true);
            return;
        }
        if (clockOutActionInFlightRef.current) return;
        clockOutActionInFlightRef.current = true;
        setActionLoading(true);
        setError('');
        setEarlyCheckoutWarningOpen(false);
        setEarlyCheckoutNote('');
        try {
            await api.post('/attendance/early-checkout-request', { reason: note });
            setSnackbar({ open: true, message: 'Early checkout request sent for admin approval.' });
            setPendingEarlyCheckoutRequest(prev => prev || { status: 'Pending', _id: 'pending' });
            setCanCheckout(false);
            invalidateEmployeeDashboardCache();
            markOwnMutationRefetch();
            if (fetchAllDataRef.current) fetchAllDataRef.current(false, true).catch(() => {});
        } catch (err) {
            setError(err.response?.data?.error || 'Failed. Please try again.');
            setSnackbar({ open: true, message: err.response?.data?.error || 'Request failed. Please try again.' });
        } finally {
            setActionLoading(false);
            clockOutActionInFlightRef.current = false;
        }
    };

    /** Format remaining seconds as "X hrs Y mins Z secs" or "Y mins Z secs" or "Z secs" (display only, includes seconds for clarity). */
    const formatRemainingTimeDisplay = useMemo(() => (seconds) => {
        if (seconds == null || typeof seconds !== 'number' || seconds < 0) return '';
        const totalSeconds = Math.floor(seconds);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        
        const parts = [];
        if (h > 0) {
            parts.push(`${h} ${h !== 1 ? 'hrs' : 'hr'}`);
        }
        if (m > 0 || h > 0) {
            parts.push(`${m} ${m !== 1 ? 'mins' : 'min'}`);
        }
        if (s > 0 || (h === 0 && m === 0)) {
            parts.push(`${s} ${s !== 1 ? 'secs' : 'sec'}`);
        }
        
        return parts.join(' ');
    }, []);

    const handleStartBreak = async (breakType) => {
        if (tourPreview) {
            setTourPreviewSelectedBreak(breakType);
            return;
        }
        if (breakActionInFlightRef.current) return;
        breakActionInFlightRef.current = true;
        setIsBreakModalOpen(false);
        setError('');
        const previousDailyData = dailyData;
        startUiBreak(breakType);
        setSnackbar({ open: true, message: `Break started successfully!` });
        
        try {
            const res = await api.post('/breaks/start', { breakType });
            const createdBreak = res?.data?.break;
            if (createdBreak && createdBreak.startTime) {
                setUiBreakState({
                    id: createdBreak._id || createdBreak.id || 'backend',
                    type: createdBreak.breakType || createdBreak.type || breakType,
                    startTime: createdBreak.startTime,
                    source: 'backend',
                });
            }
            // Refresh data from server (non-blocking for UI)
            invalidateEmployeeDashboardCache();
            markOwnMutationRefetch();
            if (fetchAllDataRef.current) {
                fetchAllDataRef.current(false, true).catch(err => {
                    console.error('Failed to refresh data after break start:', err);
                });
            }
        } catch (err) {
            // Revert on error
            setDailyData(previousDailyData);
            endUiBreak();
            setError(err.response?.data?.error || 'Failed to start break. Please try again.');
            setSnackbar({ open: true, message: 'Failed to start break. Please try again.' });
        } finally {
            breakActionInFlightRef.current = false;
        }
    };

    const handleEndTeaBreak = async () => {
        if (breakActionInFlightRef.current || !teaBreakData?.announcementId) return;
        breakActionInFlightRef.current = true;
        setError('');
        try {
            await api.post('/tea-break/end', { announcementId: teaBreakData.announcementId });
            clearTeaBreak();
            setSnackbar({ open: true, message: 'Tea break ended successfully!' });
            invalidateEmployeeDashboardCache();
            markOwnMutationRefetch();
            if (fetchAllDataRef.current) {
                await fetchAllDataRef.current(true, true);
            }
        } catch (err) {
            console.error('End tea break error:', err);
            setError(err.response?.data?.message || 'Failed to end tea break.');
        } finally {
            breakActionInFlightRef.current = false;
        }
    };

    const handleEndBreak = async () => {
        if (breakActionInFlightRef.current) return;
        breakActionInFlightRef.current = true;
        setError('');
        const previousDailyData = dailyData;
        const previousUiBreakState = uiBreakState;
        
        endUiBreak();
        setSnackbar({ open: true, message: 'Break ended successfully!' });

        const activeBreak = breaksForUi?.find(b => b && !b.endTime) || null;
        const breakIdFromUi = previousUiBreakState?.id && previousUiBreakState.id !== 'local' ? previousUiBreakState.id : undefined;
        const breakIdFromData = activeBreak?._id || activeBreak?.id;
        const breakId = breakIdFromUi || breakIdFromData;

        try {
            if (breakId) {
                await api.post('/breaks/end', { breakId });
            } else {
                await api.post('/breaks/end');
            }
            invalidateEmployeeDashboardCache();
            markOwnMutationRefetch();
            if (fetchAllDataRef.current) {
                fetchAllDataRef.current(false, true).catch(err => {
                    console.error('Failed to refresh data after break end:', err);
                });
            }
        } catch (err) {
            setDailyData(previousDailyData);
            setUiBreakState(previousUiBreakState);
            clearLocallyEndedBreak();
            setError(err.response?.data?.error || 'Failed to end break. Please try again.');
            setSnackbar({ open: true, message: 'Failed to end break. Please try again.' });
        } finally {
            breakActionInFlightRef.current = false;
        }
    };
    
    const handleRequestExtraBreak = async () => {
        if (!breakReason.trim()) { setError("Please provide a reason."); return; }
        if (tourPreview) {
            handleCloseReasonModal();
            setSnackbar({ open: true, message: 'Extra break request preview — not submitted during onboarding.' });
            return;
        }
        setIsSubmittingReason(true); setError('');
        try {
            await api.post('/breaks/request-extra', { reason: breakReason });
            setSnackbar({ open: true, message: 'Request sent for approval.' });
            handleCloseReasonModal();
            invalidateEmployeeDashboardCache();
            markOwnMutationRefetch();
            if (fetchAllDataRef.current) {
                await fetchAllDataRef.current(false, true);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to send request.');
        } finally {
            setIsSubmittingReason(false);
        }
    };

    const handleOpenBreakModal = useCallback(() => {
        setTourPreviewSelectedBreak(null);
        setIsBreakModalOpen(true);
    }, []);
    const handleCloseBreakModal = useCallback(() => {
        setIsBreakModalOpen(false);
        setTourPreviewSelectedBreak(null);
    }, []);
    const handleOpenReasonModal = useCallback(() => {
        setIsBreakModalOpen(false);
        setIsReasonModalOpen(true);
    }, []);
    const handleCloseReasonModal = useCallback(() => {
        setIsReasonModalOpen(false);
        setBreakReason('');
        setError('');
    }, []);

    const { authStatus } = useAuth();

    if (authStatus === 'unknown' || !contextUser) {
        return <EmployeeDashboardSkeleton />;
    }

    return (
        <Box className="employee-dashboard-container">
            <Box>
                {/* Pending Policy Acknowledgement Banner */}
                <PendingPolicyBanner />

                {error && (
                    <Alert
                        severity="error"
                        onClose={() => setError('')}
                        sx={{ mb: 3 }}
                        action={
                            <Button color="inherit" size="small" onClick={() => { setError(''); invalidateEmployeeDashboardCache(); fetchAllDataRef.current?.(true, true); }}>
                                Retry
                            </Button>
                        }
                    >
                        {error}
                    </Alert>
                )}
                {hasPendingExtraBreak && (
                    <Alert severity="info" icon={<HourglassTopIcon />} sx={{ mb: 3, '.MuiAlert-message': { width: '100%' } }}>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" sx={{ fontWeight: 400, letterSpacing: '0.025em' }}>Your request for an extra break is pending approval.</Typography>
                            <Chip label="Pending" size="small" sx={{ fontWeight: 500, letterSpacing: '0.025em' }} />
                        </Box>
                    </Alert>
                )}
                
                <Grid container spacing={3} alignItems="flex-start">
                    <Grid item xs={12} lg={4}>
                        <Stack spacing={3}>
                            <Paper className="dashboard-card-base action-card" data-tour="attendance-card">
                                <Box>
                                    <Typography component="h1" variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827' }} className="theme-text-black">Time Tracking</Typography>
                                    {attendanceUiReady ? (
                                        <Typography variant="body2" sx={{ mb: 2.5, fontWeight: 400, color: '#4b5563', fontSize: '0.8125rem', lineHeight: 1.4 }}>
                                            {showTourPreviewUi
                                                ? 'Status: Clocked In (Tour Preview)'
                                                : uiDailyData.status === 'Not Clocked In' || uiDailyData.status === 'Clocked Out'
                                                    ? 'You are currently checked out. Ready to start your day?'
                                                    : `Status: ${tourPreviewDisplayStatus}`}
                                        </Typography>
                                    ) : (
                                        <Skeleton variant="text" width="80%" height={20} sx={{ mb: 2.5 }} />
                                    )}
                                </Box>
                                {attendanceUiReady ? (
                                    <>
                                        <Box
                                            className={`time-tracking-content ${showTimeTrackingContentVisible && effectiveIsClockedInSession ? 'visible' : 'hidden'}`}
                                            sx={{ my: 'auto' }}
                                        >
                                            <MemoizedShiftProgressBar
                                                workedMinutes={workedMinutes}
                                                unpaidBreakMinutes={serverCalculated.unpaidBreakMinutesTaken}
                                                paidBreakExcess={serverCalculated.paidBreakExcess}
                                                status={tourPreviewStatusForUi}
                                                breaks={breaksForUi}
                                                sessions={uiDailyData.sessions}
                                                activeBreakOverride={activeBreakOverride}
                                                unifiedState={unifiedState}
                                            />
                                            <Box sx={{ mb: 2, textAlign: 'center' }}>
                                                {isShowingBreakTimer ? (
                                                    <MemoizedBreakTimer
                                                        breaks={breaksForUi}
                                                        paidBreakAllowance={paidBreakAllowance}
                                                        activeBreakOverride={activeBreakOverride}
                                                        unifiedDisplay={true}
                                                        teaBreakOverride={
                                                            isOnTeaBreak && !isOnBreakUI
                                                                ? {
                                                                    startTime: teaBreakData.startedAt,
                                                                    endsAt: teaBreakData.endsAt,
                                                                    clockOffsetMs: teaBreakData.clockOffsetMs ?? 0,
                                                                    breakType: 'Unpaid',
                                                                }
                                                                : null
                                                        }
                                                    />
                                                ) : (
                                                    <MemoizedWorkTimeTracker
                                                        sessions={uiDailyData.sessions}
                                                        breaks={breaksForUi}
                                                        status={tourPreviewStatusForUi}
                                                        unifiedState={unifiedState}
                                                    />
                                                )}
                                                <Typography
                                                    variant="overline"
                                                    sx={{
                                                        mt: 1,
                                                        color: '#6b7280',
                                                        fontWeight: 500,
                                                        fontSize: '0.6875rem',
                                                        letterSpacing: '0.05em'
                                                    }}
                                                >
                                                    {isShowingBreakTimer ? 'BREAK TIME' : 'WORK DURATION'}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Stack direction="row" spacing={2} sx={{ mt: 'auto', width: '100%' }}>
                                            {actionLoading ? (
                                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', py: 1 }}>
                                                    <SkeletonBox width="100%" height="36px" borderRadius="8px" />
                                                </Box>
                                            ) : showTourPreviewUi ? (
                                                <>
                                                    <Button variant="contained" className="theme-button-red theme-button-break" onClick={handleOpenBreakModal} startIcon={<FreeBreakfastIcon />} data-tour="break-btn">Start Break</Button>
                                                    <Button
                                                        variant="outlined"
                                                        className={`theme-button-checkout${earlyCheckoutWarningOpen ? ' tour-preview-active' : ''}`}
                                                        onClick={handleCheckOutClick}
                                                        startIcon={<LogoutIcon />}
                                                        data-tour="clock-out"
                                                        sx={{ marginLeft: 'auto' }}
                                                    >
                                                        Check Out
                                                    </Button>
                                                </>
                                            ) : uiDailyData.status === 'Not Clocked In' || uiDailyData.status === 'Clocked Out' ? (
                                                canAccess.checkIn() ? (
                                                    <Button fullWidth className="theme-button-red" onClick={handleClockIn} data-tour="clock-in">Check In</Button>
                                                ) : (
                                                    <Button fullWidth disabled className="theme-button-red">Check In (Disabled)</Button>
                                                )
                                            ) : showEndBreakButton ? (
                                                <Button
                                                    fullWidth
                                                    variant="contained"
                                                    color="success"
                                                    className="theme-button-break-end"
                                                    onClick={isOnBreakUI ? handleEndBreak : handleEndTeaBreak}
                                                    startIcon={<PlayArrowIcon />}
                                                >
                                                    End Break
                                                </Button>
                                            ) : isOnTeaBreak ? (
                                                null
                                            ) : uiDailyData.status === 'Clocked In' ? (
                                                <>
                                                    <Tooltip title={!isAnyBreakPossible ? 'No breaks are currently available' : ''} placement="top">
                                                        <span>
                                                            <Button variant="contained" className="theme-button-red theme-button-break" onClick={handleOpenBreakModal} startIcon={<FreeBreakfastIcon />} disabled={!isAnyBreakPossible} data-tour="break-btn">Start Break</Button>
                                                        </span>
                                                    </Tooltip>
                                                    {canAccess.checkOut() ? (
                                                        pendingEarlyCheckoutRequest ? (
                                                            <Tooltip title="Early checkout request pending; checkout is blocked until admin approval" placement="top">
                                                                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                                                    <Button variant="outlined" disabled className="theme-button-checkout" startIcon={<LogoutIcon />}>Check Out</Button>
                                                                    <Chip size="small" label="Awaiting Admin Approval" color="warning" sx={{ fontWeight: 500 }} />
                                                                </span>
                                                            </Tooltip>
                                                        ) : (
                                                            <Tooltip title={!effectiveCanCheckout ? 'Check out early (reason required)' : ''} placement="top">
                                                                <span style={{ marginLeft: 'auto' }}>
                                                                    <Button variant="outlined" className="theme-button-checkout" onClick={handleCheckOutClick} startIcon={<LogoutIcon />} data-tour="clock-out">Check Out</Button>
                                                                </span>
                                                            </Tooltip>
                                                        )
                                                    ) : (
                                                        <Button variant="outlined" disabled className="theme-button-checkout" startIcon={<LogoutIcon />} sx={{ ml: 'auto !important' }}>Check Out (Disabled)</Button>
                                                    )}
                                                </>
                                            ) : null}
                                        </Stack>
                                    </>
                                ) : (
                                    <>
                                        <Box className="time-tracking-skeleton" sx={{ my: 'auto' }}>
                                            <SkeletonBox width="100%" height={112} borderRadius="8px" sx={{ mb: 2 }} />
                                            <SkeletonBox width="100%" height={72} borderRadius="8px" />
                                        </Box>
                                        <Stack direction="row" spacing={2} sx={{ mt: 'auto', width: '100%' }}>
                                            <SkeletonBox width="100%" height="36px" borderRadius="8px" />
                                        </Stack>
                                    </>
                                )}
                            </Paper>
                            <Paper className="dashboard-card-base weekly-view-card">
                                {dataReady ? (
                                    <MemoizedWeeklyTimeCards logs={weeklyLogs} shift={dailyData?.shift || contextUser?.shift} user={contextUser} leaveRequests={myRequests} />
                                ) : (
                                    <WeeklyTimeCardsSkeleton />
                                )}
                            </Paper>
                        </Stack>
                    </Grid>
                    <Grid item xs={12} lg={4}>
                        <Stack spacing={3}>
                            <Paper className="dashboard-card-base profile-card">
                                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                                    <UserAvatar 
                                        user={contextUser} 
                                        size={80}
                                        sx={{
                                            boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)'
                                        }}
                                    />
                                </Box>
                                <Typography component="p" variant="subtitle1" className="theme-text-black" sx={{ fontWeight: 600, mb: 0.5, fontSize: '1rem', color: '#111827' }}>{contextUser.fullName || contextUser.name}</Typography>
                                <Typography variant="body2" sx={{ color: '#1f2937', mb: 1, fontWeight: 500, fontSize: '0.8125rem' }}>Employee Code: {contextUser.employeeCode || 'N/A'}</Typography>
                                <Divider sx={{ my: 1, borderColor: 'var(--theme-red)', borderWidth: '1px', width: '50px', marginX: 'auto' }} />
                                <Chip
                                    label={`${contextUser.designation || contextUser.role || 'Employee'}${contextUser.employmentStatus ? ` (${contextUser.employmentStatus})` : ''}`}
                                    size="small"
                                    sx={{ mt: 1, mb: 2, bgcolor: 'var(--theme-red-light)', color: 'var(--theme-red)', fontWeight: 500, fontSize: '0.75rem' }}
                                />
                                <Typography variant="body2" sx={{ fontWeight: 400, color: '#4b5563', fontSize: '0.8125rem' }}>{formatISTDate(getISTNow(), { month: 'long', day: 'numeric', year: 'numeric' })}</Typography>
                            </Paper>
                            <Paper className="dashboard-card-base shift-info-card">
                                <Typography component="h2" variant="subtitle2" className="theme-text-black" sx={{ fontWeight: 600, fontSize: '0.9375rem', mb: 1.25, color: '#111827' }}>Today's Shift</Typography>
                                <Divider sx={{ mb: 1.5 }} />
                                <Stack spacing={3} divider={<Divider flexItem />} sx={{ flexGrow: 1, minHeight: 260 }}>
                                    {dataReady || showTourPreviewUi ? (
                                        <MemoizedShiftInfoDisplay
                                            dailyData={uiDailyData}
                                            fallbackShift={contextUser?.shift}
                                            lastLogoutBaselineReceivedAtRef={lastLogoutBaselineReceivedAtRef}
                                            isOnBreak={isOnBreakUI}
                                            unifiedState={unifiedState}
                                        />
                                    ) : (
                                        <ShiftInfoSkeleton />
                                    )}
                                    <MemoizedLiveClock />
                                </Stack>
                            </Paper>
                        </Stack>
                    </Grid>
                    <Grid item xs={12} lg={4}>
                        <Stack spacing={3} sx={{ height: '100%' }}>
                            <Paper className="dashboard-card-base recent-activity-card" sx={{ display: 'flex', flexDirection: 'column' }}>
                                <Box sx={{ flexGrow: 1, overflowY: 'auto', minHeight: 320 }}>
                                    {dataReady ? (
                                        <MemoizedRecentActivityCard dailyData={dailyData} />
                                    ) : (
                                        <RecentActivitySkeleton />
                                    )}
                                </Box>
                            </Paper>
                            <Paper className="dashboard-card-base saturday-schedule-card" sx={{ display: 'flex', flexDirection: 'column' }}>
                                <Typography component="h2" variant="subtitle2" className="theme-text-black" sx={{ fontWeight: 600, fontSize: '0.9375rem', mb: 1.25, color: '#111827' }}>Upcoming Saturdays</Typography>
                                <Divider sx={{ mb: 1.5 }} />
                                <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                                    {dataReady ? (
                                        <MemoizedSaturdaySchedule policy={contextUser?.alternateSaturdayPolicy || 'All Saturdays Working'} requests={myRequests} />
                                    ) : (
                                        <SaturdayScheduleSkeleton />
                                    )}
                                </Box>
                            </Paper>
                        </Stack>
                    </Grid>
                </Grid>

                <Dialog 
                    open={isBreakModalOpen} 
                    onClose={handleCloseBreakModal} 
                    TransitionComponent={BreakModalTransition} 
                    PaperProps={{ className: 'break-modal-paper' }}
                    sx={tourPreview ? { zIndex: 100002 } : undefined}
                >
                    <DialogTitle className="break-modal-title">Choose Your Break Type<IconButton aria-label="close" onClick={handleCloseBreakModal} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton></DialogTitle>
                    <DialogContent dividers className="break-modal-content">
                        <Stack spacing={1.5} sx={{ py: 0.5 }}>
                            {(tourPreview ? (
                                <Box>
                                    <Paper className={`break-modal-card paid${tourPreviewSelectedBreak === 'Paid' ? ' selected' : ''}`} onClick={() => handleStartBreak('Paid')}><AccountBalanceWalletIcon className="break-modal-icon paid" /><Box><Typography variant="h6" sx={{ fontWeight: 500, letterSpacing: '0.025em' }}>Paid Break</Typography><Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, letterSpacing: '0.025em' }}>{Math.max(0, paidBreakAllowance - serverCalculated.paidMinutesTaken)} mins remaining</Typography></Box></Paper>
                                </Box>
                            ) : (
                            <Tooltip title={!paidBreakCheck.allowed ? paidBreakCheck.message : (hasExhaustedPaidBreak ? 'You have used all your paid break time' : '')} arrow placement="left">
                                <Box>
                                    <Paper className={`break-modal-card paid ${!tourPreview && (hasExhaustedPaidBreak || !paidBreakCheck.allowed) ? 'disabled' : ''}${tourPreviewSelectedBreak === 'Paid' ? ' selected' : ''}`} onClick={tourPreview || (!hasExhaustedPaidBreak && paidBreakCheck.allowed) ? () => handleStartBreak('Paid') : undefined}><AccountBalanceWalletIcon className="break-modal-icon paid" /><Box><Typography variant="h6" sx={{ fontWeight: 500, letterSpacing: '0.025em' }}>Paid Break</Typography><Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, letterSpacing: '0.025em' }}>{Math.max(0, paidBreakAllowance - serverCalculated.paidMinutesTaken)} mins remaining</Typography></Box></Paper>
                                </Box>
                            </Tooltip>
                            ))}

                            {(tourPreview ? (
                                <Box>
                                    <Paper className={`break-modal-card unpaid${tourPreviewSelectedBreak === 'Unpaid' ? ' selected' : ''}`} onClick={() => handleStartBreak('Unpaid')}><NoMealsIcon className="break-modal-icon unpaid" /><Box><Typography variant="h6" sx={{ fontWeight: 500, letterSpacing: '0.025em' }}>Unpaid Break</Typography><Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, letterSpacing: '0.025em' }}>10 minute break</Typography></Box></Paper>
                                </Box>
                            ) : (
                            <Tooltip title={!unpaidBreakCheck.allowed ? unpaidBreakCheck.message : (hasTakenUnpaidBreak ? 'You have already taken an unpaid break today' : '')} arrow placement="left">
                                <Box>
                                    <Paper className={`break-modal-card unpaid ${!tourPreview && (hasTakenUnpaidBreak || !unpaidBreakCheck.allowed) ? 'disabled' : ''}${tourPreviewSelectedBreak === 'Unpaid' ? ' selected' : ''}`} onClick={tourPreview || (!hasTakenUnpaidBreak && unpaidBreakCheck.allowed) ? () => handleStartBreak('Unpaid') : undefined}><NoMealsIcon className="break-modal-icon unpaid" /><Box><Typography variant="h6" sx={{ fontWeight: 500, letterSpacing: '0.025em' }}>Unpaid Break</Typography><Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, letterSpacing: '0.025em' }}>10 minute break</Typography></Box></Paper>
                                </Box>
                            </Tooltip>
                            ))}

                            {(tourPreview ? (
                                <Box>
                                    <Paper className={`break-modal-card extra${tourPreviewSelectedBreak === 'Extra' ? ' selected' : ''}`} onClick={() => handleStartBreak('Extra')}><MoreTimeIcon className="break-modal-icon extra" /><Box><Typography variant="h6" sx={{ fontWeight: 500, letterSpacing: '0.025em' }}>Request Extra Break</Typography><Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, letterSpacing: '0.025em' }}>Requires admin approval</Typography></Box></Paper>
                                </Box>
                            ) : (
                            <Tooltip title={!extraBreakCheck.allowed ? extraBreakCheck.message : (hasPendingExtraBreak ? 'Your request is pending' : hasTakenExtraBreak ? 'You have already used an extra break' : '')} arrow placement="left">
                                <Box>
                                    <Paper className={`break-modal-card extra ${!tourPreview && (hasPendingExtraBreak || (!hasApprovedExtraBreak && hasTakenExtraBreak) || !extraBreakCheck.allowed) ? 'disabled' : ''}${tourPreviewSelectedBreak === 'Extra' ? ' selected' : ''}`} onClick={tourPreview ? () => handleStartBreak('Extra') : (hasApprovedExtraBreak && !hasTakenExtraBreak && extraBreakCheck.allowed ? () => handleStartBreak('Extra') : (hasPendingExtraBreak || hasTakenExtraBreak || !extraBreakCheck.allowed ? undefined : handleOpenReasonModal))}><MoreTimeIcon className="break-modal-icon extra" /><Box><Typography variant="h6" sx={{ fontWeight: 500, letterSpacing: '0.025em' }}>{hasApprovedExtraBreak ? 'Start Extra Break' : 'Request Extra Break'}</Typography><Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, letterSpacing: '0.025em' }}>{hasApprovedExtraBreak ? '10 minute approved break' : 'Requires admin approval'}</Typography></Box></Paper>
                                </Box>
                            </Tooltip>
                            ))}
                        </Stack>
                    </DialogContent>
                </Dialog>

                <Dialog open={isReasonModalOpen} onClose={handleCloseReasonModal} TransitionComponent={DialogTransition} fullWidth maxWidth="xs">
                    <DialogTitle sx={{ fontWeight: 500, letterSpacing: '0.025em' }}>Request Extra Break</DialogTitle>
                    <DialogContent><Typography variant="body2" sx={{ mb: 2, fontWeight: 400, letterSpacing: '0.025em' }}>Please provide a reason for your request. An admin will review it shortly.</Typography><TextField autoFocus margin="dense" id="reason" label="Reason for Break" type="text" fullWidth variant="outlined" multiline rows={3} value={breakReason} onChange={(e) => setBreakReason(e.target.value)} /></DialogContent>
                    <DialogActions sx={{ p: '16px 24px' }}><Button onClick={handleCloseReasonModal} className="theme-button-checkout">Cancel</Button><Button onClick={handleRequestExtraBreak} variant="contained" className="theme-button-red" disabled={isSubmittingReason}>{isSubmittingReason ? <SkeletonBox width="100px" height="24px" borderRadius="4px" /> : "Send Request"}</Button></DialogActions>
                </Dialog>

                {/* Weekly late warning dialog (informational only) */}
                <Dialog open={weeklyLateDialog.open} onClose={() => setWeeklyLateDialog({ ...weeklyLateDialog, open: false })} TransitionComponent={DialogTransition} fullWidth maxWidth="xs">
                    <DialogTitle sx={{ fontWeight: 500, letterSpacing: '0.025em' }}>Attendance Notice</DialogTitle>
                    <DialogContent>
                        <Typography variant="body1" sx={{ mb: 1, fontWeight: 400, letterSpacing: '0.025em' }}>You have been late <strong>{weeklyLateDialog.lateCount}</strong> time(s) this week.</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontWeight: 400, letterSpacing: '0.025em' }}>This is an informational notice. Your account will not be locked automatically.</Typography>
                        {weeklyLateDialog.lateDates && weeklyLateDialog.lateDates.length > 0 && (
                            <Box>
                                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 500, letterSpacing: '0.025em' }}>Dates:</Typography>
                                <ul>
                                    {weeklyLateDialog.lateDates.map(d => (<li key={d}><Typography variant="body2" sx={{ fontWeight: 400, letterSpacing: '0.025em' }}>{d}</Typography></li>))}
                                </ul>
                            </Box>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setWeeklyLateDialog({ ...weeklyLateDialog, open: false })} className="theme-button-checkout">Dismiss</Button>
                        <Button onClick={() => { setWeeklyLateDialog({ ...weeklyLateDialog, open: false }); window.location.href = '/contact-hr'; }} variant="contained" className="theme-button-red">Contact HR</Button>
                    </DialogActions>
                </Dialog>

                {/* Early checkout: single unified popup with warning, remaining time, and mandatory reason (feature-toggled) */}
                <Dialog
                    open={earlyCheckoutWarningOpen}
                    onClose={handleEarlyCheckoutClose}
                    maxWidth={false}
                    fullWidth
                    PaperProps={{ className: 'early-checkout-dialog-paper' }}
                    sx={tourPreview ? { zIndex: 100002 } : undefined}
                >
                    <DialogTitle className="early-checkout-dialog-title">Early Checkout</DialogTitle>
                    <Divider className="early-checkout-dialog-divider" />
                    <DialogContent className="early-checkout-dialog-content">
                        <Typography variant="body1" className="early-checkout-body-text">
                            You have not completed the required working time.
                            Are you sure you want to check out early?
                        </Typography>
                        {effectiveRemainingTime != null && (
                            <Typography variant="body2" className="early-checkout-remaining">
                                Remaining time: {formatRemainingTimeDisplay(effectiveRemainingTime)}
                                {hasHalfDayLeave && (
                                    <Typography component="span" variant="caption" display="block" sx={{ mt: 0.5, color: 'text.secondary' }}>
                                        Required: 5 hrs (half-day leave)
                                    </Typography>
                                )}
                            </Typography>
                        )}
                        <TextField
                            fullWidth
                            multiline
                            rows={4}
                            placeholder="Please provide a reason for early checkout"
                            value={earlyCheckoutNote}
                            onChange={(e) => setEarlyCheckoutNote(e.target.value)}
                            variant="outlined"
                            className="early-checkout-reason-field"
                            helperText={`Minimum 25 characters required${earlyCheckoutNote.trim() ? ` (${earlyCheckoutNote.trim().length}/25)` : ''}`}
                            error={earlyCheckoutNote.trim().length > 0 && earlyCheckoutNote.trim().length < 25}
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                        />
                    </DialogContent>
                    <DialogActions className="early-checkout-actions">
                        <Button variant="outlined" onClick={handleEarlyCheckoutClose}>Cancel</Button>
                        <Button
                            variant="contained"
                            onClick={handleEarlyCheckoutConfirm}
                            className={`theme-button-red${tourPreview && tourPreviewCheckoutConfirmed ? ' selected' : ''}`}
                            disabled={!earlyCheckoutNote.trim() || earlyCheckoutNote.trim().length < 25}
                        >
                            Confirm Check Out
                        </Button>
                    </DialogActions>
                </Dialog>
                
                <Snackbar 
                    open={snackbar.open} 
                    autoHideDuration={4000} 
                    onClose={() => setSnackbar({ ...snackbar, open: false })} 
                    message={snackbar.message}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                />
            </Box>
        </Box>
    );
};

export default EmployeeDashboardPage;