// src/pages/AdminAttendanceSummaryPage.jsx - IST-ENFORCED, BACKEND-DRIVEN
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Typography, Alert, IconButton, Tooltip, Snackbar, Avatar, Menu, MenuItem, ListItemIcon, ListItemText, Autocomplete, TextField } from '@mui/material';
import {
    ChevronLeft as ChevronLeftIcon,
    ChevronRight as ChevronRightIcon,
    CalendarToday as CalendarTodayIcon,
    ViewList as ViewListIcon,
    ViewModule as ViewModuleIcon,
    CalendarMonth as CalendarMonthIcon,
    MoreVert as MoreVertIcon,
    People as PeopleIcon,
    Edit as EditIcon
} from '@mui/icons-material';
import api from '../api/axios';
import AttendanceTimeline from '../components/AttendanceTimeline';
import AttendanceCalendar from '../components/AttendanceCalendar';
import LogDetailModal from '../components/LogDetailModal';
import UniversalOverrideModal from '../components/UniversalOverrideModal';
import { 
    getISTNow, 
    getISTDateString, 
    parseISTDate, 
    getISTWeekRange, 
    getISTDateParts,
    formatDateRange as formatISTDateRange,
    formatISTDate,
    isSameISTDay
} from '../utils/istTime';
import {
    formatTimeForDisplay,
    formatDuration,
    getDisplayStatus
} from '../utils/attendanceRenderUtils';
import socket from '../socket';
import '../styles/AdminAttendanceSummaryPage.css';

import { SkeletonBox } from '../components/SkeletonLoaders';
import { filterActiveEmployees } from '../utils/employeeFilterUtils';
import BulkAttendanceAssistant from '../components/BulkAttendanceAssistant';
import usePermissions from '../hooks/usePermissions';
const AdminAttendanceSummaryPage = () => {
    const { canAccess } = usePermissions();
    const canUseBulkAssistant = canAccess.manageBulkAttendanceActions();
    const [employees, setEmployees] = useState([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [logs, setLogs] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingEmployees, setLoadingEmployees] = useState(true);
    const [error, setError] = useState('');
    const [currentDate, setCurrentDate] = useState(getISTNow());
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);
    const [selectedHoliday, setSelectedHoliday] = useState(null);
    const [selectedLeave, setSelectedLeave] = useState(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '' });
    const [anchorEl, setAnchorEl] = useState(null);
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const [viewMode, setViewMode] = useState('timeline');
    const [holidays, setHolidays] = useState([]);
    // Track data freshness for debugging (internal only - not displayed to users)
    const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
    const [overrideModalOpen, setOverrideModalOpen] = useState(false);

    // Socket refresh debounce timer
    const socketRefreshTimerRef = React.useRef(null);

    // Note: selectedHoliday and selectedLeave are used for modal display - kept for UI purposes

    const selectedEmployeeObject = useMemo(() => {
        return employees.find(emp => emp._id === selectedEmployeeId);
    }, [employees, selectedEmployeeId]);

    useEffect(() => {
        const fetchEmployees = async () => {
            try {
                // Do NOT pass includeInactive: deactivated employees must be hidden from attendance summary
                const { data } = await api.get('/admin/employees?all=true&slim=true');
                const activeEmployees = filterActiveEmployees(Array.isArray(data) ? data : [])
                    .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', undefined, { sensitivity: 'base' }));
                setEmployees(activeEmployees);
            } catch (err) {
                setError('Failed to fetch employee list. Please try again.');
            } finally {
                setLoadingEmployees(false);
            }
        };
        fetchEmployees();
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            const body = document.body;
            if (body) {
                body.style.transform = '';
                body.style.zoom = '';
                body.style.maxWidth = '';
                body.style.width = '';
            }
            const html = document.documentElement;
            if (html) {
                html.style.transform = '';
                html.style.zoom = '';
                html.style.maxWidth = '';
                html.style.width = '';
            }
        };
    }, []);

    const fetchLogsForWeek = useCallback(async (date, employeeId) => {
        if (!employeeId) return;
        setLoading(true);
        setError('');
        try {
            let startDate, endDate;
            
            if (viewMode === 'calendar') {
                // For calendar view, fetch entire month in IST
                const parts = getISTDateParts(date);
                const firstDay = parseISTDate(`${parts.year}-${String(parts.month).padStart(2, '0')}-01`);
                const lastDay = new Date(parts.year, parts.monthIndex + 1, 0);
                startDate = getISTDateString(firstDay);
                endDate = getISTDateString(lastDay);
            } else {
                // For timeline/list view, fetch current week in IST
                const weekRange = getISTWeekRange(date);
                startDate = weekRange.startDateStr;
                endDate = weekRange.endDateStr;
            }
            
            // Backend is single source of truth - includes all computed fields
            const summaryRes = await api.get(`/attendance/summary?startDate=${startDate}&endDate=${endDate}&userId=${employeeId}&includeHolidays=true`);
            
            // Handle response format
            let fetchedLogs, fetchedHolidays, fetchedSummary;
            if (Array.isArray(summaryRes.data)) {
                fetchedLogs = summaryRes.data;
                fetchedHolidays = [];
                fetchedSummary = null;
            } else {
                fetchedLogs = Array.isArray(summaryRes.data.logs) ? summaryRes.data.logs : [];
                fetchedHolidays = Array.isArray(summaryRes.data.holidays) ? summaryRes.data.holidays : [];
                fetchedSummary = summaryRes.data.summary || null;
            }
            
            setHolidays(fetchedHolidays);
            setSummary(fetchedSummary);
            
            // Backend provides all computed fields - no frontend processing needed
            // Only fix sessions without endTime for past dates (display only)
            const todayIST = getISTDateString(getISTNow());
            const processedLogs = fetchedLogs.map(log => {
                if (log.attendanceDate < todayIST && log.sessions) {
                    const updatedSessions = log.sessions.map(session => {
                        if (!session.endTime && session.startTime) {
                            return { ...session, endTime: session.startTime };
                        }
                        return session;
                    });
                    return { ...log, sessions: updatedSessions };
                }
                return log;
            });
            
            setLogs(processedLogs);
            // Update freshness timestamp when fresh data is received
            setLastUpdatedAt(Date.now());

        } catch (err) {
            setError('Failed to fetch attendance summary for the selected employee.');
            setLogs([]);
        } finally {
            setLoading(false);
        }
    }, [viewMode]);

    useEffect(() => {
        if (selectedEmployeeId) {
            fetchLogsForWeek(currentDate, selectedEmployeeId);
        } else {
            setLogs([]);
        }
    }, [currentDate, selectedEmployeeId, fetchLogsForWeek]);

    // Real-time sync: Listen for attendance and leave updates
    // Backend emits these events when attendance is logged, edited, or leave status changes
    useEffect(() => {
        if (!selectedEmployeeId) return;

        // Handle attendance log updates (clock-in, clock-out, admin overrides)
        const handleAttendanceUpdate = (data) => {
            // Verify event belongs to currently selected employee
            const isRelevantUpdate = (
                data.userId?.toString() === selectedEmployeeId ||
                data.userId?.toString() === selectedEmployeeId.toString()
            );

            if (isRelevantUpdate) {
                // Debounce refresh to avoid multiple rapid updates
                if (socketRefreshTimerRef.current) clearTimeout(socketRefreshTimerRef.current);
                socketRefreshTimerRef.current = setTimeout(() => {
                    fetchLogsForWeek(currentDate, selectedEmployeeId).catch(err => {
                        console.error('Failed to refresh after attendance update:', err);
                    });
                }, 3000);
            }
        };

        // Handle leave request updates (approval, rejection, date changes)
        const handleLeaveUpdate = (data) => {
            // Verify event belongs to currently selected employee
            const isRelevantUpdate = (
                data.employeeId?.toString() === selectedEmployeeId ||
                data.employeeId?.toString() === selectedEmployeeId.toString()
            );

            if (isRelevantUpdate) {
                // Debounce refresh to avoid multiple rapid updates
                if (socketRefreshTimerRef.current) clearTimeout(socketRefreshTimerRef.current);
                socketRefreshTimerRef.current = setTimeout(() => {
                    fetchLogsForWeek(currentDate, selectedEmployeeId).catch(err => {
                        console.error('Failed to refresh after leave update:', err);
                    });
                }, 3000);
            }
        };

        // Register socket listeners
        socket.on('attendance_log_updated', handleAttendanceUpdate);
        socket.on('leave_request_updated', handleLeaveUpdate);

        // Cleanup on unmount or when dependencies change
        return () => {
            if (socketRefreshTimerRef.current) clearTimeout(socketRefreshTimerRef.current);
            socket.off('attendance_log_updated', handleAttendanceUpdate);
            socket.off('leave_request_updated', handleLeaveUpdate);
        };
    }, [selectedEmployeeId, currentDate, fetchLogsForWeek]);

    const handleWeekChange = (direction) => {
        setCurrentDate(prevDate => {
            const prevIST = parseISTDate(prevDate instanceof Date ? getISTDateString(prevDate) : prevDate);
            const parts = getISTDateParts(prevIST);
            
            if (viewMode === 'calendar') {
                // Navigate by month in IST
                if (direction === 'prev') {
                    const newMonth = parts.monthIndex === 0 ? 12 : parts.monthIndex;
                    const newYear = parts.monthIndex === 0 ? parts.year - 1 : parts.year;
                    return parseISTDate(`${newYear}-${String(newMonth).padStart(2, '0')}-01`);
                } else {
                    const newMonth = parts.monthIndex === 11 ? 1 : parts.monthIndex + 2;
                    const newYear = parts.monthIndex === 11 ? parts.year + 1 : parts.year;
                    return parseISTDate(`${newYear}-${String(newMonth).padStart(2, '0')}-01`);
                }
            } else {
                // Navigate by week in IST
                const weekRange = getISTWeekRange(prevIST);
                const daysToAdd = direction === 'prev' ? -7 : 7;
                const newDate = new Date(weekRange.startDate);
                newDate.setDate(newDate.getDate() + daysToAdd);
                return parseISTDate(getISTDateString(newDate));
            }
        });
    };
    
    const handleEmployeeChange = (_event, emp) => {
        setLogs([]);
        setSelectedEmployeeId(emp?._id || '');
    };

    const formatEmployeeLabel = (emp) => {
        if (!emp) return '';
        const name = emp.fullName || '';
        return emp.employeeCode ? `${name} (${emp.employeeCode})` : name;
    };

    const handleDayClick = (dayData) => {
        setSelectedLog(dayData.log || null);
        setSelectedDate(dayData.date);
        setSelectedHoliday(dayData.holiday || null);
        setSelectedLeave(dayData.leave || null);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedLog(null);
        setSelectedDate(null);
        setSelectedHoliday(null);
        setSelectedLeave(null);
    };

    const handleMoreMenuClick = (event) => {
        setAnchorEl(event.currentTarget);
        setMoreMenuOpen(true);
    };

    const handleMoreMenuClose = () => {
        setAnchorEl(null);
        setMoreMenuOpen(false);
    };

    const handleMusterRollClick = () => {
        handleMoreMenuClose();
        window.location.href = '/employee-muster-roll';
    };

    const handleOverrideAttendanceClick = () => {
        handleMoreMenuClose();
        setOverrideModalOpen(true);
    };

    const handleSaveLog = async (logId, updatedData) => {
        try {
            if (!logId) {
                throw new Error('Attendance log ID is missing. Cannot save changes.');
            }

            await api.put(`/admin/attendance/log/${logId}`, updatedData);
            
            setSnackbar({ open: true, message: 'Log updated successfully!' });
            handleCloseModal();
            fetchLogsForWeek(currentDate, selectedEmployeeId);
        } catch (err) {
            let errorMessage = 'Failed to save changes. Please try again.';
            
            if (err?.response?.data) {
                errorMessage = err.response.data.message || err.response.data.error || errorMessage;
            } else if (err?.message) {
                errorMessage = err.message;
            }

            setError(errorMessage);
            setSnackbar({ 
                open: true, 
                message: errorMessage, 
                severity: 'error' 
            });
        }
    };

    // Format date range using IST utilities
    const formatDateRange = (date) => {
        return formatISTDateRange(date, viewMode === 'calendar');
    };

    // Format attendance data for admin list view - BACKEND PROVIDES ALL FIELDS
    const formatAdminAttendanceDataForList = () => {
        if (!logs || logs.length === 0) return [];
        
        // Generate week days in IST
        const weekRange = getISTWeekRange(currentDate);
        const weekDays = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(weekRange.startDate);
            date.setDate(date.getDate() + i);
            weekDays.push(parseISTDate(getISTDateString(date)));
        }
        
        return weekDays.map(date => {
            const dateKey = getISTDateString(date);
            const log = logs.find(l => l.attendanceDate === dateKey);
            
            // Format this row's date for display (IST) - not the week range
            const dateString = formatISTDate(date);
            
            // Use backend computed fields - NO RECALCULATION
            const firstIn = log?.firstIn ? formatTimeForDisplay(log.firstIn) : '-';
            const lastOut = log?.lastOut ? formatTimeForDisplay(log.lastOut) : '-';
            const totalHours = log?.totalWorkedMinutes ? formatDuration(log.totalWorkedMinutes) : '-';
            const paidBreak = log?.breaksSummary?.paid ? formatDuration(log.breaksSummary.paid) : '00:00';
            const unpaidBreak = log?.breaksSummary?.unpaid ? formatDuration(log.breaksSummary.unpaid) : '00:00';
            const payableHours = log?.payableMinutes ? formatDuration(log.payableMinutes) : '-';
            
            // Get status from backend via shared utility
            const statusInfo = getDisplayStatus(log, log?.holidayInfo, log?.leaveInfo);
            
            const shift = selectedEmployeeObject?.shiftGroup?.shiftName || 'Morning';
            
            return {
                date: dateString,
                firstIn,
                lastOut,
                totalHours,
                paidBreak,
                unpaidBreak,
                payableHours,
                status: statusInfo.status,
                statusColor: statusInfo.color,
                shift,
                halfDayReason: log?.halfDayReason || null,
                halfDayReasonCode: log?.halfDayReasonCode || null,
                lateMinutes: log?.lateMinutes ?? 0,
                overriddenByAdmin: log?.overriddenByAdmin || false,
                overrideReason: log?.overrideReason || null
            };
        });
    };

    const renderTimelineContent = () => {
        if (!selectedEmployeeId) {
            return (
                <div className="timeline-placeholder">
                    <Alert severity="info">
                        Please select an employee to view their attendance summary.
                    </Alert>
                </div>
            );
        }

        if (viewMode === 'list') {
            return (
                <div className="attendance-list-container">
                    <div className="attendance-table">
                        <div className="table-header">
                            <div className="table-cell">Date</div>
                            <div className="table-cell">First In</div>
                            <div className="table-cell">Last Out</div>
                            <div className="table-cell">Total Hours</div>
                            <div className="table-cell">Paid break</div>
                            <div className="table-cell">Unpaid break</div>
                            <div className="table-cell">Payable Hours</div>
                            <div className="table-cell">Status</div>
                            <div className="table-cell">Shift(s)</div>
                            <div className="table-cell">Regularization</div>
                        </div>
                        
                        {formatAdminAttendanceDataForList().map((row, index) => (
                            <div key={index} className="table-row">
                                <div className="table-cell" data-label="Date">{row.date}</div>
                                <div className="table-cell" data-label="First In">{row.firstIn}</div>
                                <div className="table-cell" data-label="Last Out">{row.lastOut}</div>
                                <div className="table-cell" data-label="Total Hours">{row.totalHours}</div>
                                <div className="table-cell" data-label="Paid Break">{row.paidBreak}</div>
                                <div className="table-cell" data-label="Unpaid Break">{row.unpaidBreak}</div>
                                <div className="table-cell" data-label="Payable Hours">{row.payableHours}</div>
                                <div className="table-cell" data-label="Status">
                                    <div className="status-cell">
                                        <div 
                                            className="status-indicator" 
                                            style={{ backgroundColor: row.statusColor }}
                                        ></div>
                                        <span>{row.status}</span>
                                        {row.overriddenByAdmin === true && typeof row.overrideReason === 'string' && row.overrideReason.trim().length > 0 && (
                                            <div className="override-note-display" style={{ fontSize: '0.7rem', color: '#856404', marginTop: '2px' }} title={row.overrideReason.trim()}>
                                                <span style={{ fontWeight: 600 }}>Overridden</span>
                                                {' — '}{(row.overrideReason.trim()).length > 28 ? `${(row.overrideReason.trim()).substring(0, 28)}…` : row.overrideReason.trim()}
                                            </div>
                                        )}
                                        {!(row.overriddenByAdmin === true && typeof row.overrideReason === 'string' && row.overrideReason.trim().length > 0) && (row.status.includes('Half') || row.status === 'Half-day') && (
                                            <div className="half-day-summary-secondary" style={{ fontSize: '0.7rem', color: '#666', marginTop: '2px' }}>
                                                {row.halfDayReasonCode === 'LATE_LOGIN' ? `Late Arrival — Late by ${Number(row.lateMinutes) || 0} minutes` : 'Incomplete hours'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="table-cell" data-label="Shift(s)">{row.shift}</div>
                                <div className="table-cell" data-label="Regularization">-</div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        if (viewMode === 'calendar') {
            return (
                <AttendanceCalendar
                    logs={logs}
                    currentDate={currentDate}
                    onDayClick={handleDayClick}
                />
            );
        }

        const mappedShiftInfo = selectedEmployeeObject?.shiftGroup 
            ? {
                name: selectedEmployeeObject.shiftGroup.shiftName,
                startTime: selectedEmployeeObject.shiftGroup.startTime,
                endTime: selectedEmployeeObject.shiftGroup.endTime
              } 
            : null;

        return (
             <div className="timeline-container">
                {loading && (
                    <div className="loading-overlay">
                        <SkeletonBox width="24px" height="24px" borderRadius="50%" />
                    </div>
                )}
                <div className={`timeline-wrapper ${loading ? 'loading' : ''}`}>
                    <AttendanceTimeline
                        logs={logs}
                        currentDate={currentDate}
                        onDayClick={handleDayClick}
                        isAdminView={true}
                        saturdayPolicy={selectedEmployeeObject?.alternateSaturdayPolicy || 'All Saturdays Working'}
                        shiftInfo={mappedShiftInfo}
                        holidays={holidays}
                        summary={summary}
                    />
                </div>
            </div>
        );
    };

    return (
        <>
            <div className="admin-attendance-summary-page">
                <header className="summary-header">
                    <div className="header-left">
                        <Typography variant="h4" component="h1" className="summary-title">
                            Employee Attendance
                        </Typography>
                    </div>
                    
                    <div className="header-center">
                        <div className="date-range-selector">
                            <IconButton 
                                size="small" 
                                onClick={() => handleWeekChange('prev')}
                                className="nav-button"
                            >
                                <ChevronLeftIcon />
                            </IconButton>
                            <CalendarTodayIcon className="calendar-icon" />
                            <Typography variant="body2" className="date-range-text">
                                {formatDateRange(currentDate)}
                            </Typography>
                            <IconButton 
                                size="small" 
                                onClick={() => handleWeekChange('next')}
                                className="nav-button"
                            >
                                <ChevronRightIcon />
                            </IconButton>
                        </div>
                    </div>
                    
                    <div className="header-right">
                        <div className="employee-selector-inline">
                            <Autocomplete
                                className="employee-select"
                                options={employees}
                                value={selectedEmployeeObject || null}
                                onChange={handleEmployeeChange}
                                disabled={loadingEmployees}
                                loading={loadingEmployees}
                                autoHighlight
                                clearOnEscape
                                getOptionLabel={formatEmployeeLabel}
                                isOptionEqualToValue={(option, value) => option?._id === value?._id}
                                filterOptions={(options, { inputValue }) => {
                                    const q = inputValue.trim().toLowerCase();
                                    if (!q) return options;
                                    return options.filter((emp) =>
                                        (emp.fullName || '').toLowerCase().includes(q) ||
                                        (emp.employeeCode || '').toLowerCase().includes(q)
                                    );
                                }}
                                slotProps={{
                                    popper: { className: 'admin-summary-employee-popper' },
                                    paper: { className: 'admin-summary-employee-paper' },
                                    listbox: { className: 'admin-summary-employee-listbox' },
                                }}
                                renderOption={(props, option) => {
                                    const { key, ...optionProps } = props;
                                    return (
                                        <li key={key} {...optionProps} className={`${optionProps.className || ''} employee-option`}>
                                            <Avatar
                                                className="employee-option-avatar"
                                                src={option.profileImageUrl || undefined}
                                                alt=""
                                            >
                                                {(option.fullName || '?').charAt(0).toUpperCase()}
                                            </Avatar>
                                            <span className="employee-option-text">
                                                {option.fullName}
                                                {option.employeeCode ? (
                                                    <span className="employee-option-code"> ({option.employeeCode})</span>
                                                ) : null}
                                            </span>
                                        </li>
                                    );
                                }}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Select Employee"
                                        size="small"
                                        placeholder="Search by name or ID"
                                    />
                                )}
                            />
                        </div>
                        
                        <div className="action-icons">
                            <Tooltip title="List View">
                                <IconButton 
                                    size="small" 
                                    onClick={() => setViewMode('list')}
                                    color={viewMode === 'list' ? 'primary' : 'default'}
                                >
                                    <ViewListIcon />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Timeline View">
                                <IconButton 
                                    size="small" 
                                    onClick={() => setViewMode('timeline')}
                                    color={viewMode === 'timeline' ? 'primary' : 'default'}
                                >
                                    <ViewModuleIcon />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Calendar View">
                                <IconButton 
                                    size="small" 
                                    onClick={() => setViewMode('calendar')}
                                    color={viewMode === 'calendar' ? 'primary' : 'default'}
                                >
                                    <CalendarMonthIcon />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="More Options">
                                <IconButton size="small" onClick={handleMoreMenuClick}>
                                    <MoreVertIcon />
                                </IconButton>
                            </Tooltip>
                        </div>
                    </div>
                </header>
                
                {error && <Alert severity="error" className="error-alert">{error}</Alert>}
                
                {renderTimelineContent()}
            </div>
            
            <LogDetailModal
                open={isModalOpen}
                onClose={handleCloseModal}
                log={selectedLog}
                date={selectedDate}
                isAdmin={true}
                onSave={handleSaveLog}
                onRefresh={() => fetchLogsForWeek(currentDate, selectedEmployeeId)}
                holiday={selectedHoliday}
                leave={selectedLeave}
            />
             <Snackbar 
                open={snackbar.open} 
                autoHideDuration={4000} 
                onClose={() => setSnackbar({ ...snackbar, open: false })} 
                message={snackbar.message} 
            />

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
                <MenuItem onClick={handleOverrideAttendanceClick}>
                    <ListItemIcon>
                        <EditIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Override Attendance</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleMusterRollClick}>
                    <ListItemIcon>
                        <PeopleIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Employee Muster Roll</ListItemText>
                </MenuItem>
            </Menu>

            <UniversalOverrideModal
                open={overrideModalOpen}
                onClose={() => setOverrideModalOpen(false)}
                employees={employees}
                onSuccess={async (data) => {
                    setSnackbar({ open: true, message: data?.message || 'Override applied successfully.' });
                    if (selectedEmployeeId) fetchLogsForWeek(currentDate, selectedEmployeeId);
                }}
            />

            {canUseBulkAssistant && (
                <BulkAttendanceAssistant
                    onActionComplete={() => {
                        if (selectedEmployeeId) fetchLogsForWeek(currentDate, selectedEmployeeId);
                    }}
                />
            )}

        </>
    );
};

export default AdminAttendanceSummaryPage;
