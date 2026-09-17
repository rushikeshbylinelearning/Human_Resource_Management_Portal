// frontend/src/components/WeeklyTimeCards.jsx

import React, { memo } from 'react';
import { Box, Typography, Paper, Grid } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import WeekendIcon from '@mui/icons-material/Weekend';
import BeachAccessIcon from '@mui/icons-material/BeachAccess';
import { getISTNow, getISTDateString, getISTWeekRange, parseISTDate, formatISTDate, getISTDateParts } from '../utils/istTime';

const LEAVE_STATUS = { text: 'Leave', Icon: BeachAccessIcon, color: '#3b82f6' };

/** Normalize leave API values (ISO string, Date, or YYYY-MM-DD) to an IST date key without throwing. */
const toLeaveDateKey = (leaveDate) => {
    if (leaveDate == null || leaveDate === '') return null;

    // Plain YYYY-MM-DD with no time component — safe to use as-is
    if (typeof leaveDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) {
        return leaveDate;
    }

    // Everything else (ISO datetime strings, Date objects) must go through
    // IST conversion so UTC midnight vs IST midnight doesn't shift the day.
    const date = leaveDate instanceof Date ? leaveDate : new Date(leaveDate);
    if (Number.isNaN(date.getTime())) return null;

    return getISTDateString(date);
};

const isApprovedLeaveOnDate = (dateString, leaveRequests = []) => {
    return leaveRequests.some((req) => {
        if (req.status !== 'Approved' || !Array.isArray(req.leaveDates)) return false;
        return req.leaveDates.some((leaveDate) => toLeaveDateKey(leaveDate) === dateString);
    });
};

const isLeaveDay = (logForDay, dateString, leaveRequests) => {
    if (logForDay?.attendanceStatus === 'Leave' || logForDay?.leaveRequest) {
        return true;
    }
    return isApprovedLeaveOnDate(dateString, leaveRequests);
};

// Gets the current week days (Sun–Sat) in IST. Uses centralized IST utilities.
const getWeekDays = () => {
    const { startDateStr } = getISTWeekRange(getISTNow());
    const base = parseISTDate(startDateStr).getTime();
    const week = [];
    for (let i = 0; i < 7; i++) {
        week.push(new Date(base + i * 86400000));
    }
    return week;
};

// Check if a Saturday is a working day based on the employee's policy
const isWorkingSaturday = (date, saturdayPolicy) => {
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 6) return false; // Not a Saturday
    
    const weekNum = Math.ceil(date.getDate() / 7);
    
    switch (saturdayPolicy) {
        case 'All Saturdays Working':
            return true;
        case 'All Saturdays Off':
            return false;
        case 'Week 1 & 3 Off':
            return !(weekNum === 1 || weekNum === 3);
        case 'Week 2 & 4 Off':
            return !(weekNum === 2 || weekNum === 4);
        default:
            return true; // Default to working if policy is unclear
    }
};

// --- COMPONENT LOGIC ---

const WeeklyTimeCards = ({ logs, shift, user, leaveRequests = [] }) => {
    const todayDateString = getISTDateString(getISTNow());
    const weekDays = getWeekDays();
    
    // Get Saturday policy from shift, user, or default
    const saturdayPolicy = shift?.alternateSaturdayPolicy || user?.alternateSaturdayPolicy || 'All Saturdays Working';

    const getStatusForDay = (day, dayOfWeek) => {
        const dateString = getISTDateString(day);
        const logForDay = logs.find(log => log.attendanceDate === dateString);

        if (logForDay?.sessions?.length > 0) {
            return { text: 'Present', Icon: CheckCircleIcon, color: 'success.main' };
        }

        if (isLeaveDay(logForDay, dateString, leaveRequests)) {
            return LEAVE_STATUS;
        }

        if (logForDay) {
            return { text: 'Absent', Icon: HighlightOffIcon, color: 'error.main' };
        }
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return { text: 'Weekend', Icon: WeekendIcon, color: 'text.secondary' };
        }
        return { text: 'No Data', Icon: HelpOutlineIcon, color: 'text.disabled' };
    };

    return (
        <Box sx={{ mt: { xs: 0, sm: 2 } }}>
            <Paper elevation={0} sx={{ p: { xs: 1.5, sm: 2 }, backgroundColor: '#f8f9fa', borderRadius: '12px' }}>
                <Typography component="h2" variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5, fontSize: '0.9375rem', color: '#111827' }}>
                    Your Week
                </Typography>
                <Grid
                    container
                    spacing={0.5}
                    wrap="nowrap"
                    sx={{
                        overflowX: { xs: 'auto', sm: 'visible' },
                        pb: { xs: 0.75, sm: 0 },
                        scrollbarWidth: 'thin',
                        WebkitOverflowScrolling: 'touch',
                    }}
                >
                    {weekDays.map((day, index) => {
                        const dayString = getISTDateString(day);
                        const isToday = dayString === todayDateString;
                        const isSunday = index === 0; // Sunday is the first day (index 0)
                        const isSaturday = index === 6; // Saturday is the last day (index 6)
                        const isNonWorkingSaturday = isSaturday && !isWorkingSaturday(day, saturdayPolicy);
                        const isWeekendDay = isSunday || isNonWorkingSaturday;
                        const status = getStatusForDay(day, index);
                        const isLeaveDayCard = status.text === 'Leave';
                        const parts = getISTDateParts(day);

                        return (
                            <Grid
                                item
                                xs
                                key={index}
                                sx={{
                                    minWidth: { xs: '64px', sm: 0 },
                                    flex: { xs: '0 0 64px', sm: '1 1 0' },
                                }}
                            >
                                <Paper 
                                    elevation={isToday ? 3 : 0}
                                    sx={{
                                        px: 0.5,
                                        py: 1.5,
                                        textAlign: 'center',
                                        borderRadius: '10px',
                                        border: isToday ? '2px solid #3b82f6' : isWeekendDay ? '2px solid #fbbf24' : isLeaveDayCard ? '2px solid #93c5fd' : '2px solid transparent',
                                        transition: 'all 0.2s ease-in-out',
                                        backgroundColor: isToday ? '#eff6ff' : isWeekendDay ? '#fef3c7' : isLeaveDayCard ? '#eff6ff' : '#ffffff',
                                    }}
                                >
                                    <Typography variant="caption" sx={{ fontWeight: 400, fontSize: '0.6875rem', color: isWeekendDay ? '#92400e' : '#6b7280' }}>
                                        {formatISTDate(day, { weekday: 'short' })}
                                    </Typography>
                                    <Typography variant="h6" component="p" sx={{ fontWeight: 600, my: 0.5, fontSize: '1.125rem', color: isWeekendDay ? '#78350f' : '#111827' }}>
                                        {parts.day}
                                    </Typography>
                                    <status.Icon sx={{ color: isWeekendDay ? '#f59e0b' : status.color, fontSize: '1.25rem' }} />
                                    <Typography 
                                        variant="caption" 
                                        display="block" 
                                        sx={{ 
                                            fontWeight: 400, 
                                            fontSize: '0.6875rem',
                                            color: isToday ? '#1d4ed8' : isWeekendDay ? '#92400e' : isLeaveDayCard ? '#1d4ed8' : '#6b7280'
                                        }}
                                    >
                                        {status.text}
                                    </Typography>
                                </Paper>
                            </Grid>
                        );
                    })}
                </Grid>
            </Paper>
        </Box>
    );
};

export default WeeklyTimeCards;