// frontend/src/components/RecentActivityCard.jsx

import React, { useMemo, useEffect, useState } from 'react';
import { Typography, Paper } from '@mui/material';
import { formatISTTime } from '../utils/istTime';
import '../styles/RecentActivityCard.css';

import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import FreeBreakfastIcon from '@mui/icons-material/FreeBreakfast';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';

const formatTime = (dateString) => {
    if (!dateString) return '';
    return formatISTTime(dateString, { hour: '2-digit', minute: '2-digit', hour12: true });
};

const getActivityProps = (type) => {
    switch (type) {
        case 'Clock In':
            return { icon: <LoginIcon fontSize="small" />, color: 'success' };
        case 'Clock Out':
            return { icon: <LogoutIcon fontSize="small" />, color: 'error' };
        case 'Break Started':
            return { icon: <PauseCircleOutlineIcon fontSize="small" />, color: 'warning' };
        case 'Break Ended':
            return { icon: <PlayCircleOutlineIcon fontSize="small" />, color: 'info' };
        default:
            return { icon: <FreeBreakfastIcon fontSize="small" />, color: 'grey' };
    }
};

const RecentActivityCard = ({ dailyData }) => {
    const [isVisible, setIsVisible] = useState(false);

    const activities = useMemo(() => {
        if (!dailyData) return [];

        const allActivities = [];

        dailyData.sessions?.forEach(session => {
            if (session.startTime) {
                allActivities.push({ type: 'Clock In', timestamp: session.startTime });
            }
            if (session.endTime) {
                allActivities.push({ type: 'Clock Out', timestamp: session.endTime });
            }
        });

        dailyData.breaks?.forEach(br => {
            if (br.startTime) {
                allActivities.push({ type: 'Break Started', timestamp: br.startTime, details: `(${br.breakType})` });
            }
            if (br.endTime) {
                allActivities.push({ type: 'Break Ended', timestamp: br.endTime, details: `(${br.breakType})` });
            }
        });

        return allActivities
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5);

    }, [dailyData]);

    useEffect(() => {
        setIsVisible(false);
        const timer = setTimeout(() => setIsVisible(true), 10);
        return () => clearTimeout(timer);
    }, [activities.length]);

    return (
        <Paper elevation={3} sx={{ p: 2.5, borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
            <Typography component="h2" variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: '0.025em', color: '#333333', fontSize: '0.9375rem' }}>Recent Activity</Typography>
            {activities.length > 0 ? (
                <ul className="activity-timeline">
                    {activities.map((activity, index) => {
                        const { icon, color } = getActivityProps(activity.type);
                        return (
                            <li
                                key={`${activity.type}-${activity.timestamp}-${index}`}
                                className={`activity-item ${isVisible ? 'visible' : ''}`}
                                style={{ transitionDelay: `${index * 30}ms` }}
                            >
                                <div className="activity-rail">
                                    <div className={`activity-dot activity-dot--${color}`}>{icon}</div>
                                    {index < activities.length - 1 && <div className="activity-connector" />}
                                </div>
                                <div className="activity-content">
                                    <Typography variant="body2" component="span" sx={{ fontWeight: 500, letterSpacing: '0.025em' }}>
                                        {activity.type}
                                    </Typography>
                                    {activity.details && (
                                        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, fontWeight: 400, letterSpacing: '0.025em' }}>
                                            {activity.details}
                                        </Typography>
                                    )}
                                    <Typography variant="caption" display="block" color="text.secondary" sx={{ fontWeight: 400, letterSpacing: '0.025em' }}>
                                        at {formatTime(activity.timestamp) || ''}
                                    </Typography>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', p: 2, mt: 1, fontWeight: 400, letterSpacing: '0.025em' }}>
                    No activity recorded for today.
                </Typography>
            )}
        </Paper>
    );
};

export default RecentActivityCard;
