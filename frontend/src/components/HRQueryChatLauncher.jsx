import React, { Suspense, useState } from 'react';
import {
    Fab,
    Tooltip,
    Box,
    Paper,
    Typography,
    ClickAwayListener,
    Drawer,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import useDraggableFab from '../hooks/useDraggableFab';
import { usePermissions } from '../hooks/usePermissions';
const HRQueryFloatingChat = lazyWithRetry(() => import('./HRQueryFloatingChat'));
const HRQueryChat = lazyWithRetry(() => import('./HRQueryChat'));
const ITTicketFloatingChat = lazyWithRetry(() => import('./ITSupport/ITTicketFloatingChat'));
const ITTicketChat = lazyWithRetry(() => import('./ITSupport/ITTicketChat'));

/**
 * Unified FAB: HR Query + IT Ticket quick actions.
 */
const HRQueryChatLauncher = () => {
    const { canAccess } = usePermissions();
    const isHrOperator = canAccess.manageHRQueries();
    const isItOperator = canAccess.manageITSupport();

    const [menuOpen, setMenuOpen] = useState(false);
    const [hrOpen, setHrOpen] = useState(false);
    const [itOpen, setItOpen] = useState(false);
    const { isDragging, wrapClick, dragHandlers, positionSx } = useDraggableFab();

    if (hrOpen && isHrOperator) {
        return (
            <Suspense fallback={null}>
                <HRQueryFloatingChat defaultOpen onClose={() => setHrOpen(false)} />
            </Suspense>
        );
    }

    if (hrOpen && !isHrOperator) {
        return (
            <Drawer
                anchor="right"
                open
                onClose={() => setHrOpen(false)}
                PaperProps={{
                    sx: {
                        width: { xs: '100%', sm: 400 },
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    },
                }}
            >
                <Suspense fallback={null}>
                    <HRQueryChat onClose={() => setHrOpen(false)} />
                </Suspense>
            </Drawer>
        );
    }

    if (itOpen && isItOperator) {
        return (
            <Suspense fallback={null}>
                <ITTicketFloatingChat defaultOpen onClose={() => setItOpen(false)} />
            </Suspense>
        );
    }

    if (itOpen && !isItOperator) {
        return (
            <Drawer
                anchor="right"
                open
                onClose={() => setItOpen(false)}
                PaperProps={{
                    sx: {
                        width: { xs: '100%', sm: 400 },
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    },
                }}
            >
                <Suspense fallback={null}>
                    <ITTicketChat onClose={() => setItOpen(false)} />
                </Suspense>
            </Drawer>
        );
    }

    const openHr = () => {
        setMenuOpen(false);
        setHrOpen(true);
    };

    const openIt = () => {
        setMenuOpen(false);
        setItOpen(true);
    };

    return (
        <>
            <ClickAwayListener onClickAway={() => setMenuOpen(false)}>
                <Box sx={{ position: 'fixed', right: positionSx.right, bottom: positionSx.bottom, zIndex: 1300 }}>
                    {menuOpen && (
                        <Paper
                            elevation={8}
                            sx={{
                                position: 'absolute',
                                bottom: 64,
                                right: 0,
                                borderRadius: 2,
                                overflow: 'hidden',
                                minWidth: 200,
                                mb: 1,
                            }}
                        >
                            <Box
                                role="button"
                                tabIndex={0}
                                onClick={wrapClick(openHr)}
                                onKeyDown={(e) => e.key === 'Enter' && openHr()}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1.5,
                                    px: 2,
                                    py: 1.25,
                                    cursor: 'pointer',
                                    '&:hover': { bgcolor: 'action.hover' },
                                }}
                            >
                                <QuestionAnswerIcon color="primary" fontSize="small" />
                                <Typography variant="body2" fontWeight={600}>HR Query</Typography>
                            </Box>
                            <Box
                                role="button"
                                tabIndex={0}
                                onClick={wrapClick(openIt)}
                                onKeyDown={(e) => e.key === 'Enter' && openIt()}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1.5,
                                    px: 2,
                                    py: 1.25,
                                    cursor: 'pointer',
                                    borderTop: '1px solid',
                                    borderColor: 'divider',
                                    '&:hover': { bgcolor: 'action.hover' },
                                }}
                            >
                                <SupportAgentIcon sx={{ color: '#e74c3c' }} fontSize="small" />
                                <Typography variant="body2" fontWeight={600}>IT Query</Typography>
                            </Box>
                        </Paper>
                    )}
                    <Tooltip title="Help & support" placement="left" disableHoverListener={isDragging}>
                        <Fab
                            color="primary"
                            aria-label="Open help menu"
                            onClick={wrapClick(() => setMenuOpen((o) => !o))}
                            {...dragHandlers}
                            sx={{
                                ...positionSx,
                                background: 'linear-gradient(135deg, #C62828 0%, #B71C1C 100%)',
                                color: 'white',
                                boxShadow: isDragging
                                    ? '0 16px 32px rgba(198, 40, 40, 0.4)'
                                    : '0 8px 24px rgba(198, 40, 40, 0.28)',
                                '&:hover': {
                                    background: 'linear-gradient(135deg, #B71C1C 0%, #B71C1C 100%)',
                                },
                            }}
                        >
                            {menuOpen ? <CloseIcon /> : <AddIcon />}
                        </Fab>
                    </Tooltip>
                </Box>
            </ClickAwayListener>
        </>
    );
};

export default HRQueryChatLauncher;
