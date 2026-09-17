import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Fab,
    Badge,
    Drawer,
    Typography,
    TextField,
    IconButton,
    Avatar,
    Divider,
    Paper,
    Chip,
    InputAdornment,
    CircularProgress,
    Tooltip,
    Button,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Alert,
} from '@mui/material';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonIcon from '@mui/icons-material/Person';
import SearchIcon from '@mui/icons-material/Search';
import AssignmentIcon from '@mui/icons-material/Assignment';
import InventoryIcon from '@mui/icons-material/Inventory';
import ComputerIcon from '@mui/icons-material/Computer';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import api from '../api/axios';
import { formatISTDate, formatISTDateTime } from '../utils/istTime';
import useDraggableFab from '../hooks/useDraggableFab';
import {
    RED, RED_DARK, RED_BG, RED_LIGHT, TEXT, MUTED, BORDER, SURFACE,
    FONT, SUCCESS_BG, SUCCESS_TEXT, WARN_BG, WARN_TEXT, INFO_BG, INFO_TEXT,
    fieldSx, primaryBtnSx, iconBoxSx,
} from '../theme/policiesPageTheme';

const relativeTime = (value) => {
    const ms = Date.now() - new Date(value).getTime();
    if (Number.isNaN(ms)) return '';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    return formatISTDate(value, { month: 'short', day: 'numeric' });
};

const STATUS_COLORS = {
    open: { bg: WARN_BG, color: WARN_TEXT },
    'in-progress': { bg: INFO_BG, color: INFO_TEXT },
    resolved: { bg: SUCCESS_BG, color: SUCCESS_TEXT },
    closed: { bg: SURFACE, color: MUTED },
    pending: { bg: WARN_BG, color: WARN_TEXT },
    fulfilled: { bg: SUCCESS_BG, color: SUCCESS_TEXT },
    rejected: { bg: RED_BG, color: RED_DARK },
    cancelled: { bg: SURFACE, color: MUTED },
};

const statusKey = (status) => (status || '').toLowerCase().replace(/\s+/g, '-');

const statusChipSx = (status) => {
    const s = STATUS_COLORS[statusKey(status)] || STATUS_COLORS.closed;
    return {
        height: 22,
        fontSize: '0.65rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
        textTransform: 'capitalize',
        backgroundColor: s.bg,
        color: s.color,
        borderRadius: '6px',
        border: 'none',
    };
};

const categoryChipSx = {
    height: 22,
    fontSize: '0.65rem',
    fontWeight: 600,
    background: SURFACE,
    color: MUTED,
    border: `1px solid ${BORDER}`,
    borderRadius: '6px',
};

const scrollSx = {
    '&::-webkit-scrollbar': { width: 6 },
    '&::-webkit-scrollbar-thumb': {
        backgroundColor: '#D1D5DB',
        borderRadius: 8,
    },
};

const HRQueryFloatingChat = ({ defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [queries, setQueries] = useState([]);
    const [selectedQuery, setSelectedQuery] = useState(null);
    const [newMessage, setNewMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [totalUnread, setTotalUnread] = useState(0);
    const messageListRef = useRef(null);
    const { isDragging, wrapClick, dragHandlers, positionSx } = useDraggableFab();

    useEffect(() => {
        if (isOpen) {
            fetchQueries();
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            const interval = setInterval(fetchQueries, 30000);
            return () => clearInterval(interval);
        }
    }, [isOpen]);

    useEffect(() => {
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const el = messageListRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [selectedQuery?._id, selectedQuery?.messages]);

    const fetchUnreadCount = async () => {
        try {
            const response = await api.get('/hr-queries/admin/all');
            const unreadCount = response.data.reduce((sum, query) => sum + (query.unreadCount || 0), 0);
            setTotalUnread(unreadCount);
        } catch (error) {
            console.error('Failed to fetch unread count:', error);
        }
    };

    const fetchQueries = async () => {
        setLoading(true);
        try {
            const response = await api.get('/hr-queries/admin/all');
            const sortedQueries = response.data.sort((a, b) =>
                new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
            );
            setQueries(sortedQueries);

            const unreadCount = sortedQueries.reduce((sum, query) => sum + (query.unreadCount || 0), 0);
            setTotalUnread(unreadCount);
        } catch (error) {
            console.error('Failed to fetch queries:', error);
        } finally {
            setLoading(false);
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

            setTotalUnread(prev => Math.max(0, prev - (queries.find(q => q._id === queryId)?.unreadCount || 0)));
        } catch (error) {
            console.error('Failed to fetch query details:', error);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedQuery) return;

        setSending(true);
        try {
            await api.post(`/hr-queries/admin/${selectedQuery._id}/respond`, {
                message: newMessage.trim()
            });

            await fetchQueryDetails(selectedQuery._id);
            setNewMessage('');
        } catch (error) {
            console.error('Failed to send message:', error);
        } finally {
            setSending(false);
        }
    };

    const handleQueryClick = (query) => {
        setSelectedQuery(null);

        if (query.itemType === 'resource_request') {
            setTimeout(() => {
                setSelectedQuery(query);
                setQueries(prevQueries =>
                    prevQueries.map(q =>
                        q._id === query._id ? { ...q, unreadCount: 0 } : q
                    )
                );
                setTotalUnread(prev => Math.max(0, prev - (query.unreadCount || 0)));
            }, 0);
        } else {
            setTimeout(() => fetchQueryDetails(query._id), 0);
        }
    };

    const handleBack = () => {
        setSelectedQuery(null);
        fetchQueries();
    };

    const getItemIcon = (query) => {
        if (query.itemType === 'resource_request') {
            if (query.category?.toLowerCase().includes('hardware') || query.category?.toLowerCase().includes('it')) {
                return <ComputerIcon sx={{ fontSize: 18 }} />;
            }
            if (query.category?.toLowerCase().includes('stationery')) {
                return <AssignmentIcon sx={{ fontSize: 18 }} />;
            }
            return <InventoryIcon sx={{ fontSize: 18 }} />;
        }
        return null;
    };

    const filteredQueries = queries.filter(query => {
        const searchLower = searchTerm.toLowerCase();
        return (
            query.subject?.toLowerCase().includes(searchLower) ||
            query.employeeId?.fullName?.toLowerCase().includes(searchLower) ||
            query.employeeId?.employeeId?.toLowerCase().includes(searchLower) ||
            query.category?.toLowerCase().includes(searchLower)
        );
    });

    const isResource = selectedQuery?.itemType === 'resource_request';

    return (
        <>
            <Tooltip title="HR Queries" placement="left" disableHoverListener={isDragging}>
                <Fab
                    color="primary"
                    aria-label={totalUnread > 0 ? `HR Queries, ${totalUnread} unread` : 'HR Queries'}
                    onClick={wrapClick(() => setIsOpen(true))}
                    {...dragHandlers}
                    sx={{
                        ...positionSx,
                        display: isOpen ? 'none' : 'inline-flex',
                        background: `linear-gradient(135deg, ${RED} 0%, ${RED_DARK} 100%)`,
                        color: 'white',
                        boxShadow: isDragging
                            ? '0 16px 32px rgba(198, 40, 40, 0.4)'
                            : '0 8px 24px rgba(198, 40, 40, 0.28)',
                        '&:hover': {
                            background: `linear-gradient(135deg, ${RED_DARK} 0%, #B71C1C 100%)`,
                            boxShadow: '0 12px 28px rgba(198, 40, 40, 0.35)',
                        },
                    }}
                >
                    <Badge badgeContent={totalUnread} color="error" max={99}>
                        <QuestionAnswerIcon />
                    </Badge>
                </Fab>
            </Tooltip>

            <Drawer
                anchor="right"
                open={isOpen}
                onClose={() => setIsOpen(false)}
                className="hr-query-drawer"
                PaperProps={{
                    sx: {
                        width: { xs: '100%', sm: 440 },
                        maxWidth: '100%',
                        fontFamily: FONT,
                        background: '#fff',
                        borderLeft: `1px solid ${BORDER}`,
                        boxShadow: '-8px 0 32px rgba(16, 24, 40, 0.08)',
                    }
                }}
            >
                <Box sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    fontFamily: FONT,
                    background: SURFACE,
                }}>
                    {/* Header */}
                    <Box
                        sx={{
                            px: 2.25,
                            py: 1.75,
                            background: '#fff',
                            borderBottom: `1px solid ${BORDER}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.25,
                            flexShrink: 0,
                        }}
                    >
                        {selectedQuery && (
                            <IconButton
                                onClick={handleBack}
                                size="small"
                                sx={{
                                    color: MUTED,
                                    '&:hover': { background: RED_LIGHT, color: RED_DARK },
                                }}
                            >
                                <ArrowBackIcon fontSize="small" />
                            </IconButton>
                        )}
                        {!selectedQuery && (
                            <Box sx={iconBoxSx}>
                                <QuestionAnswerIcon sx={{ fontSize: 18 }} />
                            </Box>
                        )}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            {!selectedQuery ? (
                                <>
                                    <Typography sx={{
                                        fontWeight: 700,
                                        fontSize: '0.95rem',
                                        letterSpacing: '-0.02em',
                                        color: TEXT,
                                        fontFamily: FONT,
                                        lineHeight: 1.3,
                                    }}>
                                        HR Query Center
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.75rem', color: MUTED, mt: 0.15 }}>
                                        Reply to employee tickets from one place
                                    </Typography>
                                </>
                            ) : (
                                <>
                                    <Typography sx={{
                                        fontWeight: 700,
                                        fontSize: '0.9rem',
                                        color: TEXT,
                                        fontFamily: FONT,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {selectedQuery.subject}
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.75rem', color: MUTED }}>
                                        {selectedQuery.employeeId?.fullName || 'Anonymous'}
                                        {selectedQuery.employeeId?.employeeId
                                            ? ` · ${selectedQuery.employeeId.employeeId}`
                                            : ''}
                                    </Typography>
                                </>
                            )}
                        </Box>
                        {!selectedQuery && totalUnread > 0 && (
                            <Chip
                                label={`${totalUnread} unread`}
                                size="small"
                                sx={{
                                    height: 22,
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    background: RED_BG,
                                    color: RED_DARK,
                                    borderRadius: '6px',
                                }}
                            />
                        )}
                        <IconButton
                            onClick={() => setIsOpen(false)}
                            size="small"
                            sx={{
                                color: MUTED,
                                '&:hover': { background: SURFACE, color: TEXT },
                            }}
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>

                    {/* Query List View */}
                    {!selectedQuery && (
                        <>
                            <Box sx={{
                                px: 2,
                                py: 1.5,
                                borderBottom: `1px solid ${BORDER}`,
                                bgcolor: '#fff',
                                flexShrink: 0,
                            }}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="Search by name, subject, or category"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <SearchIcon fontSize="small" sx={{ color: MUTED }} />
                                            </InputAdornment>
                                        )
                                    }}
                                    sx={fieldSx}
                                />
                            </Box>

                            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', ...scrollSx }}>
                                {loading ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                                        <CircularProgress size={28} sx={{ color: RED }} />
                                    </Box>
                                ) : filteredQueries.length === 0 ? (
                                    <Box sx={{
                                        p: 4,
                                        textAlign: 'center',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 1.5,
                                        mt: 6,
                                    }}>
                                        <Box sx={{ ...iconBoxSx, width: 56, height: 56, borderRadius: '14px' }}>
                                            <QuestionAnswerIcon sx={{ fontSize: 26 }} />
                                        </Box>
                                        <Box>
                                            <Typography sx={{ mb: 0.5, fontWeight: 700, color: TEXT, fontSize: '0.95rem' }}>
                                                {searchTerm ? 'No matching queries' : 'No HR queries yet'}
                                            </Typography>
                                            <Typography sx={{ color: MUTED, fontSize: '0.8rem' }}>
                                                {searchTerm ? 'Try a different name or subject' : 'Employee tickets will show up here'}
                                            </Typography>
                                        </Box>
                                    </Box>
                                ) : (
                                    filteredQueries.map((query) => {
                                        const unread = query.unreadCount > 0;
                                        const initial = query.employeeId?.fullName?.charAt(0) || '?';
                                        const itemIcon = getItemIcon(query);
                                        return (
                                            <Box
                                                key={query._id}
                                                onClick={() => handleQueryClick(query)}
                                                sx={{
                                                    display: 'flex',
                                                    gap: 1.5,
                                                    px: 2,
                                                    py: 1.75,
                                                    cursor: 'pointer',
                                                    background: unread ? RED_LIGHT : '#fff',
                                                    borderBottom: `1px solid ${BORDER}`,
                                                    borderLeft: unread ? `3px solid ${RED}` : '3px solid transparent',
                                                    transition: 'background 0.15s ease',
                                                    '&:hover': {
                                                        background: unread ? RED_LIGHT : SURFACE,
                                                    },
                                                }}
                                            >
                                                <Avatar sx={{
                                                    width: 40,
                                                    height: 40,
                                                    bgcolor: RED_BG,
                                                    color: RED_DARK,
                                                    fontWeight: 700,
                                                    fontSize: '0.9rem',
                                                    border: '1px solid rgba(198, 40, 40, 0.12)',
                                                    flexShrink: 0,
                                                }}>
                                                    {itemIcon || initial}
                                                </Avatar>
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.35 }}>
                                                        <Typography sx={{
                                                            flex: 1,
                                                            minWidth: 0,
                                                            fontWeight: unread ? 700 : 600,
                                                            color: TEXT,
                                                            fontSize: '0.875rem',
                                                            fontFamily: FONT,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            {query.employeeId?.fullName || 'Anonymous'}
                                                        </Typography>
                                                        <Typography sx={{
                                                            color: MUTED,
                                                            fontSize: '0.7rem',
                                                            flexShrink: 0,
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            {query.lastMessageAt
                                                                ? relativeTime(query.lastMessageAt)
                                                                : ''}
                                                        </Typography>
                                                    </Box>
                                                    <Typography sx={{
                                                        fontWeight: unread ? 600 : 400,
                                                        color: unread ? TEXT : MUTED,
                                                        mb: 0.85,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        fontSize: '0.8rem',
                                                        lineHeight: 1.4,
                                                    }}>
                                                        {query.subject}
                                                    </Typography>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                                                        <Chip
                                                            label={(query.status || 'open').replace('-', ' ')}
                                                            size="small"
                                                            sx={statusChipSx(query.status)}
                                                        />
                                                        {query.category && (
                                                            <Chip
                                                                label={query.category}
                                                                size="small"
                                                                sx={categoryChipSx}
                                                            />
                                                        )}
                                                        {query.itemType === 'resource_request' && (
                                                            <Chip label="Request" size="small" sx={{
                                                                ...categoryChipSx,
                                                                background: INFO_BG,
                                                                color: INFO_TEXT,
                                                                border: 'none',
                                                            }} />
                                                        )}
                                                        {unread && (
                                                            <Box
                                                                sx={{
                                                                    ml: 'auto',
                                                                    minWidth: 20,
                                                                    height: 20,
                                                                    px: 0.6,
                                                                    borderRadius: '10px',
                                                                    background: RED,
                                                                    color: '#fff',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontSize: '0.65rem',
                                                                    fontWeight: 700,
                                                                }}
                                                            >
                                                                {query.unreadCount > 99 ? '99+' : query.unreadCount}
                                                            </Box>
                                                        )}
                                                    </Box>
                                                </Box>
                                            </Box>
                                        );
                                    })
                                )}
                            </Box>
                        </>
                    )}

                    {/* Chat View */}
                    {selectedQuery && !isResource && (
                        <>
                            <Box sx={{
                                px: 2.25,
                                py: 1.5,
                                borderBottom: `1px solid ${BORDER}`,
                                background: '#fff',
                                flexShrink: 0,
                            }}>
                                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <Chip
                                        label={(selectedQuery.status || 'open').replace('-', ' ')}
                                        size="small"
                                        sx={statusChipSx(selectedQuery.status)}
                                    />
                                    {selectedQuery.category && (
                                        <Chip
                                            label={selectedQuery.category}
                                            size="small"
                                            sx={categoryChipSx}
                                        />
                                    )}
                                    {selectedQuery.priority && selectedQuery.priority !== 'medium' && (
                                        <Chip
                                            label={selectedQuery.priority}
                                            size="small"
                                            sx={statusChipSx(
                                                selectedQuery.priority === 'urgent' || selectedQuery.priority === 'high'
                                                    ? 'open'
                                                    : 'closed'
                                            )}
                                        />
                                    )}
                                </Box>
                            </Box>

                            <Box
                                ref={messageListRef}
                                sx={{
                                    flex: 1,
                                    minHeight: 0,
                                    overflowY: 'auto',
                                    p: 2,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 1.5,
                                    ...scrollSx,
                                }}
                            >
                                {selectedQuery.messages?.map((msg, index) => {
                                    const isEmployee = msg.sender === 'employee';
                                    return (
                                        <Box
                                            key={index}
                                            sx={{
                                                display: 'flex',
                                                justifyContent: isEmployee ? 'flex-start' : 'flex-end',
                                            }}
                                        >
                                            <Paper
                                                elevation={0}
                                                sx={{
                                                    p: 1.5,
                                                    maxWidth: '78%',
                                                    backgroundColor: isEmployee ? '#fff' : RED_LIGHT,
                                                    color: TEXT,
                                                    borderRadius: '12px',
                                                    border: `1px solid ${isEmployee ? BORDER : 'rgba(198, 40, 40, 0.18)'}`,
                                                }}
                                            >
                                                <Typography sx={{
                                                    fontWeight: 700,
                                                    color: isEmployee ? MUTED : RED_DARK,
                                                    fontSize: '0.68rem',
                                                    letterSpacing: '0.04em',
                                                    textTransform: 'uppercase',
                                                    display: 'block',
                                                    mb: 0.5,
                                                }}>
                                                    {msg.senderName}
                                                </Typography>
                                                <Typography sx={{
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                    lineHeight: 1.55,
                                                    fontSize: '0.85rem',
                                                    color: TEXT,
                                                }}>
                                                    {msg.message}
                                                </Typography>
                                                <Typography sx={{
                                                    display: 'block',
                                                    mt: 0.75,
                                                    color: MUTED,
                                                    fontSize: '0.65rem',
                                                    textAlign: 'right',
                                                }}>
                                                    {formatISTDateTime(msg.timestamp)}
                                                </Typography>
                                            </Paper>
                                        </Box>
                                    );
                                })}
                            </Box>

                            {selectedQuery.status !== 'closed' && (
                                <Box sx={{
                                    p: 2,
                                    borderTop: `1px solid ${BORDER}`,
                                    backgroundColor: '#fff',
                                    flexShrink: 0,
                                }}>
                                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                                        <TextField
                                            fullWidth
                                            multiline
                                            maxRows={4}
                                            placeholder="Type your response…"
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendMessage();
                                                }
                                            }}
                                            disabled={sending}
                                            sx={fieldSx}
                                        />
                                        <IconButton
                                            onClick={handleSendMessage}
                                            disabled={!newMessage.trim() || sending}
                                            sx={{
                                                ...primaryBtnSx,
                                                width: 44,
                                                height: 44,
                                                borderRadius: '10px',
                                                flexShrink: 0,
                                                color: '#fff',
                                                '&.Mui-disabled': {
                                                    background: SURFACE,
                                                    color: MUTED,
                                                },
                                            }}
                                        >
                                            {sending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <SendIcon fontSize="small" />}
                                        </IconButton>
                                    </Box>
                                </Box>
                            )}
                        </>
                    )}

                    {isResource && (
                        <ResourceRequestDetailView
                            request={selectedQuery}
                            onStatusUpdate={fetchQueries}
                        />
                    )}
                </Box>
            </Drawer>
        </>
    );
};

const ResourceRequestDetailView = ({ request, onStatusUpdate }) => {
    const [status, setStatus] = useState(request.status);
    const [adminNotes, setAdminNotes] = useState(request.resourceRequestData?.adminNotes || '');
    const [updating, setUpdating] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [error, setError] = useState('');

    const handleUpdateStatus = async () => {
        setUpdating(true);
        setError('');
        setFeedback('');
        try {
            await api.patch(`/hr-queries/admin/resource-request/${request._id}/status`, {
                status,
                adminNotes
            });

            if (onStatusUpdate) {
                await onStatusUpdate();
            }
            setFeedback('Request updated');
        } catch (err) {
            console.error('Failed to update resource request:', err);
            setError(err.response?.data?.error || 'Failed to update resource request');
        } finally {
            setUpdating(false);
        }
    };

    return (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2, ...scrollSx }}>
            <Paper elevation={0} sx={{
                p: 2.25,
                mb: 2,
                borderRadius: '14px',
                border: `1px solid ${BORDER}`,
                background: '#fff',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
                    <Box sx={iconBoxSx}>
                        <Inventory2OutlinedIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Box>
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            Resource request
                        </Typography>
                        <Typography sx={{ fontWeight: 700, color: TEXT, fontSize: '1rem', letterSpacing: '-0.015em' }}>
                            {request.resourceRequestData?.title || request.subject}
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 0.75, mb: 2, flexWrap: 'wrap' }}>
                    <Chip
                        label={(status || 'pending').replace('-', ' ')}
                        size="small"
                        sx={statusChipSx(status)}
                    />
                    {request.category && (
                        <Chip label={request.category} size="small" sx={categoryChipSx} />
                    )}
                </Box>

                <Typography sx={{ fontSize: '0.75rem', color: MUTED, display: 'flex', alignItems: 'center', gap: 0.5, mb: 2 }}>
                    <PersonIcon sx={{ fontSize: '0.95rem' }} />
                    {request.employeeId?.fullName} · {request.employeeId?.employeeId || 'N/A'}
                </Typography>

                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 0.5 }}>
                    Description
                </Typography>
                <Typography sx={{ color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontSize: '0.85rem', mb: 2 }}>
                    {request.resourceRequestData?.description || request.description || 'No description provided.'}
                </Typography>

                <Divider sx={{ my: 2, borderColor: BORDER }} />

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    {[
                        { label: 'Quantity', value: request.quantity || 1 },
                        { label: 'Requested', value: request.createdAt ? formatISTDate(request.createdAt, { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
                    ].map((row) => (
                        <Box key={row.label} sx={{ p: 1.25, borderRadius: '10px', background: SURFACE, border: `1px solid ${BORDER}` }}>
                            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                {row.label}
                            </Typography>
                            <Typography sx={{ fontWeight: 600, color: TEXT, mt: 0.35, fontSize: '0.85rem' }}>
                                {row.value}
                            </Typography>
                        </Box>
                    ))}
                </Box>

                {request.resourceRequestData?.reviewedByName && (
                    <Typography sx={{ mt: 2, fontSize: '0.75rem', color: MUTED }}>
                        Last reviewed by {request.resourceRequestData.reviewedByName}
                        {request.resourceRequestData.reviewedAt
                            ? ` on ${formatISTDate(request.resourceRequestData.reviewedAt, { month: 'short', day: 'numeric', year: 'numeric' })}`
                            : ''}
                    </Typography>
                )}
            </Paper>

            <Paper elevation={0} sx={{
                p: 2.25,
                borderRadius: '14px',
                border: `1px solid ${BORDER}`,
                background: '#fff',
            }}>
                <Typography sx={{ fontWeight: 700, mb: 1.75, color: TEXT, fontSize: '0.9rem' }}>
                    Update request
                </Typography>

                {error && (
                    <Alert severity="error" sx={{ mb: 1.5, borderRadius: '10px' }} onClose={() => setError('')}>
                        {error}
                    </Alert>
                )}
                {feedback && (
                    <Alert severity="success" sx={{ mb: 1.5, borderRadius: '10px' }} onClose={() => setFeedback('')}>
                        {feedback}
                    </Alert>
                )}

                <FormControl fullWidth size="small" sx={{ mb: 1.75, ...fieldSx }}>
                    <InputLabel>Status</InputLabel>
                    <Select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        label="Status"
                    >
                        <MenuItem value="Pending">Pending</MenuItem>
                        <MenuItem value="In Progress">In Progress</MenuItem>
                        <MenuItem value="Fulfilled">Fulfilled</MenuItem>
                        <MenuItem value="Rejected">Rejected</MenuItem>
                    </Select>
                </FormControl>

                <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="Admin notes"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add notes about this request…"
                    sx={{ mb: 2, ...fieldSx }}
                />

                <Button
                    fullWidth
                    variant="contained"
                    onClick={handleUpdateStatus}
                    disabled={updating}
                    sx={primaryBtnSx}
                >
                    {updating ? 'Saving…' : 'Update request'}
                </Button>
            </Paper>
        </Box>
    );
};

export default HRQueryFloatingChat;
