// frontend/src/pages/ITSupportPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Container,
    Typography,
    Button,
    Box,
    Tabs,
    Tab,
    TextField,
    InputAdornment,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    Alert,
    CircularProgress,
    Snackbar,
    IconButton,
    Tooltip
} from '@mui/material';
import {
    Add as AddIcon,
    Search as SearchIcon,
    Refresh as RefreshIcon,
    ConfirmationNumber as TicketIcon
} from '@mui/icons-material';
import PageHeroHeader from '../components/PageHeroHeader';
import ITTicketForm from '../components/ITSupport/ITTicketForm';
import ITTicketCard from '../components/ITSupport/ITTicketCard';
import ITTicketDetailsModal from '../components/ITSupport/ITTicketDetailsModal';
import api from '../api/axios';
import '../styles/ITSupportPages.css';

const ITSupportPage = () => {
    const [activeTab, setActiveTab] = useState(0);
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    
    // Modals
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [detailsModal, setDetailsModal] = useState({ open: false, ticket: null });
    
    // Snackbar
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    const statuses = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED', 'CANCELLED'];
    const priorities = ['Low', 'Medium', 'High', 'Critical'];

    useEffect(() => {
        fetchMyTickets();
    }, [statusFilter, priorityFilter, search]);

    const fetchMyTickets = async () => {
        setLoading(true);
        setError('');

        try {
            const params = new URLSearchParams();
            if (statusFilter) params.append('status', statusFilter);
            if (priorityFilter) params.append('priority', priorityFilter);
            if (search) params.append('search', search);

            const response = await api.get(`/it-support/tickets/mine?${params}`);
            setTickets(response.data.tickets || []);
        } catch (err) {
            console.error('Error fetching tickets:', err);
            setError(err.response?.data?.error || 'Failed to fetch tickets.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSuccess = (newTicket) => {
        setTickets(prev => [newTicket, ...prev]);
        setSnackbar({
            open: true,
            message: `Ticket ${newTicket.ticketId} created successfully!`,
            severity: 'success'
        });
    };

    const handleTicketClick = (ticket) => {
        setDetailsModal({ open: true, ticket });
    };

    const handleTicketUpdate = (updatedTicket) => {
        setTickets(prev =>
            prev.map(t => t._id === updatedTicket._id ? updatedTicket : t)
        );
        setDetailsModal({ open: true, ticket: updatedTicket });
    };

    const filterTicketsByTab = (tickets) => {
        if (activeTab === 0) {
            // All tickets
            return tickets;
        } else if (activeTab === 1) {
            // Active tickets (not resolved, closed, or cancelled)
            return tickets.filter(t =>
                !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status)
            );
        } else if (activeTab === 2) {
            // Resolved tickets
            return tickets.filter(t => ['RESOLVED', 'CLOSED'].includes(t.status));
        }
        return tickets;
    };

    const filteredTickets = filterTicketsByTab(tickets);

    return (
        <Box className="it-support-page">
            <Container maxWidth="xl">
                <PageHeroHeader
                    title="IT Support"
                    description="Raise tickets for IT issues and track their progress"
                    icon={<TicketIcon />}
                    actionArea={
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <Tooltip title="Refresh tickets">
                                <IconButton
                                    onClick={fetchMyTickets}
                                    disabled={loading}
                                    className="it-refresh-btn"
                                >
                                    <RefreshIcon />
                                </IconButton>
                            </Tooltip>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => setCreateModalOpen(true)}
                                size="large"
                                sx={{ 
                                    borderRadius: '10px',
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    px: 3
                                }}
                            >
                                Raise IT Ticket
                            </Button>
                        </Box>
                    }
                />

                {/* Tabs */}
                <Box className="it-tabs-container">
                    <Tabs 
                        value={activeTab} 
                        onChange={(e, v) => setActiveTab(v)}
                        className="it-tabs"
                    >
                        <Tab label="All Tickets" className="it-tab" />
                        <Tab label="Active" className="it-tab" />
                        <Tab label="Resolved" className="it-tab" />
                    </Tabs>
                </Box>

                {/* Filters */}
                <Box className="it-filters-toolbar">
                    <TextField
                        placeholder="Search tickets by ID, subject, or category..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        size="small"
                        className="it-search-field"
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon />
                                </InputAdornment>
                            ),
                        }}
                    />

                    <FormControl size="small" className="it-filter-select">
                        <InputLabel>Status</InputLabel>
                        <Select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            label="Status"
                        >
                            <MenuItem value="">All</MenuItem>
                            {statuses.map(status => (
                                <MenuItem key={status} value={status}>
                                    {status.replace(/_/g, ' ')}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl size="small" className="it-filter-select">
                        <InputLabel>Priority</InputLabel>
                        <Select
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value)}
                            label="Priority"
                        >
                            <MenuItem value="">All</MenuItem>
                            {priorities.map(priority => (
                                <MenuItem key={priority} value={priority}>
                                    {priority}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Box>

                {/* Error Alert */}
                {error && (
                    <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
                        {error}
                    </Alert>
                )}

                {/* Loading State */}
                {loading ? (
                    <Box className="it-loading-container">
                        <CircularProgress />
                    </Box>
                ) : (
                    <>
                        {/* Tickets Grid */}
                        {filteredTickets.length > 0 ? (
                            <Box className="it-tickets-grid">
                                {filteredTickets.map(ticket => (
                                    <ITTicketCard
                                        key={ticket._id}
                                        ticket={ticket}
                                        onClick={handleTicketClick}
                                        showAssignee={true}
                                    />
                                ))}
                            </Box>
                        ) : (
                            <Box className="it-empty-state">
                                <TicketIcon className="it-empty-state-icon" />
                                <Typography variant="h6" className="it-empty-state-title">
                                    No tickets found
                                </Typography>
                                <Typography variant="body2" className="it-empty-state-subtitle">
                                    {activeTab === 0
                                        ? "You haven't raised any IT support tickets yet."
                                        : activeTab === 1
                                        ? "You don't have any active tickets."
                                        : "You don't have any resolved tickets."}
                                </Typography>
                                {activeTab === 0 && (
                                    <Button
                                        variant="contained"
                                        startIcon={<AddIcon />}
                                        onClick={() => setCreateModalOpen(true)}
                                        sx={{ 
                                            mt: 3,
                                            borderRadius: '10px',
                                            textTransform: 'none',
                                            fontWeight: 600,
                                            px: 3
                                        }}
                                    >
                                        Raise Your First Ticket
                                    </Button>
                                )}
                            </Box>
                        )}
                    </>
                )}

                {/* Create Ticket Modal */}
                <ITTicketForm
                    open={createModalOpen}
                    onClose={() => setCreateModalOpen(false)}
                    onSuccess={handleCreateSuccess}
                />

                {/* Ticket Details Modal */}
                <ITTicketDetailsModal
                    open={detailsModal.open}
                    onClose={() => setDetailsModal({ open: false, ticket: null })}
                    ticket={detailsModal.ticket}
                    onUpdate={handleTicketUpdate}
                    isAdmin={false}
                />

                {/* Success Snackbar */}
                <Snackbar
                    open={snackbar.open}
                    autoHideDuration={6000}
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                >
                    <Alert
                        onClose={() => setSnackbar({ ...snackbar, open: false })}
                        severity={snackbar.severity}
                        sx={{ width: '100%' }}
                    >
                        {snackbar.message}
                    </Alert>
                </Snackbar>
            </Container>
        </Box>
    );
};

export default ITSupportPage;
