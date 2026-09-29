// frontend/src/components/ITSupport/ITTicketCard.jsx
import React from 'react';
import {
    Card,
    CardContent,
    Typography,
    Box,
    Chip,
    IconButton,
    Tooltip
} from '@mui/material';
import {
    Visibility as ViewIcon,
    AccessTime as TimeIcon,
    PersonOutline as PersonIcon
} from '@mui/icons-material';
import { formatISTDate, formatISTTime } from '../../utils/istTime';

const getPriorityColor = (priority) => {
    switch (priority) {
        case 'Critical':
            return 'error';
        case 'High':
            return 'warning';
        case 'Medium':
            return 'info';
        case 'Low':
            return 'success';
        default:
            return 'default';
    }
};

const getStatusColor = (status) => {
    switch (status) {
        case 'OPEN':
            return 'info';
        case 'ACKNOWLEDGED':
            return 'primary';
        case 'IN_PROGRESS':
            return 'warning';
        case 'WAITING_FOR_USER':
            return 'error';
        case 'RESOLVED':
            return 'success';
        case 'CLOSED':
            return 'default';
        case 'CANCELLED':
            return 'default';
        default:
            return 'default';
    }
};

const formatStatus = (status) => {
    return status
        .split('_')
        .map(word => word.charAt(0) + word.slice(1).toLowerCase())
        .join(' ');
};

const ITTicketCard = ({ ticket, onClick, showAssignee = false }) => {
    const handleClick = () => {
        if (onClick) {
            onClick(ticket);
        }
    };

    return (
        <Card 
            sx={{ 
                mb: 2, 
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                    boxShadow: 3,
                    transform: 'translateY(-2px)'
                }
            }}
            onClick={handleClick}
        >
            <CardContent>
                {/* Header Row */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                    <Box>
                        <Typography variant="h6" component="div" sx={{ fontWeight: 600, mb: 0.5 }}>
                            {ticket.ticketId}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {ticket.category}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Chip 
                            label={ticket.priority} 
                            color={getPriorityColor(ticket.priority)}
                            size="small"
                            sx={{ fontWeight: 500 }}
                        />
                        <Chip 
                            label={formatStatus(ticket.status)} 
                            color={getStatusColor(ticket.status)}
                            size="small"
                            variant="outlined"
                        />
                    </Box>
                </Box>

                {/* Title */}
                <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
                    {ticket.title}
                </Typography>

                {/* Description Preview */}
                <Typography 
                    variant="body2" 
                    color="text.secondary" 
                    sx={{ 
                        mb: 2,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}
                >
                    {ticket.description}
                </Typography>

                {/* Footer Row */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        {/* Created Date */}
                        <Tooltip title="Created">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <TimeIcon fontSize="small" color="action" />
                                <Typography variant="caption" color="text.secondary">
                                    {formatISTDate(ticket.createdAt)}
                                </Typography>
                            </Box>
                        </Tooltip>

                        {/* Assignee (if shown) */}
                        {showAssignee && ticket.assignedToName && (
                            <Tooltip title="Assigned to">
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <PersonIcon fontSize="small" color="action" />
                                    <Typography variant="caption" color="text.secondary">
                                        {ticket.assignedToName}
                                    </Typography>
                                </Box>
                            </Tooltip>
                        )}

                        {/* Unassigned indicator */}
                        {showAssignee && !ticket.assignedToName && (
                            <Chip 
                                label="Unassigned" 
                                size="small" 
                                variant="outlined"
                                color="warning"
                            />
                        )}
                    </Box>

                    {/* View button */}
                    <Tooltip title="View Details">
                        <IconButton size="small" color="primary">
                            <ViewIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            </CardContent>
        </Card>
    );
};

export default ITTicketCard;
