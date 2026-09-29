// frontend/src/components/ITSupport/ITTicketDetailsModal.jsx
import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Chip,
    Divider,
    TextField,
    Alert,
    CircularProgress,
    Paper,
    IconButton,
    Tooltip
} from '@mui/material';
import {
    Close as CloseIcon,
    AccessTime as TimeIcon,
    PersonOutline as PersonIcon,
    LocationOn as LocationIcon,
    Send as SendIcon
} from '@mui/icons-material';
import { formatISTDate, formatISTTime } from '../../utils/istTime';
import api from '../../api/axios';

const getPriorityColor = (priority) => {
    switch (priority) {
        case 'Critical': return 'error';
        case 'High': return 'warning';
        case 'Medium': return 'info';
        case 'Low': return 'success';
        default: return 'default';
    }
};

const getStatusColor = (status) => {
    switch (status) {
        case 'OPEN': return 'info';
        case 'ACKNOWLEDGED': return 'primary';
        case 'IN_PROGRESS': return 'warning';
        case 'WAITING_FOR_USER': return 'error';
        case 'RESOLVED': return 'success';
        case 'CLOSED': return 'default';
        case 'CANCELLED': return 'default';
        default: return 'default';
    }
};

const formatStatus = (status) => {
    return status?.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ') || '';
};

const ITTicketDetailsModal = ({ open, onClose, ticket, onUpdate, isAdmin = false }) => {
    const [comment, setComment] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [error, setError] = useState('');

    const canCancel = ticket && 
        ['OPEN', 'ACKNOWLEDGED'].includes(ticket.status) && 
        !isAdmin;

    const handleAddComment = async () => {
        if (!comment.trim()) {
            setError('Please enter a comment.');
            return;
        }

        setSubmittingComment(true);
        setError('');

        try {
            const response = await api.post(`/it-support/tickets/${ticket._id}/comment`, {
                comment: comment.trim(),
                isInternal: false
            });

            if (onUpdate) {
                onUpdate(response.data.ticket);
            }

            setComment('');
        } catch (err) {
            console.error('Error adding comment:', err);
            setError(err.response?.data?.error || 'Failed to add comment.');
        } finally {
            setSubmittingComment(false);
        }
    };

    const handleCancelTicket = async () => {
        if (!window.confirm('Are you sure you want to cancel this ticket?')) {
            return;
        }

        setCancelling(true);
        setError('');

        try {
            const response = await api.patch(`/it-support/tickets/${ticket._id}/cancel`);

            if (onUpdate) {
                onUpdate(response.data.ticket);
            }

            onClose();
        } catch (err) {
            console.error('Error cancelling ticket:', err);
            setError(err.response?.data?.error || 'Failed to cancel ticket.');
        } finally {
            setCancelling(false);
        }
    };

    if (!ticket) return null;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 2,
                    maxHeight: '90vh'
                }
            }}
        >
            <DialogTitle sx={{ pb: 1, pr: 6 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                        <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
                            {ticket.ticketId}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {ticket.category}
                        </Typography>
                    </Box>
                </Box>
                <IconButton
                    onClick={onClose}
                    sx={{
                        position: 'absolute',
                        right: 8,
                        top: 8
                    }}
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                        {error}
                    </Alert>
                )}

                {/* Status and Priority */}
                <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                    <Chip 
                        label={ticket.priority} 
                        color={getPriorityColor(ticket.priority)}
                        size="medium"
                    />
                    <Chip 
                        label={formatStatus(ticket.status)} 
                        color={getStatusColor(ticket.status)}
                        size="medium"
                        variant="outlined"
                    />
                </Box>

                {/* Title */}
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
                    {ticket.title}
                </Typography>

                {/* Description */}
                <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', mb: 3 }}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {ticket.description}
                    </Typography>
                </Paper>

                {/* Metadata */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonIcon fontSize="small" color="action" />
                        <Typography variant="body2">
                            <strong>Created by:</strong> {ticket.createdByName}
                            {ticket.createdByCode && ` (${ticket.createdByCode})`}
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TimeIcon fontSize="small" color="action" />
                        <Typography variant="body2">
                            <strong>Created:</strong> {formatISTDate(ticket.createdAt)} at {formatISTTime(ticket.createdAt)}
                        </Typography>
                    </Box>

                    {ticket.location && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LocationIcon fontSize="small" color="action" />
                            <Typography variant="body2">
                                <strong>Location:</strong> {ticket.location}
                            </Typography>
                        </Box>
                    )}

                    {ticket.assignedToName && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PersonIcon fontSize="small" color="action" />
                            <Typography variant="body2">
                                <strong>Assigned to:</strong> {ticket.assignedToName}
                            </Typography>
                        </Box>
                    )}

                    {ticket.resolvedAt && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TimeIcon fontSize="small" color="action" />
                            <Typography variant="body2">
                                <strong>Resolved:</strong> {formatISTDate(ticket.resolvedAt)} at {formatISTTime(ticket.resolvedAt)}
                            </Typography>
                        </Box>
                    )}
                </Box>

                <Divider sx={{ my: 3 }} />

                {/* Comments Section */}
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                    Comments
                </Typography>

                {ticket.comments && ticket.comments.length > 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
                        {ticket.comments
                            .filter(c => !c.isInternal) // Hide internal notes from users
                            .map((comm, index) => (
                                <Paper key={index} elevation={0} sx={{ p: 2, bgcolor: 'grey.50' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                            {comm.authorName}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {formatISTDate(comm.timestamp)} at {formatISTTime(comm.timestamp)}
                                        </Typography>
                                    </Box>
                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                        {comm.comment}
                                    </Typography>
                                </Paper>
                            ))}
                    </Box>
                ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        No comments yet.
                    </Typography>
                )}

                {/* Add Comment */}
                {!['CLOSED', 'CANCELLED'].includes(ticket.status) && (
                    <Box>
                        <TextField
                            fullWidth
                            multiline
                            rows={3}
                            placeholder="Add a comment..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            disabled={submittingComment}
                            sx={{ mb: 1 }}
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <Button
                                variant="contained"
                                size="small"
                                onClick={handleAddComment}
                                disabled={submittingComment || !comment.trim()}
                                startIcon={submittingComment ? <CircularProgress size={16} /> : <SendIcon />}
                            >
                                {submittingComment ? 'Sending...' : 'Add Comment'}
                            </Button>
                        </Box>
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2 }}>
                {canCancel && (
                    <Button
                        onClick={handleCancelTicket}
                        color="error"
                        disabled={cancelling}
                        startIcon={cancelling && <CircularProgress size={16} />}
                    >
                        {cancelling ? 'Cancelling...' : 'Cancel Ticket'}
                    </Button>
                )}
                <Box sx={{ flex: 1 }} />
                <Button onClick={onClose} variant="outlined">
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ITTicketDetailsModal;
