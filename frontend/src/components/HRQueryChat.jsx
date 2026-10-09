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
    Divider,
    Tooltip,
    Badge,
    CircularProgress,
    Alert
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AddIcon from '@mui/icons-material/Add';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import api from '../api/axios';

const HRQueryChat = ({ onClose }) => {
    const [queries, setQueries] = useState([]);
    const [selectedQuery, setSelectedQuery] = useState(null);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [newQueryData, setNewQueryData] = useState({
        subject: '',
        category: 'General',
        message: '',
        anonymousToHR: false
    });
    const messagesEndRef = useRef(null);
    const [error, setError] = useState('');

    const categories = [
        'Policy',
        'Leave',
        'Attendance',
        'Payroll',
        'Benefits',
        'Compliance',
        'General',
        'Other'
    ];

    const statusColors = {
        open: '#ff9800',
        'in-progress': '#2196f3',
        resolved: '#4caf50',
        closed: '#9e9e9e'
    };

    useEffect(() => {
        fetchQueries();
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [selectedQuery?.messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchQueries = async () => {
        setLoading(true);
        try {
            const response = await api.get('/hr-queries/my-queries');
            setQueries(response.data);
        } catch (error) {
            console.error('Failed to fetch queries:', error);
            setError('Failed to load your queries');
        } finally {
            setLoading(false);
        }
    };

    const fetchQueryDetails = async (queryId) => {
        try {
            const response = await api.get(`/hr-queries/${queryId}`);
            setSelectedQuery(response.data);
            
            // Update the query in the list to reflect read status
            setQueries(prevQueries =>
                prevQueries.map(q =>
                    q._id === queryId ? { ...q, unreadCount: 0 } : q
                )
            );
        } catch (error) {
            console.error('Failed to fetch query details:', error);
            setError('Failed to load query details');
        }
    };

    const handleCreateQuery = async () => {
        if (!newQueryData.subject.trim() || !newQueryData.message.trim()) {
            setError('Subject and message are required');
            return;
        }

        setSending(true);
        try {
            await api.post('/hr-queries/create', newQueryData);
            setCreateDialogOpen(false);
            setNewQueryData({
                subject: '',
                category: 'General',
                message: '',
                anonymousToHR: false
            });
            await fetchQueries();
        } catch (error) {
            console.error('Failed to create query:', error);
            setError(error.response?.data?.error || 'Failed to submit query');
        } finally {
            setSending(false);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim()) return;

        setSending(true);
        try {
            await api.post(`/hr-queries/${selectedQuery._id}/message`, {
                message: newMessage
            });
            setNewMessage('');
            await fetchQueryDetails(selectedQuery._id);
        } catch (error) {
            console.error('Failed to send message:', error);
            setError(error.response?.data?.error || 'Failed to send message');
        } finally {
            setSending(false);
        }
    };

    const handleCloseQuery = async (queryId) => {
        try {
            await api.patch(`/hr-queries/${queryId}/status`, { status: 'closed' });
            await fetchQueries();
            if (selectedQuery?._id === queryId) {
                setSelectedQuery(null);
            }
        } catch (error) {
            console.error('Failed to close query:', error);
            setError('Failed to close query');
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
        switch (sender) {
            case 'employee':
                return <PersonIcon sx={{ fontSize: 18 }} />;
            case 'hr':
                return <SupportAgentIcon sx={{ fontSize: 18 }} />;
            case 'admin':
                return <AdminPanelSettingsIcon sx={{ fontSize: 18 }} />;
            default:
                return <PersonIcon sx={{ fontSize: 18 }} />;
        }
    };

    // List View
    if (!selectedQuery) {
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
                            HR support
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
                        <IconButton size="small" onClick={onClose} aria-label="Close HR queries" sx={{ color: '#6b7280' }}>
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
                    ) : queries.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
                            <QuestionAnswerIcon sx={{ fontSize: 40, color: '#d1d5db', mb: 1.5 }} />
                            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
                                No queries yet
                            </Typography>
                            <Typography sx={{ fontSize: '0.8rem', color: '#6b7280', mt: 0.5, mb: 2 }}>
                                Ask HR about leave, payroll, policy, or anything else.
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
                            {queries.map((query) => (
                                <Paper
                                    key={query._id}
                                    elevation={0}
                                    onClick={() => fetchQueryDetails(query._id)}
                                    sx={{
                                        p: 1.5,
                                        border: '1px solid #eceef2',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        backgroundColor: '#fff',
                                        boxShadow: (query.status === 'open' || query.status === 'in-progress') ? 'inset 3px 0 0 #C62828' : 'none',
                                        '&:hover': { borderColor: '#e0e0e0', backgroundColor: '#fafafa' },
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.75 }}>
                                        <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 650, fontSize: '0.84rem', color: '#1a1a1a', lineHeight: 1.35 }}>
                                            {query.subject}
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.7rem', color: '#9ca3af', flexShrink: 0 }}>
                                            {formatTimestamp(query.lastMessageAt)}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <Chip
                                            label={String(query.status || 'open').replace('-', ' ')}
                                            size="small"
                                            sx={{
                                                height: 20,
                                                fontSize: '0.68rem',
                                                backgroundColor: statusColors[query.status] || '#9e9e9e',
                                                color: '#fff',
                                                fontWeight: 650,
                                                textTransform: 'capitalize',
                                            }}
                                        />
                                        <Chip
                                            label={query.category}
                                            size="small"
                                            variant="outlined"
                                            sx={{ height: 20, fontSize: '0.68rem', borderColor: '#e5e7eb', color: '#4b5563' }}
                                        />
                                        {query.unreadCount > 0 && (
                                            <Badge badgeContent={query.unreadCount} color="error" sx={{ ml: 'auto' }} />
                                        )}
                                    </Box>
                                </Paper>
                            ))}
                        </Stack>
                    )}
                </Box>

                {/* Create Query Dialog */}
                <Dialog
                    open={createDialogOpen}
                    onClose={() => setCreateDialogOpen(false)}
                    maxWidth="sm"
                    fullWidth
                >
                    <DialogTitle>
                        Ask HR a Question
                        <IconButton
                            onClick={() => setCreateDialogOpen(false)}
                            sx={{ position: 'absolute', right: 8, top: 8 }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </DialogTitle>
                    <DialogContent>
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <TextField
                                label="Subject"
                                fullWidth
                                value={newQueryData.subject}
                                onChange={(e) => setNewQueryData({ ...newQueryData, subject: e.target.value })}
                                placeholder="Brief description of your question"
                            />
                            <FormControl fullWidth>
                                <InputLabel>Category</InputLabel>
                                <Select
                                    value={newQueryData.category}
                                    onChange={(e) => setNewQueryData({ ...newQueryData, category: e.target.value })}
                                    label="Category"
                                >
                                    {categories.map((cat) => (
                                        <MenuItem key={cat} value={cat}>
                                            {cat}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <TextField
                                label="Your Question"
                                fullWidth
                                multiline
                                rows={4}
                                value={newQueryData.message}
                                onChange={(e) => setNewQueryData({ ...newQueryData, message: e.target.value })}
                                placeholder="Describe your question in detail..."
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setCreateDialogOpen(false)} disabled={sending}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateQuery}
                            variant="contained"
                            disabled={sending || !newQueryData.subject.trim() || !newQueryData.message.trim()}
                        >
                            {sending ? 'Submitting...' : 'Submit Query'}
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
        );
    }

    // Chat View
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
                <IconButton size="small" onClick={() => setSelectedQuery(null)} aria-label="Back to queries">
                    <ArrowBackIcon fontSize="small" />
                </IconButton>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1a1a1a' }}>
                        {selectedQuery.subject}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.4 }}>
                        <Chip
                            label={String(selectedQuery.status || 'open').replace('-', ' ')}
                            size="small"
                            sx={{
                                height: 18,
                                fontSize: '0.65rem',
                                backgroundColor: statusColors[selectedQuery.status] || '#9e9e9e',
                                color: '#fff',
                                fontWeight: 650,
                                textTransform: 'capitalize',
                            }}
                        />
                        <Chip
                            label={selectedQuery.category}
                            size="small"
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.65rem', borderColor: '#e5e7eb' }}
                        />
                    </Box>
                </Box>
                {selectedQuery.status !== 'closed' && (
                    <Tooltip title="Close query">
                        <IconButton size="small" onClick={() => handleCloseQuery(selectedQuery._id)}>
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
                    {selectedQuery.messages.map((msg, index) => {
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

            {selectedQuery.status !== 'closed' && (
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

export default HRQueryChat;
