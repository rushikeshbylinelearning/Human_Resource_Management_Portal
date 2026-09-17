// src/pages/LeavesPage.jsx
import React, { useState, useEffect, useCallback, memo, useMemo, useRef } from 'react';
import { Typography, Button, Alert, Chip, Box, Snackbar, Paper, Divider, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, Dialog, DialogTitle, DialogContent, DialogActions, Grid, TextField, Radio, RadioGroup, FormControlLabel, FormControl, FormLabel, Menu, MenuItem, ListItemIcon, ListItemText, Skeleton } from '@mui/material';
import ForwardIcon from '@mui/icons-material/ArrowForward';
import WorkOutline from '@mui/icons-material/WorkOutline';
import BeachAccess from '@mui/icons-material/BeachAccess';
import AttachMoney from '@mui/icons-material/AttachMoney';
import Sick from '@mui/icons-material/Sick';
import CheckCircle from '@mui/icons-material/CheckCircle';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Calendar from 'lucide-react/dist/esm/icons/calendar';
import Plus from 'lucide-react/dist/esm/icons/plus';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import Heart from 'lucide-react/dist/esm/icons/heart';
import Umbrella from 'lucide-react/dist/esm/icons/umbrella';
import XCircle from 'lucide-react/dist/esm/icons/x-circle';
import Clock from 'lucide-react/dist/esm/icons/clock';
import LeaveRequestForm from '../components/LeaveRequestForm';
import EmployeeLeaveDetailsModal from '../components/EmployeeLeaveDetailsModal';
import SaturdaySchedule from '../components/SaturdaySchedule';
import { formatLeaveRequestType } from '../utils/saturdayUtils';
import { normalizeEmploymentType } from '../utils/leaveTypePolicy';
import socket from '../socket';
import {
  getEmployeeLeavesCacheKey,
  getLeavesCache,
  setLeavesCache,
  invalidateLeavesCache,
  LEAVES_REFETCH_COOLDOWN_MS,
} from '../utils/leavesCache';
import '../styles/LeavesPage.css';
import { CardSkeletonLoader, TableSkeleton, LeavesPageSkeleton, SkeletonBox } from '../components/SkeletonLoaders';
import PageHeroHeader from '../components/PageHeroHeader';


const LeavesPage = () => {
    const { user } = useAuth();
    // Use dashboard employmentStatus as source of truth (updated when admin changes status)
    // Fallback to AuthContext user.employmentStatus if dashboard hasn't loaded yet
    const [dashboardEmploymentStatus, setDashboardEmploymentStatus] = useState(null);
    const [myRequests, setMyRequests] = useState([]);
    const [leaveBalances, setLeaveBalances] = useState({ paid: 0, sick: 0, casual: 0 });
    
    // Calculate effective employment status and permanent status
    const effectiveEmploymentStatus = dashboardEmploymentStatus || user?.employmentStatus;
    const employeeType = normalizeEmploymentType(effectiveEmploymentStatus);
    // Show KPI cards if: 1) Permanent employee OR 2) Leave balances exist (only permanent employees get balances)
    // Use useMemo to recalculate when leaveBalances or employeeType changes
    const isPermanentEmployee = useMemo(() => {
        const hasLeaveBalances = (leaveBalances.paid > 0 || leaveBalances.sick > 0 || leaveBalances.casual > 0);
        return employeeType === 'PERMANENT' || hasLeaveBalances;
    }, [employeeType, leaveBalances.paid, leaveBalances.sick, leaveBalances.casual]);
    const [holidays, setHolidays] = useState([]);
    // Split loading: spinner only on initial load; background refresh does not block UI
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    
    // Pagination state
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    
    // Modal state for leave details
    const [viewDialog, setViewDialog] = useState({ open: false, request: null });
    const [correctionRequest, setCorrectionRequest] = useState(null);
    
    // Carryforward state
    const [carryforwardStatus, setCarryforwardStatus] = useState(null);
    const [carryforwardModalOpen, setCarryforwardModalOpen] = useState(false);
    const [carryforwardDecision, setCarryforwardDecision] = useState('Carry Forward');
    const [carryforwardAmounts, setCarryforwardAmounts] = useState({ sick: 0, casual: 0, paid: 0 });
    const [processingCarryforward, setProcessingCarryforward] = useState(false);
    
    // Year-end actions state
    const [yearEndModalOpen, setYearEndModalOpen] = useState(false);
    const [yearEndMenuAnchor, setYearEndMenuAnchor] = useState(null);
    const [yearEndSelections, setYearEndSelections] = useState({}); // { leaveType: { subType, days } }
    const [processingYearEnd, setProcessingYearEnd] = useState(false);
    const [yearEndFeatureEnabled, setYearEndFeatureEnabled] = useState(false);

    // Map UI leave types to balances (fallback to 0)
    const getYearEndBalanceForType = useCallback((leaveType) => {
        const key = leaveType?.toLowerCase();
        if (key === 'sick') return leaveBalances.sick ?? 0;
        if (key === 'casual') return leaveBalances.casual ?? 0;
        if (key === 'planned') return leaveBalances.paid ?? 0;
        return 0;
    }, [leaveBalances]);

    // Summary of remaining balances for quick scanning in the year-end modal (uses live balances)
    const yearEndBalanceSummary = useMemo(() => {
        return {
            Sick: getYearEndBalanceForType('Sick'),
            Casual: getYearEndBalanceForType('Casual'),
            Planned: getYearEndBalanceForType('Planned'),
        };
    }, [getYearEndBalanceForType]);
    

    const fetchPageDataRef = useRef(null);
    const lastRefetchTimeRef = useRef(0);
    const pendingFetchRef = useRef(null);

    // Apply dashboard response to state (shared by cache and network path)
    const applyDashboardData = useCallback((data) => {
        if (!data) return;
        const { requests, leaveBalances: bal, holidays: hol, carryforwardStatus: cf, yearEndFeatureEnabled: ye, employmentStatus: empStatus } = data;
        if (requests && requests.requests) {
            setMyRequests(Array.isArray(requests.requests) ? requests.requests : []);
            setTotalCount(requests.totalCount || 0);
        } else {
            setMyRequests(Array.isArray(requests) ? requests : []);
        }
        setLeaveBalances(bal || { paid: 0, sick: 0, casual: 0 });
        setHolidays(Array.isArray(hol) ? hol : []);
        setCarryforwardStatus(cf || { hasPendingDecision: false });
        setYearEndFeatureEnabled(ye || false);
        // Update employmentStatus from dashboard (source of truth, updates immediately when admin changes status)
        if (empStatus) {
            setDashboardEmploymentStatus(empStatus);
        }
    }, []);

    // Single aggregate endpoint; uses leaves cache and deduplication. forceRefresh skips cache (e.g. after mutation or socket leave event).
    const fetchPageData = useCallback(async (forceRefresh = false) => {
        const userId = user?.id || user?._id;
        const cacheKey = getEmployeeLeavesCacheKey(userId, page + 1, rowsPerPage);
        const now = Date.now();

        // Deduplication: reuse in-flight request for same key
        if (pendingFetchRef.current && pendingFetchRef.current.key === cacheKey && !forceRefresh) {
            return pendingFetchRef.current.promise;
        }

        const cached = !forceRefresh ? getLeavesCache(cacheKey) : null;
        const cacheFresh = cached && (now - cached.timestamp < cached.ttlMs);

        if (cacheFresh) {
            // Use cache immediately; no loading. Optionally revalidate in background if stale-while-revalidate desired (here we skip to avoid extra calls)
            applyDashboardData(cached.data);
            setIsInitialLoading(false);
            setIsBackgroundRefreshing(false);
            return;
        }

        if (cached && cached.data) {
            // Stale cache: show cached data and refresh in background (no spinner)
            applyDashboardData(cached.data);
            setIsInitialLoading(false);
            setIsBackgroundRefreshing(true);
        } else {
            // No cache or forceRefresh: show spinner until first load
            setIsInitialLoading(true);
            setIsBackgroundRefreshing(false);
        }

        const promise = (async () => {
            try {
                const dashboardRes = await api.get(`/leaves/dashboard?page=${page + 1}&limit=${rowsPerPage}`);
                const data = dashboardRes.data;
                applyDashboardData(data);
                setLeavesCache(cacheKey, data);
                lastRefetchTimeRef.current = Date.now();
                setError('');
            } catch (err) {
                setError('Failed to load leave management data.');
                console.error('Leaves dashboard fetch error:', err);
            } finally {
                setIsInitialLoading(false);
                setIsBackgroundRefreshing(false);
                if (pendingFetchRef.current?.key === cacheKey) pendingFetchRef.current = null;
            }
        })();

        pendingFetchRef.current = { key: cacheKey, promise };
        return promise;
    }, [page, rowsPerPage, user?.id, user?._id, applyDashboardData]);

    // Keep ref updated with latest fetchPageData
    fetchPageDataRef.current = fetchPageData;
    
    // Get existing Year-End requests for current year
    const getExistingYearEndRequest = useCallback((leaveType) => {
        const currentYear = new Date().getFullYear();
        return myRequests.find(req => 
            req.requestType === 'YEAR_END' && 
            req.yearEndLeaveType === leaveType && 
            req.yearEndYear === currentYear &&
            (req.status === 'Pending' || req.status === 'Approved')
        );
    }, [myRequests]);

    useEffect(() => { fetchPageData(); }, [fetchPageData]);

    // Socket: only leave-related events. Do NOT refetch on attendance_log_updated (clock-in/out, breaks) to avoid continuous reload.
    useEffect(() => {
        if (!socket) return;

        const handleLeaveUpdate = () => {
            invalidateLeavesCache('leaves:');
            if (fetchPageDataRef.current) fetchPageDataRef.current(true);
        };

        // Listen for employment status updates to refresh dashboard (includes updated employmentStatus)
        const handleEmploymentStatusUpdate = (data) => {
            const userId = user?.id || user?._id;
            if (data.userId === userId) {
                // Refresh dashboard to get updated employmentStatus and leave balances
                invalidateLeavesCache('leaves:');
                if (fetchPageDataRef.current) fetchPageDataRef.current(true);
            }
        };

        socket.on('leave_request_updated', handleLeaveUpdate);
        socket.on('employment_status_updated', handleEmploymentStatusUpdate);

        return () => {
            socket.off('leave_request_updated', handleLeaveUpdate);
            socket.off('employment_status_updated', handleEmploymentStatusUpdate);
        };
    }, [user?.id, user?._id]);

    // Visibility: refetch only if cache is stale or cooldown (60s) has passed to avoid refetch on every tab switch.
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) return;
            const now = Date.now();
            const last = lastRefetchTimeRef.current;
            const cooldownPassed = now - last >= LEAVES_REFETCH_COOLDOWN_MS;
            if (!cooldownPassed && last > 0) return;
            if (fetchPageDataRef.current) fetchPageDataRef.current(false);
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    const handleOpenModal = () => {
        setCorrectionRequest(null);
        setIsModalOpen(true);
    };
    const handleCloseModal = () => {
        setIsModalOpen(false);
        setCorrectionRequest(null);
    };

    const handleRequestSubmitted = useCallback((newRequest) => {
        const wasCorrection = correctionRequest?._id;
        handleCloseModal();
        setSnackbar({
            open: true,
            message: wasCorrection
                ? 'Leave updated and resubmitted for HR approval.'
                : 'Your request has been submitted successfully!',
        });
        invalidateLeavesCache('leaves:');
        fetchPageData(true);
    }, [fetchPageData, correctionRequest]);
    
    const handlePageChange = (event, newPage) => {
        setPage(newPage);
    };
    
    const handleRowsPerPageChange = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };
    
    const handleViewDetails = (request) => {
        setViewDialog({ open: true, request });
    };
    
    const handleOpenCarryforwardModal = async () => {
        try {
            const res = await api.get('/leaves/previous-year-balances');
            if (res.data.hasRemainingLeaves && !res.data.decisionMade) {
                setCarryforwardStatus(res.data);
                setCarryforwardAmounts({
                    sick: res.data.previousYearBalances.sick || 0,
                    casual: res.data.previousYearBalances.casual || 0,
                    paid: res.data.previousYearBalances.paid || 0
                });
                setCarryforwardModalOpen(true);
            } else if (res.data.decisionMade) {
                setSnackbar({ open: true, message: `You have already chosen ${res.data.decision} for previous year leaves.`, severity: 'info' });
            } else {
                setSnackbar({ open: true, message: 'No remaining leaves from previous year.', severity: 'info' });
            }
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to load previous year balances.', severity: 'error' });
        }
    };
    
    const handleCloseCarryforwardModal = () => {
        setCarryforwardModalOpen(false);
        setCarryforwardDecision('Carry Forward');
        setCarryforwardAmounts({ sick: 0, casual: 0, paid: 0 });
    };
    
    const handleSubmitCarryforwardDecision = async () => {
        setProcessingCarryforward(true);
        try {
            const payload = {
                decision: carryforwardDecision
            };
            
            if (carryforwardDecision === 'Carry Forward') {
                payload.carryforwardAmounts = carryforwardAmounts;
            }
            
            await api.post('/leaves/carryforward-decision', payload);
            setSnackbar({ open: true, message: 'Decision submitted successfully!', severity: 'success' });
            handleCloseCarryforwardModal();
            invalidateLeavesCache('leaves:');
            fetchPageData(true);
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to submit decision.', severity: 'error' });
        } finally {
            setProcessingCarryforward(false);
        }
    };
    
    const handleYearEndSelection = (leaveType, subType) => {
        setYearEndSelections(prev => ({
            ...prev,
            [leaveType]: {
                ...prev[leaveType],
                subType
            }
        }));
    };
    
    const handleSubmitYearEndRequests = async () => {
        // Check if feature is enabled
        if (!yearEndFeatureEnabled) {
            setSnackbar({ open: true, message: 'Year-End Leave actions are currently disabled by Admin.', severity: 'warning' });
            return;
        }

        // CRITICAL: Check for existing requests before submission
        const currentYear = new Date().getFullYear();
        const existingRequests = [];
        
        Object.keys(yearEndSelections).forEach(leaveType => {
            const existing = getExistingYearEndRequest(leaveType);
            if (existing && (existing.status === 'Pending' || existing.status === 'Approved')) {
                existingRequests.push({ leaveType, status: existing.status });
            }
        });

        if (existingRequests.length > 0) {
            const leaveTypes = existingRequests.map(r => r.leaveType).join(', ');
            setSnackbar({ 
                open: true, 
                message: `Cannot submit: Year-End request already exists for ${leaveTypes} leave type(s).`, 
                severity: 'error' 
            });
            return;
        }

        // Validate selections
        const selections = Object.entries(yearEndSelections).filter(([leaveType, selection]) => {
            const existing = getExistingYearEndRequest(leaveType);
            return !existing && selection && selection.subType && getYearEndBalanceForType(leaveType) > 0;
        });

        if (selections.length === 0) {
            setSnackbar({ open: true, message: 'Please select at least one Year-End action.', severity: 'warning' });
            return;
        }

        setProcessingYearEnd(true);
        try {
            // Submit each Year-End request
            const promises = selections.map(([leaveType, selection]) => {
                const days = getYearEndBalanceForType(leaveType);
                return api.post('/leaves/year-end-request', {
                    leaveType,
                    subType: selection.subType,
                    days
                });
            });

            await Promise.all(promises);
            setSnackbar({ open: true, message: 'Your Year-End leave request(s) have been submitted successfully!', severity: 'success' });
            setYearEndModalOpen(false);
            setYearEndSelections({});
            invalidateLeavesCache('leaves:');
            fetchPageData(true);
        } catch (err) {
            // Handle 409 conflict (duplicate request)
            if (err.response?.status === 409) {
                setSnackbar({ 
                    open: true, 
                    message: err.response?.data?.error || 'Year-End request already exists for this leave type.', 
                    severity: 'warning' 
                });
                invalidateLeavesCache('leaves:');
                fetchPageData(true);
            } else {
                setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to submit Year-End request(s).', severity: 'error' });
            }
        } finally {
            setProcessingYearEnd(false);
        }
    };

    const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('en-CA') : 'N/A';

    const formatPrettyDate = (dateString, isTentative = false) => {
        if (!dateString || isTentative) {
            return 'Tentative (Date not decided)';
        }
        const d = new Date(dateString);
        if (isNaN(d.getTime())) {
            return 'Tentative (Date not decided)';
        }
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    };

    const statusStyles = {
        Approved: 'status-chip-approved',
        Rejected: 'status-chip-rejected',
        Pending: 'status-chip-pending',
        Returned: 'status-chip-pending',
    };

    const handleCorrectLeave = (request) => {
        setCorrectionRequest(request);
        setIsModalOpen(true);
    };



    if (isInitialLoading) {
        return <LeavesPageSkeleton />;
    }

    return (
        <div className="leaves-page-redesigned employee-leaves-page">
            {error && <Alert severity="error" sx={{ width: '100%', mb: 2 }}>{error}</Alert>}

            {/* Page Hero Header */}
            <PageHeroHeader
                eyebrow="Employee Portal"
                title="Leave Management"
                description="Manage your leave requests and view your leave balance"
                icon={<Calendar size={32} />}
                actionArea={
                    <Button 
                        variant="contained" 
                        startIcon={<Plus size={18} />}
                        onClick={handleOpenModal}
                        sx={{
                            backgroundColor: '#FF4757',
                            color: 'white',
                            fontWeight: 600,
                            padding: '10px 24px',
                            borderRadius: '8px',
                            textTransform: 'none',
                            boxShadow: '0 4px 12px rgba(255, 71, 87, 0.3)',
                            '&:hover': {
                                backgroundColor: '#EE5A6F',
                                transform: 'translateY(-2px)',
                                boxShadow: '0 6px 20px rgba(255, 71, 87, 0.4)',
                            },
                            transition: 'all 0.3s ease'
                        }}
                    >
                        Apply Leave
                    </Button>
                }
            />

            {/* KPI Cards Section - Only show for Permanent employees */}
            {isPermanentEmployee && (
                <Box className="leave-kpi-cards">
                    <Paper className="leave-kpi-card sick-leave">
                        <Box className="kpi-icon-wrapper">
                            <Heart className="kpi-icon" size={22} />
                        </Box>
                        <Box className="kpi-content">
                            <Typography className="kpi-value">{leaveBalances.sick || 0}</Typography>
                            <Typography className="kpi-label">Sick Leave</Typography>
                        </Box>
                    </Paper>
                    <Paper className="leave-kpi-card casual-leave">
                        <Box className="kpi-icon-wrapper">
                            <Umbrella className="kpi-icon" size={22} />
                        </Box>
                        <Box className="kpi-content">
                            <Typography className="kpi-value">{leaveBalances.casual || 0}</Typography>
                            <Typography className="kpi-label">Casual Leave</Typography>
                        </Box>
                    </Paper>
                    <Paper className="leave-kpi-card planned-leave">
                        <Box className="kpi-icon-wrapper">
                            <Calendar className="kpi-icon" size={22} />
                        </Box>
                        <Box className="kpi-content">
                            <Typography className="kpi-value">{leaveBalances.paid || 0}</Typography>
                            <Typography className="kpi-label">Planned Leave</Typography>
                        </Box>
                    </Paper>
                </Box>
            )}

            {/* Year-End Menu */}
            <Menu
                anchorEl={yearEndMenuAnchor}
                open={Boolean(yearEndMenuAnchor)}
                onClose={() => setYearEndMenuAnchor(null)}
            >
                <MenuItem 
                    onClick={() => {
                        setYearEndMenuAnchor(null);
                        setYearEndModalOpen(true);
                    }}
                    disabled={!yearEndFeatureEnabled}
                >
                    <ListItemIcon>
                        <ForwardIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText 
                        primary="Year-End Leave Options"
                        secondary={!yearEndFeatureEnabled ? "Currently disabled by Admin" : ""}
                    />
                </MenuItem>
            </Menu>

            {/* Carryforward/Encashment Section */}
            {carryforwardStatus && carryforwardStatus.hasPendingDecision && (
                <Paper 
                    elevation={3}
                    className="carryforward-section"
                    sx={{ 
                        p: 3, 
                        mb: 3, 
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        borderRadius: '12px'
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <ForwardIcon sx={{ fontSize: 32 }} />
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                                    Previous Year Leave Balance Available
                                </Typography>
                                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                    You have remaining leaves from {carryforwardStatus.year || new Date().getFullYear() - 1}. 
                                    Choose to carry forward or encash them.
                                </Typography>
                                {carryforwardStatus.previousYearBalances && (
                                    <Box sx={{ mt: 1.5, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                        {carryforwardStatus.previousYearBalances.sick > 0 && (
                                            <Chip 
                                                label={`Sick: ${carryforwardStatus.previousYearBalances.sick} days`} 
                                                sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
                                            />
                                        )}
                                        {carryforwardStatus.previousYearBalances.casual > 0 && (
                                            <Chip 
                                                label={`Casual: ${carryforwardStatus.previousYearBalances.casual} days`} 
                                                sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
                                            />
                                        )}
                                        {carryforwardStatus.previousYearBalances.paid > 0 && (
                                            <Chip 
                                                label={`Planned: ${carryforwardStatus.previousYearBalances.paid} days`} 
                                                sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
                                            />
                                        )}
                                    </Box>
                                )}
                            </Box>
                        </Box>
                        <Button
                            variant="contained"
                            onClick={handleOpenCarryforwardModal}
                            startIcon={<ForwardIcon />}
                            sx={{
                                bgcolor: 'white',
                                color: '#667eea',
                                '&:hover': {
                                    bgcolor: 'rgba(255,255,255,0.9)',
                                },
                                fontWeight: 600,
                                px: 3,
                                py: 1.5
                            }}
                        >
                            Choose Option
                        </Button>
                    </Box>
                </Paper>
            )}

            {/* Main Content Grid - 3 Columns */}
            <Box className="content-grid">
                {/* Application Requests Column */}
                <Paper className="content-card">
                    <Typography className="content-card-title">Application Requests</Typography>
                    {myRequests.length === 0 ? (
                        <Box className="empty-state">
                            <FileText className="empty-state-icon" size={48} />
                            <Typography variant="h6" className="empty-state-title">No Leave Requests</Typography>
                            <Typography variant="body2" className="empty-state-subtitle">
                                You haven't submitted any leave requests yet. Click "Apply Leave" to get started.
                            </Typography>
                            <Button
                                className="apply-leave-link"
                                onClick={handleOpenModal}
                                startIcon={<Plus size={14} />}
                            >
                                Apply Leave
                            </Button>
                        </Box>
                    ) : (
                        <Box className="scrollable-content">
                            {/* Render actual requests here - keeping the existing table logic */}
                            <TableContainer className="table-container">
                                <Table stickyHeader aria-label="leave requests table">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>S.No</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell>Request Type</TableCell>
                                            <TableCell>Leave Type</TableCell>
                                            <TableCell>Date(s)</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {myRequests.map((row, index) => (
                                            <TableRow
                                                key={row._id}
                                                hover
                                                onClick={() => handleViewDetails(row)}
                                                className="table-row-clickable"
                                            >
                                                <TableCell>{page * rowsPerPage + index + 1}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={row.status === 'Returned' ? 'Needs correction' : row.status}
                                                        className={`status-chip ${statusStyles[row.status] || ''}`}
                                                        onClick={(e) => {
                                                            if (row.status === 'Returned') {
                                                                e.stopPropagation();
                                                                handleCorrectLeave(row);
                                                            }
                                                        }}
                                                        sx={row.status === 'Returned' ? { cursor: 'pointer' } : undefined}
                                                    />
                                                    {row.status === 'Returned' && row.hrCorrectionNotes && (
                                                        <Typography variant="caption" display="block" color="warning.main" sx={{ mt: 0.5, maxWidth: 220 }}>
                                                            HR: {row.hrCorrectionNotes}
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell>{formatLeaveRequestType(row.requestType)}</TableCell>
                                                <TableCell>{row.leaveType}</TableCell>
                                                <TableCell>
                                                    {row.requestType === 'Compensatory' && row.alternateDate ? (
                                                        <Box>
                                                            <Typography variant="body2" component="div"><strong>Leave:</strong> {formatDate(row.leaveDates[0])}</Typography>
                                                            <Typography variant="caption" color="textSecondary"><strong>Work:</strong> {formatDate(row.alternateDate)}</Typography>
                                                        </Box>
                                                    ) : (
                                                        row.leaveDates.map(formatDate).join(', ')
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                    )}
                </Paper>

                {/* Company Holidays Column */}
                <Paper className="content-card">
                    <Typography className="content-card-title">Company Holidays</Typography>
                    <Box className="scrollable-content content-card-list-scroll">
                        <ul className="vector-list">
                            {holidays.length === 0 ? (
                                <li className="vector-item" style={{ justifyContent: 'center', color: '#6c757d' }}>
                                    <Typography variant="body2">No holidays configured</Typography>
                                </li>
                            ) : (
                                holidays.map((h) => (
                                    <li key={h._id || h.name} className="vector-item">
                                        <div className="vector-icon">
                                            <Calendar size={20} />
                                        </div>
                                        <div className="vector-text">
                                            <Typography className="vector-title">{h.name}</Typography>
                                            <Typography className="vector-subtitle">
                                                {h.isTentative || !h.date
                                                    ? (h.day || 'Tentative')
                                                    : new Date(h.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                            </Typography>
                                        </div>
                                    </li>
                                ))
                            )}
                        </ul>
                    </Box>
                </Paper>

                {/* Saturday Schedule Column */}
                <Paper className="content-card">
                    <Typography className="content-card-title">Saturday Schedule</Typography>
                    <Box className="scrollable-content content-card-list-scroll">
                        <SaturdaySchedule 
                            policy={user?.alternateSaturdayPolicy || 'All Saturdays Working'} 
                            requests={myRequests} 
                            count={4}
                            variant="vector-list"
                        />
                    </Box>
                </Paper>
            </Box>

            {/* Keep form mounted; visibility controlled by open state */}
            <LeaveRequestForm
                open={isModalOpen}
                onClose={handleCloseModal}
                onSubmissionSuccess={handleRequestSubmitted}
                holidays={holidays}
                correctionRequest={correctionRequest}
            />

            <EmployeeLeaveDetailsModal
                open={viewDialog.open}
                request={viewDialog.request}
                onClose={() => setViewDialog({ open: false, request: null })}
                onEditResubmit={(req) => {
                    setViewDialog({ open: false, request: null });
                    handleCorrectLeave(req);
                }}
            />


            {/* Carryforward/Encashment Modal */}
            <Dialog 
                open={carryforwardModalOpen} 
                onClose={handleCloseCarryforwardModal}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        borderRadius: '20px',
                        overflow: 'hidden',
                        boxShadow: '0 12px 48px rgba(0, 0, 0, 0.15)',
                    }
                }}
            >
                <DialogTitle sx={{
                    background: '#ffffff',
                    color: '#2c3e50',
                    pb: 2,
                    borderBottom: '3px solid #ff4757'
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <ForwardIcon />
                        <Typography variant="h5" sx={{ fontWeight: 600 }}>
                            Leave Carryforward / Encashment
                        </Typography>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    {carryforwardStatus && carryforwardStatus.previousYearBalances && (
                        <>
                            <Alert severity="info" sx={{ mb: 3 }}>
                                You have remaining leaves from {carryforwardStatus.year || new Date().getFullYear() - 1}. 
                                Choose whether to carry them forward to the current year or encash them.
                            </Alert>
                            
                            <Paper elevation={0} sx={{ p: 2, mb: 3, bgcolor: '#f5f5f5', borderRadius: 2 }}>
                                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                                    Previous Year Remaining Balances:
                                </Typography>
                                <Grid container spacing={2}>
                                    {carryforwardStatus.previousYearBalances.sick > 0 && (
                                        <Grid item xs={12} sm={4}>
                                            <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: 'white', borderRadius: 1 }}>
                                                <Sick sx={{ color: '#d32f2f', mb: 0.5 }} />
                                                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                                    {carryforwardStatus.previousYearBalances.sick}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Sick Leave
                                                </Typography>
                                            </Box>
                                        </Grid>
                                    )}
                                    {carryforwardStatus.previousYearBalances.casual > 0 && (
                                        <Grid item xs={12} sm={4}>
                                            <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: 'white', borderRadius: 1 }}>
                                                <WorkOutline sx={{ color: '#1976d2', mb: 0.5 }} />
                                                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                                    {carryforwardStatus.previousYearBalances.casual}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Casual Leave
                                                </Typography>
                                            </Box>
                                        </Grid>
                                    )}
                                    {carryforwardStatus.previousYearBalances.paid > 0 && (
                                        <Grid item xs={12} sm={4}>
                                            <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: 'white', borderRadius: 1 }}>
                                                <BeachAccess sx={{ color: '#2e7d32', mb: 0.5 }} />
                                                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                                    {carryforwardStatus.previousYearBalances.paid}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Planned Leave
                                                </Typography>
                                            </Box>
                                        </Grid>
                                    )}
                                </Grid>
                            </Paper>

                            <FormControl component="fieldset" sx={{ mb: 3, width: '100%' }}>
                                <FormLabel component="legend" sx={{ mb: 2, fontWeight: 600 }}>
                                    Choose Your Option:
                                </FormLabel>
                                <RadioGroup
                                    value={carryforwardDecision}
                                    onChange={(e) => setCarryforwardDecision(e.target.value)}
                                >
                                    <FormControlLabel 
                                        value="Carry Forward" 
                                        control={<Radio />} 
                                        label={
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <ForwardIcon sx={{ color: '#1976d2' }} />
                                                <Box>
                                                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                                        Carry Forward
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        Add remaining leaves to your current year balance (type-specific)
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        }
                                        sx={{ mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 2 }}
                                    />
                                    <FormControlLabel 
                                        value="Encashment" 
                                        control={<Radio />} 
                                        label={
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <AttachMoney sx={{ color: '#2e7d32' }} />
                                                <Box>
                                                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                                        Encashment
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        Cash out all remaining leaves
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        }
                                        sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 2 }}
                                    />
                                </RadioGroup>
                            </FormControl>

                            {carryforwardDecision === 'Carry Forward' && (
                                <Paper elevation={0} sx={{ p: 2, bgcolor: '#e3f2fd', borderRadius: 2, mb: 2 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                                        Select Amount to Carry Forward (Leave type-specific):
                                    </Typography>
                                    <Grid container spacing={2}>
                                        {carryforwardStatus.previousYearBalances.sick > 0 && (
                                            <Grid item xs={12} sm={4}>
                                                <TextField
                                                    label="Sick Leave"
                                                    type="number"
                                                    fullWidth
                                                    size="small"
                                                    value={carryforwardAmounts.sick}
                                                    onChange={(e) => {
                                                        const val = Math.max(0, Math.min(
                                                            parseFloat(e.target.value) || 0,
                                                            carryforwardStatus.previousYearBalances.sick
                                                        ));
                                                        setCarryforwardAmounts(prev => ({ ...prev, sick: val }));
                                                    }}
                                                    inputProps={{ 
                                                        min: 0, 
                                                        max: carryforwardStatus.previousYearBalances.sick,
                                                        step: 0.5
                                                    }}
                                                    helperText={`Max: ${carryforwardStatus.previousYearBalances.sick} days`}
                                                />
                                            </Grid>
                                        )}
                                        {carryforwardStatus.previousYearBalances.casual > 0 && (
                                            <Grid item xs={12} sm={4}>
                                                <TextField
                                                    label="Casual Leave"
                                                    type="number"
                                                    fullWidth
                                                    size="small"
                                                    value={carryforwardAmounts.casual}
                                                    onChange={(e) => {
                                                        const val = Math.max(0, Math.min(
                                                            parseFloat(e.target.value) || 0,
                                                            carryforwardStatus.previousYearBalances.casual
                                                        ));
                                                        setCarryforwardAmounts(prev => ({ ...prev, casual: val }));
                                                    }}
                                                    inputProps={{ 
                                                        min: 0, 
                                                        max: carryforwardStatus.previousYearBalances.casual,
                                                        step: 0.5
                                                    }}
                                                    helperText={`Max: ${carryforwardStatus.previousYearBalances.casual} days`}
                                                />
                                            </Grid>
                                        )}
                                        {carryforwardStatus.previousYearBalances.paid > 0 && (
                                            <Grid item xs={12} sm={4}>
                                                <TextField
                                                    label="Planned Leave"
                                                    type="number"
                                                    fullWidth
                                                    size="small"
                                                    value={carryforwardAmounts.paid}
                                                    onChange={(e) => {
                                                        const val = Math.max(0, Math.min(
                                                            parseFloat(e.target.value) || 0,
                                                            carryforwardStatus.previousYearBalances.paid
                                                        ));
                                                        setCarryforwardAmounts(prev => ({ ...prev, paid: val }));
                                                    }}
                                                    inputProps={{ 
                                                        min: 0, 
                                                        max: carryforwardStatus.previousYearBalances.paid,
                                                        step: 0.5
                                                    }}
                                                    helperText={`Max: ${carryforwardStatus.previousYearBalances.paid} days`}
                                                />
                                            </Grid>
                                        )}
                                    </Grid>
                                    <Alert severity="info" sx={{ mt: 2 }}>
                                        Remaining leaves will be automatically encashed. Each leave type is carried forward separately.
                                    </Alert>
                                </Paper>
                            )}
                        </>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 3, pt: 2 }}>
                    <Button onClick={handleCloseCarryforwardModal} disabled={processingCarryforward}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmitCarryforwardDecision}
                        variant="contained"
                        disabled={processingCarryforward}
                        startIcon={processingCarryforward ? <SkeletonBox width="16px" height="16px" borderRadius="50%" /> : <CheckCircle />}
                        sx={{
                            bgcolor: '#667eea',
                            '&:hover': { bgcolor: '#5568d3' }
                        }}
                    >
                        {processingCarryforward ? 'Processing...' : 'Submit Decision'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Year-End Leave Options Modal */}
            <Dialog 
                open={yearEndModalOpen} 
                onClose={() => {
                    setYearEndModalOpen(false);
                    setYearEndSelections({});
                }}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        borderRadius: '24px',
                        overflow: 'hidden',
                        boxShadow: '0 20px 60px rgba(255, 71, 87, 0.25)',
                        border: '1px solid rgba(255, 71, 87, 0.1)',
                    }
                }}
            >
                <DialogTitle sx={{
                    background: '#ffffff',
                    color: '#2c3e50',
                    pb: 3,
                    pt: 3,
                    px: 3,
                    borderBottom: '3px solid #ff4757'
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{
                            bgcolor: '#fff5f5',
                            borderRadius: '12px',
                            p: 1.5,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid rgba(255, 71, 87, 0.2)'
                        }}>
                            <ForwardIcon sx={{ fontSize: 28, color: '#ff4757' }} />
                        </Box>
                        <Box>
                            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                                Year-End Leave Options
                            </Typography>
                            <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.875rem' }}>
                                Manage your remaining leave balance
                            </Typography>
                        </Box>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ pt: 3, px: 3, bgcolor: '#fafafa' }}>
                    {!yearEndFeatureEnabled ? (
                        <Alert 
                            severity="warning" 
                            sx={{ 
                                borderRadius: '12px',
                                bgcolor: '#fff3e0',
                                border: '2px solid #ff9800'
                            }}
                        >
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                Year-End Leave Actions Unavailable
                            </Typography>
                            <Typography variant="body2">
                                {!isPermanentEmployee 
                                    ? 'Year-End Leave requests are only available for permanent employees.'
                                    : 'Year-End Leave actions are currently disabled by Admin.'}
                            </Typography>
                        </Alert>
                    ) : (
                        <>
                            <Alert 
                                severity="info" 
                                sx={{ 
                                    mb: 3,
                                    borderRadius: '12px',
                                    bgcolor: '#e3f2fd',
                                    border: '2px solid #2196f3',
                                    '& .MuiAlert-icon': {
                                        color: '#1976d2'
                                    }
                                }}
                            >
                                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                    Remaining Leave Balance
                                </Typography>
                                <Typography variant="body2">
                                    Choose whether to carry forward or encash your remaining leaves. Each leave type must be handled separately.
                                </Typography>
                            </Alert>

                            {/* Quick glance balances for all leave types */}
                            <Paper 
                                elevation={0}
                                sx={{ 
                                    mb: 3,
                                    p: 2,
                                    borderRadius: '12px',
                                    border: '1px solid #e0e0e0',
                                    bgcolor: '#ffffff'
                                }}
                            >
                                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                                    Current Leave Balances:
                                </Typography>
                                <Grid container spacing={2}>
                                    {['Sick', 'Casual', 'Planned'].map(type => {
                                        const balance = yearEndBalanceSummary[type] ?? 0;
                                        return (
                                            <Grid item xs={12} sm={4} key={type}>
                                                <Box 
                                                    sx={{ 
                                                        display: 'flex', 
                                                        flexDirection: 'column', 
                                                        gap: 0.5,
                                                        alignItems: 'flex-start'
                                                    }}
                                                >
                                                    <Typography variant="caption" sx={{ color: '#666', fontWeight: 600 }}>
                                                        {type} Leave
                                                    </Typography>
                                                    <Chip 
                                                        label={`${balance} days`}
                                                        sx={{ 
                                                            fontWeight: 800, 
                                                            fontSize: '0.95rem',
                                                            bgcolor: balance > 0 ? '#e8f5e9' : '#f5f5f5',
                                                            color: balance > 0 ? '#2e7d32' : '#666'
                                                        }}
                                                    />
                                                </Box>
                                            </Grid>
                                        );
                                    })}
                                </Grid>
                            </Paper>
                            
                            {/* Year-End options for each leave type with remaining balance */}
                            {['Sick', 'Casual', 'Planned'].map(leaveType => {
                                const balance = getYearEndBalanceForType(leaveType);
                                const selection = yearEndSelections[leaveType];
                                
                                // Check if there's already a Year-End request for this leave type and year
                                const existingRequest = getExistingYearEndRequest(leaveType);
                                
                                if (balance <= 0 && !existingRequest) return null;
                                
                                return (
                                    <Paper 
                                        key={leaveType}
                                        elevation={0} 
                                        sx={{ 
                                            p: 3, 
                                            mb: 2.5, 
                                            bgcolor: 'white', 
                                            borderRadius: '16px',
                                            border: '2px solid #f5f5f5',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                borderColor: '#d32f2f',
                                                boxShadow: '0 4px 12px rgba(255, 71, 87, 0.1)'
                                            }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
                                            <Box>
                                                <Typography variant="h6" sx={{ fontWeight: 700, color: '#d32f2f', mb: 0.5 }}>
                                                    {leaveType} Leave
                                                </Typography>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography variant="body2" sx={{ color: '#666', fontWeight: 500 }}>
                                                        {balance} days remaining
                                                    </Typography>
                                                    <Chip 
                                                        label={`${balance} days`}
                                                        size="small"
                                                        sx={{
                                                            bgcolor: '#ffebee',
                                                            color: '#d32f2f',
                                                            fontWeight: 600,
                                                            height: '24px',
                                                            fontSize: '0.75rem'
                                                        }}
                                                    />
                                                </Box>
                                            </Box>
                                            {existingRequest && (
                                                <Chip 
                                                    label={existingRequest.status} 
                                                    color={existingRequest.status === 'Approved' ? 'success' : existingRequest.status === 'Rejected' ? 'error' : 'warning'}
                                                    size="small"
                                                    sx={{ fontWeight: 600 }}
                                                />
                                            )}
                                        </Box>
                                        
                                        {existingRequest ? (
                                            <Box>
                                                <Alert 
                                                    severity={existingRequest.status === 'Approved' ? 'success' : existingRequest.status === 'Rejected' ? 'error' : 'warning'}
                                                    sx={{ 
                                                        mt: 2,
                                                        borderRadius: '12px'
                                                    }}
                                                >
                                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                                                        <Box sx={{ flex: 1 }}>
                                                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                                                You have already submitted a Year-End request for this leave type.
                                                            </Typography>
                                                            {existingRequest.status === 'Pending' && (
                                                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                                                    Pending {existingRequest.yearEndSubType === 'CARRY_FORWARD' ? 'carry forward' : 'encashment'} request for {existingRequest.yearEndDays} day(s) in {existingRequest.yearEndYear || new Date().getFullYear()}. Waiting for admin approval.
                                                                </Typography>
                                                            )}
                                                            {existingRequest.status === 'Approved' && (
                                                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                                                    Your {existingRequest.yearEndSubType === 'CARRY_FORWARD' ? 'carry forward' : 'encashment'} request for {existingRequest.yearEndDays} day(s) in {existingRequest.yearEndYear || new Date().getFullYear()} has been <strong>approved</strong>.
                                                                </Typography>
                                                            )}
                                                            {existingRequest.status === 'Rejected' && (
                                                                <>
                                                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                                                        Your {existingRequest.yearEndSubType === 'CARRY_FORWARD' ? 'carry forward' : 'encashment'} request has been <strong>rejected</strong>.
                                                                    </Typography>
                                                                    {existingRequest.rejectionNotes && (
                                                                        <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
                                                                            Reason: {existingRequest.rejectionNotes}
                                                                        </Typography>
                                                                    )}
                                                                </>
                                                            )}
                                                        </Box>
                                                        <Chip 
                                                            label={existingRequest.status} 
                                                            color={existingRequest.status === 'Approved' ? 'success' : existingRequest.status === 'Rejected' ? 'error' : 'warning'}
                                                            size="small"
                                                            sx={{ fontWeight: 600 }}
                                                        />
                                                    </Box>
                                                </Alert>
                                            </Box>
                                        ) : balance > 0 ? (
                                            <FormControl component="fieldset" sx={{ width: '100%' }}>
                                                <RadioGroup
                                                    value={selection?.subType || ''}
                                                    onChange={(e) => handleYearEndSelection(leaveType, e.target.value)}
                                                    sx={{ gap: 2 }}
                                                >
                                                    <FormControlLabel 
                                                        value="CARRY_FORWARD" 
                                                        disabled={!!existingRequest}
                                                        control={
                                                            <Radio 
                                                                sx={{
                                                                    color: '#d32f2f',
                                                                    '&.Mui-checked': { color: '#d32f2f' },
                                                                    '&:hover': { bgcolor: 'rgba(255, 71, 87, 0.04)' }
                                                                }}
                                                            />
                                                        }
                                                        label={
                                                            <Box sx={{ 
                                                                ml: 1,
                                                                p: 2,
                                                                borderRadius: '12px',
                                                                border: '2px solid',
                                                                borderColor: selection?.subType === 'CARRY_FORWARD' ? '#d32f2f' : '#e0e0e0',
                                                                bgcolor: selection?.subType === 'CARRY_FORWARD' ? '#ffebee' : 'white',
                                                                transition: 'all 0.2s ease',
                                                                cursor: existingRequest ? 'not-allowed' : 'pointer',
                                                                opacity: existingRequest ? 0.6 : 1,
                                                                '&:hover': existingRequest ? {} : { borderColor: '#d32f2f', bgcolor: '#ffebee' }
                                                            }}>
                                                                <Typography variant="body1" sx={{ fontWeight: 700, color: '#d32f2f', mb: 0.5 }}>
                                                                    Carry Forward
                                                                </Typography>
                                                                <Typography variant="caption" sx={{ color: '#666' }}>
                                                                    Add {balance} day(s) to next year's {leaveType} leave balance
                                                                </Typography>
                                                            </Box>
                                                        }
                                                        sx={{ m: 0, '& .MuiFormControlLabel-label': { width: '100%' } }}
                                                    />
                                                    <FormControlLabel 
                                                        value="ENCASH" 
                                                        disabled={!!existingRequest}
                                                        control={
                                                            <Radio 
                                                                sx={{
                                                                    color: '#d32f2f',
                                                                    '&.Mui-checked': { color: '#d32f2f' },
                                                                    '&:hover': { bgcolor: 'rgba(255, 71, 87, 0.04)' }
                                                                }}
                                                            />
                                                        }
                                                        label={
                                                            <Box sx={{ 
                                                                ml: 1,
                                                                p: 2,
                                                                borderRadius: '12px',
                                                                border: '2px solid',
                                                                borderColor: selection?.subType === 'ENCASH' ? '#d32f2f' : '#e0e0e0',
                                                                bgcolor: selection?.subType === 'ENCASH' ? '#ffebee' : 'white',
                                                                transition: 'all 0.2s ease',
                                                                cursor: existingRequest ? 'not-allowed' : 'pointer',
                                                                opacity: existingRequest ? 0.6 : 1,
                                                                '&:hover': existingRequest ? {} : { borderColor: '#d32f2f', bgcolor: '#ffebee' }
                                                            }}>
                                                                <Typography variant="body1" sx={{ fontWeight: 700, color: '#d32f2f', mb: 0.5 }}>
                                                                    Encash
                                                                </Typography>
                                                                <Typography variant="caption" sx={{ color: '#666' }}>
                                                                    Cash out {balance} day(s) of {leaveType} leave
                                                                </Typography>
                                                            </Box>
                                                        }
                                                        sx={{ m: 0, '& .MuiFormControlLabel-label': { width: '100%' } }}
                                                    />
                                                </RadioGroup>
                                            </FormControl>
                                        ) : (
                                            <Alert severity="warning" sx={{ mt: 1, borderRadius: '12px' }}>
                                                No remaining days available for this leave type.
                                            </Alert>
                                        )}
                                    </Paper>
                                );
                            })}
                        </>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 3, pt: 2, bgcolor: 'white', borderTop: '1px solid #f5f5f5' }}>
                    <Button 
                        onClick={() => {
                            setYearEndModalOpen(false);
                            setYearEndSelections({});
                        }}
                        disabled={processingYearEnd}
                        sx={{
                            color: '#666',
                            fontWeight: 600,
                            px: 3,
                            py: 1,
                            '&:hover': { bgcolor: '#f5f5f5' }
                        }}
                    >
                        Cancel
                    </Button>
                    {yearEndFeatureEnabled && Object.keys(yearEndSelections).some(lt => {
                        const existing = getExistingYearEndRequest(lt);
                        const hasSelection = yearEndSelections[lt]?.subType;
                        const hasBalance = getYearEndBalanceForType(lt) > 0;
                        // Only enable submit if no existing request AND has selection AND has balance
                        return !existing && hasSelection && hasBalance;
                    }) && (
                        <Button
                            onClick={handleSubmitYearEndRequests}
                            variant="contained"
                            disabled={processingYearEnd}
                            startIcon={processingYearEnd ? <SkeletonBox width="16px" height="16px" borderRadius="50%" sx={{ bgcolor: 'rgba(255, 255, 255, 0.8)' }} /> : <CheckCircle />}
                            sx={{
                                bgcolor: '#ff4757',
                                color: 'white',
                                fontWeight: 700,
                                px: 4,
                                py: 1,
                                borderRadius: '12px',
                                textTransform: 'none',
                                boxShadow: '0 4px 12px rgba(255, 71, 87, 0.3)',
                                '&:hover': { 
                                    bgcolor: '#ee5a6f',
                                    boxShadow: '0 6px 16px rgba(255, 71, 87, 0.4)',
                                    transform: 'translateY(-1px)'
                                },
                                '&.Mui-disabled': {
                                    bgcolor: 'rgba(255, 71, 87, 0.3)',
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    boxShadow: 'none'
                                },
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {processingYearEnd ? 'Processing...' : 'Submit'}
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

            <Snackbar 
                open={snackbar.open} 
                autoHideDuration={5000} 
                onClose={() => setSnackbar({ open: false, message: '', severity: 'success' })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={() => setSnackbar({ open: false, message: '', severity: 'success' })} severity={snackbar.severity || 'success'} sx={{ width: '100%' }} variant="filled">
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </div>
    );
};

export default LeavesPage;