// frontend/src/components/onboarding/ComplianceDashboard.jsx
// Admin compliance dashboard embedded in AdminPoliciesPage.
// Shows: compact policy banner, summary, searchable employee progress table, timeline.

import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, Paper, Chip, Button, IconButton, Select, MenuItem, FormControl,
    InputLabel, TextField, Tooltip, CircularProgress, Dialog, DialogTitle,
    DialogContent, DialogActions, Alert, Collapse, InputAdornment,
} from '@mui/material';
import TimelineIcon from '@mui/icons-material/Timeline';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import DrawOutlinedIcon from '@mui/icons-material/DrawOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import api from '../../api/axios';
import {
    RED, RED_DARK, RED_BG, TEXT, MUTED, BORDER, SURFACE,
    FONT, SUCCESS_BG, SUCCESS_TEXT, WARN_BG, WARN_TEXT, INFO_BG, INFO_TEXT,
    SUCCESS_BORDER,
    primaryBtnSx, outlineBtnSx, ghostBtnSx, fieldSx, tableHeadCellSx,
    pageTitleSx, iconBoxSx, cardSx,
} from '../../theme/policiesPageTheme';

const PAGE_SIZE = 25;

const statusConfig = {
    completed:   { label: 'Completed',   color: SUCCESS_TEXT, bg: SUCCESS_BG, icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> },
    incomplete:  { label: 'Incomplete',  color: WARN_TEXT, bg: WARN_BG, icon: <WarningAmberIcon sx={{ fontSize: 14 }} /> },
    in_progress: { label: 'In Progress', color: INFO_TEXT, bg: INFO_BG, icon: <HourglassEmptyIcon sx={{ fontSize: 14 }} /> },
    pending:     { label: 'Pending',     color: WARN_TEXT, bg: WARN_BG, icon: <HourglassEmptyIcon sx={{ fontSize: 14 }} /> },
    overdue:     { label: 'Overdue',     color: RED_DARK, bg: RED_BG, icon: <WarningAmberIcon sx={{ fontSize: 14 }} /> },
    expired:     { label: 'Expired',     color: MUTED, bg: SURFACE, icon: <CancelIcon sx={{ fontSize: 14 }} /> },
};

const StatusChip = ({ status }) => {
    const cfg = statusConfig[status] || statusConfig.pending;
    return (
        <Chip
            size="small"
            icon={cfg.icon}
            label={cfg.label}
            sx={{
                background: cfg.bg,
                color: cfg.color,
                fontWeight: 600,
                fontSize: '0.72rem',
                px: 0.5,
                height: 24,
                fontFamily: FONT,
                '& .MuiChip-icon': { color: 'inherit' },
            }}
        />
    );
};

const TIMELINE_EVENTS = {
    account_created: {
        label: 'Account Created',
        icon: <PersonAddAltOutlinedIcon sx={{ fontSize: 18 }} />,
        color: MUTED,
        bg: SURFACE,
    },
    first_login: {
        label: 'First Login',
        icon: <LoginOutlinedIcon sx={{ fontSize: 18 }} />,
        color: INFO_TEXT,
        bg: INFO_BG,
    },
    policy_opened: {
        label: 'Policy Opened',
        icon: <DescriptionOutlinedIcon sx={{ fontSize: 18 }} />,
        color: INFO_TEXT,
        bg: INFO_BG,
    },
    reading_started: {
        label: 'Reading Started',
        icon: <MenuBookOutlinedIcon sx={{ fontSize: 18 }} />,
        color: INFO_TEXT,
        bg: INFO_BG,
    },
    reading_completed: {
        label: 'Reading Completed',
        icon: <TaskAltOutlinedIcon sx={{ fontSize: 18 }} />,
        color: SUCCESS_TEXT,
        bg: SUCCESS_BG,
    },
    policy_accepted: {
        label: 'Policy Accepted',
        icon: <DrawOutlinedIcon sx={{ fontSize: 18 }} />,
        color: SUCCESS_TEXT,
        bg: SUCCESS_BG,
    },
    tour_started: {
        label: 'Tour Started',
        icon: <MapOutlinedIcon sx={{ fontSize: 18 }} />,
        color: INFO_TEXT,
        bg: INFO_BG,
    },
    tour_completed: {
        label: 'Tour Completed',
        icon: <FlagOutlinedIcon sx={{ fontSize: 18 }} />,
        color: SUCCESS_TEXT,
        bg: SUCCESS_BG,
    },
    profile_completed: {
        label: 'Profile Completed',
        icon: <PersonOutlineOutlinedIcon sx={{ fontSize: 18 }} />,
        color: SUCCESS_TEXT,
        bg: SUCCESS_BG,
    },
    deadline_passed: {
        label: 'Deadline Passed',
        icon: <WarningAmberIcon sx={{ fontSize: 18 }} />,
        color: RED_DARK,
        bg: RED_BG,
    },
    onboarding_completed: {
        label: 'Onboarding Completed',
        icon: <EmojiEventsOutlinedIcon sx={{ fontSize: 18 }} />,
        color: SUCCESS_TEXT,
        bg: SUCCESS_BG,
    },
    forced_by_admin: {
        label: 'Reset by Admin',
        icon: <RestartAltOutlinedIcon sx={{ fontSize: 18 }} />,
        color: WARN_TEXT,
        bg: WARN_BG,
    },
    policy_assigned: {
        label: 'Assigned',
        icon: <PersonAddAltOutlinedIcon sx={{ fontSize: 18 }} />,
        color: INFO_TEXT,
        bg: INFO_BG,
    },
    policy_reassigned: {
        label: 'Reassigned',
        icon: <PersonAddAltOutlinedIcon sx={{ fontSize: 18 }} />,
        color: INFO_TEXT,
        bg: INFO_BG,
    },
    template_assigned: {
        label: 'Assigned',
        icon: <DescriptionOutlinedIcon sx={{ fontSize: 18 }} />,
        color: INFO_TEXT,
        bg: INFO_BG,
    },
    wizard_opened: {
        label: 'Opened the notice',
        icon: <VisibilityOutlinedIcon sx={{ fontSize: 18 }} />,
        color: INFO_TEXT,
        bg: INFO_BG,
    },
    wizard_step_visited: {
        label: 'Viewed a step',
        icon: <MenuBookOutlinedIcon sx={{ fontSize: 18 }} />,
        color: INFO_TEXT,
        bg: INFO_BG,
    },
    wizard_steps_reviewed: {
        label: 'Read each section',
        icon: <MenuBookOutlinedIcon sx={{ fontSize: 18 }} />,
        color: INFO_TEXT,
        bg: INFO_BG,
    },
    consent_provided: {
        label: 'Gave consent',
        icon: <DrawOutlinedIcon sx={{ fontSize: 18 }} />,
        color: SUCCESS_TEXT,
        bg: SUCCESS_BG,
    },
    continued_without_consent: {
        label: 'Continued Without Consent',
        icon: <CancelIcon sx={{ fontSize: 18 }} />,
        color: WARN_TEXT,
        bg: WARN_BG,
    },
    alternative_requested: {
        label: 'Alternative Consent Requested',
        icon: <WarningAmberIcon sx={{ fontSize: 18 }} />,
        color: WARN_TEXT,
        bg: WARN_BG,
    },
};

const formatDuration = (seconds) => {
    if (seconds == null || seconds === '') return '—';
    const s = Math.max(0, Number(seconds) || 0);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
};

const STEP_LABELS = {
    at_a_glance: 'At a glance',
    what_we_collect: 'What we collect',
    your_choices: 'Your choices',
    full_notice: 'Full notice',
    consent: 'Consent',
};

const formatStepLabel = (key) => {
    if (!key) return '';
    return STEP_LABELS[key] || String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const uniqueStepTimings = (steps = []) => {
    const map = new Map();
    steps.forEach((step) => {
        const key = step?.stepKey;
        if (!key) return;
        const duration = Number(step.durationSeconds) || 0;
        const prev = map.get(key);
        if (!prev || duration > prev.durationSeconds) {
            map.set(key, {
                stepKey: key,
                durationSeconds: duration,
                viewedAt: step.viewedAt || prev?.viewedAt,
            });
        }
    });
    return Array.from(map.values());
};

const collapseTimeline = (timeline = []) => {
    const result = [];
    let stepBuffer = [];

    const flushSteps = () => {
        if (!stepBuffer.length) return;
        const last = stepBuffer[stepBuffer.length - 1];
        result.push({
            event: 'wizard_steps_reviewed',
            timestamp: last.timestamp,
            notes: `${stepBuffer.length} section${stepBuffer.length === 1 ? '' : 's'} opened`,
        });
        stepBuffer = [];
    };

    timeline.forEach((event) => {
        if (event.event === 'wizard_step_visited') {
            stepBuffer.push(event);
            return;
        }
        flushSteps();
        if (event.event === 'reading_started') {
            const prev = result[result.length - 1];
            if (prev && (prev.event === 'wizard_opened' || prev.event === 'policy_opened')) {
                return;
            }
        }
        result.push(event);
    });
    flushSteps();
    return result;
};

const shortConsentLabel = (label) => {
    if (!label) return '';
    const first = String(label).split(/[.!?]/)[0].trim();
    if (first.length <= 88) return first;
    return `${first.slice(0, 85)}…`;
};

const formatCompactTime = (value) => {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const OUTCOME_STYLES = {
    consented: { label: 'Consented', color: SUCCESS_TEXT, bg: SUCCESS_BG, border: SUCCESS_BORDER },
    continued_without_consent: { label: 'No consent', color: WARN_TEXT, bg: WARN_BG, border: '#FBD38D' },
    alternative_requested: { label: 'Alternative requested', color: WARN_TEXT, bg: WARN_BG, border: '#FBD38D' },
};

const OUTCOME_LABELS = {
    consented: 'Consented',
    continued_without_consent: 'No consent',
    alternative_requested: 'Alt. requested',
};

const OnboardingSteps = ({ policyDone, tourDone, profileDone }) => {
    const steps = [
        { key: 'Policy', done: policyDone },
        { key: 'Tour', done: tourDone },
        { key: 'Profile', done: profileDone },
    ];

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            {steps.map((step, i) => (
                <Box key={step.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                    <Tooltip title={`${step.key}: ${step.done ? 'Done' : 'Pending'}`} disableInteractive>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.45, minWidth: 0 }}>
                            {step.done ? (
                                <CheckCircleIcon sx={{ fontSize: 16, color: SUCCESS_TEXT }} />
                            ) : (
                                <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: '#D1D5DB' }} />
                            )}
                            <Typography
                                sx={{
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    color: step.done ? SUCCESS_TEXT : MUTED,
                                    fontFamily: FONT,
                                    display: { xs: 'none', md: 'block' },
                                }}
                            >
                                {step.key}
                            </Typography>
                        </Box>
                    </Tooltip>
                    {i < steps.length - 1 && (
                        <Box sx={{
                            width: 12,
                            height: 2,
                            borderRadius: 1,
                            background: step.done ? SUCCESS_BORDER : BORDER,
                            display: { xs: 'none', sm: 'block' },
                            flexShrink: 0,
                        }} />
                    )}
                </Box>
            ))}
        </Box>
    );
};

const resolveLogUserId = (log) => {
    const raw = log?.userId;
    if (raw == null || raw === '') return null;
    if (typeof raw === 'string') return raw;
    const id = raw._id ?? raw.id;
    if (id == null) return null;
    return typeof id === 'string' ? id : String(id);
};

const TimelineDialog = ({ open, onClose, userId, userName, logId }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open || !userId) {
            setData(null);
            setError('');
            return;
        }
        let cancelled = false;
        setLoading(true);
        setData(null);
        setError('');
        api.get(`/onboarding/admin/compliance/${encodeURIComponent(userId)}/timeline${logId ? `?logId=${encodeURIComponent(logId)}` : ''}`)
            .then((r) => {
                if (!cancelled) setData(r.data);
            })
            .catch((err) => {
                console.error('[TimelineDialog]', err.message);
                if (!cancelled) {
                    setData(null);
                    setError(err.response?.data?.error || 'Could not load this employee’s onboarding journey.');
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [open, userId, logId]);

    const log = data?.log || null;
    const events = new Set((data?.timeline || []).map((t) => t.event));
    const policyDone = Boolean(log?.accepted || events.has('policy_accepted') || log?.outcome === 'consented');
    const tourDone = Boolean(data?.user?.onboarding?.tourCompleted || events.has('tour_completed'));
    const profileDone = Boolean(
        data?.user?.onboarding?.profileCompleted
        || events.has('profile_completed')
        || data?.profileCompleted
    );
    const policyLabel = log?.policyId?.name || log?.policyName || null;
    const outcomeStyle = OUTCOME_STYLES[log?.outcome]
        || (log?.accepted
            ? OUTCOME_STYLES.consented
            : { label: 'Pending', color: MUTED, bg: SURFACE, border: BORDER });
    const hasConsentDetail = Boolean(
        log?.viewedAt || log?.outcome || log?.templateVersion || (log?.stepTimings || []).length || (log?.checkboxResponses || []).length
    );
    const stepTimings = uniqueStepTimings(log?.stepTimings || []);
    const maxStepSeconds = Math.max(1, ...stepTimings.map((s) => s.durationSeconds || 0));
    const checkedCount = (log?.checkboxResponses || []).filter((cb) => cb.checked).length;
    const collapsedTimeline = collapseTimeline(data?.timeline || []);
    const progressSteps = [
        { key: 'Notice', done: policyDone, detail: policyDone ? 'Done' : 'Pending' },
        { key: 'Tour', done: tourDone, detail: tourDone ? 'Done' : 'Pending' },
        { key: 'Profile', done: profileDone, detail: profileDone ? 'Done' : 'Pending' },
    ];

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: '16px',
                    fontFamily: FONT,
                    overflow: 'hidden',
                    maxHeight: '90vh',
                },
            }}
            sx={{ zIndex: 1400 }}
        >
            <DialogTitle sx={{ px: 3, pt: 2.5, pb: 1.5, fontFamily: FONT }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, mb: 0.5 }}>
                            Onboarding journey
                        </Typography>
                        <Typography sx={{ fontWeight: 700, fontSize: '1.2rem', color: TEXT, letterSpacing: '-0.02em', lineHeight: 1.3 }}>
                            {userName}
                        </Typography>
                        <Typography sx={{ fontSize: '0.8rem', color: MUTED, mt: 0.35 }}>
                            {[data?.user?.employeeCode, data?.user?.department].filter(Boolean).join(' · ') || ' '}
                        </Typography>
                    </Box>
                    {log && (
                        <Chip
                            size="small"
                            label={outcomeStyle.label}
                            sx={{
                                mt: 0.4,
                                height: 24,
                                fontWeight: 700,
                                fontSize: '0.72rem',
                                background: outcomeStyle.bg,
                                color: outcomeStyle.color,
                                border: `1px solid ${outcomeStyle.border}`,
                            }}
                        />
                    )}
                </Box>
            </DialogTitle>
            <DialogContent sx={{ px: 3, pb: 1 }}>
                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                        <CircularProgress sx={{ color: RED }} />
                    </Box>
                )}
                {!loading && data && (
                    <>
                        <Box sx={{
                            display: 'flex',
                            alignItems: 'stretch',
                            gap: 0,
                            mb: 2.5,
                            border: `1px solid ${BORDER}`,
                            borderRadius: '12px',
                            overflow: 'hidden',
                            background: '#fff',
                        }}>
                            {progressSteps.map((step, i) => (
                                <Box
                                    key={step.key}
                                    sx={{
                                        flex: 1,
                                        px: 1.5,
                                        py: 1.25,
                                        minWidth: 0,
                                        borderLeft: i === 0 ? 'none' : `1px solid ${BORDER}`,
                                        background: step.done ? SUCCESS_BG : '#fff',
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mb: 0.25 }}>
                                        {step.done ? (
                                            <CheckCircleIcon sx={{ fontSize: 15, color: SUCCESS_TEXT }} />
                                        ) : (
                                            <RadioButtonUncheckedIcon sx={{ fontSize: 15, color: '#D1D5DB' }} />
                                        )}
                                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: step.done ? SUCCESS_TEXT : MUTED }}>
                                            {step.key}
                                        </Typography>
                                    </Box>
                                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: step.done ? SUCCESS_TEXT : TEXT, pl: 2.6 }}>
                                        {step.detail}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>

                        {hasConsentDetail && (
                            <Box sx={{
                                mb: 2.5,
                                p: 2,
                                borderRadius: '12px',
                                border: `1px solid ${BORDER}`,
                                background: '#fff',
                            }}>
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
                                    <Box>
                                        <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: TEXT, letterSpacing: '-0.01em' }}>
                                            Consent notice
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.75rem', color: MUTED, mt: 0.2 }}>
                                            {[policyLabel, log.templateVersion ? `v${log.templateVersion}` : null].filter(Boolean).join(' · ') || 'Consent template'}
                                        </Typography>
                                    </Box>
                                </Box>

                                <Box sx={{
                                    display: 'grid',
                                    gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, minmax(0, 1fr))' },
                                    gap: 1,
                                    mb: stepTimings.length || (log.checkboxResponses || []).length ? 2 : 0,
                                }}>
                                    {[
                                        { icon: <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />, label: 'Opened', value: log.viewedAt ? formatCompactTime(log.viewedAt) : 'Not opened' },
                                        { icon: <ScheduleOutlinedIcon sx={{ fontSize: 16 }} />, label: 'Time spent', value: formatDuration(log.wizardDurationSeconds || log.readingDurationSeconds) },
                                        { icon: <ArticleOutlinedIcon sx={{ fontSize: 16 }} />, label: 'Full notice', value: formatDuration(log.fullNoticeDurationSeconds) },
                                    ].map((item) => (
                                        <Box
                                            key={item.label}
                                            sx={{
                                                p: 1.15,
                                                borderRadius: '10px',
                                                background: SURFACE,
                                                border: `1px solid ${BORDER}`,
                                                minWidth: 0,
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: MUTED, mb: 0.35 }}>
                                                {item.icon}
                                                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                    {item.label}
                                                </Typography>
                                            </Box>
                                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: TEXT }}>
                                                {item.value}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>

                                {stepTimings.length > 0 && (
                                    <Box sx={{ mb: (log.checkboxResponses || []).length ? 2 : 0 }}>
                                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED, mb: 1, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                            Time on each section
                                        </Typography>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.85 }}>
                                            {stepTimings.map((step) => (
                                                <Box key={step.stepKey} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 44px', gap: 1, alignItems: 'center' }}>
                                                    <Box sx={{ minWidth: 0 }}>
                                                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: TEXT, mb: 0.35 }}>
                                                            {formatStepLabel(step.stepKey)}
                                                        </Typography>
                                                        <Box sx={{ height: 6, borderRadius: 99, background: '#EEF0F3', overflow: 'hidden' }}>
                                                            <Box sx={{
                                                                height: '100%',
                                                                width: `${Math.max(8, (step.durationSeconds / maxStepSeconds) * 100)}%`,
                                                                borderRadius: 99,
                                                                background: RED,
                                                                opacity: 0.75,
                                                            }} />
                                                        </Box>
                                                    </Box>
                                                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: MUTED, textAlign: 'right' }}>
                                                        {formatDuration(step.durationSeconds)}
                                                    </Typography>
                                                </Box>
                                            ))}
                                        </Box>
                                    </Box>
                                )}

                                {(log.checkboxResponses || []).length > 0 && (
                                    <Box>
                                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED, mb: 1, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                            Consents given · {checkedCount} of {log.checkboxResponses.length}
                                        </Typography>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                            {log.checkboxResponses.map((cb) => (
                                                <Box key={cb.checkboxId} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.85 }}>
                                                    {cb.checked ? (
                                                        <CheckCircleOutlineIcon sx={{ fontSize: 18, color: SUCCESS_TEXT, mt: '1px' }} />
                                                    ) : (
                                                        <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: '#D1D5DB', mt: '1px' }} />
                                                    )}
                                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                                        <Tooltip title={cb.label || ''} disableHoverListener={!cb.label || cb.label.length < 88}>
                                                            <Typography sx={{ fontSize: '0.8rem', color: TEXT, lineHeight: 1.4 }}>
                                                                {shortConsentLabel(cb.label)}
                                                            </Typography>
                                                        </Tooltip>
                                                        <Typography sx={{ fontSize: '0.68rem', color: MUTED, mt: 0.15 }}>
                                                            {cb.required ? 'Required' : 'Optional'}
                                                        </Typography>
                                                    </Box>
                                                </Box>
                                            ))}
                                        </Box>
                                    </Box>
                                )}
                            </Box>
                        )}

                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED, mb: 1.25 }}>
                            Activity
                        </Typography>
                        <Box sx={{ position: 'relative' }}>
                            {collapsedTimeline.map((t, i) => {
                                const cfg = TIMELINE_EVENTS[t.event] || {
                                    label: t.event,
                                    icon: <TimelineIcon sx={{ fontSize: 18 }} />,
                                    color: MUTED,
                                    bg: SURFACE,
                                };
                                const isLast = i === collapsedTimeline.length - 1;
                                const skipNotes = !t.notes
                                    || t.notes === cfg.label
                                    || t.notes === 'Account created'
                                    || (t.event === 'wizard_steps_reviewed' && !t.notes);
                                return (
                                    <Box
                                        key={`${t.event}-${t.timestamp || i}`}
                                        sx={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 1.25, minHeight: 52 }}
                                    >
                                        <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                                            {!isLast && (
                                                <Box sx={{
                                                    position: 'absolute',
                                                    top: 32,
                                                    bottom: -4,
                                                    width: 2,
                                                    background: BORDER,
                                                    borderRadius: 1,
                                                }} />
                                            )}
                                            <Box sx={{
                                                width: 32,
                                                height: 32,
                                                borderRadius: '10px',
                                                background: cfg.bg,
                                                color: cfg.color,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                border: `1px solid ${BORDER}`,
                                                zIndex: 1,
                                                flexShrink: 0,
                                            }}>
                                                {cfg.icon}
                                            </Box>
                                        </Box>
                                        <Box sx={{ pb: isLast ? 0 : 1.5, minWidth: 0 }}>
                                            <Typography sx={{ fontWeight: 700, color: TEXT, fontSize: '0.84rem', letterSpacing: '-0.01em' }}>
                                                {cfg.label}
                                            </Typography>
                                            {!skipNotes && (
                                                <Typography sx={{ display: 'block', mt: 0.2, fontSize: '0.75rem', color: MUTED, lineHeight: 1.4 }}>
                                                    {t.notes}
                                                </Typography>
                                            )}
                                        </Box>
                                        <Typography sx={{ fontSize: '0.72rem', color: MUTED, fontWeight: 500, whiteSpace: 'nowrap', pt: 0.35 }}>
                                            {formatCompactTime(t.timestamp)}
                                        </Typography>
                                    </Box>
                                );
                            })}
                            {collapsedTimeline.length === 0 && (
                                <Typography variant="body2" sx={{ color: MUTED, py: 3, textAlign: 'center' }}>
                                    No activity yet.
                                </Typography>
                            )}
                        </Box>

                        {log?.browser && (
                            <Box sx={{
                                mt: 1.5,
                                pt: 1.5,
                                borderTop: `1px solid ${BORDER}`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                color: MUTED,
                            }}>
                                <DevicesOutlinedIcon sx={{ fontSize: 16 }} />
                                <Typography sx={{ fontSize: '0.75rem' }}>
                                    {log.browser} · {log.deviceType}{log.ipAddress ? ` · ${log.ipAddress}` : ''}
                                </Typography>
                            </Box>
                        )}
                    </>
                )}
                {!loading && error && (
                    <Typography variant="body2" sx={{ color: MUTED, py: 4, textAlign: 'center' }}>
                        {error}
                    </Typography>
                )}
                {!loading && !error && !data && (
                    <Typography variant="body2" sx={{ color: MUTED, py: 4, textAlign: 'center' }}>
                        No onboarding data found.
                    </Typography>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
                <Button onClick={onClose} sx={ghostBtnSx}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};

const OnboardingPolicySettings = ({ policies, onOpenControl }) => {
    const mandatoryPolicy = (policies || []).find((p) => p.status === 'Active' && p.isMandatoryOnboarding);

    return (
        <Box sx={{ ...cardSx, mb: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                    <Box sx={{ ...iconBoxSx, background: mandatoryPolicy ? SUCCESS_BG : SURFACE, color: mandatoryPolicy ? SUCCESS_TEXT : MUTED, border: `1px solid ${mandatoryPolicy ? SUCCESS_BORDER : BORDER}` }}>
                        <CheckCircleIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: MUTED, fontFamily: FONT }}>
                            First-login notice
                        </Typography>
                        <Typography sx={{ fontWeight: 700, color: TEXT, fontFamily: FONT, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
                            {mandatoryPolicy
                                ? `${mandatoryPolicy.name} · v${mandatoryPolicy.version}`
                                : 'Not set — new hires will skip the notice unless you configure it'}
                        </Typography>
                    </Box>
                </Box>
                {onOpenControl && (
                    <Button size="small" variant="outlined" onClick={onOpenControl} sx={outlineBtnSx}>
                        Manage in control panel
                    </Button>
                )}
            </Box>
        </Box>
    );
};

const SUMMARY_CARDS = [
    { key: '', label: 'All', color: TEXT, bg: SURFACE, border: BORDER },
    { key: 'completed', label: 'Completed', color: SUCCESS_TEXT, bg: SUCCESS_BG, border: SUCCESS_BORDER },
    { key: 'in_progress', label: 'In Progress', color: INFO_TEXT, bg: INFO_BG, border: '#BFDBFE' },
    { key: 'incomplete', label: 'Incomplete', color: WARN_TEXT, bg: WARN_BG, border: '#FBD38D' },
    { key: 'overdue', label: 'Overdue', color: RED_DARK, bg: RED_BG, border: '#FBBCBC' },
];

const ComplianceDashboard = ({ policies, onRefreshPolicies, onOpenControl }) => {
    const [logs, setLogs] = useState([]);
    const [total, setTotal] = useState(0);
    const [summary, setSummary] = useState({ total: 0, completed: 0, in_progress: 0, pending: 0, overdue: 0, expired: 0, incomplete: 0 });
    const [hasSummary, setHasSummary] = useState(false);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({ status: '', department: '', q: '' });
    const [searchInput, setSearchInput] = useState('');
    const [timelineDialog, setTimelineDialog] = useState({ open: false, userId: null, userName: '', logId: null });
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setFilters((f) => {
                const q = searchInput.trim();
                if (f.q === q) return f;
                setPage(1);
                return { ...f, q };
            });
        }, 350);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const loadLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, limit: PAGE_SIZE });
            if (filters.status) params.set('status', filters.status);
            if (filters.department) params.set('department', filters.department);
            if (filters.q) params.set('q', filters.q);
            const { data } = await api.get(`/onboarding/admin/compliance?${params}`);
            setLogs(data.logs || []);
            setTotal(data.total || 0);
            if (data.summary) {
                setSummary(data.summary);
                setHasSummary(true);
            } else {
                setHasSummary(false);
                if (!filters.status) {
                    setSummary((prev) => ({ ...prev, total: data.total || 0 }));
                }
            }
        } catch (e) {
            console.error('[ComplianceDashboard] loadLogs error:', e.message);
        } finally {
            setLoading(false);
        }
    }, [page, filters]);

    useEffect(() => { loadLogs(); }, [loadLogs]);

    const handleExport = async () => {
        setExporting(true);
        try {
            const params = new URLSearchParams({ format: 'csv' });
            if (filters.status) params.set('status', filters.status);
            if (filters.department) params.set('department', filters.department);
            if (filters.q) params.set('q', filters.q);

            const { data } = await api.get(
                `/onboarding/admin/compliance/export?${params}`,
                { responseType: 'blob' }
            );

            const url = window.URL.createObjectURL(new Blob([data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'compliance_report.csv';
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error('[ComplianceDashboard] export error:', e.message);
        } finally {
            setExporting(false);
        }
    };

    const openTimeline = (log, event) => {
        event?.stopPropagation?.();
        const userId = resolveLogUserId(log);
        if (!userId) {
            console.error('[ComplianceDashboard] Missing user id for timeline', log?._id);
            return;
        }
        setTimelineDialog({
            open: true,
            userId,
            userName: log.userName || 'Employee',
            logId: log._id,
        });
    };

    const setStatusFilter = (status) => {
        setFilters((f) => ({ ...f, status }));
        setPage(1);
    };

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);

    const summaryCounts = {
        '': summary.total,
        completed: summary.completed,
        in_progress: summary.in_progress || 0,
        incomplete: summary.incomplete || 0,
        overdue: summary.overdue,
    };

    return (
        <Box>
            <OnboardingPolicySettings policies={policies} onOpenControl={onOpenControl} />

            <Box sx={cardSx}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2, gap: 2, flexWrap: 'wrap' }}>
                    <Box>
                        <Typography sx={{ ...pageTitleSx, fontSize: '1rem' }}>
                            Employee progress
                        </Typography>
                        <Typography sx={{ fontSize: '0.8rem', color: MUTED, mt: 0.35, fontFamily: FONT }}>
                            Policy, tour, and profile at a glance. Open a row for the full journey.
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<DownloadIcon />}
                            onClick={handleExport}
                            disabled={exporting}
                            sx={ghostBtnSx}
                        >
                            Export CSV
                        </Button>
                        <IconButton
                            size="small"
                            onClick={loadLogs}
                            disabled={loading}
                            aria-label="Refresh"
                            sx={{ border: `1px solid ${BORDER}`, borderRadius: '10px', color: MUTED }}
                        >
                            <RefreshIcon fontSize="small" />
                        </IconButton>
                    </Box>
                </Box>

                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(5, minmax(0, 1fr))' },
                    gap: 1,
                    mb: 2,
                }}>
                    {SUMMARY_CARDS.map((card) => {
                        const active = filters.status === card.key;
                        const count = summaryCounts[card.key];
                        return (
                            <Box
                                key={card.label}
                                component="button"
                                type="button"
                                onClick={() => setStatusFilter(card.key)}
                                sx={{
                                    all: 'unset',
                                    boxSizing: 'border-box',
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    border: `1px solid ${active ? card.border : BORDER}`,
                                    background: active ? card.bg : '#fff',
                                    borderRadius: '12px',
                                    px: 1.5,
                                    py: 1.15,
                                    fontFamily: FONT,
                                    transition: 'border-color 0.15s ease, background 0.15s ease',
                                    '&:hover': { borderColor: card.border, background: card.bg },
                                    '&:focus-visible': { outline: `2px solid ${RED}`, outlineOffset: 2 },
                                }}
                            >
                                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>
                                    {card.label}
                                </Typography>
                                <Typography sx={{ mt: 0.2, fontWeight: 700, fontSize: '1.2rem', color: active ? card.color : TEXT, letterSpacing: '-0.03em', lineHeight: 1.2 }}>
                                    {hasSummary || card.key === '' ? (count ?? 0) : '–'}
                                </Typography>
                            </Box>
                        );
                    })}
                </Box>

                <Box sx={{ display: 'flex', gap: 1.25, mb: 2, flexWrap: 'wrap' }}>
                    <TextField
                        size="small"
                        placeholder="Search name or employee code"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        sx={{ minWidth: 240, flex: 1, ...fieldSx }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchOutlinedIcon sx={{ fontSize: 18, color: MUTED }} />
                                </InputAdornment>
                            ),
                        }}
                    />
                    <TextField
                        size="small"
                        label="Department"
                        value={filters.department}
                        onChange={(e) => { setFilters((f) => ({ ...f, department: e.target.value })); setPage(1); }}
                        sx={{ minWidth: 160, ...fieldSx }}
                    />
                </Box>

                <TableContainer
                    component={Paper}
                    variant="outlined"
                    sx={{
                        borderRadius: '12px',
                        borderColor: BORDER,
                        overflowX: 'auto',
                        overflowY: 'hidden',
                        boxShadow: 'none',
                        WebkitOverflowScrolling: 'touch',
                    }}
                >
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                {['Employee', 'Notice', 'Viewed', 'Read time', 'Outcome', 'Progress', 'Deadline', 'Status', ''].map((col) => (
                                    <TableCell key={col || 'action'} sx={tableHeadCellSx}>{col}</TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading && (
                                <TableRow>
                                    <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                                        <CircularProgress size={24} sx={{ color: RED }} />
                                    </TableCell>
                                </TableRow>
                            )}
                            {!loading && logs.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={9} align="center" sx={{ color: MUTED, py: 6 }}>
                                        <Typography sx={{ fontWeight: 600, color: TEXT, mb: 0.5 }}>No matching employees</Typography>
                                        <Typography variant="body2" sx={{ color: MUTED }}>
                                            Try another status, department, or search.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                            {!loading && logs.map((log) => {
                                const user = log.userId || {};
                                const displayStatus = log.displayStatus || log.status;
                                const tourDone = log.timeline?.some((t) => t.event === 'tour_completed')
                                    || user.onboarding?.tourCompleted;
                                const profileDone = displayStatus === 'completed';
                                const isOverdue = log.profileDeadline && displayStatus !== 'completed'
                                    && new Date() > new Date(log.profileDeadline);

                                return (
                                    <TableRow
                                        key={log._id}
                                        hover
                                        onClick={(e) => openTimeline(log, e)}
                                        sx={{ cursor: 'pointer' }}
                                    >
                                        <TableCell sx={{ py: 1.5 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: TEXT, fontFamily: FONT }}>
                                                {log.userName}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: MUTED, fontFamily: FONT }}>
                                                {[log.employeeCode, log.department].filter(Boolean).join(' · ') || '—'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ py: 1.5, maxWidth: 180 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: TEXT, fontFamily: FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {log.policyName || '—'}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: MUTED, fontFamily: FONT }}>
                                                {log.templateVersion ? `Template v${log.templateVersion}` : `v${log.policyVersion || '—'}`}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                            <Typography variant="caption" sx={{ color: log.viewedAt ? TEXT : MUTED, fontFamily: FONT, fontWeight: log.viewedAt ? 600 : 500 }}>
                                                {log.viewedAt
                                                    ? new Date(log.viewedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                                                    : 'Not viewed'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                            <Typography variant="caption" sx={{ color: TEXT, fontFamily: FONT, fontWeight: 600 }}>
                                                {formatDuration(log.wizardDurationSeconds || log.readingDurationSeconds)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            {log.outcome ? (
                                                <Chip
                                                    size="small"
                                                    label={OUTCOME_LABELS[log.outcome] || log.outcome}
                                                    sx={{
                                                        height: 22,
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700,
                                                        background: log.outcome === 'consented' ? SUCCESS_BG : WARN_BG,
                                                        color: log.outcome === 'consented' ? SUCCESS_TEXT : WARN_TEXT,
                                                    }}
                                                />
                                            ) : (
                                                <Typography variant="caption" sx={{ color: MUTED }}>—</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <OnboardingSteps
                                                policyDone={!!log.accepted}
                                                tourDone={!!tourDone}
                                                profileDone={!!profileDone}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                            {log.profileDeadline ? (
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        color: isOverdue ? RED_DARK : MUTED,
                                                        fontWeight: isOverdue ? 700 : 500,
                                                        fontFamily: FONT,
                                                    }}
                                                >
                                                    {new Date(log.profileDeadline).toLocaleDateString('en-IN', {
                                                        day: 'numeric',
                                                        month: 'short',
                                                        year: 'numeric',
                                                    })}
                                                    {isOverdue ? ' · overdue' : ''}
                                                </Typography>
                                            ) : (
                                                <Typography variant="caption" sx={{ color: MUTED }}>—</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <StatusChip status={displayStatus} />
                                        </TableCell>
                                        <TableCell align="right" sx={{ width: 108 }}>
                                            <Button
                                                size="small"
                                                onClick={(e) => openTimeline(log, e)}
                                                endIcon={<ChevronRightIcon sx={{ fontSize: 16 }} />}
                                                sx={{
                                                    ...ghostBtnSx,
                                                    minWidth: 0,
                                                    px: 1,
                                                    py: 0.25,
                                                    color: RED_DARK,
                                                    borderColor: 'transparent',
                                                    '&:hover': {
                                                        borderColor: 'rgba(198, 40, 40, 0.28)',
                                                        background: RED_BG,
                                                        color: RED_DARK,
                                                    },
                                                }}
                                            >
                                                Details
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 2, flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ color: MUTED, fontFamily: FONT }}>
                        {total === 0 ? 'No records' : `${from}–${to} of ${total}`}
                    </Typography>
                    {totalPages > 1 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Button size="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} sx={{ textTransform: 'none', color: MUTED }}>
                                Prev
                            </Button>
                            <Typography variant="body2" sx={{ color: MUTED }}>
                                {page} / {totalPages}
                            </Typography>
                            <Button size="small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} sx={{ textTransform: 'none', color: MUTED }}>
                                Next
                            </Button>
                        </Box>
                    )}
                </Box>
            </Box>

            <TimelineDialog
                open={timelineDialog.open}
                onClose={() => setTimelineDialog({ open: false, userId: null, userName: '', logId: null })}
                userId={timelineDialog.userId}
                userName={timelineDialog.userName}
                logId={timelineDialog.logId}
            />
        </Box>
    );
};

export default ComplianceDashboard;
