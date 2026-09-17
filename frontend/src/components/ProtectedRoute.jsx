// frontend/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageFallbackSkeleton from './PageFallbackSkeleton';

const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, authStatus } = useAuth();

    // NON-BLOCKING: authStatus === 'unknown' shows skeleton, NOT spinner
    // This allows UI to render immediately while auth resolves in background
    // Backend is source of truth - we wait for /api/auth/me response
    if (authStatus === 'unknown') {
        return <PageFallbackSkeleton />;
    }

    // Backend confirmed: user is not authenticated - redirect to login
    if (authStatus === 'unauthenticated' || !isAuthenticated) {
        // Redirect them to the /login page, but save the current location they were
        // trying to go to. This is a good UX practice.
        return <Navigate to="/login" replace />;
    }

    // Backend confirmed: user is authenticated - allow access
    return children;
};

export default ProtectedRoute;