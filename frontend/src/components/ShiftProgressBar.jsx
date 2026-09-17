// src/components/ShiftProgressBar.jsx
// Progress = elapsedShiftTime / effectiveShiftDuration from unified time model when unifiedState is provided.
import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Stack, Tooltip } from '@mui/material';
import { formatISTTime } from '../utils/istTime';
import { formatMinutesToHM } from '../utils/shiftTimeCalculation';

const ShiftProgressBar = ({
  workedMinutes,
  unpaidBreakMinutes,
  paidBreakExcess,
  status,
  breaks,
  sessions,
  activeBreakOverride = null,
  unifiedState: unifiedStateProp = null,
}) => {
  const [now, setNow] = useState(new Date());
  const baseShiftMinutes = 540;

  // When unified state is provided, use it for progress and display (single source of truth).
  const useUnified = !!unifiedStateProp && !!sessions?.length;

  const activeUnpaidBreakMinutes = useMemo(() => {
    const activeBreak = activeBreakOverride || breaks?.find(b => !b.endTime);
    if (!activeBreak || !activeBreak.startTime) return 0;
    const activeBreakType = (activeBreak.breakType || activeBreak.type || '').toString().trim();
    if (activeBreakType !== 'Unpaid' && activeBreakType !== 'Extra') return 0;
    const breakStart = new Date(activeBreak.startTime);
    return Math.floor((now - breakStart) / 60000);
  }, [activeBreakOverride, breaks, now]);

  const adjustedTotalShiftMinutes = baseShiftMinutes + (unpaidBreakMinutes || 0) + (paidBreakExcess || 0) + activeUnpaidBreakMinutes;

  const realTimeWorkedMinutes = useMemo(() => {
    if (status !== 'Clocked In' && status !== 'On Break') return workedMinutes;
    if (!sessions || sessions.length === 0) return 0;
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
    return Math.floor(netWorkMs / 60000);
  }, [status, sessions, breaks, now, workedMinutes]);

  useEffect(() => {
    // Parent already ticks unifiedState every second; a second interval here double-renders the bar.
    if (useUnified) return;
    const isClockedIn = status === 'Clocked In' || status === 'On Break';
    const hasActiveBreak = !!activeBreakOverride || breaks?.some(b => !b.endTime);
    const hasActiveSession = sessions?.some(s => !s.endTime);
    if (isClockedIn || hasActiveBreak || hasActiveSession) {
      const timerId = setInterval(() => setNow(new Date()), 1000);
      return () => clearInterval(timerId);
    }
  }, [status, breaks, sessions, activeBreakOverride, useUnified]);

  const totalBreakMinutes = useMemo(() => {
    if (!breaks || breaks.length === 0) return 0;
    return breaks.reduce((total, breakItem) => {
      if (!breakItem.startTime) return total;
      const breakStart = new Date(breakItem.startTime);
      const breakEnd = breakItem.endTime ? new Date(breakItem.endTime) : now;
      return total + Math.max(0, (breakEnd - breakStart) / 60000);
    }, 0);
  }, [breaks, now]);

  const breakSegments = useMemo(() => {
    if (!sessions?.length || !breaks?.length) return [];
    const sessionStart = new Date(sessions[0].startTime);
    const sortedBreaks = [...breaks].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    const totalForPosition = useUnified && unifiedStateProp
      ? unifiedStateProp.effectiveShiftDuration
      : adjustedTotalShiftMinutes;
    const segments = [];
    sortedBreaks.forEach(breakItem => {
      if (!breakItem.startTime || (!breakItem.breakType && !breakItem.type)) return;
      const breakStart = new Date(breakItem.startTime);
      const breakEnd = breakItem.endTime ? new Date(breakItem.endTime) : (useUnified ? new Date() : now);
      const durationMinutes = (breakEnd - breakStart) / 60000;
      if (durationMinutes <= 0) return;
      const elapsedTimeBeforeBreak = (breakStart - sessionStart) / 60000;
      const leftPercent = totalForPosition > 0 ? (elapsedTimeBeforeBreak / totalForPosition) * 100 : 0;
      const widthPercent = totalForPosition > 0 ? (durationMinutes / totalForPosition) * 100 : 0;
      segments.push({
        left: Math.max(0, Math.min(100, leftPercent)),
        width: Math.max(0, Math.min(100 - leftPercent, widthPercent)),
        type: breakItem.breakType || breakItem.type || 'Paid',
        duration: Math.floor(durationMinutes),
        isComplete: !!breakItem.endTime,
      });
    });
    return segments;
  }, [sessions, breaks, now, useUnified, unifiedStateProp, adjustedTotalShiftMinutes]);

  // Unified model: progress = elapsedShiftTime / effectiveShiftDuration
  const workProgress = useUnified && unifiedStateProp
    ? Math.min(unifiedStateProp.progress * 100, 100)
    : (adjustedTotalShiftMinutes > 0 ? Math.min(((realTimeWorkedMinutes + totalBreakMinutes) / adjustedTotalShiftMinutes) * 100, 100) : 0);

  // Use floor for elapsed so we only show "9h 6m / 9h 6m" when actually at 546 min (avoids showing "done" 1 min early)
  const displayElapsed = useUnified && unifiedStateProp
    ? Math.min(Math.floor(unifiedStateProp.elapsedShiftTime), unifiedStateProp.effectiveShiftDuration)
    : Math.min(realTimeWorkedMinutes + totalBreakMinutes, adjustedTotalShiftMinutes);
  const displayTotal = useUnified && unifiedStateProp
    ? unifiedStateProp.effectiveShiftDuration
    : adjustedTotalShiftMinutes;

  const hasExtension = useUnified && unifiedStateProp
    ? (unifiedStateProp.extraBreakTime > 0 || unifiedStateProp.actualUnpaidBreakTaken > 0)
    : (unpaidBreakMinutes > 0 || paidBreakExcess > 0);

  const activeBreak = activeBreakOverride || breaks?.find(b => !b.endTime);

  return (
    <Box sx={{ width: '100%', mt: 2, mb: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8125rem', color: '#111827' }}>
          Shift Progress
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8125rem', color: hasExtension ? '#b71c1c' : '#4b5563' }}>
          {formatMinutesToHM(displayElapsed)} / {formatMinutesToHM(displayTotal)}
        </Typography>
      </Stack>

      <div className="progress-bar-container">
        <div
          className={`progress-bar-segment progress-bar-work ${hasExtension ? 'overtime' : ''}`}
          style={{ width: `${Math.max(0, Math.min(100, workProgress)).toFixed(1)}%` }}
        />
        {breakSegments.map((seg, index) => {
          const label = seg.isComplete
            ? `${seg.type} Break: ${seg.duration} min`
            : `Ongoing ${seg.type} Break: ${seg.duration} min`;
          return (
            <Tooltip key={index} title={label} arrow>
              <div
                className="progress-bar-segment progress-bar-break"
                role="img"
                aria-label={label}
                style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
              />
            </Tooltip>
          );
        })}
      </div>

      <Box sx={{ mt: 0.5, minHeight: '20px', textAlign: 'right' }}>
        {activeBreak ? (
          <Typography variant="caption" sx={{ color: '#1976d2' }}>
            On {activeBreak.breakType} Break since {formatISTTime(activeBreak.startTime, { hour: '2-digit', minute: '2-digit', hour12: true })}
          </Typography>
        ) : useUnified && unifiedStateProp && unifiedStateProp.breakExceededMinutes > 0 ? (
          <Typography variant="caption" sx={{ color: '#ed6c02', fontWeight: 500 }}>
            ⚠️ Break exceeded by {unifiedStateProp.breakExceededMinutes} min — logout time extended accordingly
          </Typography>
        ) : hasExtension ? (
          <Typography variant="caption" color="error">
            {unpaidBreakMinutes > 0 && paidBreakExcess > 0
              ? `Shift extended by ${unpaidBreakMinutes + paidBreakExcess} minutes due to break.`
              : unpaidBreakMinutes > 0
                ? `Shift extended by ${unpaidBreakMinutes} minute${unpaidBreakMinutes !== 1 ? 's' : ''} due to break.`
                : `Shift extended by ${paidBreakExcess} minute${paidBreakExcess !== 1 ? 's' : ''} due to break.`}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
};

export default ShiftProgressBar;
