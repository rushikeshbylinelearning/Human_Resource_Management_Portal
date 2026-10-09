import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    TextField,
    Button,
    IconButton,
    Paper,
    Stack,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Tooltip,
    Badge,
    CircularProgress,
    Alert,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AddIcon from '@mui/icons-material/Add';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import api from '../../api/axios';
import socket from '../../socket';
import {
    buildThreadMessages,
    formatStatusLabel,
    statusStyleKey,
    ticketLastActivityAt,
} from './itTicketThreadUtils';

const ISSUE_CATEGORIES = [
    'Computer / Laptop',
    'Network / LAN / Wi-Fi',
    'Printer / Scanner',
    'Email / Outlook',
    'Microsoft Teams',
    'Login / Access',
    'Software / Application',
    'System Performance',
    'Hardware Issue',
    'Other',
];

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

const statusColors = {
    open: '#ff9800',
    'in-progress': '#2196f3',
    resolved: '#4caf50',
    closed: '#9e9e9e',
};

const ITTicketChat = ({ onClose }) => {
    const [tickets, setTickets] = useState([]);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [newTicketData, setNewTicketData] = useState({
        category: '',
        title: '',
        description: '',
        priority: 'Medium',
        location: '',
    });
    const messagesEndRef = useRef(null);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchTickets();
    }, []);

    // Real-time socket updates for IT tickets
    useEffect(() => {
        const handleTicketUpdate = (data) => {
            // Update the ticket in the list
            setTickets(prev => prev.map(ticket => 
                ticket._id === data.ticketId ? { ...ticket, ...data.ticket } : ticket
            ));
            
            // Update selected ticket if it's the one being viewed
            if (selectedTicket && selectedTicket._id === data.ticketId) {
                setSelectedTicket(prev => ({
                    ...prev,
                    ...data.ticket,
                    messages: buildThreadMessages(data.ticket)
                }));
            }
        };

        socket.on('it_ticket_updated', handleTicketUpdate);

        return () => {
            socket.off('it_ticket_updated', handleTicketUpdate);
        };
    }, [selectedTicket]);

    useEffect(() => {
        scrollToBottom();
    }, [selectedTicket?.messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const response = await api.get('/it-support/tickets/mine');
            setTickets(response.data.tickets || []);
        } catch (err) {
            console.error('Failed to fetch tickets:', err);
            setError('Failed to load your queries');
        } finally {
            setLoading(false);
        }
    };

    const fetchTicketDetails = async (ticketId) => {
        try {
            const response = await api.get(`/it-support/tickets/${ticketId}`);
            const ticket = response.data.ticket;
            setSelectedTicket({
                ...ticket,
                messages: buildThreadMessages(ticket),
            });
        } catch (err) {
            console.error('Failed to fetch ticket details:', err);
            setError('Failed to load ticket details');
        }
    };

    const handleCreateTicket = async () => {
        if (!newTicketData.category || !newTicketData.title.trim() || !newTicketData.description.trim()) {
            setError('Category, title, and description are required');
            return;
        }

        setSending(true);
        try {
            await api.post('/it-support/tickets', newTicketData);
            setCreateDialogOpen(false);
            setNewTicketData({
                category: '',
                title: '',
                description: '',
                priority: 'Medium',
                location: '',
            });
            await fetchTickets();
        } catch (err) {
            console.error('Failed to create ticket:', err);
            setError(err.response?.data?.error || 'Failed to submit ticket');
        } finally {
            setSending(false);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedTicket) return;

        setSending(true);
        try {
            await api.post(`/it-support/tickets/${selectedTicket._id}/comment`, {
                comment: newMessage.trim(),
            });
            setNewMessage('');
            await fetchTicketDetails(selectedTicket._id);
        } catch (err) {
            console.error('Failed to send message:', err);
            setError('Failed to send message');
        } finally {
            setSending(false);
        }
    };

    const handleCloseTicket = async (ticketId) => {
        try {
            await api.patch(`/it-support/tickets/${ticketId}/cancel`);
            await fetchTickets();
            if (selectedTicket?._id === ticketId) {
                setSelectedTicket(null);
            }
        } catch (err) {
            console.error('Failed to cancel ticket:', err);
            setError('Failed to cancel ticket');
        }
    };

    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const getSenderIcon = (sender) => {
        if (sender === 'employee') {
            return <PersonIcon sx={{ fontSize: 18 }} />;
        }
        return <SupportAgentIcon sx={{ fontSize: 18 }} />;
    };

    const isTicketClosed = (status) => ['CLOSED', 'CANCELLED'].includes(status);

    const canCancelTicket = (ticket) =>
        ticket && ['OPEN', 'ACKNOWLEDGED'].includes(ticket.status);

    // List View
    if (!selectedTicket) {
        return (
            <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: '#f6f7f9' }}>
                <Box sx={{
                    px: 2,
                    py: 1.5,
                    bgcolor: '#fff',
                    borderBottom: '1px solid #eceef2',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    flexShrink: 0,
                }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.02em', color: '#1a1a1a', lineHeight: 1.2 }}>
                            IT support
                        </Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.25 }}>
                            Your queries
                        </Typography>
                    </Box>
                    <Button
                        size="small"
                        startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                        onClick={() => setCreateDialogOpen(true)}
                        sx={{
                            textTransform: 'none',
                            fontSize: '0.78rem',
                            fontWeight: 650,
                            backgroundColor: '#C62828',
                            color: '#fff',
                            borderRadius: '8px',
                            px: 1.25,
                            boxShadow: 'none',
                            '&:hover': { backgroundColor: '#B71C1C', boxShadow: 'none' },
                        }}
                    >
                        New
                    </Button>
                    {onClose && (
                        <IconButton size="small" onClick={onClose} aria-label="Close IT queries" sx={{ color: '#6b7280' }}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    )}
                </Box>

                {error && (
                    <Alert severity="error" sx={{ m: 1.5, mb: 0, borderRadius: '10px' }} onClose={() => setError('')}>
                        {error}
                    </Alert>
                )}

                <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1.5 }}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                            <CircularProgress size={26} sx={{ color: '#C62828' }} />
                        </Box>
                    ) : tickets.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
                            <QuestionAnswerIcon sx={{ fontSize: 40, color: '#d1d5db', mb: 1.5 }} />
                            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
                                No queries yet
                            </Typography>
                            <Typography sx={{ fontSize: '0.8rem', color: '#6b7280', mt: 0.5, mb: 2 }}>
                                Describe an IT issue and the team will pick it up.
                            </Typography>
                            <Button
                                size="small"
                                startIcon={<AddIcon />}
                                onClick={() => setCreateDialogOpen(true)}
                                sx={{ textTransform: 'none', color: '#C62828' }}
                            >
                                New query
                            </Button>
                        </Box>
                    ) : (
                        <Stack spacing={1}>
                            {tickets.map((ticket) => {
                                const styleKey = statusStyleKey(ticket.status);
                                const open = ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED';
                                return (
                                    <Paper
                                        key={ticket._id}
                                        elevation={0}
                                        onClick={() => fetchTicketDetails(ticket._id)}
                                        sx={{
                                            p: 1.5,
                                            border: '1px solid #eceef2',
                                            borderRadius: '12px',
                                            cursor: 'pointer',
                                            backgroundColor: '#fff',
                                            boxShadow: open ? 'inset 3px 0 0 #C62828' : 'none',
                                            '&:hover': { borderColor: '#e0e0e0', backgroundColor: '#fafafa' },
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.75 }}>
                                            <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 650, fontSize: '0.84rem', color: '#1a1a1a', lineHeight: 1.35 }}>
                                                {ticket.title}
                                            </Typography>
                                            <Typography sx={{ fontSize: '0.7rem', color: '#9ca3af', flexShrink: 0 }}>
                                                {formatTimestamp(ticketLastActivityAt(ticket))}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                                            <Chip
                                                label={formatStatusLabel(ticket.status)}
                                                size="small"
                                                sx={{
                                                    height: 20,
                                                    fontSize: '0.68rem',
                                                    backgroundColor: statusColors[styleKey],
                                                    color: '#fff',
                                                    fontWeight: 650,
                                                }}
                                            />
                                            <Chip
                                                label={ticket.category}
                                                size="small"
                                                variant="outlined"
                                                sx={{ height: 20, fontSize: '0.68rem', borderColor: '#e5e7eb', color: '#4b5563' }}
                                            />
                                            {ticket.unreadCount > 0 && (
                                                <Badge badgeContent={ticket.unreadCount} color="error" sx={{ ml: 'auto' }} />
                                            )}
                                        </Box>
                                    </Paper>
                                );
                            })}
                        </Stack>
                    )}
                </Box>

                <Dialog
                    open={createDialogOpen}
                    onClose={() => setCreateDialogOpen(false)}
                    maxWidth="sm"
                    fullWidth
                >
                    <DialogTitle>
                        Ask IT a Question
                        <IconButton
                            onClick={() => setCreateDialogOpen(false)}
                            sx={{ position: 'absolute', right: 8, top: 8 }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </DialogTitle>
                    <DialogContent>
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <FormControl fullWidth required>
                                <InputLabel>Issue Category</InputLabel>
                                <Select
                                    value={newTicketData.category}
                                    onChange={(e) => setNewTicketData({ ...newTicketData, category: e.target.value })}
                                    label="Issue Category"
                                >
                                    {ISSUE_CATEGORIES.map((cat) => (
                                        <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl fullWidth>
                                <InputLabel>Priority</InputLabel>
                                <Select
                                    value={newTicketData.priority}
                                    onChange={(e) => setNewTicketData({ ...newTicketData, priority: e.target.value })}
                                    label="Priority"
                                >
                                    {PRIORITIES.map((p) => (
                                        <MenuItem key={p} value={p}>{p}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <TextField
                                label="Subject"
                                fullWidth
                                value={newTicketData.title}
                                onChange={(e) => setNewTicketData({ ...newTicketData, title: e.target.value })}
                                placeholder="Brief description of your issue"
                            />
                            <TextField
                                label="Your Message"
                                fullWidth
                                multiline
                                rows={4}
                                value={newTicketData.description}
                                onChange={(e) => setNewTicketData({ ...newTicketData, description: e.target.value })}
                                placeholder="Describe the issue in detail..."
                            />
                            <TextField
                                label="Location (optional)"
                                fullWidth
                                value={newTicketData.location}
                                onChange={(e) => setNewTicketData({ ...newTicketData, location: e.target.value })}
                                placeholder="Desk, floor, or workstation"
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setCreateDialogOpen(false)} disabled={sending}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateTicket}
                            variant="contained"
                            disabled={
                                sending
                                || !newTicketData.category
                                || !newTicketData.title.trim()
                                || !newTicketData.description.trim()
                            }
                        >
                            {sending ? 'Submitting...' : 'Submit Query'}
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
        );
    }

    const selectedStyleKey = statusStyleKey(selectedTicket.status);

    return (
        <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: '#f6f7f9' }}>
            <Box sx={{
                px: 1.5,
                py: 1.25,
                bgcolor: '#fff',
                borderBottom: '1px solid #eceef2',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexShrink: 0,
            }}>
                <IconButton size="small" onClick={() => setSelectedTicket(null)} aria-label="Back to queries">
                    <ArrowBackIcon fontSize="small" />
                </IconButton>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1a1a1a' }}>
                        {selectedTicket.title}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.4 }}>
                        <Chip
                            label={formatStatusLabel(selectedTicket.status)}
                            size="small"
                            sx={{
                                height: 18,
                                fontSize: '0.65rem',
                                backgroundColor: statusColors[selectedStyleKey],
                                color: '#fff',
                                fontWeight: 650,
                            }}
                        />
                        <Chip
                            label={selectedTicket.category}
                            size="small"
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.65rem', borderColor: '#e5e7eb' }}
                        />
                    </Box>
                </Box>
                {canCancelTicket(selectedTicket) && (
                    <Tooltip title="Cancel query">
                        <IconButton size="small" onClick={() => handleCloseTicket(selectedTicket._id)}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            {error && (
                <Alert severity="error" sx={{ m: 1.5, mb: 0, borderRadius: '10px' }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1.5, py: 1.5 }}>
                <Stack spacing={1.25}>
                    {(selectedTicket.messages || []).map((msg, index) => {
                        const isEmployee = msg.sender === 'employee';
                        return (
                            <Box key={index} sx={{ display: 'flex', justifyContent: isEmployee ? 'flex-end' : 'flex-start' }}>
                                <Paper
                                    elevation={0}
                                    sx={{
                                        p: 1.25,
                                        maxWidth: '82%',
                                        backgroundColor: isEmployee ? '#fff' : '#f3f4f6',
                                        borderRadius: isEmployee ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                                        border: '1px solid #eceef2',
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.4 }}>
                                        {getSenderIcon(msg.sender)}
                                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 650, color: '#374151' }}>
                                            {msg.senderName}
                                        </Typography>
                                        <Typography sx={{ ml: 'auto', fontSize: '0.65rem', color: '#9ca3af' }}>
                                            {formatTimestamp(msg.timestamp)}
                                        </Typography>
                                    </Box>
                                    <Typography sx={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap', color: '#1a1a1a', lineHeight: 1.45 }}>
                                        {msg.message}
                                    </Typography>
                                </Paper>
                            </Box>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </Stack>
            </Box>

            {!isTicketClosed(selectedTicket.status) && (
                <Box sx={{ display: 'flex', gap: 1, p: 1.5, bgcolor: '#fff', borderTop: '1px solid #eceef2', flexShrink: 0 }}>
                    <TextField
                        fullWidth
                        size="small"
                        multiline
                        maxRows={3}
                        placeholder="Write a reply"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: '0.84rem', bgcolor: '#f9fafb' } }}
                    />
                    <IconButton
                        onClick={handleSendMessage}
                        disabled={sending || !newMessage.trim()}
                        aria-label="Send message"
                        sx={{
                            backgroundColor: '#C62828',
                            color: '#fff',
                            borderRadius: '10px',
                            width: 40,
                            height: 40,
                            '&:hover': { backgroundColor: '#B71C1C' },
                            '&:disabled': { backgroundColor: '#e5e7eb', color: '#9ca3af' },
                        }}
                    >
                        <SendIcon fontSize="small" />
                    </IconButton>
                </Box>
            )}
        </Box>
    );
};

export default ITTicketChat;
