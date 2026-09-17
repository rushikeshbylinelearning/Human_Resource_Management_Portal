// frontend/src/components/NotificationPermissionPrompt.jsx
import React, { useState, useEffect } from 'react';
import { 
    Box, 
    Button, 
    Typography, 
    Alert, 
    Card, 
    CardContent,
    IconButton,
    Tooltip
} from '@mui/material';
import Notifications from '@mui/icons-material/Notifications';
import NotificationsOff from '@mui/icons-material/NotificationsOff';
import Close from '@mui/icons-material/Close';
import CheckCircle from '@mui/icons-material/CheckCircle';
import Error from '@mui/icons-material/Error';

const NotificationPermissionPrompt = ({ onPermissionChange }) => {
    const [permission, setPermission] = useState('default');
    const [showPrompt, setShowPrompt] = useState(false);
    const [isRequesting, setIsRequesting] = useState(false);

    useEffect(() => {
        // Check current notification permission
        if ('Notification' in window) {
            setPermission(Notification.permission);
            // Show prompt if permission is default (not yet requested)
            setShowPrompt(Notification.permission === 'default');
        } else {
            setPermission('unsupported');
        }
    }, []);

    const requestPermission = async () => {
        if (!('Notification' in window)) {
            return;
        }

        setIsRequesting(true);
        try {
            const result = await Notification.requestPermission();
            setPermission(result);
            setShowPrompt(false);
            
            if (onPermissionChange) {
                onPermissionChange(result);
            }

            // Show a test notification if permission was granted
            if (result === 'granted') {
                setTimeout(() => {
                    new Notification('Notifications Enabled!', {
                        body: 'You will now receive desktop notifications for attendance updates.',
                        icon: '/favicon.ico',
                        tag: 'permission-granted'
                    });
                }, 500);
            }
        } catch (error) {
            console.error('Error requesting notification permission:', error);
        } finally {
            setIsRequesting(false);
        }
    };

    const closePrompt = () => {
        setShowPrompt(false);
    };

    // Don't show anything if notifications are not supported
    if (permission === 'unsupported') {
        return null;
    }

    // Don't show prompt if permission is already granted or denied
    if (permission !== 'default' || !showPrompt) {
        return null;
    }

    return (
        <Card 
            sx={{ 
                position: 'fixed',
                top: 20,
                right: 20,
                zIndex: 9999,
                maxWidth: 400,
                boxShadow: 3,
                border: '1px solid #e0e0e0'
            }}
        >
            <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Notifications color="primary" />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            Enable Notifications
                        </Typography>
                    </Box>
                    <IconButton 
                        size="small" 
                        onClick={closePrompt}
                        sx={{ ml: 1 }}
                    >
                        <Close />
                    </IconButton>
                </Box>

                <Typography variant="body2" sx={{ mb: 2, color: '#666' }}>
                    Get instant desktop notifications for:
                </Typography>

                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <CheckCircle color="success" sx={{ fontSize: 16 }} />
                        Clock-in/Clock-out confirmations
                    </Typography>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <CheckCircle color="success" sx={{ fontSize: 16 }} />
                        Leave request updates
                    </Typography>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <CheckCircle color="success" sx={{ fontSize: 16 }} />
                        Admin notifications (if applicable)
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        variant="contained"
                        onClick={requestPermission}
                        disabled={isRequesting}
                        startIcon={isRequesting ? <NotificationsOff /> : <Notifications />}
                        sx={{ flex: 1 }}
                    >
                        {isRequesting ? 'Requesting...' : 'Enable Notifications'}
                    </Button>
                    <Button
                        variant="outlined"
                        onClick={closePrompt}
                        disabled={isRequesting}
                    >
                        Later
                    </Button>
                </Box>

                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#999' }}>
                    You can change this setting anytime in your browser
                </Typography>
            </CardContent>
        </Card>
    );
};

// Notification Status Component
export const NotificationStatus = ({ compact = false }) => {
    const [permission, setPermission] = useState('default');

    useEffect(() => {
        if ('Notification' in window) {
            setPermission(Notification.permission);
        }
    }, []);

    if (compact) {
        return (
            <Tooltip title={`Notifications: ${permission}`}>
                <IconButton size="small">
                    {permission === 'granted' ? (
                        <Notifications color="success" />
                    ) : (
                        <NotificationsOff color="warning" />
                    )}
                </IconButton>
            </Tooltip>
        );
    }

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {permission === 'granted' ? (
                <>
                    <Notifications color="success" />
                    <Typography variant="body2" color="success">
                        Notifications Enabled
                    </Typography>
                </>
            ) : permission === 'denied' ? (
                <>
                    <NotificationsOff color="error" />
                    <Typography variant="body2" color="error">
                        Notifications Blocked
                    </Typography>
                </>
            ) : (
                <>
                    <NotificationsOff color="warning" />
                    <Typography variant="body2" color="warning">
                        Notifications Not Set
                    </Typography>
                </>
            )}
        </Box>
    );
};

export default NotificationPermissionPrompt;



