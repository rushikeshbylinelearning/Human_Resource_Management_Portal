// frontend/src/pages/AdminITSupportPage.jsx
import React, { useState, useEffect } from 'react';
import {
    Container,
    Typography,
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
    Grid,
    Paper,
    Button,
    Snackbar,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    IconButton,
    Tooltip
} from '@mui/material';
import {
    Search as SearchIcon,
    Refresh as RefreshIcon,
    Assignment as AssignmentIcon,
    ConfirmationNumber as TicketIcon
} from '@mui/icons-material';
import PageHeroHeader from '../components/PageHeroHeader';
import ITTicketCard from '../components/ITSupport/ITTicketCard';
import ITTicketDetailsModal from '../components/ITSupport/ITTicketDetailsModal';
import DashboardSummaryCard from '../components/Dashboard/DashboardSummaryCard';
import api from '../api/axios';
import '../styles/ITSupportPages.css';

const AdminITSupportPage = () => {
    const [activeTab, setActiveTab] = useState(0);
    const [tickets, setTickets] = useState([]);
    const [statistics, setStatistics] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    
    // Modals
    const [detailsModal, setDetailsModal] = useState({ open: false, ticket: null });
    const [assignModal, setAssignModal] = useState({ open: false, ticket: null });
    
    // Snackbar
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    const statuses = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED', 'CANCELLED'];
    const priorities = ['Low', 'Medium', 'High', 'Critical'];
    const [categories, setCategories] = useState([]);

    useEffect(() => {
        fetchAllTickets();
    }, [statusFilter, priorityFilter, categoryFilter, search]);

    const fetchAllTickets = async () => {
        setLoading(true);
        setError('');

        try {
            const params = new URLSearchParams();
            if (statusFilter) params.append('status', statusFilter);
            if (priorityFilter) params.append('priority', priorityFilter);
            if (categoryFilter) params.append('category', categoryFilter);
            if (search) params.append('search', search);

            const response = await api.get(`/it-support/tickets?${params}`);
            setTickets(response.data.tickets || []);
            setStatistics(response.data.statistics || {});
            setCategories(response.data.categories || []);
        } catch (err) {
            console.error('Error fetching tickets:', err);
            setError(err.response?.data?.error || 'Failed to fetch tickets.');
        } finally {
            setLoading(false);
        }
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
        if (activeTab === 0) return tickets; // All
        if (activeTab === 1) return tickets.filter(t => t.status === 'OPEN'); // Open
        if (activeTab === 2) return tickets.filter(t => ['ACKNOWLEDGED', 'IN_PROGRESS'].includes(t.status)); // In Progress
        if (activeTab === 3) return tickets.filter(t => t.status === 'WAITING_FOR_USER'); // Waiting
        if (activeTab === 4) return tickets.filter(t => ['RESOLVED', 'CLOSED'].includes(t.status)); // Resolved
        return tickets;
    };

    const filteredTickets = filterTicketsByTab(tickets);

    return (
        <Box className="it-support-page">
            <Container maxWidth="xl">
                <PageHeroHeader
                    title="IT Support Management"
                    description="Manage and resolve IT support tickets from employees"
                    icon={<TicketIcon />}
                    actionArea={
                        <Tooltip title="Refresh tickets">
                            <IconButton
                                onClick={fetchAllTickets}
                                disabled={loading}
                                className="it-refresh-btn"
                            >
                                <RefreshIcon />
                            </IconButton>
                        </Tooltip>
                    }
                />

                {/* Summary Cards */}
                <Grid container spacing={3} className="it-stats-grid">
                    <Grid item xs={12} sm={6} md={3}>
                        <DashboardSummaryCard
                            title="Open Tickets"
                            value={statistics.byStatus?.OPEN || 0}
                            icon={AssignmentIcon}
                            color="info"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <DashboardSummaryCard
                            title="In Progress"
                            value={statistics.byStatus?.IN_PROGRESS || 0}
                            color="warning"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <DashboardSummaryCard
                            title="Critical/High"
                            value={(statistics.byPriority?.Critical || 0) + (statistics.byPriority?.High || 0)}
                            color="error"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <DashboardSummaryCard
                            title="Resolved"
                            value={statistics.byStatus?.RESOLVED || 0}
                            color="success"
                        />
                    </Grid>
                </Grid>

                {/* Tabs */}
                <Box className="it-tabs-container">
                    <Tabs 
                        value={activeTab} 
                        onChange={(e, v) => setActiveTab(v)}
                        className="it-tabs"
                    >
                        <Tab label="All Tickets" className="it-tab" />
                        <Tab label="Open" className="it-tab" />
                        <Tab label="In Progress" className="it-tab" />
                        <Tab label="Waiting" className="it-tab" />
                        <Tab label="Resolved" className="it-tab" />
                    </Tabs>
                </Box>

                {/* Filters */}
                <Box className="it-filters-toolbar">
                    <TextField
                        placeholder="Search tickets by ID, subject, employee, or category..."
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

                    <FormControl size="small" className="it-filter-select">
                        <InputLabel>Category</InputLabel>
                        <Select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            label="Category"
                        >
                            <MenuItem value="">All</MenuItem>
                            {categories.map(category => (
                                <MenuItem key={category} value={category}>
                                    {category}
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
                                    {search || statusFilter || priorityFilter || categoryFilter
                                        ? 'Try adjusting your filters or search query'
                                        : 'No IT support tickets have been raised yet'}
                                </Typography>
                            </Box>
                        )}
                    </>
                )}

                {/* Ticket Details Modal */}
                <ITTicketDetailsModal
                    open={detailsModal.open}
                    onClose={() => setDetailsModal({ open: false, ticket: null })}
                    ticket={detailsModal.ticket}
                    onUpdate={handleTicketUpdate}
                    isAdmin={true}
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

export default AdminITSupportPage;
