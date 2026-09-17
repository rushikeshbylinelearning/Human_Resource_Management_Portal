// frontend/src/components/SaturdaySchedule.jsx
import React, { useMemo } from 'react';
import { Typography, Box, Stack, Avatar } from '@mui/material';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import WorkHistoryIcon from '@mui/icons-material/WorkHistory';
import BeachAccessIcon from '@mui/icons-material/BeachAccess';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { green, blue, grey } from '@mui/material/colors';

const getNthDayOfMonth = (date, dayOfWeek, n) => {
    const newDate = new Date(date.getTime());
    newDate.setDate(1);
    const firstDay = newDate.getDay();
    let day = dayOfWeek - firstDay + 1;
    if (day <= 0) day += 7;
    const nthDate = day + (n - 1) * 7;
    if (nthDate > new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate()) return null;
    newDate.setDate(nthDate);
    return newDate;
};

const getStatusProps = (status) => {
    if (status.includes('Approved')) return { text: 'On Leave', Icon: BeachAccessIcon, avatarBg: blue[100], iconColor: blue[800] };
    switch (status) {
        case 'Working': return { text: 'Working Day', Icon: WorkHistoryIcon, avatarBg: green[100], iconColor: green[800] };
        default: return { text: 'Week off', Icon: EventBusyIcon, avatarBg: grey[200], iconColor: grey[800] };
    }
};

const SaturdaySchedule = ({ policy, requests = [], count = 4, variant }) => {
    const schedule = useMemo(() => {
        const approvedRequestsMap = new Map();
        if (requests) {
            requests.forEach(req => {
                if (req.status === 'Approved' && req.leaveDates) {
                    const dateKey = typeof req.leaveDates[0] === 'string' && req.leaveDates[0].includes('-')
                        ? req.leaveDates[0]
                        : new Date(req.leaveDates[0]).toISOString().split('T')[0];
                    approvedRequestsMap.set(dateKey, req);
                }
            });
        }
        const upcomingSaturdays = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let monthOffset = 0;
        while (upcomingSaturdays.length < count) {
            const targetDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
            for (let n = 1; n <= 5; n++) {
                const sat = getNthDayOfMonth(targetDate, 6, n);
                if (sat && sat >= today && upcomingSaturdays.length < count) {
                    const dateString = sat.toISOString().split('T')[0];
                    const weekNum = n;
                    let finalStatus;
                    const approvedRequest = approvedRequestsMap.get(dateString);
                    if (approvedRequest) {
                        finalStatus = `${approvedRequest.requestType} Approved`;
                    } else {
                        let isWorkingDay = true;
                        if (policy === 'All Saturdays Off') { isWorkingDay = false; }
                        else if (policy === 'Week 1 & 3 Off' && (weekNum === 1 || weekNum === 3)) { isWorkingDay = false; }
                        else if (policy === 'Week 2 & 4 Off' && (weekNum === 2 || weekNum === 4)) { isWorkingDay = false; }
                        finalStatus = isWorkingDay ? 'Working' : 'Off';
                    }
                    upcomingSaturdays.push({ date: sat, status: finalStatus });
                }
            }
            monthOffset++;
            if (monthOffset > 12) break;
        }
        return upcomingSaturdays;
    }, [policy, requests, count]);

    // Vector-list style: same as Company Holidays (card list with icon, title, subtitle)
    if (variant === 'vector-list') {
        return (
            <ul className="vector-list">
                {schedule.map(({ date, status }) => {
                    const { text } = getStatusProps(status);
                    const isWorking = status === 'Working';
                    const Icon = isWorking ? WorkHistoryIcon : CalendarTodayIcon;
                    return (
                        <li key={date.toISOString()} className="vector-item">
                            <div className="vector-icon">
                                <Icon sx={{ fontSize: 20 }} />
                            </div>
                            <div className="vector-text">
                                <Typography className="vector-title">
                                    {date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                                </Typography>
                                <Typography className="vector-subtitle">{text}</Typography>
                            </div>
                        </li>
                    );
                })}
            </ul>
        );
    }

    return (
        <Stack spacing={1.25}>
            {schedule.map(({ date, status }) => {
                const { text, Icon, avatarBg, iconColor } = getStatusProps(status);
                return (
                    <Box 
                        key={date.toISOString()} 
                        sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 1.25,
                            py: 0.5
                        }}
                    >
                        <Avatar 
                            sx={{ 
                                bgcolor: avatarBg, 
                                color: iconColor, 
                                width: 32, 
                                height: 32 
                            }}
                        >
                            <Icon sx={{ fontSize: 16 }} />
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography 
                                variant="body2" 
                                sx={{ 
                                    fontWeight: 600, 
                                    color: '#111827', 
                                    fontSize: '0.8125rem',
                                    lineHeight: 1.4,
                                    mb: 0.25
                                }}
                            >
                                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </Typography>
                            <Typography 
                                variant="caption" 
                                sx={{ 
                                    fontWeight: 400, 
                                    color: '#4b5563', 
                                    fontSize: '0.6875rem',
                                    lineHeight: 1.3
                                }}
                            >
                                {text}
                            </Typography>
                        </Box>
                    </Box>
                );
            })}
        </Stack>
    );
};
export default SaturdaySchedule;