// frontend/src/pages/NewActivityLogPage.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { Typography, Button, Alert, Chip, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, Box, Avatar, Tooltip, IconButton, TextField, TablePagination, FormControl, InputLabel, Select, MenuItem, Grid, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Divider, Paper, Stack, LinearProgress, Tabs, Tab } from '@mui/material';
import LazyDatePicker from '../components/lazy/LazyDatePicker';
import {
    DeleteOutline as DeleteIcon, VisibilityOutlined as ViewIcon, Search as SearchIcon,
    Refresh as RefreshIcon, Clear as ClearIcon, Login as LoginIcon, Logout as LogoutIcon,
    Coffee as CoffeeIcon, EventNote as EventNoteIcon, CheckCircle, Error, Warning, Info,
    Person as PersonIcon, Category as CategoryIcon, PriorityHigh as PriorityIcon,
    CalendarToday as CalendarIcon
} from '@mui/icons-material';
import '../styles/ActivityLogsPage.css';
import PageHeroHeader from '../components/PageHeroHeader';
import socket from '../socket';
import AdminRequestsPage from './AdminRequestsPage';

import { SkeletonBox } from '../components/SkeletonLoaders';
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata', hour12: true, year: 'numeric', month: 'short',
        day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
};

const getActionIcon = (type = '') => {
    const iconMap = {
        checkin: <LoginIcon color="success" />, checkout: <LogoutIcon color="info" />,
        break_start: <CoffeeIcon color="warning" />, break_end: <CoffeeIcon color="info" />,
        leave_request: <EventNoteIcon color="primary" />, leave_approval: <EventNoteIcon color="success" />,
        leave_rejection: <EventNoteIcon color="error" />, extra_break_request: <CoffeeIcon color="secondary" />,
        extra_break_approval: <CheckCircle color="success" />, extra_break_rejection: <Error color="error" />,
        success: <CheckCircle color="success" />, error: <Error color="error" />,
        warning: <Warning color="warning" />, default: <Info color="info" />
    };
    return iconMap[type] || iconMap.default;
};

const getCategoryColor = (category = '') => ({
    attendance: 'primary', leave: 'secondary', break: 'info', system: 'warning'
}[category] || 'default');

const NewActivityLogPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const [totalCount, setTotalCount] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({ type: '', category: '', priority: '', startDate: null, endDate: null });
    const [viewDialog, setViewDialog] = useState({ open: false, log: null });
    const [showFilters, setShowFilters] = useState(false);
    const [activeTab, setActiveTab] = useState(0);
    const fetchLogsRef = useRef(null);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        setActiveTab(params.get('tab') === 'requests' ? 1 : 0);
    }, [location.search]);

    const handleTabChange = (_, value) => {
        setActiveTab(value);
        const params = new URLSearchParams(location.search);
        if (value === 1) {
            params.set('tab', 'requests');
        } else {
            params.delete('tab');
        }
        navigate(`${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`, { replace: true });
    };

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: (page + 1).toString(), limit: rowsPerPage.toString(), search: searchTerm
            });
            Object.entries(filters).forEach(([key, value]) => {
                if (value) {
                    if (key === 'startDate' || key === 'endDate') {
                        params.append(key, new Date(value).toISOString().split('T')[0]);
                    } else {
                        params.append(key, value);
                    }
                }
            });

            const { data } = await api.get(`/new-notifications/activity-log?${params}`);
            setLogs(data.notifications || []);
            setTotalCount(data.totalCount || 0);
        } catch (err) {
            setError('Failed to fetch activity logs.');
        } finally {
            setLoading(false);
        }
    }, [page, rowsPerPage, searchTerm, filters]);

    // Keep ref updated with latest fetchLogs
    fetchLogsRef.current = fetchLogs;

    useEffect(() => {
        const debounceTimer = setTimeout(() => { fetchLogs(); }, 500);
        return () => clearTimeout(debounceTimer);
    }, [fetchLogs]);
    
    // POLLING REMOVED: Socket events provide real-time updates
    // Listen for new-notification socket events instead of polling
    useEffect(() => {
        if (!socket) return;

        const handleNewNotification = () => {
            console.log('[NewActivityLogPage] Received new-notification event, refreshing logs');
            if (fetchLogsRef.current) {
                fetchLogsRef.current();
            }
        };

        socket.on('new-notification', handleNewNotification);

        // Fallback: Refresh on visibility change if socket disconnected
        const handleVisibilityChange = () => {
            if (!document.hidden && socket.disconnected) {
                console.log('[NewActivityLogPage] Socket disconnected, refreshing on visibility change');
                if (fetchLogsRef.current) {
                    fetchLogsRef.current();
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            socket.off('new-notification', handleNewNotification);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []); // Empty deps - listeners registered once, use ref for latest callback

    // Ensure clean layout state on mount and cleanup on unmount
    useEffect(() => {
        // Reset any potential global styles on mount
        const body = document.body;
        const html = document.documentElement;
        const mainContent = document.querySelector('.main-content');
        
        if (body) {
            body.style.transform = '';
            body.style.zoom = '';
            body.style.maxWidth = '';
            body.style.width = '';
        }
        if (html) {
            html.style.transform = '';
            html.style.zoom = '';
            html.style.maxWidth = '';
            html.style.width = '';
        }
        if (mainContent) {
            mainContent.style.transform = '';
            mainContent.style.zoom = '';
            mainContent.style.maxWidth = '';
            mainContent.style.width = '';
        }

        // Cleanup on unmount
        return () => {
            if (body) {
                body.style.transform = '';
                body.style.zoom = '';
                body.style.maxWidth = '';
                body.style.width = '';
            }
            if (html) {
                html.style.transform = '';
                html.style.zoom = '';
                html.style.maxWidth = '';
                html.style.width = '';
            }
            if (mainContent) {
                mainContent.style.transform = '';
                mainContent.style.zoom = '';
                mainContent.style.maxWidth = '';
                mainContent.style.width = '';
            }
        };
    }, []);

    const handleFilterChange = (filterName, value) => {
        setFilters(prev => ({ ...prev, [filterName]: value }));
        setPage(0);
    };

    const clearFilters = () => {
        setFilters({ type: '', category: '', priority: '', startDate: null, endDate: null });
        setSearchTerm('');
        setPage(0);
    };

    const handleDeleteLog = async (logId) => {
        if (!window.confirm("Are you sure you want to delete this log? This cannot be undone.")) return;
        try {
            await api.delete(`/new-notifications/${logId}`);
            setSnackbar({ open: true, message: 'Log deleted successfully!', severity: 'success' });
            fetchLogs();
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to delete log.', severity: 'error' });
        }
    };
    
    const unreadCount = logs.filter((log) => !log.read).length;
    const attendanceCount = logs.filter((log) => log.category === 'attendance').length;
    const breakCount = logs.filter((log) => log.category === 'break').length;
    const leaveCount = logs.filter((log) => log.category === 'leave').length;

    const summaryStats = [
        { label: 'Total Logs', value: totalCount, sublabel: 'All records in system', color: '#1f5bff' },
        { label: 'Unread', value: unreadCount, sublabel: 'Need your attention', color: '#d93025' },
        { label: 'Attendance', value: attendanceCount, sublabel: 'Clock-in/out & late info', color: '#198754' },
        { label: 'Break & Leave', value: breakCount + leaveCount, sublabel: 'Break + leave events', color: '#f39c12' }
    ];

    const quickCategoryFilters = [
        { label: 'All', value: '' },
        { label: 'Attendance', value: 'attendance' },
        { label: 'Breaks', value: 'break' },
        { label: 'Leaves', value: 'leave' },
        { label: 'System', value: 'system' }
    ];

    return (
        <div className="activity-logs-page">
            <PageHeroHeader
                eyebrow="Real-time Feed"
                title="Activity Log"
                description="Monitor clock-ins, leave requests, and system alerts in real time."
                actionArea={
                    <Button
                        variant="contained"
                        color="secondary"
                        startIcon={<RefreshIcon />}
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        Filter
                    </Button>
                }
            />
            <Paper className="activity-log-tabs" sx={{ mb: 2, borderRadius: 2 }}>
                <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    variant="fullWidth"
                    textColor="primary"
                    indicatorColor="primary"
                >
                    <Tab label="Activity Timeline" />
                    <Tab label="Resource Requests" />
                </Tabs>
            </Paper>

            {activeTab === 1 && <AdminRequestsPage embedded />}
            {activeTab === 0 && (
                <>

            {error && <Alert severity="error" className="error-alert">{error}</Alert>}

            <section className="activity-overview">
                <div className="activity-summary-cards">
                    {summaryStats.map((stat) => (
                        <Card key={stat.label} className="summary-card">
                            <CardContent>
                                <Typography variant="caption" className="summary-label">{stat.label}</Typography>
                                <Typography variant="h4" className="summary-value" sx={{ color: stat.color }}>
                                    {loading ? <SkeletonBox width="24px" height="24px" borderRadius="50%" /> : stat.value}
                                </Typography>
                                <Typography variant="body2" className="summary-sublabel">
                                    {stat.sublabel}
                                </Typography>
                            </CardContent>
                        </Card>
                    ))}
                </div>
                {showFilters && (
                    <Paper className="quick-filter-panel">
                        <Box className="quick-filter-header">
                            <Typography variant="subtitle2">Quick filters</Typography>
                            {filters.category && (
                                <Button size="small" onClick={() => handleFilterChange('category', '')} startIcon={<ClearIcon />}>
                                    Reset
                                </Button>
                            )}
                        </Box>
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                            {quickCategoryFilters.map((filter) => (
                                <Chip
                                    key={filter.label}
                                    label={filter.label}
                                    clickable
                                    color={filters.category === filter.value ? 'primary' : 'default'}
                                    variant={filters.category === filter.value ? 'filled' : 'outlined'}
                                    onClick={() => handleFilterChange('category', filter.value)}
                                />
                            ))}
                        </Stack>
                    </Paper>
                )}
            </section>

            {showFilters && (
                <Paper className="search-filters-container">
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={12}><TextField fullWidth size="small" variant="outlined" placeholder="Search user name, code, or message..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> }} /></Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <LazyDatePicker label="Start Date" value={filters.startDate} onChange={date => handleFilterChange('startDate', date)} slotProps={{ textField: { size: 'small', fullWidth: true, error: false } }} />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <LazyDatePicker label="End Date" value={filters.endDate} onChange={date => handleFilterChange('endDate', date)} slotProps={{ textField: { size: 'small', fullWidth: true, error: false } }} />
                    </Grid>
                    <Grid item xs={12} sm={4} md={2}><FormControl fullWidth size="small"><InputLabel>Type</InputLabel><Select value={filters.type} label="Type" onChange={e => handleFilterChange('type', e.target.value)}><MenuItem value="">All</MenuItem><MenuItem value="checkin">Check In</MenuItem><MenuItem value="checkout">Check Out</MenuItem><MenuItem value="leave_request">Leave Request</MenuItem></Select></FormControl></Grid>
                    <Grid item xs={12} sm={4} md={2}><FormControl fullWidth size="small"><InputLabel>Category</InputLabel><Select value={filters.category} label="Category" onChange={e => handleFilterChange('category', e.target.value)}><MenuItem value="">All</MenuItem><MenuItem value="attendance">Attendance</MenuItem><MenuItem value="leave">Leave</MenuItem><MenuItem value="break">Break</MenuItem></Select></FormControl></Grid>
                    <Grid item xs={12} sm={4} md={2}><Button variant="outlined" startIcon={<ClearIcon />} onClick={clearFilters} fullWidth>Clear Filters</Button></Grid>
                </Grid>
            </Paper>
            )}

            <div className="activity-logs-container">
                {loading && <LinearProgress className="activity-progress-bar" sx={{ bgcolor: '#fee2e2', '& .MuiLinearProgress-bar': { bgcolor: '#dc004e' } }} />}
                <div className="activity-table-wrapper">
                    <TableContainer>
                        <Table stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: '#f9fafb', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', textAlign: 'left', paddingLeft: '24px' }}>Timestamp</TableCell>
                                    <TableCell sx={{ bgcolor: '#f9fafb', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>User</TableCell>
                                    <TableCell sx={{ bgcolor: '#f9fafb', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>Action</TableCell>
                                    <TableCell sx={{ bgcolor: '#f9fafb', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>Message</TableCell>
                                    <TableCell sx={{ bgcolor: '#f9fafb', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', textAlign: 'center' }}>Category</TableCell>
                                    <TableCell sx={{ bgcolor: '#f9fafb', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', textAlign: 'center' }}>Status</TableCell>
                                    <TableCell sx={{ bgcolor: '#f9fafb', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', textAlign: 'center' }}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={7} align="center" sx={{p:4}}><SkeletonBox width="24px" height="24px" borderRadius="50%" /></TableCell></TableRow>
                                ) : logs.map((log, index) => (
                                    <TableRow 
                                        key={log.id || log._id} 
                                        hover 
                                        sx={{
                                            bgcolor: index % 2 === 0 ? 'white' : '#fafbfc',
                                            borderBottom: '1px solid #f3f4f6',
                                            '&:hover': { bgcolor: '#f0f9ff' },
                                            transition: 'background-color 0.2s'
                                        }}
                                    >
                                        <TableCell sx={{ textAlign: 'left', color: '#4b5563', fontSize: '14px', padding: '14px 16px', paddingLeft: '24px' }}>
                                            <Typography variant="body2" sx={{ fontWeight: 500, color: '#1f2937' }}>
                                                {formatDate(log.createdAt)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'left', padding: '14px 16px' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Avatar sx={{ width: 32, height: 32, bgcolor: '#dc004e' }}>
                                                    {log.userName ? log.userName.charAt(0).toUpperCase() : '?'}
                                                </Avatar>
                                                <Typography variant="body2" sx={{ fontWeight: 500, color: '#1f2937' }}>
                                                    {log.userName || 'System'}
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'left', padding: '14px 16px' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                {getActionIcon(log.type)}
                                                <Typography variant="body2" sx={{ textTransform: 'capitalize', color: '#4b5563' }}>
                                                    {log.type?.replace(/_/g, ' ') || 'Unknown'}
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'left', maxWidth: 300, padding: '14px 16px' }}>
                                            <Tooltip title={log.message}>
                                                <Typography 
                                                    variant="body2" 
                                                    sx={{ 
                                                        color: '#4b5563',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                >
                                                    {log.message}
                                                </Typography>
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'center', padding: '14px 16px' }}>
                                            <Chip 
                                                label={log.category || 'N/A'} 
                                                size="small" 
                                                sx={{
                                                    bgcolor: log.category === 'attendance' ? '#d1fae5' : 
                                                            log.category === 'leave' ? '#fed7aa' : 
                                                            log.category === 'break' ? '#dbeafe' : '#e5e7eb',
                                                    color: log.category === 'attendance' ? '#065f46' : 
                                                           log.category === 'leave' ? '#9a3412' : 
                                                           log.category === 'break' ? '#1e40af' : '#374151',
                                                    fontWeight: 600,
                                                    fontSize: '12px'
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'center', padding: '14px 16px' }}>
                                            <Chip 
                                                label={log.read ? 'Read' : 'Unread'} 
                                                size="small" 
                                                sx={{
                                                    bgcolor: log.read ? '#e5e7eb' : '#fee2e2',
                                                    color: log.read ? '#374151' : '#991b1b',
                                                    fontWeight: 600,
                                                    fontSize: '12px',
                                                    border: log.read ? 'none' : '1px solid #fecaca'
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'center', padding: '14px 16px' }}>
                                            <Tooltip title="View Details">
                                                <IconButton size="small" onClick={() => setViewDialog({ open: true, log })} sx={{ color: '#dc004e' }}>
                                                    <ViewIcon />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete">
                                                <IconButton size="small" onClick={() => handleDeleteLog(log._id || log.id)} sx={{ color: '#dc004e' }}>
                                                    <DeleteIcon />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </div>
                {logs.length === 0 && !loading && (
                    <div className="empty-state" style={{ padding: '80px 20px', textAlign: 'center' }}>
                        <Info sx={{ fontSize: 64, color: '#dc004e', mb: 2 }} />
                        <Typography variant="h6" sx={{ color: '#1f2937', fontWeight: 600, mb: 1 }}>
                            No Activity Logs Found
                        </Typography>
                        <Typography sx={{ color: '#6b7280' }}>
                            Try adjusting your search or filter criteria.
                        </Typography>
                    </div>
                )}
                <TablePagination 
                    component="div" 
                    count={totalCount} 
                    page={page} 
                    onPageChange={(e, newPage) => setPage(newPage)} 
                    rowsPerPage={rowsPerPage} 
                    onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                    sx={{
                        borderTop: '1px solid #f3f4f6',
                        '.MuiTablePagination-select': { color: '#dc004e' },
                        '.MuiTablePagination-selectIcon': { color: '#dc004e' }
                    }}
                />
            </div>

            <Dialog 
                open={viewDialog.open} 
                onClose={() => setViewDialog({ open: false, log: null })} 
                maxWidth="md" 
                fullWidth
                PaperProps={{
                    sx: {
                        borderRadius: '16px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                    }
                }}
            >
                <DialogTitle 
                    sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 1.5,
                        bgcolor: '#f9fafb',
                        borderBottom: '1px solid #e5e7eb',
                        padding: '20px 24px',
                        fontSize: '20px',
                        fontWeight: 600,
                        color: '#1f2937'
                    }}
                >
                    <Info sx={{ color: '#dc004e', fontSize: 28 }} /> 
                    Activity Log Details
                </DialogTitle>
                <DialogContent sx={{ padding: '32px 24px', bgcolor: 'white' }}>
                    {viewDialog.log && (
                        <Grid container spacing={3}>
                            {/* User and Timestamp Row */}
                            <Grid item xs={12} md={6}>
                                <Box sx={{ 
                                    padding: '16px', 
                                    bgcolor: '#f9fafb', 
                                    borderRadius: '12px',
                                    border: '1px solid #e5e7eb'
                                }}>
                                    <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        User
                                    </Typography>
                                    <Box display="flex" alignItems="center" gap={1.5} mt={1}>
                                        <Avatar sx={{ width: 40, height: 40, bgcolor: '#dc004e' }}>
                                            {viewDialog.log.userName ? viewDialog.log.userName.charAt(0).toUpperCase() : '?'}
                                        </Avatar>
                                        <Typography variant="body1" sx={{ fontWeight: 500, color: '#1f2937' }}>
                                            {viewDialog.log.userName || 'System'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Box sx={{ 
                                    padding: '16px', 
                                    bgcolor: '#f9fafb', 
                                    borderRadius: '12px',
                                    border: '1px solid #e5e7eb'
                                }}>
                                    <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Timestamp
                                    </Typography>
                                    <Box display="flex" alignItems="center" gap={1} mt={1}>
                                        <CalendarIcon sx={{ color: '#6b7280', fontSize: 20 }} />
                                        <Typography variant="body1" sx={{ fontWeight: 500, color: '#1f2937' }}>
                                            {formatDate(viewDialog.log.createdAt)}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>

                            {/* Action Type and Category Row */}
                            <Grid item xs={12} md={6}>
                                <Box sx={{ 
                                    padding: '16px', 
                                    bgcolor: '#f9fafb', 
                                    borderRadius: '12px',
                                    border: '1px solid #e5e7eb'
                                }}>
                                    <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Action Type
                                    </Typography>
                                    <Box display="flex" alignItems="center" gap={1} mt={1}>
                                        {getActionIcon(viewDialog.log.type)}
                                        <Typography sx={{ textTransform: 'capitalize', fontWeight: 500, color: '#1f2937' }}>
                                            {viewDialog.log.type?.replace(/_/g, ' ') || 'Unknown'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Box sx={{ 
                                    padding: '16px', 
                                    bgcolor: '#f9fafb', 
                                    borderRadius: '12px',
                                    border: '1px solid #e5e7eb'
                                }}>
                                    <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Category
                                    </Typography>
                                    <Box display="flex" alignItems="center" gap={1} mt={1}>
                                        <CategoryIcon sx={{ color: '#6b7280', fontSize: 20 }} />
                                        <Chip 
                                            label={viewDialog.log.category || 'N/A'} 
                                            size="medium"
                                            sx={{
                                                bgcolor: viewDialog.log.category === 'attendance' ? '#d1fae5' : 
                                                        viewDialog.log.category === 'leave' ? '#fed7aa' : 
                                                        viewDialog.log.category === 'break' ? '#dbeafe' : '#e5e7eb',
                                                color: viewDialog.log.category === 'attendance' ? '#065f46' : 
                                                       viewDialog.log.category === 'leave' ? '#9a3412' : 
                                                       viewDialog.log.category === 'break' ? '#1e40af' : '#374151',
                                                fontWeight: 600,
                                                fontSize: '13px'
                                            }}
                                        />
                                    </Box>
                                </Box>
                            </Grid>

                            {/* Priority */}
                            <Grid item xs={12} md={6}>
                                <Box sx={{ 
                                    padding: '16px', 
                                    bgcolor: '#f9fafb', 
                                    borderRadius: '12px',
                                    border: '1px solid #e5e7eb'
                                }}>
                                    <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Priority
                                    </Typography>
                                    <Box display="flex" alignItems="center" gap={1} mt={1}>
                                        <PriorityIcon sx={{ color: '#6b7280', fontSize: 20 }} />
                                        <Chip 
                                            label={viewDialog.log.priority || 'N/A'} 
                                            size="medium"
                                            sx={{
                                                bgcolor: '#e5e7eb',
                                                color: '#374151',
                                                fontWeight: 600
                                            }}
                                        />
                                    </Box>
                                </Box>
                            </Grid>

                            {/* Message */}
                            <Grid item xs={12}>
                                <Box sx={{ 
                                    padding: '20px', 
                                    bgcolor: '#fef3c7', 
                                    borderRadius: '12px',
                                    border: '1px solid #fde68a'
                                }}>
                                    <Typography variant="caption" sx={{ color: '#92400e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Message
                                    </Typography>
                                    <Typography variant="body1" sx={{ mt: 1.5, color: '#78350f', lineHeight: 1.6, fontSize: '15px' }}>
                                        {viewDialog.log.message}
                                    </Typography>
                                </Box>
                            </Grid>
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions sx={{ padding: '16px 24px', bgcolor: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
                    <Button 
                        onClick={() => setViewDialog({ open: false, log: null })}
                        variant="contained"
                        sx={{
                            bgcolor: '#dc004e',
                            color: 'white',
                            textTransform: 'none',
                            fontWeight: 600,
                            padding: '8px 24px',
                            borderRadius: '8px',
                            '&:hover': {
                                bgcolor: '#b00040'
                            }
                        }}
                    >
                        Close
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}><Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} variant="filled">{snackbar.message}</Alert></Snackbar>
                </>
            )}
        </div>
    );
};

export default NewActivityLogPage;









