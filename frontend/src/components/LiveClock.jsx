// frontend/src/components/LiveClock.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Typography, Box } from '@mui/material';
import { getISTNow, formatISTTime, formatISTDate } from '../utils/istTime';

const LiveClock = () => {
    const [currentTime, setCurrentTime] = useState(() => getISTNow());
    const intervalRef = useRef(null);
    const rafRef = useRef(null);
    const lastTimeStringRef = useRef('');

    useEffect(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);

        const updateTime = () => {
            const now = getISTNow();
            const timeString = formatISTTime(now, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
            if (lastTimeStringRef.current !== timeString) {
                lastTimeStringRef.current = timeString;
                setCurrentTime(now);
            }
        };

        updateTime();
        intervalRef.current = setInterval(() => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(updateTime);
        }, 1000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, []);

    return (
        <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h5" component="p" sx={{ fontWeight: 700, color: '#333333', letterSpacing: '0.025em' }}>
                {formatISTTime(currentTime, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
            </Typography>
            <Typography variant="body2" sx={{ color: '#666666', fontWeight: 400, letterSpacing: '0.025em' }}>
                {formatISTDate(currentTime, { weekday: 'long', month: 'long', day: 'numeric' })}
            </Typography>
        </Box>
    );
};
export default LiveClock;