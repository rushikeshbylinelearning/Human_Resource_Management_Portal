// frontend/src/components/Sidebar.jsx

import React, { useState, useTransition } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

// Importing icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import EventNoteIcon from '@mui/icons-material/EventNote';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import TimelapseIcon from '@mui/icons-material/Timelapse';
import AssessmentIcon from '@mui/icons-material/Assessment';
import NotificationsIcon from '@mui/icons-material/Notifications';
import Badge from '@mui/material/Badge';
import useNewNotifications from '../hooks/useNewNotifications';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PolicyIcon from '@mui/icons-material/Policy';
import BarChartIcon from '@mui/icons-material/BarChart';
import GroupsIcon from '@mui/icons-material/Groups';
import Inventory2Icon from '@mui/icons-material/Inventory2';

import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import './Sidebar.css';

const Logo = () => (
    <img src="/BL.svg" alt="Company Logo" style={{ height: '40px' }} width="40" height="40" />
);

// Updated to accept notification props and mobile menu props
const Sidebar = ({ onNotificationClick, isMobileOpen = false, onClose = () => {} }) => {
    const { user } = useAuth();
    const { unreadCount } = useNewNotifications();
    const { canAccess, rolePermissions } = usePermissions();
    const navigate = useNavigate();
    const [isPending, startTransition] = useTransition();

    const menuItems = [
        { text: 'Home', icon: <DashboardIcon />, path: '/dashboard', roles: ['Employee', 'Intern', 'HR', 'Admin'] },
        { 
            text: 'Summary', 
            icon: <AssessmentIcon />, 
            path: (user && ['Admin', 'HR'].includes(user.role)) ? '/admin/attendance-summary' : '/attendance-summary',
            roles: ['Employee', 'Intern', 'HR', 'Admin'],
            tourId: 'sidebar-attendance',
        },
        { text: 'Employees', icon: <PeopleIcon />, path: '/employees', roles: ['HR', 'Admin'] },
        { text: 'Scheduling', icon: <TimelapseIcon />, path: '/scheduling-management', roles: ['Admin'] },
        { text: 'Policies & CIF', icon: <PolicyIcon />, path: '/admin/policies', roles: ['Admin'] },
        { text: 'Manage Section', icon: <AdminPanelSettingsIcon />, path: '/manage-section', roles: ['Admin'] },
        { text: 'Probation', icon: <AssessmentIcon />, path: '/probation', roles: ['Admin', 'HR'] },
        { 
            text: 'Leaves', 
            icon: <EventNoteIcon />, 
            path: (user && ['Admin', 'HR'].includes(user.role)) ? '/admin/leaves' : '/leaves', 
            roles: ['Employee', 'Intern', 'HR', 'Admin'],
            permissionCheck: () => canAccess.leaves(),
            tourId: 'sidebar-leaves',
        },
        {
            text: 'Requests',
            icon: <Inventory2Icon />,
            path: '/requests',
            roles: ['Employee', 'Intern'],
        },
        {
            text: 'Resources',
            tooltip: 'Resource Requests',
            icon: <Inventory2Icon />,
            path: '/resource-requests/manage',
            roles: ['Employee', 'Intern', 'HR', 'Manager'],
            permissionCheck: () => canAccess.manageResourceRequests(),
        },
        { 
            text: 'Reports', 
            icon: <AdminPanelSettingsIcon />, 
            path: '/reports', 
            roles: ['Admin', 'HR'],
            permissionCheck: () => canAccess.viewReports(),
            tourId: 'sidebar-reports',
        },
        { 
            text: 'Analytics', 
            icon: <BarChartIcon />, 
            path: '/analytics/attendance', 
            roles: ['Admin', 'HR']
        },
        {
            text: 'Live Board',
            tooltip: 'Live Attendance',
            icon: <GroupsIcon />,
            path: '/live-attendance',
            roles: ['Employee', 'Intern'],
            permissionCheck: () => canAccess.viewLiveAttendance(),
        },
        { text: 'Activity Log', icon: <AssessmentIcon />, path: '/activity-log', roles: ['Admin', 'HR', 'Manager'] },
    ];
    
    // Notification item config for all users
    const notificationItem = {
        text: 'Notifications',
        icon: <NotificationsIcon />,
        roles: ['Employee', 'Intern', 'HR', 'Admin', 'Manager']
    };

    if (!user) {
        return <aside className="sidebar"></aside>;
    }

    return (
        <aside className={`sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
            <div className="sidebar-header">
                <Logo />
            </div>

            <nav className="sidebar-nav">
                {menuItems.filter(item => {
                    // Check role-based access
                    if (!item.roles.includes(user.role)) return false;
                    
                    // Check permission-based access if permissionCheck is defined
                    if (item.permissionCheck && !item.permissionCheck()) return false;
                    
                    return true;
                }).map((item) => (
                    <NavLink
                        key={item.text}
                        to={typeof item.path === 'function' ? item.path(user) : item.path}
                        className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
                        data-tooltip={item.tooltip || item.text}
                        data-tour={item.tourId || undefined}
                        onClick={(e) => {
                            e.preventDefault();
                            const targetPath = typeof item.path === 'function' ? item.path(user) : item.path;
                            startTransition(() => {
                                navigate(targetPath);
                            });
                            onClose();
                        }}
                    >
                        <div className="icon-container">
                            {item.icon}
                        </div>
                        <span className="sidebar-label">{item.text}</span>
                    </NavLink>
                ))}
            </nav>

            {/* --- Renders Notification Bell at the bottom for Employees --- */}
            {notificationItem.roles.includes(user.role) && (
                <div className="sidebar-footer">
                     <div
                        className="sidebar-link"
                        data-tooltip={notificationItem.text}
                        onClick={() => { onNotificationClick(); onClose(); }}
                        style={{ cursor: 'pointer' }}
                    >
                        <div className="icon-container">
                            <Badge 
                                badgeContent={unreadCount} 
                                color="error"
                                max={99}
                            >
                                {notificationItem.icon}
                            </Badge>
                        </div>
                        <span className="sidebar-label">{notificationItem.text}</span>
                    </div>
                </div>
            )}
        </aside>
    );
};

export default Sidebar;