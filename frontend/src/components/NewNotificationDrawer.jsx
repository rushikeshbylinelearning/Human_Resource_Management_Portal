import React, { useState, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { openAnnouncementHub } from '../utils/announcementHubEvents';
import { useAuth } from '../context/AuthContext';
import { Drawer, Box, Typography, IconButton, List, ListItem, ListItemIcon, ListItemText, Button, Tabs, Tab } from '@mui/material';
import {
    Close as CloseIcon, CheckCircle as CheckCircleIcon, Error as ErrorIcon, Info as InfoIcon,
    Warning as WarningIcon, NotificationsOffOutlined as NotificationsOffOutlinedIcon,
    Login as LoginIcon, Logout as LogoutIcon, Coffee as CoffeeIcon, EventNote as EventNoteIcon,
    PlayArrow as StartBreakIcon,
    Person as PersonIcon, Description as DescriptionIcon, Message as MessageIcon,
    Groups as TeamsIcon, Preview as PreviewIcon, Inventory2 as Inventory2Icon,
} from '@mui/icons-material';
import useNewNotifications from '../hooks/useNewNotifications';
import { usePermissions } from '../hooks/usePermissions';
import api from '../api/axios';
import '../styles/NotificationDrawer.css';
import { partitionNotifications, countUnread } from '../utils/requestNotifications';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { SkeletonBox } from '../components/SkeletonLoaders';

const TeamsNotificationModal = lazyWithRetry(() => import('./TeamsAttendanceNotificationSettings'));
const formatDistanceToNow = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

const getNotificationIcon = (type) => {
    const iconMap = {
        checkin: <LoginIcon className="notification-icon success" />,
        checkout: <LogoutIcon className="notification-icon info" />,
        normal_checkout: <LogoutIcon className="notification-icon info normal-checkout" />,
        early_checkout_request: <WarningIcon className="notification-icon warning early-checkout-request" />,
        early_checkout_approved: <CheckCircleIcon className="notification-icon success" />,
        early_checkout_rejected: <ErrorIcon className="notification-icon error" />,
        break_start: <CoffeeIcon className="notification-icon warning" />,
        break_end: <CoffeeIcon className="notification-icon info" />,
        leave_request: <EventNoteIcon className="notification-icon info" />,
        LEAVE_REQUEST: <EventNoteIcon className="notification-icon info" />,
        YEAR_END_LEAVE: <EventNoteIcon className="notification-icon warning" />,
        leave_approval: <EventNoteIcon className="notification-icon success" />,
        leave_rejection: <EventNoteIcon className="notification-icon error" />,
        extra_break_request: <CoffeeIcon className="notification-icon info" />,
        extra_break_approval: <CheckCircleIcon className="notification-icon success" />,
        extra_break_rejection: <ErrorIcon className="notification-icon error" />,
        probation_completion: <CheckCircleIcon className="notification-icon success" />,
        probation_warning: <WarningIcon className="notification-icon warning" />,
        half_day_marked: <WarningIcon className="notification-icon warning" />,
        profile_update: <PersonIcon className="notification-icon info" />,
        policy_added: <DescriptionIcon className="notification-icon success" />,
        policy_updated: <DescriptionIcon className="notification-icon warning" />,
        anonymous_feedback: <MessageIcon className="notification-icon info" />,
        teams_report_preview: <TeamsIcon className="notification-icon info" style={{ color: '#6264A7' }} />,
        resource_request: <Inventory2Icon className="notification-icon info" />,
        resource_request_status: <Inventory2Icon className="notification-icon success" />,
        success: <CheckCircleIcon className="notification-icon success" />,
        error: <ErrorIcon className="notification-icon error" />,
        warning: <WarningIcon className="notification-icon warning" />,
        default: <InfoIcon className="notification-icon info" />
    };
    return iconMap[type] || iconMap.default;
};

const NotificationItem = ({ notification, onMarkAsRead, onDelete, onNavigate, onStartBreak, onPromoteEmployee, onOverrideHalfDay, onOpenTeamsPreview }) => {
    const [actionLoading, setActionLoading] = useState(false);

    const handleAction = async (e, actionFn, ...args) => {
        e.stopPropagation();
        setActionLoading(true);
        await actionFn(...args);
        // No need to set loading to false if component unmounts (e.g., after delete)
    };

    const handleClick = async () => {
        console.log('[Notification] Clicked:', { 
            type: notification.type, 
            metadata: notification.metadata, 
            navigationData: notification.navigationData 
        });
        
        if (notification.type === 'teams_report_preview') {
            onNavigate(notification.navigationData || {}, notification.type, notification.metadata);
        }
        // Navigate first, then mark as read (non-blocking)
        // Handle anonymous feedback notifications - navigate to admin policies page
        else if (notification.type === 'anonymous_feedback') {
            console.log('[Notification] Anonymous feedback notification detected');
            onNavigate(
                { page: 'admin/policies', params: { section: 'anonymous-messages' } },
                notification.type,
                notification.metadata
            );
        }
        // Handle policy notifications - navigate to profile page
        else if (notification.type === 'policy_added' || notification.type === 'policy_updated') {
            const policyId = notification.metadata?.policyId || 
                            notification.navigationData?.params?.policyId;
            console.log('[Notification] Policy notification detected, policyId:', policyId);
            
            if (policyId) {
                onNavigate(
                    { page: 'profile', params: { section: 'policies', policyId } },
                    notification.type,
                    notification.metadata
                );
            } else if (notification.navigationData) {
                onNavigate(notification.navigationData, notification.type, notification.metadata);
            } else {
                // Fallback to profile page
                onNavigate({ page: 'profile', params: { section: 'policies' } }, notification.type, notification.metadata);
            }
        }
        // For profile_update, always try to navigate even if navigationData is missing
        else if (notification.type === 'profile_update') {
            const employeeId = notification.metadata?.employeeId || 
                              notification.navigationData?.params?.employeeId || 
                              notification.navigationData?.actionParams?.employeeId;
            console.log('[Notification] Profile update detected, employeeId:', employeeId);
            
            if (employeeId) {
                onNavigate(
                    { page: '/employees', params: { employeeId, openProfile: true } },
                    notification.type,
                    notification.metadata
                );
            } else if (notification.navigationData) {
                onNavigate(notification.navigationData, notification.type, notification.metadata);
            } else {
                console.warn('[Notification] Profile update but no employeeId found');
            }
        } else if (notification.type === 'resource_request' || notification.type === 'resource_request_status') {
            onNavigate(notification.navigationData || {}, notification.type, notification.metadata);
        } else if (notification.type === 'early_checkout_request' || notification.metadata?.type === 'EARLY_CHECKOUT_REQUEST') {
            onNavigate(notification.navigationData || {}, notification.type, notification.metadata);
        } else if (notification.navigationData) {
            onNavigate(notification.navigationData, notification.type, notification.metadata);
        } else {
            console.warn('[Notification] No navigation data available');
        }
        
        // Mark as read after navigation (non-blocking)
        if (!notification.read) {
            // Use setTimeout to ensure navigation happens first
            setTimeout(() => {
                onMarkAsRead(notification.id);
            }, 100);
        }
    };

    return (
        <ListItem
            className={`notification-item ${!notification.read ? 'unread' : ''} ${notification.type === 'teams_report_preview' ? 'featured' : ''}`}
            onClick={handleClick}
        >
            <ListItemIcon className="notification-icon-container">
                {getNotificationIcon(notification.type)}
            </ListItemIcon>
            <ListItemText
                className="notification-content"
                primary={
                    <Box>
                        {notification.type === 'resource_request' && (
                            <span className="notification-type-tag">Request</span>
                        )}
                        {notification.type === 'early_checkout_request' && (
                            <span className="notification-type-tag">Early checkout</span>
                        )}
                        <Typography className="notification-message" component="span">{notification.message}</Typography>
                    </Box>
                }
                secondaryTypographyProps={{ component: 'div' }}
                secondary={
                    <Box>
                        {notification.type === 'early_checkout_request' && notification.metadata?.remainingTimeMinutes != null && (
                            <Typography variant="caption" display="block" color="warning.main" fontWeight={600}>
                                Remaining: {Math.floor(notification.metadata.remainingTimeMinutes / 60)}h {notification.metadata.remainingTimeMinutes % 60}m
                            </Typography>
                        )}
                        <Typography className="notification-timestamp">{formatDistanceToNow(notification.createdAt)}</Typography>
                        {notification.actionData?.requiresAction && notification.actionData?.actionType === 'start_break' && (
                            <Box sx={{ mt: 1.5 }}>
                                <Button
                                    className="start-break-button"
                                    variant="contained"
                                    size="small"
                                    startIcon={actionLoading ? <SkeletonBox width="16px" height="16px" borderRadius="50%" /> : <StartBreakIcon />}
                                    disabled={actionLoading}
                                    onClick={(e) => handleAction(e, onStartBreak, notification.id)}
                                >
                                    {actionLoading ? 'Starting...' : 'Start Break'}
                                </Button>
                            </Box>
                        )}
                        {notification.actionData?.requiresAction && notification.actionData?.actionType === 'promote_employee' && (
                            <Box sx={{ mt: 1.5 }}>
                                <Button
                                    className="promote-employee-button"
                                    variant="contained"
                                    color="success"
                                    size="small"
                                    startIcon={actionLoading ? <SkeletonBox width="16px" height="16px" borderRadius="50%" /> : <CheckCircleIcon />}
                                    disabled={actionLoading}
                                    onClick={(e) => handleAction(e, onPromoteEmployee, notification.actionData.actionParams.employeeId, notification.id)}
                                >
                                    {actionLoading ? 'Promoting...' : 'Promote to Permanent'}
                                </Button>
                            </Box>
                        )}
                        {notification.actionData?.requiresAction && notification.actionData?.actionType === 'override_half_day' && (
                            <Box sx={{ mt: 1.5 }}>
                                <Button
                                    className="override-half-day-button"
                                    variant="contained"
                                    color="warning"
                                    size="small"
                                    startIcon={actionLoading ? <SkeletonBox width="16px" height="16px" borderRadius="50%" /> : <CheckCircleIcon />}
                                    disabled={actionLoading}
                                    onClick={(e) => handleAction(e, onOverrideHalfDay, notification.actionData.actionParams.attendanceLogId, notification.id)}
                                >
                                    {actionLoading ? 'Overriding...' : 'Do Not Mark as Half Day'}
                                </Button>
                            </Box>
                        )}
                        {notification.type === 'teams_report_preview' && (
                            <Box sx={{ mt: 1.5 }}>
                                <Button
                                    className="teams-preview-button"
                                    variant="contained"
                                    size="small"
                                    startIcon={<PreviewIcon />}
                                    onClick={(e) => { e.stopPropagation(); onOpenTeamsPreview && onOpenTeamsPreview(notification.id); }}
                                >
                                    Preview & Edit Report
                                </Button>
                            </Box>
                        )}
                    </Box>
                }
            />
            {!notification.read && <div className="unread-dot" />}
            <IconButton className="delete-button" size="small" onClick={(e) => handleAction(e, onDelete, notification.id)}>
                <CloseIcon fontSize="small" />
            </IconButton>
        </ListItem>
    );
};

const NotificationList = ({
    items, loadingNotifications, emptyTitle, emptySubtitle,
    onMarkAsRead, onDelete, onNavigate, onStartBreak, onPromoteEmployee, onOverrideHalfDay, onOpenTeamsPreview,
}) => {
    if (loadingNotifications) {
        return <Box className="flex-center" sx={{ height: '100%', py: 4 }}><SkeletonBox width="24px" height="24px" borderRadius="50%" /></Box>;
    }
    if (items.length === 0) {
        return (
            <Box className="empty-notifications">
                <Box className="empty-notifications-icon">
                    <NotificationsOffOutlinedIcon />
                </Box>
                <Typography variant="h6" className="empty-notifications-title">{emptyTitle}</Typography>
                <Typography variant="body2" className="empty-notifications-subtitle">{emptySubtitle}</Typography>
            </Box>
        );
    }
    return (
        <List className="notification-list">
            {items.map((n) => (
                <NotificationItem
                    key={n.id}
                    notification={n}
                    onMarkAsRead={onMarkAsRead}
                    onDelete={onDelete}
                    onNavigate={onNavigate}
                    onStartBreak={onStartBreak}
                    onPromoteEmployee={onPromoteEmployee}
                    onOverrideHalfDay={onOverrideHalfDay}
                    onOpenTeamsPreview={onOpenTeamsPreview}
                />
            ))}
        </List>
    );
};

const NewNotificationDrawer = ({ open, onClose, onOpenECRModal }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { canAccess } = usePermissions();
    const {
        notifications, unreadCount, isConnected, loadingNotifications,
        markAllAsRead, deleteNotification, clearAllNotifications,
        markAsRead, fetchNotifications
    } = useNewNotifications();

    const [teamsModalOpen, setTeamsModalOpen] = useState(false);
    const isAdmin = ['Admin', 'HR'].includes(user?.role);
    const [adminTab, setAdminTab] = useState(0);
    const { attendance: attendanceNotifications, requests: requestNotifications } = partitionNotifications(notifications);
    const attendanceUnread = countUnread(attendanceNotifications);
    const requestsUnread = countUnread(requestNotifications);
    const displayedNotifications = isAdmin
        ? (adminTab === 0 ? attendanceNotifications : requestNotifications)
        : notifications;
    const displayedUnread = isAdmin
        ? (adminTab === 0 ? attendanceUnread : requestsUnread)
        : unreadCount;

    const handleOpenTeamsPreview = (notificationId) => {
        onClose();
        setTeamsModalOpen(true);
        if (notificationId) {
            setTimeout(() => markAsRead(notificationId), 100);
        }
    };

    const handleNavigate = (navigationData, notificationType, metadata) => {
        onClose();
        const isAdmin = ['Admin', 'HR'].includes(user?.role);

        // ECR: Early Checkout Request — open approval modal only for admins; do not navigate
        const isECR = notificationType === 'early_checkout_request' || metadata?.type === 'EARLY_CHECKOUT_REQUEST';
        const requestId = metadata?.requestId || navigationData?.actionParams?.earlyCheckoutRequestId;
        if (isECR && requestId && isAdmin && typeof onOpenECRModal === 'function') {
            onOpenECRModal(requestId);
            return;
        }

        console.log('[Notification] Navigation triggered:', { notificationType, navigationData, metadata, isAdmin });
        
        // Handle TEAMS REPORT PREVIEW — open modal
        if (notificationType === 'teams_report_preview') {
            setTeamsModalOpen(true);
            return;
        }

        // Handle ANONYMOUS FEEDBACK notifications (Admin/HR only)
        if (notificationType === 'anonymous_feedback') {
            console.log('[Notification] Anonymous feedback notification - navigating to admin policies');
            if (!isAdmin) {
                console.warn('[Notification] Non-admin user attempted to access anonymous feedback');
                navigate('/dashboard');
                return;
            }
            navigate('/admin/policies');
            return;
        }
        
        // Handle employee document notifications
        if (notificationType === 'employee_document_assigned' || notificationType === 'employment_status_changed') {
            const documentId = metadata?.documentId || navigationData?.params?.documentId;
            if (documentId) {
                navigate(`/profile?section=documents&documentId=${documentId}`);
            } else {
                navigate('/profile?section=documents');
            }
            return;
        }

        if (notificationType === 'employee_document_pending_hr') {
            navigate('/admin/policies?tab=employee-documents');
            return;
        }

        // Handle POLICY notifications FIRST (most specific)
        if (notificationType === 'policy_added' || notificationType === 'policy_updated') {
            const policyId = metadata?.policyId || navigationData?.params?.policyId;
            console.log('[Notification] Policy notification - policyId:', policyId);
            // Navigate to profile page with policy section
            if (policyId) {
                navigate(`/profile?section=policies&policyId=${policyId}`);
            } else {
                navigate('/profile?section=policies');
            }
            return;
        }
        
        // Handle PROFILE_UPDATE notifications
        if (notificationType === 'profile_update') {
            const employeeId = metadata?.employeeId || navigationData?.params?.employeeId || navigationData?.actionParams?.employeeId;
            console.log('[Notification] Profile update - employeeId:', employeeId);
            if (employeeId && isAdmin) {
                console.log('[Notification] Navigating to employees page with employeeId:', employeeId);
                navigate(`/employees?employeeId=${employeeId}&openProfile=true`);
                return;
            }
            if (isAdmin) {
                console.log('[Notification] No employeeId, navigating to employees page');
                navigate('/employees');
                return;
            }
        }
        
        // Handle YEAR_END_LEAVE notifications
        // Check both explicit type and metadata type for compatibility
        const isYearEndLeave = notificationType === 'YEAR_END_LEAVE' || 
                              (notificationType === 'leave_request' && metadata?.type === 'YEAR_END_LEAVE') ||
                              metadata?.type === 'YEAR_END_LEAVE';
        
        if (isYearEndLeave) {
            const actionId = metadata?.requestId || 
                           navigationData?.params?.requestId || 
                           navigationData?.params?.actionId ||
                           navigationData?.actionId;
            if (actionId && isAdmin) {
                navigate(`/admin/leaves?tab=year-end&actionId=${actionId}`);
                return;
            }
            if (isAdmin) {
                navigate('/admin/leaves?tab=year-end');
                return;
            }
        }
        
        if (notificationType === 'resource_request' || notificationType === 'resource_request_status') {
            const requestId = metadata?.requestId || navigationData?.params?.requestId;
            if (user?.role === 'Admin') {
                navigate(requestId ? `/admin/requests?requestId=${requestId}` : '/admin/requests');
            } else if (canAccess.manageResourceRequests()) {
                navigate(requestId ? `/resource-requests/manage?requestId=${requestId}` : '/resource-requests/manage');
            } else {
                navigate(requestId ? `/requests?requestId=${requestId}` : '/requests');
            }
            return;
        }

        // Handle LEAVE_REQUEST notifications
        if (notificationType === 'LEAVE_REQUEST') {
            const leaveId = metadata?.leaveId || navigationData?.leaveId;
            if (leaveId && isAdmin) {
                navigate(`/admin/leaves?tab=requests&leaveId=${leaveId}`);
                return;
            }
            if (isAdmin) {
                navigate('/admin/leaves?tab=requests');
                return;
            }
        }
        
        // Tea break return — open announcements insights modal
        if (metadata?.type === 'TEA_BREAK_ENDED' || navigationData?.page === 'announcements') {
            if (!isAdmin) {
                navigate('/dashboard');
                return;
            }
            openAnnouncementHub({
                tab: navigationData?.params?.tab || 'insights',
                announcementId: navigationData?.params?.announcementId || metadata?.announcementId || null,
            });
            return;
        }

        // Default navigation handling
        const path = navigationData?.page;
        console.log('[Notification] Default navigation - path:', path);
        
        // Handle admin/policies path
        if (path === 'admin/policies') {
            if (!isAdmin) {
                console.warn('[Notification] Non-admin user attempted to access admin policies');
                navigate('/dashboard');
                return;
            }
            navigate('/admin/policies');
            return;
        }
        
        if (path === 'profile') {
            const section = navigationData?.params?.section;
            const policyId = navigationData?.params?.policyId;
            if (section === 'policies' && policyId) {
                navigate(`/profile?section=policies&policyId=${policyId}`);
            } else if (section === 'policies') {
                navigate('/profile?section=policies');
            } else {
                navigate('/profile');
            }
        } else if (path === 'leaves') navigate(isAdmin ? '/admin/leaves' : '/leaves');
        else if (path === 'attendance') navigate(isAdmin ? '/admin/attendance-summary' : '/dashboard', { state: { refresh: true } });
        else if (path === 'admin/dashboard') navigate('/admin/dashboard', { state: { refresh: true } });
        else if (path === '/employees' || path === '/admin/employees' || path?.includes('employees')) {
            const employeeId = navigationData?.params?.employeeId || metadata?.employeeId || navigationData?.actionParams?.employeeId;
            if (employeeId) {
                navigate(`/employees?employeeId=${employeeId}&openProfile=true`);
            } else {
                navigate('/employees');
            }
        } else {
            console.log('[Notification] Falling back to dashboard');
            navigate('/dashboard', { state: { refresh: true } });
        }
    };

    const handleStartBreak = async (notificationId) => {
        onClose();
        try {
            await api.post('/breaks/start', { breakType: 'Extra' });
            // Break started successfully, delete the notification so it can't be clicked again
            await deleteNotification(notificationId);
            navigate('/dashboard', { state: { refresh: true } }); 
        } catch (error) {
            console.error("Failed to start extra break from notification:", error);
            // If the break was already used (403) or any other error, delete the notification to prevent further clicks
            if (error.response?.status === 403) {
                await deleteNotification(notificationId);
            }
            fetchNotifications();
        }
    };

    const handlePromoteEmployee = async (employeeId, notificationId) => {
        try {
            await markAsRead(notificationId);
            await api.post(`/probation/promote/${employeeId}`);
            fetchNotifications();
            // Show success message
            console.log('Employee promoted successfully');
        } catch (error) {
            console.error("Failed to promote employee:", error);
            fetchNotifications();
        }
    };

    const handleMarkTabAsRead = async () => {
        const unread = displayedNotifications.filter((n) => !n.read);
        await Promise.all(unread.map((n) => markAsRead(n.id)));
    };

    const handleOverrideHalfDay = async (attendanceLogId, notificationId) => {
        try {
            await markAsRead(notificationId);
            await api.post('/admin/attendance/override-half-day', { attendanceLogId });
            fetchNotifications();
            // Show success message
            console.log('Half-day marking overridden successfully');
            // Optionally refresh the page or show a toast
            window.location.reload();
        } catch (error) {
            console.error("Failed to override half-day:", error);
            fetchNotifications();
        }
    };
    
    return (
        <>
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{ className: 'notification-drawer' }}
        >
            <Box className="drawer-header">
                <Box className="drawer-header-top">
                    <Typography variant="h6" className="drawer-title">
                        Notifications
                        {!isAdmin && unreadCount > 0 && (
                            <span className="drawer-title-count">{unreadCount}</span>
                        )}
                    </Typography>
                    <IconButton className="drawer-close-btn" onClick={onClose} size="small" aria-label="Close">
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>

                {isAdmin && (
                    <Box className="drawer-toolbar">
                        <Tabs
                            value={adminTab}
                            onChange={(_, v) => setAdminTab(v)}
                            className="notification-drawer-tabs"
                            TabIndicatorProps={{ className: 'notification-tab-indicator' }}
                            slotProps={{ indicator: { className: 'notification-tab-indicator' } }}
                            sx={{
                                '& .MuiTab-root': {
                                    outline: 'none',
                                    '&:focus, &:focus-visible, &.Mui-focusVisible': {
                                        outline: 'none',
                                        boxShadow: 'none',
                                    },
                                },
                            }}
                        >
                            <Tab
                                label={
                                    <span className="notification-tab-label">
                                        Attendance
                                        {attendanceUnread > 0 && <span className="tab-count">{attendanceUnread}</span>}
                                    </span>
                                }
                            />
                            <Tab
                                label={
                                    <span className="notification-tab-label">
                                        Requests
                                        {requestsUnread > 0 && <span className="tab-count">{requestsUnread}</span>}
                                    </span>
                                }
                            />
                        </Tabs>
                    </Box>
                )}

                {notifications.length > 0 && (
                    <Box className="drawer-actions">
                        <button
                            type="button"
                            className="drawer-text-action"
                            onClick={isAdmin ? handleMarkTabAsRead : markAllAsRead}
                            disabled={displayedUnread === 0}
                        >
                            Mark read
                        </button>
                        <span className="drawer-action-divider" />
                        <button
                            type="button"
                            className="drawer-text-action drawer-text-action--muted"
                            onClick={clearAllNotifications}
                        >
                            Clear all
                        </button>
                        {isConnected && (
                            <span className="drawer-live-dot" title="Live" />
                        )}
                    </Box>
                )}
            </Box>
            
            <Box className="drawer-body">
                <NotificationList
                    items={displayedNotifications}
                    loadingNotifications={loadingNotifications}
                    emptyTitle={isAdmin && adminTab === 1 ? 'No Request Logs' : 'All Caught Up!'}
                    emptySubtitle={
                        isAdmin && adminTab === 1
                            ? 'Employee resource requests will appear here.'
                            : 'You have no new notifications.'
                    }
                    onMarkAsRead={markAsRead}
                    onDelete={deleteNotification}
                    onNavigate={handleNavigate}
                    onStartBreak={handleStartBreak}
                    onPromoteEmployee={handlePromoteEmployee}
                    onOverrideHalfDay={handleOverrideHalfDay}
                    onOpenTeamsPreview={handleOpenTeamsPreview}
                />
            </Box>
        </Drawer>
        {teamsModalOpen && (
            <Suspense fallback={null}>
                <TeamsNotificationModal
                    open={teamsModalOpen}
                    onClose={() => setTeamsModalOpen(false)}
                    initialTab={2}
                />
            </Suspense>
        )}
    </>
    );
};

export default NewNotificationDrawer;









