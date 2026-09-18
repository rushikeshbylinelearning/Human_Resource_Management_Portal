// frontend/src/hooks/usePermissions.jsx
import React, { useContext, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { getISTNow } from '../utils/istTime';

/**
 * Custom hook to check user permissions and feature access
 * Integrates with the AuthContext to provide permission-based UI controls
 */
export const usePermissions = () => {
  const { user } = useAuth();

  const permissions = useMemo(() => {
    const defaults = {
      leaves: true,
      breaks: true,
      extraFeatures: false,
      maxBreaks: 2,
      breakAfterHours: 2,
      canCheckIn: true,
      canCheckOut: true,
      canTakeBreak: true,
      canViewAnalytics: false,
      canViewLiveAttendance: false,
      canManageResourceRequests: false,
      canManageHRQueries: false,
      canManageBulkAttendanceActions: false,
      privilegeLevel: 'normal',
      restrictedFeatures: {
        canViewReports: false,
        canViewOtherLogs: false,
        canEditProfile: true,
        canRequestExtraBreak: true,
      },
      advancedFeatures: {
        canBulkActions: false,
        canExportData: false,
      },
    };

    if (!user?.featurePermissions) {
      return defaults;
    }

    return {
      ...defaults,
      ...user.featurePermissions,
      restrictedFeatures: {
        ...defaults.restrictedFeatures,
        ...(user.featurePermissions.restrictedFeatures || {}),
      },
      advancedFeatures: {
        ...defaults.advancedFeatures,
        ...(user.featurePermissions.advancedFeatures || {}),
      },
    };
  }, [user]);

  // Permission check functions
  const canAccess = useMemo(() => ({
    // Core features
    leaves: () => {
      if (!['Admin', 'HR'].includes(user?.role) && user?.leavesSectionEnabled === false) {
        return false;
      }
      return permissions.leaves === true;
    },
    breaks: () => permissions.breaks === true,
    extraFeatures: () => permissions.extraFeatures === true,
    
    // UI controls
    checkIn: () => permissions.canCheckIn === true,
    checkOut: () => permissions.canCheckOut === true,
    takeBreak: () => permissions.canTakeBreak === true,
    
    // Restricted features
    viewReports: () => {
      if (permissions.privilegeLevel === 'restricted') {
        return permissions.restrictedFeatures?.canViewReports === true;
      }
      return true; // Normal and advanced users can view reports
    },
    
    viewOtherLogs: () => {
      if (permissions.privilegeLevel === 'restricted') {
        return permissions.restrictedFeatures?.canViewOtherLogs === true;
      }
      return true; // Normal and advanced users can view other logs
    },
    
    editProfile: () => {
      if (permissions.privilegeLevel === 'restricted') {
        return permissions.restrictedFeatures?.canEditProfile !== false;
      }
      return true; // Normal and advanced users can edit profile
    },
    
    requestExtraBreak: () => {
      if (permissions.privilegeLevel === 'restricted') {
        return permissions.restrictedFeatures?.canRequestExtraBreak !== false;
      }
      return true; // Normal and advanced users can request extra breaks
    },
    
    // Advanced features
    bulkActions: () => {
      if (permissions.privilegeLevel === 'advanced') {
        return permissions.advancedFeatures?.canBulkActions === true;
      }
      return false; // Only advanced users can perform bulk actions
    },
    
    exportData: () => {
      if (permissions.privilegeLevel === 'advanced') {
        return permissions.advancedFeatures?.canExportData === true;
      }
      return false; // Only advanced users can export data
    },
    
    viewAnalytics: () => {
      // Admin and HR roles can always view analytics
      if (['Admin', 'HR'].includes(user?.role)) {
        return true;
      }
      // Check if user has direct analytics permission
      if (permissions.canViewAnalytics === true) {
        return true;
      }
      return false; // Only users with explicit permission can view analytics
    },

    viewLiveAttendance: () => {
      if (['Admin', 'HR'].includes(user?.role)) {
        return false;
      }
      return permissions.canViewLiveAttendance === true;
    },

    manageResourceRequests: () => {
      if (user?.role === 'Admin') {
        return true;
      }
      return permissions.canManageResourceRequests === true;
    },

    manageBulkAttendanceActions: () => {
      if (user?.role === 'Admin') {
        return true;
      }
      return permissions.canManageBulkAttendanceActions === true;
    },

    manageHRQueries: () => {
      if (['Admin', 'HR'].includes(user?.role)) {
        return true;
      }
      return permissions.canManageHRQueries === true;
    },
  }), [permissions, user?.role, user?.leavesSectionEnabled]);

  // Break management helpers - Time-based restrictions
  const breakLimits = useMemo(() => {
    const windows = permissions.breakWindows || [];

    return {
      maxBreaks: Infinity, // No limit on breaks
      breakAfterHours: 0, // Can take break immediately
      breakWindows: windows, // Time windows for breaks
      
      // Helper function to check if user can take another break - Always true
      canTakeAnotherBreak: () => true,
      
      // Helper function to check if user has worked enough hours to take a break - Always true
      canTakeBreakAfterHours: () => true,
      
      // Helper function to check if current time is within allowed break windows for a SPECIFIC break type
      canTakeBreakNow: (breakType) => {
        // Unpaid breaks are always available regardless of configured windows
        if (breakType === 'Unpaid') {
          return { allowed: true };
        }

        const now = getISTNow(); // Use IST timezone for consistency with backend
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        // If no windows are defined at all, all breaks are allowed by default.
        if (windows.length === 0) {
          return { allowed: true };
        }

        // Find windows SPECIFIC to this break type.
        const relevantWindows = windows.filter(window =>
          window?.isActive !== false && window?.type === breakType
        );

        // If no windows are defined for THIS SPECIFIC break type, it is allowed by default.
        if (relevantWindows.length === 0) {
          return { allowed: true };
        }

        // Check if the current time falls within any of the relevant, active windows.
        for (const window of relevantWindows) {
          if (currentTime >= window.startTime && currentTime <= window.endTime) {
            return {
              allowed: true,
              window,
              message: `This break is allowed until ${window.endTime}.`
            };
          }
        }

        // If windows are defined for this type, but we are outside of them, it is not allowed.
        const nextWindow = relevantWindows
          .filter(window => window.startTime > currentTime)
          .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];

        return {
          allowed: false,
          message: nextWindow
            ? `This break is only allowed between ${nextWindow.startTime} and ${nextWindow.endTime}.`
            : 'The time window for this break has passed for today.'
        };
      }
    };
  }, [permissions]);

  // Privilege level helpers
  const privilegeLevel = useMemo(() => ({
    level: permissions.privilegeLevel || 'normal',
    isRestricted: () => permissions.privilegeLevel === 'restricted',
    isNormal: () => permissions.privilegeLevel === 'normal',
    isAdvanced: () => permissions.privilegeLevel === 'advanced',
    
    // Get privilege level color for UI
    getColor: () => {
      switch (permissions.privilegeLevel) {
        case 'restricted': return 'error';
        case 'normal': return 'primary';
        case 'advanced': return 'success';
        default: return 'default';
      }
    },
    
    // Get privilege level label for UI
    getLabel: () => {
      switch (permissions.privilegeLevel) {
        case 'restricted': return 'Restricted';
        case 'normal': return 'Normal';
        case 'advanced': return 'Advanced';
        default: return 'Normal';
      }
    }
  }), [permissions]);

  // Role-based permissions (existing system integration)
  const rolePermissions = useMemo(() => ({
    isAdmin: () => user?.role === 'Admin',
    isHR: () => user?.role === 'HR',
    isEmployee: () => user?.role === 'Employee',
    isIntern: () => user?.role === 'Intern',
    
    // Admin-only features
    canManageUsers: () => user?.role === 'Admin',
    canManageShifts: () => user?.role === 'Admin',
    canManageOfficeLocations: () => user?.role === 'Admin',
    canManageSection: () => user?.role === 'Admin',
    
    // HR and Admin features
    canViewAllLogs: () => ['Admin', 'HR'].includes(user?.role),
    canApproveLeaves: () => ['Admin', 'HR'].includes(user?.role),
    canViewReports: () => ['Admin', 'HR'].includes(user?.role),
    
    // Employee and Intern features
    canViewOwnLogs: () => ['Employee', 'Intern'].includes(user?.role),
    canRequestLeaves: () => ['Employee', 'Intern'].includes(user?.role)
  }), [user]);

  // Combined permission checker
  const hasPermission = useMemo(() => ({
    // Check if user has specific permission
    check: (permission) => {
      if (typeof permission === 'function') {
        return permission();
      }
      return false;
    },
    
    // Check multiple permissions (AND logic)
    all: (...permissions) => {
      return permissions.every(permission => {
        if (typeof permission === 'function') {
          return permission();
        }
        return false;
      });
    },
    
    // Check multiple permissions (OR logic)
    any: (...permissions) => {
      return permissions.some(permission => {
        if (typeof permission === 'function') {
          return permission();
        }
        return false;
      });
    }
  }), []);

  return {
    permissions,
    canAccess,
    breakLimits,
    privilegeLevel,
    rolePermissions,
    hasPermission,
    
    // Quick access to common checks
    canAccessLeaves: canAccess.leaves(),
    canAccessBreaks: canAccess.breaks(),
    canCheckIn: canAccess.checkIn(),
    canCheckOut: canAccess.checkOut(),
    canTakeBreak: canAccess.takeBreak(),
    isRestricted: privilegeLevel.isRestricted(),
    isAdvanced: privilegeLevel.isAdvanced()
  };
};

export default usePermissions;