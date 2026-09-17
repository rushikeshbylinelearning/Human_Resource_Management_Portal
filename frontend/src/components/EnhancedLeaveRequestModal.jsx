// frontend/src/components/EnhancedLeaveRequestModal.jsx
import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Chip, Avatar, Divider, TextField, Stack, Card, CardContent, IconButton, Tooltip, Alert, Collapse } from '@mui/material';
import { formatLeaveRequestType } from '../utils/saturdayUtils';
import api from '../api/axios';
import { SkeletonBox } from '../components/SkeletonLoaders';
import {
    Person as PersonIcon,
    CalendarToday as CalendarIcon,
    AccessTime as TimeIcon,
    Description as DescriptionIcon,
    CheckCircle as CheckIcon,
    Cancel as CancelIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Close as CloseIcon,
    Warning as WarningIcon,
    AttachFile as AttachFileIcon,
    PictureAsPdf as PdfIcon,
    Image as ImageIcon,
    OpenInNew as OpenInNewIcon,
    Visibility as VisibilityIcon,
    Schedule as ScheduleIcon,
    Label as LabelIcon,
    Event as EventIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon
} from '@mui/icons-material';

const EnhancedLeaveRequestModal = ({ 
    open, 
    onClose, 
    request, 
    onStatusChange, 
    onEdit, 
    onDelete,
    loading = false 
}) => {
    const [actionLoading, setActionLoading] = useState(false);
    const [loadingCertificate, setLoadingCertificate] = useState(false);
    const [timelineExpanded, setTimelineExpanded] = useState(false);

    const primaryColor = {
        main: '#2C3E50',
        dark: '#1a252f',
        darker: '#0f1619',
        light: '#34495e',
        tint: '#f5f6f7',
        subtle: 'rgba(44, 62, 80, 0.08)',
        subtleStrong: 'rgba(44, 62, 80, 0.12)',
        border: 'rgba(44, 62, 80, 0.18)',
        borderStrong: 'rgba(44, 62, 80, 0.28)',
        shadow: 'rgba(44, 62, 80, 0.14)',
        shadowStrong: 'rgba(44, 62, 80, 0.24)',
        gradient: 'linear-gradient(135deg, #34495e 0%, #2C3E50 55%, #1a252f 100%)',
        solidGradient: 'linear-gradient(135deg, #2C3E50 0%, #1a252f 100%)',
        paperGradient: 'linear-gradient(135deg, #ffffff 0%, #f5f6f7 100%)'
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
    };

    // Format date for metadata row (shorter format)
    const formatDateShort = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    // Format date range for leave dates (compact format)
    const formatDateRangeCompact = (dateStrings) => {
        if (!dateStrings || dateStrings.length === 0) return 'N/A';
        
        const dates = dateStrings
            .map(dateStr => new Date(dateStr))
            .filter(date => !isNaN(date.getTime()))
            .sort((a, b) => a - b);
        
        if (dates.length === 0) return 'N/A';
        if (dates.length === 1) {
            return dates[0].toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        }
        
        const start = dates[0].toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const end = dates[dates.length - 1].toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        return `${start} → ${end}`;
    };

    // Utility function to convert individual dates to date ranges
    const formatDateRange = (dateStrings) => {
        if (!dateStrings || dateStrings.length === 0) return 'N/A';
        
        // Convert to Date objects and sort
        const dates = dateStrings
            .map(dateStr => new Date(dateStr))
            .filter(date => !isNaN(date.getTime()))
            .sort((a, b) => a - b);
        
        if (dates.length === 0) return 'N/A';
        if (dates.length === 1) return formatDate(dates[0]);
        
        // Group consecutive dates into ranges
        const ranges = [];
        let start = dates[0];
        let end = dates[0];
        
        for (let i = 1; i < dates.length; i++) {
            const currentDate = dates[i];
            const previousDate = dates[i - 1];
            const dayDiff = (currentDate - previousDate) / (1000 * 60 * 60 * 24);
            
            if (dayDiff === 1) {
                // Consecutive date, extend the range
                end = currentDate;
            } else {
                // Gap found, save current range and start new one
                ranges.push({ start, end });
                start = currentDate;
                end = currentDate;
            }
        }
        
        // Add the last range
        ranges.push({ start, end });
        
        // Format ranges
        return ranges.map(range => {
            if (range.start.getTime() === range.end.getTime()) {
                return formatDate(range.start);
            } else {
                return `${formatDate(range.start)} to ${formatDate(range.end)}`;
            }
        }).join(', ');
    };

    // Utility function to count total leave days
    const countLeaveDays = (dateStrings) => {
        if (!dateStrings || dateStrings.length === 0) return 0;
        return dateStrings.length;
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Approved': return 'success';
            case 'Rejected': return 'error';
            case 'Pending': return 'warning';
            default: return 'default';
        }
    };

    // Get status color for pill (custom colors)
    const getStatusPillColor = (status) => {
        switch (status) {
            case 'Approved': return { bg: '#4caf50', color: 'white' };
            case 'Rejected': return { bg: '#f44336', color: 'white' };
            case 'Pending': return { bg: '#ff9800', color: 'white' };
            default: return { bg: '#757575', color: 'white' };
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'Approved': return <CheckIcon />;
            case 'Rejected': return <CancelIcon />;
            case 'Pending': return <TimeIcon />;
            default: return <TimeIcon />;
        }
    };

    const handleApprove = async () => {
        setActionLoading(true);
        try {
            await onStatusChange(request._id, 'Approved');
            onClose();
        } catch (error) {
            console.error('Error approving request:', error);
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        setActionLoading(true);
        try {
            await onStatusChange(request._id, 'Rejected', '');
            onClose();
        } catch (error) {
            console.error('Error rejecting request:', error);
        } finally {
            setActionLoading(false);
        }
    };

    const handleClose = () => {
        onClose();
    };

    // Handle medical certificate viewing
    // Fetch the file using fetch API to avoid SSO redirects
    const handleViewCertificate = async (certificateUrl) => {
        if (!certificateUrl) return;
        
        setLoadingCertificate(true);
        
        try {
            // Extract filename from URL
            const urlParts = certificateUrl.split('/');
            const filename = urlParts[urlParts.length - 1];
            
            // Construct the correct URL based on environment
            let fileUrl = certificateUrl;
            
            if (import.meta.env.DEV) {
                // In development, if URL has production domain, replace with local backend
                if (certificateUrl.includes('https://') || certificateUrl.includes('http://localhost:') === false) {
                    // Extract filename and construct local backend URL
                    const backendUrl = api.defaults.baseURL?.replace('/api', '') || 'http://localhost:5000';
                    fileUrl = `${backendUrl}/medical-certificates/${filename}`;
                } else if (!certificateUrl.startsWith('http')) {
                    // Relative path - construct full local URL
                    const backendUrl = api.defaults.baseURL?.replace('/api', '') || 'http://localhost:5000';
                    fileUrl = `${backendUrl}/medical-certificates/${filename}`;
                }
            }
            
            // Get auth token (check sessionStorage first, then localStorage)
            const token = sessionStorage.getItem('ams_token') || sessionStorage.getItem('token') ||
                          localStorage.getItem('ams_token') || localStorage.getItem('token');
            
            // Fetch the file as a blob
            const response = await fetch(fileUrl, {
                method: 'GET',
                headers: token ? {
                    'Authorization': `Bearer ${token}`
                } : {},
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            // Create a blob from the response
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            // Open in new tab
            const newWindow = window.open(blobUrl, '_blank', 'noopener,noreferrer');
            
            if (!newWindow) {
                // Popup blocked, create a download link instead
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
            
            // Clean up blob URL after a delay
            setTimeout(() => {
                URL.revokeObjectURL(blobUrl);
            }, 1000);
            
        } catch (error) {
            console.error('Error viewing medical certificate:', error);
            console.error('Original URL:', certificateUrl);
            
            // Fallback: try opening directly with relative path
            try {
                const urlParts = certificateUrl.split('/');
                const filename = urlParts[urlParts.length - 1];
                const relativeUrl = `/medical-certificates/${filename}`;
                console.log('Trying fallback URL:', relativeUrl);
                window.open(relativeUrl, '_blank', 'noopener,noreferrer');
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
                alert('Failed to open medical certificate. The file may not be accessible. Please contact support.');
            }
        } finally {
            setLoadingCertificate(false);
        }
    };

    if (!request) return null;

    return (
        <Dialog 
            open={open} 
            onClose={handleClose} 
            maxWidth="md" 
            fullWidth
            PaperProps={{
                sx: { 
                    borderRadius: 2,
                    background: '#ffffff',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '90vh'
                }
            }}
        >
            {/* Header - Sticky */}
            <DialogTitle sx={{ 
                pb: 2, 
                pt: 2.5,
                px: 3,
                position: 'sticky',
                top: 0,
                zIndex: 10,
                bgcolor: '#ffffff',
                borderBottom: `1px solid ${primaryColor.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar 
                        sx={{ 
                            width: 48, 
                            height: 48, 
                            bgcolor: primaryColor.main,
                            fontSize: '1.25rem',
                            fontWeight: 600
                        }}
                    >
                        {request.employee?.fullName?.charAt(0) || 'E'}
                    </Avatar>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600, color: primaryColor.main, mb: 0.25 }}>
                            {request.employee?.fullName || 'Unknown Employee'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                            ID: {request.employee?.employeeCode || 'N/A'}
                        </Typography>
                    </Box>
                    <Chip
                        label={request.status}
                        sx={{
                            bgcolor: getStatusPillColor(request.status).bg,
                            color: getStatusPillColor(request.status).color,
                            fontWeight: 600,
                            height: 28,
                            ml: 2
                        }}
                        size="small"
                    />
                </Box>
                <IconButton 
                    onClick={handleClose} 
                    size="small"
                    sx={{ 
                        color: primaryColor.main,
                        '&:hover': {
                            bgcolor: primaryColor.subtle
                        }
                    }}
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ p: 0, overflow: 'auto', flex: 1 }}>
                <Box sx={{ p: 3 }}>
                    {/* 1. Primary Highlight Section - Leave Dates Card */}
                    <Box sx={{ 
                        mb: 3,
                        p: 3,
                        bgcolor: '#e3f2fd',
                        borderRadius: 2,
                        border: '1px solid #90caf9'
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                            <Typography variant="h5" sx={{ fontWeight: 700, color: '#1565c0' }}>
                                {formatDateRangeCompact(request.leaveDates)}
                            </Typography>
                            <Chip 
                                label={`${countLeaveDays(request.leaveDates)} Day${countLeaveDays(request.leaveDates) !== 1 ? 's' : ''}`}
                                sx={{
                                    bgcolor: '#1565c0',
                                    color: 'white',
                                    fontWeight: 700,
                                    fontSize: '0.875rem',
                                    height: 32
                                }}
                            />
                        </Box>
                        <Typography variant="body1" sx={{ fontWeight: 600, color: '#424242' }}>
                            {request.leaveType}
                        </Typography>
                        {request.requestType === 'Compensatory' && request.alternateDate && (
                            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #90caf9' }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: '#1565c0', mb: 0.5 }}>
                                    Alternate Work Date
                                </Typography>
                                <Typography variant="body1" sx={{ fontWeight: 500, color: '#424242' }}>
                                    {formatDateShort(request.alternateDate)}
                                </Typography>
                            </Box>
                        )}
                    </Box>

                    {/* 2. Key Metadata Row */}
                    <Box sx={{ 
                        mb: 3,
                        p: 2,
                        bgcolor: '#fafafa',
                        borderRadius: 2,
                        border: `1px solid ${primaryColor.border}`,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 3,
                        alignItems: 'center'
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 auto', minWidth: '200px' }}>
                            <ScheduleIcon sx={{ color: primaryColor.main, fontSize: 20 }} />
                            <Box>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                    Submitted On
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: primaryColor.main }}>
                                    {formatDateShort(request.createdAt)}
                                </Typography>
                            </Box>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 auto', minWidth: '200px' }}>
                            <LabelIcon sx={{ color: primaryColor.main, fontSize: 20 }} />
                            <Box>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                    Request Type
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: primaryColor.main }}>
                                    {formatLeaveRequestType(request.requestType)}
                                </Typography>
                            </Box>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 auto', minWidth: '200px' }}>
                            <EventIcon sx={{ color: primaryColor.main, fontSize: 20 }} />
                            <Box>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                    Leave Type
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: primaryColor.main }}>
                                    {request.leaveType}
                                </Typography>
                            </Box>
                        </Box>
                    </Box>

                    {/* 3. Status & Timeline - Collapsible */}
                    <Box sx={{ mb: 3 }}>
                        <Box 
                            onClick={() => setTimelineExpanded(!timelineExpanded)}
                            sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between',
                                p: 1.5,
                                cursor: 'pointer',
                                borderRadius: 1,
                                '&:hover': {
                                    bgcolor: primaryColor.subtle
                                }
                            }}
                        >
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: primaryColor.main }}>
                                Status & Timeline
                            </Typography>
                            <IconButton size="small">
                                {timelineExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </IconButton>
                        </Box>
                        <Collapse in={timelineExpanded}>
                            <Box sx={{ 
                                p: 2, 
                                bgcolor: '#fafafa',
                                borderRadius: 1,
                                border: `1px solid ${primaryColor.border}`,
                                mt: 1
                            }}>
                                <Stack spacing={2}>
                                    <Box>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 500 }}>
                                            Current Status
                                        </Typography>
                                        <Chip 
                                            icon={getStatusIcon(request.status)}
                                            label={request.status} 
                                            color={getStatusColor(request.status)}
                                            size="medium"
                                            sx={{ 
                                                fontWeight: 600,
                                                height: 32,
                                                '& .MuiChip-icon': {
                                                    color: 'inherit'
                                                }
                                            }}
                                        />
                                    </Box>
                                    <Box>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 500 }}>
                                            Submitted
                                        </Typography>
                                        <Typography variant="body1" sx={{ fontWeight: 500, color: '#424242' }}>
                                            {formatDate(request.createdAt)}
                                        </Typography>
                                    </Box>
                                    {request.approvedAt && (
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 500 }}>
                                                {request.status === 'Approved' ? 'Approved' : 'Rejected'} On
                                            </Typography>
                                            <Typography variant="body1" sx={{ fontWeight: 500, color: '#424242' }}>
                                                {formatDate(request.approvedAt)}
                                            </Typography>
                                        </Box>
                                    )}
                                </Stack>
                            </Box>
                        </Collapse>
                    </Box>

                    {/* 4. Reason Section */}
                    <Box sx={{ 
                        mb: 3,
                        p: 2.5,
                        border: `1px solid ${primaryColor.border}`,
                        borderRadius: 2,
                        bgcolor: '#ffffff'
                    }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: primaryColor.main, mb: 2 }}>
                            Reason for Leave
                        </Typography>
                        <Typography variant="body1" sx={{ 
                            whiteSpace: 'pre-wrap', 
                            color: '#424242', 
                            lineHeight: 1.7,
                            minHeight: 60
                        }}>
                            {request.reason}
                        </Typography>
                    </Box>

                    {/* Medical Certificate (for Sick Leave) */}
                    {request.requestType === 'Sick' && request.medicalCertificate && (
                        <Box sx={{ 
                            mb: 3,
                            p: 2.5,
                            border: `1px solid ${primaryColor.border}`,
                            borderRadius: 2,
                            bgcolor: '#ffffff'
                        }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                                <AttachFileIcon sx={{ color: primaryColor.main, fontSize: 20 }} />
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: primaryColor.main }}>
                                    Medical Certificate
                                </Typography>
                            </Box>
                            <Box sx={{ 
                                p: 2, 
                                bgcolor: '#fafafa',
                                borderRadius: 1, 
                                border: `1px solid ${primaryColor.border}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 2
                            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                                    {request.medicalCertificate.toLowerCase().endsWith('.pdf') ? (
                                        <PdfIcon sx={{ color: '#d32f2f', fontSize: 36 }} />
                                    ) : (
                                        <ImageIcon sx={{ color: primaryColor.main, fontSize: 36 }} />
                                    )}
                                    <Box>
                                        <Typography variant="body1" sx={{ fontWeight: 600, color: '#424242', mb: 0.5 }}>
                                            Medical Certificate
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {request.medicalCertificate.split('/').pop() || 'Certificate file'}
                                        </Typography>
                                    </Box>
                                </Box>
                                <Stack direction="row" spacing={1}>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        startIcon={loadingCertificate ? <SkeletonBox width="16px" height="16px" borderRadius="50%" /> : <VisibilityIcon />}
                                        onClick={() => handleViewCertificate(request.medicalCertificate)}
                                        disabled={loadingCertificate}
                                        sx={{
                                            borderColor: primaryColor.borderStrong,
                                            color: primaryColor.main,
                                            fontWeight: 600,
                                            '&:hover': {
                                                borderColor: primaryColor.main,
                                                bgcolor: primaryColor.subtle
                                            }
                                        }}
                                    >
                                        View
                                    </Button>
                                    <Button
                                        variant="contained"
                                        size="small"
                                        startIcon={loadingCertificate ? <SkeletonBox width="16px" height="16px" borderRadius="50%" /> : <OpenInNewIcon />}
                                        onClick={() => handleViewCertificate(request.medicalCertificate)}
                                        disabled={loadingCertificate}
                                        sx={{
                                            bgcolor: primaryColor.main,
                                            color: 'white',
                                            fontWeight: 600,
                                            '&:hover': {
                                                bgcolor: primaryColor.dark
                                            }
                                        }}
                                    >
                                        Open
                                    </Button>
                                </Stack>
                            </Box>
                        </Box>
                    )}

                    {/* Rejection Notes (if exists) */}
                    {request.rejectionNotes && (
                        <Box sx={{ 
                            mb: 3,
                            p: 2.5,
                            border: `2px solid #f44336`,
                            borderRadius: 2,
                            bgcolor: '#ffebee'
                        }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                                <WarningIcon sx={{ color: '#f44336', fontSize: 20 }} />
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#f44336' }}>
                                    Rejection Reason
                                </Typography>
                            </Box>
                            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', fontWeight: 500, color: '#424242' }}>
                                {request.rejectionNotes}
                            </Typography>
                        </Box>
                    )}

                </Box>
            </DialogContent>

            {/* 5. Action Footer - Sticky */}
            <DialogActions sx={{ 
                p: 2.5, 
                pt: 2,
                position: 'sticky',
                bottom: 0,
                bgcolor: '#ffffff',
                borderTop: `1px solid ${primaryColor.border}`,
                zIndex: 10
            }}>
                <Box sx={{ display: 'flex', gap: 2, width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                    {/* Left side - Secondary actions */}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Edit Request">
                            <IconButton 
                                onClick={() => onEdit(request)} 
                                size="small"
                                sx={{
                                    bgcolor: primaryColor.subtle,
                                    color: primaryColor.dark,
                                    border: `1px solid ${primaryColor.border}`,
                                    '&:hover': {
                                        bgcolor: primaryColor.subtleStrong,
                                        borderColor: primaryColor.main
                                    }
                                }}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete Request">
                            <IconButton 
                                onClick={() => onDelete(request)}
                                size="small"
                                sx={{
                                    bgcolor: primaryColor.subtle,
                                    color: primaryColor.dark,
                                    border: `1px solid ${primaryColor.border}`,
                                    '&:hover': {
                                        bgcolor: primaryColor.subtleStrong,
                                        borderColor: primaryColor.main
                                    }
                                }}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Button 
                            onClick={handleClose} 
                            variant="outlined"
                            size="medium"
                            sx={{
                                borderColor: primaryColor.borderStrong,
                                color: primaryColor.main,
                                fontWeight: 600,
                                px: 2.5,
                                '&:hover': {
                                    borderColor: primaryColor.main,
                                    bgcolor: primaryColor.subtle
                                }
                            }}
                        >
                            Close
                        </Button>
                    </Box>

                    {/* Right side - Primary actions */}
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        {request.status === 'Pending' && (
                            <>
                                <Button 
                                    onClick={handleReject} 
                                    variant="outlined"
                                    startIcon={actionLoading ? <SkeletonBox width="16px" height="16px" borderRadius="50%" /> : <CancelIcon />}
                                    disabled={actionLoading}
                                    size="medium"
                                    sx={{
                                        borderColor: '#f44336',
                                        color: '#f44336',
                                        fontWeight: 600,
                                        px: 3,
                                        '&:hover': {
                                            borderColor: '#d32f2f',
                                            bgcolor: '#ffebee',
                                            borderWidth: 2
                                        },
                                        '&:disabled': {
                                            borderColor: '#e0e0e0',
                                            color: '#9e9e9e'
                                        }
                                    }}
                                >
                                    Reject
                                </Button>
                                <Button 
                                    onClick={handleApprove} 
                                    variant="contained"
                                    startIcon={actionLoading ? <SkeletonBox width="16px" height="16px" borderRadius="50%" /> : <CheckIcon />}
                                    disabled={actionLoading}
                                    size="medium"
                                    sx={{
                                        bgcolor: '#4caf50',
                                        color: 'white',
                                        fontWeight: 700,
                                        px: 3,
                                        '&:hover': {
                                            bgcolor: '#388e3c',
                                            boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)'
                                        },
                                        '&:disabled': {
                                            bgcolor: '#c8e6c9',
                                            color: '#ffffff'
                                        }
                                    }}
                                >
                                    Approve
                                </Button>
                            </>
                        )}
                    </Box>
                </Box>
            </DialogActions>
        </Dialog>
    );
};

export default EnhancedLeaveRequestModal;

