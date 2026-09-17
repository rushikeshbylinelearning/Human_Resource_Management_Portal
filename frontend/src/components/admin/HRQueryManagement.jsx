import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    Paper,
    Stack,
    Chip,
    TextField,
    Button,
    Tabs,
    Tab,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    CircularProgress,
    Alert,
    Divider,
    Avatar,
    Badge
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import api from '../../api/axios';
import {
    RED, RED_DARK, RED_BG, RED_LIGHT, TEXT, MUTED, BORDER, SURFACE,
    FONT, SUCCESS_BG, SUCCESS_TEXT, WARN_BG, WARN_TEXT, INFO_BG, INFO_TEXT,
    cardSx, primaryBtnSx, fieldSx, pageTitleSx, iconBoxSx,
} from '../../theme/policiesPageTheme';

const HRQueryManagement = () => {
    const [queries, setQueries] = useState([]);
    const [selectedQuery, setSelectedQuery] = useState(null);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [activeTab, setActiveTab] = useState(0);
    const [stats, setStats] = useState({
        totalQueries: 0,
        openQueries: 0,
        inProgressQueries: 0,
        resolvedQueries: 0,
        unreadMessages: 0
    });
    const [error, setError] = useState('');
    const messagesContainerRef = useRef(null);

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
        open: { bg: WARN_BG, color: WARN_TEXT },
        'in-progress': { bg: INFO_BG, color: INFO_TEXT },
        resolved: { bg: SUCCESS_BG, color: SUCCESS_TEXT },
        closed: { bg: SURFACE, color: MUTED },
        pending: { bg: WARN_BG, color: WARN_TEXT },
        fulfilled: { bg: SUCCESS_BG, color: SUCCESS_TEXT },
        rejected: { bg: RED_BG, color: RED_DARK },
        cancelled: { bg: SURFACE, color: MUTED },
    };

    useEffect(() => {
        fetchQueries();
        fetchStats();
    }, [filterStatus, filterCategory]);

    useEffect(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [selectedQuery?._id, selectedQuery?.messages]);

    const fetchQueries = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterStatus) params.append('status', filterStatus);
            if (filterCategory) params.append('category', filterCategory);

            const response = await api.get(`/hr-queries/admin/all?${params.toString()}`);
            setQueries(response.data);
        } catch (error) {
            console.error('Failed to fetch queries:', error);
            setError('Failed to load queries');
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const response = await api.get('/hr-queries/admin/stats/overview');
            setStats(response.data);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    const fetchQueryDetails = async (queryId) => {
        try {
            const response = await api.get(`/hr-queries/${queryId}`);
            setSelectedQuery(response.data);

            setQueries(prevQueries =>
                prevQueries.map(q =>
                    q._id === queryId ? { ...q, unreadCount: 0 } : q
                )
            );
        } catch (error) {
            console.error('Failed to fetch query details:', error);
            setError(error.response?.data?.error || 'Failed to load query details');
        }
    };

    const handleSelectItem = (query) => {
        setError('');
        if (query.itemType === 'resource_request') {
            setSelectedQuery(query);
            setQueries((prev) =>
                prev.map((q) => (q._id === query._id ? { ...q, unreadCount: 0 } : q))
            );
            return;
        }
        fetchQueryDetails(query._id);
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim()) return;

        setSending(true);
        try {
            await api.post(`/hr-queries/admin/${selectedQuery._id}/respond`, {
                message: newMessage
            });
            setNewMessage('');
            await fetchQueryDetails(selectedQuery._id);
            await fetchStats();
        } catch (error) {
            console.error('Failed to send message:', error);
            setError('Failed to send message');
        } finally {
            setSending(false);
        }
    };

    const handleStatusChange = async (queryId, newStatus) => {
        try {
            await api.patch(`/hr-queries/admin/${queryId}`, { status: newStatus });
            await fetchQueries();
            await fetchStats();
            if (selectedQuery?._id === queryId) {
                await fetchQueryDetails(queryId);
            }
        } catch (error) {
            console.error('Failed to update status:', error);
            setError('Failed to update status');
        }
    };

    const handlePriorityChange = async (queryId, newPriority) => {
        try {
            await api.patch(`/hr-queries/admin/${queryId}`, { priority: newPriority });
            await fetchQueries();
            if (selectedQuery?._id === queryId) {
                await fetchQueryDetails(queryId);
            }
        } catch (error) {
            console.error('Failed to update priority:', error);
            setError('Failed to update priority');
        }
    };

    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
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

    const getFilteredQueries = () => {
        let filtered = queries;

        if (activeTab === 1) {
            filtered = queries.filter(q => q.status === 'open' || q.status === 'pending');
        } else if (activeTab === 2) {
            filtered = queries.filter(q => q.status === 'in-progress');
        } else if (activeTab === 3) {
            filtered = queries.filter(q => q.status === 'resolved' || q.status === 'closed');
        }

        return filtered;
    };

    return (
        <Box sx={{
            fontFamily: FONT,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            height: { xs: 'auto', md: 'calc(100dvh - 18.5rem)' },
            maxHeight: { md: 'calc(100dvh - 18.5rem)' },
            overflow: { md: 'hidden' },
            boxSizing: 'border-box',
        }}>
            <Box sx={{
                display: 'flex',
                alignItems: { xs: 'flex-start', sm: 'flex-end' },
                justifyContent: 'space-between',
                gap: 2,
                flexWrap: 'wrap',
                flexShrink: 0,
            }}>
                <Box>
                    <Typography sx={{ ...pageTitleSx, mb: 0.4 }}>
                        HR Query Management
                    </Typography>
                    <Typography sx={{ fontSize: '0.8125rem', color: MUTED }}>
                        Review employee tickets, update status, and reply from one workspace.
                    </Typography>
                </Box>
            </Box>

            {error && (
                <Alert severity="error" sx={{ borderRadius: '12px', flexShrink: 0 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            {/* Stats Cards — equal columns, full width */}
            <Box sx={{
                display: 'grid',
                width: '100%',
                flexShrink: 0,
                gridTemplateColumns: {
                    xs: 'repeat(2, minmax(0, 1fr))',
                    sm: 'repeat(3, minmax(0, 1fr))',
                    md: 'repeat(5, minmax(0, 1fr))',
                },
                gap: 1.5,
            }}>
                {[
                    { label: 'Total Queries', value: stats.totalQueries, icon: <QuestionAnswerIcon sx={{ fontSize: 20 }} />, color: RED_DARK, bg: RED_BG },
                    { label: 'Open', value: stats.openQueries, icon: <PendingActionsIcon sx={{ fontSize: 20 }} />, color: WARN_TEXT, bg: WARN_BG },
                    { label: 'In Progress', value: stats.inProgressQueries, icon: <PendingActionsIcon sx={{ fontSize: 20 }} />, color: INFO_TEXT, bg: INFO_BG },
                    { label: 'Resolved', value: stats.resolvedQueries, icon: <CheckCircleIcon sx={{ fontSize: 20 }} />, color: SUCCESS_TEXT, bg: SUCCESS_BG },
                    { label: 'Unread', value: stats.unreadMessages, icon: <QuestionAnswerIcon sx={{ fontSize: 20 }} />, color: RED_DARK, bg: RED_BG },
                ].map((stat) => (
                    <Box
                        key={stat.label}
                        sx={{
                            ...cardSx,
                            width: '100%',
                            minWidth: 0,
                            p: { xs: 1.75, md: 2.25 },
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1.5,
                            minHeight: { md: 88 },
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                            <Box sx={{ ...iconBoxSx, width: 42, height: 42, background: stat.bg, color: stat.color, border: 'none' }}>
                                {stat.icon}
                            </Box>
                            <Typography sx={{
                                fontSize: '0.7rem',
                                color: MUTED,
                                fontWeight: 600,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                lineHeight: 1.3,
                            }}>
                                {stat.label}
                            </Typography>
                        </Box>
                        <Typography sx={{ fontSize: { xs: '1.35rem', md: '1.6rem' }, fontWeight: 700, color: TEXT, lineHeight: 1, letterSpacing: '-0.03em' }}>
                            {stat.value}
                        </Typography>
                    </Box>
                ))}
            </Box>

            {/* List + detail — fixed-height panes; lists and chats scroll inside */}
            <Box sx={{
                display: 'grid',
                width: '100%',
                gridTemplateColumns: {
                    xs: '1fr',
                    md: 'minmax(300px, 34%) minmax(0, 1fr)',
                },
                gridTemplateRows: { xs: 'minmax(280px, 42vh) minmax(360px, 55vh)', md: 'minmax(0, 1fr)' },
                gap: 2,
                flex: 1,
                minHeight: { xs: 640, md: 0 },
                overflow: 'hidden',
                alignItems: 'stretch',
            }}>
                    <Paper sx={{
                        ...cardSx,
                        p: 2,
                        height: '100%',
                        minHeight: 0,
                        maxHeight: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}>
                        <Typography sx={{ fontWeight: 700, color: TEXT, mb: 1.5, fontSize: '0.95rem', letterSpacing: '-0.015em', flexShrink: 0 }}>
                            Queries
                        </Typography>

                        {/* Tabs */}
                        <Tabs
                            value={activeTab}
                            onChange={(e, val) => setActiveTab(val)}
                            variant="scrollable"
                            scrollButtons="auto"
                            sx={{
                                mb: 2,
                                flexShrink: 0,
                                minHeight: 36,
                                '& .MuiTab-root': {
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.78rem',
                                    minHeight: 36,
                                    color: MUTED,
                                    fontFamily: FONT,
                                },
                                '& .Mui-selected': { color: `${RED_DARK} !important` },
                                '& .MuiTabs-indicator': { backgroundColor: RED, height: 2.5, borderRadius: 2 },
                            }}
                        >
                            <Tab label="All" />
                            <Tab label="Open" />
                            <Tab label="In Progress" />
                            <Tab label="Resolved" />
                        </Tabs>

                        {/* Filters */}
                        <Stack spacing={1} mb={2} sx={{ flexShrink: 0 }}>
                            <FormControl size="small" fullWidth sx={fieldSx}>
                                <InputLabel>Category</InputLabel>
                                <Select
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value)}
                                    label="Category"
                                >
                                    <MenuItem value="">All Categories</MenuItem>
                                    {categories.map(cat => (
                                        <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Stack>

                        {/* Query List */}
                        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.5 }}>
                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                <CircularProgress sx={{ color: RED }} />
                            </Box>
                        ) : getFilteredQueries().length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 4 }}>
                                <Typography variant="body2" sx={{ color: MUTED }}>
                                    No queries found
                                </Typography>
                            </Box>
                        ) : (
                            <Stack spacing={1}>
                                {getFilteredQueries().map((query) => (
                                    <Paper
                                        key={query._id}
                                        elevation={0}
                                        onClick={() => handleSelectItem(query)}
                                        sx={{
                                            p: 1.75,
                                            borderRadius: '12px',
                                            border: selectedQuery?._id === query._id
                                                ? `1.5px solid ${RED}`
                                                : `1px solid ${BORDER}`,
                                            background: selectedQuery?._id === query._id ? RED_LIGHT : '#fff',
                                            cursor: 'pointer',
                                            transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
                                            boxShadow: selectedQuery?._id === query._id
                                                ? '0 4px 14px rgba(198, 40, 40, 0.08)'
                                                : 'none',
                                            '&:hover': {
                                                backgroundColor: selectedQuery?._id === query._id ? RED_LIGHT : SURFACE,
                                                borderColor: selectedQuery?._id === query._id ? RED : '#D1D5DB',
                                            }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                                            <Typography variant="subtitle2" fontWeight={600} sx={{ color: TEXT, fontFamily: FONT }}>
                                                {query.subject}
                                            </Typography>
                                            {query.unreadCount > 0 && (
                                                <Badge badgeContent={query.unreadCount} color="error" />
                                            )}
                                        </Box>
                                        <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                                            {query.employeeId?.fullName || 'Unknown'} · {query.employeeId?.employeeId || 'N/A'}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                                            <Chip
                                                label={query.status}
                                                size="small"
                                                sx={{
                                                    height: '20px',
                                                    fontSize: '0.68rem',
                                                    fontWeight: 700,
                                                    textTransform: 'capitalize',
                                                    backgroundColor: (statusColors[query.status] || statusColors.closed).bg,
                                                    color: (statusColors[query.status] || statusColors.closed).color,
                                                }}
                                            />
                                            <Chip
                                                label={query.itemType === 'resource_request' ? 'Request' : 'Query'}
                                                size="small"
                                                sx={{
                                                    height: '20px',
                                                    fontSize: '0.68rem',
                                                    fontWeight: 600,
                                                    background: query.itemType === 'resource_request' ? INFO_BG : SURFACE,
                                                    color: query.itemType === 'resource_request' ? INFO_TEXT : MUTED,
                                                }}
                                            />
                                            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                                                {formatTimestamp(query.lastMessageAt)}
                                            </Typography>
                                        </Box>
                                    </Paper>
                                ))}
                            </Stack>
                        )}
                        </Box>
                    </Paper>

                {/* Query Details */}
                <Box sx={{ minWidth: 0, height: '100%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {!selectedQuery ? (
                        <Paper sx={{
                            ...cardSx,
                            p: 4,
                            width: '100%',
                            height: '100%',
                            minHeight: 0,
                            textAlign: 'center',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                        }}>
                            <Box>
                                <Box sx={{ ...iconBoxSx, width: 64, height: 64, borderRadius: '16px', mx: 'auto', mb: 1.5 }}>
                                    <QuestionAnswerIcon sx={{ fontSize: 32 }} />
                                </Box>
                                <Typography sx={{ fontWeight: 700, color: TEXT, mb: 0.5 }}>Select a query</Typography>
                                <Typography variant="body2" sx={{ color: MUTED }}>
                                    Choose a ticket from the list to view the conversation.
                                </Typography>
                            </Box>
                        </Paper>
                    ) : selectedQuery.itemType === 'resource_request' ? (
                        <ResourceRequestPanel
                            request={selectedQuery}
                            onUpdated={async () => {
                                await fetchQueries();
                                await fetchStats();
                            }}
                        />
                    ) : (
                        <Paper sx={{
                            ...cardSx,
                            p: 3,
                            width: '100%',
                            height: '100%',
                            minHeight: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                        }}>
                            {/* Header */}
                            <Box sx={{ mb: 2, flexShrink: 0 }}>
                                <Typography variant="h6" fontWeight={700} mb={1} sx={{ color: TEXT, letterSpacing: '-0.015em' }}>
                                    {selectedQuery.subject}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <Avatar sx={{ width: 32, height: 32, fontSize: '0.9rem', bgcolor: RED_BG, color: RED_DARK, fontWeight: 700 }}>
                                        {selectedQuery.employeeId?.fullName?.charAt(0) || '?'}
                                    </Avatar>
                                    <Box>
                                        <Typography variant="body2" fontWeight={600}>
                                            {selectedQuery.employeeId?.fullName || 'Unknown'}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {selectedQuery.employeeId?.employeeId || 'N/A'} · {selectedQuery.employeeId?.department || 'N/A'}
                                        </Typography>
                                    </Box>
                                </Box>
                                <Stack direction="row" spacing={1} mb={2}>
                                    <FormControl size="small" sx={{ minWidth: 150, ...fieldSx }}>
                                        <InputLabel>Status</InputLabel>
                                        <Select
                                            value={selectedQuery.status}
                                            onChange={(e) => handleStatusChange(selectedQuery._id, e.target.value)}
                                            label="Status"
                                        >
                                            <MenuItem value="open">Open</MenuItem>
                                            <MenuItem value="in-progress">In Progress</MenuItem>
                                            <MenuItem value="resolved">Resolved</MenuItem>
                                            <MenuItem value="closed">Closed</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <FormControl size="small" sx={{ minWidth: 120, ...fieldSx }}>
                                        <InputLabel>Priority</InputLabel>
                                        <Select
                                            value={selectedQuery.priority}
                                            onChange={(e) => handlePriorityChange(selectedQuery._id, e.target.value)}
                                            label="Priority"
                                        >
                                            <MenuItem value="low">Low</MenuItem>
                                            <MenuItem value="medium">Medium</MenuItem>
                                            <MenuItem value="high">High</MenuItem>
                                            <MenuItem value="urgent">Urgent</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <Chip label={selectedQuery.category} variant="outlined" />
                                </Stack>
                                <Divider />
                            </Box>

                            {/* Messages */}
                            <Box
                                ref={messagesContainerRef}
                                sx={{ flex: 1, minHeight: 0, overflowY: 'auto', mb: 2, pr: 0.5 }}
                            >
                                <Stack spacing={2}>
                                    {selectedQuery.messages?.map((msg, index) => {
                                        const isEmployee = msg.sender === 'employee';
                                        return (
                                            <Box
                                                key={index}
                                                sx={{
                                                    display: 'flex',
                                                    justifyContent: isEmployee ? 'flex-start' : 'flex-end'
                                                }}
                                            >
                                                <Paper
                                                    elevation={0}
                                                    sx={{
                                                        p: 2,
                                                        maxWidth: '70%',
                                                        backgroundColor: isEmployee ? SURFACE : RED_LIGHT,
                                                        border: `1px solid ${isEmployee ? BORDER : 'rgba(198, 40, 40, 0.18)'}`,
                                                        borderRadius: '12px',
                                                    }}
                                                >
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                                        {getSenderIcon(msg.sender)}
                                                        <Typography variant="body2" fontWeight={600}>
                                                            {msg.senderName}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                                                            {formatTimestamp(msg.timestamp)}
                                                        </Typography>
                                                    </Box>
                                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                                        {msg.message}
                                                    </Typography>
                                                </Paper>
                                            </Box>
                                        );
                                    })}
                                </Stack>
                            </Box>

                            {/* Input */}
                            {selectedQuery.status !== 'closed' && (
                                <Box sx={{ flexShrink: 0 }}>
                                    <Divider sx={{ mb: 2 }} />
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <TextField
                                            fullWidth
                                            multiline
                                            maxRows={4}
                                            placeholder="Type your response..."
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendMessage();
                                                }
                                            }}
                                            sx={{ ...fieldSx }}
                                        />
                                        <Button
                                            variant="contained"
                                            endIcon={<SendIcon />}
                                            onClick={handleSendMessage}
                                            disabled={sending || !newMessage.trim()}
                                            sx={primaryBtnSx}
                                        >
                                            Send
                                        </Button>
                                    </Box>
                                </Box>
                            )}
                        </Paper>
                    )}
                </Box>
            </Box>
        </Box>
    );
};

const RESOURCE_STATUSES = ['Pending', 'In Progress', 'Fulfilled', 'Rejected'];

const ResourceRequestPanel = ({ request, onUpdated }) => {
    const canonicalStatus = (request.status || 'Pending')
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    const [status, setStatus] = useState(
        RESOURCE_STATUSES.includes(canonicalStatus) ? canonicalStatus : 'Pending'
    );
    const [adminNotes, setAdminNotes] = useState(request.resourceRequestData?.adminNotes || '');
    const [updating, setUpdating] = useState(false);
    const [error, setError] = useState('');

    const handleUpdate = async () => {
        setUpdating(true);
        setError('');
        try {
            await api.patch(`/hr-queries/admin/resource-request/${request._id}/status`, {
                status,
                adminNotes,
            });
            await onUpdated?.();
        } catch (e) {
            setError(e.response?.data?.error || 'Failed to update resource request.');
        } finally {
            setUpdating(false);
        }
    };

    return (
        <Paper sx={{
            ...cardSx,
            p: 3,
            width: '100%',
            height: '100%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
            boxSizing: 'border-box',
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
                <Box sx={iconBoxSx}>
                    <Inventory2OutlinedIcon sx={{ fontSize: 20 }} />
                </Box>
                <Box>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Resource Request
                    </Typography>
                    <Typography sx={{ fontWeight: 700, color: TEXT, fontSize: '1.05rem', letterSpacing: '-0.015em' }}>
                        {request.resourceRequestData?.title || request.subject}
                    </Typography>
                </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <Avatar sx={{ width: 32, height: 32, fontSize: '0.9rem', bgcolor: RED_BG, color: RED_DARK, fontWeight: 700 }}>
                    {request.employeeId?.fullName?.charAt(0) || '?'}
                </Avatar>
                <Box>
                    <Typography variant="body2" fontWeight={600}>
                        {request.employeeId?.fullName || 'Unknown'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {request.employeeId?.employeeId || request.employeeId?.employeeCode || 'N/A'}
                        {' · '}
                        {request.employeeId?.department || 'N/A'}
                    </Typography>
                </Box>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: '12px' }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1.5,
                mb: 2.5,
            }}>
                {[
                    { label: 'Category', value: request.category || '—' },
                    { label: 'Quantity', value: request.quantity ?? request.resourceRequestData?.quantity ?? 1 },
                    { label: 'Priority', value: request.priority || 'medium' },
                    { label: 'Requested', value: request.createdAt ? new Date(request.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
                ].map((row) => (
                    <Box key={row.label} sx={{ p: 1.5, borderRadius: '12px', background: SURFACE, border: `1px solid ${BORDER}` }}>
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            {row.label}
                        </Typography>
                        <Typography sx={{ fontWeight: 600, color: TEXT, mt: 0.35, textTransform: 'capitalize' }}>
                            {row.value}
                        </Typography>
                    </Box>
                ))}
            </Box>

            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 0.75 }}>
                Description
            </Typography>
            <Typography variant="body2" sx={{ color: TEXT, whiteSpace: 'pre-wrap', mb: 2.5, lineHeight: 1.6 }}>
                {request.resourceRequestData?.description || request.description || 'No description provided.'}
            </Typography>

            {request.resourceRequestData?.reviewedByName && (
                <Typography variant="caption" sx={{ color: MUTED, display: 'block', mb: 2 }}>
                    Last reviewed by {request.resourceRequestData.reviewedByName}
                    {request.resourceRequestData.reviewedAt
                        ? ` on ${new Date(request.resourceRequestData.reviewedAt).toLocaleDateString('en-IN')}`
                        : ''}
                </Typography>
            )}

            <Divider sx={{ mb: 2.5 }} />
            <Typography sx={{ fontWeight: 700, color: TEXT, mb: 1.5 }}>Update request</Typography>
            <Stack spacing={2} sx={{ maxWidth: 480 }}>
                <FormControl size="small" sx={fieldSx}>
                    <InputLabel>Status</InputLabel>
                    <Select value={status} label="Status" onChange={(e) => setStatus(e.target.value)}>
                        {RESOURCE_STATUSES.map((s) => (
                            <MenuItem key={s} value={s}>{s}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <TextField
                    size="small"
                    multiline
                    rows={3}
                    label="Admin notes"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add notes about this request…"
                    sx={fieldSx}
                />
                <Box>
                    <Button
                        variant="contained"
                        onClick={handleUpdate}
                        disabled={updating}
                        sx={primaryBtnSx}
                    >
                        {updating ? 'Saving…' : 'Update Request'}
                    </Button>
                </Box>
            </Stack>
        </Paper>
    );
};

export default HRQueryManagement;
