import { useEffect, useState } from 'react';
import {
    Box, Typography, Chip, CircularProgress, Stack, Divider, LinearProgress,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import api from '../../api/axios';
import { RED, RED_DARK, RED_BG, TEXT, MUTED, profileCardSx, iconWellSx } from './adminEmployeeTheme';

const eventConfig = {
    account_created: { label: 'Account Created', color: RED },
    first_login: { label: 'First Login', color: RED },
    policy_opened: { label: 'Policy Opened', color: RED_DARK },
    reading_started: { label: 'Reading Started', color: RED_DARK },
    reading_completed: { label: 'Reading Completed', color: '#16a34a' },
    policy_accepted: { label: 'Policy Accepted', color: '#16a34a' },
    tour_started: { label: 'Tour Started', color: RED_DARK },
    tour_completed: { label: 'Tour Completed', color: '#16a34a' },
    profile_completed: { label: 'Profile Completed', color: '#16a34a' },
    deadline_passed: { label: 'Deadline Passed', color: RED },
    onboarding_completed: { label: 'Onboarding Completed', color: '#16a34a' },
    forced_by_admin: { label: 'Reset by Admin', color: RED_DARK },
};

const StatusBadge = ({ ok, label }) => (
    <Chip
        size="small"
        icon={ok ? <CheckCircleOutlineIcon /> : <CancelOutlinedIcon />}
        label={label}
        sx={{
            background: ok ? '#f0fdf4' : RED_BG,
            color: ok ? '#166534' : RED_DARK,
            fontWeight: 600,
            fontSize: '0.75rem',
            border: `1px solid ${ok ? '#bbf7d0' : '#FBBCBC'}`,
            '& .MuiChip-icon': { color: 'inherit', fontSize: 16 },
        }}
    />
);

const AdminEmployeeCompliancePanel = ({ employeeId }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!employeeId) return;
        setLoading(true);
        api.get(`/onboarding/admin/compliance/${employeeId}/timeline`)
            .then((r) => setData(r.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [employeeId]);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size={28} sx={{ color: RED }} />
            </Box>
        );
    }

    if (!data) {
        return (
            <Box sx={{ ...profileCardSx, textAlign: 'center', py: 4 }}>
                <Typography variant="body2" sx={{ color: MUTED }}>
                    No onboarding compliance data available.
                </Typography>
            </Box>
        );
    }

    const profilePct = data.profileFieldsTotal
        ? Math.round((data.profileFilledCount / data.profileFieldsTotal) * 100)
        : 0;

    return (
        <Stack spacing={2}>
            <Box sx={profileCardSx}>
                <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 2 }}>
                    <Box sx={iconWellSx()}>
                        <VerifiedUserOutlinedIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: TEXT, letterSpacing: '-0.02em' }}>
                        Onboarding Compliance
                    </Typography>
                </Stack>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2.5 }}>
                    <StatusBadge ok={!!data.log?.accepted} label={`Policy ${data.log?.accepted ? 'Accepted' : 'Pending'}`} />
                    <StatusBadge ok={!!data.user?.onboarding?.tourCompleted} label={`Tour ${data.user?.onboarding?.tourCompleted ? 'Done' : 'Pending'}`} />
                    <StatusBadge ok={!!data.profileCompleted} label={`Profile ${data.profileCompleted ? 'Complete' : 'Incomplete'}`} />
                    {data.log?.readingDurationSeconds > 0 && (
                        <Chip
                            size="small"
                            label={`Reading: ${Math.round(data.log.readingDurationSeconds / 60)} min`}
                            sx={{ background: RED_BG, color: RED_DARK, fontWeight: 600, fontSize: '0.75rem' }}
                        />
                    )}
                </Stack>

                <Typography variant="caption" sx={{ color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Profile Completion
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.75 }}>
                    <LinearProgress
                        variant="determinate"
                        value={profilePct}
                        sx={{
                            flex: 1,
                            height: 8,
                            borderRadius: 4,
                            background: RED_BG,
                            '& .MuiLinearProgress-bar': { background: RED, borderRadius: 4 },
                        }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 700, color: TEXT, minWidth: 40 }}>
                        {profilePct}%
                    </Typography>
                </Box>
                <Typography variant="caption" sx={{ color: MUTED, mt: 0.5, display: 'block' }}>
                    {data.profileFilledCount} of {data.profileFieldsTotal} fields completed
                </Typography>

                {data.log?.policyId && (
                    <>
                        <Divider sx={{ my: 2 }} />
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <Box>
                                <Typography variant="caption" sx={{ color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Mandatory Policy
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: TEXT, mt: 0.5 }}>
                                    {data.log.policyId?.name || '—'}
                                </Typography>
                            </Box>
                            {data.log.acceptedAt && (
                                <Box>
                                    <Typography variant="caption" sx={{ color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        Accepted On
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: TEXT, mt: 0.5 }}>
                                        {new Date(data.log.acceptedAt).toLocaleString('en-IN')}
                                    </Typography>
                                </Box>
                            )}
                        </Stack>
                        {data.log.browser && (
                            <Typography variant="caption" sx={{ color: MUTED, mt: 1.5, display: 'block' }}>
                                Accepted from {data.log.ipAddress || 'unknown IP'} · {data.log.browser} · {data.log.deviceType}
                            </Typography>
                        )}
                    </>
                )}
            </Box>

            <Box sx={profileCardSx}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: TEXT, letterSpacing: '-0.02em', mb: 2 }}>
                    Activity Timeline
                </Typography>

                {(!data.timeline || data.timeline.length === 0) ? (
                    <Typography variant="body2" sx={{ color: MUTED }}>
                        No onboarding events recorded yet.
                    </Typography>
                ) : (
                    <Box sx={{ position: 'relative', pl: 3 }}>
                        <Box sx={{
                            position: 'absolute', left: 11, top: 8, bottom: 8,
                            width: 2, background: RED_BG,
                        }} />
                        {data.timeline.map((t, i) => {
                            const cfg = eventConfig[t.event] || { label: t.event, color: MUTED };
                            return (
                                <Box key={i} sx={{ display: 'flex', gap: 2, mb: 2, position: 'relative' }}>
                                    <Box sx={{
                                        width: 10, height: 10, borderRadius: '50%',
                                        background: cfg.color, border: '2px solid #fff',
                                        boxShadow: `0 0 0 2px ${cfg.color}`,
                                        flexShrink: 0, mt: '5px',
                                        position: 'absolute', left: -16,
                                    }} />
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 600, color: TEXT }}>
                                            {cfg.label}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: MUTED }}>
                                            {t.timestamp ? new Date(t.timestamp).toLocaleString('en-IN') : '—'}
                                        </Typography>
                                        {t.notes && (
                                            <Typography variant="caption" sx={{ display: 'block', color: MUTED, mt: 0.25 }}>
                                                {t.notes}
                                            </Typography>
                                        )}
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>
                )}
            </Box>
        </Stack>
    );
};

export default AdminEmployeeCompliancePanel;
