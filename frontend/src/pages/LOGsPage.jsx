// frontend/src/pages/LOGsPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Container,
    Typography,
    Box,
    Tabs,
    Tab,
    TextField,
    InputAdornment,
    Alert,
    CircularProgress,
    Paper,
    Chip,
    TablePagination
} from '@mui/material';
import {
    Search as SearchIcon,
    Assessment as AssessmentIcon
} from '@mui/icons-material';
import PageHeroHeader from '../components/PageHeroHeader';
import { formatISTDate, formatISTTime } from '../utils/istTime';
import api from '../api/axios';

const getActionIcon = (type = '') => {
    // Return empty for now, can be enhanced later
    return null;
};

const getCategoryColor = (category = '') => {
    const colors = {
        attendance: 'primary',
        leave: 'secondary',
        break: 'info',
        system: 'warning',
        it_support: 'error',
        employee: 'success'
    };
    return colors[category] || 'default';
};

const LOGsPage = () => {
    const [activeTab, setActiveTab] = useState(0);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const [totalCount, setTotalCount] = useState(0);

    useEffect(() => {
        fetchLogs();
    }, [activeTab, search, page, rowsPerPage]);

    const fetchLogs = async () => {
        setLoading(true);
        setError('');

        try {
            const params = new URLSearchParams({
                page: (page + 1).toString(),
                limit: rowsPerPage.toString()
            });

            if (search) {
                params.append('search', search);
            }

            let endpoint = '/logs/activity'; // Default to activity logs
            if (activeTab === 0) {
                endpoint = '/logs/hr';
            } else if (activeTab === 1) {
                endpoint = '/logs/it';
            } else if (activeTab === 2) {
                endpoint = '/logs/activity';
            }

            const response = await api.get(`${endpoint}?${params}`);
            setLogs(response.data.logs || []);
            setTotalCount(response.data.totalCount || 0);
        } catch (err) {
            console.error('Error fetching logs:', err);
            setError(err.response?.data?.error || 'Failed to fetch logs.');
        } finally {
            setLoading(false);
        }
    };

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
        setPage(0); // Reset to first page when changing tabs
    };

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    const handleSearchChange = (event) => {
        setSearch(event.target.value);
        setPage(0); // Reset to first page when searching
    };

    const getTabLabel = (index) => {
        const labels = ['HR', 'IT', 'Activity Log'];
        return labels[index];
    };

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            <PageHeroHeader
                title="LOGs"
                subtitle="System audit logs and activity tracking"
                icon={<AssessmentIcon />}
            />

            {/* Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                <Tabs value={activeTab} onChange={handleTabChange}>
                    <Tab label="HR" />
                    <Tab label="IT" />
                    <Tab label="Activity Log" />
                </Tabs>
            </Box>

            {/* Search */}
            <Box sx={{ mb: 3 }}>
                <TextField
                    placeholder="Search logs..."
                    value={search}
                    onChange={handleSearchChange}
                    size="small"
                    fullWidth
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon />
                            </InputAdornment>
                        ),
                    }}
                />
            </Box>

            {/* Error Alert */}
            {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            {/* Loading State */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <>
                    {/* Logs List */}
                    {logs.length > 0 ? (
                        <Box>
                            {logs.map((log, index) => (
                                <Paper 
                                    key={log._id || index} 
                                    elevation={1} 
                                    sx={{ 
                                        p: 2.5, 
                                        mb: 2,
                                        '&:hover': {
                                            boxShadow: 3
                                        }
                                    }}
                                >
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                                        <Box sx={{ flex: 1 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                                <Chip 
                                                    label={log.category || 'system'} 
                                                    size="small" 
                                                    color={getCategoryColor(log.category)}
                                                    sx={{ fontWeight: 500 }}
                                                />
                                                {log.type && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        {log.type.replace(/_/g, ' ')}
                                                    </Typography>
                                                )}
                                            </Box>
                                            <Typography variant="body1" sx={{ mb: 0.5 }}>
                                                {log.message}
                                            </Typography>
                                            {log.userName && (
                                                <Typography variant="body2" color="text.secondary">
                                                    by {log.userName}
                                                </Typography>
                                            )}
                                        </Box>
                                        <Box sx={{ textAlign: 'right', minWidth: 140 }}>
                                            <Typography variant="caption" color="text.secondary">
                                                {formatISTDate(log.createdAt)}
                                            </Typography>
                                            <br />
                                            <Typography variant="caption" color="text.secondary">
                                                {formatISTTime(log.createdAt)}
                                            </Typography>
                                        </Box>
                                    </Box>

                                    {/* Metadata */}
                                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                                        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                                {Object.entries(log.metadata).map(([key, value]) => {
                                                    if (key === '_id' || key === '__v') return null;
                                                    return (
                                                        <Typography key={key} variant="caption" color="text.secondary">
                                                            <strong>{key}:</strong> {String(value)}
                                                        </Typography>
                                                    );
                                                })}
                                            </Box>
                                        </Box>
                                    )}
                                </Paper>
                            ))}

                            {/* Pagination */}
                            <Paper elevation={0} sx={{ mt: 3 }}>
                                <TablePagination
                                    component="div"
                                    count={totalCount}
                                    page={page}
                                    onPageChange={handleChangePage}
                                    rowsPerPage={rowsPerPage}
                                    onRowsPerPageChange={handleChangeRowsPerPage}
                                    rowsPerPageOptions={[10, 25, 50, 100]}
                                />
                            </Paper>
                        </Box>
                    ) : (
                        <Box sx={{ textAlign: 'center', py: 8 }}>
                            <Typography variant="h6" color="text.secondary">
                                No logs found
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                {search
                                    ? 'Try adjusting your search query'
                                    : `No ${getTabLabel(activeTab).toLowerCase()} logs available`}
                            </Typography>
                        </Box>
                    )}
                </>
            )}
        </Container>
    );
};

export default LOGsPage;
