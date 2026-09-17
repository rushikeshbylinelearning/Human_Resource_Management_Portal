// frontend/src/components/BreakTimer.jsx
import React, { useState, useEffect, useMemo, memo, useRef, useCallback } from 'react';
import { Typography, Box } from '@mui/material';

const formatCountdown = (totalSeconds) => {
    if (totalSeconds < 0) totalSeconds = 0;
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
};

const TimeBlock = memo(function TimeBlock({ value, label, valueColor }) {
    return (
        <Box sx={{
            textAlign: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
            borderRadius: 1,
            px: 1.5,
            py: 0.5
        }}>
            <Typography variant="h4" component="div" sx={{ fontWeight: 500, color: valueColor }}>
                {String(value).padStart(2, '0')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 400, letterSpacing: '0.025em' }}>
                {label}
            </Typography>
        </Box>
    );
});

const UNPAID_BREAK_ALLOWANCE_MINUTES = 10;

const BreakTimer = ({
    breaks,
    paidBreakAllowance = 30,
    activeBreakOverride = null,
    unifiedDisplay = false,
    teaBreakOverride = null,
}) => {
    const [countdown, setCountdown] = useState(0);
    const [overtime, setOvertime] = useState(0);
    const intervalRef = useRef(null);
    const rafRef = useRef(null);
    const lastValuesRef = useRef({ countdown: 0, overtime: 0 });
    const activeBreakIdRef = useRef(null);

    const activeBreak = useMemo(() => {
        if (teaBreakOverride?.startTime) {
            return {
                _id: 'tea-break',
                breakType: teaBreakOverride.breakType || 'Unpaid',
                startTime: teaBreakOverride.startTime,
                endTime: null,
            };
        }
        return activeBreakOverride || breaks?.find(b => !b.endTime);
    }, [breaks, activeBreakOverride, teaBreakOverride]);

    const paidMinutesAlreadyTaken = useMemo(() => {
        if (!activeBreak || activeBreak.breakType !== 'Paid') return 0;
        return breaks
            .filter(b => b.breakType === 'Paid' && b.endTime && b._id !== activeBreak._id)
            .reduce((sum, b) => sum + (b.durationMinutes || 0), 0);
    }, [breaks, activeBreak]);

    const allowanceSeconds = useMemo(() => {
        if (!activeBreak) return null;
        if (activeBreak.breakType === 'Paid') {
            const remaining = Math.max(0, (paidBreakAllowance - paidMinutesAlreadyTaken) * 60);
            return remaining;
        }
        return UNPAID_BREAK_ALLOWANCE_MINUTES * 60;
    }, [activeBreak, paidBreakAllowance, paidMinutesAlreadyTaken]);

    const clearTimer = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    useEffect(() => {
        clearTimer();

        if (!activeBreak || allowanceSeconds === null) {
            if (lastValuesRef.current.countdown !== 0 || lastValuesRef.current.overtime !== 0) {
                setCountdown(0);
                setOvertime(0);
                lastValuesRef.current = { countdown: 0, overtime: 0 };
            }
            activeBreakIdRef.current = null;
            return;
        }

        // Reset cached values whenever the active break changes (prevents stale UI)
        const currentBreakId = activeBreak._id || activeBreak.id;
        if (currentBreakId !== activeBreakIdRef.current) {
            lastValuesRef.current = { countdown: 0, overtime: 0 };
            activeBreakIdRef.current = currentBreakId;
        }

        const startMs = new Date(activeBreak.startTime).getTime();
        const endsAtMs = teaBreakOverride?.endsAt
            ? new Date(teaBreakOverride.endsAt).getTime()
            : null;
        const clockOffsetMs = teaBreakOverride?.clockOffsetMs ?? 0;

        const tick = () => {
            const serverNowMs = Date.now() + clockOffsetMs;
            let remainingSeconds;
            if (endsAtMs) {
                remainingSeconds = Math.floor((endsAtMs - serverNowMs) / 1000);
            } else {
                const elapsedSeconds = Math.floor((serverNowMs - startMs) / 1000);
                remainingSeconds = allowanceSeconds - elapsedSeconds;
            }
            const nextCountdown = remainingSeconds > 0 ? remainingSeconds : 0;
            const nextOvertime = remainingSeconds < 0 ? Math.abs(remainingSeconds) : 0;

            // Only update state if values changed (prevents unnecessary re-renders)
            if (lastValuesRef.current.countdown !== nextCountdown) {
                setCountdown(nextCountdown);
            }
            if (lastValuesRef.current.overtime !== nextOvertime) {
                setOvertime(nextOvertime);
            }

            lastValuesRef.current = { countdown: nextCountdown, overtime: nextOvertime };
        };

        // Run immediately so UI updates without waiting a tick
        tick();
        
        // Use requestAnimationFrame for smoother updates and store the id for cleanup
        intervalRef.current = setInterval(() => {
            rafRef.current = requestAnimationFrame(tick);
        }, 1000);

        return clearTimer;
    }, [activeBreak, allowanceSeconds, clearTimer, teaBreakOverride?.endsAt, teaBreakOverride?.clockOffsetMs]);

    if (!activeBreak) {
        return null;
    }

    const titleText = overtime > 0 
        ? 'Extra time taken:' 
        : `Time Remaining (${activeBreak.breakType})`;

    if (unifiedDisplay) {
        // Unified display mode - show HH:MM:SS format like WorkTimeTracker
        const totalSeconds = overtime > 0 ? overtime : countdown;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const valueColor = overtime > 0 ? 'error.main' : 'success.main';

        return (
            <Box component="div" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
                <TimeBlock value={hours} label="Hours" valueColor={valueColor} />
                <Typography variant="h4" component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>:</Typography>
                <TimeBlock value={minutes} label="Minutes" valueColor={valueColor} />
                <Typography variant="h4" component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>:</Typography>
                <TimeBlock value={seconds} label="Seconds" valueColor={valueColor} />
            </Box>
        );
    }

    return (
        <Box sx={{ textAlign: 'center', width: '100%' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, letterSpacing: '0.025em' }}>
                {titleText}
            </Typography>
            <Typography
                variant="h5"
                component="p"
                sx={{
                    color: overtime > 0 ? 'error.main' : 'success.main',
                    fontWeight: 'bold'
                }}
            >
                {overtime > 0 ? `+${formatCountdown(overtime)}` : formatCountdown(countdown)}
            </Typography>
        </Box>
    );
};

export default memo(BreakTimer);