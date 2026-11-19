// frontend/src/components/PageTransition.jsx
// Smooth page transitions for route changes

import React from 'react';
import { useLocation } from 'react-router-dom';
import { Box } from '@mui/material';

/**
 * Page Transition Wrapper
 * Provides fade + slide animation for page transitions
 * 
 * CRITICAL: Disabled for /profile and /leaves to prevent layout mutations
 * FIXED: Enter-only animation - no exit flash, old page stays visible while new page loads
 */
const PageTransition = ({ children }) => {
    const location = useLocation();

    // CRITICAL FIX: Disable transitions for Profile and Leaves pages
    // These pages have zero-mutation requirements
    const NO_TRANSITION_ROUTES = ['/profile', '/leaves', '/live-attendance', '/resource-requests/manage', '/employees'];
    const shouldDisableTransition = NO_TRANSITION_ROUTES.includes(location.pathname);

    // CRITICAL: Return children directly for protected routes (no animation wrapper)
    if (shouldDisableTransition) {
        return <>{children}</>;
    }

    return (
        <Box
            key={location.pathname}
            sx={{
                '@keyframes fadeIn': {
                    from: { 
                        opacity: 0
                    },
                    to: { 
                        opacity: 1
                    },
                },
                animation: 'fadeIn 150ms ease-out',
                width: '100%',
                padding: 0,
                margin: 0,
                willChange: 'opacity',
            }}
        >
            {children}
        </Box>
    );
};

export default PageTransition;















