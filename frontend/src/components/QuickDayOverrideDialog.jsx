/**
 * Compact single-employee / single-date attendance override dialog.
 * Reuses POST /admin/attendance/bulk-override (same auth + audit rules as bulk modal).
 * Optional clockIn/clockOut (HH:mm) are applied without clearing admin override status.
 * Does not alter UniversalOverrideModal behaviour.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Typography,
} from '@mui/material';
import {
    CheckCircleOutline as PresentIcon,
    WbSunnyOutlined as FirstHalfIcon,
    WbTwilight as SecondHalfIcon,
} from '@mui/icons-material';
import api from '../api/axios';
import { getISTDateString, formatISTDate, parseISTDate } from '../utils/istTime';

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif';
const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const HALF_PERIODS = [
    {
        value: 'first',
        label: 'First Half',
        sublabel: 'Morning session',
        Icon: FirstHalfIcon,
        notePrefix: 'Half Day — First Half',
    },
    {
        value: 'second',
        label: 'Second Half',
        sublabel: 'Afternoon session',
        Icon: SecondHalfIcon,
        notePrefix: 'Half Day — Second Half',
    },
];

/** Normalize "9:00" / "09:00:00" → "09:00" */
function normalizeHm(value, fallback) {
    if (!value || typeof value !== 'string') return fallback;
    const parts = value.trim().split(':');
    if (parts.length < 2) return fallback;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return fallback;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hmToMinutes(hm) {
    const [h, m] = hm.split(':').map(Number);
    return h * 60 + m;
}

function minutesToHm(total) {
    const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function midPointHm(startHm, endHm) {
    const mid = Math.round((hmToMinutes(startHm) + hmToMinutes(endHm)) / 2);
    return minutesToHm(mid);
}

const OptionCard = ({ selected, onClick, color, Icon, label, sublabel, disabled }) => (
    <Box
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-pressed={selected}
        onClick={disabled ? undefined : onClick}
        onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
            }
        }}
        sx={{
            flex: 1,
            minWidth: 0,
            p: 1.5,
            borderRadius: '12px',
            border: `1.5px solid ${selected ? color : '#E5E5E7'}`,
            bgcolor: selected ? `${color}14` : '#FFFFFF',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.55 : 1,
            transition: 'border-color 0.15s ease, background-color 0.15s ease',
            outline: 'none',
            '&:hover': disabled ? undefined : { borderColor: color },
        }}
    >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
            <Icon sx={{ fontSize: 18, color: selected ? color : '#6E6E73' }} />
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 650, color: '#1D1D1F', fontFamily: FONT }}>
                {label}
            </Typography>
        </Box>
        {sublabel && (
            <Typography sx={{ fontSize: '0.75rem', color: '#86868B', fontFamily: FONT, ml: 3.25 }}>
                {sublabel}
            </Typography>
        )}
    </Box>
);

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {'fullday'|'halfday'} props.overrideType
 * @param {string} props.employeeId
 * @param {string} [props.employeeName]
 * @param {Date|string} props.date
 * @param {string} [props.shiftStartTime] - HH:mm from employee shift
 * @param {string} [props.shiftEndTime] - HH:mm from employee shift
 * @param {(data: object) => void|Promise<void>} [props.onSuccess]
 */
const QuickDayOverrideDialog = ({
    open,
    onClose,
    overrideType,
    employeeId,
    employeeName,
    date,
    shiftStartTime,
    shiftEndTime,
    onSuccess,
}) => {
    const [note, setNote] = useState('');
    const [halfPeriod, setHalfPeriod] = useState('first');
    const [clockIn, setClockIn] = useState('09:00');
    const [clockOut, setClockOut] = useState('18:00');
    const [busy, setBusy] = useState(false);
    const [errMsg, setErrMsg] = useState('');

    const dateStr = useMemo(() => {
        if (!date) return '';
        return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
            ? date
            : getISTDateString(date);
    }, [date]);

    const todayIST = useMemo(() => getISTDateString(), []);
    const isFuture = !!dateStr && dateStr > todayIST;
    const isHalfDay = overrideType === 'halfday';

    const shiftStart = useMemo(() => normalizeHm(shiftStartTime, '09:00'), [shiftStartTime]);
    const shiftEnd = useMemo(() => normalizeHm(shiftEndTime, '18:00'), [shiftEndTime]);
    const shiftMid = useMemo(() => midPointHm(shiftStart, shiftEnd), [shiftStart, shiftEnd]);

    const applyPeriodDefaults = (period, type) => {
        if (type === 'halfday') {
            if (period === 'second') {
                setClockIn(shiftMid);
                setClockOut(shiftEnd);
            } else {
                setClockIn(shiftStart);
                setClockOut(shiftMid);
            }
        } else {
            setClockIn(shiftStart);
            setClockOut(shiftEnd);
        }
    };

    useEffect(() => {
        if (!open) return;
        setNote('');
        setHalfPeriod('first');
        setErrMsg('');
        setBusy(false);
        applyPeriodDefaults('first', overrideType);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reset defaults only when dialog opens / type or shift changes
    }, [open, overrideType, dateStr, employeeId, shiftStart, shiftEnd, shiftMid]);

    const timesValid = HH_MM_RE.test(clockIn) && HH_MM_RE.test(clockOut) && clockIn < clockOut;

    const canSubmit =
        !!employeeId
        && !!dateStr
        && !isFuture
        && note.trim().length > 0
        && timesValid
        && !busy
        && (overrideType === 'fullday' || overrideType === 'halfday');

    const buildOverrideNote = () => {
        const trimmed = note.trim();
        const timeSuffix = ` Times: ${clockIn}–${clockOut}.`;
        if (!isHalfDay) return `${trimmed}${timeSuffix}`;
        const period = HALF_PERIODS.find((p) => p.value === halfPeriod) || HALF_PERIODS[0];
        return `${period.notePrefix}. ${trimmed}${timeSuffix}`;
    };

    const handleHalfPeriodChange = (period) => {
        setHalfPeriod(period);
        applyPeriodDefaults(period, 'halfday');
    };

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setBusy(true);
        setErrMsg('');
        try {
            const { data } = await api.post('/admin/attendance/bulk-override', {
                employeeScope: [employeeId],
                startDate: dateStr,
                overrideType: isHalfDay ? 'halfday' : 'fullday',
                overrideNote: buildOverrideNote(),
                clockIn,
                clockOut,
            });
            if (onSuccess) await onSuccess(data);
            onClose();
        } catch (err) {
            setErrMsg(err?.response?.data?.error || err?.response?.data?.message || 'Failed to apply override. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    const title = isHalfDay ? 'Mark as Half Day' : 'Mark as Present';
    const dateLabel = dateStr
        ? formatISTDate(parseISTDate(dateStr), { day: 'numeric', month: 'short', year: 'numeric' })
        : '—';

    return (
        <Dialog
            open={open}
            onClose={busy ? undefined : onClose}
            maxWidth="xs"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: '16px',
                    fontFamily: FONT,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
                },
            }}
        >
            <DialogTitle sx={{ pb: 0.5, fontWeight: 700, fontSize: '1.125rem', letterSpacing: '-0.02em' }}>
                {title}
            </DialogTitle>
            <DialogContent>
                <Typography sx={{ color: '#6E6E73', fontSize: '0.8125rem', mb: 2, mt: 0.5 }}>
                    {employeeName || 'Selected employee'} · {dateLabel}
                </Typography>

                {isFuture && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        Cannot override future dates.
                    </Alert>
                )}

                {isHalfDay && (
                    <Box sx={{ mb: 2 }}>
                        <Typography
                            sx={{
                                fontSize: '0.6875rem',
                                fontWeight: 700,
                                color: '#86868B',
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                mb: 1,
                            }}
                        >
                            Half period
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            {HALF_PERIODS.map(({ value, label, sublabel, Icon }) => (
                                <OptionCard
                                    key={value}
                                    selected={halfPeriod === value}
                                    onClick={() => handleHalfPeriodChange(value)}
                                    color="#FF9500"
                                    Icon={Icon}
                                    label={label}
                                    sublabel={sublabel}
                                    disabled={busy || isFuture}
                                />
                            ))}
                        </Box>
                    </Box>
                )}

                {!isHalfDay && (
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            mb: 2,
                            p: 1.25,
                            borderRadius: '12px',
                            bgcolor: '#F0FDF4',
                            border: '1px solid #BBF7D0',
                        }}
                    >
                        <PresentIcon sx={{ color: '#34C759', fontSize: 20 }} />
                        <Typography sx={{ fontSize: '0.8125rem', color: '#166534', fontWeight: 600 }}>
                            Full day — mark present
                        </Typography>
                    </Box>
                )}

                <Box sx={{ mb: 2 }}>
                    <Typography
                        sx={{
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            color: '#86868B',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            mb: 1,
                        }}
                    >
                        Time selection
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1.5 }}>
                        <TextField
                            label="Clock in"
                            type="time"
                            value={clockIn}
                            onChange={(e) => setClockIn(e.target.value)}
                            disabled={busy || isFuture}
                            fullWidth
                            size="small"
                            InputLabelProps={{ shrink: true }}
                            inputProps={{ step: 60 }}
                        />
                        <TextField
                            label="Clock out"
                            type="time"
                            value={clockOut}
                            onChange={(e) => setClockOut(e.target.value)}
                            disabled={busy || isFuture}
                            fullWidth
                            size="small"
                            InputLabelProps={{ shrink: true }}
                            inputProps={{ step: 60 }}
                            error={HH_MM_RE.test(clockIn) && HH_MM_RE.test(clockOut) && !(clockIn < clockOut)}
                            helperText={
                                HH_MM_RE.test(clockIn) && HH_MM_RE.test(clockOut) && !(clockIn < clockOut)
                                    ? 'Must be after clock in'
                                    : ' '
                            }
                        />
                    </Box>
                </Box>

                <TextField
                    label="Reason (required for audit)"
                    placeholder="e.g. Approved late arrival correction, System glitch"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    fullWidth
                    multiline
                    minRows={2}
                    disabled={busy || isFuture}
                    error={open && note.trim().length === 0}
                    helperText="Required for audit trail"
                    inputProps={{ maxLength: 500 }}
                />

                {errMsg && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {errMsg}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
                <Button onClick={onClose} disabled={busy} color="inherit">
                    Cancel
                </Button>
                <Button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    variant="contained"
                    sx={{
                        bgcolor: isHalfDay ? '#FF9500' : '#34C759',
                        '&:hover': { bgcolor: isHalfDay ? '#E68600' : '#2DB84D' },
                        textTransform: 'none',
                        fontWeight: 650,
                        borderRadius: '10px',
                        px: 2,
                    }}
                >
                    {busy ? 'Applying…' : 'Apply Override'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default QuickDayOverrideDialog;
