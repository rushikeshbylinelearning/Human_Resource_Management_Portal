import React, { Suspense, useState } from 'react';
import { Fab, Tooltip } from '@mui/material';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import useDraggableFab from '../hooks/useDraggableFab';

const HRQueryFloatingChat = lazyWithRetry(() => import('./HRQueryFloatingChat'));

/**
 * Lightweight FAB so the 150KB chat + date-fns stay off the first paint.
 * The real drawer loads only after the user opens it.
 */
const HRQueryChatLauncher = () => {
    const [mounted, setMounted] = useState(false);
    const { isDragging, wrapClick, dragHandlers, positionSx } = useDraggableFab();

    if (mounted) {
        return (
            <Suspense fallback={null}>
                <HRQueryFloatingChat defaultOpen />
            </Suspense>
        );
    }

    return (
        <Tooltip title="HR Queries" placement="left" disableHoverListener={isDragging}>
            <Fab
                color="primary"
                aria-label="HR Queries"
                onClick={wrapClick(() => setMounted(true))}
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
                        boxShadow: '0 12px 28px rgba(198, 40, 40, 0.35)',
                    },
                }}
            >
                    <QuestionAnswerIcon />
            </Fab>
        </Tooltip>
    );
};

export default HRQueryChatLauncher;
