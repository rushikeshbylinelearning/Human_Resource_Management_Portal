// frontend/src/components/onboarding/ProfileCompletionBanner.jsx
// Displayed immediately after the tour completes, on the /profile page.
// Shows a countdown of days remaining, profile completion steps, and a CTA.
// Matches the AMS Red & White premium design system.

import React, { useMemo } from 'react';
import { Box, Typography, Button, LinearProgress, Chip } from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { useOnboarding } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';

const ProfileCompletionBanner = () => {
    const { user } = useAuth();
    const { dismissProfileBanner } = useOnboarding();

    const deadline = user?.onboarding?.profileCompletionDeadline
        ? new Date(user.onboarding.profileCompletionDeadline)
        : null;

    const { daysRemaining, hoursRemaining, isOverdue } = useMemo(() => {
        if (!deadline) return { daysRemaining: 7, hoursRemaining: 0, isOverdue: false };
        const now = new Date();
        const msLeft = deadline - now;
        const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
        const hoursLeft = Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return {
            daysRemaining: Math.max(0, daysLeft),
            hoursRemaining: Math.max(0, hoursLeft),
            isOverdue: msLeft <= 0,
        };
    }, [deadline]);

    // Colour based on urgency
    const urgencyColor = isOverdue
        ? '#dc2626'
        : daysRemaining <= 1
        ? '#ea580c'
        : daysRemaining <= 3
        ? '#d97706'
        : '#D32F2F'; // default brand red

    const deadlineLabel = isOverdue
        ? 'Overdue — please complete now'
        : daysRemaining === 0
        ? `${hoursRemaining}h remaining today`
        : daysRemaining === 1
        ? '1 Day Remaining'
        : `${daysRemaining} Days Remaining`;

    return (
        <Box
            sx={{
                width: '100%',
                background: '#ffffff',
                border: `1.5px solid ${urgencyColor}30`,
                borderRadius: 3,
                overflow: 'hidden',
                boxShadow: `0 4px 20px rgba(0,0,0,0.06), 0 0 0 1px ${urgencyColor}10`,
                mb: 3,
            }}
        >
            {/* Top accent bar */}
            <Box sx={{ height: 4, background: `linear-gradient(90deg, ${urgencyColor} 0%, ${urgencyColor}aa 100%)` }} />

            <Box sx={{ px: { xs: 2.5, md: 3.5 }, py: 2.5 }}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 2,
                        flexWrap: 'wrap',
                    }}
                >
                    {/* Left — content */}
                    <Box sx={{ flex: 1, minWidth: 220 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                            <Box
                                sx={{
                                    width: 36, height: 36,
                                    borderRadius: '9px',
                                    background: `${urgencyColor}12`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}
                            >
                                <AccountCircleIcon sx={{ color: urgencyColor, fontSize: 20 }} />
                            </Box>
                            <Typography
                                variant="h6"
                                sx={{ fontWeight: 700, color: '#111827', fontSize: '0.975rem', lineHeight: 1.3 }}
                            >
                                Complete Your Profile
                            </Typography>
                        </Box>

                        <Typography variant="body2" sx={{ color: '#6b7280', mb: 1.5, ml: '52px', lineHeight: 1.6 }}>
                            Policy and guided tour are complete. Save all required profile details below
                            to finish onboarding — admin compliance stays incomplete until then.
                        </Typography>

                        {/* Progress bar */}
                        <LinearProgress
                            variant="indeterminate"
                            sx={{
                                height: 5,
                                borderRadius: 3,
                                mb: 1.5,
                                backgroundColor: `${urgencyColor}15`,
                                '& .MuiLinearProgress-bar': { backgroundColor: urgencyColor, borderRadius: 3 },
                            }}
                        />

                        {/* Deadline chip */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Chip
                                size="small"
                                label={deadlineLabel}
                                sx={{
                                    backgroundColor: `${urgencyColor}12`,
                                    color: urgencyColor,
                                    fontWeight: 700,
                                    fontSize: '0.72rem',
                                    border: `1px solid ${urgencyColor}30`,
                                }}
                            />
                            {!isOverdue && (
                                <Typography variant="caption" sx={{ color: '#6b7280' }}>
                                    to complete your profile
                                </Typography>
                            )}
                        </Box>
                    </Box>

                    {/* Right — actions */}
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1,
                            alignItems: { xs: 'stretch', sm: 'flex-end' },
                            minWidth: { xs: '100%', sm: 'auto' },
                        }}
                    >
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={dismissProfileBanner}
                            sx={{
                                color: '#6b7280',
                                borderColor: '#d1d5db',
                                textTransform: 'none',
                                fontWeight: 600,
                                borderRadius: '10px',
                                px: 2.5,
                                py: 1,
                                '&:hover': { background: '#f9fafb', borderColor: '#9ca3af' },
                            }}
                        >
                            Remind me later
                        </Button>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

export default ProfileCompletionBanner;
