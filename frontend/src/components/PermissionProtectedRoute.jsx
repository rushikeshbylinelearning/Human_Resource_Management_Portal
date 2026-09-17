// frontend/src/components/PermissionProtectedRoute.jsx
import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Box, Typography, Button, Paper } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import PageFallbackSkeleton from './PageFallbackSkeleton';

const PermissionProtectedRoute = ({ 
  children, 
  requiredPermission, 
  fallbackPath = '/dashboard',
  showAccessDenied = true,
  adminBypass = true,
}) => {
  const { isAuthenticated, user, authStatus } = useAuth();
  const { canAccess } = usePermissions();
  const location = useLocation();

  // NON-BLOCKING: authStatus === 'unknown' shows skeleton, NOT redirect
  // This allows UI to render immediately while auth resolves in background
  if (authStatus === 'unknown') {
    return <PageFallbackSkeleton />;
  }

  // Backend confirmed: user is not authenticated - redirect to login
  if (authStatus === 'unauthenticated' || !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Admin always has access unless explicitly disabled for this route
  if (adminBypass && user?.role === 'Admin') {
    return children;
  }

  // Check if user has the required permission
  const hasPermission = requiredPermission ? canAccess[requiredPermission]?.() : true;

  if (!hasPermission) {
    if (showAccessDenied) {
      return (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '60vh',
          padding: 2
        }}>
          <Paper 
            elevation={3}
            sx={{ 
              padding: 4, 
              textAlign: 'center',
              maxWidth: 400,
              borderRadius: '16px'
            }}
          >
            <LockIcon 
              sx={{ 
                fontSize: 64, 
                color: '#e53935', 
                marginBottom: 2 
              }} 
            />
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: '#e53935' }}>
              Access Denied
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              You don't have permission to access this feature. Please contact your administrator if you believe this is an error.
            </Typography>
            <Button 
              variant="contained"
              onClick={() => window.history.back()}
              sx={{
                background: 'linear-gradient(135deg, #e53935 0%, #d32f2f 100%)',
                borderRadius: '25px',
                padding: '8px 24px',
                fontWeight: 600,
                textTransform: 'none',
                boxShadow: '0 4px 12px rgba(229, 57, 53, 0.3)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #d32f2f 0%, #c62828 100%)',
                  boxShadow: '0 6px 16px rgba(229, 57, 53, 0.4)',
                }
              }}
            >
              Go Back
            </Button>
          </Paper>
        </Box>
      );
    }
    
    return <Navigate to={fallbackPath} replace />;
  }

  return children;
};

export default PermissionProtectedRoute;


