// src/pages/AdminLeavesPage.jsx
import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Typography, Button, Alert, Chip, Box, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Paper, Grid, Divider, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, IconButton, Stack, TablePagination, Menu, MenuItem, ListItemIcon, ListItemText, Tabs, Tab, Switch, FormControlLabel, Skeleton, Card, CardContent, InputLabel, Select, FormControl, Avatar, Collapse, InputAdornment, OutlinedInput } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EmailIcon from '@mui/icons-material/Email';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import CancelIcon from '@mui/icons-material/Cancel';
import CloseIcon from '@mui/icons-material/Close';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AssessmentIcon from '@mui/icons-material/Assessment';
import LazyDatePicker from '../components/lazy/LazyDatePicker';
import { eachDayOfInterval } from 'date-fns';
import AdminLeaveForm from '../components/AdminLeaveForm';
import EnhancedLeaveRequestModal from '../components/EnhancedLeaveRequestModal';
import PageHeroHeader from '../components/PageHeroHeader';
import HolidayBulkUploadModal from '../components/HolidayBulkUploadModal';
import { formatLeaveRequestType } from '../utils/saturdayUtils';
import socket from '../socket';
import '../styles/AdminLeavesPage.css'; // Import the new stylesheet
import { TableSkeleton } from '../components/SkeletonLoaders';
import PeopleIcon from '@mui/icons-material/People';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import WorkIcon from '@mui/icons-material/Work';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ReplyIcon from '@mui/icons-material/Reply';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import { getWorkingLeaveDateKeys, addLeaveToBreakdown } from '../utils/leaveDayAllocations';

import { SkeletonBox } from '../components/SkeletonLoaders';
import { filterActiveEmployees, filterEmployeesByRole } from '../utils/employeeFilterUtils';
import {
  getAdminLeavesCacheKey,
  getLeavesCache,
  setLeavesCache,
  invalidateLeavesCache,
  LEAVES_REFETCH_COOLDOWN_MS,
  isLeavesCacheEntryFresh,
  getAnalyticsCountsCacheKey,
  getWorkDaysCacheKey,
} from '../utils/leavesCache';

// Helper function to calculate working days excluding Sundays and alternate Saturdays
const calculateWorkingDays = (year, month) => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    
    let workingDays = 0;
    let saturdayCount = 0;
    
    for (let date = new Date(firstDay); date <= lastDay; date.setDate(date.getDate() + 1)) {
        const dayOfWeek = date.getDay();
        
        // Skip Sundays (0)
        if (dayOfWeek === 0) {
            continue;
        }
        
        // For Saturdays (6), count only alternate ones (2nd and 4th)
        if (dayOfWeek === 6) {
            saturdayCount++;
            // Skip alternate Saturdays (1st, 3rd, 5th)
            if (saturdayCount % 2 === 1) {
                continue;
            }
        }
        
        workingDays++;
    }
    
    return workingDays;
};

// --- Shared DatePicker SlotProps for Microsoft Calendar Style ---
const datePickerSlotProps = {
    textField: {
        fullWidth: true,
        size: 'medium',
        sx: {
            '& .MuiOutlinedInput-root': {
                borderRadius: '8px',
                bgcolor: '#fafafa',
                border: '1px solid #e0e0e0',
                transition: 'all 0.2s ease',
                '&:hover': {
                    bgcolor: '#f5f5f5',
                    borderColor: '#0078d4'
                },
                '&.Mui-focused': {
                    bgcolor: 'white',
                    borderColor: '#0078d4',
                    boxShadow: '0 0 0 2px rgba(0, 120, 212, 0.1)'
                }
            },
            '& .MuiInputLabel-root': {
                color: '#605e5c',
                '&.Mui-focused': {
                    color: '#0078d4'
                }
            }
        }
    },
    paper: {
        sx: {
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
            border: '1px solid #e0e0e0',
            overflow: 'hidden',
            bgcolor: 'white',
            zIndex: 1300,
            '& .MuiPickersCalendarHeader-root': {
                bgcolor: '#fafafa',
                borderBottom: '1px solid #e0e0e0',
                padding: '12px 16px',
                minHeight: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            },
            '& .MuiPickersCalendarHeader-labelContainer': {
                order: 2,
                '& .MuiPickersCalendarHeader-label': {
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#323130',
                    textTransform: 'none',
                    margin: 0,
                    cursor: 'pointer',
                    '&:hover': {
                        color: '#0078d4'
                    }
                }
            },
            '& .MuiPickersArrowSwitcher-root': {
                display: 'flex',
                gap: '4px',
                '& .MuiIconButton-root': {
                    color: '#605e5c',
                    padding: '8px',
                    borderRadius: '4px',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                        bgcolor: '#f3f2f1'
                    }
                }
            },
            '& .MuiDayCalendar-header': {
                padding: '8px 0',
                bgcolor: 'white'
            },
            '& .MuiDayCalendar-weekContainer': {
                margin: 0
            },
            '& .MuiDayCalendar-weekDayLabel': {
                fontSize: '12px',
                fontWeight: 500,
                color: '#605e5c',
                width: '40px',
                height: '40px',
                margin: 0,
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            },
            '& .MuiPickersDay-root': {
                width: '40px',
                height: '40px',
                fontSize: '14px',
                fontWeight: 400,
                color: '#323130',
                margin: 0,
                borderRadius: '50%',
                transition: 'all 0.2s ease',
                '&.Mui-selected': {
                    bgcolor: '#0078d4',
                    color: 'white',
                    fontWeight: 600,
                    border: 'none',
                    '&:hover': {
                        bgcolor: '#106ebe'
                    },
                    '&:focus': {
                        bgcolor: '#0078d4',
                        outline: 'none'
                    }
                },
                '&:hover': {
                    bgcolor: '#e1f5fe',
                    borderRadius: '50%'
                },
                '&.MuiPickersDay-today': {
                    border: 'none',
                    fontWeight: 600,
                    color: '#323130',
                    '&.Mui-selected': {
                        color: 'white',
                        bgcolor: '#0078d4'
                    },
                    '&:not(.Mui-selected)': {
                        color: '#0078d4'
                    }
                },
                '&.Mui-disabled': {
                    color: '#c8c6c4',
                    cursor: 'not-allowed'
                },
                '&.MuiPickersDay-dayOutsideMonth': {
                    color: '#c8c6c4'
                }
            },
            '& .MuiPickersMonth-root, & .MuiPickersYear-root': {
                fontSize: '14px',
                fontWeight: 400,
                color: '#323130',
                borderRadius: '4px',
                '&.Mui-selected': {
                    bgcolor: '#0078d4',
                    color: 'white',
                    fontWeight: 600,
                    '&:hover': {
                        bgcolor: '#106ebe'
                    }
                },
                '&:hover': {
                    bgcolor: '#e1f5fe'
                }
            }
        }
    },
    popper: {
        sx: {
            zIndex: 1300,
            '& .MuiPaper-root': {
                borderRadius: '8px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
                border: '1px solid #e0e0e0'
            }
        },
        placement: 'bottom-start',
        modifiers: [
            {
                name: 'offset',
                options: {
                    offset: [0, 8]
                }
            }
        ]
    }
};

// --- Leave Count Summary Tab Component ---
// Performance: uses single backend analytics endpoint when available; falls back to legacy fetch-all loop for safety.
// refetchRef: optional ref for parent to trigger loadLeaveCounts when tab becomes visible after a mutation.
const LeaveCountSummaryTab = memo(({ refetchRef, employees: employeesProp = [], headerSearchTerm = '' }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [employees, setEmployees] = useState([]);
    const [allLeaveRequests, setAllLeaveRequests] = useState([]);
    const [analyticsCounts, setAnalyticsCounts] = useState(null); // From GET /admin/leaves/analytics/counts; null = use legacy allLeaveRequests
    const [analyticsData, setAnalyticsData] = useState({}); // Store analytics per employee
    const [totalWorkingDays, setTotalWorkingDays] = useState(null); // Total working days from monthly context settings
    const [monthlyContextDays, setMonthlyContextDays] = useState(30); // Monthly context days from settings
    const [filteredData, setFilteredData] = useState([]);
    
    // Filter states
    const today = new Date();
    const [selectedMonth, setSelectedMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    const [dateRange, setDateRange] = useState({ start: null, end: null });
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLeaveType, setSelectedLeaveType] = useState('');
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    
    // Pagination
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    
    // Clear all filters
    const handleClearFilters = () => {
        setSearchTerm('');
        setSelectedLeaveType('');
        setDateRange({ start: null, end: null });
        setSelectedMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    };
    
    // Check if any filters are active
    const hasActiveFilters = searchTerm || selectedLeaveType || dateRange.start || dateRange.end;
    
    // Load leave counts: try analytics endpoint first; on failure fall back to legacy pagination loop (non-blocking, safe).
    const loadLeaveCounts = useCallback(async () => {
        if (!employees.length) return;
        setLoading(true);
        setError('');
        
        const month = selectedMonth.getMonth() + 1;
        const year = selectedMonth.getFullYear();
        const cacheKey = getAnalyticsCountsCacheKey('Employee', year, month, selectedLeaveType || '');
        const cached = getLeavesCache(cacheKey);
        const isFresh = isLeavesCacheEntryFresh(cacheKey);
        
        // Apply cached data immediately if available (fresh or stale)
        if (cached?.data !== undefined) {
            setAnalyticsCounts(Array.isArray(cached.data) ? cached.data : []);
            setAllLeaveRequests([]);
            if (isFresh) {
                setLoading(false);
                return; // Fresh — no network call needed
            }
            // Stale — show cached data but refresh in background
        }
        
        try {
            const params = { month, year, role: 'Employee' };
            if (selectedLeaveType) params.leaveType = selectedLeaveType;
            if (dateRange.start && dateRange.end) {
                params.startDate = dateRange.start;
                params.endDate = dateRange.end;
            }
            const res = await api.get('/admin/leaves/analytics/counts', { params });
            const responseData = Array.isArray(res.data) ? res.data : [];
            setAnalyticsCounts(responseData);
            setAllLeaveRequests([]);
            setLeavesCache(cacheKey, responseData, 2 * 60 * 1000); // 2 minutes TTL
        } catch (e) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('Leave analytics endpoint failed, using legacy fetch', e);
            }
            setAnalyticsCounts(null);
            let allLeaves = [];
            let pageNum = 1;
            const limit = 1000;
            let hasMore = true;
            while (hasMore) {
                try {
                    const leavesRes = await api.get(`/admin/leaves/all?page=${pageNum}&limit=${limit}&role=Employee`);
                    const pageLeaves = Array.isArray(leavesRes.data?.requests) ? leavesRes.data.requests : (Array.isArray(leavesRes.data) ? leavesRes.data : []);
                    allLeaves = [...allLeaves, ...pageLeaves];
                    const totalCount = leavesRes.data?.totalCount || 0;
                    const totalPages = leavesRes.data?.totalPages || Math.ceil(totalCount / limit);
                    hasMore = pageNum < totalPages && pageLeaves.length === limit;
                    pageNum++;
                    if (pageNum > 100) break;
                } catch (pageErr) {
                    console.error('Error fetching leave requests page:', pageErr);
                    hasMore = false;
                }
            }
            setAllLeaveRequests(allLeaves);
            // Do NOT cache legacy fallback results
        } finally {
            setLoading(false);
        }
    }, [employees.length, selectedMonth, dateRange.start, dateRange.end, selectedLeaveType]);

    // Register loadLeaveCounts with parent so it can trigger refetch when tab becomes visible after mutation
    useEffect(() => {
        if (refetchRef) refetchRef.current = loadLeaveCounts;
        return () => { if (refetchRef) refetchRef.current = null; };
    }, [loadLeaveCounts, refetchRef]);
    
    // Initial load: fetch employees only; loading stays true until loadLeaveCounts completes.
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            // If employees prop is provided and populated, use it instead of fetching
            if (employeesProp.length > 0) {
                const employeesOnly = filterEmployeesByRole(employeesProp, 'Employee');
                setEmployees(employeesOnly);
                return;
            }
            
            // Fallback: fetch employees if prop is empty
            // Do NOT pass includeInactive: deactivated employees hidden from Leave page
            const empRes = await api.get('/admin/employees?all=true');
            const allEmps = Array.isArray(empRes.data) ? empRes.data : (empRes.data?.employees || []);
            const employeesOnly = filterEmployeesByRole(allEmps, 'Employee');
            setEmployees(employeesOnly);
        } catch (err) {
            console.error('Failed to fetch leave count data:', err);
            setError('Unable to load data');
            setLoading(false);
        }
        // Do not set loading false here; loadLeaveCounts will run next and set it when leave counts are ready
    }, [employeesProp]);
    
    // Fetch actual worked days data using attendance summary API
    const fetchAnalyticsData = useCallback(async (startDate, endDate) => {
        try {
            // Convert date range to month/year format for the endpoint
            // Use the starting month of the date range
            const targetDate = new Date(startDate);
            const month = targetDate.getMonth() + 1; // API uses 1-12 format
            const year = targetDate.getFullYear();
            
            const cacheKey = getWorkDaysCacheKey(year, month);
            const cached = getLeavesCache(cacheKey);
            const isFresh = isLeavesCacheEntryFresh(cacheKey);
            
            // Apply cached data immediately if available (fresh or stale)
            if (cached?.data !== undefined) {
                // Create a set of employee IDs from the filtered employees list
                const employeeIdSet = new Set(employees.map(emp => emp._id?.toString()));
                
                // Extract actual worked days per employee (only include employees in our filtered list)
                const analyticsMap = {};
                
                const workDaysData = Array.isArray(cached.data) 
                    ? cached.data 
                    : [cached.data];
                
                workDaysData.forEach(item => {
                    if (item && item.employeeId && item.actualWorkedDays !== undefined) {
                        // Only include employees that are in our filtered employees list
                        if (employeeIdSet.has(item.employeeId)) {
                            analyticsMap[item.employeeId] = {
                                actualWorkedDays: item.actualWorkedDays || 0
                            };
                        }
                    }
                });
                
                setAnalyticsData(analyticsMap);
                
                if (isFresh) {
                    return; // Fresh — no network call needed
                }
                // Stale — data already applied, refresh in background
            }
            
            // Call the actual-work-days endpoint (returns data for all employees)
            const actualWorkDaysRes = await api.get('/attendance/actual-work-days', {
                params: {
                    month: month,
                    year: year
                }
            });
            
            // Cache the raw response data
            setLeavesCache(cacheKey, actualWorkDaysRes.data, 5 * 60 * 1000); // 5 minutes TTL
            
            // Create a set of employee IDs from the filtered employees list
            const employeeIdSet = new Set(employees.map(emp => emp._id?.toString()));
            
            // Extract actual worked days per employee (only include employees in our filtered list)
            const analyticsMap = {};
            
            const workDaysData = Array.isArray(actualWorkDaysRes.data) 
                ? actualWorkDaysRes.data 
                : [actualWorkDaysRes.data];
            
            workDaysData.forEach(item => {
                if (item && item.employeeId && item.actualWorkedDays !== undefined) {
                    // Only include employees that are in our filtered employees list
                    if (employeeIdSet.has(item.employeeId)) {
                        analyticsMap[item.employeeId] = {
                            actualWorkedDays: item.actualWorkedDays || 0
                        };
                    }
                }
            });
            
            setAnalyticsData(analyticsMap);
        } catch (err) {
            console.error('Failed to fetch actual worked days data:', err);
            // Don't set error - just log silently, show "unavailable" in UI
            setAnalyticsData({});
        }
    }, [employees]);
    
    // Fetch monthly context settings (single source of truth for working days)
    const fetchMonthlyContextSettings = useCallback(async () => {
        try {
            const response = await api.get('/analytics/monthly-context-settings');
            const days = response.data?.days || 30;
            setMonthlyContextDays(days);
            setTotalWorkingDays(days); // Use monthly context as total working days
        } catch (err) {
            console.error('Failed to fetch monthly context settings:', err);
            // Use default value
            setMonthlyContextDays(30);
            setTotalWorkingDays(30);
        }
    }, []);
    
    useEffect(() => {
        fetchData();
        fetchMonthlyContextSettings();
    }, [fetchData, fetchMonthlyContextSettings]);
    
    useEffect(() => {
        if (employees.length > 0) loadLeaveCounts();
    }, [employees.length, loadLeaveCounts]);
    
    // Fetch analytics when date range changes
    useEffect(() => {
        if (loading || !employees.length) return;
        
        // Determine date range
        let startDate, endDate;
        if (dateRange.start && dateRange.end) {
            startDate = new Date(dateRange.start);
            endDate = new Date(dateRange.end);
            endDate.setHours(23, 59, 59, 999);
        } else {
            // Use selected month
            const year = selectedMonth.getFullYear();
            const month = selectedMonth.getMonth();
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        }
        
        // Fetch analytics data for working days
        fetchAnalyticsData(startDate, endDate);
    }, [selectedMonth, dateRange, employees.length, loading, fetchAnalyticsData]);
    
    // Aggregate and filter data (from analytics API when available, else legacy allLeaveRequests)
    useEffect(() => {
        if (loading || !employees.length) return;
        
        // Determine date range for period display and working-days context
        let startDate, endDate;
        if (dateRange.start && dateRange.end) {
            startDate = new Date(dateRange.start);
            endDate = new Date(dateRange.end);
            endDate.setHours(23, 59, 59, 999);
        } else {
            const year = selectedMonth.getFullYear();
            const month = selectedMonth.getMonth();
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        }
        
        let periodDisplay;
        if (dateRange.start && dateRange.end) {
            const startStr = new Date(dateRange.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const endStr = new Date(dateRange.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            periodDisplay = `${startStr} - ${endStr}`;
        } else {
            periodDisplay = `${selectedMonth.toLocaleString('default', { month: 'long' })} ${selectedMonth.getFullYear()}`;
        }
        // Calculate working days for the selected month excluding Sundays and alternate Saturdays
        const totalWorkingDaysForPeriod = calculateWorkingDays(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1);
        
        const aggregated = analyticsCounts !== null
            ? employees.map(emp => {
                const row = analyticsCounts.find(c => String(c.employeeId) === String(emp._id));
                const empAnalytics = analyticsData[emp._id] || {};
                return {
                    employee: emp,
                    leaveApplied: row?.leaveApplied ?? 0,
                    leaveApproved: row?.leaveApproved ?? 0,
                    totalLeaveDays: row?.totalLeaveDays ?? 0,
                    leaveTypeBreakdown: row?.leaveTypeBreakdown ?? {},
                    totalWorkingDays: totalWorkingDaysForPeriod,
                    actualWorkedDays: empAnalytics.actualWorkedDays || 0,
                    month: periodDisplay
                };
            })
            : employees.map(emp => {
            // Legacy: filter leaves for this employee within date range
            const empLeaves = allLeaveRequests.filter(leave => {
                // Match by employee ID (backend already filtered by role)
                const leaveEmployeeId = leave.employee?._id?.toString() || leave.employee?.toString();
                if (leaveEmployeeId !== emp._id?.toString()) return false;
                
                // Check if any leave date falls within range
                if (!leave.leaveDates || leave.leaveDates.length === 0) return false;
                
                const hasDateInRange = leave.leaveDates.some(date => {
                    const leaveDate = new Date(date);
                    return leaveDate >= startDate && leaveDate <= endDate;
                });
                
                if (!hasDateInRange) return false;
                
                // Filter by leave type if selected
                if (selectedLeaveType && leave.requestType !== selectedLeaveType) return false;
                
                return true;
            });
            
            // Calculate metrics
            const appliedCount = empLeaves.length;
            const approvedCount = empLeaves.filter(l => l.status === 'Approved').length;
            
            // Calculate total leave days (only approved)
            let totalLeaveDays = 0;
            const leaveTypeBreakdown = {};
            
            empLeaves.forEach(leave => {
                if (leave.status === 'Approved' && leave.leaveDates) {
                    const multiplier = leave.leaveType === 'Full Day' ? 1 : 0.5;
                    addLeaveToBreakdown(leaveTypeBreakdown, leave, startDate, endDate, multiplier);
                    const daysInRange = leave.leaveDates.filter(date => {
                        const leaveDate = new Date(date);
                        return leaveDate >= startDate && leaveDate <= endDate;
                    }).length;
                    totalLeaveDays += daysInRange * multiplier;
                }
            });
            
            const empAnalytics = analyticsData[emp._id] || {};
            const actualWorkedDays = empAnalytics.actualWorkedDays || 0;
            return {
                employee: emp,
                leaveApplied: appliedCount,
                leaveApproved: approvedCount,
                totalLeaveDays: Math.round(totalLeaveDays * 10) / 10,
                leaveTypeBreakdown,
                totalWorkingDays: totalWorkingDaysForPeriod,
                actualWorkedDays,
                month: periodDisplay
            };
        });
        
        // Apply search filter (header bar + optional expanded filters)
        let filtered = aggregated;
        const effectiveSearch = (headerSearchTerm || searchTerm).trim();
        if (effectiveSearch) {
            const searchLower = effectiveSearch.toLowerCase();
            filtered = aggregated.filter(item => {
                const name = item.employee?.fullName?.toLowerCase() || '';
                const code = item.employee?.employeeCode?.toLowerCase() || '';
                const dept = item.employee?.department?.toLowerCase() || '';
                return name.includes(searchLower) || code.includes(searchLower) || dept.includes(searchLower);
            });
        }
        
        setFilteredData(filtered);
    }, [employees, allLeaveRequests, analyticsCounts, selectedMonth, dateRange, searchTerm, headerSearchTerm, selectedLeaveType, loading, analyticsData, totalWorkingDays, monthlyContextDays]);
    
    // Calculate KPIs
    const kpis = useMemo(() => {
        if (!filteredData.length) {
            return {
                totalEmployees: 0,
                leavesApplied: 0,
                leavesApproved: 0,
                totalLeaveDays: 0,
                avgWorkingDays: 0
            };
        }
        
        const totalEmployees = filteredData.length;
        const leavesApplied = filteredData.reduce((sum, item) => sum + item.leaveApplied, 0);
        const leavesApproved = filteredData.reduce((sum, item) => sum + item.leaveApproved, 0);
        const totalLeaveDays = filteredData.reduce((sum, item) => sum + item.totalLeaveDays, 0);
        const totalWorkedDays = filteredData.reduce((sum, item) => sum + item.actualWorkedDays, 0);
        const avgWorkingDays = totalWorkingDays || monthlyContextDays; // Use monthly context settings value
        
            return {
                totalEmployees,
                leavesApplied,
                leavesApproved,
                totalLeaveDays: Math.round(totalLeaveDays * 10) / 10,
                avgWorkingDays,
                totalWorkedDays
            };
    }, [filteredData]);
    
    // Paginated data
    const paginatedData = useMemo(() => {
        const start = page * rowsPerPage;
        return filteredData.slice(start, start + rowsPerPage);
    }, [filteredData, page, rowsPerPage]);
    
    const handlePageChange = (event, newPage) => {
        setPage(newPage);
    };
    
    const handleRowsPerPageChange = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };
    
    if (loading) {
        return (
            <Box>
                <Grid container spacing={3} sx={{ mb: 3 }}>
                    {[1, 2, 3, 4, 5].map(i => (
                        <Grid item xs={12} sm={6} md={2.4} key={i}>
                            <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
                        </Grid>
                    ))}
                </Grid>
                <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 2 }} />
            </Box>
        );
    }
    
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}
            
            {/* Filter Controls with KPI Cards - Hidden by default, shown via button */}
            {filtersExpanded && (
            <Paper 
                elevation={0} 
                sx={{ 
                    mb: 3, 
                    borderRadius: 3, 
                    border: '1px solid #e0e0e0',
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                }}
            >
                <Box 
                    sx={{
                        bgcolor: '#f8f9fa',
                        p: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid #e0e0e0',
                        cursor: 'pointer'
                    }}
                    onClick={() => setFiltersExpanded(!filtersExpanded)}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <FilterListIcon sx={{ color: '#dc3545' }} />
                        <Typography variant="h6" sx={{ fontWeight: 600, color: '#2c3e50' }}>
                            Filters & Search
                        </Typography>
                        {hasActiveFilters && (
                            <Chip
                                label="Active"
                                size="small"
                                color="primary"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {hasActiveFilters && (
                            <Button
                                size="small"
                                startIcon={<ClearIcon />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleClearFilters();
                                }}
                                sx={{
                                    textTransform: 'none',
                                    color: '#dc3545',
                                    '&:hover': { bgcolor: 'rgba(220, 53, 69, 0.1)' }
                                }}
                            >
                                Clear All
                            </Button>
                        )}
                        <IconButton size="small" onClick={() => setFiltersExpanded(false)}>
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </Box>
                <Collapse in={true}>
                    <Box sx={{ p: 3, bgcolor: 'white' }}>
                        {/* KPI Cards Section */}
                        <Box sx={{ mb: 4 }}>
                            <Grid container spacing={2.5}>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Card 
                                        sx={{ 
                                            borderRadius: 3, 
                                            boxShadow: '0 4px 20px rgba(102, 126, 234, 0.15)', 
                                            height: '100%',
                                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                            color: 'white',
                                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                                            '&:hover': {
                                                transform: 'translateY(-4px)',
                                                boxShadow: '0 8px 30px rgba(102, 126, 234, 0.25)'
                                            }
                                        }}
                                    >
                                        <CardContent sx={{ p: 2.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                                <Box sx={{ 
                                                    bgcolor: 'rgba(255, 255, 255, 0.2)', 
                                                    borderRadius: 2, 
                                                    p: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <PeopleIcon sx={{ color: 'white', fontSize: 28 }} />
                                                </Box>
                                            </Box>
                                            <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5, color: 'white' }}>
                                                {kpis.totalEmployees}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                                                Total Employees
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Card 
                                        sx={{ 
                                            borderRadius: 3, 
                                            boxShadow: '0 4px 20px rgba(240, 147, 251, 0.15)', 
                                            height: '100%',
                                            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                                            color: 'white',
                                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                                            '&:hover': {
                                                transform: 'translateY(-4px)',
                                                boxShadow: '0 8px 30px rgba(240, 147, 251, 0.25)'
                                            }
                                        }}
                                    >
                                        <CardContent sx={{ p: 2.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                                <Box sx={{ 
                                                    bgcolor: 'rgba(255, 255, 255, 0.2)', 
                                                    borderRadius: 2, 
                                                    p: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <EventBusyIcon sx={{ color: 'white', fontSize: 28 }} />
                                                </Box>
                                            </Box>
                                            <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5, color: 'white' }}>
                                                {kpis.leavesApplied}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                                                Leaves Applied
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Card 
                                        sx={{ 
                                            borderRadius: 3, 
                                            boxShadow: '0 4px 20px rgba(79, 172, 254, 0.15)', 
                                            height: '100%',
                                            background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                                            color: 'white',
                                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                                            '&:hover': {
                                                transform: 'translateY(-4px)',
                                                boxShadow: '0 8px 30px rgba(79, 172, 254, 0.25)'
                                            }
                                        }}
                                    >
                                        <CardContent sx={{ p: 2.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                                <Box sx={{ 
                                                    bgcolor: 'rgba(255, 255, 255, 0.2)', 
                                                    borderRadius: 2, 
                                                    p: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <CheckCircleIcon sx={{ color: 'white', fontSize: 28 }} />
                                                </Box>
                                            </Box>
                                            <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5, color: 'white' }}>
                                                {kpis.leavesApproved}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                                                Leaves Approved
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Card 
                                        sx={{ 
                                            borderRadius: 3, 
                                            boxShadow: '0 4px 20px rgba(255, 152, 0, 0.15)', 
                                            height: '100%',
                                            background: 'linear-gradient(135deg, #ff9800 0%, #ffeb3b 100%)',
                                            color: 'white',
                                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                                            '&:hover': {
                                                transform: 'translateY(-4px)',
                                                boxShadow: '0 8px 30px rgba(255, 152, 0, 0.25)'
                                            }
                                        }}
                                    >
                                        <CardContent sx={{ p: 2.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                                <Box sx={{ 
                                                    bgcolor: 'rgba(255, 255, 255, 0.2)', 
                                                    borderRadius: 2, 
                                                    p: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <CalendarTodayIcon sx={{ color: 'white', fontSize: 28 }} />
                                                </Box>
                                            </Box>
                                            <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5, color: 'white' }}>
                                                {kpis.totalLeaveDays}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                                                Total Leave Days
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Card 
                                        sx={{ 
                                            borderRadius: 3, 
                                            boxShadow: '0 4px 20px rgba(255, 106, 136, 0.15)', 
                                            height: '100%',
                                            background: 'linear-gradient(135deg, #ff6a88 0%, #ff8c94 100%)',
                                            color: 'white',
                                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                                            '&:hover': {
                                                transform: 'translateY(-4px)',
                                                boxShadow: '0 8px 30px rgba(255, 106, 136, 0.25)'
                                            }
                                        }}
                                    >
                                        <CardContent sx={{ p: 2.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                                <Box sx={{ 
                                                    bgcolor: 'rgba(255, 255, 255, 0.2)', 
                                                    borderRadius: 2, 
                                                    p: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <WorkIcon sx={{ color: 'white', fontSize: 28 }} />
                                                </Box>
                                            </Box>
                                            <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5, color: 'white' }}>
                                                {kpis.avgWorkingDays || 'N/A'}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                                                Total Working Days
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            </Grid>
                        </Box>
                        
                        <Divider sx={{ my: 3, borderColor: '#e0e0e0', borderWidth: 1 }} />
                        
                        <Grid container spacing={3}>
                            {/* Date Range Section */}
                            <Grid item xs={12}>
                                <Grid container spacing={2.5}>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <LazyDatePicker
                                                label="Select Month"
                                                views={['year', 'month']}
                                                value={selectedMonth}
                                                onChange={(newValue) => {
                                                    if (newValue) {
                                                        setSelectedMonth(new Date(newValue.getFullYear(), newValue.getMonth(), 1));
                                                        setDateRange({ start: null, end: null });
                                                    }
                                                }}
                                                slotProps={datePickerSlotProps}
                                            />
                                    </Grid>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <LazyDatePicker
                                                label="Custom Start Date"
                                                value={dateRange.start}
                                                onChange={(newValue) => setDateRange(prev => ({ ...prev, start: newValue }))}
                                                slotProps={datePickerSlotProps}
                                            />
                                    </Grid>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <LazyDatePicker
                                                label="Custom End Date"
                                                value={dateRange.end}
                                                onChange={(newValue) => setDateRange(prev => ({ ...prev, end: newValue }))}
                                                slotProps={datePickerSlotProps}
                                            />
                                    </Grid>
                                </Grid>
                            </Grid>
                            
                            <Divider sx={{ my: 3, borderColor: '#e0e0e0', borderWidth: 1 }} />
                            
                            {/* Search & Filter Section */}
                            <Grid item xs={12}>
                                <Typography variant="subtitle1" sx={{ mb: 2.5, fontWeight: 600, color: '#2c3e50', fontSize: '1.1rem' }}>
                                    🔍 Search & Filter
                                </Typography>
                                <Grid container spacing={2.5}>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <TextField
                                            fullWidth
                                            size="medium"
                                            label="Search Employee"
                                            placeholder="Name or Employee ID"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            InputProps={{
                                                startAdornment: <SearchIcon sx={{ mr: 1, color: '#dc3545' }} />
                                            }}
                                            sx={{
                                                '& .MuiOutlinedInput-root': {
                                                    borderRadius: '8px',
                                                    bgcolor: '#fafafa',
                                                    border: '1px solid #e0e0e0',
                                                    transition: 'all 0.2s ease',
                                                    '&:hover': {
                                                        bgcolor: '#f5f5f5',
                                                        borderColor: '#0078d4'
                                                    },
                                                    '&.Mui-focused': {
                                                        bgcolor: 'white',
                                                        borderColor: '#0078d4',
                                                        boxShadow: '0 0 0 2px rgba(0, 120, 212, 0.1)'
                                                    }
                                                },
                                                '& .MuiInputLabel-root': {
                                                    color: '#605e5c',
                                                    '&.Mui-focused': {
                                                        color: '#0078d4'
                                                    }
                                                }
                                            }}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <FormControl fullWidth size="medium">
                                            <InputLabel sx={{ 
                                                color: '#605e5c',
                                                '&.Mui-focused': {
                                                    color: '#0078d4'
                                                }
                                            }}>
                                                Leave Type
                                            </InputLabel>
                                            <Select
                                                value={selectedLeaveType}
                                                onChange={(e) => setSelectedLeaveType(e.target.value)}
                                                label="Leave Type"
                                                sx={{
                                                    borderRadius: '8px',
                                                    bgcolor: '#fafafa',
                                                    border: '1px solid #e0e0e0',
                                                    transition: 'all 0.2s ease',
                                                    '&:hover': {
                                                        bgcolor: '#f5f5f5',
                                                        borderColor: '#0078d4'
                                                    },
                                                    '&.Mui-focused': {
                                                        bgcolor: 'white',
                                                        borderColor: '#0078d4',
                                                        boxShadow: '0 0 0 2px rgba(0, 120, 212, 0.1)'
                                                    },
                                                    '& .MuiOutlinedInput-notchedOutline': {
                                                        border: 'none'
                                                    }
                                                }}
                                            >
                                                <MenuItem value="">All Types</MenuItem>
                                                <MenuItem value="Planned">Planned</MenuItem>
                                                <MenuItem value="Sick">Sick</MenuItem>
                                                <MenuItem value="Loss of Pay">Loss of Pay</MenuItem>
                                                <MenuItem value="Compensatory">Compensatory</MenuItem>
                                                <MenuItem value="Backdated Leave">Backdated Leave</MenuItem>
                                                <MenuItem value="Casual">Casual</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                </Grid>
                            </Grid>
                        </Grid>
                    </Box>
                </Collapse>
            </Paper>
            )}
            
            {/* Employee Leave List */}
            <div className="requests-card">
                <Paper 
                    elevation={0} 
                    sx={{ 
                        borderRadius: 0, 
                        overflow: 'visible',
                        border: 'none',
                        boxShadow: 'none',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    <Box sx={{ bgcolor: '#f8f9fa', p: 2, borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                            <Typography variant="h6" sx={{ fontWeight: 600, color: '#2c3e50' }}>
                                Employee Leave Summary
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                {filteredData.length} employee{filteredData.length !== 1 ? 's' : ''} found
                            </Typography>
                        </Box>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<FilterListIcon />}
                            onClick={() => setFiltersExpanded(!filtersExpanded)}
                            sx={{
                                textTransform: 'none',
                                borderColor: '#dc3545',
                                color: '#dc3545',
                                '&:hover': {
                                    borderColor: '#c82333',
                                    bgcolor: 'rgba(220, 53, 69, 0.04)'
                                }
                            }}
                        >
                            {filtersExpanded ? 'Hide Filters' : 'Show Filters'}
                            {hasActiveFilters && (
                                <Chip
                                    label={Object.keys({ searchTerm, selectedLeaveType, dateRange: dateRange.start || dateRange.end }).filter(k => 
                                        k === 'searchTerm' ? searchTerm : 
                                        k === 'selectedLeaveType' ? selectedLeaveType : 
                                        dateRange.start || dateRange.end
                                    ).length}
                                    size="small"
                                    sx={{ 
                                        ml: 1, 
                                        height: 18, 
                                        fontSize: '0.65rem',
                                        bgcolor: '#dc3545',
                                        color: 'white'
                                    }}
                                />
                            )}
                        </Button>
                    </Box>
                    <TableContainer component={Paper} elevation={0} className="table-container employee-leave-summary-table">
                    <Table stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Employee Name
                                </TableCell>
                                <TableCell sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Employee ID
                                </TableCell>
                                <TableCell align="center" sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Leave Applied
                                </TableCell>
                                <TableCell align="center" sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Leave Approved
                                </TableCell>
                                <TableCell align="center" sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Total Leave Days
                                </TableCell>
                                <TableCell sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Leave Type Breakdown
                                </TableCell>
                                <TableCell align="center" sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Total Working Days
                                </TableCell>
                                <TableCell align="center" sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Actual Worked Days
                                </TableCell>
                                <TableCell sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Month
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {paginatedData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            No data available for the selected period.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedData.map((item, index) => (
                                    <TableRow 
                                        key={item.employee._id || index} 
                                        hover
                                        sx={{
                                            '&:hover': {
                                                bgcolor: '#f0f4f8',
                                                transition: 'background-color 0.15s ease'
                                            },
                                            '&:nth-of-type(even)': {
                                                bgcolor: '#fafafa'
                                            }
                                        }}
                                    >
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                <Avatar 
                                                    sx={{ 
                                                        width: 40, 
                                                        height: 40,
                                                        bgcolor: '#dc3545',
                                                        fontWeight: 600,
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                                    }}
                                                >
                                                    {item.employee.fullName?.charAt(0) || 'E'}
                                                </Avatar>
                                                <Box>
                                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#2c3e50' }}>
                                                        {item.employee.fullName || 'N/A'}
                                                    </Typography>
                                                    {item.employee.department && (
                                                        <Typography variant="caption" color="text.secondary">
                                                            {item.employee.department}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 500, color: '#666' }}>
                                                {item.employee.employeeCode || 'N/A'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Chip 
                                                label={item.leaveApplied} 
                                                size="small" 
                                                sx={{ 
                                                    bgcolor: '#fff3cd',
                                                    color: '#856404',
                                                    fontWeight: 600,
                                                    minWidth: 40
                                                }} 
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Chip 
                                                label={item.leaveApproved} 
                                                size="small" 
                                                sx={{ 
                                                    bgcolor: '#d4edda',
                                                    color: '#155724',
                                                    fontWeight: 600,
                                                    minWidth: 40
                                                }} 
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#dc3545', fontSize: '1rem' }}>
                                                {item.totalLeaveDays}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                {Object.entries(item.leaveTypeBreakdown).map(([type, days]) => (
                                                    <Chip
                                                        key={type}
                                                        label={`${type}: ${days}`}
                                                        size="small"
                                                        variant="outlined"
                                                        sx={{ 
                                                            fontSize: '0.7rem',
                                                            borderColor: '#dc3545',
                                                            color: '#dc3545',
                                                            '&:hover': {
                                                                bgcolor: '#dc3545',
                                                                color: 'white'
                                                            }
                                                        }}
                                                    />
                                                ))}
                                                {Object.keys(item.leaveTypeBreakdown).length === 0 && (
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                        None
                                                    </Typography>
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#1976d2' }}>
                                                {item.totalWorkingDays !== null && item.totalWorkingDays !== undefined 
                                                    ? item.totalWorkingDays 
                                                    : 'N/A'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                                                {item.actualWorkedDays || 0}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                                                {item.month}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
                    <TablePagination
                        rowsPerPageOptions={[10, 25, 50, 100]}
                        component="div"
                        count={filteredData.length}
                        rowsPerPage={rowsPerPage}
                        page={page}
                        onPageChange={handlePageChange}
                        onRowsPerPageChange={handleRowsPerPageChange}
                    />
                </Paper>
            </div>
        </Box>
    );
});

LeaveCountSummaryTab.displayName = 'LeaveCountSummaryTab';

// --- Intern Leave Count Summary Tab Component ---
// Performance: uses single backend analytics endpoint when available; falls back to legacy fetch-all loop for safety.
// refetchRef: optional ref for parent to trigger loadLeaveCounts when tab becomes visible after a mutation.
const InternLeaveCountSummaryTab = memo(({ refetchRef, employees: employeesProp = [], headerSearchTerm = '' }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [employees, setEmployees] = useState([]);
    const [allLeaveRequests, setAllLeaveRequests] = useState([]);
    const [analyticsCounts, setAnalyticsCounts] = useState(null);
    const [analyticsData, setAnalyticsData] = useState({});
    const [totalWorkingDays, setTotalWorkingDays] = useState(null);
    const [monthlyContextDays, setMonthlyContextDays] = useState(30);
    const [filteredData, setFilteredData] = useState([]);
    
    const today = new Date();
    const [selectedMonth, setSelectedMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    const [dateRange, setDateRange] = useState({ start: null, end: null });
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLeaveType, setSelectedLeaveType] = useState('');
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    
    const handleClearFilters = () => {
        setSearchTerm('');
        setSelectedLeaveType('');
        setDateRange({ start: null, end: null });
        setSelectedMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    };
    const hasActiveFilters = searchTerm || selectedLeaveType || dateRange.start || dateRange.end;
    
    const fetchMonthlyContextSettings = useCallback(async () => {
        try {
            const response = await api.get('/analytics/monthly-context-settings');
            const days = response.data?.days || 30;
            setMonthlyContextDays(days);
            setTotalWorkingDays(days);
        } catch (err) {
            console.error('Failed to fetch monthly context settings:', err);
            setMonthlyContextDays(30);
            setTotalWorkingDays(30);
        }
    }, []);
    
    const loadLeaveCounts = useCallback(async () => {
        if (!employees.length) return;
        setLoading(true);
        setError('');
        
        const month = selectedMonth.getMonth() + 1;
        const year = selectedMonth.getFullYear();
        const cacheKey = getAnalyticsCountsCacheKey('Intern', year, month, selectedLeaveType || '');
        const cached = getLeavesCache(cacheKey);
        const isFresh = isLeavesCacheEntryFresh(cacheKey);
        
        // Apply cached data immediately if available (fresh or stale)
        if (cached?.data !== undefined) {
            setAnalyticsCounts(Array.isArray(cached.data) ? cached.data : []);
            setAllLeaveRequests([]);
            if (isFresh) {
                setLoading(false);
                return; // Fresh — no network call needed
            }
            // Stale — show cached data but refresh in background
        }
        
        try {
            const params = { month, year, role: 'Intern' };
            if (selectedLeaveType) params.leaveType = selectedLeaveType;
            if (dateRange.start && dateRange.end) {
                params.startDate = dateRange.start;
                params.endDate = dateRange.end;
            }
            const res = await api.get('/admin/leaves/analytics/counts', { params });
            const responseData = Array.isArray(res.data) ? res.data : [];
            setAnalyticsCounts(responseData);
            setAllLeaveRequests([]);
            setLeavesCache(cacheKey, responseData, 2 * 60 * 1000); // 2 minutes TTL
        } catch (e) {
            if (process.env.NODE_ENV !== 'production') console.warn('Leave analytics endpoint failed (Intern), using legacy fetch', e);
            setAnalyticsCounts(null);
            let allLeaves = [];
            let pageNum = 1;
            const limit = 1000;
            let hasMore = true;
            while (hasMore) {
                try {
                    const leavesRes = await api.get(`/admin/leaves/all?page=${pageNum}&limit=${limit}&role=Intern`);
                    const pageLeaves = Array.isArray(leavesRes.data?.requests) ? leavesRes.data.requests : (Array.isArray(leavesRes.data) ? leavesRes.data : []);
                    allLeaves = [...allLeaves, ...pageLeaves];
                    const totalCount = leavesRes.data?.totalCount || 0;
                    const totalPages = leavesRes.data?.totalPages || Math.ceil(totalCount / limit);
                    hasMore = pageNum < totalPages && pageLeaves.length === limit;
                    pageNum++;
                    if (pageNum > 100) break;
                } catch (pageErr) {
                    console.error('Error fetching leave requests page:', pageErr);
                    hasMore = false;
                }
            }
            setAllLeaveRequests(allLeaves);
            // Do NOT cache legacy fallback results
        } finally {
            setLoading(false);
        }
    }, [employees.length, selectedMonth, dateRange.start, dateRange.end, selectedLeaveType]);

    // Register loadLeaveCounts with parent so it can trigger refetch when tab becomes visible after mutation
    useEffect(() => {
        if (refetchRef) refetchRef.current = loadLeaveCounts;
        return () => { if (refetchRef) refetchRef.current = null; };
    }, [loadLeaveCounts, refetchRef]);
    
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            // If employees prop is provided and populated, use it instead of fetching
            if (employeesProp.length > 0) {
                const interns = filterEmployeesByRole(employeesProp, 'Intern');
                setEmployees(interns);
                return;
            }
            
            // Fallback: fetch employees if prop is empty
            // Do NOT pass includeInactive: deactivated interns hidden from Leave page
            const empRes = await api.get('/admin/employees?all=true');
            const allEmps = Array.isArray(empRes.data) ? empRes.data : (empRes.data?.employees || []);
            const interns = filterEmployeesByRole(allEmps, 'Intern');
            setEmployees(interns);
        } catch (err) {
            console.error('Failed to fetch intern leave count data:', err);
            setError('Unable to load data');
            setLoading(false);
        }
    }, [employeesProp]);
    
    useEffect(() => {
        fetchData();
        fetchMonthlyContextSettings();
    }, [fetchData, fetchMonthlyContextSettings]);
    useEffect(() => {
        if (employees.length > 0) loadLeaveCounts();
    }, [employees.length, loadLeaveCounts]);
    
    // Fetch actual worked days data using attendance summary API
    const fetchAnalyticsData = useCallback(async (startDate, endDate) => {
        try {
            // Convert date range to month/year format for the endpoint
            // Use the starting month of the date range
            const targetDate = new Date(startDate);
            const month = targetDate.getMonth() + 1; // API uses 1-12 format
            const year = targetDate.getFullYear();
            
            const cacheKey = getWorkDaysCacheKey(year, month);
            const cached = getLeavesCache(cacheKey);
            const isFresh = isLeavesCacheEntryFresh(cacheKey);
            
            // Apply cached data immediately if available (fresh or stale)
            if (cached?.data !== undefined) {
                // Create a set of employee IDs from the filtered employees list (interns only)
                const employeeIdSet = new Set(employees.map(emp => emp._id?.toString()));
                
                // Extract actual worked days per employee (only include employees in our filtered list)
                const analyticsMap = {};
                
                const workDaysData = Array.isArray(cached.data) 
                    ? cached.data 
                    : [cached.data];
                
                workDaysData.forEach(item => {
                    if (item && item.employeeId && item.actualWorkedDays !== undefined) {
                        // Only include employees that are in our filtered employees list (interns)
                        if (employeeIdSet.has(item.employeeId)) {
                            analyticsMap[item.employeeId] = {
                                actualWorkedDays: item.actualWorkedDays || 0
                            };
                        }
                    }
                });
                
                setAnalyticsData(analyticsMap);
                
                if (isFresh) {
                    return; // Fresh — no network call needed
                }
                // Stale — data already applied, refresh in background
            }
            
            // Call the actual-work-days endpoint (returns data for all employees)
            const actualWorkDaysRes = await api.get('/attendance/actual-work-days', {
                params: {
                    month: month,
                    year: year
                }
            });
            
            // Cache the raw response data
            setLeavesCache(cacheKey, actualWorkDaysRes.data, 5 * 60 * 1000); // 5 minutes TTL
            
            // Create a set of employee IDs from the filtered employees list (interns only)
            const employeeIdSet = new Set(employees.map(emp => emp._id?.toString()));
            
            // Extract actual worked days per employee (only include employees in our filtered list)
            const analyticsMap = {};
            
            const workDaysData = Array.isArray(actualWorkDaysRes.data) 
                ? actualWorkDaysRes.data 
                : [actualWorkDaysRes.data];
            
            workDaysData.forEach(item => {
                if (item && item.employeeId && item.actualWorkedDays !== undefined) {
                    // Only include employees that are in our filtered employees list (interns)
                    if (employeeIdSet.has(item.employeeId)) {
                        analyticsMap[item.employeeId] = {
                            actualWorkedDays: item.actualWorkedDays || 0
                        };
                    }
                }
            });
            
            setAnalyticsData(analyticsMap);
        } catch (err) {
            console.error('Failed to fetch actual worked days data:', err);
            setAnalyticsData({});
        }
    }, [employees]);
    
    // Fetch analytics when date range changes (for actual worked days per employee)
    useEffect(() => {
        if (loading || !employees.length) return;
        
        let startDate, endDate;
        if (dateRange.start && dateRange.end) {
            startDate = new Date(dateRange.start);
            endDate = new Date(dateRange.end);
            endDate.setHours(23, 59, 59, 999);
        } else {
            const year = selectedMonth.getFullYear();
            const month = selectedMonth.getMonth();
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        }
        
        fetchAnalyticsData(startDate, endDate);
    }, [selectedMonth, dateRange, employees.length, loading, fetchAnalyticsData]);
    
    // Aggregate and filter data
    useEffect(() => {
        if (loading || !employees.length) return;
        
        let startDate, endDate;
        if (dateRange.start && dateRange.end) {
            startDate = new Date(dateRange.start);
            endDate = new Date(dateRange.end);
            endDate.setHours(23, 59, 59, 999);
        } else {
            const year = selectedMonth.getFullYear();
            const month = selectedMonth.getMonth();
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        }
        
        let periodDisplay;
        if (dateRange.start && dateRange.end) {
            const startStr = new Date(dateRange.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const endStr = new Date(dateRange.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            periodDisplay = `${startStr} - ${endStr}`;
        } else {
            periodDisplay = `${selectedMonth.toLocaleString('default', { month: 'long' })} ${selectedMonth.getFullYear()}`;
        }
        // Calculate working days for the selected month excluding Sundays and alternate Saturdays
        const totalWorkingDaysForPeriod = calculateWorkingDays(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1);
        
        const aggregated = analyticsCounts !== null
            ? employees.map(emp => {
                const row = analyticsCounts.find(c => String(c.employeeId) === String(emp._id));
                const empAnalytics = analyticsData[emp._id] || {};
                return {
                    employee: emp,
                    leaveApplied: row?.leaveApplied ?? 0,
                    leaveApproved: row?.leaveApproved ?? 0,
                    totalLeaveDays: row?.totalLeaveDays ?? 0,
                    leaveTypeBreakdown: row?.leaveTypeBreakdown ?? {},
                    totalWorkingDays: totalWorkingDaysForPeriod,
                    actualWorkedDays: empAnalytics.actualWorkedDays || 0,
                    month: periodDisplay
                };
            })
            : employees.map(emp => {
                const empLeaves = allLeaveRequests.filter(leave => {
                    const leaveEmployeeId = leave.employee?._id?.toString() || leave.employee?.toString();
                    if (leaveEmployeeId !== emp._id?.toString()) return false;
                    if (!leave.leaveDates || leave.leaveDates.length === 0) return false;
                    const hasDateInRange = leave.leaveDates.some(date => {
                        const leaveDate = new Date(date);
                        return leaveDate >= startDate && leaveDate <= endDate;
                    });
                    if (!hasDateInRange) return false;
                    if (selectedLeaveType && leave.requestType !== selectedLeaveType) return false;
                    return true;
                });
                const appliedCount = empLeaves.length;
                const approvedCount = empLeaves.filter(l => l.status === 'Approved').length;
                let totalLeaveDays = 0;
                const leaveTypeBreakdown = {};
                empLeaves.forEach(leave => {
                    if (leave.status === 'Approved' && leave.leaveDates) {
                        const multiplier = leave.leaveType === 'Full Day' ? 1 : 0.5;
                        addLeaveToBreakdown(leaveTypeBreakdown, leave, startDate, endDate, multiplier);
                        const daysInRange = leave.leaveDates.filter(date => {
                            const leaveDate = new Date(date);
                            return leaveDate >= startDate && leaveDate <= endDate;
                        }).length;
                        totalLeaveDays += daysInRange * multiplier;
                    }
                });
                const empAnalytics = analyticsData[emp._id] || {};
                return {
                    employee: emp,
                    leaveApplied: appliedCount,
                    leaveApproved: approvedCount,
                    totalLeaveDays: Math.round(totalLeaveDays * 10) / 10,
                    leaveTypeBreakdown,
                    totalWorkingDays: totalWorkingDaysForPeriod,
                    actualWorkedDays: empAnalytics.actualWorkedDays || 0,
                    month: periodDisplay
                };
            });
        
        let filtered = aggregated;
        const effectiveSearch = (headerSearchTerm || searchTerm).trim();
        if (effectiveSearch) {
            const searchLower = effectiveSearch.toLowerCase();
            filtered = aggregated.filter(item => {
                const name = item.employee?.fullName?.toLowerCase() || '';
                const code = item.employee?.employeeCode?.toLowerCase() || '';
                const dept = item.employee?.department?.toLowerCase() || '';
                return name.includes(searchLower) || code.includes(searchLower) || dept.includes(searchLower);
            });
        }
        setFilteredData(filtered);
    }, [employees, allLeaveRequests, analyticsCounts, selectedMonth, dateRange, searchTerm, headerSearchTerm, selectedLeaveType, loading, analyticsData, totalWorkingDays, monthlyContextDays]);
    
    const kpis = useMemo(() => {
        if (!filteredData.length) {
            return {
                totalEmployees: 0,
                leavesApplied: 0,
                leavesApproved: 0,
                totalLeaveDays: 0,
                avgWorkingDays: 0,
                totalWorkedDays: 0
            };
        }
        const totalEmployees = filteredData.length;
        const leavesApplied = filteredData.reduce((sum, item) => sum + item.leaveApplied, 0);
        const leavesApproved = filteredData.reduce((sum, item) => sum + item.leaveApproved, 0);
        const totalLeaveDays = filteredData.reduce((sum, item) => sum + item.totalLeaveDays, 0);
        const totalWorkedDays = filteredData.reduce((sum, item) => sum + item.actualWorkedDays, 0);
        const avgWorkingDays = totalWorkingDays || monthlyContextDays;
        return {
            totalEmployees,
            leavesApplied,
            leavesApproved,
            totalLeaveDays: Math.round(totalLeaveDays * 10) / 10,
            avgWorkingDays,
            totalWorkedDays
        };
    }, [filteredData, totalWorkingDays]);
    
    const paginatedData = useMemo(() => {
        const start = page * rowsPerPage;
        return filteredData.slice(start, start + rowsPerPage);
    }, [filteredData, page, rowsPerPage]);
    
    const handlePageChange = (event, newPage) => {
        setPage(newPage);
    };
    
    const handleRowsPerPageChange = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };
    
    if (loading) {
        return (
            <Box>
                <Grid container spacing={3} sx={{ mb: 3 }}>
                    {[1, 2, 3, 4, 5].map(i => (
                        <Grid item xs={12} sm={6} md={2.4} key={i}>
                            <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
                        </Grid>
                    ))}
                </Grid>
                <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 2 }} />
            </Box>
        );
    }
    
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}
            
            {/* Filter Controls with KPI Cards - Hidden by default, shown via button */}
            {filtersExpanded && (
            <Paper 
                elevation={0} 
                sx={{ 
                    mb: 3, 
                    borderRadius: 3, 
                    border: '1px solid #e0e0e0',
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                }}
            >
                <Box 
                    sx={{
                        bgcolor: '#f8f9fa',
                        p: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid #e0e0e0',
                        cursor: 'pointer'
                    }}
                    onClick={() => setFiltersExpanded(!filtersExpanded)}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <FilterListIcon sx={{ color: '#dc3545' }} />
                        <Typography variant="h6" sx={{ fontWeight: 600, color: '#2c3e50' }}>
                            Filters & Search
                        </Typography>
                        {hasActiveFilters && (
                            <Chip
                                label="Active"
                                size="small"
                                color="primary"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {hasActiveFilters && (
                            <Button
                                size="small"
                                startIcon={<ClearIcon />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleClearFilters();
                                }}
                                sx={{
                                    textTransform: 'none',
                                    color: '#dc3545',
                                    '&:hover': { bgcolor: 'rgba(220, 53, 69, 0.1)' }
                                }}
                            >
                                Clear All
                            </Button>
                        )}
                        <IconButton size="small" onClick={() => setFiltersExpanded(false)}>
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </Box>
                <Collapse in={true}>
                    <Box sx={{ p: 3, bgcolor: 'white' }}>
                        {/* KPI Cards Section */}
                        <Box sx={{ mb: 4 }}>
                            <Grid container spacing={2.5}>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Card 
                                        sx={{ 
                                            borderRadius: 3, 
                                            boxShadow: '0 4px 20px rgba(102, 126, 234, 0.15)', 
                                            height: '100%',
                                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                            color: 'white',
                                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                                            '&:hover': {
                                                transform: 'translateY(-4px)',
                                                boxShadow: '0 8px 30px rgba(102, 126, 234, 0.25)'
                                            }
                                        }}
                                    >
                                        <CardContent sx={{ p: 2.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                                <Box sx={{ 
                                                    bgcolor: 'rgba(255, 255, 255, 0.2)', 
                                                    borderRadius: 2, 
                                                    p: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <PeopleIcon sx={{ color: 'white', fontSize: 28 }} />
                                                </Box>
                                            </Box>
                                            <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5, color: 'white' }}>
                                                {kpis.totalEmployees}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                                                Total Interns
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Card 
                                        sx={{ 
                                            borderRadius: 3, 
                                            boxShadow: '0 4px 20px rgba(240, 147, 251, 0.15)', 
                                            height: '100%',
                                            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                                            color: 'white',
                                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                                            '&:hover': {
                                                transform: 'translateY(-4px)',
                                                boxShadow: '0 8px 30px rgba(240, 147, 251, 0.25)'
                                            }
                                        }}
                                    >
                                        <CardContent sx={{ p: 2.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                                <Box sx={{ 
                                                    bgcolor: 'rgba(255, 255, 255, 0.2)', 
                                                    borderRadius: 2, 
                                                    p: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <EventBusyIcon sx={{ color: 'white', fontSize: 28 }} />
                                                </Box>
                                            </Box>
                                            <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5, color: 'white' }}>
                                                {kpis.leavesApplied}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                                                Leaves Applied
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Card 
                                        sx={{ 
                                            borderRadius: 3, 
                                            boxShadow: '0 4px 20px rgba(79, 172, 254, 0.15)', 
                                            height: '100%',
                                            background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                                            color: 'white',
                                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                                            '&:hover': {
                                                transform: 'translateY(-4px)',
                                                boxShadow: '0 8px 30px rgba(79, 172, 254, 0.25)'
                                            }
                                        }}
                                    >
                                        <CardContent sx={{ p: 2.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                                <Box sx={{ 
                                                    bgcolor: 'rgba(255, 255, 255, 0.2)', 
                                                    borderRadius: 2, 
                                                    p: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <CheckCircleIcon sx={{ color: 'white', fontSize: 28 }} />
                                                </Box>
                                            </Box>
                                            <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5, color: 'white' }}>
                                                {kpis.leavesApproved}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                                                Leaves Approved
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Card 
                                        sx={{ 
                                            borderRadius: 3, 
                                            boxShadow: '0 4px 20px rgba(255, 152, 0, 0.15)', 
                                            height: '100%',
                                            background: 'linear-gradient(135deg, #ff9800 0%, #ffeb3b 100%)',
                                            color: 'white',
                                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                                            '&:hover': {
                                                transform: 'translateY(-4px)',
                                                boxShadow: '0 8px 30px rgba(255, 152, 0, 0.25)'
                                            }
                                        }}
                                    >
                                        <CardContent sx={{ p: 2.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                                <Box sx={{ 
                                                    bgcolor: 'rgba(255, 255, 255, 0.2)', 
                                                    borderRadius: 2, 
                                                    p: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <CalendarTodayIcon sx={{ color: 'white', fontSize: 28 }} />
                                                </Box>
                                            </Box>
                                            <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5, color: 'white' }}>
                                                {kpis.totalLeaveDays}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                                                Total Leave Days
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid item xs={12} sm={6} md={2.4}>
                                    <Card 
                                        sx={{ 
                                            borderRadius: 3, 
                                            boxShadow: '0 4px 20px rgba(255, 106, 136, 0.15)', 
                                            height: '100%',
                                            background: 'linear-gradient(135deg, #ff6a88 0%, #ff8c94 100%)',
                                            color: 'white',
                                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                                            '&:hover': {
                                                transform: 'translateY(-4px)',
                                                boxShadow: '0 8px 30px rgba(255, 106, 136, 0.25)'
                                            }
                                        }}
                                    >
                                        <CardContent sx={{ p: 2.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                                <Box sx={{ 
                                                    bgcolor: 'rgba(255, 255, 255, 0.2)', 
                                                    borderRadius: 2, 
                                                    p: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <WorkIcon sx={{ color: 'white', fontSize: 28 }} />
                                                </Box>
                                            </Box>
                                            <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5, color: 'white' }}>
                                                {kpis.avgWorkingDays || 'N/A'}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                                                Total Working Days
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            </Grid>
                        </Box>
                        
                        <Divider sx={{ my: 3, borderColor: '#e0e0e0', borderWidth: 1 }} />
                        
                        <Grid container spacing={3}>
                            {/* Date Range Section */}
                            <Grid item xs={12}>
                                <Grid container spacing={2.5}>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <LazyDatePicker
                                                label="Select Month"
                                                views={['year', 'month']}
                                                value={selectedMonth}
                                                onChange={(newValue) => {
                                                    if (newValue) {
                                                        setSelectedMonth(new Date(newValue.getFullYear(), newValue.getMonth(), 1));
                                                        setDateRange({ start: null, end: null });
                                                    }
                                                }}
                                                slotProps={datePickerSlotProps}
                                            />
                                    </Grid>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <LazyDatePicker
                                                label="Custom Start Date"
                                                value={dateRange.start}
                                                onChange={(newValue) => setDateRange(prev => ({ ...prev, start: newValue }))}
                                                slotProps={datePickerSlotProps}
                                            />
                                    </Grid>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <LazyDatePicker
                                                label="Custom End Date"
                                                value={dateRange.end}
                                                onChange={(newValue) => setDateRange(prev => ({ ...prev, end: newValue }))}
                                                slotProps={datePickerSlotProps}
                                            />
                                    </Grid>
                                </Grid>
                            </Grid>
                            
                            <Divider sx={{ my: 3, borderColor: '#e0e0e0', borderWidth: 1 }} />
                            
                            {/* Search & Filter Section */}
                            <Grid item xs={12}>
                                <Typography variant="subtitle1" sx={{ mb: 2.5, fontWeight: 600, color: '#2c3e50', fontSize: '1.1rem' }}>
                                    🔍 Search & Filter
                                </Typography>
                                <Grid container spacing={2.5}>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <TextField
                                            fullWidth
                                            size="medium"
                                            label="Search Intern"
                                            placeholder="Name or Intern ID"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            InputProps={{
                                                startAdornment: <SearchIcon sx={{ mr: 1, color: '#dc3545' }} />
                                            }}
                                            sx={{
                                                '& .MuiOutlinedInput-root': {
                                                    borderRadius: '8px',
                                                    bgcolor: '#fafafa',
                                                    border: '1px solid #e0e0e0',
                                                    transition: 'all 0.2s ease',
                                                    '&:hover': {
                                                        bgcolor: '#f5f5f5',
                                                        borderColor: '#0078d4'
                                                    },
                                                    '&.Mui-focused': {
                                                        bgcolor: 'white',
                                                        borderColor: '#0078d4',
                                                        boxShadow: '0 0 0 2px rgba(0, 120, 212, 0.1)'
                                                    }
                                                },
                                                '& .MuiInputLabel-root': {
                                                    color: '#605e5c',
                                                    '&.Mui-focused': {
                                                        color: '#0078d4'
                                                    }
                                                }
                                            }}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6} md={4}>
                                        <FormControl fullWidth size="medium">
                                            <InputLabel sx={{ 
                                                color: '#605e5c',
                                                '&.Mui-focused': {
                                                    color: '#0078d4'
                                                }
                                            }}>
                                                Leave Type
                                            </InputLabel>
                                            <Select
                                                value={selectedLeaveType}
                                                onChange={(e) => setSelectedLeaveType(e.target.value)}
                                                label="Leave Type"
                                                sx={{
                                                    borderRadius: '8px',
                                                    bgcolor: '#fafafa',
                                                    border: '1px solid #e0e0e0',
                                                    transition: 'all 0.2s ease',
                                                    '&:hover': {
                                                        bgcolor: '#f5f5f5',
                                                        borderColor: '#0078d4'
                                                    },
                                                    '&.Mui-focused': {
                                                        bgcolor: 'white',
                                                        borderColor: '#0078d4',
                                                        boxShadow: '0 0 0 2px rgba(0, 120, 212, 0.1)'
                                                    },
                                                    '& .MuiOutlinedInput-notchedOutline': {
                                                        border: 'none'
                                                    }
                                                }}
                                            >
                                                <MenuItem value="">All Types</MenuItem>
                                                <MenuItem value="Planned">Planned</MenuItem>
                                                <MenuItem value="Sick">Sick</MenuItem>
                                                <MenuItem value="Loss of Pay">Loss of Pay</MenuItem>
                                                <MenuItem value="Compensatory">Compensatory</MenuItem>
                                                <MenuItem value="Backdated Leave">Backdated Leave</MenuItem>
                                                <MenuItem value="Casual">Casual</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                </Grid>
                            </Grid>
                        </Grid>
                    </Box>
                </Collapse>
            </Paper>
            )}
            
            {/* Intern Leave List */}
            <div className="requests-card">
                <Paper 
                    elevation={0} 
                    sx={{ 
                        borderRadius: 0, 
                        overflow: 'visible',
                        border: 'none',
                        boxShadow: 'none',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    <Box sx={{ bgcolor: '#f8f9fa', p: 2, borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                            <Typography variant="h6" sx={{ fontWeight: 600, color: '#2c3e50' }}>
                                Intern Leave Summary
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                {filteredData.length} intern{filteredData.length !== 1 ? 's' : ''} found
                            </Typography>
                        </Box>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<FilterListIcon />}
                            onClick={() => setFiltersExpanded(!filtersExpanded)}
                            sx={{
                                textTransform: 'none',
                                borderColor: '#dc3545',
                                color: '#dc3545',
                                '&:hover': {
                                    borderColor: '#c82333',
                                    bgcolor: 'rgba(220, 53, 69, 0.04)'
                                }
                            }}
                        >
                            {filtersExpanded ? 'Hide Filters' : 'Show Filters'}
                            {hasActiveFilters && (
                                <Chip
                                    label={Object.keys({ searchTerm, selectedLeaveType, dateRange: dateRange.start || dateRange.end }).filter(k => 
                                        k === 'searchTerm' ? searchTerm : 
                                        k === 'selectedLeaveType' ? selectedLeaveType : 
                                        dateRange.start || dateRange.end
                                    ).length}
                                    size="small"
                                    sx={{ 
                                        ml: 1, 
                                        height: 18, 
                                        fontSize: '0.65rem',
                                        bgcolor: '#dc3545',
                                        color: 'white'
                                    }}
                                />
                            )}
                        </Button>
                    </Box>
                    <TableContainer component={Paper} elevation={0} className="table-container">
                    <Table stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Intern Name
                                </TableCell>
                                <TableCell sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Intern ID
                                </TableCell>
                                <TableCell align="center" sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Leave Applied
                                </TableCell>
                                <TableCell align="center" sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Leave Approved
                                </TableCell>
                                <TableCell align="center" sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Total Leave Days
                                </TableCell>
                                <TableCell sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Leave Type Breakdown
                                </TableCell>
                                <TableCell align="center" sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Total Working Days
                                </TableCell>
                                <TableCell align="center" sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Actual Worked Days
                                </TableCell>
                                <TableCell sx={{ 
                                    fontWeight: 700, 
                                    bgcolor: '#f8f9fa',
                                    color: '#2c3e50',
                                    fontSize: '0.875rem',
                                    borderBottom: '2px solid #e0e0e0'
                                }}>
                                    Month
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {paginatedData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            No intern data available for the selected period.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedData.map((item, index) => (
                                    <TableRow 
                                        key={item.employee._id || index} 
                                        hover
                                        sx={{
                                            '&:hover': {
                                                bgcolor: '#f0f4f8',
                                                transition: 'background-color 0.15s ease'
                                            },
                                            '&:nth-of-type(even)': {
                                                bgcolor: '#fafafa'
                                            }
                                        }}
                                    >
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                <Avatar 
                                                    sx={{ 
                                                        width: 40, 
                                                        height: 40,
                                                        bgcolor: '#dc3545',
                                                        fontWeight: 600,
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                                    }}
                                                >
                                                    {item.employee.fullName?.charAt(0) || 'I'}
                                                </Avatar>
                                                <Box>
                                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#2c3e50' }}>
                                                        {item.employee.fullName || 'N/A'}
                                                    </Typography>
                                                    {item.employee.department && (
                                                        <Typography variant="caption" color="text.secondary">
                                                            {item.employee.department}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 500, color: '#666' }}>
                                                {item.employee.employeeCode || 'N/A'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Chip 
                                                label={item.leaveApplied} 
                                                size="small" 
                                                sx={{ 
                                                    bgcolor: '#fff3cd',
                                                    color: '#856404',
                                                    fontWeight: 600,
                                                    minWidth: 40
                                                }} 
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Chip 
                                                label={item.leaveApproved} 
                                                size="small" 
                                                sx={{ 
                                                    bgcolor: '#d4edda',
                                                    color: '#155724',
                                                    fontWeight: 600,
                                                    minWidth: 40
                                                }} 
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#dc3545', fontSize: '1rem' }}>
                                                {item.totalLeaveDays}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                {Object.entries(item.leaveTypeBreakdown).map(([type, days]) => (
                                                    <Chip
                                                        key={type}
                                                        label={`${type}: ${days}`}
                                                        size="small"
                                                        variant="outlined"
                                                        sx={{ 
                                                            fontSize: '0.7rem',
                                                            borderColor: '#dc3545',
                                                            color: '#dc3545',
                                                            '&:hover': {
                                                                bgcolor: '#dc3545',
                                                                color: 'white'
                                                            }
                                                        }}
                                                    />
                                                ))}
                                                {Object.keys(item.leaveTypeBreakdown).length === 0 && (
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                        None
                                                    </Typography>
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#1976d2' }}>
                                                {item.totalWorkingDays !== null && item.totalWorkingDays !== undefined 
                                                    ? item.totalWorkingDays 
                                                    : 'N/A'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                                                {item.actualWorkedDays || 0}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                                                {item.month}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    </TableContainer>
                    <TablePagination
                        rowsPerPageOptions={[10, 25, 50, 100]}
                        component="div"
                        count={filteredData.length}
                        rowsPerPage={rowsPerPage}
                        page={page}
                        onPageChange={handlePageChange}
                        onRowsPerPageChange={handleRowsPerPageChange}
                    />
                </Paper>
            </div>
        </Box>
    );
});

InternLeaveCountSummaryTab.displayName = 'InternLeaveCountSummaryTab';

// --- HrEmailManager Modal ---
const HrEmailManagerModal = memo(({ open, onClose }) => {
    const [emails, setEmails] = useState([]);
    const [newEmail, setNewEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchEmails = useCallback(async () => {
        if (!open) return;
        setLoading(true);
        try {
            const { data } = await api.get('/admin/settings/hr-emails');
            setEmails(Array.isArray(data) ? data : []);
        } catch (err) {
            setError('Failed to load HR emails.');
        } finally {
            setLoading(false);
        }
    }, [open]);

    useEffect(() => { fetchEmails(); }, [fetchEmails]);

    const handleAddEmail = async () => {
        if (!newEmail || !/\S+@\S+\.\S+/.test(newEmail)) {
            setError('Please enter a valid email address.');
            return;
        }
        setError('');
        const originalEmails = [...emails];
        setEmails(prev => [...prev, newEmail]);
        setNewEmail('');
        try {
            const { data } = await api.post('/admin/settings/hr-emails', { email: newEmail });
            setEmails(data);
        } catch (err) {
            setEmails(originalEmails);
            setError(err.response?.data?.error || 'Failed to add email.');
        }
    };

    const handleDeleteEmail = async (emailToDelete) => {
        const originalEmails = [...emails];
        setEmails(prev => prev.filter(email => email !== emailToDelete));
        try {
            const { data } = await api.delete('/admin/settings/hr-emails', { data: { email: emailToDelete } });
            setEmails(data);
        } catch (err) {
            setEmails(originalEmails);
            setError(err.response?.data?.error || 'Failed to delete email.');
        }
    };

    return (
        <Dialog 
            open={open} 
            onClose={onClose} 
            fullWidth 
            maxWidth="sm"
            PaperProps={{
                sx: {
                    borderRadius: '16px',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)',
                    border: '1px solid #E5E7EB',
                }
            }}
        >
            <DialogTitle sx={{
                backgroundColor: '#FFFFFF',
                borderBottom: '1px solid #E5E7EB',
                padding: '16px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <Box>
                    <Typography variant="h6" sx={{ color: '#111827', fontWeight: 600, fontSize: '1.125rem' }}>
                        Notification Recipients
                    </Typography>
                </Box>
                <IconButton
                    onClick={onClose}
                    sx={{
                        color: '#6B7280',
                        '&:hover': {
                            backgroundColor: '#F3F4F6',
                            color: '#111827',
                        },
                    }}
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ padding: '24px', backgroundColor: '#FFFFFF' }}>
                <Typography variant="body2" sx={{ color: '#6B7280', mb: 3 }}>
                    Add or remove email addresses that receive leave request notifications.
                </Typography>
                {loading ? <SkeletonBox width="24px" height="24px" borderRadius="50%" /> : (
                    <>
                        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs>
                                <TextField 
                                    label="Add new recipient email" 
                                    variant="outlined" 
                                    size="small" 
                                    fullWidth 
                                    value={newEmail} 
                                    onChange={(e) => setNewEmail(e.target.value)} 
                                    onKeyPress={(e) => e.key === 'Enter' && handleAddEmail()} 
                                    sx={{
                                        '& .MuiInputLabel-root': {
                                            color: '#6B7280',
                                            fontSize: '0.875rem',
                                            '&.Mui-focused': {
                                                color: '#111827',
                                            },
                                        },
                                        '& .MuiOutlinedInput-root': {
                                            backgroundColor: '#FFFFFF',
                                            borderRadius: '8px',
                                            '& .MuiOutlinedInput-notchedOutline': {
                                                borderColor: '#D1D5DB',
                                            },
                                            '&:hover .MuiOutlinedInput-notchedOutline': {
                                                borderColor: '#9CA3AF',
                                            },
                                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                                borderColor: '#111827',
                                                borderWidth: '1px',
                                            },
                                        },
                                    }}
                                />
                            </Grid>
                            <Grid item>
                                <Button 
                                    variant="contained" 
                                    onClick={handleAddEmail}
                                    sx={{
                                        backgroundColor: '#111827',
                                        color: '#FFFFFF',
                                        fontWeight: 600,
                                        borderRadius: '8px',
                                        textTransform: 'none',
                                        boxShadow: 'none',
                                        '&:hover': {
                                            backgroundColor: '#1F2937',
                                        },
                                    }}
                                >
                                    Add
                                </Button>
                            </Grid>
                        </Grid>
                        <Divider sx={{ my: 3, borderColor: '#E5E7EB' }} />
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {emails.map((email) => (
                                <Chip
                                    key={email}
                                    label={email}
                                    onDelete={() => handleDeleteEmail(email)}
                                    deleteIcon={<CloseIcon sx={{ fontSize: '1rem' }} />}
                                    sx={{
                                        backgroundColor: '#F3F4F6',
                                        color: '#374151',
                                        borderRadius: '6px',
                                        border: '1px solid #E5E7EB',
                                        '& .MuiChip-deleteIcon': {
                                            color: '#9CA3AF',
                                            '&:hover': {
                                                color: '#374151',
                                            },
                                        },
                                    }}
                                />
                            ))}
                        </Box>
                    </>
                )}
            </DialogContent>
            <DialogActions sx={{
                padding: '16px 24px',
                backgroundColor: '#FFFFFF',
                borderTop: '1px solid #E5E7EB',
            }}>
                <Button 
                    onClick={onClose}
                    variant="outlined"
                    sx={{
                        borderColor: '#D1D5DB',
                        color: '#374151',
                        fontWeight: 600,
                        borderRadius: '8px',
                        textTransform: 'none',
                        '&:hover': {
                            borderColor: '#9CA3AF',
                            backgroundColor: '#F9FAFB',
                        },
                    }}
                >
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
});

// --- HolidayManager Modal ---
const HolidayManagerModal = memo(({ open, onClose }) => {
    const [holidays, setHolidays] = useState([]);
    const [newHoliday, setNewHoliday] = useState({ name: '', date: null });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

    const fetchHolidays = useCallback(async () => {
        if (!open) return;
        setLoading(true);
        try {
            const { data } = await api.get('/admin/holidays');
            setHolidays(Array.isArray(data) ? data : []);
        } catch (err) { setError('Failed to load holidays.'); } finally { setLoading(false); }
    }, [open]);

    useEffect(() => { fetchHolidays(); }, [fetchHolidays]);

    const handleAddHoliday = async () => {
        if (!newHoliday.name || !newHoliday.date) {
            setError('Please provide both a name and a date for the holiday.');
            return;
        }
        setError('');
        try {
            await api.post('/admin/holidays', newHoliday);
            setNewHoliday({ name: '', date: null });
            fetchHolidays();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to add holiday.');
        }
    };

    const handleDeleteHoliday = async (holidayId) => {
        try {
            await api.delete(`/admin/holidays/${holidayId}`);
            fetchHolidays();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to delete holiday.');
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CalendarMonthIcon />Holiday Management
                </Box>
            </DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Add or remove company-wide holidays.</Typography>
                {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
                
                {/* Bulk Upload Button */}
                <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                        variant="outlined"
                        startIcon={<UploadFileIcon />}
                        onClick={() => setBulkUploadOpen(true)}
                        sx={{ mr: 1 }}
                    >
                        Upload Holidays (Excel)
                    </Button>
                </Box>
                
                <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
                    <Grid item xs={12} sm={6}><TextField label="Holiday Name" size="small" fullWidth value={newHoliday.name} onChange={(e) => setNewHoliday(p => ({ ...p, name: e.target.value }))} /></Grid>
                    <Grid item xs={12} sm={4}>
                        <LazyDatePicker label="Holiday Date" value={newHoliday.date} onChange={(d) => setNewHoliday(p => ({ ...p, date: d }))} slotProps={{ textField: { size: 'small', fullWidth: true } }} />
                    </Grid>
                    <Grid item xs={12} sm={2}><Button variant="contained" fullWidth onClick={handleAddHoliday}>Add</Button></Grid>
                </Grid>
                <Divider sx={{ my: 3 }} />
                <div className="recipients-box">
                    {loading ? <SkeletonBox width="20px" height="20px" borderRadius="50%" /> : holidays.length > 0 ? (
                        holidays.map(h => {
                            const isTentative = !h.date || h.isTentative;
                            const dateDisplay = isTentative ? 'Tentative' : new Date(h.date).toLocaleDateString();
                            return (
                                <Chip 
                                    key={h._id} 
                                    label={`${h.name} (${dateDisplay})`}
                                    onDelete={() => handleDeleteHoliday(h._id)}
                                    color={isTentative ? 'warning' : 'default'}
                                />
                            );
                        })
                    ) : (
                        <div className="no-recipients-box"><InfoOutlinedIcon fontSize="small" /><Typography variant="body2">No holidays configured.</Typography></div>
                    )}
                </div>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
            
            {/* Bulk Upload Modal */}
            <HolidayBulkUploadModal 
                open={bulkUploadOpen} 
                onClose={() => setBulkUploadOpen(false)}
                onSuccess={() => {
                    setBulkUploadOpen(false);
                    fetchHolidays();
                }}
            />
        </Dialog>
    );
});


const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('en-CA') : 'N/A';

// Utility function to convert individual dates to date ranges
const formatDateRange = (dateStrings) => {
    if (!dateStrings || dateStrings.length === 0) return 'N/A';
    
    // Convert to Date objects and sort
    const dates = dateStrings
        .map(dateStr => new Date(dateStr))
        .filter(date => !isNaN(date.getTime()))
        .sort((a, b) => a - b);
    
    if (dates.length === 0) return 'N/A';
    if (dates.length === 1) return formatDate(dates[0]);
    
    // Group consecutive dates into ranges
    const ranges = [];
    let start = dates[0];
    let end = dates[0];
    
    for (let i = 1; i < dates.length; i++) {
        const currentDate = dates[i];
        const previousDate = dates[i - 1];
        const dayDiff = (currentDate - previousDate) / (1000 * 60 * 60 * 24);
        
        if (dayDiff === 1) {
            // Consecutive date, extend the range
            end = currentDate;
        } else {
            // Gap found, save current range and start new one
            ranges.push({ start, end });
            start = currentDate;
            end = currentDate;
        }
    }
    
    // Add the last range
    ranges.push({ start, end });
    
    // Format ranges
    return ranges.map(range => {
        if (range.start.getTime() === range.end.getTime()) {
            return formatDate(range.start);
        } else {
            return `${formatDate(range.start)} to ${formatDate(range.end)}`;
        }
    }).join(', ');
};

// Utility function to count total leave days
const countLeaveDays = (dateStrings) => {
    if (!dateStrings || dateStrings.length === 0) return 0;
    return dateStrings.length;
};

const matchesTabSearchQuery = (query, ...fields) => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return true;
    return fields.some((field) => String(field ?? '').toLowerCase().includes(q));
};

const RequestRow = memo(({ request, index, onEdit, onDelete, onStatusChange, onViewDetails, onReturnForCorrection, onSplitLopDays }) => {
    const statusColors = { Pending: 'warning', Approved: 'success', Rejected: 'error', Returned: 'info' };
    const workingDayCount = getWorkingLeaveDateKeys(request.leaveDates).length;
    const showLopSplit = request.requestType === 'Loss of Pay' && workingDayCount >= 2
        && ['Pending', 'Approved'].includes(request.status);

    return (
        <TableRow 
            hover 
            className="request-table-row" 
            onClick={() => onViewDetails(request)}
            style={{ cursor: 'pointer' }}
        >
            <TableCell data-label="#">{index + 1}</TableCell>
            <TableCell data-label="Employee">
                <Typography className="employee-name">{request.employee?.fullName || 'N/A'}</Typography>
                <Typography variant="body2" className="employee-code">{request.employee?.employeeCode || ''}</Typography>
            </TableCell>
            <TableCell data-label="Request Type">{formatLeaveRequestType(request.requestType)}</TableCell>
            <TableCell data-label="Leave Type">{request.leaveType}</TableCell>
            <TableCell data-label="Dates">
                {request.requestType === 'Compensatory' && request.alternateDate ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                            <Chip 
                                label={`${countLeaveDays(request.leaveDates)} day${countLeaveDays(request.leaveDates) !== 1 ? 's' : ''}`} 
                                size="small" 
                                color="primary" 
                                variant="outlined"
                                sx={{ fontSize: '0.7rem', minWidth: '60px', justifyContent: 'center' }}
                            />
                            <Box>
                                <Typography variant="body2" component="div">
                                    Leave: <strong>{formatDateRange(request.leaveDates)}</strong>
                                </Typography>
                            </Box>
                        </Box>
                        <Typography variant="caption" color="textSecondary" sx={{ ml: 7 }}>
                            Alternate Work: {formatDate(request.alternateDate)}
                        </Typography>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <Chip 
                            label={`${countLeaveDays(request.leaveDates)} day${countLeaveDays(request.leaveDates) !== 1 ? 's' : ''}`} 
                            size="small" 
                            color="primary" 
                            variant="outlined"
                            sx={{ fontSize: '0.7rem', minWidth: '60px', justifyContent: 'center' }}
                        />
                        <Typography variant="body2" component="div">
                            {formatDateRange(request.leaveDates)}
                        </Typography>
                    </Box>
                )}
            </TableCell>
            <TableCell data-label="Status">
                <Chip label={request.status === 'Returned' ? 'Needs correction' : request.status} color={statusColors[request.status] || 'default'} size="small" />
                {request.dayTypeAllocations?.length > 0 && (
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                        Split: {request.dayTypeAllocations.filter((a) => a.requestType === 'Planned').length} Planned, {request.dayTypeAllocations.filter((a) => a.requestType === 'Casual').length} Casual
                    </Typography>
                )}
            </TableCell>
            <TableCell data-label="Actions" align="center" onClick={(e) => e.stopPropagation()}>
                <div className="actions-cell">
                    <Tooltip title="View Details"><IconButton size="small" onClick={() => onViewDetails(request)}><InfoOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => onEdit(request)}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                    {request.status === 'Pending' && (
                        <>
                            <Tooltip title="Approve">
                                <IconButton 
                                    size="small" 
                                    color="success"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onStatusChange(request._id, 'Approved', '');
                                    }}
                                >
                                    <CheckCircleOutlineIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Return for correction">
                                <IconButton
                                    size="small"
                                    color="info"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onReturnForCorrection(request);
                                    }}
                                >
                                    <ReplyIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            {showLopSplit && (
                                <Tooltip title="Split LOP days (Planned / Casual)">
                                    <IconButton
                                        size="small"
                                        color="primary"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSplitLopDays(request);
                                        }}
                                    >
                                        <CallSplitIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            )}
                        </>
                    )}
                    <Tooltip title="Delete"><IconButton size="small" onClick={() => onDelete(request)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                </div>
            </TableCell>
        </TableRow>
    );
});

const AdminLeavesPage = () => {
    // Auth context
    const { user } = useAuth();
    const navigate = useNavigate();
    
    const [requests, setRequests] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [deleteDialog, setDeleteDialog] = useState({ open: false, request: null });
    const [returnDialog, setReturnDialog] = useState({ open: false, request: null, notes: '' });
    const [allocationDialog, setAllocationDialog] = useState({ open: false, request: null, dayTypes: {} });
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState(null);
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    
    // Pagination state
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    
    // Modal states for leave details
    const [viewDialog, setViewDialog] = useState({ open: false, request: null });
    
    // Year-end actions state
    const [yearEndActions, setYearEndActions] = useState([]);
    const [yearEndLoading, setYearEndLoading] = useState(false);
    const [currentTab, setCurrentTab] = useState(0);
    const [yearEndRejectDialog, setYearEndRejectDialog] = useState({ open: false, action: null, notes: '' });
    const [yearEndDeleteDialog, setYearEndDeleteDialog] = useState({ open: false, action: null, isApproved: false });
    const [highlightedActionId, setHighlightedActionId] = useState(null);
    const [yearEndFeatureEnabled, setYearEndFeatureEnabled] = useState(false);
    const [featureToggleLoading, setFeatureToggleLoading] = useState(false);
    const [tabSearchQuery, setTabSearchQuery] = useState('');
    const [debouncedTabSearch, setDebouncedTabSearch] = useState('');
    
    // Year-end view dialog state
    const [yearEndViewDialog, setYearEndViewDialog] = useState({ open: false, action: null });
    
    // Query params for deep linking
    const [searchParams, setSearchParams] = useSearchParams();
    const fetchInitialDataRef = useRef(null);
    const lastRefetchTimeRef = useRef(0);
    const pendingFetchRef = useRef(null);
    const yearEndDataLoadedRef = useRef(false);
    // Leave Count / Intern Count tabs: refetch when tab becomes visible after a mutation
    const [leaveCountsDirty, setLeaveCountsDirty] = useState(false);
    const refetchLeaveCountTab2Ref = useRef(null);
    const refetchLeaveCountTab3Ref = useRef(null);
    const hasCompletedInitialLoadRef = useRef(false);
    const prevDebouncedTabSearchRef = useRef('');
    const employeesForCacheRef = useRef([]);

    const applyInitialData = useCallback((data) => {
        if (!data) return;
        const { requests: reqs, totalCount: tot, employees: emps } = data;
        if (reqs) {
            setRequests(Array.isArray(reqs) ? reqs : []);
            setTotalCount(tot ?? 0);
        }
        if (emps) {
            const active = filterActiveEmployees(emps);
            setEmployees(active);
            employeesForCacheRef.current = active;
        }
    }, []);

    useEffect(() => {
        employeesForCacheRef.current = employees;
    }, [employees]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedTabSearch(tabSearchQuery.trim()), 300);
        return () => clearTimeout(timer);
    }, [tabSearchQuery]);

    useEffect(() => {
        if (currentTab !== 0) return;
        if (prevDebouncedTabSearchRef.current === debouncedTabSearch) return;
        prevDebouncedTabSearchRef.current = debouncedTabSearch;
        if (page !== 0) setPage(0);
    }, [debouncedTabSearch, currentTab, page]);

    const filteredYearEndActions = useMemo(() => {
        if (!debouncedTabSearch) return yearEndActions;
        return yearEndActions.filter((action) =>
            matchesTabSearchQuery(
                debouncedTabSearch,
                action.employee?.fullName,
                action.employee?.employeeCode,
                action.employee?.department,
                action.yearEndLeaveType,
                action.status,
                action.yearEndSubType,
                String(action.yearEndYear ?? '')
            )
        );
    }, [yearEndActions, debouncedTabSearch]);

    const leaveListSearch = currentTab === 0 ? debouncedTabSearch : '';

    const fetchInitialData = useCallback(async (forceRefresh = false) => {
        const cacheKey = getAdminLeavesCacheKey(page + 1, rowsPerPage, leaveListSearch);
        const now = Date.now();

        if (pendingFetchRef.current && pendingFetchRef.current.key === cacheKey && !forceRefresh) {
            return pendingFetchRef.current.promise;
        }

        const cached = !forceRefresh ? getLeavesCache(cacheKey) : null;
        const cacheFresh = cached && isLeavesCacheEntryFresh(cacheKey);

        if (cacheFresh) {
            applyInitialData(cached.data);
            setIsInitialLoading(false);
            setIsBackgroundRefreshing(false);
            return;
        }

        if (cached?.data) {
            // Stale: show immediately while refreshing in background
            applyInitialData(cached.data);
            setIsInitialLoading(false);
            setIsBackgroundRefreshing(true);
        } else if (hasCompletedInitialLoadRef.current) {
            // Search/pagination after first paint: keep UI mounted, refresh in background
            setIsInitialLoading(false);
            setIsBackgroundRefreshing(true);
        } else {
            setIsInitialLoading(true);
            setIsBackgroundRefreshing(false);
        }

        const promise = (async () => {
            try {
                const searchParam = leaveListSearch
                    ? `&search=${encodeURIComponent(leaveListSearch)}`
                    : '';
                const fetches = [
                    api.get(`/admin/leaves/all?page=${page + 1}&limit=${rowsPerPage}${searchParam}`),
                ];
                if (!hasCompletedInitialLoadRef.current || forceRefresh) {
                    fetches.push(api.get('/admin/employees?all=true'));
                }
                const [reqRes, empRes] = await Promise.all(fetches);
                const requestsList = reqRes.data.requests
                    ? (Array.isArray(reqRes.data.requests) ? reqRes.data.requests : [])
                    : (Array.isArray(reqRes.data) ? reqRes.data : []);
                const total = reqRes.data.totalCount ?? 0;
                setRequests(requestsList);
                setTotalCount(total);
                let empsForCache = employeesForCacheRef.current;
                if (empRes) {
                    const rawEmps = empRes.data.employees
                        ? (Array.isArray(empRes.data.employees) ? empRes.data.employees : [])
                        : (Array.isArray(empRes.data) ? empRes.data : []);
                    empsForCache = filterActiveEmployees(rawEmps);
                    setEmployees(empsForCache);
                    employeesForCacheRef.current = empsForCache;
                }
                setLeavesCache(cacheKey, { requests: requestsList, totalCount: total, employees: empsForCache });
                lastRefetchTimeRef.current = Date.now();
                setError('');
            } catch (err) {
                setError('Failed to fetch leave management data.');
            } finally {
                hasCompletedInitialLoadRef.current = true;
                setIsInitialLoading(false);
                setIsBackgroundRefreshing(false);
                if (pendingFetchRef.current?.key === cacheKey) pendingFetchRef.current = null;
            }
        })();

        pendingFetchRef.current = { key: cacheKey, promise };
        return promise;
    }, [page, rowsPerPage, leaveListSearch, applyInitialData]);

    fetchInitialDataRef.current = fetchInitialData;
    
    const fetchYearEndActions = useCallback(async () => {
        setYearEndLoading(true);
        try {
            const res = await api.get('/admin/leaves/year-end-requests');
            if (res.data.requests) {
                setYearEndActions(Array.isArray(res.data.requests) ? res.data.requests : []);
            } else {
                setYearEndActions(Array.isArray(res.data) ? res.data : []);
            }
        } catch (err) {
            console.error('Failed to fetch year-end actions:', err);
            setYearEndActions([]);
        } finally {
            setYearEndLoading(false);
        }
    }, []);
    
    const fetchYearEndFeatureStatus = useCallback(async () => {
        try {
            const res = await api.get('/admin/settings/year-end-feature');
            setYearEndFeatureEnabled(res.data.enabled || false);
        } catch (err) {
            console.error('Failed to fetch year-end feature status:', err);
        }
    }, []);
    
    const handleToggleYearEndFeature = async (event) => {
        const newValue = event.target.checked;
        setFeatureToggleLoading(true);
        try {
            await api.post('/admin/settings/year-end-feature', { enabled: newValue });
            setYearEndFeatureEnabled(newValue);
            setSnackbar({ open: true, message: `Year-end leave feature ${newValue ? 'enabled' : 'disabled'} successfully!`, severity: 'success' });
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to update feature setting.', severity: 'error' });
        } finally {
            setFeatureToggleLoading(false);
        }
    };
    
    // Lazy load year-end data only when user opens Year-End tab (avoids extra API on initial page load).
    useEffect(() => {
        if (currentTab !== 1) return;
        if (yearEndDataLoadedRef.current) return;
        yearEndDataLoadedRef.current = true;
        fetchYearEndActions();
        fetchYearEndFeatureStatus();
    }, [currentTab, fetchYearEndActions, fetchYearEndFeatureStatus]);

    // Handle URL parameters for deep linking from notifications
    useEffect(() => {
        const tab = searchParams.get('tab');
        const actionId = searchParams.get('actionId');
        const leaveId = searchParams.get('leaveId');
        
        if (tab === 'year-end') {
            // Activate Year-End tab (index 1); lazy-load effect will fetch year-end data when tab is 1
            setCurrentTab(1);
            // Set highlighted request ID if provided
            if (actionId) {
                setHighlightedActionId(actionId);
                // Scroll to highlighted row after data loads
                const scrollToAction = () => {
                    const element = document.getElementById(`action-${actionId}`);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // Highlight the row
                        element.style.backgroundColor = '#fff3cd';
                        setTimeout(() => {
                            element.style.backgroundColor = '';
                        }, 3000);
                    } else if (yearEndActions.length > 0) {
                        // Retry if data just loaded
                        setTimeout(scrollToAction, 200);
                    }
                };
                // Wait for data to load, then scroll
                setTimeout(scrollToAction, 500);
            }
            // Clean up URL params after processing (optional - keeps URL clean)
            // Uncomment if you want to remove params after processing:
            // const newParams = new URLSearchParams(searchParams);
            // newParams.delete('tab');
            // newParams.delete('actionId');
            // setSearchParams(newParams, { replace: true });
        } else if (tab === 'requests') {
            setCurrentTab(0);
            if (leaveId) {
                // Scroll to the leave request after data loads
                setTimeout(() => {
                    const element = document.getElementById(`leave-${leaveId}`);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        element.style.backgroundColor = '#fff3cd';
                        setTimeout(() => {
                            element.style.backgroundColor = '';
                        }, 3000);
                    }
                }, 500);
            }
        } else if (tab === 'leave-count') {
            setCurrentTab(2);
        } else if (tab === 'intern-leave-count') {
            setCurrentTab(3);
        }
    }, [searchParams, setSearchParams, fetchYearEndActions, yearEndActions.length]);

    useEffect(() => { fetchInitialData(); }, [fetchInitialData]);

    // When switching to Leave Count or Intern Count tab after a mutation, refetch so counts are fresh
    useEffect(() => {
        if (currentTab === 2 && leaveCountsDirty) {
            refetchLeaveCountTab2Ref.current?.();
            setLeaveCountsDirty(false);
        }
        if (currentTab === 3 && leaveCountsDirty) {
            refetchLeaveCountTab3Ref.current?.();
            setLeaveCountsDirty(false);
        }
    }, [currentTab, leaveCountsDirty]);
    
    // Socket: only leave-related events. Do NOT refetch on attendance_log_updated.
    useEffect(() => {
        if (!socket) return;
        const handleLeaveUpdate = () => {
            invalidateLeavesCache('leaves:');
            invalidateLeavesCache('leaves:analytics:');
            invalidateLeavesCache('leaves:workdays:');
            if (fetchInitialDataRef.current) fetchInitialDataRef.current(true);
        };
        socket.on('leave_request_updated', handleLeaveUpdate);
        return () => socket.off('leave_request_updated', handleLeaveUpdate);
    }, []);

    // Visibility: refetch only if cooldown (60s) passed to avoid refetch on every tab switch.
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) return;
            const now = Date.now();
            if (now - lastRefetchTimeRef.current < LEAVES_REFETCH_COOLDOWN_MS && lastRefetchTimeRef.current > 0) return;
            if (fetchInitialDataRef.current) fetchInitialDataRef.current(false);
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    const handleOpenForm = (request = null) => { setSelectedRequest(request); setIsFormOpen(true); };
    const handleCloseForm = () => { setSelectedRequest(null); setIsFormOpen(false); };

    // Backend requires YYYY-MM-DD only; do not send ISO timestamps (avoids "Leave dates must be calendar dates only" error).
    const toYYYYMMDD = (d) => {
        if (d == null) return null;
        const date = d instanceof Date ? d : new Date(d);
        if (isNaN(date.getTime())) return null;
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const handleSaveRequest = async (formData) => {
        try {
            // 🔧 FIX: Expand date range to include all dates between start and end
            let expandedLeaveDates = [];
            if (formData.leaveDates && formData.leaveDates[0]) {
                if (formData.leaveDates[1]) {
                    // Date range: expand to include all dates
                    const allDates = eachDayOfInterval({
                        start: formData.leaveDates[0],
                        end: formData.leaveDates[1]
                    });
                    expandedLeaveDates = allDates.map(d => toYYYYMMDD(d)).filter(Boolean);
                } else {
                    // Single date
                    expandedLeaveDates = [toYYYYMMDD(formData.leaveDates[0])].filter(Boolean);
                }
            }
            
            // Extract only the fields needed for the API, excluding _id and internal fields
            const payload = {
                employee: formData.employee,
                requestType: formData.requestType,
                leaveType: formData.leaveType,
                leaveDates: expandedLeaveDates,
                alternateDate: toYYYYMMDD(formData.alternateDate) || null,
                reason: formData.reason,
                status: formData.status,
                adminOverrideReason: `Admin-applied leave by user ID: ${user?.id || user?._id}`, // ✅ FIX: Always provide override reason
            };
            
            // Include appliedDate for both create and edit
            // Set time to start of day (00:00:00) for consistency
            if (formData.appliedDate) {
                const appliedDate = new Date(formData.appliedDate);
                appliedDate.setHours(0, 0, 0, 0); // Set to start of day
                payload.appliedDate = appliedDate.toISOString();
            }

            if (formData.requestType === 'Loss of Pay' && Array.isArray(formData.dayTypeAllocations)) {
                payload.dayTypeAllocations = formData.dayTypeAllocations;
            }
            
            if (formData._id) {
                await api.put(`/admin/leaves/${formData._id}`, payload);
                setSnackbar({ open: true, message: 'Request updated successfully!', severity: 'success' });
            } else {
                await api.post('/admin/leaves', payload);
                setSnackbar({ open: true, message: 'Request created successfully!', severity: 'success' });
            }
            handleCloseForm();
            invalidateLeavesCache('leaves:');
            invalidateLeavesCache('leaves:analytics:');
            invalidateLeavesCache('leaves:workdays:');
            fetchInitialData(true);
            setLeaveCountsDirty(true);
        } catch (err) {
            // 🔍 DEBUG: Log full error details
            console.error("Save Leave Error:", err.response?.data || err);
            
            // Show detailed error message from backend
            const errorMessage = err.response?.data?.error || 
                                err.response?.data?.message || 
                                err.message || 
                                'Failed to save request.';
            setSnackbar({ open: true, message: errorMessage, severity: 'error' });
        }
    };

    const handleStatusChange = async (requestId, status, rejectionNotes = '') => {
        try {
            const payload = { status };
            if (status === 'Rejected' && rejectionNotes) {
                payload.rejectionNotes = rejectionNotes;
            }
            // CRITICAL FIX: Pass overrideReason to allow admin to approve/reject at any time
            // This bypasses policy validations (advance notice, weekday restrictions, etc.)
            payload.overrideReason = `Admin ${status.toLowerCase()} from leaves page`;
            
            await api.patch(`/admin/leaves/${requestId}/status`, payload);
            setSnackbar({ open: true, message: `Leave request has been ${status.toLowerCase()}.`, severity: 'success' });
            invalidateLeavesCache('leaves:');
            invalidateLeavesCache('leaves:analytics:');
            invalidateLeavesCache('leaves:workdays:');
            fetchInitialData(true);
            setLeaveCountsDirty(true);
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Action failed.', severity: 'error' });
        }
    };

    const handleReturnForCorrection = (request) => {
        setReturnDialog({ open: true, request, notes: '' });
    };

    const submitReturnForCorrection = async () => {
        if (!returnDialog.request?._id) return;
        const notes = returnDialog.notes.trim();
        if (!notes) {
            setSnackbar({ open: true, message: 'Please enter a note for the employee.', severity: 'warning' });
            return;
        }
        try {
            await api.patch(`/admin/leaves/${returnDialog.request._id}/return-for-correction`, { notes });
            setReturnDialog({ open: false, request: null, notes: '' });
            setSnackbar({ open: true, message: 'Leave returned to employee for correction.', severity: 'success' });
            invalidateLeavesCache('leaves:');
            fetchInitialData(true);
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to return leave.', severity: 'error' });
        }
    };

    const handleSplitLopDays = (request) => {
        const dayTypes = {};
        getWorkingLeaveDateKeys(request.leaveDates).forEach((key) => {
            const existing = request.dayTypeAllocations?.find((a) => {
                const d = new Date(a.date);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}` === key;
            });
            dayTypes[key] = existing?.requestType || 'Loss of Pay';
        });
        setAllocationDialog({ open: true, request, dayTypes });
    };

    const submitDayAllocations = async () => {
        if (!allocationDialog.request?._id) return;
        const allocations = Object.entries(allocationDialog.dayTypes)
            .filter(([, type]) => type !== 'Loss of Pay')
            .map(([date, requestType]) => ({ date, requestType }));
        try {
            await api.patch(`/admin/leaves/${allocationDialog.request._id}/day-allocations`, { allocations });
            setAllocationDialog({ open: false, request: null, dayTypes: {} });
            setSnackbar({ open: true, message: 'Day allocations saved. Approve to apply balance deductions.', severity: 'success' });
            invalidateLeavesCache('leaves:');
            invalidateLeavesCache('leaves:analytics:');
            fetchInitialData(true);
            setLeaveCountsDirty(true);
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to save allocations.', severity: 'error' });
        }
    };
    
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

    const handleMoreMenuClick = (event) => {
        setAnchorEl(event.currentTarget);
        setMoreMenuOpen(true);
    };

    const handleMoreMenuClose = () => {
        setAnchorEl(null);
        setMoreMenuOpen(false);
    };

    const handleLeavesTrackerClick = () => {
        handleMoreMenuClose();
        window.location.href = '/admin/leaves/more-options/leaves-tracker';
    };
    
    const handleApproveYearEndAction = async (requestId) => {
        try {
            await api.patch(`/admin/leaves/year-end/${requestId}/status`, { status: 'Approved' });
            setSnackbar({ open: true, message: 'Year-End request approved successfully!', severity: 'success' });
            fetchYearEndActions();
            invalidateLeavesCache('leaves:');
            invalidateLeavesCache('leaves:analytics:');
            invalidateLeavesCache('leaves:workdays:');
            fetchInitialData(true);
            setLeaveCountsDirty(true);
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to approve request.', severity: 'error' });
        }
    };
    
    const handleRejectYearEndAction = async () => {
        if (!yearEndRejectDialog.action) return;
        try {
            await api.patch(`/admin/leaves/year-end/${yearEndRejectDialog.action._id}/status`, {
                status: 'Rejected',
                rejectionNotes: yearEndRejectDialog.notes
            });
            setSnackbar({ open: true, message: 'Year-End request rejected successfully!', severity: 'success' });
            setYearEndRejectDialog({ open: false, action: null, notes: '' });
            fetchYearEndActions();
            invalidateLeavesCache('leaves:');
            invalidateLeavesCache('leaves:analytics:');
            invalidateLeavesCache('leaves:workdays:');
            fetchInitialData(true);
            setLeaveCountsDirty(true);
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to reject request.', severity: 'error' });
        }
    };
    
    // Helper: get remaining days from Year-End request
    const getRemainingDaysDisplay = (request) => {
        if (!request) return 0;
        // Use yearEndDays from the request
        return request.yearEndDays || 0;
    };
    
    // Year-end CRUD handlers
    const handleViewYearEndAction = (action) => {
        setYearEndViewDialog({ open: true, action });
    };
    
    const handleDeleteYearEndAction = async (requestId, isApproved = false) => {
        try {
            const response = await api.delete(`/admin/leaves/year-end/${requestId}`);
            setSnackbar({ 
                open: true, 
                message: response.data?.message || (isApproved 
                    ? 'Year-End request deleted successfully. Leave balance changes have been reverted.' 
                    : 'Year-End request deleted successfully!'), 
                severity: 'success' 
            });
            setYearEndDeleteDialog({ open: false, action: null, isApproved: false });
            fetchYearEndActions();
            invalidateLeavesCache('leaves:');
            invalidateLeavesCache('leaves:analytics:');
            invalidateLeavesCache('leaves:workdays:');
            fetchInitialData(true);
            setLeaveCountsDirty(true);
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to delete Year-End request.', severity: 'error' });
        }
    };

    const handleDelete = (request) => { setDeleteDialog({ open: true, request }); };

    const handleEdit = (request) => {
        setSelectedRequest(request);
        setIsFormOpen(true);
    };

    const confirmDelete = async () => {
        const requestToDelete = deleteDialog.request;
        if (!requestToDelete) return;
        try {
            await api.delete(`/admin/leaves/${requestToDelete._id}`);
            setSnackbar({ open: true, message: 'Request deleted!', severity: 'success' });
            setDeleteDialog({ open: false, request: null });
            invalidateLeavesCache('leaves:');
            invalidateLeavesCache('leaves:analytics:');
            invalidateLeavesCache('leaves:workdays:');
            fetchInitialData(true);
            setLeaveCountsDirty(true);
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to delete request.', severity: 'error' });
        }
    };

    if (isInitialLoading) {
        return (
            <div className="admin-leaves-page">
                <Box sx={{ mb: 3 }}>
                    <Skeleton variant="rectangular" width="40%" height={60} sx={{ mb: 2, borderRadius: 1 }} />
                    <Skeleton variant="text" width="60%" height={32} />
                </Box>
                <Paper elevation={0} sx={{ mb: 3 }}>
                    <Box sx={{ p: 2 }}>
                        <Stack direction="row" spacing={2}>
                            <Skeleton variant="rectangular" width={150} height={40} sx={{ borderRadius: 1 }} />
                            <Skeleton variant="rectangular" width={180} height={40} sx={{ borderRadius: 1 }} />
                            <Skeleton variant="rectangular" width={160} height={40} sx={{ borderRadius: 1 }} />
                        </Stack>
                    </Box>
                </Paper>
                <Paper elevation={0} className="requests-card">
                    <TableSkeleton rows={8} columns={7} minHeight="600px" />
                </Paper>
            </div>
        );
    }

    return (
        <div className="admin-leaves-page">
            <PageHeroHeader
                eyebrow="Operations Control"
                title="Leave Management"
                description="Monitor, approve, and manage leave workflows."
                actionArea={
                    <Stack
                        direction="row"
                        spacing={1.5}
                        flexWrap="wrap"
                        justifyContent="flex-end"
                        alignItems="center"
                    >
                        <Button 
                            variant="contained" 
                            onClick={() => handleOpenForm()} 
                            startIcon={<AddIcon />}
                            sx={{ 
                                bgcolor: '#dc3545', 
                                '&:hover': { bgcolor: '#c82333' } 
                            }}
                        >
                            Log Request
                        </Button>
                        <Button 
                            variant="contained" 
                            startIcon={<EmailIcon />} 
                            onClick={() => setIsEmailModalOpen(true)}
                            sx={{ 
                                bgcolor: '#dc3545', 
                                '&:hover': { bgcolor: '#c82333' } 
                            }}
                        >
                            Manage Recipients
                        </Button>
                        <Button 
                            variant="contained" 
                            startIcon={<CalendarMonthIcon />} 
                            onClick={() => navigate('/admin/holidays')}
                            sx={{ 
                                bgcolor: '#dc3545', 
                                '&:hover': { bgcolor: '#c82333' } 
                            }}
                        >
                            Manage Holidays
                        </Button>
                        <Tooltip title="More Options">
                            <IconButton 
                                size="small" 
                                onClick={handleMoreMenuClick}
                                sx={{
                                    border: '2px solid #000000',
                                    borderRadius: '4px',
                                    '&:hover': {
                                        border: '2px solid #000000',
                                        bgcolor: 'rgba(0, 0, 0, 0.04)'
                                    }
                                }}
                            >
                                <MoreVertIcon />
                            </IconButton>
                        </Tooltip>
                    </Stack>
                }
            />

            {error && <Alert severity="error" className="error-alert">{error}</Alert>}
            
            <Paper elevation={0} sx={{ mb: 3 }}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 2,
                        px: { xs: 1, sm: 2 },
                        pt: 1,
                    }}
                >
                    <Tabs 
                        value={currentTab} 
                        onChange={(e, newValue) => setCurrentTab(newValue)}
                        sx={{
                            flex: '1 1 auto',
                            minWidth: 0,
                            '& .MuiTabs-indicator': {
                                backgroundColor: '#1976d2',
                                transition: 'all 0.3s ease-in-out',
                            },
                            '& .MuiTab-root': {
                                transition: 'color 0.2s ease-in-out',
                                border: 'none !important',
                                borderTop: 'none !important',
                                borderRight: 'none !important',
                                borderBottom: 'none !important',
                                borderLeft: 'none !important',
                                outline: 'none !important',
                                boxShadow: 'none !important',
                                '&.Mui-selected': {
                                    border: 'none !important',
                                    borderTop: 'none !important',
                                    borderRight: 'none !important',
                                    borderBottom: 'none !important',
                                    borderLeft: 'none !important',
                                    outline: 'none !important',
                                    boxShadow: 'none !important'
                                },
                                '&::before': {
                                    display: 'none !important'
                                },
                                '&::after': {
                                    display: 'none !important'
                                }
                            }
                        }}
                    >
                        <Tab label="Leave Requests" />
                        <Tab label="Year-End Requests" />
                        <Tab label="Employee Leave Count" />
                        <Tab label="Intern Leave Count" />
                    </Tabs>
                    <OutlinedInput
                        size="small"
                        placeholder={
                            currentTab === 0
                                ? 'Search leave requests...'
                                : currentTab === 1
                                    ? 'Search year-end requests...'
                                    : 'Search by name or code...'
                        }
                        value={tabSearchQuery}
                        onChange={(e) => setTabSearchQuery(e.target.value)}
                        startAdornment={
                            <InputAdornment position="start">
                                <SearchIcon sx={{ color: '#6c757d', fontSize: '1.2rem' }} />
                            </InputAdornment>
                        }
                        endAdornment={
                            tabSearchQuery ? (
                                <InputAdornment position="end">
                                    <IconButton
                                        size="small"
                                        onClick={() => setTabSearchQuery('')}
                                        edge="end"
                                        aria-label="Clear search"
                                        sx={{ padding: '4px' }}
                                    >
                                        <ClearIcon sx={{ fontSize: '1rem' }} />
                                    </IconButton>
                                </InputAdornment>
                            ) : null
                        }
                        sx={{
                            flex: '0 0 auto',
                            backgroundColor: '#ffffff',
                            borderRadius: '8px',
                            minWidth: { xs: '100%', sm: '280px' },
                            maxWidth: { sm: '320px' },
                            '& .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#dee2e6',
                            },
                            '&:hover .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#adb5bd',
                            },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#1976d2',
                                borderWidth: '2px',
                            },
                        }}
                    />
                </Box>
            </Paper>
            
            {/* Tab Content Container - Dynamic height wrapper for smooth transitions */}
            <Box
                className="leave-tabs-content"
                sx={{
                    position: 'relative',
                    flex: '0 1 auto',
                    width: '100%',
                    overflow: 'visible',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* Leave Requests Tab - Always mounted, visibility toggled */}
                <Box
                    className="leave-tab-panel--fit"
                    sx={{
                        position: currentTab === 0 ? 'relative' : 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        opacity: currentTab === 0 ? 1 : 0,
                        transform: currentTab === 0 ? 'translateY(0)' : 'translateY(8px)',
                        pointerEvents: currentTab === 0 ? 'auto' : 'none',
                        transition: 'opacity 220ms ease-in-out, transform 220ms ease-in-out',
                        willChange: currentTab === 0 ? 'auto' : 'opacity, transform',
                        zIndex: currentTab === 0 ? 1 : 0,
                        visibility: currentTab === 0 ? 'visible' : 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'visible',
                        width: '100%',
                    }}
                >
                    <div className="requests-card">
                        <TableContainer component={Paper} elevation={0} className="table-container">
                            <Table stickyHeader aria-label="leave requests table">
                                <TableHead className="requests-table-head">
                                    <TableRow>
                                        <TableCell sx={{ width: '60px' }}>S.No.</TableCell>
                                        <TableCell>Employee</TableCell>
                                        <TableCell>Type</TableCell>
                                        <TableCell>Day Type</TableCell>
                                        <TableCell>Date(s)</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell align="center">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {requests.map((request, index) => (
                                        <RequestRow 
                                            key={request._id} 
                                            request={request} 
                                            index={index} 
                                            onEdit={handleOpenForm} 
                                            onDelete={handleDelete}
                                            onStatusChange={handleStatusChange}
                                            onViewDetails={handleViewDetails}
                                            onReturnForCorrection={handleReturnForCorrection}
                                            onSplitLopDays={handleSplitLopDays}
                                        />
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        
                        <TablePagination
                            rowsPerPageOptions={[5, 10, 25, 50]}
                            component="div"
                            count={totalCount}
                            rowsPerPage={rowsPerPage}
                            page={page}
                            onPageChange={handlePageChange}
                            onRowsPerPageChange={handleRowsPerPageChange}
                        />
                    </div>
                </Box>
                
                {/* Year-End Requests Tab - Always mounted, visibility toggled */}
                <Box
                    sx={{
                        position: currentTab === 1 ? 'relative' : 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        opacity: currentTab === 1 ? 1 : 0,
                        transform: currentTab === 1 ? 'translateY(0)' : 'translateY(8px)',
                        pointerEvents: currentTab === 1 ? 'auto' : 'none',
                        transition: 'opacity 220ms ease-in-out, transform 220ms ease-in-out',
                        willChange: currentTab === 1 ? 'auto' : 'opacity, transform',
                        zIndex: currentTab === 1 ? 1 : 0,
                        visibility: currentTab === 1 ? 'visible' : 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                >
                    <div className="requests-card">
                    {/* Feature Toggle Section */}
                    <Paper elevation={0} sx={{ p: 2, mb: 3, bgcolor: '#f5f5f5', borderRadius: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                                    Year-End Leave Feature
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Enable or disable the year-end leave carry forward and encashment feature for employees.
                                </Typography>
                            </Box>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={yearEndFeatureEnabled}
                                        onChange={handleToggleYearEndFeature}
                                        disabled={featureToggleLoading}
                                        color="primary"
                                    />
                                }
                                label={yearEndFeatureEnabled ? 'Enabled' : 'Disabled'}
                            />
                        </Box>
                    </Paper>
                    
                    {yearEndLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                            <SkeletonBox width="24px" height="24px" borderRadius="50%" />
                        </Box>
                    ) : (
                        <TableContainer component={Paper} elevation={0} className="table-container">
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Employee Name</TableCell>
                                        <TableCell>Leave Type</TableCell>
                                        <TableCell>Year</TableCell>
                                        <TableCell>Days</TableCell>
                                        <TableCell>Action</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Date</TableCell>
                                        <TableCell align="center">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredYearEndActions.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    {debouncedTabSearch
                                                        ? 'No year-end requests match your search.'
                                                        : 'No year-end leave requests found.'}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredYearEndActions.map((action) => (
                                            <TableRow 
                                                key={action._id} 
                                                id={`action-${action._id}`}
                                                hover
                                                sx={{
                                                    backgroundColor: highlightedActionId === action._id ? '#fff3cd' : 'inherit',
                                                    transition: 'background-color 0.3s'
                                                }}
                                            >
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                        {action.employee?.fullName || 'N/A'}
                                                    </Typography>
                                                    {action.employee?.employeeCode && (
                                                        <Typography variant="caption" color="text.secondary" display="block">
                                                            {action.employee.employeeCode}
                                                        </Typography>
                                                    )}
                                                    {action.employee?.department && (
                                                        <Typography variant="caption" color="text.secondary" display="block">
                                                            {action.employee.department}
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell>{action.yearEndLeaveType || 'N/A'}</TableCell>
                                                <TableCell>{action.yearEndYear || new Date().getFullYear()}</TableCell>
                                                <TableCell>{getRemainingDaysDisplay(action)}</TableCell>
                                                <TableCell>
                                                    {action.yearEndSubType ? (
                                                        <Chip 
                                                            label={action.yearEndSubType === 'CARRY_FORWARD' ? 'Carry Forward' : 'Encash'}
                                                            color={action.yearEndSubType === 'CARRY_FORWARD' ? 'primary' : 'success'}
                                                            size="small"
                                                        />
                                                    ) : (
                                                        <Typography variant="body2" color="text.secondary">
                                                            Not selected
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Chip 
                                                        label={action.status}
                                                        color={
                                                            action.status === 'Approved' ? 'success' :
                                                            action.status === 'Rejected' ? 'error' :
                                                            action.status === 'Completed' ? 'info' : 'warning'
                                                        }
                                                        size="small"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    {action.createdAt ? new Date(action.createdAt).toLocaleDateString() : 'N/A'}
                                                </TableCell>
                                                <TableCell 
                                                    align="center" 
                                                    onClick={(e) => e.stopPropagation()}
                                                    sx={{ 
                                                        minWidth: '150px',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                >
                                                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
                                                        <Tooltip title="View Details">
                                                            <IconButton
                                                                size="small"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleViewYearEndAction(action);
                                                                }}
                                                                sx={{ 
                                                                    color: '#1976d2',
                                                                    '&:hover': { backgroundColor: 'rgba(25, 118, 210, 0.1)' }
                                                                }}
                                                            >
                                                                <InfoOutlinedIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                        {action.status === 'Pending' && action.yearEndSubType && (
                                                            <>
                                                                <Tooltip title="Approve">
                                                                    <IconButton
                                                                        size="small"
                                                                        color="success"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleApproveYearEndAction(action._id);
                                                                        }}
                                                                        sx={{ 
                                                                            '&:hover': { backgroundColor: 'rgba(46, 125, 50, 0.1)' }
                                                                        }}
                                                                    >
                                                                        <CheckCircleOutlineIcon fontSize="small" />
                                                                    </IconButton>
                                                                </Tooltip>
                                                                <Tooltip title="Reject">
                                                                    <IconButton
                                                                        size="small"
                                                                        color="error"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setYearEndRejectDialog({ open: true, action, notes: '' });
                                                                        }}
                                                                        sx={{ 
                                                                            '&:hover': { backgroundColor: 'rgba(211, 47, 47, 0.1)' }
                                                                        }}
                                                                    >
                                                                        <HighlightOffIcon fontSize="small" />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            </>
                                                        )}
                                                        {(action.status === 'Pending' || action.status === 'Approved') && (
                                                            <Tooltip title="Delete">
                                                                <IconButton
                                                                    size="small"
                                                                    color="error"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setYearEndDeleteDialog({ 
                                                                            open: true, 
                                                                            action: action,
                                                                            isApproved: action.status === 'Approved'
                                                                        });
                                                                    }}
                                                                    sx={{ 
                                                                        '&:hover': { backgroundColor: 'rgba(211, 47, 47, 0.1)' }
                                                                    }}
                                                                >
                                                                    <DeleteOutlineIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                    </div>
                </Box>
                
                {/* Leave Count Summary Tab - Always mounted, visibility toggled */}
                <Box
                    sx={{
                        position: currentTab === 2 ? 'relative' : 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        opacity: currentTab === 2 ? 1 : 0,
                        transform: currentTab === 2 ? 'translateY(0)' : 'translateY(8px)',
                        pointerEvents: currentTab === 2 ? 'auto' : 'none',
                        transition: 'opacity 220ms ease-in-out, transform 220ms ease-in-out',
                        willChange: currentTab === 2 ? 'auto' : 'opacity, transform',
                        zIndex: currentTab === 2 ? 1 : 0,
                        visibility: currentTab === 2 ? 'visible' : 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                >
                    <LeaveCountSummaryTab
                        refetchRef={refetchLeaveCountTab2Ref}
                        employees={employees}
                        headerSearchTerm={debouncedTabSearch}
                    />
                </Box>
                
                {/* Intern Leave Count Summary Tab - Always mounted, visibility toggled */}
                <Box
                    sx={{
                        position: currentTab === 3 ? 'relative' : 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        opacity: currentTab === 3 ? 1 : 0,
                        transform: currentTab === 3 ? 'translateY(0)' : 'translateY(8px)',
                        pointerEvents: currentTab === 3 ? 'auto' : 'none',
                        transition: 'opacity 220ms ease-in-out, transform 220ms ease-in-out',
                        willChange: currentTab === 3 ? 'auto' : 'opacity, transform',
                        zIndex: currentTab === 3 ? 1 : 0,
                        visibility: currentTab === 3 ? 'visible' : 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                >
                    <InternLeaveCountSummaryTab
                        refetchRef={refetchLeaveCountTab3Ref}
                        employees={employees}
                        headerSearchTerm={debouncedTabSearch}
                    />
                </Box>
            </Box>

            {isFormOpen && <AdminLeaveForm 
                open={isFormOpen} 
                onClose={handleCloseForm} 
                onSave={handleSaveRequest} 
                request={selectedRequest} 
                employees={employees}
                error={snackbar.severity === 'error' && snackbar.open ? snackbar.message : ''}
                onClearError={() => setSnackbar({ ...snackbar, open: false })}
            />}
            
            
            <HrEmailManagerModal open={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} />

            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, request: null })}><DialogTitle>Confirm Deletion</DialogTitle><DialogContent>Are you sure you want to delete this leave request?</DialogContent><DialogActions><Button onClick={() => setDeleteDialog({ open: false, request: null })}>Cancel</Button><Button onClick={confirmDelete} color="error" variant="contained">Delete</Button></DialogActions></Dialog>
            
            {/* Year-End View Details Dialog */}
            <Dialog open={yearEndViewDialog.open} onClose={() => setYearEndViewDialog({ open: false, action: null })} fullWidth maxWidth="sm">
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <InfoOutlinedIcon />
                        Year-End Leave Request Details
                    </Box>
                </DialogTitle>
                <DialogContent>
                                    {yearEndViewDialog.action && (
                                        <Stack spacing={2} sx={{ mt: 1 }}>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">Employee</Typography>
                                                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                                    {yearEndViewDialog.action.employee?.fullName || 'N/A'}
                                                </Typography>
                                                {yearEndViewDialog.action.employee?.employeeCode && (
                                                    <Typography variant="body2" color="text.secondary">
                                                        Code: {yearEndViewDialog.action.employee.employeeCode}
                                                    </Typography>
                                                )}
                                                {yearEndViewDialog.action.employee?.department && (
                                                    <Typography variant="body2" color="text.secondary">
                                                        Department: {yearEndViewDialog.action.employee.department}
                                                    </Typography>
                                                )}
                                            </Box>
                                            <Divider />
                                            <Grid container spacing={2}>
                                                <Grid item xs={6}>
                                                    <Typography variant="caption" color="text.secondary">Leave Type</Typography>
                                                    <Typography variant="body1">{yearEndViewDialog.action.yearEndLeaveType || 'N/A'}</Typography>
                                                </Grid>
                                                <Grid item xs={6}>
                                                    <Typography variant="caption" color="text.secondary">Year</Typography>
                                                    <Typography variant="body1">{yearEndViewDialog.action.yearEndYear || new Date().getFullYear()}</Typography>
                                                </Grid>
                                                <Grid item xs={6}>
                                                    <Typography variant="caption" color="text.secondary">Days</Typography>
                                                    <Typography variant="body1">{yearEndViewDialog.action.yearEndDays || 0}</Typography>
                                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="caption" color="text.secondary">Status</Typography>
                                    <Chip 
                                        label={yearEndViewDialog.action.status}
                                        color={
                                            yearEndViewDialog.action.status === 'Approved' ? 'success' :
                                            yearEndViewDialog.action.status === 'Rejected' ? 'error' : 'warning'
                                        }
                                        size="small"
                                    />
                                </Grid>
                                {yearEndViewDialog.action.yearEndSubType && (
                                    <Grid item xs={6}>
                                        <Typography variant="caption" color="text.secondary">Requested Action</Typography>
                                        <Chip 
                                            label={yearEndViewDialog.action.yearEndSubType === 'CARRY_FORWARD' ? 'Carry Forward' : 'Encash'}
                                            color={yearEndViewDialog.action.yearEndSubType === 'CARRY_FORWARD' ? 'primary' : 'success'}
                                            size="small"
                                        />
                                    </Grid>
                                )}
                                {yearEndViewDialog.action.createdAt && (
                                    <Grid item xs={6}>
                                        <Typography variant="caption" color="text.secondary">Requested At</Typography>
                                        <Typography variant="body1">
                                            {new Date(yearEndViewDialog.action.createdAt).toLocaleString()}
                                        </Typography>
                                    </Grid>
                                )}
                                {yearEndViewDialog.action.approvedAt && (
                                    <Grid item xs={6}>
                                        <Typography variant="caption" color="text.secondary">Processed At</Typography>
                                        <Typography variant="body1">
                                            {new Date(yearEndViewDialog.action.approvedAt).toLocaleString()}
                                        </Typography>
                                    </Grid>
                                )}
                                {yearEndViewDialog.action.approvedBy && (
                                    <Grid item xs={6}>
                                        <Typography variant="caption" color="text.secondary">Processed By</Typography>
                                        <Typography variant="body1">
                                            {yearEndViewDialog.action.approvedBy?.fullName || 'N/A'}
                                        </Typography>
                                    </Grid>
                                )}
                            </Grid>
                            {yearEndViewDialog.action.rejectionNotes && (
                                <>
                                    <Divider />
                                    <Box>
                                        <Typography variant="caption" color="text.secondary">Rejection Notes</Typography>
                                        <Typography variant="body1" sx={{ mt: 1 }}>
                                            {yearEndViewDialog.action.rejectionNotes}
                                        </Typography>
                                    </Box>
                                </>
                            )}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setYearEndViewDialog({ open: false, action: null })}>Close</Button>
                </DialogActions>
            </Dialog>
            
            {/* Year-End Reject Dialog */}
            <Dialog open={yearEndRejectDialog.open} onClose={() => setYearEndRejectDialog({ open: false, action: null, notes: '' })}>
                <DialogTitle>Reject Year-End Action</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        multiline
                        rows={4}
                        label="Rejection Notes"
                        value={yearEndRejectDialog.notes}
                        onChange={(e) => setYearEndRejectDialog({ ...yearEndRejectDialog, notes: e.target.value })}
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setYearEndRejectDialog({ open: false, action: null, notes: '' })}>
                        Cancel
                    </Button>
                    <Button onClick={handleRejectYearEndAction} color="error" variant="contained">
                        Reject
                    </Button>
                </DialogActions>
            </Dialog>
            
            {/* Year-End Delete Confirmation Dialog */}
            <Dialog 
                open={yearEndDeleteDialog.open} 
                onClose={() => setYearEndDeleteDialog({ open: false, action: null, isApproved: false })} 
                fullWidth 
                maxWidth="sm"
            >
                <DialogTitle sx={{ color: '#d32f2f', fontWeight: 700 }}>
                    {yearEndDeleteDialog.isApproved ? 'Delete Approved Year-End Request' : 'Delete Year-End Request'}
                </DialogTitle>
                <DialogContent>
                    {yearEndDeleteDialog.action && (
                        <Box>
                            {yearEndDeleteDialog.isApproved ? (
                                <>
                                    <Alert severity="warning" sx={{ mb: 2, borderRadius: '8px' }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                                            This will revert leave balance changes.
                                        </Typography>
                                        <Typography variant="body2">
                                            The leave balance adjustments made when this request was approved will be rolled back.
                                        </Typography>
                                    </Alert>
                                    <Box sx={{ mb: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: '8px' }}>
                                        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                                            Request Details:
                                        </Typography>
                                        <Typography variant="body2">
                                            <strong>Employee:</strong> {yearEndDeleteDialog.action.employee?.fullName || 'N/A'}
                                        </Typography>
                                        <Typography variant="body2">
                                            <strong>Leave Type:</strong> {yearEndDeleteDialog.action.yearEndLeaveType || 'N/A'}
                                        </Typography>
                                        <Typography variant="body2">
                                            <strong>Year:</strong> {yearEndDeleteDialog.action.yearEndYear || new Date().getFullYear()}
                                        </Typography>
                                        <Typography variant="body2">
                                            <strong>Days:</strong> {yearEndDeleteDialog.action.yearEndDays || 0}
                                        </Typography>
                                        <Typography variant="body2">
                                            <strong>Action:</strong> {yearEndDeleteDialog.action.yearEndSubType === 'CARRY_FORWARD' ? 'Carry Forward' : 'Encash'}
                                        </Typography>
                                    </Box>
                                    <Typography variant="body2" color="text.secondary">
                                        Are you sure you want to delete this approved request? This action cannot be undone.
                                    </Typography>
                                </>
                            ) : (
                                <>
                                    <Typography variant="body2" sx={{ mb: 2 }}>
                                        Are you sure you want to delete this Year-End request?
                                    </Typography>
                                    <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: '8px' }}>
                                        <Typography variant="body2">
                                            <strong>Employee:</strong> {yearEndDeleteDialog.action.employee?.fullName || 'N/A'}
                                        </Typography>
                                        <Typography variant="body2">
                                            <strong>Leave Type:</strong> {yearEndDeleteDialog.action.yearEndLeaveType || 'N/A'}
                                        </Typography>
                                        <Typography variant="body2">
                                            <strong>Days:</strong> {yearEndDeleteDialog.action.yearEndDays || 0}
                                        </Typography>
                                    </Box>
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                                        This action cannot be undone.
                                    </Typography>
                                </>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button 
                        onClick={() => setYearEndDeleteDialog({ open: false, action: null, isApproved: false })}
                        variant="outlined"
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={() => {
                            if (yearEndDeleteDialog.action?._id) {
                                handleDeleteYearEndAction(yearEndDeleteDialog.action._id, yearEndDeleteDialog.isApproved);
                            }
                        }}
                        color="error" 
                        variant="contained"
                    >
                        {yearEndDeleteDialog.isApproved ? 'Delete & Revert' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>
            
            {/* Return for correction */}
            <Dialog
                open={returnDialog.open}
                onClose={() => setReturnDialog({ open: false, request: null, notes: '' })}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>Return for correction</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        The employee can edit and resubmit this request. Your note will appear on their leave page.
                    </Typography>
                    <TextField
                        label="Note for employee"
                        placeholder="e.g. You applied LOP — please use Planned leave for these dates instead."
                        multiline
                        minRows={3}
                        fullWidth
                        value={returnDialog.notes}
                        onChange={(e) => setReturnDialog((prev) => ({ ...prev, notes: e.target.value }))}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setReturnDialog({ open: false, request: null, notes: '' })}>Cancel</Button>
                    <Button variant="contained" color="primary" onClick={submitReturnForCorrection}>Send back</Button>
                </DialogActions>
            </Dialog>

            {/* LOP day split */}
            <Dialog
                open={allocationDialog.open}
                onClose={() => setAllocationDialog({ open: false, request: null, dayTypes: {} })}
                fullWidth
                maxWidth="md"
            >
                <DialogTitle>Split LOP days</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Assign specific working days to Planned or Casual leave. Remaining days stay as Loss of Pay. This affects balance deduction on approval and leave summary counts.
                    </Typography>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Date</TableCell>
                                <TableCell>Leave type for this day</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {Object.keys(allocationDialog.dayTypes).sort().map((dateKey) => (
                                <TableRow key={dateKey}>
                                    <TableCell>{dateKey}</TableCell>
                                    <TableCell>
                                        <FormControl size="small" fullWidth>
                                            <Select
                                                value={allocationDialog.dayTypes[dateKey] || 'Loss of Pay'}
                                                onChange={(e) => setAllocationDialog((prev) => ({
                                                    ...prev,
                                                    dayTypes: { ...prev.dayTypes, [dateKey]: e.target.value },
                                                }))}
                                            >
                                                <MenuItem value="Loss of Pay">Loss of Pay</MenuItem>
                                                <MenuItem value="Planned">Planned</MenuItem>
                                                <MenuItem value="Casual">Casual</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAllocationDialog({ open: false, request: null, dayTypes: {} })}>Cancel</Button>
                    <Button variant="contained" onClick={submitDayAllocations}>Save allocations</Button>
                </DialogActions>
            </Dialog>

            {/* Enhanced Leave Request Modal */}
            <EnhancedLeaveRequestModal
                open={viewDialog.open}
                onClose={() => setViewDialog({ open: false, request: null })}
                request={viewDialog.request}
                onStatusChange={handleStatusChange}
                onEdit={handleEdit}
                onDelete={handleDelete}
            />

            <Snackbar 
                open={snackbar.open && !isFormOpen} 
                autoHideDuration={4000} 
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert 
                    onClose={() => setSnackbar({ ...snackbar, open: false })} 
                    severity={snackbar.severity} 
                    sx={{ width: '100%' }} 
                    variant="filled"
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>

            {/* More Options Menu */}
            <Menu
                anchorEl={anchorEl}
                open={moreMenuOpen}
                onClose={handleMoreMenuClose}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
            >
                <MenuItem onClick={handleLeavesTrackerClick}>
                    <ListItemIcon>
                        <AssessmentIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Leaves Tracker</ListItemText>
                </MenuItem>
            </Menu>
        </div>
    );
};

export default AdminLeavesPage;





