import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Fab,
    Drawer,
    Typography,
    TextField,
    IconButton,
    Avatar,
    Paper,
    Chip,
    InputAdornment,
    CircularProgress,
    Tooltip,
} from '@mui/material';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import api from '../../api/axios';
import { formatISTDateTime } from '../../utils/istTime';
import useDraggableFab from '../../hooks/useDraggableFab';
import {
    buildThreadMessages,
    formatStatusLabel,
    statusStyleKey,
    ticketLastActivityAt,
} from './itTicketThreadUtils';
import {
    RED, RED_DARK, RED_BG, RED_LIGHT, TEXT, MUTED, BORDER, SURFACE,
    FONT, fieldSx, primaryBtnSx, iconBoxSx,
} from '../../theme/policiesPageTheme';

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
    return formatISTDateTime(value);
};

const STATUS_COLORS = {
    open: { bg: '#FEF3C7', color: '#B45309' },
    'in-progress': { bg: '#DBEAFE', color: '#1D4ED8' },
    resolved: { bg: '#D1FAE5', color: '#047857' },
    closed: { bg: SURFACE, color: MUTED },
    pending: { bg: '#FEF3C7', color: '#B45309' },
};

const statusChipSx = (status) => {
    const key = statusStyleKey(status);
    const s = STATUS_COLORS[key] || STATUS_COLORS.closed;
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

const ITTicketFloatingChat = ({ defaultOpen = false, onClose }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [tickets, setTickets] = useState([]);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [newMessage, setNewMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const messageListRef = useRef(null);
    const { isDragging, wrapClick, dragHandlers, positionSx } = useDraggableFab();

    useEffect(() => {
        if (isOpen) fetchTickets();
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const interval = setInterval(fetchTickets, 30000);
        return () => clearInterval(interval);
    }, [isOpen]);

    useEffect(() => {
        const el = messageListRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [selectedTicket?._id, selectedTicket?.messages]);

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/it-support/tickets', { params: { limit: 100, page: 1 } });
            const sorted = (data.tickets || []).sort(
                (a, b) => new Date(ticketLastActivityAt(b)) - new Date(ticketLastActivityAt(a))
            );
            setTickets(sorted);
        } catch (error) {
            console.error('Failed to fetch IT tickets:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTicketDetails = async (ticketId) => {
        try {
            const { data } = await api.get(`/it-support/tickets/${ticketId}`);
            const ticket = data.ticket;
            setSelectedTicket({
                ...ticket,
                messages: buildThreadMessages(ticket),
            });
        } catch (error) {
            console.error('Failed to fetch ticket details:', error);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedTicket) return;

        setSending(true);
        try {
            await api.post(`/it-support/tickets/${selectedTicket._id}/comment`, {
                comment: newMessage.trim(),
            });
            await fetchTicketDetails(selectedTicket._id);
            setNewMessage('');
        } catch (error) {
            console.error('Failed to send message:', error);
        } finally {
            setSending(false);
        }
    };

    const handleBack = () => {
        setSelectedTicket(null);
        fetchTickets();
    };

    const filteredTickets = tickets.filter((ticket) => {
        const searchLower = searchTerm.toLowerCase();
        return (
            ticket.title?.toLowerCase().includes(searchLower)
            || ticket.ticketId?.toLowerCase().includes(searchLower)
            || ticket.createdByName?.toLowerCase().includes(searchLower)
            || ticket.createdByCode?.toLowerCase().includes(searchLower)
            || ticket.category?.toLowerCase().includes(searchLower)
        );
    });

    const isClosed = selectedTicket && ['CLOSED', 'CANCELLED'].includes(selectedTicket.status);

    return (
        <>
            <Tooltip title="IT Tickets" placement="left" disableHoverListener={isDragging}>
                <Fab
                    color="primary"
                    aria-label="IT Tickets"
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
                        },
                    }}
                >
                    <SupportAgentIcon />
                </Fab>
            </Tooltip>

            <Drawer
                anchor="right"
                open={isOpen}
                onClose={() => {
                    setIsOpen(false);
                    onClose?.();
                }}
                PaperProps={{
                    sx: {
                        width: { xs: '100%', sm: 440 },
                        maxWidth: '100%',
                        fontFamily: FONT,
                        background: '#fff',
                        borderLeft: `1px solid ${BORDER}`,
                        boxShadow: '-8px 0 32px rgba(16, 24, 40, 0.08)',
                    },
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
                        {selectedTicket && (
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
                        {!selectedTicket && (
                            <Box sx={iconBoxSx}>
                                <SupportAgentIcon sx={{ fontSize: 18 }} />
                            </Box>
                        )}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            {!selectedTicket ? (
                                <>
                                    <Typography sx={{
                                        fontWeight: 700,
                                        fontSize: '0.95rem',
                                        letterSpacing: '-0.02em',
                                        color: TEXT,
                                        fontFamily: FONT,
                                        lineHeight: 1.3,
                                    }}>
                                        IT Query Center
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
                                        {selectedTicket.title}
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.75rem', color: MUTED }}>
                                        {selectedTicket.createdByName || 'Employee'}
                                        {selectedTicket.createdByCode ? ` · ${selectedTicket.createdByCode}` : ''}
                                    </Typography>
                                </>
                            )}
                        </Box>
                        <IconButton
                            onClick={() => {
                                setIsOpen(false);
                                onClose?.();
                            }}
                            size="small"
                            sx={{
                                color: MUTED,
                                '&:hover': { background: SURFACE, color: TEXT },
                            }}
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>

                    {!selectedTicket && (
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
                                        ),
                                    }}
                                    sx={fieldSx}
                                />
                            </Box>

                            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', ...scrollSx }}>
                                {loading ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                                        <CircularProgress size={28} sx={{ color: RED }} />
                                    </Box>
                                ) : filteredTickets.length === 0 ? (
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
                                            <SupportAgentIcon sx={{ fontSize: 26 }} />
                                        </Box>
                                        <Box>
                                            <Typography sx={{ mb: 0.5, fontWeight: 700, color: TEXT, fontSize: '0.95rem' }}>
                                                {searchTerm ? 'No matching tickets' : 'No IT tickets yet'}
                                            </Typography>
                                            <Typography sx={{ color: MUTED, fontSize: '0.8rem' }}>
                                                {searchTerm ? 'Try a different name or subject' : 'Employee tickets will show up here'}
                                            </Typography>
                                        </Box>
                                    </Box>
                                ) : (
                                    filteredTickets.map((ticket) => {
                                        const initial = ticket.createdByName?.charAt(0) || '?';
                                        return (
                                            <Box
                                                key={ticket._id}
                                                onClick={() => fetchTicketDetails(ticket._id)}
                                                sx={{
                                                    display: 'flex',
                                                    gap: 1.5,
                                                    px: 2,
                                                    py: 1.75,
                                                    cursor: 'pointer',
                                                    background: '#fff',
                                                    borderBottom: `1px solid ${BORDER}`,
                                                    borderLeft: '3px solid transparent',
                                                    transition: 'background 0.15s ease',
                                                    '&:hover': {
                                                        background: SURFACE,
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
                                                    {initial}
                                                </Avatar>
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.35 }}>
                                                        <Typography sx={{
                                                            flex: 1,
                                                            minWidth: 0,
                                                            fontWeight: 600,
                                                            color: TEXT,
                                                            fontSize: '0.875rem',
                                                            fontFamily: FONT,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            {ticket.createdByName || 'Employee'}
                                                        </Typography>
                                                        <Typography sx={{
                                                            color: MUTED,
                                                            fontSize: '0.7rem',
                                                            flexShrink: 0,
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            {ticketLastActivityAt(ticket)
                                                                ? relativeTime(ticketLastActivityAt(ticket))
                                                                : ''}
                                                        </Typography>
                                                    </Box>
                                                    <Typography sx={{
                                                        fontWeight: 400,
                                                        color: MUTED,
                                                        mb: 0.85,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        fontSize: '0.8rem',
                                                        lineHeight: 1.4,
                                                    }}>
                                                        {ticket.title}
                                                    </Typography>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                                                        <Chip
                                                            label={formatStatusLabel(ticket.status)}
                                                            size="small"
                                                            sx={statusChipSx(ticket.status)}
                                                        />
                                                        {ticket.category && (
                                                            <Chip
                                                                label={ticket.category}
                                                                size="small"
                                                                sx={categoryChipSx}
                                                            />
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

                    {selectedTicket && (
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
                                        label={formatStatusLabel(selectedTicket.status)}
                                        size="small"
                                        sx={statusChipSx(selectedTicket.status)}
                                    />
                                    {selectedTicket.category && (
                                        <Chip
                                            label={selectedTicket.category}
                                            size="small"
                                            sx={categoryChipSx}
                                        />
                                    )}
                                    {selectedTicket.priority && selectedTicket.priority !== 'Medium' && (
                                        <Chip
                                            label={selectedTicket.priority}
                                            size="small"
                                            sx={statusChipSx(
                                                selectedTicket.priority === 'Critical' || selectedTicket.priority === 'High'
                                                    ? 'OPEN'
                                                    : 'CLOSED'
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
                                {(selectedTicket.messages || []).map((msg, index) => {
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

                            {!isClosed && (
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
                </Box>
            </Drawer>
        </>
    );
};

export default ITTicketFloatingChat;
