// frontend/src/components/WorkTimeTracker.jsx
// When unifiedState is provided, uses shared time model: elapsed vs effective, actual work time, paid break.
import React, { useState, useEffect, memo, useRef, useCallback } from 'react';
import { Typography, Box, Stack } from '@mui/material';

const formatTimeUnit = (value) => String(value).padStart(2, '0');

const TimeBlock = memo(function TimeBlock({ value, label, valueColor = 'var(--theme-black)' }) {
    return (
        <Box sx={{ textAlign: 'center', backgroundColor: 'rgba(0, 0, 0, 0.04)', borderRadius: 1, px: 1.5, py: 0.5 }}>
            <Typography variant="h4" component="div" sx={{ fontWeight: 500, color: valueColor }}>
                {formatTimeUnit(value)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 400, letterSpacing: '0.025em' }}>{label}</Typography>
        </Box>
    );
});

const WorkTimeTracker = ({ sessions, breaks, status, unifiedState: unifiedStateProp }) => {
    const [time, setTime] = useState({ hours: 0, minutes: 0, seconds: 0 });
    const intervalRef = useRef(null);
    const lastTimeRef = useRef({ hours: 0, minutes: 0, seconds: 0 });
    const displayRef = useRef(null);

    const calculateWorkTime = useCallback(() => {
        if (!sessions || sessions.length === 0) {
            const zeroTime = { hours: 0, minutes: 0, seconds: 0 };
            if (JSON.stringify(lastTimeRef.current) !== JSON.stringify(zeroTime)) {
                lastTimeRef.current = zeroTime;
                setTime(zeroTime);
            }
            return;
        }

        const now = new Date();
        const grossTimeMs = sessions.reduce((total, s) => {
            const start = new Date(s.startTime);
            const end = s.endTime ? new Date(s.endTime) : now;
            return total + (end - start);
        }, 0);
        const totalBreakMs = (breaks || []).reduce((total, b) => {
            const start = new Date(b.startTime);
            const end = b.endTime ? new Date(b.endTime) : now;
            return total + (end - start);
        }, 0);
        const netWorkMs = Math.max(0, grossTimeMs - totalBreakMs);
        const totalSeconds = Math.floor(netWorkMs / 1000);
        const newTime = {
            hours: Math.floor(totalSeconds / 3600),
            minutes: Math.floor((totalSeconds % 3600) / 60),
            seconds: totalSeconds % 60,
        };
        if (JSON.stringify(lastTimeRef.current) !== JSON.stringify(newTime)) {
            lastTimeRef.current = newTime;
            setTime(newTime);
        }
    }, [sessions, breaks]);

    useEffect(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (displayRef.current) {
            cancelAnimationFrame(displayRef.current);
            displayRef.current = null;
        }
        calculateWorkTime();
        const isClockedInOrOnBreak = status === 'Clocked In' || status === 'On Break';
        if (isClockedInOrOnBreak && !unifiedStateProp) {
            intervalRef.current = setInterval(() => {
                if (displayRef.current) cancelAnimationFrame(displayRef.current);
                displayRef.current = requestAnimationFrame(() => calculateWorkTime());
            }, 1000);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (displayRef.current) cancelAnimationFrame(displayRef.current);
        };
    }, [status, calculateWorkTime, unifiedStateProp]);

    const totalSeconds = unifiedStateProp
        ? Math.floor(unifiedStateProp.elapsedShiftTime * 60)
        : null;
    const hours = totalSeconds != null ? Math.floor(totalSeconds / 3600) : time.hours;
    const minutes = totalSeconds != null ? Math.floor((totalSeconds % 3600) / 60) : time.minutes;
    const seconds = totalSeconds != null ? totalSeconds % 60 : time.seconds;

    return (
        <Stack direction="row" justifyContent="center" alignItems="center" spacing={1}>
            <TimeBlock value={hours} label="Hours" />
            <Typography variant="h4" component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>:</Typography>
            <TimeBlock value={minutes} label="Minutes" />
            <Typography variant="h4" component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>:</Typography>
            <TimeBlock value={seconds} label="Seconds" />
        </Stack>
    );
};

export default memo(WorkTimeTracker);
