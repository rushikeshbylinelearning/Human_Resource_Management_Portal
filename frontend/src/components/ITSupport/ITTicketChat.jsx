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

const ITTicketChat = () => {
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
            <Box>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                        {error}
                    </Alert>
                )}

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="body2" fontWeight={600} color="#666">
                        Your IT Queries
                    </Typography>
                    <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => setCreateDialogOpen(true)}
                        sx={{
                            textTransform: 'none',
                            fontSize: '0.75rem',
                            backgroundColor: '#1976d2',
                            color: 'white',
                            '&:hover': {
                                backgroundColor: '#1565c0',
                            },
                        }}
                    >
                        New Query
                    </Button>
                </Box>

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress size={30} />
                    </Box>
                ) : tickets.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <QuestionAnswerIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
                        <Typography variant="body2" color="text.secondary">
                            No queries yet. Start a conversation with IT!
                        </Typography>
                        <Button
                            size="small"
                            startIcon={<AddIcon />}
                            onClick={() => setCreateDialogOpen(true)}
                            sx={{ mt: 2, textTransform: 'none' }}
                        >
                            Ask a Question
                        </Button>
                    </Box>
                ) : (
                    <Stack spacing={1}>
                        {tickets.map((ticket) => {
                            const styleKey = statusStyleKey(ticket.status);
                            return (
                                <Paper
                                    key={ticket._id}
                                    elevation={0}
                                    onClick={() => fetchTicketDetails(ticket._id)}
                                    sx={{
                                        p: 1.5,
                                        border: '1px solid #e8e8e8',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        backgroundColor: (ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED') ? '#FEF3F3' : '#fff',
                                        borderLeft: (ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED') ? '3px solid #C62828' : '3px solid transparent',
                                        '&:hover': {
                                            backgroundColor: (ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED') ? '#FDDEDE' : '#f5f5f5',
                                            borderColor: '#1976d2',
                                        },
                                    }}
                                >
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                                        <Typography variant="body2" fontWeight={600} sx={{ flex: 1, fontSize: '0.8rem' }}>
                                            {ticket.title}
                                        </Typography>
                                        {ticket.unreadCount > 0 && (
                                            <Badge badgeContent={ticket.unreadCount} color="error" sx={{ ml: 1 }} />
                                        )}
                                    </Box>
                                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <Chip
                                            label={formatStatusLabel(ticket.status)}
                                            size="small"
                                            sx={{
                                                height: '18px',
                                                fontSize: '0.65rem',
                                                backgroundColor: statusColors[styleKey],
                                                color: 'white',
                                                fontWeight: 600,
                                            }}
                                        />
                                        <Chip
                                            label={ticket.category}
                                            size="small"
                                            variant="outlined"
                                            sx={{
                                                height: '18px',
                                                fontSize: '0.65rem',
                                            }}
                                        />
                                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', fontSize: '0.65rem' }}>
                                            {formatTimestamp(ticketLastActivityAt(ticket))}
                                        </Typography>
                                    </Box>
                                </Paper>
                            );
                        })}
                    </Stack>
                )}

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
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {error && (
                <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, pb: 1, borderBottom: '1px solid #e8e8e8' }}>
                <IconButton size="small" onClick={() => setSelectedTicket(null)}>
                    <ArrowBackIcon fontSize="small" />
                </IconButton>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem' }}>
                        {selectedTicket.title}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                        <Chip
                            label={formatStatusLabel(selectedTicket.status)}
                            size="small"
                            sx={{
                                height: '16px',
                                fontSize: '0.6rem',
                                backgroundColor: statusColors[selectedStyleKey],
                                color: 'white',
                                fontWeight: 600,
                            }}
                        />
                        <Chip
                            label={selectedTicket.category}
                            size="small"
                            variant="outlined"
                            sx={{
                                height: '16px',
                                fontSize: '0.6rem',
                            }}
                        />
                    </Box>
                </Box>
                {canCancelTicket(selectedTicket) && (
                    <Tooltip title="Close Query">
                        <IconButton
                            size="small"
                            onClick={() => handleCloseTicket(selectedTicket._id)}
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            <Box
                sx={{
                    flex: 1,
                    overflowY: 'auto',
                    mb: 2,
                    maxHeight: '300px',
                    '&::-webkit-scrollbar': {
                        width: '6px',
                    },
                    '&::-webkit-scrollbar-thumb': {
                        backgroundColor: '#ccc',
                        borderRadius: '3px',
                    },
                }}
            >
                <Stack spacing={1.5}>
                    {(selectedTicket.messages || []).map((msg, index) => {
                        const isEmployee = msg.sender === 'employee';
                        return (
                            <Box
                                key={index}
                                sx={{
                                    display: 'flex',
                                    justifyContent: isEmployee ? 'flex-end' : 'flex-start',
                                }}
                            >
                                <Paper
                                    elevation={0}
                                    sx={{
                                        p: 1.5,
                                        maxWidth: '75%',
                                        backgroundColor: isEmployee ? '#e3f2fd' : '#f5f5f5',
                                        borderRadius: '12px',
                                        border: `1px solid ${isEmployee ? '#90caf9' : '#e0e0e0'}`,
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                        {getSenderIcon(msg.sender)}
                                        <Typography variant="caption" fontWeight={600} sx={{ fontSize: '0.7rem' }}>
                                            {msg.senderName}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', fontSize: '0.65rem' }}>
                                            {formatTimestamp(msg.timestamp)}
                                        </Typography>
                                    </Box>
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
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
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                        fullWidth
                        size="small"
                        multiline
                        maxRows={3}
                        placeholder="Type your message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                            },
                        }}
                    />
                    <IconButton
                        color="primary"
                        onClick={handleSendMessage}
                        disabled={sending || !newMessage.trim()}
                        sx={{
                            backgroundColor: '#1976d2',
                            color: 'white',
                            '&:hover': {
                                backgroundColor: '#1565c0',
                            },
                            '&:disabled': {
                                backgroundColor: '#e0e0e0',
                                color: '#999',
                            },
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
