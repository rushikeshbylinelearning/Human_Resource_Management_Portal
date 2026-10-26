import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Chip,
    TextField,
    Alert,
    CircularProgress,
    IconButton,
    Tooltip,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    Stack,
    Avatar
} from '@mui/material';
import {
    Close as CloseIcon,
    AccessTime as TimeIcon,
    PersonOutline as PersonIcon,
    LocationOn as LocationIcon,
    Send as SendIcon,
    Download as DownloadIcon,
    Visibility as VisibilityIcon,
    AssignmentInd as AssignedIcon,
    History as HistoryIcon
} from '@mui/icons-material';
import { formatISTDate, formatISTTime } from '../../utils/istTime';
import api from '../../api/axios';
import { downloadImage as downloadImageUtil, getImageFileId } from '../../utils/imageUtils';
import ImageViewerModal from '../ImageUpload/ImageViewerModal';
import AuthenticatedImage from '../ImageUpload/AuthenticatedImage';

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

const initialsFromName = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
};

const SectionLabel = ({ children }) => (
    <Typography
        variant="overline"
        sx={{
            display: 'block',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'text.secondary',
            mb: 1
        }}
    >
        {children}
    </Typography>
);

const MetaItem = ({ icon, label, value }) => {
    if (!value) return null;
    return (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, minWidth: 0 }}>
            <Box sx={{ color: 'text.secondary', mt: '1px' }}>{icon}</Box>
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
                    {label}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500, wordBreak: 'break-word' }}>
                    {value}
                </Typography>
            </Box>
        </Box>
    );
};

const ITTicketDetailsModal = ({
    open,
    onClose,
    ticket,
    onUpdate,
    isAdmin = false,
    canWrite = false,
    canAssign = false
}) => {
    // Staff viewers (isAdmin) can open tickets
    // Write: update status/comments; Assign: assign to IT staff (implies write in permissions)
    const canUpdateTicket = Boolean(isAdmin && canWrite);
    const canAssignTicket = Boolean(isAdmin && canAssign);
    const [comment, setComment] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [assigning, setAssigning] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [imageViewerOpen, setImageViewerOpen] = useState(false);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [fullTicket, setFullTicket] = useState(null);
    const [loadingTicket, setLoadingTicket] = useState(false);
    const [itStaff, setItStaff] = useState([]);
    const [loadingStaff, setLoadingStaff] = useState(false);
    const [selectedAssignee, setSelectedAssignee] = useState('');
    const [statusForm, setStatusForm] = useState({
        status: '',
        adminNotes: ''
    });

    React.useEffect(() => {
        const fetchTicketDetails = async () => {
            if (open && ticket && ticket._id) {
                setLoadingTicket(true);
                setError('');
                setSuccessMessage('');
                try {
                    const response = await api.get(`/it-support/tickets/${ticket._id}`);
                    setFullTicket(response.data.ticket);
                } catch (err) {
                    console.error('Error fetching ticket details:', err);
                    setFullTicket(ticket);
                } finally {
                    setLoadingTicket(false);
                }
            }
        };

        fetchTicketDetails();
    }, [open, ticket]);

    React.useEffect(() => {
        const fetchAssignableStaff = async () => {
            if (!open || !canAssignTicket) return;
            setLoadingStaff(true);
            try {
                const response = await api.get('/it-support/assignees');
                setItStaff(response.data.staff || []);
            } catch (err) {
                console.error('Error fetching IT assignees:', err);
                setItStaff([]);
            } finally {
                setLoadingStaff(false);
            }
        };

        fetchAssignableStaff();
    }, [open, canAssignTicket]);

    const canCancel = fullTicket &&
        ['OPEN', 'ACKNOWLEDGED'].includes(fullTicket.status) &&
        !isAdmin;

    React.useEffect(() => {
        if (fullTicket) {
            setStatusForm({
                status: fullTicket.status || '',
                adminNotes: ''
            });
            setSelectedAssignee(
                fullTicket.assignedTo
                    ? (fullTicket.assignedTo._id || fullTicket.assignedTo).toString()
                    : ''
            );
        }
    }, [fullTicket]);

    const handleUpdateStatus = async () => {
        if (!statusForm.status) {
            setError('Please select a status.');
            return;
        }

        setUpdatingStatus(true);
        setError('');
        setSuccessMessage('');

        try {
            const response = await api.patch(`/it-support/tickets/${fullTicket._id}/status`, {
                status: statusForm.status,
                adminNotes: statusForm.adminNotes.trim() || undefined
            });

            if (onUpdate) {
                onUpdate(response.data.ticket);
            }

            setFullTicket(response.data.ticket);
            setStatusForm({ status: response.data.ticket.status, adminNotes: '' });
            setSuccessMessage('Status updated.');
        } catch (err) {
            console.error('Error updating status:', err);
            setError(err.response?.data?.error || 'Failed to update status.');
        } finally {
            setUpdatingStatus(false);
        }
    };

    const handleAssignTicket = async () => {
        const currentAssigneeId = fullTicket.assignedTo
            ? (fullTicket.assignedTo._id || fullTicket.assignedTo).toString()
            : '';

        if (selectedAssignee === currentAssigneeId) {
            setError('Select a different IT employee to change assignment.');
            return;
        }

        setAssigning(true);
        setError('');
        setSuccessMessage('');

        try {
            const response = await api.patch(`/it-support/tickets/${fullTicket._id}/assign`, {
                assignedTo: selectedAssignee || null
            });

            if (onUpdate) {
                onUpdate(response.data.ticket);
            }

            setFullTicket(response.data.ticket);
            setSuccessMessage(response.data.message || 'Assignment updated.');
        } catch (err) {
            console.error('Error assigning ticket:', err);
            setError(err.response?.data?.error || 'Failed to assign ticket.');
        } finally {
            setAssigning(false);
        }
    };

    const handleAddComment = async () => {
        if (!comment.trim()) {
            setError('Please enter a comment.');
            return;
        }

        setSubmittingComment(true);
        setError('');

        try {
            const response = await api.post(`/it-support/tickets/${fullTicket._id}/comment`, {
                comment: comment.trim(),
                isInternal: false
            });

            if (onUpdate) {
                onUpdate(response.data.ticket);
            }

            setFullTicket(response.data.ticket);
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
            const response = await api.patch(`/it-support/tickets/${fullTicket._id}/cancel`);

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

    if (!fullTicket) {
        return (
            <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
                <DialogContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
                    {loadingTicket ? (
                        <CircularProgress />
                    ) : (
                        <Alert severity="error">Failed to load ticket data</Alert>
                    )}
                </DialogContent>
            </Dialog>
        );
    }

    const attachedImages = Array.isArray(fullTicket.images) ? fullTicket.images : [];
    const visibleComments = (fullTicket.comments || []).filter((c) => !c.isInternal);
    const openImageViewer = (index = 0) => {
        setCurrentImageIndex(index);
        setImageViewerOpen(true);
    };

    const createdMeta = fullTicket.createdAt
        ? `${formatISTDate(fullTicket.createdAt)} · ${formatISTTime(fullTicket.createdAt)}`
        : '';
    const resolvedMeta = fullTicket.resolvedAt
        ? `${formatISTDate(fullTicket.resolvedAt)} · ${formatISTTime(fullTicket.resolvedAt)}`
        : '';
    const createdByMeta = fullTicket.createdByCode
        ? `${fullTicket.createdByName} (${fullTicket.createdByCode})`
        : fullTicket.createdByName;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 3,
                    maxHeight: '92vh',
                    overflow: 'hidden'
                }
            }}
        >
            <Box
                sx={{
                    px: 3,
                    pt: 2.5,
                    pb: 2,
                    pr: 6,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper'
                }}
            >
                <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, letterSpacing: '0.06em', color: 'text.secondary' }}
                >
                    {fullTicket.ticketId}
                    {fullTicket.category ? `  ·  ${fullTicket.category}` : ''}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, lineHeight: 1.3, pr: 1 }}>
                    {fullTicket.title}
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ mt: 1.25 }} flexWrap="wrap" useFlexGap>
                    <Chip
                        label={fullTicket.priority}
                        color={getPriorityColor(fullTicket.priority)}
                        size="small"
                        sx={{ fontWeight: 600, height: 24 }}
                    />
                    <Chip
                        label={formatStatus(fullTicket.status)}
                        color={getStatusColor(fullTicket.status)}
                        size="small"
                        variant="outlined"
                        sx={{ fontWeight: 600, height: 24 }}
                    />
                </Stack>
                <IconButton
                    onClick={onClose}
                    aria-label="Close"
                    sx={{ position: 'absolute', right: 10, top: 10 }}
                >
                    <CloseIcon />
                </IconButton>
            </Box>

            <DialogContent sx={{ px: 3, py: 2.5 }}>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                        {error}
                    </Alert>
                )}
                {successMessage && (
                    <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage('')}>
                        {successMessage}
                    </Alert>
                )}

                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                        gap: 1.75,
                        mb: 2.5
                    }}
                >
                    <MetaItem
                        icon={<PersonIcon fontSize="small" />}
                        label="Created by"
                        value={createdByMeta}
                    />
                    <MetaItem
                        icon={<TimeIcon fontSize="small" />}
                        label="Created"
                        value={createdMeta}
                    />
                    <MetaItem
                        icon={<LocationIcon fontSize="small" />}
                        label="Location"
                        value={fullTicket.location}
                    />
                    <MetaItem
                        icon={<AssignedIcon fontSize="small" />}
                        label="Assigned to"
                        value={fullTicket.assignedToName || (isAdmin ? 'Unassigned' : null)}
                    />
                    {isAdmin && (
                        <MetaItem
                            icon={<PersonIcon fontSize="small" />}
                            label="Last updated by"
                            value={fullTicket.lastUpdatedByName}
                        />
                    )}
                    <MetaItem
                        icon={<TimeIcon fontSize="small" />}
                        label="Resolved"
                        value={resolvedMeta}
                    />
                </Box>

                {fullTicket.description && (
                    <Box sx={{ mb: 2.5 }}>
                        <SectionLabel>Description</SectionLabel>
                        <Box
                            sx={{
                                px: 2,
                                py: 1.5,
                                borderRadius: 2,
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: 'grey.50'
                            }}
                        >
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'text.primary' }}>
                                {fullTicket.description}
                            </Typography>
                        </Box>
                    </Box>
                )}

                {attachedImages.length > 0 && (
                    <Box sx={{ mb: 2.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <SectionLabel>
                                {attachedImages.length} attachment{attachedImages.length > 1 ? 's' : ''}
                            </SectionLabel>
                            <Button
                                size="small"
                                startIcon={<VisibilityIcon />}
                                onClick={() => openImageViewer(0)}
                                sx={{ textTransform: 'none', mb: 1 }}
                            >
                                View {attachedImages.length > 1 ? 'all' : ''}
                            </Button>
                        </Box>
                        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                            {attachedImages.map((image, index) => {
                                const fileId = getImageFileId(image);
                                return (
                                    <Box
                                        key={fileId || index}
                                        sx={{
                                            position: 'relative',
                                            width: 112,
                                            height: 112,
                                            borderRadius: 2,
                                            overflow: 'hidden',
                                            cursor: 'pointer',
                                            bgcolor: 'grey.100',
                                            border: '1px solid',
                                            borderColor: 'divider',
                                            '&:hover .attachment-actions': { opacity: 1 },
                                            '&:hover .attachment-thumb': { transform: 'scale(1.04)' }
                                        }}
                                        onClick={() => openImageViewer(index)}
                                    >
                                        <AuthenticatedImage
                                            className="attachment-thumb"
                                            resourceType="it-support"
                                            resourceId={fullTicket._id}
                                            imageId={fileId}
                                            alt={image.originalName || `Attachment ${index + 1}`}
                                            sx={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover',
                                                transition: 'transform 0.2s ease'
                                            }}
                                        />
                                        <Box
                                            className="attachment-actions"
                                            sx={{
                                                position: 'absolute',
                                                inset: 0,
                                                bgcolor: 'rgba(15, 23, 42, 0.45)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 0.5,
                                                opacity: 0,
                                                transition: 'opacity 0.15s ease'
                                            }}
                                        >
                                            <Tooltip title="View">
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openImageViewer(index);
                                                    }}
                                                    sx={{ bgcolor: 'background.paper', '&:hover': { bgcolor: 'grey.100' } }}
                                                >
                                                    <VisibilityIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Download">
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        downloadImageUtil(
                                                            'it-support',
                                                            fullTicket._id,
                                                            fileId,
                                                            image.originalName
                                                        );
                                                    }}
                                                    sx={{ bgcolor: 'background.paper', '&:hover': { bgcolor: 'grey.100' } }}
                                                >
                                                    <DownloadIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Stack>
                    </Box>
                )}

                {isAdmin && !canUpdateTicket && !canAssignTicket && (
                    <Alert severity="info" sx={{ mb: 2.5 }}>
                        You have view-only IT ticket access. Ask an admin for Write or Assign access to update tickets.
                    </Alert>
                )}

                {canAssignTicket && (
                    <Box
                        sx={{
                            mb: 2.5,
                            p: 2,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider'
                        }}
                    >
                        <SectionLabel>Assign to IT employee</SectionLabel>
                        <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                            <InputLabel>IT employee</InputLabel>
                            <Select
                                value={selectedAssignee}
                                onChange={(e) => setSelectedAssignee(e.target.value)}
                                label="IT employee"
                                disabled={assigning || loadingStaff}
                            >
                                <MenuItem value="">
                                    <em>Unassigned</em>
                                </MenuItem>
                                {itStaff.map((staff) => (
                                    <MenuItem key={staff._id} value={staff._id}>
                                        {staff.fullName}
                                        {staff.employeeCode ? ` (${staff.employeeCode})` : ''}
                                        {staff.role === 'Intern' ? ' · Intern' : ''}
                                        {staff.role === 'Operations' ? ' · Operations' : ''}
                                        {staff.role === 'Admin' ? ' · Admin' : ''}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Button
                            variant="outlined"
                            onClick={handleAssignTicket}
                            disabled={
                                assigning
                                || loadingStaff
                                || selectedAssignee === (
                                    fullTicket.assignedTo
                                        ? (fullTicket.assignedTo._id || fullTicket.assignedTo).toString()
                                        : ''
                                )
                            }
                            startIcon={assigning ? <CircularProgress size={16} color="inherit" /> : <AssignedIcon />}
                            sx={{ textTransform: 'none', fontWeight: 600 }}
                        >
                            {assigning ? 'Saving…' : 'Save assignment'}
                        </Button>
                    </Box>
                )}

                {canUpdateTicket && (
                    <Box
                        sx={{
                            mb: 2.5,
                            p: 2,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider'
                        }}
                    >
                        <SectionLabel>Update status</SectionLabel>
                        <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                            <InputLabel>Status</InputLabel>
                            <Select
                                value={statusForm.status}
                                onChange={(e) => setStatusForm((prev) => ({ ...prev, status: e.target.value }))}
                                label="Status"
                                disabled={updatingStatus}
                            >
                                <MenuItem value="OPEN">Open</MenuItem>
                                <MenuItem value="ACKNOWLEDGED">Acknowledged</MenuItem>
                                <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                                <MenuItem value="WAITING_FOR_USER">Waiting for User</MenuItem>
                                <MenuItem value="RESOLVED">Resolved</MenuItem>
                                <MenuItem value="CLOSED">Closed</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField
                            fullWidth
                            multiline
                            minRows={2}
                            maxRows={4}
                            placeholder="Add a note for this update (optional)"
                            value={statusForm.adminNotes}
                            onChange={(e) => setStatusForm((prev) => ({ ...prev, adminNotes: e.target.value }))}
                            disabled={updatingStatus}
                            size="small"
                            sx={{ mb: 1.5 }}
                        />
                        <Button
                            variant="contained"
                            onClick={handleUpdateStatus}
                            disabled={updatingStatus || statusForm.status === fullTicket?.status}
                            startIcon={updatingStatus && <CircularProgress size={16} color="inherit" />}
                            sx={{ textTransform: 'none', fontWeight: 600 }}
                        >
                            {updatingStatus ? 'Updating…' : 'Save status'}
                        </Button>
                    </Box>
                )}

                {isAdmin && Array.isArray(fullTicket.statusHistory) && fullTicket.statusHistory.length > 0 && (
                    <Box sx={{ mb: 2.5 }}>
                        <SectionLabel>
                            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                                <HistoryIcon sx={{ fontSize: 14 }} />
                                Update history · {fullTicket.statusHistory.length}
                            </Box>
                        </SectionLabel>
                        <Stack
                            spacing={1}
                            sx={{
                                maxHeight: 220,
                                overflowY: 'auto',
                                pr: 0.5
                            }}
                        >
                            {[...fullTicket.statusHistory].reverse().map((entry, index) => (
                                <Box
                                    key={`${entry.timestamp || index}-${entry.changedByName || 'system'}`}
                                    sx={{
                                        p: 1.25,
                                        borderRadius: 2,
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        bgcolor: 'grey.50'
                                    }}
                                >
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.25 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                            {entry.changedByName || 'System'}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                            {entry.timestamp
                                                ? `${formatISTDate(entry.timestamp)} · ${formatISTTime(entry.timestamp)}`
                                                : ''}
                                        </Typography>
                                    </Box>
                                    {entry.status && (
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                            Status: {formatStatus(entry.status)}
                                        </Typography>
                                    )}
                                    {entry.notes && (
                                        <Typography variant="body2" sx={{ mt: 0.25, whiteSpace: 'pre-wrap' }}>
                                            {entry.notes}
                                        </Typography>
                                    )}
                                </Box>
                            ))}
                        </Stack>
                    </Box>
                )}

                <Box>
                    <SectionLabel>
                        Comments{visibleComments.length > 0 ? ` · ${visibleComments.length}` : ''}
                    </SectionLabel>

                    {visibleComments.length > 0 ? (
                        <Stack spacing={1.25} sx={{ mb: 2 }}>
                            {visibleComments.map((comm, index) => (
                                <Box
                                    key={index}
                                    sx={{
                                        display: 'flex',
                                        gap: 1.25,
                                        p: 1.5,
                                        borderRadius: 2,
                                        bgcolor: 'grey.50',
                                        border: '1px solid',
                                        borderColor: 'divider'
                                    }}
                                >
                                    <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: 'primary.main' }}>
                                        {initialsFromName(comm.authorName)}
                                    </Avatar>
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.25 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                {comm.authorName}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                                {formatISTDate(comm.timestamp)} · {formatISTTime(comm.timestamp)}
                                            </Typography>
                                        </Box>
                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'text.primary' }}>
                                            {comm.comment}
                                        </Typography>
                                    </Box>
                                </Box>
                            ))}
                        </Stack>
                    ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            No comments yet. Add a note if you need to share more detail.
                        </Typography>
                    )}

                    {!['CLOSED', 'CANCELLED'].includes(fullTicket.status) && (!isAdmin || canUpdateTicket) && (
                        <Box
                            sx={{
                                display: 'flex',
                                gap: 1,
                                alignItems: 'flex-end',
                                p: 1.25,
                                borderRadius: 2,
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: 'background.paper'
                            }}
                        >
                            <TextField
                                fullWidth
                                multiline
                                minRows={1}
                                maxRows={4}
                                placeholder="Write a comment…"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                disabled={submittingComment}
                                variant="standard"
                                InputProps={{ disableUnderline: true }}
                                sx={{ px: 1, py: 0.5 }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (comment.trim() && !submittingComment) {
                                            handleAddComment();
                                        }
                                    }
                                }}
                            />
                            <Tooltip title="Send comment">
                                <span>
                                    <IconButton
                                        color="primary"
                                        onClick={handleAddComment}
                                        disabled={submittingComment || !comment.trim()}
                                        sx={{
                                            bgcolor: 'primary.main',
                                            color: 'primary.contrastText',
                                            borderRadius: 2,
                                            '&:hover': { bgcolor: 'primary.dark' },
                                            '&.Mui-disabled': { bgcolor: 'action.disabledBackground' }
                                        }}
                                    >
                                        {submittingComment ? <CircularProgress size={18} color="inherit" /> : <SendIcon fontSize="small" />}
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </Box>
                    )}
                </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 1.75, borderTop: '1px solid', borderColor: 'divider' }}>
                {canCancel && (
                    <Button
                        onClick={handleCancelTicket}
                        color="error"
                        disabled={cancelling}
                        startIcon={cancelling && <CircularProgress size={16} />}
                        sx={{ textTransform: 'none' }}
                    >
                        {cancelling ? 'Cancelling…' : 'Cancel ticket'}
                    </Button>
                )}
                <Box sx={{ flex: 1 }} />
                <Button onClick={onClose} variant="contained" sx={{ textTransform: 'none', fontWeight: 600, px: 2.5 }}>
                    Close
                </Button>
            </DialogActions>

            {attachedImages.length > 0 && (
                <ImageViewerModal
                    open={imageViewerOpen}
                    onClose={() => setImageViewerOpen(false)}
                    images={attachedImages}
                    currentIndex={currentImageIndex}
                    resourceType="it-support"
                    resourceId={fullTicket._id}
                    showDownload={true}
                    showNavigation={true}
                />
            )}
        </Dialog>
    );
};

export default ITTicketDetailsModal;
