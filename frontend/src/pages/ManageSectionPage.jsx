// frontend/src/pages/ManageSectionPage.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import TeamsNotificationModal from '../components/TeamsAttendanceNotificationSettings';
import { Box, Typography, Card, CardContent, Switch, FormControl, InputLabel, Select, MenuItem, TextField, Button, Chip, Grid, Paper, Divider, Alert, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip, Avatar, Stack, InputAdornment, FormControlLabel, Checkbox, Menu } from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  Person as PersonIcon,
  Security as SecurityIcon,
  Block as BlockIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  AccessTime as AccessTimeIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Group as GroupIcon,
  Groups as GroupsIcon,
  Inventory2 as Inventory2Icon,
  Search as SearchIcon,
  RestartAlt as RestartAltIcon,
  PeopleAlt as PeopleAltIcon,
  Insights as InsightsIcon,
  MoreVert as MoreVertIcon,
  Schedule as ScheduleIcon,
  NotificationsActive as NotificationsActiveIcon,
  SupportAgent as SupportAgentIcon,
  EventNote as EventNoteIcon
} from '@mui/icons-material';
import api from '../api/axios';
import '../styles/ManageSectionPage.css';
import PageHeroHeader from '../components/PageHeroHeader';

import { SkeletonBox } from '../components/SkeletonLoaders';
const SECTION_CARD_BASE = {
  p: 3,
  borderRadius: '18px',
  border: '1px solid #e5e9f2',
  background: 'linear-gradient(145deg, #ffffff 0%, #f7f9fc 100%)',
  boxShadow: '0 20px 40px rgba(15, 23, 42, 0.08)',
  position: 'relative',
  overflow: 'hidden',
  minHeight: '100%',
};

const createCardStyles = (accent = 'rgba(229, 57, 53, 0.12)') => ({
  ...SECTION_CARD_BASE,
  '&:before': {
    content: '""',
    position: 'absolute',
    left: -60,
    top: -60,
    width: 160,
    height: 160,
    borderRadius: '50%',
    background: accent,
    filter: 'blur(60px)',
    opacity: 0.9,
  },
  '&:after': {
    content: '""',
    position: 'absolute',
    inset: 0,
    borderRadius: '18px',
    border: '1px solid rgba(255, 255, 255, 0.4)',
    pointerEvents: 'none',
  },
});

const normalizeRole = (role) => (role && role.trim()) || 'Employee';
const getPrivilegeLevel = (user) => user?.featurePermissions?.privilegeLevel || 'normal';
const isAdminAccount = (user) => normalizeRole(user?.role) === 'Admin';
const filterManageableUsers = (list) => (Array.isArray(list) ? list.filter((u) => !isAdminAccount(u)) : []);

const ManageSectionPage = () => {
  const [users, setUsers] = useState([]);
  const [originalUsers, setOriginalUsers] = useState([]); // Store original data for comparison
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [userModal, setUserModal] = useState({ open: false, user: null });
  const [resetDialog, setResetDialog] = useState({ open: false, userId: null, userName: '' });
  const [unsavedChanges, setUnsavedChanges] = useState({}); // Track unsaved changes per user
  const [bulkDialog, setBulkDialog] = useState({ open: false, selectedUsers: [], applyToAll: false });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [selectedPrivilege, setSelectedPrivilege] = useState('all');
  const [showUnsavedOnly, setShowUnsavedOnly] = useState(false);
  const [bulkSettings, setBulkSettings] = useState({
    featurePermissions: {
      leaves: true,
      breaks: true,
      extraFeatures: false,
      maxBreaks: 999,
      breakAfterHours: 0,
      breakWindows: [],
      canCheckIn: true,
      canCheckOut: true,
      canTakeBreak: true,
      canViewAnalytics: false, // New field for analytics access
      canViewLiveAttendance: false,
      canManageResourceRequests: false,
      canManageHRQueries: false,
      canManageBulkAttendanceActions: false,
      privilegeLevel: 'normal',
      restrictedFeatures: {
        canViewReports: false,
        canViewOtherLogs: false,
        canEditProfile: true,
        canRequestExtraBreak: true
      },
      advancedFeatures: {
        canBulkActions: false,
        canExportData: false
      },
      autoBreakOnInactivity: false,
      inactivityThresholdMinutes: 5
    }
  });
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(30);
  const [graceDialog, setGraceDialog] = useState({ open: false, value: 30 });
  const [updatingGrace, setUpdatingGrace] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [enforceLogoutDialog, setEnforceLogoutDialog] = useState({ open: false, enabled: false });
  const [updatingEnforceLogout, setUpdatingEnforceLogout] = useState(false);
  const [earlyCheckoutApprovalDialog, setEarlyCheckoutApprovalDialog] = useState({ open: false, enabled: false });
  const [teamsNotifModal, setTeamsNotifModal] = useState(false);
  const [updatingEarlyCheckoutApproval, setUpdatingEarlyCheckoutApproval] = useState(false);
  const [leavesSectionDialog, setLeavesSectionDialog] = useState({ open: false, enabled: true });
  const [updatingLeavesSection, setUpdatingLeavesSection] = useState(false);

  // Fetch all users with their permissions
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/admin/manage');
      const manageableUsers = filterManageableUsers(response.data);
      setUsers(manageableUsers);
      setOriginalUsers(JSON.parse(JSON.stringify(manageableUsers))); // Deep copy for comparison
      setUnsavedChanges({}); // Clear unsaved changes when fetching fresh data
    } catch (err) {
      setError('Failed to fetch users and permissions');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGracePeriod = useCallback(async () => {
    try {
      const response = await api.get('/analytics/late-grace-settings');
      const minutes = Number(response.data?.minutes ?? 30);
      setGracePeriodMinutes(minutes);
      setGraceDialog(prev => ({ ...prev, value: minutes }));
    } catch (err) {
      console.error('Failed to fetch grace period:', err);
    }
  }, []);

  // PERFORMANCE FIX: Fire all initial fetches in parallel with a single useEffect
  // Previously these were separate useEffects, causing sequential loading waterfall
  useEffect(() => {
    Promise.all([
      fetchUsers(),
      fetchGracePeriod(),
    ]).catch(err => console.error('[ManageSectionPage] Initial load error:', err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchEnforceLogoutSetting = useCallback(async () => {
    try {
      const response = await api.get('/admin/settings/enforce-required-logout');
      return !!response.data?.enabled;
    } catch (err) {
      console.error('Error fetching enforce required logout setting:', err);
      return false;
    }
  }, []);

  const openEnforceLogoutDialog = useCallback(async () => {
    setMenuAnchor(null);
    setEnforceLogoutDialog({ open: true, enabled: false });
    const enabled = await fetchEnforceLogoutSetting();
    setEnforceLogoutDialog({ open: true, enabled });
  }, [fetchEnforceLogoutSetting]);

  const handleEnforceLogoutToggle = useCallback(async (event) => {
    const enabled = event.target.checked;
    setUpdatingEnforceLogout(true);
    try {
      await api.post('/admin/settings/enforce-required-logout', { enabled });
      setEnforceLogoutDialog((prev) => ({ ...prev, enabled }));
      setSuccess(enabled ? 'Required logout before checkout is now enforced.' : 'Required logout before checkout is now disabled.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update setting.');
      console.error('Error updating enforce required logout:', err);
    } finally {
      setUpdatingEnforceLogout(false);
    }
  }, []);

  const fetchRequireEarlyCheckoutApprovalSetting = useCallback(async () => {
    try {
      const response = await api.get('/admin/settings/require-admin-approval-early-checkout');
      return !!response.data?.enabled;
    } catch (err) {
      console.error('Error fetching require admin approval for early checkout:', err);
      return false;
    }
  }, []);

  const openEarlyCheckoutApprovalDialog = useCallback(async () => {
    setMenuAnchor(null);
    setEarlyCheckoutApprovalDialog({ open: true, enabled: false });
    const enabled = await fetchRequireEarlyCheckoutApprovalSetting();
    setEarlyCheckoutApprovalDialog({ open: true, enabled });
  }, [fetchRequireEarlyCheckoutApprovalSetting]);

  const handleEarlyCheckoutApprovalToggle = useCallback(async (event) => {
    const enabled = event.target.checked;
    setUpdatingEarlyCheckoutApproval(true);
    try {
      await api.post('/admin/settings/require-admin-approval-early-checkout', { enabled });
      setEarlyCheckoutApprovalDialog((prev) => ({ ...prev, enabled }));
      setSuccess(enabled ? 'Early checkout now requires admin approval.' : 'Early checkout no longer requires admin approval.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update setting.');
      console.error('Error updating require admin approval for early checkout:', err);
    } finally {
      setUpdatingEarlyCheckoutApproval(false);
    }
  }, []);

  const fetchLeavesSectionSetting = useCallback(async () => {
    try {
      const response = await api.get('/admin/settings/leaves-section');
      return response.data?.enabled !== false;
    } catch (err) {
      console.error('Error fetching leave section setting:', err);
      return true;
    }
  }, []);

  const openLeavesSectionDialog = useCallback(async () => {
    setMenuAnchor(null);
    setLeavesSectionDialog({ open: true, enabled: true });
    const enabled = await fetchLeavesSectionSetting();
    setLeavesSectionDialog({ open: true, enabled });
  }, [fetchLeavesSectionSetting]);

  const handleLeavesSectionToggle = useCallback(async (event) => {
    const enabled = event.target.checked;
    setUpdatingLeavesSection(true);
    try {
      await api.post('/admin/settings/leaves-section', { enabled });
      setLeavesSectionDialog((prev) => ({ ...prev, enabled }));
      setSuccess(enabled
        ? 'Leave section is now visible to employees and interns.'
        : 'Leave section is now hidden from employees and interns.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update leave section setting.');
      console.error('Error updating leave section setting:', err);
    } finally {
      setUpdatingLeavesSection(false);
    }
  }, []);

  // Check if user has unsaved changes
  const hasUnsavedChanges = useCallback((userId) => {
    const currentUser = users.find(u => u._id === userId);
    const originalUser = originalUsers.find(u => u._id === userId);
    
    if (!currentUser || !originalUser) return false;
    
    return JSON.stringify(currentUser.featurePermissions) !== JSON.stringify(originalUser.featurePermissions);
  }, [users, originalUsers]);

  const unsavedCount = useMemo(() => (
    users.reduce((count, user) => count + (hasUnsavedChanges(user._id) ? 1 : 0), 0)
  ), [users, hasUnsavedChanges]);

  const roleOptions = useMemo(() => {
    const uniqueRoles = new Set();
    users.forEach(user => uniqueRoles.add(normalizeRole(user.role)));
    return Array.from(uniqueRoles).sort();
  }, [users]);

const privilegeOptions = useMemo(() => {
    const uniquePrivileges = new Set();
    users.forEach(user => uniquePrivileges.add(getPrivilegeLevel(user)));
    return Array.from(uniquePrivileges);
  }, [users]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      const roleMatches = selectedRole === 'all' || normalizeRole(user.role) === selectedRole;
      const privilegeMatches = selectedPrivilege === 'all' || getPrivilegeLevel(user) === selectedPrivilege;
      const searchMatches =
        term.length === 0 ||
        user.fullName?.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term) ||
        user.employeeCode?.toLowerCase().includes(term);
      const unsavedMatches = !showUnsavedOnly || hasUnsavedChanges(user._id);
      return roleMatches && privilegeMatches && searchMatches && unsavedMatches;
    });
  }, [users, selectedRole, selectedPrivilege, searchTerm, showUnsavedOnly, hasUnsavedChanges]);

  const analyticsEnabledCount = useMemo(
    () => users.filter((user) => user.featurePermissions?.canViewAnalytics).length,
    [users]
  );

  const liveAttendanceEnabledCount = useMemo(
    () => users.filter((user) => user.featurePermissions?.canViewLiveAttendance).length,
    [users]
  );

  const hrQueryEnabledCount = useMemo(
    () => users.filter((user) => user.featurePermissions?.canManageHRQueries).length,
    [users]
  );

  const resourceRequestsEnabledCount = useMemo(
    () => users.filter((user) => user.featurePermissions?.canManageResourceRequests).length,
    [users]
  );

  const bulkAttendanceActionsEnabledCount = useMemo(
    () => users.filter((user) => user.featurePermissions?.canManageBulkAttendanceActions).length,
    [users]
  );

  const advancedPrivilegeCount = useMemo(
    () => users.filter((user) => getPrivilegeLevel(user) === 'advanced').length,
    [users]
  );

  // Save user permissions
  const saveUserPermissions = useCallback(async (userId) => {
    const user = users.find(u => u._id === userId);
    if (!user) return;

    try {
      setSaving(prev => ({ ...prev, [userId]: true }));
      setError(null);

      const response = await api.put(`/admin/manage/${userId}`, {
        featurePermissions: user.featurePermissions
      });

      // Update local state with saved data
      const updatedUser = response.data.user;
      setUsers(prev => prev.map(u => 
        u._id === userId ? { ...u, featurePermissions: updatedUser.featurePermissions } : u
      ));
      setOriginalUsers(prev => prev.map(u => 
        u._id === userId ? { ...u, featurePermissions: updatedUser.featurePermissions } : u
      ));

      // Clear unsaved changes for this user
      setUnsavedChanges(prev => {
        const newChanges = { ...prev };
        delete newChanges[userId];
        return newChanges;
      });

      setSuccess(`Permissions saved for ${updatedUser.fullName}. The user will see changes on their next page refresh.`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save user permissions');
      console.error('Error saving permissions:', err);
    } finally {
      setSaving(prev => ({ ...prev, [userId]: false }));
    }
  }, [users]);

  // Reset user permissions to defaults
  const resetUserPermissions = useCallback(async (userId) => {
    try {
      setSaving(prev => ({ ...prev, [userId]: true }));
      setError(null);

      await api.post(`/admin/manage/${userId}/reset`);
      
      // Refresh the user data
      await fetchUsers();
      
      setSuccess('User permissions reset to defaults. The user will see changes on their next page refresh.');
      setTimeout(() => setSuccess(null), 5000);
      setResetDialog({ open: false, userId: null, userName: '' });
    } catch (err) {
      setError('Failed to reset user permissions');
      console.error('Error resetting permissions:', err);
    } finally {
      setSaving(prev => ({ ...prev, [userId]: false }));
    }
  }, [fetchUsers]);

  // Bulk apply settings to selected users
  const applyBulkSettings = useCallback(async () => {
    try {
      setSaving(prev => ({ ...prev, bulk: true }));
      setError(null);

      // Validate that users are selected
      if (!bulkDialog.applyToAll && bulkDialog.selectedUsers.length === 0) {
        setError('Please select at least one user or choose "Apply to all users"');
        setSaving(prev => ({ ...prev, bulk: false }));
        return;
      }

      const payload = {
        featurePermissions: bulkSettings.featurePermissions,
        applyToAll: bulkDialog.applyToAll,
        userIds: bulkDialog.applyToAll ? [] : bulkDialog.selectedUsers
      };

      const response = await api.put('/admin/manage/bulk', payload);
      
      // Refresh the user data
      await fetchUsers();
      
      setSuccess(`Successfully updated ${response.data.modifiedCount} users`);
      setTimeout(() => setSuccess(null), 3000);
      setBulkDialog({ open: false, selectedUsers: [], applyToAll: false });
    } catch (err) {
      console.error('Error applying bulk settings:', err);
      const errorMessage = err.response?.data?.error || 'Failed to apply bulk settings';
      setError(errorMessage);
    } finally {
      setSaving(prev => ({ ...prev, bulk: false }));
    }
  }, [bulkSettings, bulkDialog, fetchUsers]);

  const handleUpdateGracePeriod = useCallback(async () => {
    const value = Number(graceDialog.value);
    if (isNaN(value) || value < 0 || value > 1440) {
      setError('Grace period must be between 0 and 1440 minutes');
      return;
    }
    try {
      setUpdatingGrace(true);
      setError(null);
      await api.put('/analytics/late-grace-settings', { minutes: value });
      setGracePeriodMinutes(value);
      setGraceDialog({ open: false, value });
      setSuccess('Grace period updated successfully.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to update grace period:', err);
      setError(err.response?.data?.error || 'Failed to update grace period');
    } finally {
      setUpdatingGrace(false);
    }
  }, [graceDialog.value]);

  // Handle permission change (no auto-save)
  const handlePermissionChange = useCallback((userId, path, value) => {
    setUsers(prev => {
      const user = prev.find(u => u._id === userId);
      if (!user) return prev;

      const newPermissions = { ...user.featurePermissions };
      
      // Handle nested object updates
      if (path.includes('.')) {
        const [parent, child] = path.split('.');
        if (!newPermissions[parent]) newPermissions[parent] = {};
        newPermissions[parent][child] = value;
      } else {
        newPermissions[path] = value;
      }

      // Update local state only (no auto-save)
      return prev.map(u => 
        u._id === userId 
          ? { ...u, featurePermissions: newPermissions }
          : u
      );
    });

    // Mark as having unsaved changes
    setUnsavedChanges(prev => ({ ...prev, [userId]: true }));
  }, []);

  // Get privilege level color
  const getPrivilegeColor = useCallback((level) => {
    switch (level || 'normal') {
      case 'restricted': return 'error';
      case 'normal': return 'primary';
      case 'advanced': return 'success';
      default: return 'default';
    }
  }, []);

  // Get privilege level icon
  const getPrivilegeIcon = useCallback((level) => {
    switch (level || 'normal') {
      case 'restricted': return <BlockIcon />;
      case 'normal': return <CheckCircleIcon />;
      case 'advanced': return <SecurityIcon />;
      default: return <PersonIcon />;
    }
  }, []);

  // Render permission controls for a user
  const renderUserPermissions = useCallback((user) => {
    // Get the current user from state to ensure we have the latest data
    const currentUser = users.find(u => u._id === user._id) || user;
    const { featurePermissions } = currentUser;
    
    // Ensure featurePermissions has all required fields with defaults
    const safeFeaturePermissions = {
      leaves: true,
      breaks: true,
      extraFeatures: false,
      maxBreaks: 999,
      breakAfterHours: 0,
      breakWindows: featurePermissions?.breakWindows || [],
      canCheckIn: true,
      canCheckOut: true,
      canTakeBreak: true,
      canViewAnalytics: false, // New field for analytics access
      canViewLiveAttendance: false,
      canManageResourceRequests: false,
      canManageHRQueries: false,
      canManageBulkAttendanceActions: false,
      privilegeLevel: 'normal',
      // Merge existing values from featurePermissions while adding defaults
      ...featurePermissions,
      // Ensure nested objects are properly merged with defaults
      restrictedFeatures: {
        canViewReports: false,
        canViewOtherLogs: false,
        canEditProfile: true,
        canRequestExtraBreak: true,
        ...(featurePermissions?.restrictedFeatures || {})
      },
      advancedFeatures: {
        canBulkActions: false,
        canExportData: false,
        ...(featurePermissions?.advancedFeatures || {})
      },
      autoBreakOnInactivity: false,
      inactivityThresholdMinutes: 5,
      ...(featurePermissions?.autoBreakOnInactivity !== undefined && { autoBreakOnInactivity: featurePermissions.autoBreakOnInactivity }),
      ...(featurePermissions?.inactivityThresholdMinutes !== undefined && { inactivityThresholdMinutes: featurePermissions.inactivityThresholdMinutes })
    };
    
    const breakWindowCount = safeFeaturePermissions.breakWindows?.length || 0;
    const enabledCoreFeatures = [
      safeFeaturePermissions.leaves,
      safeFeaturePermissions.breaks,
      safeFeaturePermissions.extraFeatures
    ].filter(Boolean).length;
    const quickStats = [
      { 
        label: 'Privilege', 
        value: (safeFeaturePermissions.privilegeLevel || 'normal').toUpperCase(),
        icon: <SecurityIcon sx={{ fontSize: 16 }} />,
        bgColor: '#FEE2E2',
        iconColor: '#EF4444'
      },
      { 
        label: 'Break Windows', 
        value: breakWindowCount,
        icon: <AccessTimeIcon sx={{ fontSize: 16 }} />,
        bgColor: '#F0FDF4',
        iconColor: '#10B981'
      },
      { 
        label: 'Core Features', 
        value: `${enabledCoreFeatures}/2`,
        icon: <SettingsIcon sx={{ fontSize: 16 }} />,
        bgColor: '#FEF3C7',
        iconColor: '#F59E0B'
      },
      { 
        label: 'Auto Break', 
        value: safeFeaturePermissions.autoBreakOnInactivity 
          ? `${safeFeaturePermissions.inactivityThresholdMinutes || 5}m`
          : 'Off',
        icon: <ScheduleIcon sx={{ fontSize: 16 }} />,
        bgColor: safeFeaturePermissions.autoBreakOnInactivity ? '#DBEAFE' : '#F3F4F6',
        iconColor: safeFeaturePermissions.autoBreakOnInactivity ? '#3B82F6' : '#9CA3AF'
      }
    ];

    return (
      <>
        {/* ROW 1: Employee Header - Full Width */}
        <Paper
          elevation={0}
          sx={{
            mb: 3,
            p: 3,
            borderRadius: '16px',
            background: '#FFFFFF',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            border: '1px solid #E5E7EB',
            borderLeft: '4px solid #EF4444'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {/* Left: Avatar + Info */}
            <Avatar
              sx={{
                width: 56,
                height: 56,
                fontSize: '1.25rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
                border: '2px solid rgba(239, 68, 68, 0.1)'
              }}
            >
              {currentUser.fullName.charAt(0).toUpperCase()}
            </Avatar>

            <Box sx={{ flex: '0 0 auto' }}>
              <Typography 
                variant="body2" 
                sx={{ 
                  letterSpacing: 0.5, 
                  color: '#6B7280',
                  fontSize: '11px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  mb: 0.5
                }}
              >
                Employee Permissions
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#111827', fontSize: '18px', mb: 0.25 }}>
                {currentUser.fullName}
              </Typography>
              <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '13px' }}>
                {currentUser.employeeCode} • {currentUser.role}
              </Typography>
            </Box>

            {/* Right: Stat Pills - Equal Height */}
            <Box sx={{ flex: 1, display: 'flex', gap: 2, justifyContent: 'flex-end', alignItems: 'stretch' }}>
              {quickStats.map((stat) => (
                <Box
                  key={stat.label}
                  sx={{
                    minWidth: 110,
                    borderRadius: '12px',
                    padding: '12px 14px',
                    backgroundColor: stat.bgColor,
                    border: '1px solid rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 0.5
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: stat.iconColor }}>
                    {stat.icon}
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        fontSize: '10px',
                        fontWeight: 500,
                        color: '#6B7280',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        lineHeight: 1
                      }}
                    >
                      {stat.label}
                    </Typography>
                  </Box>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: '#111827', fontSize: '16px', lineHeight: 1 }}>
                    {stat.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Paper>

        {/* ROW 2: Core Features (4 cols) + Break Timing Configuration (8 cols) */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(12, minmax(0, 1fr))' }, gap: { xs: 2, lg: 3 }, mb: 3 }}>
          {/* Core Features - 4 columns */}
          <Box sx={{ gridColumn: { xs: '1 / -1', lg: 'span 4' }, minWidth: 0 }}>
            <Paper 
              elevation={0} 
              sx={{
                p: '20px',
                borderRadius: '16px',
                border: '1px solid #E5E7EB',
                background: '#FFFFFF',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                transition: 'all 0.15s ease-in-out',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                '&:hover': {
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                  transform: 'translateY(-2px)'
                }
              }}
            >
              {/* Fixed Height Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, height: 40 }}>
                <Box 
                  sx={{ 
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: '1px solid rgba(239, 68, 68, 0.1)'
                  }}
                >
                  <SettingsIcon sx={{ color: '#EF4444', fontSize: 20 }} />
                </Box>
                <Typography 
                  variant="h6" 
                  sx={{ 
                    color: '#111827',
                    fontWeight: 600,
                    fontSize: '16px',
                    letterSpacing: '-0.01em',
                    lineHeight: 1
                  }}
                >
                  Core Features
                </Typography>
              </Box>
              
              {/* Content with equal spacing */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  py: 1.5,
                  borderTop: '1px solid #F3F4F6'
                }}>
                  <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500, fontSize: '13px' }}>
                    Leaves Section
                  </Typography>
                  <Switch
                    checked={safeFeaturePermissions.leaves}
                    onChange={(e) => handlePermissionChange(currentUser._id, 'leaves', e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: '#EF4444',
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: '#EF4444',
                      },
                    }}
                  />
                </Box>
                
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  py: 1.5,
                  borderTop: '1px solid #F3F4F6'
                }}>
                  <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500, fontSize: '13px' }}>
                    Breaks Section
                  </Typography>
                  <Switch
                    checked={safeFeaturePermissions.breaks}
                    onChange={(e) => handlePermissionChange(currentUser._id, 'breaks', e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: '#EF4444',
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: '#EF4444',
                      },
                    }}
                  />
                </Box>
                
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  py: 1.5,
                  borderTop: '1px solid #F3F4F6'
                }}>
                  <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500, fontSize: '13px' }}>
                    Extra Features
                  </Typography>
                  <Switch
                    checked={safeFeaturePermissions.extraFeatures}
                    onChange={(e) => handlePermissionChange(currentUser._id, 'extraFeatures', e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: '#EF4444',
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: '#EF4444',
                      },
                    }}
                  />
                </Box>
              </Box>
            </Paper>
          </Box>

          {/* Break Timing Configuration - 8 columns */}
          <Box sx={{ gridColumn: { xs: '1 / -1', lg: 'span 8' }, minWidth: 0 }}>
            <Paper 
              elevation={0} 
              sx={{
                p: '20px',
                borderRadius: '16px',
                border: '1px solid #E5E7EB',
                background: '#FFFFFF',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                transition: 'all 0.15s ease-in-out',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                '&:hover': {
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                  transform: 'translateY(-2px)'
                }
              }}
            >
              {/* Fixed Height Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, height: 40 }}>
                <Box 
                  sx={{ 
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    background: '#DBEAFE',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <AccessTimeIcon sx={{ color: '#3B82F6', fontSize: 20 }} />
                </Box>
                <Typography 
                  variant="h6" 
                  sx={{ 
                    color: '#111827',
                    fontWeight: 600,
                    fontSize: '16px',
                    letterSpacing: '-0.01em',
                    lineHeight: 1
                  }}
                >
                  Break Timing Configuration
                </Typography>
              </Box>
              
              {/* Content */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                {safeFeaturePermissions.breakWindows?.map((window, index) => (
                  <Box 
                    key={index} 
                    sx={{ 
                      p: 2, 
                      border: '1px solid #E5E7EB', 
                      borderRadius: '12px',
                      background: '#F9FAFB',
                      position: 'relative'
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#111827', fontSize: '13px' }}>
                        Break Window {index + 1}
                      </Typography>
                      <IconButton 
                        size="small" 
                        onClick={() => {
                          const newWindows = [...(safeFeaturePermissions.breakWindows || [])];
                          newWindows.splice(index, 1);
                          handlePermissionChange(currentUser._id, 'breakWindows', newWindows);
                        }}
                        sx={{
                          color: '#EF4444',
                          width: 28,
                          height: 28,
                          '&:hover': {
                            background: '#FEE2E2'
                          }
                        }}
                      >
                        <DeleteIcon fontSize="small" sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Box>
                    
                    {/* 4-column grid for inputs */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel sx={{ fontSize: '13px' }}>Break Type</InputLabel>
                        <Select
                          value={window.type || 'Paid'}
                          label="Break Type"
                          onChange={(e) => {
                            const newWindows = [...(safeFeaturePermissions.breakWindows || [])];
                            newWindows[index] = { ...window, type: e.target.value };
                            handlePermissionChange(currentUser._id, 'breakWindows', newWindows);
                          }}
                          sx={{
                            borderRadius: '12px',
                            fontSize: '13px',
                            '& .MuiOutlinedInput-notchedOutline': {
                              borderColor: '#D1D5DB'
                            },
                            '&:hover .MuiOutlinedInput-notchedOutline': {
                              borderColor: '#4F46E5'
                            },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                              borderColor: '#4F46E5',
                              borderWidth: '2px'
                            }
                          }}
                        >
                          <MenuItem value="Paid">Paid Break</MenuItem>
                          <MenuItem value="Unpaid">Unpaid Break</MenuItem>
                          <MenuItem value="Extra">Extra Break</MenuItem>
                        </Select>
                      </FormControl>
                      
                      <TextField
                        fullWidth
                        size="small"
                        label="Window Name"
                        placeholder="e.g. Lunch"
                        value={window.name || ''}
                        onChange={(e) => {
                          const newWindows = [...(safeFeaturePermissions.breakWindows || [])];
                          newWindows[index] = { ...window, name: e.target.value };
                          handlePermissionChange(currentUser._id, 'breakWindows', newWindows);
                        }}
                        InputLabelProps={{ sx: { fontSize: '13px' } }}
                        inputProps={{ sx: { fontSize: '13px' } }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '12px',
                            '& fieldset': {
                              borderColor: '#D1D5DB'
                            },
                            '&:hover fieldset': {
                              borderColor: '#4F46E5'
                            },
                            '&.Mui-focused fieldset': {
                              borderColor: '#4F46E5',
                              borderWidth: '2px'
                            }
                          }
                        }}
                      />
                      
                      <TextField
                        fullWidth
                        size="small"
                        label="Start Time"
                        type="time"
                        value={window.startTime || '09:00'}
                        onChange={(e) => {
                          const newWindows = [...(safeFeaturePermissions.breakWindows || [])];
                          newWindows[index] = { ...window, startTime: e.target.value };
                          handlePermissionChange(currentUser._id, 'breakWindows', newWindows);
                        }}
                        InputLabelProps={{ sx: { fontSize: '13px' }, shrink: true }}
                        inputProps={{ sx: { fontSize: '13px' } }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '12px',
                            '& fieldset': {
                              borderColor: '#D1D5DB'
                            },
                            '&:hover fieldset': {
                              borderColor: '#4F46E5'
                            },
                            '&.Mui-focused fieldset': {
                              borderColor: '#4F46E5',
                              borderWidth: '2px'
                            }
                          }
                        }}
                      />
                      
                      <TextField
                        fullWidth
                        size="small"
                        label="End Time"
                        type="time"
                        value={window.endTime || '17:00'}
                        onChange={(e) => {
                          const newWindows = [...(safeFeaturePermissions.breakWindows || [])];
                          newWindows[index] = { ...window, endTime: e.target.value };
                          handlePermissionChange(currentUser._id, 'breakWindows', newWindows);
                        }}
                        InputLabelProps={{ sx: { fontSize: '13px' }, shrink: true }}
                        inputProps={{ sx: { fontSize: '13px' } }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '12px',
                            '& fieldset': {
                              borderColor: '#D1D5DB'
                            },
                            '&:hover fieldset': {
                              borderColor: '#4F46E5'
                            },
                            '&.Mui-focused fieldset': {
                              borderColor: '#4F46E5',
                              borderWidth: '2px'
                            }
                          }
                        }}
                      />
                    </Box>
                  </Box>
                ))}
                
                {/* Add Break Button - Full Width, Centered */}
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    const newWindows = [...(safeFeaturePermissions.breakWindows || []), {
                      type: 'Paid',
                      name: 'New Break Window',
                      startTime: '09:00',
                      endTime: '17:00',
                      isActive: true
                    }];
                    handlePermissionChange(currentUser._id, 'breakWindows', newWindows);
                  }}
                  fullWidth
                  sx={{ 
                    mt: 'auto',
                    borderRadius: '12px',
                    borderColor: '#4F46E5',
                    color: '#4F46E5',
                    textTransform: 'none',
                    fontWeight: 500,
                    fontSize: '13px',
                    py: 1,
                    '&:hover': {
                      borderColor: '#4338CA',
                      background: '#EEF2FF'
                    }
                  }}
                >
                  Add Break Window
                </Button>
              </Box>
            </Paper>
          </Box>
        </Box>

        {/* ROW 3: UI Controls (4 cols) + Auto Break (4 cols) + Privilege Level (4 cols) */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(12, minmax(0, 1fr))' }, gap: { xs: 2, lg: 3 }, mb: 3 }}>
          {/* UI Controls - 4 columns */}
          <Box sx={{ gridColumn: { xs: '1 / -1', lg: 'span 4' }, minWidth: 0 }}>
            <Paper 
              elevation={0} 
              sx={{
                p: '20px',
                borderRadius: '16px',
                border: '1px solid #E5E7EB',
                background: '#FFFFFF',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                transition: 'all 0.15s ease-in-out',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                '&:hover': {
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                  transform: 'translateY(-2px)'
                }
              }}
            >
              {/* Fixed Height Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, height: 40 }}>
                <Box 
                  sx={{ 
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    background: '#F0FDF4',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <CheckCircleIcon sx={{ color: '#10B981', fontSize: 20 }} />
                </Box>
                <Typography 
                  variant="h6" 
                  sx={{ 
                    color: '#111827',
                    fontWeight: 600,
                    fontSize: '16px',
                    letterSpacing: '-0.01em',
                    lineHeight: 1
                  }}
                >
                  UI Controls
                </Typography>
              </Box>
              
              {/* Content with equal spacing */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  py: 1.5,
                  borderTop: '1px solid #F3F4F6'
                }}>
                  <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500, fontSize: '13px' }}>
                    Can Check In
                  </Typography>
                  <Switch
                    checked={safeFeaturePermissions.canCheckIn}
                    onChange={(e) => handlePermissionChange(currentUser._id, 'canCheckIn', e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: '#4F46E5',
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: '#4F46E5',
                      },
                    }}
                  />
                </Box>
                
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  py: 1.5,
                  borderTop: '1px solid #F3F4F6'
                }}>
                  <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500, fontSize: '13px' }}>
                    Can Check Out
                  </Typography>
                  <Switch
                    checked={safeFeaturePermissions.canCheckOut}
                    onChange={(e) => handlePermissionChange(currentUser._id, 'canCheckOut', e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: '#4F46E5',
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: '#4F46E5',
                      },
                    }}
                  />
                </Box>
                
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  py: 1.5,
                  borderTop: '1px solid #F3F4F6'
                }}>
                  <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500, fontSize: '13px' }}>
                    Can Take Break
                  </Typography>
                  <Switch
                    checked={safeFeaturePermissions.canTakeBreak}
                    onChange={(e) => handlePermissionChange(currentUser._id, 'canTakeBreak', e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: '#4F46E5',
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: '#4F46E5',
                      },
                    }}
                  />
                </Box>
                
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  py: 1.5,
                  borderTop: '1px solid #F3F4F6'
                }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#111827', fontSize: '13px' }}>
                      Can View Analytics
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '11px' }}>
                      Dashboard access
                    </Typography>
                  </Box>
                  <Switch
                    checked={safeFeaturePermissions.canViewAnalytics}
                    onChange={(e) => handlePermissionChange(currentUser._id, 'canViewAnalytics', e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: '#4F46E5',
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: '#4F46E5',
                      },
                    }}
                  />
                </Box>

                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  py: 1.5,
                  borderTop: '1px solid #F3F4F6'
                }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#111827', fontSize: '13px' }}>
                      Can View Live Attendance
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '11px' }}>
                      Real-time present / absent / leave / break board
                    </Typography>
                  </Box>
                  <Switch
                    checked={safeFeaturePermissions.canViewLiveAttendance}
                    onChange={(e) => handlePermissionChange(currentUser._id, 'canViewLiveAttendance', e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: '#4F46E5',
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: '#4F46E5',
                      },
                    }}
                  />
                </Box>

                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  py: 1.5,
                  borderTop: '1px solid #F3F4F6'
                }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#111827', fontSize: '13px' }}>
                      Can Manage Resource Requests
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '11px' }}>
                      Review and update employee stationery, IT, and workplace resource requests
                    </Typography>
                  </Box>
                  <Switch
                    checked={safeFeaturePermissions.canManageResourceRequests}
                    onChange={(e) => handlePermissionChange(currentUser._id, 'canManageResourceRequests', e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: '#4F46E5',
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: '#4F46E5',
                      },
                    }}
                  />
                </Box>

                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  py: 1.5,
                  borderTop: '1px solid #F3F4F6'
                }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#111827', fontSize: '13px' }}>
                      Can Manage HR Queries
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '11px' }}>
                      View, respond to, and manage employee HR queries and resource requests
                    </Typography>
                  </Box>
                  <Switch
                    checked={safeFeaturePermissions.canManageHRQueries}
                    onChange={(e) => handlePermissionChange(currentUser._id, 'canManageHRQueries', e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: '#4F46E5',
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: '#4F46E5',
                      },
                    }}
                  />
                </Box>

                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  py: 1.5,
                  borderTop: '1px solid #F3F4F6'
                }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#111827', fontSize: '13px' }}>
                      Can Manage Bulk Attendance Actions
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '11px' }}>
                      Refresh live attendance and end tea, lunch, or other breaks from admin summary
                    </Typography>
                  </Box>
                  <Switch
                    checked={safeFeaturePermissions.canManageBulkAttendanceActions}
                    onChange={(e) => handlePermissionChange(currentUser._id, 'canManageBulkAttendanceActions', e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: '#4F46E5',
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: '#4F46E5',
                      },
                    }}
                  />
                </Box>
              </Box>
            </Paper>
          </Box>

          {/* Auto-Break on Inactivity - 4 columns */}
          <Box sx={{ gridColumn: { xs: '1 / -1', lg: 'span 4' }, minWidth: 0 }}>
            <Paper 
              elevation={0} 
              sx={{
                p: '20px',
                borderRadius: '16px',
                border: '1px solid #E5E7EB',
                background: '#FFFFFF',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                transition: 'all 0.15s ease-in-out',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                '&:hover': {
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                  transform: 'translateY(-2px)'
                }
              }}
            >
              {/* Fixed Height Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, height: 40 }}>
                <Box 
                  sx={{ 
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    background: '#FEF3C7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <ScheduleIcon sx={{ color: '#F59E0B', fontSize: 20 }} />
                </Box>
                <Typography 
                  variant="h6" 
                  sx={{ 
                    color: '#111827',
                    fontWeight: 600,
                    fontSize: '16px',
                    letterSpacing: '-0.01em',
                    lineHeight: 1
                  }}
                >
                  Auto-Break
                </Typography>
              </Box>
              
              {/* Content */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  py: 1.5,
                  borderTop: '1px solid #F3F4F6'
                }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#111827', fontSize: '13px' }}>
                      Enable Auto-Break
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '11px' }}>
                      On inactivity
                    </Typography>
                  </Box>
                  <Switch
                    checked={safeFeaturePermissions.autoBreakOnInactivity || false}
                    onChange={(e) => handlePermissionChange(currentUser._id, 'autoBreakOnInactivity', e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: '#4F46E5',
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: '#4F46E5',
                      },
                    }}
                  />
                </Box>
                
                {safeFeaturePermissions.autoBreakOnInactivity && (
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    py: 1.5,
                    borderTop: '1px solid #F3F4F6'
                  }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: '#111827', fontSize: '13px' }}>
                        Threshold
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '11px' }}>
                        Minutes
                      </Typography>
                    </Box>
                    <TextField
                      size="small"
                      type="number"
                      value={safeFeaturePermissions.inactivityThresholdMinutes || 5}
                      onChange={(e) => {
                        const value = Math.max(1, Math.min(60, parseInt(e.target.value) || 5));
                        handlePermissionChange(currentUser._id, 'inactivityThresholdMinutes', value);
                      }}
                      inputProps={{ min: 1, max: 60 }}
                      InputProps={{ sx: { fontSize: '13px' } }}
                      sx={{ 
                        width: 70,
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '8px',
                          '& fieldset': {
                            borderColor: '#D1D5DB'
                          },
                          '&:hover fieldset': {
                            borderColor: '#4F46E5'
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: '#4F46E5',
                            borderWidth: '2px'
                          }
                        }
                      }}
                    />
                  </Box>
                )}
              </Box>
            </Paper>
          </Box>

          {/* Privilege Level - 4 columns */}
          <Box sx={{ gridColumn: { xs: '1 / -1', lg: 'span 4' }, minWidth: 0 }}>
            <Paper 
              elevation={0} 
              sx={{
                p: '20px',
                borderRadius: '16px',
                border: '1px solid #E5E7EB',
                background: '#FFFFFF',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                transition: 'all 0.15s ease-in-out',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderTop: '2px solid #FEE2E2',
                '&:hover': {
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                  transform: 'translateY(-2px)'
                }
              }}
            >
              {/* Fixed Height Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, height: 40 }}>
                <Box 
                  sx={{ 
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: '1px solid rgba(239, 68, 68, 0.1)'
                  }}
                >
                  <SecurityIcon sx={{ color: '#EF4444', fontSize: 20 }} />
                </Box>
                <Typography 
                  variant="h6" 
                  sx={{ 
                    color: '#111827',
                    fontWeight: 600,
                    fontSize: '16px',
                    letterSpacing: '-0.01em',
                    lineHeight: 1
                  }}
                >
                  Privilege Level
                </Typography>
              </Box>
              
              {/* Content */}
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontSize: '13px' }}>Select Level</InputLabel>
                <Select
                  value={safeFeaturePermissions.privilegeLevel || 'normal'}
                  onChange={(e) => handlePermissionChange(currentUser._id, 'privilegeLevel', e.target.value)}
                  disabled={saving[currentUser._id]}
                  label="Select Level"
                  sx={{
                    borderRadius: '12px',
                    fontSize: '13px',
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#D1D5DB'
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#4F46E5'
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#4F46E5',
                      borderWidth: '2px'
                    }
                  }}
                >
                  <MenuItem value="restricted" sx={{ fontSize: '13px' }}>Restricted</MenuItem>
                  <MenuItem value="normal" sx={{ fontSize: '13px' }}>Normal</MenuItem>
                  <MenuItem value="advanced" sx={{ fontSize: '13px' }}>Advanced</MenuItem>
                </Select>
              </FormControl>
            </Paper>
          </Box>
        </Box>

        {/* Restricted Features */}
        {safeFeaturePermissions.privilegeLevel === 'restricted' && (
          <Grid xs={12}>
            <Paper 
              elevation={0} 
              sx={{
                p: 3,
                borderRadius: '16px',
                border: '1px solid #FEE2E2',
                background: '#FEF2F2',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                  transform: 'translateY(-2px)'
                }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                <Box 
                  sx={{ 
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    background: '#FEE2E2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <WarningIcon sx={{ color: '#EF4444', fontSize: 20 }} />
                </Box>
                <Typography 
                  variant="h6" 
                  sx={{ 
                    color: '#111827',
                    fontWeight: 600,
                    fontSize: '16px',
                    letterSpacing: '-0.01em'
                  }}
                >
                  Restricted Features
                </Typography>
              </Box>
              
              <Grid container spacing={2}>
                <Grid xs={12} sm={6}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500 }}>Can View Reports</Typography>
                    <Switch
                      checked={safeFeaturePermissions.restrictedFeatures.canViewReports}
                      onChange={(e) => handlePermissionChange(currentUser._id, 'restrictedFeatures.canViewReports', e.target.checked)}
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': {
                          color: '#4F46E5',
                        },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                          backgroundColor: '#4F46E5',
                        },
                      }}
                    />
                  </Box>
                </Grid>
                
                <Grid xs={12} sm={6}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500 }}>Can View Other Logs</Typography>
                    <Switch
                      checked={safeFeaturePermissions.restrictedFeatures.canViewOtherLogs}
                      onChange={(e) => handlePermissionChange(currentUser._id, 'restrictedFeatures.canViewOtherLogs', e.target.checked)}
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': {
                          color: '#4F46E5',
                        },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                          backgroundColor: '#4F46E5',
                        },
                      }}
                    />
                  </Box>
                </Grid>
                
                <Grid xs={12} sm={6}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500 }}>Can Edit Profile</Typography>
                    <Switch
                      checked={safeFeaturePermissions.restrictedFeatures.canEditProfile}
                      onChange={(e) => handlePermissionChange(currentUser._id, 'restrictedFeatures.canEditProfile', e.target.checked)}
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': {
                          color: '#4F46E5',
                        },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                          backgroundColor: '#4F46E5',
                        },
                      }}
                    />
                  </Box>
                </Grid>
                
                <Grid xs={12} sm={6}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500 }}>Can Request Extra Break</Typography>
                    <Switch
                      checked={safeFeaturePermissions.restrictedFeatures.canRequestExtraBreak}
                      onChange={(e) => handlePermissionChange(currentUser._id, 'restrictedFeatures.canRequestExtraBreak', e.target.checked)}
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': {
                          color: '#4F46E5',
                        },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                          backgroundColor: '#4F46E5',
                        },
                      }}
                    />
                  </Box>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        )}

        {/* Advanced Features */}
        {safeFeaturePermissions.privilegeLevel === 'advanced' && (
          <Grid xs={12}>
            <Paper 
              elevation={0} 
              sx={{
                p: 3,
                borderRadius: '16px',
                border: '1px solid #DBEAFE',
                background: '#EFF6FF',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                  transform: 'translateY(-2px)'
                }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                <Box 
                  sx={{ 
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    background: '#DBEAFE',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <SecurityIcon sx={{ color: '#3B82F6', fontSize: 20 }} />
                </Box>
                <Typography 
                  variant="h6" 
                  sx={{ 
                    color: '#111827',
                    fontWeight: 600,
                    fontSize: '16px',
                    letterSpacing: '-0.01em'
                  }}
                >
                  Advanced Features
                </Typography>
              </Box>
              
              <Grid container spacing={2}>
                <Grid xs={12} sm={4}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500 }}>Bulk Actions</Typography>
                    <Switch
                      checked={safeFeaturePermissions.advancedFeatures.canBulkActions}
                      onChange={(e) => handlePermissionChange(currentUser._id, 'advancedFeatures.canBulkActions', e.target.checked)}
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': {
                          color: '#4F46E5',
                        },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                          backgroundColor: '#4F46E5',
                        },
                      }}
                    />
                  </Box>
                </Grid>
                
                <Grid xs={12} sm={4}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500 }}>Export Data</Typography>
                    <Switch
                      checked={safeFeaturePermissions.advancedFeatures.canExportData}
                      onChange={(e) => handlePermissionChange(currentUser._id, 'advancedFeatures.canBulkActions', e.target.checked)}
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': {
                          color: '#4F46E5',
                        },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                          backgroundColor: '#4F46E5',
                        },
                      }}
                    />
                  </Box>
                </Grid>
                
                {/* Note: canViewAnalytics is a top-level field, not in advancedFeatures */}
              </Grid>
            </Paper>
          </Grid>
        )}
        
      </>
    );
  }, [users, handlePermissionChange, saving]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <SkeletonBox width="24px" height="24px" borderRadius="50%" />
      </Box>
    );
  }

  return (
    <div className="manage-section-page">
      <PageHeroHeader
        eyebrow="Access Controls"
        title="Manage Section"
        description="Configure feature access, bulk update permissions, and maintain compliance-ready user roles."
        actionArea={
          <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="flex-start">
            <IconButton
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              sx={{
                background: 'linear-gradient(135deg, #e53935 0%, #d32f2f 100%)',
                borderRadius: '50%',
                width: 44,
                height: 44,
                color: 'white',
                boxShadow: '0 4px 14px rgba(229, 57, 53, 0.35)',
                transition: 'all 0.2s ease',
                '&:hover': {
                  background: 'linear-gradient(135deg, #d32f2f 0%, #c62828 100%)',
                  boxShadow: '0 6px 18px rgba(229, 57, 53, 0.45)',
                  transform: 'scale(1.05)',
                },
                '&:active': {
                  transform: 'scale(0.98)',
                }
              }}
            >
              <MoreVertIcon />
            </IconButton>
            <Menu
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              slotProps={{
                paper: {
                  sx: {
                    bgcolor: '#FFFFFF',
                    borderRadius: '16px',
                    boxShadow: '0 12px 48px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)',
                    border: '1px solid #EFEFEF',
                    mt: 1,
                    minWidth: 280,
                    overflow: 'visible',
                    '&::before': {
                      content: '""',
                      display: 'block',
                      position: 'absolute',
                      top: -8,
                      right: 20,
                      width: 16,
                      height: 16,
                      bgcolor: '#FFFFFF',
                      transform: 'rotate(45deg)',
                      borderLeft: '1px solid #EFEFEF',
                      borderTop: '1px solid #EFEFEF',
                      zIndex: 0,
                    },
                  },
                },
              }}
              TransitionProps={{
                timeout: 200,
              }}
              sx={{
                '& .MuiList-root': {
                  py: 1.5,
                },
              }}
            >
              <MenuItem
                onClick={() => {
                  setBulkDialog({ open: true, selectedUsers: [], applyToAll: false });
                  setMenuAnchor(null);
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2.5,
                  py: 1.5,
                  mx: 1,
                  borderRadius: '10px',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: '#F7F7F9',
                    transform: 'translateX(2px)',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: '#F0F0F2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <GroupIcon sx={{ fontSize: 18, color: '#6B7280' }} />
                </Box>
                <Typography
                  sx={{
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    color: '#1F1F1F',
                  }}
                >
                  Bulk Update
                </Typography>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setGraceDialog({ open: true, value: gracePeriodMinutes });
                  setMenuAnchor(null);
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2.5,
                  py: 1.5,
                  mx: 1,
                  borderRadius: '10px',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: '#F7F7F9',
                    transform: 'translateX(2px)',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: 'rgba(229,57,53,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <AccessTimeIcon sx={{ fontSize: 18, color: '#e53935' }} />
                </Box>
                <Typography
                  sx={{
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    color: '#1F1F1F',
                  }}
                >
                  Update Grace Period ({gracePeriodMinutes} min)
                </Typography>
              </MenuItem>
              <MenuItem
                onClick={openEnforceLogoutDialog}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2.5,
                  py: 1.5,
                  mx: 1,
                  borderRadius: '10px',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: '#F7F7F9',
                    transform: 'translateX(2px)',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: 'rgba(229,57,53,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <ScheduleIcon sx={{ fontSize: 18, color: '#e53935' }} />
                </Box>
                <Typography
                  sx={{
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    color: '#1F1F1F',
                  }}
                >
                  Enforce Required Logout Before Checkout
                </Typography>
              </MenuItem>
              <MenuItem
                onClick={openEarlyCheckoutApprovalDialog}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2.5,
                  py: 1.5,
                  mx: 1,
                  borderRadius: '10px',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: '#F7F7F9',
                    transform: 'translateX(2px)',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: 'rgba(237,108,2,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <ScheduleIcon sx={{ fontSize: 18, color: '#ed6c02' }} />
                </Box>
                <Typography
                  sx={{
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    color: '#1F1F1F',
                  }}
                >
                  Require Admin Approval for Early Checkout
                </Typography>
              </MenuItem>
              <MenuItem
                onClick={openLeavesSectionDialog}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2.5,
                  py: 1.5,
                  mx: 1,
                  borderRadius: '10px',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: '#F7F7F9',
                    transform: 'translateX(2px)',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: 'rgba(229,57,53,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <EventNoteIcon sx={{ fontSize: 18, color: '#e53935' }} />
                </Box>
                <Typography
                  sx={{
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    color: '#1F1F1F',
                  }}
                >
                  Leave Section for Users
                </Typography>
              </MenuItem>
              <Divider sx={{ my: 1.5, mx: 2, borderColor: '#EFEFEF' }} />
              <MenuItem
                onClick={() => {
                  setTeamsNotifModal(true);
                  setMenuAnchor(null);
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2.5,
                  py: 1.5,
                  mx: 1,
                  borderRadius: '10px',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: '#F7F7F9',
                    transform: 'translateX(2px)',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: 'rgba(0,120,212,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <NotificationsActiveIcon sx={{ fontSize: 18, color: '#0078d4' }} />
                </Box>
                <Typography
                  sx={{
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    color: '#1F1F1F',
                  }}
                >
                  Teams Notification Settings
                </Typography>
              </MenuItem>
            </Menu>
          </Stack>
        }
      />

      {error && <Alert severity="error" className="error-alert">{error}</Alert>}
      {success && <Alert severity="success" className="error-alert">{success}</Alert>}

      <Box className="manage-section-overview">
        {[
          {
            label: 'Total Users',
            value: users.length,
            helper: 'Team members',
            icon: <PeopleAltIcon />,
          },
          {
            label: 'Advanced Privileges',
            value: advancedPrivilegeCount,
            helper: 'High-trust users',
            icon: <SecurityIcon />,
          },
          {
            label: 'Analytics Access',
            value: analyticsEnabledCount,
            helper: 'Can view dashboards',
            icon: <InsightsIcon />,
          },
          {
            label: 'Live Attendance',
            value: liveAttendanceEnabledCount,
            helper: 'Real-time board access',
            icon: <GroupsIcon />,
          },
          {
            label: 'HR Queries',
            value: hrQueryEnabledCount,
            helper: 'Delegated HR query managers',
            icon: <SupportAgentIcon />,
          },
          {
            label: 'Resource Requests',
            value: resourceRequestsEnabledCount,
            helper: 'Delegated request managers',
            icon: <Inventory2Icon />,
          },
          {
            label: 'Bulk Attendance',
            value: bulkAttendanceActionsEnabledCount,
            helper: 'Admin summary assistant',
            icon: <SettingsIcon />,
          },
          {
            label: 'Unsaved Changes',
            value: unsavedCount,
            helper: unsavedCount ? 'Review & save' : 'All synced',
            icon: <RestartAltIcon />,
          },
        ].map((stat) => (
          <Card key={stat.label} className="overview-card">
            <CardContent>
              <Box className="overview-card__icon">{stat.icon}</Box>
              <Typography className="overview-card__label" variant="body2">
                {stat.label}
              </Typography>
              <Typography className="overview-card__value" variant="h4">
                {stat.value}
              </Typography>
              <Typography className="overview-card__helper" variant="caption">
                {stat.helper}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Box className="manage-section-toolbar">
        <TextField
          placeholder="Search name, email, or employee code"
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Role</InputLabel>
          <Select
            label="Role"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
          >
            <MenuItem value="all">All roles</MenuItem>
            {roleOptions.map((role) => (
              <MenuItem key={role} value={role}>
                {role}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Privilege</InputLabel>
          <Select
            label="Privilege"
            value={selectedPrivilege}
            onChange={(e) => setSelectedPrivilege(e.target.value)}
          >
            <MenuItem value="all">All levels</MenuItem>
            {privilegeOptions.map((privilege) => (
              <MenuItem key={privilege} value={privilege}>
                {privilege.charAt(0).toUpperCase() + privilege.slice(1)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControlLabel
          control={
            <Switch
              checked={showUnsavedOnly}
              onChange={(e) => setShowUnsavedOnly(e.target.checked)}
            />
          }
          label="Unsaved only"
        />
      </Box>

      {/* User Cards Grid */}
      <div className="users-grid-container">
        {filteredUsers.length === 0 && (
          <Paper className="empty-users">
            <Typography variant="h6">No team members found</Typography>
            <Typography variant="body2" color="text.secondary">
              Adjust your filters or clear the search to view more users.
            </Typography>
          </Paper>
        )}
        {filteredUsers.map((user) => (
          <Card 
            key={user._id} 
            className="user-card"
            onClick={() => setUserModal({ open: true, user })}
          >
            <CardContent className="user-card-content">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Avatar 
                  sx={{ 
                    width: 48, 
                    height: 48, 
                    background: 'linear-gradient(135deg, #e53935 0%, #d32f2f 100%)',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '1.2rem'
                  }}
                >
                  {user.fullName.charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" className="user-name">
                    {user.fullName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" className="user-details">
                    {user.email}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" className="user-details">
                    {user.employeeCode} • {user.role}
                  </Typography>
                </Box>
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Chip
                  icon={getPrivilegeIcon(user.featurePermissions?.privilegeLevel)}
                  label={user.featurePermissions?.privilegeLevel || 'normal'}
                  size="small"
                  sx={{
                    background: 'linear-gradient(135deg, #e53935 0%, #d32f2f 100%)',
                    color: 'white',
                    fontWeight: 600,
                    border: 'none',
                    '& .MuiChip-icon': {
                      color: 'white'
                    }
                  }}
                />
                {hasUnsavedChanges(user._id) && (
                  <Chip
                    label="Unsaved"
                    size="small"
                    variant="outlined"
                    sx={{
                      borderColor: '#e53935',
                      color: '#e53935',
                      backgroundColor: 'rgba(229, 57, 53, 0.1)',
                      fontWeight: 500
                    }}
                  />
                )}
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Click to manage permissions
                </Typography>
                {saving[user._id] && <SkeletonBox width="16px" height="16px" borderRadius="50%" />}
              </Box>
            </CardContent>
          </Card>
        ))}
      </div>


      {/* User Management Modal */}
      <Dialog 
        open={userModal.open} 
        onClose={() => setUserModal({ open: false, user: null })} 
        maxWidth="lg" 
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '16px',
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden'
          }
        }}
      >
        {/* Custom Header with Clean White Background */}
        <Box 
          sx={{ 
            background: '#FFFFFF',
            color: '#111827',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            borderBottom: '1px solid #E5E7EB',
            borderTop: '3px solid #EF4444'
          }}
        >
          <Box 
            sx={{ 
              width: 40,
              height: 40,
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(239, 68, 68, 0.1)'
            }}
          >
            <PersonIcon sx={{ fontSize: 20, color: '#EF4444' }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, margin: 0, color: '#111827' }}>
              Manage Permissions
            </Typography>
            <Typography variant="body2" sx={{ color: '#6B7280', margin: 0, fontSize: '12px' }}>
              {userModal.user?.fullName}
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Reset to defaults">
            <IconButton
              onClick={() => setResetDialog({ open: true, userId: userModal.user?._id, userName: userModal.user?.fullName })}
              sx={{ 
                color: '#6B7280',
                '&:hover': { 
                  backgroundColor: '#F3F4F6',
                  color: '#111827'
                }
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <DialogContent sx={{ padding: 0, backgroundColor: '#F3F4F6' }}>
          {userModal.user && (
            <Box sx={{ padding: '32px' }}>
              {renderUserPermissions(userModal.user)}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ 
          padding: '20px 24px', 
          backgroundColor: 'white',
          borderTop: '1px solid #E5E7EB',
          gap: 2
        }}>
          <Button 
            onClick={() => setUserModal({ open: false, user: null })}
            variant="outlined"
            sx={{ 
              borderRadius: '12px',
              borderColor: '#D1D5DB',
              color: '#6B7280',
              textTransform: 'none',
              fontWeight: 500,
              padding: '8px 20px',
              '&:hover': {
                borderColor: '#9CA3AF',
                backgroundColor: '#F9FAFB'
              }
            }}
          >
            Close
          </Button>
          {userModal.user && hasUnsavedChanges(userModal.user._id) && (
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={() => saveUserPermissions(userModal.user._id)}
              disabled={saving[userModal.user._id]}
              sx={{
                background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                borderRadius: '12px',
                padding: '8px 24px',
                fontWeight: 600,
                textTransform: 'none',
                boxShadow: '0 2px 4px 0 rgba(239, 68, 68, 0.2)',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
                  boxShadow: '0 4px 8px 0 rgba(239, 68, 68, 0.3)',
                  transform: 'translateY(-1px)'
                },
                '&:disabled': {
                  background: '#E5E7EB',
                  color: '#9CA3AF',
                  boxShadow: 'none'
                }
              }}
            >
              {saving[userModal.user._id] ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetDialog.open} onClose={() => setResetDialog({ open: false, userId: null, userName: '' })}>
        <DialogTitle>Reset Permissions</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to reset permissions for <strong>{resetDialog.userName}</strong> to default values?
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialog({ open: false, userId: null, userName: '' })}>
            Cancel
          </Button>
          <Button
            onClick={() => resetUserPermissions(resetDialog.userId)}
            color="warning"
            variant="contained"
            disabled={saving[resetDialog.userId]}
          >
            Reset
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Operations Dialog - Premium UI */}
      <Dialog 
        open={bulkDialog.open} 
        onClose={() => setBulkDialog({ open: false, selectedUsers: [], applyToAll: false })} 
        maxWidth="md" 
        fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: '20px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.08)',
              overflow: 'hidden',
              bgcolor: '#FFFFFF',
            },
          },
        }}
        TransitionProps={{
          timeout: 250,
        }}
      >
        {/* Premium Header with Minimal Red */}
        <Box 
          sx={{ 
            bgcolor: '#FFFFFF',
            borderTop: '4px solid #e53935',
            padding: '24px 32px',
            display: 'flex',
            alignItems: 'center',
            gap: 2.5,
          }}
        >
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              bgcolor: 'rgba(229,57,53,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(229,57,53,0.15)',
            }}
          >
            <GroupIcon sx={{ fontSize: 26, color: '#e53935' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, margin: 0, color: '#1a1a2e', fontSize: '1.375rem', lineHeight: 1.3 }}>
              {bulkDialog.applyToAll ? 'Apply Settings to All Users' : 'Apply Settings to Selected Users'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#6B7280', margin: 0, mt: 0.5, fontSize: '0.875rem' }}>
              Configure permissions for multiple users at once
            </Typography>
          </Box>
        </Box>

        <DialogContent sx={{ padding: 0, backgroundColor: '#F7F7F9' }}>
          <Box sx={{ padding: '32px' }}>
            {/* User Selection Card */}
            <Paper 
              elevation={0} 
              sx={{ 
                p: 3,
                borderRadius: '16px',
                border: '1px solid #EFEFEF',
                backgroundColor: '#FFFFFF',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                mb: 3.5,
                transition: 'all 0.2s ease',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: 'rgba(229,57,53,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <GroupIcon sx={{ fontSize: 18, color: '#e53935' }} />
                </Box>
                <Typography 
                  variant="overline" 
                  sx={{ 
                    color: '#e53935',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                  }}
                >
                  Select Users
                </Typography>
              </Box>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, bgcolor: '#F7F7F9', borderRadius: '12px' }}>
                  <Typography variant="body1" sx={{ fontWeight: 500, color: '#1a1a2e', fontSize: '0.9375rem' }}>
                    Apply to all users
                  </Typography>
                  <Switch
                    checked={bulkDialog.applyToAll}
                    onChange={(e) => setBulkDialog(prev => ({ 
                      ...prev, 
                      applyToAll: e.target.checked,
                      selectedUsers: e.target.checked ? [] : prev.selectedUsers
                    }))}
                    sx={{
                      width: 52,
                      height: 28,
                      padding: 0,
                      '& .MuiSwitch-switchBase': {
                        padding: 0,
                        margin: '2px',
                        transitionDuration: '300ms',
                        '&.Mui-checked': {
                          transform: 'translateX(24px)',
                          color: '#fff',
                          '& + .MuiSwitch-track': {
                            backgroundColor: '#e53935',
                            opacity: 1,
                            border: 0,
                          },
                        },
                      },
                      '& .MuiSwitch-thumb': {
                        boxSizing: 'border-box',
                        width: 24,
                        height: 24,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                      },
                      '& .MuiSwitch-track': {
                        borderRadius: 14,
                        backgroundColor: '#D1D5DB',
                        opacity: 1,
                        transition: 'background-color 300ms ease',
                      },
                    }}
                  />
                </Box>
                
                {!bulkDialog.applyToAll && (
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.875rem' }}>
                        Select specific users to apply these settings to:
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setBulkDialog(prev => ({
                              ...prev,
                              selectedUsers: users.map(u => u._id)
                            }));
                          }}
                          sx={{ 
                            textTransform: 'none',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            px: 2,
                            py: 0.75,
                            borderRadius: '20px',
                            borderColor: '#e53935',
                            color: '#e53935',
                            '&:hover': {
                              borderColor: '#d32f2f',
                              bgcolor: 'rgba(229,57,53,0.04)',
                            },
                          }}
                        >
                          Select All
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setBulkDialog(prev => ({
                              ...prev,
                              selectedUsers: []
                            }));
                          }}
                          sx={{ 
                            textTransform: 'none',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            px: 2,
                            py: 0.75,
                            borderRadius: '20px',
                            borderColor: '#e53935',
                            color: '#e53935',
                            '&:hover': {
                              borderColor: '#d32f2f',
                              bgcolor: 'rgba(229,57,53,0.04)',
                            },
                          }}
                        >
                          Deselect All
                        </Button>
                      </Box>
                    </Box>
                    <Box sx={{ 
                      maxHeight: 220, 
                      overflowY: 'auto', 
                      border: '1px solid #EFEFEF', 
                      borderRadius: '12px', 
                      bgcolor: '#FFFFFF',
                      '&::-webkit-scrollbar': {
                        width: '8px',
                      },
                      '&::-webkit-scrollbar-track': {
                        bgcolor: '#F7F7F9',
                        borderRadius: '12px',
                      },
                      '&::-webkit-scrollbar-thumb': {
                        bgcolor: '#D1D5DB',
                        borderRadius: '12px',
                        '&:hover': {
                          bgcolor: '#9CA3AF',
                        },
                      },
                    }}>
                      {users.map((user) => (
                        <Box 
                          key={user._id} 
                          sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 1.5, 
                            p: 1.5,
                            mx: 1,
                            my: 0.5,
                            borderRadius: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            bgcolor: bulkDialog.selectedUsers.includes(user._id) ? 'rgba(229,57,53,0.04)' : 'transparent',
                            '&:hover': {
                              bgcolor: bulkDialog.selectedUsers.includes(user._id) ? 'rgba(229,57,53,0.08)' : '#F7F7F9',
                            },
                          }}
                          onClick={() => {
                            const isSelected = bulkDialog.selectedUsers.includes(user._id);
                            if (isSelected) {
                              setBulkDialog(prev => ({
                                ...prev,
                                selectedUsers: prev.selectedUsers.filter(id => id !== user._id)
                              }));
                            } else {
                              setBulkDialog(prev => ({
                                ...prev,
                                selectedUsers: [...prev.selectedUsers, user._id]
                              }));
                            }
                          }}
                        >
                          <Checkbox
                            checked={bulkDialog.selectedUsers.includes(user._id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setBulkDialog(prev => ({
                                  ...prev,
                                  selectedUsers: [...prev.selectedUsers, user._id]
                                }));
                              } else {
                                setBulkDialog(prev => ({
                                  ...prev,
                                  selectedUsers: prev.selectedUsers.filter(id => id !== user._id)
                                }));
                              }
                            }}
                            size="small"
                            sx={{ 
                              color: '#D1D5DB',
                              '&.Mui-checked': {
                                color: '#e53935',
                              },
                              '& .MuiSvgIcon-root': {
                                borderRadius: '4px',
                              },
                            }}
                          />
                          <Typography variant="body2" sx={{ flex: 1, fontSize: '0.875rem', color: '#1a1a2e', fontWeight: 500 }}>
                            {user.fullName} <Typography component="span" sx={{ color: '#6B7280', fontSize: '0.8125rem' }}>({user.employeeCode})</Typography>
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                    <Typography variant="caption" sx={{ mt: 1.5, display: 'block', color: '#6B7280', fontSize: '0.75rem', fontWeight: 500 }}>
                      {bulkDialog.selectedUsers.length} user(s) selected
                    </Typography>
                  </Box>
                )}
              </Box>
            </Paper>

            <Paper 
              elevation={0} 
              sx={{ 
                p: 3,
                borderRadius: '12px',
                border: '1px solid #e0e0e0',
                backgroundColor: 'white',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                mb: 3
              }}
            >
              <Typography 
                variant="h6" 
                gutterBottom 
                sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1,
                  color: '#e53935',
                  fontWeight: 600,
                  borderBottom: '2px solid #e53935',
                  paddingBottom: 1,
                  marginBottom: 2
                }}
              >
                <SettingsIcon sx={{ color: '#e53935' }} />
                Feature Permissions
              </Typography>
            
            <Grid container spacing={2}>
              <Grid xs={6}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Leaves Section</Typography>
                  <Switch
                    checked={bulkSettings.featurePermissions.leaves}
                    onChange={(e) => setBulkSettings(prev => ({
                      ...prev,
                      featurePermissions: { ...prev.featurePermissions, leaves: e.target.checked }
                    }))}
                  />
                </Box>
              </Grid>
              <Grid xs={6}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Breaks Section</Typography>
                  <Switch
                    checked={bulkSettings.featurePermissions.breaks}
                    onChange={(e) => setBulkSettings(prev => ({
                      ...prev,
                      featurePermissions: { ...prev.featurePermissions, breaks: e.target.checked }
                    }))}
                  />
                </Box>
              </Grid>
              <Grid xs={6}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Extra Features</Typography>
                  <Switch
                    checked={bulkSettings.featurePermissions.extraFeatures}
                    onChange={(e) => setBulkSettings(prev => ({
                      ...prev,
                      featurePermissions: { ...prev.featurePermissions, extraFeatures: e.target.checked }
                    }))}
                  />
                </Box>
              </Grid>
              <Grid xs={6}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Auto-Break on Inactivity</Typography>
                  <Switch
                    checked={bulkSettings.featurePermissions.autoBreakOnInactivity}
                    onChange={(e) => setBulkSettings(prev => ({
                      ...prev,
                      featurePermissions: { ...prev.featurePermissions, autoBreakOnInactivity: e.target.checked }
                    }))}
                  />
                </Box>
              </Grid>
            </Grid>

            {/* Numeric Fields */}
            <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Break Settings</Typography>
            <Grid container spacing={2}>
              <Grid xs={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Max Breaks"
                  type="number"
                  value={bulkSettings.featurePermissions.maxBreaks}
                  onChange={(e) => setBulkSettings(prev => ({
                    ...prev,
                    featurePermissions: { ...prev.featurePermissions, maxBreaks: parseInt(e.target.value) || 0 }
                  }))}
                  inputProps={{ min: 0, max: 999 }}
                />
              </Grid>
              <Grid xs={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Break After Hours"
                  type="number"
                  value={bulkSettings.featurePermissions.breakAfterHours}
                  onChange={(e) => setBulkSettings(prev => ({
                    ...prev,
                    featurePermissions: { ...prev.featurePermissions, breakAfterHours: parseFloat(e.target.value) || 0 }
                  }))}
                  inputProps={{ min: 0, max: 24, step: 0.5 }}
                />
              </Grid>
            </Grid>

            {/* Inactivity Threshold */}
            {bulkSettings.featurePermissions.autoBreakOnInactivity && (
              <Box sx={{ mt: 2 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Inactivity Threshold (minutes)"
                  type="number"
                  value={bulkSettings.featurePermissions.inactivityThresholdMinutes}
                  onChange={(e) => setBulkSettings(prev => ({
                    ...prev,
                    featurePermissions: { ...prev.featurePermissions, inactivityThresholdMinutes: Math.max(1, Math.min(60, parseInt(e.target.value) || 5)) }
                  }))}
                  inputProps={{ min: 1, max: 60 }}
                />
              </Box>
            )}

            <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Break Windows</Typography>
            {bulkSettings.featurePermissions.breakWindows?.map((window, index) => (
              <Box key={index} sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 1, mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2">Break Window {index + 1}</Typography>
                  <IconButton 
                    size="small" 
                    onClick={() => {
                      const newWindows = [...bulkSettings.featurePermissions.breakWindows];
                      newWindows.splice(index, 1);
                      setBulkSettings(prev => ({
                        ...prev,
                        featurePermissions: { ...prev.featurePermissions, breakWindows: newWindows }
                      }));
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
                
                <Grid container spacing={2}>
                  <Grid xs={6}>
                    {/* --- MODIFIED: Break Type Dropdown in Bulk Dialog --- */}
                    <FormControl fullWidth size="small">
                      <InputLabel>Break Type</InputLabel>
                      <Select
                        value={window.type || 'Paid'}
                        label="Break Type"
                        onChange={(e) => {
                          const newWindows = [...bulkSettings.featurePermissions.breakWindows];
                          newWindows[index] = { ...window, type: e.target.value };
                          setBulkSettings(prev => ({
                            ...prev,
                            featurePermissions: { ...prev.featurePermissions, breakWindows: newWindows }
                          }));
                        }}
                      >
                        <MenuItem value="Paid">Paid Break</MenuItem>
                        <MenuItem value="Unpaid">Unpaid Break</MenuItem>
                        <MenuItem value="Extra">Extra Break</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid xs={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Window Name"
                      value={window.name || ''}
                      onChange={(e) => {
                        const newWindows = [...bulkSettings.featurePermissions.breakWindows];
                        newWindows[index] = { ...window, name: e.target.value };
                        setBulkSettings(prev => ({
                          ...prev,
                          featurePermissions: { ...prev.featurePermissions, breakWindows: newWindows }
                        }));
                      }}
                    />
                  </Grid>
                  <Grid xs={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Start Time"
                      type="time"
                      value={window.startTime || '09:00'}
                      onChange={(e) => {
                        const newWindows = [...bulkSettings.featurePermissions.breakWindows];
                        newWindows[index] = { ...window, startTime: e.target.value };
                        setBulkSettings(prev => ({
                          ...prev,
                          featurePermissions: { ...prev.featurePermissions, breakWindows: newWindows }
                        }));
                      }}
                    />
                  </Grid>
                  <Grid xs={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="End Time"
                      type="time"
                      value={window.endTime || '17:00'}
                      onChange={(e) => {
                        const newWindows = [...bulkSettings.featurePermissions.breakWindows];
                        newWindows[index] = { ...window, endTime: e.target.value };
                        setBulkSettings(prev => ({
                          ...prev,
                          featurePermissions: { ...prev.featurePermissions, breakWindows: newWindows }
                        }));
                      }}
                    />
                  </Grid>
                </Grid>
              </Box>
            ))}
            
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => {
                const newWindows = [...(bulkSettings.featurePermissions.breakWindows || []), {
                  type: 'Paid',
                  name: 'New Break Window',
                  startTime: '09:00',
                  endTime: '17:00',
                  isActive: true
                }];
                setBulkSettings(prev => ({
                  ...prev,
                  featurePermissions: { ...prev.featurePermissions, breakWindows: newWindows }
                }));
              }}
              sx={{ mt: 1 }}
            >
              Add Break Window
            </Button>
            </Paper>

            {/* UI Controls Card */}
            <Paper 
              elevation={0} 
              sx={{ 
                p: 3,
                borderRadius: '16px',
                border: '1px solid #EFEFEF',
                backgroundColor: '#FFFFFF',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                mb: 3.5,
                transition: 'all 0.2s ease',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: 'rgba(229,57,53,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SettingsIcon sx={{ fontSize: 18, color: '#e53935' }} />
                </Box>
                <Typography 
                  variant="overline" 
                  sx={{ 
                    color: '#e53935',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                  }}
                >
                  UI Controls
                </Typography>
              </Box>
              
              <Grid container spacing={2.5}>
                <Grid xs={4}>
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    p: 2,
                    bgcolor: '#F7F7F9',
                    borderRadius: '12px',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      bgcolor: '#EFEFEF',
                    },
                  }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#1a1a2e', fontSize: '0.875rem', mb: 1.5, textAlign: 'center' }}>Can Check In</Typography>
                    <Switch
                      checked={bulkSettings.featurePermissions.canCheckIn}
                      onChange={(e) => setBulkSettings(prev => ({
                        ...prev,
                        featurePermissions: { ...prev.featurePermissions, canCheckIn: e.target.checked }
                      }))}
                      sx={{
                        width: 52,
                        height: 28,
                        padding: 0,
                        '& .MuiSwitch-switchBase': {
                          padding: 0,
                          margin: '2px',
                          transitionDuration: '300ms',
                          '&.Mui-checked': {
                            transform: 'translateX(24px)',
                            color: '#fff',
                            '& + .MuiSwitch-track': {
                              backgroundColor: '#e53935',
                              opacity: 1,
                              border: 0,
                            },
                          },
                        },
                        '& .MuiSwitch-thumb': {
                          boxSizing: 'border-box',
                          width: 24,
                          height: 24,
                          boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                        },
                        '& .MuiSwitch-track': {
                          borderRadius: 14,
                          backgroundColor: '#D1D5DB',
                          opacity: 1,
                          transition: 'background-color 300ms ease',
                        },
                      }}
                    />
                  </Box>
                </Grid>
                <Grid xs={4}>
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    p: 2,
                    bgcolor: '#F7F7F9',
                    borderRadius: '12px',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      bgcolor: '#EFEFEF',
                    },
                  }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#1a1a2e', fontSize: '0.875rem', mb: 1.5, textAlign: 'center' }}>Can Check Out</Typography>
                    <Switch
                      checked={bulkSettings.featurePermissions.canCheckOut}
                      onChange={(e) => setBulkSettings(prev => ({
                        ...prev,
                        featurePermissions: { ...prev.featurePermissions, canCheckOut: e.target.checked }
                      }))}
                      sx={{
                        width: 52,
                        height: 28,
                        padding: 0,
                        '& .MuiSwitch-switchBase': {
                          padding: 0,
                          margin: '2px',
                          transitionDuration: '300ms',
                          '&.Mui-checked': {
                            transform: 'translateX(24px)',
                            color: '#fff',
                            '& + .MuiSwitch-track': {
                              backgroundColor: '#e53935',
                              opacity: 1,
                              border: 0,
                            },
                          },
                        },
                        '& .MuiSwitch-thumb': {
                          boxSizing: 'border-box',
                          width: 24,
                          height: 24,
                          boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                        },
                        '& .MuiSwitch-track': {
                          borderRadius: 14,
                          backgroundColor: '#D1D5DB',
                          opacity: 1,
                          transition: 'background-color 300ms ease',
                        },
                      }}
                    />
                  </Box>
                </Grid>
                <Grid xs={4}>
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    p: 2,
                    bgcolor: '#F7F7F9',
                    borderRadius: '12px',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      bgcolor: '#EFEFEF',
                    },
                  }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#1a1a2e', fontSize: '0.875rem', mb: 1.5, textAlign: 'center' }}>Can Take Break</Typography>
                    <Switch
                      checked={bulkSettings.featurePermissions.canTakeBreak}
                      onChange={(e) => setBulkSettings(prev => ({
                        ...prev,
                        featurePermissions: { ...prev.featurePermissions, canTakeBreak: e.target.checked }
                      }))}
                      sx={{
                        width: 52,
                        height: 28,
                        padding: 0,
                        '& .MuiSwitch-switchBase': {
                          padding: 0,
                          margin: '2px',
                          transitionDuration: '300ms',
                          '&.Mui-checked': {
                            transform: 'translateX(24px)',
                            color: '#fff',
                            '& + .MuiSwitch-track': {
                              backgroundColor: '#e53935',
                              opacity: 1,
                              border: 0,
                            },
                          },
                        },
                        '& .MuiSwitch-thumb': {
                          boxSizing: 'border-box',
                          width: 24,
                          height: 24,
                          boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                        },
                        '& .MuiSwitch-track': {
                          borderRadius: 14,
                          backgroundColor: '#D1D5DB',
                          opacity: 1,
                          transition: 'background-color 300ms ease',
                        },
                      }}
                    />
                  </Box>
                </Grid>
              </Grid>
              
              <Box sx={{ mt: 2.5, p: 2.5, bgcolor: '#F7F7F9', borderRadius: '12px' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#1a1a2e', fontSize: '0.875rem' }}>
                      Can View Analytics
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.75rem', mt: 0.3, display: 'block' }}>
                      Access to analytics dashboard and reports
                    </Typography>
                  </Box>
                  <Switch
                    checked={bulkSettings.featurePermissions.canViewAnalytics}
                    onChange={(e) => setBulkSettings(prev => ({
                      ...prev,
                      featurePermissions: { ...prev.featurePermissions, canViewAnalytics: e.target.checked }
                    }))}
                    sx={{
                      width: 52,
                      height: 28,
                      padding: 0,
                      '& .MuiSwitch-switchBase': {
                        padding: 0,
                        margin: '2px',
                        transitionDuration: '300ms',
                        '&.Mui-checked': {
                          transform: 'translateX(24px)',
                          color: '#fff',
                          '& + .MuiSwitch-track': {
                            backgroundColor: '#e53935',
                            opacity: 1,
                            border: 0,
                          },
                        },
                      },
                      '& .MuiSwitch-thumb': {
                        boxSizing: 'border-box',
                        width: 24,
                        height: 24,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                      },
                      '& .MuiSwitch-track': {
                        borderRadius: 14,
                        backgroundColor: '#D1D5DB',
                        opacity: 1,
                        transition: 'background-color 300ms ease',
                      },
                    }}
                  />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#1a1a2e', fontSize: '0.875rem' }}>
                      Can View Live Attendance
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.75rem', mt: 0.3, display: 'block' }}>
                      Real-time present / absent / leave / break board
                    </Typography>
                  </Box>
                  <Switch
                    checked={bulkSettings.featurePermissions.canViewLiveAttendance}
                    onChange={(e) => setBulkSettings(prev => ({
                      ...prev,
                      featurePermissions: { ...prev.featurePermissions, canViewLiveAttendance: e.target.checked }
                    }))}
                    sx={{
                      width: 52,
                      height: 28,
                      padding: 0,
                      '& .MuiSwitch-switchBase': {
                        padding: 0,
                        margin: '2px',
                        transitionDuration: '300ms',
                        '&.Mui-checked': {
                          transform: 'translateX(24px)',
                          color: '#fff',
                          '& + .MuiSwitch-track': {
                            backgroundColor: '#e53935',
                            opacity: 1,
                            border: 0,
                          },
                        },
                      },
                      '& .MuiSwitch-thumb': {
                        boxSizing: 'border-box',
                        width: 24,
                        height: 24,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                      },
                      '& .MuiSwitch-track': {
                        borderRadius: 14,
                        backgroundColor: '#D1D5DB',
                        opacity: 1,
                        transition: 'background-color 300ms ease',
                      },
                    }}
                  />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#1a1a2e', fontSize: '0.875rem' }}>
                      Can Manage Resource Requests
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.75rem', mt: 0.3, display: 'block' }}>
                      Review and update employee resource requests (no delete access)
                    </Typography>
                  </Box>
                  <Switch
                    checked={bulkSettings.featurePermissions.canManageResourceRequests}
                    onChange={(e) => setBulkSettings(prev => ({
                      ...prev,
                      featurePermissions: { ...prev.featurePermissions, canManageResourceRequests: e.target.checked }
                    }))}
                    sx={{
                      width: 52,
                      height: 28,
                      padding: 0,
                      '& .MuiSwitch-switchBase': {
                        padding: 0,
                        margin: '2px',
                        transitionDuration: '300ms',
                        '&.Mui-checked': {
                          transform: 'translateX(24px)',
                          color: '#fff',
                          '& + .MuiSwitch-track': {
                            backgroundColor: '#e53935',
                            opacity: 1,
                            border: 0,
                          },
                        },
                      },
                      '& .MuiSwitch-thumb': {
                        boxSizing: 'border-box',
                        width: 24,
                        height: 24,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                      },
                      '& .MuiSwitch-track': {
                        borderRadius: 14,
                        backgroundColor: '#D1D5DB',
                        opacity: 1,
                        transition: 'background-color 300ms ease',
                      },
                    }}
                  />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#1a1a2e', fontSize: '0.875rem' }}>
                      Can Manage HR Queries
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.75rem', mt: 0.3, display: 'block' }}>
                      View, respond to, and manage employee HR queries
                    </Typography>
                  </Box>
                  <Switch
                    checked={bulkSettings.featurePermissions.canManageHRQueries}
                    onChange={(e) => setBulkSettings(prev => ({
                      ...prev,
                      featurePermissions: { ...prev.featurePermissions, canManageHRQueries: e.target.checked }
                    }))}
                    sx={{
                      width: 52,
                      height: 28,
                      padding: 0,
                      '& .MuiSwitch-switchBase': {
                        padding: 0,
                        margin: '2px',
                        transitionDuration: '300ms',
                        '&.Mui-checked': {
                          transform: 'translateX(24px)',
                          color: '#fff',
                          '& + .MuiSwitch-track': {
                            backgroundColor: '#e53935',
                            opacity: 1,
                            border: 0,
                          },
                        },
                      },
                      '& .MuiSwitch-thumb': {
                        boxSizing: 'border-box',
                        width: 24,
                        height: 24,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                      },
                      '& .MuiSwitch-track': {
                        borderRadius: 14,
                        backgroundColor: '#D1D5DB',
                        opacity: 1,
                        transition: 'background-color 300ms ease',
                      },
                    }}
                  />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#1a1a2e', fontSize: '0.875rem' }}>
                      Can Manage Bulk Attendance Actions
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.75rem', mt: 0.3, display: 'block' }}>
                      Admin summary assistant: live refresh and bulk break controls
                    </Typography>
                  </Box>
                  <Switch
                    checked={bulkSettings.featurePermissions.canManageBulkAttendanceActions}
                    onChange={(e) => setBulkSettings(prev => ({
                      ...prev,
                      featurePermissions: { ...prev.featurePermissions, canManageBulkAttendanceActions: e.target.checked }
                    }))}
                    sx={{
                      width: 52,
                      height: 28,
                      padding: 0,
                      '& .MuiSwitch-switchBase': {
                        padding: 0,
                        margin: '2px',
                        transitionDuration: '300ms',
                        '&.Mui-checked': {
                          transform: 'translateX(24px)',
                          color: '#fff',
                          '& + .MuiSwitch-track': {
                            backgroundColor: '#e53935',
                            opacity: 1,
                            border: 0,
                          },
                        },
                      },
                      '& .MuiSwitch-thumb': {
                        boxSizing: 'border-box',
                        width: 24,
                        height: 24,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                      },
                      '& .MuiSwitch-track': {
                        borderRadius: 14,
                        backgroundColor: '#D1D5DB',
                        opacity: 1,
                        transition: 'background-color 300ms ease',
                      },
                    }}
                  />
                </Box>
              </Box>
            </Paper>

            {/* Privilege Level Card */}
            <Paper 
              elevation={0} 
              sx={{ 
                p: 3,
                borderRadius: '16px',
                border: '1px solid #EFEFEF',
                backgroundColor: '#FFFFFF',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                mb: 3.5,
                transition: 'all 0.2s ease',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: 'rgba(229,57,53,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SecurityIcon sx={{ fontSize: 18, color: '#e53935' }} />
                </Box>
                <Typography 
                  variant="overline" 
                  sx={{ 
                    color: '#e53935',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                  }}
                >
                  Privilege Level
                </Typography>
              </Box>
              
              <FormControl fullWidth>
                <InputLabel>Privilege Level</InputLabel>
                <Select
                  value={bulkSettings.featurePermissions.privilegeLevel}
                  onChange={(e) => setBulkSettings(prev => ({
                    ...prev,
                    featurePermissions: { ...prev.featurePermissions, privilegeLevel: e.target.value }
                  }))}
                  label="Privilege Level"
                  sx={{
                    borderRadius: '12px',
                    bgcolor: '#F7F7F9',
                    '& fieldset': {
                      borderColor: '#EFEFEF',
                    },
                    '&:hover fieldset': {
                      borderColor: '#e53935',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#e53935',
                      borderWidth: '2px',
                      boxShadow: '0 0 0 3px rgba(229,57,53,0.08)',
                    },
                  }}
                >
                  <MenuItem value="restricted">Restricted</MenuItem>
                  <MenuItem value="normal">Normal</MenuItem>
                  <MenuItem value="advanced">Advanced</MenuItem>
                </Select>
              </FormControl>
            </Paper>

            {/* Restricted Features - Only show when privilege level is restricted */}
            {bulkSettings.featurePermissions.privilegeLevel === 'restricted' && (
              <Paper 
                elevation={0} 
                sx={{ 
                  p: 3,
                  borderRadius: '12px',
                  border: '1px solid #e0e0e0',
                  backgroundColor: 'white',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                  mb: 3
                }}
              >
                <Typography 
                  variant="h6" 
                  gutterBottom 
                  sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 1,
                    color: '#e53935',
                    fontWeight: 600,
                    borderBottom: '2px solid #e53935',
                    paddingBottom: 1,
                    marginBottom: 2
                  }}
                >
                  <WarningIcon sx={{ color: '#e53935' }} />
                  Restricted Features
                </Typography>
                
                <Grid container spacing={2}>
                  <Grid xs={6}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">Can View Reports</Typography>
                      <Switch
                        checked={bulkSettings.featurePermissions.restrictedFeatures.canViewReports}
                        onChange={(e) => setBulkSettings(prev => ({
                          ...prev,
                          featurePermissions: { 
                            ...prev.featurePermissions, 
                            restrictedFeatures: {
                              ...prev.featurePermissions.restrictedFeatures,
                              canViewReports: e.target.checked
                            }
                          }
                        }))}
                      />
                    </Box>
                  </Grid>
                  <Grid xs={6}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">Can View Other Logs</Typography>
                      <Switch
                        checked={bulkSettings.featurePermissions.restrictedFeatures.canViewOtherLogs}
                        onChange={(e) => setBulkSettings(prev => ({
                          ...prev,
                          featurePermissions: { 
                            ...prev.featurePermissions, 
                            restrictedFeatures: {
                              ...prev.featurePermissions.restrictedFeatures,
                              canViewOtherLogs: e.target.checked
                            }
                          }
                        }))}
                      />
                    </Box>
                  </Grid>
                  <Grid xs={6}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">Can Edit Profile</Typography>
                      <Switch
                        checked={bulkSettings.featurePermissions.restrictedFeatures.canEditProfile}
                        onChange={(e) => setBulkSettings(prev => ({
                          ...prev,
                          featurePermissions: { 
                            ...prev.featurePermissions, 
                            restrictedFeatures: {
                              ...prev.featurePermissions.restrictedFeatures,
                              canEditProfile: e.target.checked
                            }
                          }
                        }))}
                      />
                    </Box>
                  </Grid>
                  <Grid xs={6}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">Can Request Extra Break</Typography>
                      <Switch
                        checked={bulkSettings.featurePermissions.restrictedFeatures.canRequestExtraBreak}
                        onChange={(e) => setBulkSettings(prev => ({
                          ...prev,
                          featurePermissions: { 
                            ...prev.featurePermissions, 
                            restrictedFeatures: {
                              ...prev.featurePermissions.restrictedFeatures,
                              canRequestExtraBreak: e.target.checked
                            }
                          }
                        }))}
                      />
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            )}

            {/* Advanced Features - Only show when privilege level is advanced */}
            {bulkSettings.featurePermissions.privilegeLevel === 'advanced' && (
              <Paper 
                elevation={0} 
                sx={{ 
                  p: 3,
                  borderRadius: '12px',
                  border: '1px solid #e0e0e0',
                  backgroundColor: 'white',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                  mb: 3
                }}
              >
                <Typography 
                  variant="h6" 
                  gutterBottom 
                  sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 1,
                    color: '#e53935',
                    fontWeight: 600,
                    borderBottom: '2px solid #e53935',
                    paddingBottom: 1,
                    marginBottom: 2
                  }}
                >
                  <SecurityIcon sx={{ color: '#e53935' }} />
                  Advanced Features
                </Typography>
                
                <Grid container spacing={2}>
                  <Grid xs={4}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">Bulk Actions</Typography>
                      <Switch
                        checked={bulkSettings.featurePermissions.advancedFeatures.canBulkActions}
                        onChange={(e) => setBulkSettings(prev => ({
                          ...prev,
                          featurePermissions: { 
                            ...prev.featurePermissions, 
                            advancedFeatures: {
                              ...prev.featurePermissions.advancedFeatures,
                              canBulkActions: e.target.checked
                            }
                          }
                        }))}
                      />
                    </Box>
                  </Grid>
                  <Grid xs={4}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">Export Data</Typography>
                      <Switch
                        checked={bulkSettings.featurePermissions.advancedFeatures.canExportData}
                        onChange={(e) => setBulkSettings(prev => ({
                          ...prev,
                          featurePermissions: { 
                            ...prev.featurePermissions, 
                            advancedFeatures: {
                              ...prev.featurePermissions.advancedFeatures,
                              canExportData: e.target.checked
                            }
                          }
                        }))}
                      />
                    </Box>
                  </Grid>
                  {/* Note: canViewAnalytics is a top-level field, not in advancedFeatures */}
                </Grid>
              </Paper>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ 
          padding: '24px 32px', 
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid #EFEFEF',
          gap: 2,
          flexDirection: 'column',
          alignItems: 'stretch'
        }}>
          {(!bulkDialog.applyToAll && bulkDialog.selectedUsers.length === 0) && (
            <Alert 
              severity="info" 
              sx={{ 
                mb: 1,
                borderRadius: '12px',
                bgcolor: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.2)',
                '& .MuiAlert-icon': {
                  color: '#3B82F6',
                },
              }}
            >
              Please select at least one user or enable "Apply to all users" to proceed.
            </Alert>
          )}
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button 
              onClick={() => setBulkDialog({ open: false, selectedUsers: [], applyToAll: false })}
              sx={{ 
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                px: 3,
                py: 1.25,
                color: '#6B7280',
                '&:hover': {
                  bgcolor: '#F7F7F9',
                  color: '#1a1a2e',
                },
                transition: 'all 0.2s ease',
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={applyBulkSettings}
              disabled={saving.bulk || (!bulkDialog.applyToAll && bulkDialog.selectedUsers.length === 0)}
              sx={{
                bgcolor: '#e53935',
                color: 'white',
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                px: 4,
                py: 1.25,
                borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(229,57,53,0.25)',
                '&:hover': {
                  bgcolor: '#d32f2f',
                  boxShadow: '0 6px 16px rgba(229,57,53,0.35)',
                  transform: 'translateY(-1px)',
                },
                '&:disabled': {
                  bgcolor: '#D1D5DB',
                  color: '#9CA3AF',
                  boxShadow: 'none',
                },
                transition: 'all 0.2s ease',
              }}
            >
              {saving.bulk ? 'Applying...' : 'Apply Settings'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Grace Period Dialog */}
      <Dialog
        open={graceDialog.open}
        onClose={() => setGraceDialog({ open: false, value: gracePeriodMinutes })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Update Late Grace Period</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary">
            Current grace period: <strong>{gracePeriodMinutes} minutes</strong>. Employees clocking in within this
            window are still considered on time.
          </Typography>
          <TextField
            label="Grace period (minutes)"
            type="number"
            fullWidth
            margin="normal"
            value={graceDialog.value}
            onChange={(e) => setGraceDialog(prev => ({ ...prev, value: e.target.value }))}
            inputProps={{ min: 0, max: 1440 }}
            helperText="Enter a value between 0 and 1440 minutes"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGraceDialog({ open: false, value: gracePeriodMinutes })}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleUpdateGracePeriod}
            disabled={updatingGrace}
          >
            {updatingGrace ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Enforce Required Logout Before Checkout - feature toggle (hot-applied, no deploy required) */}
      <Dialog
        open={enforceLogoutDialog.open}
        onClose={() => setEnforceLogoutDialog((prev) => ({ ...prev, open: false }))}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Enforce Required Logout Before Checkout</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            When enabled, employees cannot check out until the required logout time (shift end + excess paid break over 30 min).
            Paid break ≤ 30 min never blocks checkout.
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={enforceLogoutDialog.enabled}
                onChange={handleEnforceLogoutToggle}
                disabled={updatingEnforceLogout}
                color="primary"
              />
            }
            label={enforceLogoutDialog.enabled ? 'Enforced (checkout blocked until required time)' : 'Off (checkout allowed anytime)'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnforceLogoutDialog((prev) => ({ ...prev, open: false }))}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Require Admin Approval for Early Checkout - feature toggle */}
      <Dialog
        open={earlyCheckoutApprovalDialog.open}
        onClose={() => setEarlyCheckoutApprovalDialog((prev) => ({ ...prev, open: false }))}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Require Admin Approval for Early Checkout</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            When enabled, employees who try to check out before the required logout time must submit a request. Checkout is performed only after an admin approves it.
            Requires &quot;Enforce Required Logout Before Checkout&quot; to be enabled.
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={earlyCheckoutApprovalDialog.enabled}
                onChange={handleEarlyCheckoutApprovalToggle}
                disabled={updatingEarlyCheckoutApproval}
                color="primary"
              />
            }
            label={earlyCheckoutApprovalDialog.enabled ? 'On (early checkout requires approval)' : 'Off (early checkout allowed with reason)'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEarlyCheckoutApprovalDialog((prev) => ({ ...prev, open: false }))}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={leavesSectionDialog.open}
        onClose={() => setLeavesSectionDialog((prev) => ({ ...prev, open: false }))}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Leave Section for Users</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            When disabled, employees and interns will not see Leaves in the sidebar and cannot open the leave page.
            Admin and HR can still manage leave requests.
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={leavesSectionDialog.enabled}
                onChange={handleLeavesSectionToggle}
                disabled={updatingLeavesSection}
                color="primary"
              />
            }
            label={leavesSectionDialog.enabled ? 'On (users can see Leaves)' : 'Off (Leaves hidden from users)'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeavesSectionDialog((prev) => ({ ...prev, open: false }))}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Teams Notification Modal */}
      <TeamsNotificationModal open={teamsNotifModal} onClose={() => setTeamsNotifModal(false)} />

    </div>
  );
};

export default ManageSectionPage;