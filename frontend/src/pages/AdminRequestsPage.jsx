// frontend/src/pages/AdminRequestsPage.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Paper, Typography, TextField, MenuItem, Chip, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, Snackbar, Alert, IconButton, InputAdornment,
  Tooltip,
} from '@mui/material';
import {
  Inventory2, Search as SearchIcon, Refresh as RefreshIcon,
  PendingActionsOutlined, AutorenewOutlined, CheckCircleOutline,
  InboxOutlined, ChevronRight,
} from '@mui/icons-material';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import PageHeroHeader from '../components/PageHeroHeader';
import UserAvatar from '../components/common/UserAvatar';
import { TableSkeleton } from '../components/SkeletonLoaders';
import '../styles/RequestsPage.css';

const STATUS_OPTIONS = ['Pending', 'In Progress', 'Fulfilled', 'Rejected'];
const FILTER_TABS = [
  { value: '', label: 'All' },
  { value: 'Pending', label: 'Pending' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Fulfilled', label: 'Fulfilled' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Cancelled', label: 'Cancelled' },
];

const statusColor = (status) => {
  const map = {
    Pending: 'warning',
    'In Progress': 'info',
    Fulfilled: 'success',
    Rejected: 'error',
    Cancelled: 'default',
  };
  return map[status] || 'default';
};

const employeeUser = (req) => ({
  fullName: req.employeeName,
  profileImageUrl: req.profileImageUrl,
});

const formatDate = (dateString) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const formatTitle = (title) => {
  if (!title) return '—';
  const trimmed = String(title).trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const KpiCard = ({ variant, label, value, icon }) => (
  <div className={`rr-kpi-card rr-kpi-card--${variant}`}>
    <div className="rr-kpi-card__body">
      <span className="rr-kpi-card__label">{label}</span>
      <span className="rr-kpi-card__value">{value}</span>
    </div>
    <div className="rr-kpi-card__icon">{icon}</div>
  </div>
);

const AdminRequestsPage = ({ embedded = false, resourceScope = '' }) => {
  const { user } = useAuth();
  const isDelegatedView = !embedded && user?.role !== 'Admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [newStatus, setNewStatus] = useState('In Progress');
  const [updating, setUpdating] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [statusCounts, setStatusCounts] = useState({});

  const fetchRequests = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const params = { page: page + 1, limit: rowsPerPage };
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      if (resourceScope === 'hr' || resourceScope === 'it') params.scope = resourceScope;
      const { data } = await api.get('/resource-requests', { params });
      setRequests(data.requests || []);
      setTotalCount(data.totalCount || 0);
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to load requests.', severity: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, rowsPerPage, statusFilter, search, resourceScope]);

  const fetchStatusCounts = useCallback(async () => {
    try {
      const { data } = await api.get('/resource-requests', { params: { page: 1, limit: 200 } });
      const counts = (data.requests || []).reduce((acc, req) => {
        acc[req.status] = (acc[req.status] || 0) + 1;
        return acc;
      }, {});
      setStatusCounts(counts);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    fetchStatusCounts();
  }, [fetchStatusCounts, totalCount]);

  useEffect(() => {
    const requestId = searchParams.get('requestId');
    if (!requestId) return;
    const openById = async () => {
      try {
        const { data } = await api.get(`/resource-requests/${requestId}`);
        if (data.request) {
          setSelected(data.request);
          setAdminNotes(data.request.adminNotes || '');
          setNewStatus(data.request.status === 'Pending' ? 'In Progress' : data.request.status);
          setDetailOpen(true);
        }
      } catch {
        /* list fetch may still show it */
      }
      setSearchParams({}, { replace: true });
    };
    openById();
  }, [searchParams, setSearchParams]);

  const openDetail = (req) => {
    setSelected(req);
    setAdminNotes(req.adminNotes || '');
    setNewStatus(req.status === 'Pending' ? 'In Progress' : req.status);
    setDetailOpen(true);
  };

  const handleUpdateStatus = async () => {
    if (!selected) return;
    setUpdating(true);
    try {
      await api.patch(`/resource-requests/${selected._id}/status`, {
        status: newStatus,
        adminNotes,
      });
      setSnackbar({ open: true, message: 'Request updated successfully.', severity: 'success' });
      setDetailOpen(false);
      fetchRequests(true);
      fetchStatusCounts();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Update failed.', severity: 'error' });
    } finally {
      setUpdating(false);
    }
  };

  const handleApplySearch = () => {
    setSearch(searchInput);
    setPage(0);
  };

  const handleStatusTab = (value) => {
    setStatusFilter(value);
    setPage(0);
  };

  const handleRefresh = () => {
    fetchRequests(true);
    fetchStatusCounts();
  };

  const categoryLabel = (req) => (req.category === 'Other' && req.customCategory ? req.customCategory : req.category);

  const kpiStats = useMemo(() => ({
    total: totalCount,
    pending: statusCounts.Pending || 0,
    inProgress: statusCounts['In Progress'] || 0,
    fulfilled: statusCounts.Fulfilled || 0,
  }), [totalCount, statusCounts]);

  const isEditable = selected
    && selected.status !== 'Cancelled'
    && selected.status !== 'Fulfilled'
    && selected.status !== 'Rejected';

  return (
    <Box className={`requests-page${embedded ? ' requests-page--embedded' : ''}`}>
      {!embedded && (
        <PageHeroHeader
          eyebrow={isDelegatedView ? 'Workplace' : 'Operations'}
          title="Resource Requests"
          description={
            isDelegatedView
              ? 'Review and update employee requests for stationery, IT hardware, and other workplace resources.'
              : 'Review and manage employee requests for stationery, IT hardware, and other workplace resources.'
          }
          icon={<Inventory2 />}
          actionArea={(
            <Tooltip title="Refresh list">
              <IconButton
                onClick={handleRefresh}
                disabled={refreshing}
                size="small"
                sx={{
                  border: '1px solid #e9ecef',
                  borderRadius: '8px',
                  color: '#6c757d',
                }}
              >
                <RefreshIcon className={refreshing ? 'rr-spin' : ''} fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        />
      )}

      {!embedded && (
        <div className="rr-kpi-grid">
          <KpiCard variant="total" label="Total Requests" value={kpiStats.total} icon={<InboxOutlined />} />
          <KpiCard variant="pending" label="Pending" value={kpiStats.pending} icon={<PendingActionsOutlined />} />
          <KpiCard variant="progress" label="In Progress" value={kpiStats.inProgress} icon={<AutorenewOutlined />} />
          <KpiCard variant="fulfilled" label="Fulfilled" value={kpiStats.fulfilled} icon={<CheckCircleOutline />} />
        </div>
      )}

      <Paper className="requests-list-card rr-manage-card" sx={{ p: 0, overflow: 'hidden' }}>
        <Box className="rr-panel__toolbar">
          <div className="rr-filter-tabs-wrap">
            <div className="rr-filter-tabs">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.value || 'all'}
                  type="button"
                  className={`rr-filter-tab${statusFilter === tab.value ? ' rr-filter-tab--active' : ''}`}
                  onClick={() => handleStatusTab(tab.value)}
                >
                  {tab.label}
                  {tab.value && statusCounts[tab.value] > 0 && (
                    <span className="rr-filter-tab__count">{statusCounts[tab.value]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="rr-search-box">
            <TextField
              size="small"
              placeholder="Search employee, title, code…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplySearch()}
              className="rr-search-field"
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: '#94a3b8' }} />
                  </InputAdornment>
                ),
              }}
            />
            <Button variant="contained" onClick={handleApplySearch} disableElevation>
              Search
            </Button>
            {embedded && (
              <Tooltip title="Refresh">
                <IconButton onClick={() => fetchRequests(true)} disabled={refreshing} size="small">
                  <RefreshIcon className={refreshing ? 'rr-spin' : ''} fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </div>
        </Box>

        {loading ? (
          <Box sx={{ p: 2 }}>
            <TableSkeleton rows={8} columns={5} />
          </Box>
        ) : requests.length === 0 ? (
          <Box className="requests-empty">
            <InboxOutlined sx={{ fontSize: 48, color: '#94a3b8', mb: 1 }} />
            <Typography>
              {search || statusFilter
                ? 'No requests match your filters.'
                : 'New employee resource requests will appear here.'}
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small" className="rr-table">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Employee</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Request</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right" className="rr-table__action-col" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {requests.map((req) => (
                    <TableRow
                      key={req._id}
                      hover
                      className="rr-table__row"
                      sx={{ cursor: 'pointer' }}
                      onClick={() => openDetail(req)}
                    >
                      <TableCell>{formatDate(req.createdAt)}</TableCell>
                      <TableCell>
                        <div className="rr-employee-cell">
                          <UserAvatar user={employeeUser(req)} size="xs" lazy />
                          <div>
                            <div className="rr-employee-cell__name">{req.employeeName}</div>
                            {req.employeeCode && (
                              <div className="rr-employee-cell__code">{req.employeeCode}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{categoryLabel(req)}</TableCell>
                      <TableCell>
                        {formatTitle(req.title)}
                        {req.quantity > 1 && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            Qty {req.quantity}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={req.status}
                          color={statusColor(req.status)}
                          className="requests-status-chip"
                        />
                      </TableCell>
                      <TableCell align="right" className="rr-table__action-col">
                        <ChevronRight sx={{ color: '#cbd5e1', fontSize: 18 }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={totalCount}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[10, 15, 25, 50]}
            />
          </>
        )}
      </Paper>

      <Dialog
        open={detailOpen}
        onClose={() => !updating && setDetailOpen(false)}
        maxWidth="sm"
        fullWidth
        className="resource-request-dialog"
      >
        {selected && (
          <>
            <DialogTitle sx={{ fontWeight: 700 }}>{formatTitle(selected.title)}</DialogTitle>
            <DialogContent>
              <div className="resource-summary-panel">
                <div className="rr-detail-employee">
                  <UserAvatar user={employeeUser(selected)} size="sm" />
                  <div>
                    <Typography className="resource-summary-title">
                      {selected.employeeName}
                      {selected.employeeCode ? ` (${selected.employeeCode})` : ''}
                    </Typography>
                    <Typography className="resource-summary-meta">
                      {selected.department ? `${selected.department} · ` : ''}
                      {categoryLabel(selected)} · Qty {selected.quantity}
                    </Typography>
                  </div>
                </div>
                <div className="resource-summary-chips">
                  <Chip size="small" label={selected.status} color={statusColor(selected.status)} />
                  {selected.priority && (
                    <Chip size="small" variant="outlined" label={`${selected.priority} priority`} />
                  )}
                </div>
              </div>
              <Typography className="resource-form-section-label">Description</Typography>
              <Typography variant="body2" paragraph sx={{ color: '#334155', lineHeight: 1.6, mb: 2 }}>
                {selected.description}
              </Typography>
              {selected.adminNotes && !isEditable && (
                <>
                  <Typography className="resource-form-section-label">Admin notes</Typography>
                  <Typography variant="body2" paragraph sx={{ color: '#334155', lineHeight: 1.6, mb: 2 }}>
                    {selected.adminNotes}
                  </Typography>
                </>
              )}
              {isEditable && (
                <>
                  <Typography className="resource-form-section-label">Update request</Typography>
                  <div className="resource-admin-fields">
                    <TextField
                      select
                      fullWidth
                      variant="outlined"
                      label="Update status"
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <MenuItem key={s} value={s}>{s}</MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      fullWidth
                      variant="outlined"
                      multiline
                      minRows={3}
                      maxRows={6}
                      label="Admin notes (optional)"
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Add context for the employee (delivery date, rejection reason, etc.)"
                      InputLabelProps={{ shrink: true }}
                    />
                  </div>
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailOpen(false)} disabled={updating}>Close</Button>
              {isEditable && (
                <Button variant="contained" onClick={handleUpdateStatus} disabled={updating}>
                  {updating ? 'Saving...' : 'Save'}
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default AdminRequestsPage;
