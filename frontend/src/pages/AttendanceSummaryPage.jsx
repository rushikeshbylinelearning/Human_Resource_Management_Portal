// src/pages/AttendanceSummaryPage.jsx - IST-ENFORCED, BACKEND-DRIVEN
import { useState, useEffect, useCallback, useRef } from 'react';
import { Typography, Alert, IconButton, Tooltip, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';
import {
    ChevronLeft as ChevronLeftIcon,
    ChevronRight as ChevronRightIcon,
    CalendarToday as CalendarTodayIcon,
    ViewList as ViewListIcon,
    ViewModule as ViewModuleIcon,
    CalendarMonth as CalendarMonthIcon,
    MoreVert as MoreVertIcon
} from '@mui/icons-material';
import api from '../api/axios';
import AttendanceTimeline from '../components/AttendanceTimeline';
import AttendanceCalendar from '../components/AttendanceCalendar';
import LogDetailModal from '../components/LogDetailModal';
import UserLogModal from '../components/UserLogModal';
import { useAuth } from '../context/AuthContext';
import { 
    getISTNow, 
    getISTDateString, 
    parseISTDate, 
    getISTWeekRange, 
    getISTDateParts,
    formatDateRange as formatISTDateRange,
    formatISTDate
} from '../utils/istTime';
import {
    formatTimeForDisplay,
    formatDuration,
    getDisplayStatus
} from '../utils/attendanceRenderUtils';
import socket from '../socket';
import '../styles/AdminAttendanceSummaryPage.css';

import { SkeletonBox } from '../components/SkeletonLoaders';
const AttendanceSummaryPage = () => {
    const { user } = useAuth();
    const [logs, setLogs] = useState([]);
    const [holidays, setHolidays] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [currentDate, setCurrentDate] = useState(getISTNow());
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);
    const [selectedHoliday, setSelectedHoliday] = useState(null);
    const [selectedLeave, setSelectedLeave] = useState(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '' });
    const [viewMode, setViewMode] = useState('timeline');
    const [notesModal, setNotesModal] = useState({ open: false, logId: null, notes: '', date: '' });
    // Track data freshness for debugging (internal only - not displayed to users)
    const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

    // Socket refresh debounce timer
    const socketRefreshTimerRef = useRef(null);

    const fetchLogsForWeekRef = useRef(null);
    
    // Create stable fetch function using IST utilities
    fetchLogsForWeekRef.current = async (date) => {
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
            const summaryRes = await api.get(`/attendance/summary?startDate=${startDate}&endDate=${endDate}&includeHolidays=true`);
            
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
            
            setLogs(fetchedLogs);
            setHolidays(fetchedHolidays);
            setSummary(fetchedSummary);
            // Update freshness timestamp when fresh data is received
            setLastUpdatedAt(Date.now());

        } catch (err) {
            setError('Failed to fetch attendance summary.');
            setLogs([]);
        } finally {
            setLoading(false);
        }
    };
    
    const fetchLogsForWeek = useCallback((date) => {
        return fetchLogsForWeekRef.current?.(date);
    }, [viewMode]);

    useEffect(() => {
        if (fetchLogsForWeekRef.current) {
            fetchLogsForWeekRef.current(currentDate);
        }
    }, [currentDate, viewMode]);

    // Socket.IO listener for real-time updates (approval, rejection, and deletion)
    // Backend emits leave_request_updated with employeeId when a leave is updated or deleted
    useEffect(() => {
        if (!user) return;

        const handleLeaveUpdate = (data) => {
            const isRelevantUpdate = (
                data.employeeId?.toString() === user.id?.toString() ||
                data.employeeId?.toString() === user._id?.toString() ||
                data.employeeId === user.id ||
                data.employeeId === user._id
            );

            if (isRelevantUpdate) {
                // Debounce refresh to avoid multiple rapid updates
                if (socketRefreshTimerRef.current) clearTimeout(socketRefreshTimerRef.current);
                socketRefreshTimerRef.current = setTimeout(() => {
                    if (fetchLogsForWeekRef.current) {
                        fetchLogsForWeekRef.current(currentDate).catch(err => {
                            console.error('Failed to refresh after leave update:', err);
                        });
                    }
                }, 3000);
            }
        };

        const handleAttendanceUpdate = (data) => {
            // Verify event belongs to logged-in employee
            // Handles both regular attendance and admin overrides (both emit attendance_log_updated)
            const isRelevantUpdate = (
                data.userId?.toString() === user.id?.toString() ||
                data.userId?.toString() === user._id?.toString() ||
                data.userId === user.id ||
                data.userId === user._id
            );

            if (isRelevantUpdate) {
                // Debounce refresh to avoid multiple rapid updates
                if (socketRefreshTimerRef.current) clearTimeout(socketRefreshTimerRef.current);
                socketRefreshTimerRef.current = setTimeout(() => {
                    if (fetchLogsForWeekRef.current) {
                        fetchLogsForWeekRef.current(currentDate).catch(err => {
                            console.error('Failed to refresh after attendance update:', err);
                        });
                    }
                }, 3000);
            }
        };

        socket.on('leave_request_updated', handleLeaveUpdate);
        socket.on('attendance_log_updated', handleAttendanceUpdate);

        return () => {
            if (socketRefreshTimerRef.current) clearTimeout(socketRefreshTimerRef.current);
            socket.off('leave_request_updated', handleLeaveUpdate);
            socket.off('attendance_log_updated', handleAttendanceUpdate);
        };
    }, [user?.id, user?._id, currentDate]);

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

    const handleSaveLog = (updatedLog) => {
        setLogs(prevLogs => 
            prevLogs.map(log => 
                log._id === updatedLog._id ? updatedLog : log
            )
        );
        setSnackbar({ open: true, message: 'Log updated successfully!' });
    };

    const handleEditNotes = (logId, currentNotes) => {
        if (!logId) {
            setSnackbar({ open: true, message: 'Cannot add notes for future dates without attendance data.' });
            return;
        }
        
        const log = logs.find(l => l._id === logId);
        let dateStr = '';
        if (log) {
            const dateObj = parseISTDate(log.attendanceDate);
            dateStr = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Kolkata',
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            }).format(dateObj).replace(/,/g, '');
        }
        
        setNotesModal({
            open: true,
            logId: logId,
            notes: currentNotes,
            date: dateStr
        });
    };

    const handleSaveNotes = async () => {
        if (!notesModal.logId) return;
        
        try {
            await api.patch(`/attendance/log/${notesModal.logId}/note`, {
                notes: notesModal.notes
            });
            
            setLogs(prevLogs =>
                prevLogs.map(log =>
                    log._id === notesModal.logId
                        ? { ...log, notes: notesModal.notes, earlyCheckoutNote: notesModal.notes }
                        : log
                )
            );
            
            setNotesModal({ open: false, logId: null, notes: '', date: '' });
            setSnackbar({ open: true, message: 'Notes saved successfully!' });
        } catch (error) {
            console.error('Error saving notes:', error);
            setSnackbar({ open: true, message: 'Failed to save notes. Please try again.' });
        }
    };

    const handleCloseNotesModal = () => {
        setNotesModal({ open: false, logId: null, notes: '', date: '' });
    };

    // Format date range using IST utilities
    const formatDateRange = (date) => {
        return formatISTDateRange(date, viewMode === 'calendar');
    };

    // Format attendance data for list view - BACKEND PROVIDES ALL FIELDS
    const formatAttendanceDataForList = () => {
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
            
            const shift = user?.shiftGroup?.shiftName || 'Morning';
            
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
                notes: log?.notes || log?.earlyCheckoutNote || '',
                logId: log?._id || null,
                halfDayReason: log?.halfDayReason || null,
                halfDayReasonCode: log?.halfDayReasonCode || null,
                lateMinutes: log?.lateMinutes ?? 0,
                overriddenByAdmin: log?.overriddenByAdmin || false,
                overrideReason: log?.overrideReason || null
            };
        });
    };

    const renderTimelineContent = () => {
        // Map shift info from user object
        const mappedShiftInfo = user?.shiftGroup 
            ? {
                name: user.shiftGroup.shiftName,
                startTime: user.shiftGroup.startTime,
                endTime: user.shiftGroup.endTime
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
                        isAdminView={false}
                        saturdayPolicy={user?.alternateSaturdayPolicy || 'All Saturdays Working'}
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
                            Attendance Summary
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
                        </div>
                    </div>
                </header>
                
                {error && <Alert severity="error" className="error-alert">{error}</Alert>}
                
                {viewMode === 'timeline' ? (
                    renderTimelineContent()
                ) : viewMode === 'list' ? (
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
                            
                            {formatAttendanceDataForList().map((row, index) => (
                                <div key={index} className="table-row">
                                    <div className="table-cell">{row.date}</div>
                                    <div className="table-cell">{row.firstIn}</div>
                                    <div className="table-cell">{row.lastOut}</div>
                                    <div className="table-cell">{row.totalHours}</div>
                                    <div className="table-cell">{row.paidBreak}</div>
                                    <div className="table-cell">{row.unpaidBreak}</div>
                                    <div className="table-cell">{row.payableHours}</div>
                                    <div className="table-cell">
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
                                    <div className="table-cell">{row.shift}</div>
                                    <div className="table-cell">
                                        {row.notes ? (
                                            <div className="notes-cell">
                                                <span className="notes-text" title={row.notes}>
                                                    {row.notes.length > 20 ? `${row.notes.substring(0, 20)}...` : row.notes}
                                                </span>
                                                {user && ['Admin', 'HR'].includes(user.role) && (
                                                    <button 
                                                        className="edit-notes-btn"
                                                        onClick={() => handleEditNotes(row.logId, row.notes)}
                                                        title="Edit notes"
                                                    >
                                                        ✏️
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            user && ['Admin', 'HR'].includes(user.role) ? (
                                                <button 
                                                    className="add-notes-btn"
                                                    onClick={() => handleEditNotes(row.logId, '')}
                                                    title="Add notes"
                                                >
                                                    + Add
                                                </button>
                                            ) : (
                                                <span className="notes-text" style={{ color: '#999' }}>—</span>
                                            )
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <AttendanceCalendar
                        logs={logs}
                        currentDate={currentDate}
                        onDayClick={handleDayClick}
                    />
                )}
            </div>
            
            {user && ['Admin', 'HR'].includes(user.role) ? (
                <LogDetailModal
                    open={isModalOpen}
                    onClose={handleCloseModal}
                    log={selectedLog}
                    date={selectedDate}
                    isAdmin={true}
                    onSave={handleSaveLog}
                    onRefresh={() => fetchLogsForWeek(currentDate)}
                    holiday={selectedHoliday}
                    leave={selectedLeave}
                />
            ) : (
                <UserLogModal
                    open={isModalOpen}
                    onClose={handleCloseModal}
                    log={selectedLog}
                    date={selectedDate}
                    loading={false}
                    holiday={selectedHoliday}
                    leave={selectedLeave}
                />
            )}
            <Snackbar 
                open={snackbar.open} 
                autoHideDuration={3000} 
                onClose={() => setSnackbar({ open: false, message: '' })}
                message={snackbar.message}
            />
            
            <Dialog 
                open={notesModal.open} 
                onClose={handleCloseNotesModal}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    Add Notes - {notesModal.date}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Notes"
                        fullWidth
                        multiline
                        rows={4}
                        variant="outlined"
                        value={notesModal.notes}
                        onChange={(e) => setNotesModal(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Enter your notes for this date..."
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseNotesModal}>
                        Cancel
                    </Button>
                    <Button onClick={handleSaveNotes} variant="contained">
                        Save Notes
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default AttendanceSummaryPage;
