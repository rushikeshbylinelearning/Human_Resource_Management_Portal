// frontend/src/layouts/Topbar.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Menu, MenuItem, Tooltip, IconButton, Badge, useMediaQuery, useTheme } from '@mui/material';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import MenuIcon from '@mui/icons-material/Menu';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import useNewNotifications from '../hooks/useNewNotifications';
import UserAvatar from './common/UserAvatar'; // CENTRALIZED AVATAR COMPONENT
import AnnouncementDropdown from './AnnouncementDropdown';
import '../styles/Topbar.css';

const Topbar = ({ onNotificationClick, onHamburgerClick }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [anchorEl, setAnchorEl] = useState(null);
    const { unreadCount } = useNewNotifications();
    const [scrolled, setScrolled] = useState(false);
    const theme = useTheme();
    const isMobile = useMediaQuery('(max-width: 768px)');

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 10);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleMenu = (event) => setAnchorEl(event.currentTarget);
    const handleClose = () => setAnchorEl(null);
    const handleProfile = () => {
        handleClose();
        navigate('/profile');
    };
    const handleLogout = () => { 
        handleClose(); 
        logout(); 
        // Don't navigate - logout() handles SSO redirect if needed
        // Only navigate to login if not SSO user
        if (user?.authMethod !== 'SSO') {
        navigate('/login'); 
        }
    };

    return (
        <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
            <div className="topbar-left">
                {isMobile && (
                    <IconButton
                        onClick={onHamburgerClick}
                        size="medium"
                        aria-label="Open navigation menu"
                        sx={{ mr: 1, color: '#212121', padding: '10px' }}
                    >
                        <MenuIcon />
                    </IconButton>
                )}
                <img src="/BL.svg" alt="Company Logo" className="topbar-logo-img" width="40" height="40" />
            </div>
            <div className="topbar-right">
                <AnnouncementDropdown />
                <Tooltip title="Help & Support">
                    <IconButton
                        className="topbar-icon-btn"
                        aria-label="Help and support"
                        data-tour="topbar-help"
                        sx={{ color: '#6b7280' }}
                    >
                        <HelpOutlineIcon />
                    </IconButton>
                </Tooltip>
                <IconButton className="topbar-icon-btn" onClick={onNotificationClick} data-tour="notification-bell">
                    <Badge badgeContent={Number(unreadCount) || 0} color="error" max={99}>
                        <NotificationsNoneIcon />
                    </Badge>
                </IconButton>
                <Tooltip title="Account">
                    <IconButton
                        onClick={handleMenu}
                        sx={{ p: 0 }}
                        data-tour="sidebar-profile"
                        aria-label={user?.fullName ? `Account menu for ${user.fullName}` : 'Account menu'}
                    >
                        <span aria-hidden="true">
                            <UserAvatar 
                                user={user}
                                size="sm"
                            />
                        </span>
                    </IconButton>
                </Tooltip>
                <Menu 
                    anchorEl={anchorEl} 
                    open={Boolean(anchorEl)} 
                    onClose={handleClose} 
                    sx={{ mt: '45px' }}
                    PaperProps={{ sx: { borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' } }}
                >
                    <MenuItem onClick={handleProfile}>Profile</MenuItem>
                    <MenuItem onClick={handleLogout}>Logout</MenuItem>
                </Menu>
            </div>
        </header>
    );
};

export default Topbar;