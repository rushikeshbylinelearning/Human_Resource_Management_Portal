// Operational Dashboard — HR Queries, IT Tickets, Activity Logs (list views)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Container,
    Typography,
    Box,
    Tabs,
    Tab,
    Paper,
    Alert,
    CircularProgress,
    Chip,
    TextField,
    InputAdornment,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TablePagination,
    MenuItem,
    IconButton,
    Tooltip,
    FormControl,
    InputLabel,
    Select,
    Button,
} from '@mui/material';
import {
    Assessment as AssessmentIcon,
    Search as SearchIcon,
    Refresh as RefreshIcon,
    Download as DownloadIcon,
} from '@mui/icons-material';
import PageHeroHeader from '../components/PageHeroHeader';
import ITTicketDetailsModal from '../components/ITSupport/ITTicketDetailsModal';
import { formatISTDate, formatISTTime } from '../utils/istTime';
import { usePermissions } from '../hooks/usePermissions';
import api from '../api/axios';
import socket from '../socket';
import './OperationalDashboardPage.css';

const priorityColor = (priority) => {
    const p = (priority || '').toLowerCase();
    if (p === 'critical' || p === 'high') return 'error';
    if (p === 'medium') return 'warning';
    if (p === 'low') return 'success';
    return 'default';
};

const statusColor = (status) => {
    const s = (status || '').toUpperCase();
    if (s === 'OPEN' || s === 'OPEN' || s === 'PENDING') return 'warning';
    if (s.includes('PROGRESS')) return 'info';
    if (s === 'RESOLVED' || s === 'FULFILLED' || s === 'CLOSED') return 'success';
    return 'default';
};

const formatActivityLogType = (type) =>
    (type || 'unknown').replace(/_/g, ' ');

const formatActivityLogMessage = (log) => {
    if (log?.message?.trim()) return log.message.trim();
    const typeLabel = formatActivityLogType(log?.type);
    if (log?.userName && log.userName !== 'System') {
        return `${log.userName} — ${typeLabel}`;
    }
    if (log?.metadata?.type) {
        return String(log.metadata.type).replace(/_/g, ' ');
    }
    if (log?.metadata?.employeeName) {
        return `${log.metadata.employeeName} — ${typeLabel}`;
    }
    return typeLabel;
};

const activityCategoryColor = (category) => {
    const c = (category || '').toLowerCase();
    if (c === 'attendance') return 'success';
    if (c === 'leave') return 'warning';
    if (c === 'break') return 'info';
    if (c === 'hr_query') return 'secondary';
    return 'default';
};

const OperationalDashboardPage = () => {
    const { canAccess } = usePermissions();
    const [searchParams, setSearchParams] = useSearchParams();

    const hasHR = canAccess.manageHRQueries();
    const hasIT = canAccess.manageITSupport();
    const canView = canAccess.operationalDashboard();

    const tabs = useMemo(() => {
        const list = [];
        if (hasHR) list.push({ key: 'hr', label: 'HR' });
        if (hasIT) list.push({ key: 'it', label: 'IT' });
        list.push({ key: 'activity', label: 'Activity Logs' });
        return list;
    }, [hasHR, hasIT]);

    const tabFromUrl = searchParams.get('tab');
    const initialTab = tabs.findIndex((t) => t.key === tabFromUrl);
    const [activeTab, setActiveTab] = useState(initialTab >= 0 ? initialTab : 0);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [hrQueries, setHrQueries] = useState([]);
    const [hrSearch, setHrSearch] = useState('');
    const [hrStatus, setHrStatus] = useState('');

    const [itTickets, setItTickets] = useState([]);
    const [itTotal, setItTotal] = useState(0);
    const [itPage, setItPage] = useState(0);
    const [itRows, setItRows] = useState(25);
    const [itSearch, setItSearch] = useState('');
    const [itStatus, setItStatus] = useState('');
    const [itPriority, setItPriority] = useState('');
    const [itCategory, setItCategory] = useState('');
    const [itCategories, setItCategories] = useState([]);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [ticketModalOpen, setTicketModalOpen] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);

    const [logs, setLogs] = useState([]);
    const [logsSearch, setLogsSearch] = useState('');
    const [logsPage, setLogsPage] = useState(0);
    const [logsRows, setLogsRows] = useState(25);
    const [logsTotal, setLogsTotal] = useState(0);

    useEffect(() => {
        if (activeTab >= tabs.length) setActiveTab(0);
    }, [tabs.length, activeTab]);

    const currentKey = tabs[activeTab]?.key;

    const loadData = useCallback(async () => {
        if (!tabs.length) return;
        setLoading(true);
        setError('');
        try {
            if (currentKey === 'hr' && hasHR) {
                const params = new URLSearchParams();
                // Include resource requests to match FAB button behavior
                if (hrStatus) params.append('status', hrStatus);
                const { data } = await api.get(`/hr-queries/admin/all?${params}`);
                let rows = Array.isArray(data) ? data : [];
                if (hrSearch.trim()) {
                    const q = hrSearch.trim().toLowerCase();
                    rows = rows.filter(
                        (item) =>
                            item.subject?.toLowerCase().includes(q)
                            || item.employeeId?.fullName?.toLowerCase().includes(q)
                            || item._id?.toString().includes(q)
                            || item.category?.toLowerCase().includes(q)
                    );
                }
                setHrQueries(rows);
            } else if (currentKey === 'it' && hasIT) {
                const params = {
                    page: itPage + 1,
                    limit: itRows,
                };
                if (itSearch.trim()) params.search = itSearch.trim();
                if (itStatus) params.status = itStatus;
                if (itPriority) params.priority = itPriority;
                if (itCategory) params.category = itCategory;
                const { data } = await api.get('/it-support/tickets', { params });
                setItTickets(data.tickets || []);
                setItTotal(data.totalCount || 0);
                if (data.categories?.length) setItCategories(data.categories);
            } else if (currentKey === 'activity') {
                const params = new URLSearchParams({
                    page: String(logsPage + 1),
                    limit: String(logsRows),
                });
                if (logsSearch.trim()) params.append('search', logsSearch.trim());
                const { data } = await api.get(`/logs/activity?${params}`);
                setLogs(data.logs || []);
                setLogsTotal(data.totalCount || 0);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load data.');
        } finally {
            setLoading(false);
        }
    }, [
        currentKey, hasHR, hasIT, hrSearch, hrStatus, itPage, itRows, itSearch, itStatus,
        itPriority, itCategory, logsPage, logsRows, logsSearch, tabs.length,
    ]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleExportITTickets = async () => {
        setExportingExcel(true);
        try {
            const params = {};
            if (itStatus) params.status = itStatus;
            if (itPriority) params.priority = itPriority;
            if (itCategory) params.category = itCategory;
            if (itSearch.trim()) params.search = itSearch.trim();

            const { data } = await api.get('/it-support/tickets/export/excel', {
                params,
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'IT_Support_Tickets.xlsx';
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('[OperationalDashboard] IT export error:', err.message);
            setError(err.response?.data?.error || 'Failed to export tickets.');
        } finally {
            setExportingExcel(false);
        }
    };

    // Real-time socket updates for IT tickets
    useEffect(() => {
        const handleTicketUpdate = (data) => {
            if (currentKey === 'it') {
                // Update the ticket in the list
                setItTickets(prev => prev.map(ticket => 
                    ticket._id === data.ticketId ? { ...ticket, ...data.ticket } : ticket
                ));
                
                // Update selected ticket if it's the one being viewed
                if (selectedTicket && selectedTicket._id === data.ticketId) {
                    setSelectedTicket(prev => ({ ...prev, ...data.ticket }));
                }
            }
        };

        socket.on('it_ticket_updated', handleTicketUpdate);

        return () => {
            socket.off('it_ticket_updated', handleTicketUpdate);
        };
    }, [currentKey, selectedTicket]);

    const handleTabChange = (_, value) => {
        setActiveTab(value);
        const key = tabs[value]?.key;
        if (key) setSearchParams({ tab: key }, { replace: true });
    };

    const filteredHr = hrQueries;

    const headerStats = useMemo(() => {
        if (currentKey === 'hr') {
            const norm = (s) => (s || '').toLowerCase();
            const open = hrQueries.filter((q) => ['open', 'in-progress', 'pending'].includes(norm(q.status))).length;
            const closed = hrQueries.filter((q) => ['closed', 'resolved'].includes(norm(q.status))).length;
            return [
                { label: 'Total queries', value: hrQueries.length },
                { label: 'Open / in progress', value: open },
                { label: 'Closed / resolved', value: closed },
            ];
        }
        if (currentKey === 'it') {
            return [
                { label: 'Tickets (page)', value: itTickets.length },
                { label: 'Total matching', value: itTotal },
            ];
        }
        if (currentKey === 'activity') {
            return [
                { label: 'Entries (page)', value: logs.length },
                { label: 'Total matching', value: logsTotal },
            ];
        }
        return null;
    }, [currentKey, hrQueries, itTickets.length, itTotal, logs.length, logsTotal]);

    if (!canView) {
        return (
            <Container maxWidth="md" sx={{ py: 6 }}>
                <Alert severity="warning">You do not have access to the Operational Dashboard.</Alert>
            </Container>
        );
    }

    const renderHrTable = () => (
        <Box className="operational-table-wrap">
            <Box className="operational-logs-toolbar operational-logs-toolbar--inline">
                <TextField
                    size="small"
                    placeholder="Search queries…"
                    value={hrSearch}
                    onChange={(e) => setHrSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadData()}
                    InputProps={{
                        startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
                    }}
                    className="operational-search-field"
                />
                <FormControl size="small" className="operational-filter-field">
                    <InputLabel>Status</InputLabel>
                    <Select label="Status" value={hrStatus} onChange={(e) => setHrStatus(e.target.value)}>
                        <MenuItem value="">All</MenuItem>
                        <MenuItem value="open">Open</MenuItem>
                        <MenuItem value="in-progress">In progress</MenuItem>
                        <MenuItem value="pending">Pending</MenuItem>
                        <MenuItem value="resolved">Resolved</MenuItem>
                        <MenuItem value="closed">Closed</MenuItem>
                        <MenuItem value="fulfilled">Fulfilled</MenuItem>
                    </Select>
                </FormControl>
                <Typography variant="body2" className="operational-toolbar-meta">
                    {filteredHr.length} {filteredHr.length === 1 ? 'item' : 'items'}
                </Typography>
            </Box>
            <TableContainer className="operational-table-scroll">
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>Query ID</TableCell>
                            <TableCell>Date</TableCell>
                            <TableCell>Employee</TableCell>
                            <TableCell>Category</TableCell>
                            <TableCell className="operational-cell-subject">Subject</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Assigned To</TableCell>
                            <TableCell>Last Updated</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredHr.map((q) => (
                            <TableRow key={q._id} hover>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                    {String(q._id).slice(-8).toUpperCase()}
                                </TableCell>
                                <TableCell>{formatISTDate(q.createdAt)}</TableCell>
                                <TableCell>{q.employeeId?.fullName || '—'}</TableCell>
                                <TableCell>
                                    {q.category && (
                                        <Chip 
                                            size="small" 
                                            label={q.category} 
                                            variant="outlined"
                                            sx={{ fontSize: '0.7rem' }}
                                        />
                                    )}
                                    {!q.category && '—'}
                                </TableCell>
                                <TableCell className="operational-cell-subject">{q.subject}</TableCell>
                                <TableCell>
                                    <Chip 
                                        size="small" 
                                        label={q.status ? String(q.status).replace('-', ' ') : 'open'} 
                                        color={statusColor(q.status)} 
                                    />
                                </TableCell>
                                <TableCell>{q.assignedTo?.fullName || '—'}</TableCell>
                                <TableCell>{formatISTDate(q.lastMessageAt || q.updatedAt)}</TableCell>
                            </TableRow>
                        ))}
                        {!filteredHr.length && !loading && (
                            <TableRow>
                                <TableCell colSpan={8} align="center" className="operational-table-empty">
                                    No HR queries or requests found
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );

    const renderItTable = () => (
        <>
            <Box className="operational-table-wrap">
                <Box className="operational-logs-toolbar operational-logs-toolbar--inline">
                    <TextField
                        size="small"
                        placeholder="Search tickets…"
                        value={itSearch}
                        onChange={(e) => setItSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadData()}
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
                        }}
                        className="operational-search-field"
                    />
                    <FormControl size="small" className="operational-filter-field">
                        <InputLabel>Status</InputLabel>
                        <Select label="Status" value={itStatus} onChange={(e) => { setItStatus(e.target.value); setItPage(0); }}>
                            <MenuItem value="">All</MenuItem>
                            <MenuItem value="OPEN">Open</MenuItem>
                            <MenuItem value="ACKNOWLEDGED">Acknowledged</MenuItem>
                            <MenuItem value="IN_PROGRESS">In progress</MenuItem>
                            <MenuItem value="WAITING_FOR_USER">Waiting</MenuItem>
                            <MenuItem value="RESOLVED">Resolved</MenuItem>
                            <MenuItem value="CLOSED">Closed</MenuItem>
                        </Select>
                    </FormControl>
                    <FormControl size="small" className="operational-filter-field">
                        <InputLabel>Priority</InputLabel>
                        <Select label="Priority" value={itPriority} onChange={(e) => { setItPriority(e.target.value); setItPage(0); }}>
                            <MenuItem value="">All</MenuItem>
                            <MenuItem value="Low">Low</MenuItem>
                            <MenuItem value="Medium">Medium</MenuItem>
                            <MenuItem value="High">High</MenuItem>
                            <MenuItem value="Critical">Critical</MenuItem>
                        </Select>
                    </FormControl>
                    {itCategories.length > 0 && (
                        <FormControl size="small" className="operational-filter-field operational-filter-field--wide">
                            <InputLabel>Category</InputLabel>
                            <Select label="Category" value={itCategory} onChange={(e) => { setItCategory(e.target.value); setItPage(0); }}>
                                <MenuItem value="">All</MenuItem>
                                {itCategories.map((c) => (
                                    <MenuItem key={c} value={c}>{c}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<DownloadIcon />}
                        onClick={handleExportITTickets}
                        disabled={exportingExcel || loading}
                        sx={{ ml: 1 }}
                    >
                        {exportingExcel ? 'Exporting...' : 'Export to Excel'}
                    </Button>
                    <Typography variant="body2" className="operational-toolbar-meta">
                        {itTotal} {itTotal === 1 ? 'ticket' : 'tickets'}
                    </Typography>
                </Box>
                <TableContainer className="operational-table-scroll">
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell>Ticket ID</TableCell>
                                <TableCell>Date</TableCell>
                                <TableCell>Employee</TableCell>
                                <TableCell>Category</TableCell>
                                <TableCell className="operational-cell-subject">Subject</TableCell>
                                <TableCell>Priority</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Assigned To</TableCell>
                                <TableCell>Last Updated</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {itTickets.map((t) => (
                                <TableRow
                                    key={t._id}
                                    hover
                                    sx={{ cursor: 'pointer' }}
                                    onClick={() => { setSelectedTicket(t); setTicketModalOpen(true); }}
                                >
                                    <TableCell sx={{ fontWeight: 600 }}>{t.ticketId}</TableCell>
                                    <TableCell>{formatISTDate(t.createdAt)}</TableCell>
                                    <TableCell>{t.createdByName}</TableCell>
                                    <TableCell>{t.category}</TableCell>
                                    <TableCell className="operational-cell-subject">{t.title}</TableCell>
                                    <TableCell><Chip size="small" label={t.priority} color={priorityColor(t.priority)} /></TableCell>
                                    <TableCell><Chip size="small" label={t.status} color={statusColor(t.status)} /></TableCell>
                                    <TableCell>{t.assignedToName || '—'}</TableCell>
                                    <TableCell>{formatISTDate(t.updatedAt || t.createdAt)}</TableCell>
                                </TableRow>
                            ))}
                            {!itTickets.length && !loading && (
                                <TableRow>
                                    <TableCell colSpan={9} align="center" className="operational-table-empty">
                                        No IT tickets found
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
                <TablePagination
                    className="operational-table-pagination"
                    component="div"
                    count={itTotal}
                    page={itPage}
                    onPageChange={(_, p) => setItPage(p)}
                    rowsPerPage={itRows}
                    onRowsPerPageChange={(e) => { setItRows(parseInt(e.target.value, 10)); setItPage(0); }}
                    rowsPerPageOptions={[10, 25, 50]}
                />
            </Box>
            <ITTicketDetailsModal
                open={ticketModalOpen}
                onClose={() => setTicketModalOpen(false)}
                ticket={selectedTicket}
                onUpdate={() => loadData()}
                isAdmin
            />
        </>
    );

    const renderActivityLogs = () => (
        <Box className="operational-table-wrap">
            <Box className="operational-logs-toolbar operational-logs-toolbar--inline">
                <TextField
                    size="small"
                    placeholder="Search activity logs…"
                    value={logsSearch}
                    onChange={(e) => setLogsSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadData()}
                    InputProps={{
                        startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
                    }}
                    className="operational-search-field"
                />
                <Typography variant="body2" className="operational-toolbar-meta">
                    {logsTotal} {logsTotal === 1 ? 'entry' : 'entries'}
                </Typography>
            </Box>
            <TableContainer className="operational-table-scroll">
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>Date &amp; Time</TableCell>
                            <TableCell>User</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Category</TableCell>
                            <TableCell className="operational-cell-subject">Message</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {logs.map((log) => {
                            const message = formatActivityLogMessage(log);
                            return (
                                <TableRow key={log._id} hover>
                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                        <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                                            {formatISTDate(log.createdAt)}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {formatISTTime(log.createdAt)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{log.userName || 'System'}</TableCell>
                                    <TableCell sx={{ textTransform: 'capitalize' }}>
                                        {formatActivityLogType(log.type)}
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={(log.category || 'system').replace(/_/g, ' ')}
                                            color={activityCategoryColor(log.category)}
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell className="operational-activity-message-cell">
                                        <Tooltip title={message}>
                                            <Typography variant="body2" className="operational-activity-message">
                                                {message}
                                            </Typography>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {!logs.length && !loading && (
                            <TableRow>
                                <TableCell colSpan={5} align="center" className="operational-table-empty">
                                    No logs found
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
            <TablePagination
                className="operational-table-pagination"
                component="div"
                count={logsTotal}
                page={logsPage}
                onPageChange={(_, p) => setLogsPage(p)}
                rowsPerPage={logsRows}
                onRowsPerPageChange={(e) => { setLogsRows(parseInt(e.target.value, 10)); setLogsPage(0); }}
                rowsPerPageOptions={[10, 25, 50, 100]}
            />
        </Box>
    );

    return (
        <Box className="operational-dashboard-page">
            <Container maxWidth={false} disableGutters className="operational-dashboard-inner">
                <PageHeroHeader
                    title="Operational Dashboard"
                    description="HR queries, IT tickets, and activity logs"
                    icon={<AssessmentIcon />}
                    stats={headerStats}
                    actionArea={
                        <Tooltip title="Refresh">
                            <IconButton onClick={loadData} size="large" className="operational-refresh-btn-header">
                                <RefreshIcon />
                            </IconButton>
                        </Tooltip>
                    }
                />

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>
                )}

                <Paper elevation={0} className="operational-panel">
                    <Tabs
                        value={activeTab}
                        onChange={handleTabChange}
                        variant="scrollable"
                        scrollButtons="auto"
                        className="operational-tabs"
                    >
                        {tabs.map((tab) => (
                            <Tab key={tab.key} label={tab.label} className="operational-tab" />
                        ))}
                    </Tabs>

                    <Box className="operational-content">
                        {loading ? (
                            <Box className="operational-loading">
                                <CircularProgress />
                            </Box>
                        ) : (
                            <>
                                {currentKey === 'hr' && renderHrTable()}
                                {currentKey === 'it' && renderItTable()}
                                {currentKey === 'activity' && renderActivityLogs()}
                            </>
                        )}
                    </Box>
                </Paper>
            </Container>
        </Box>
    );
};

export default OperationalDashboardPage;
