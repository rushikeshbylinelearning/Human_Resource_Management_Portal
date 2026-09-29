// Employee resource requests (IT tickets and HR queries use the FAB)
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Button, Paper, Typography, TextField, MenuItem, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
} from '@mui/material';
import { Add, Inventory2, BusinessCenter as HRIcon } from '@mui/icons-material';
import api from '../api/axios';
import PageHeroHeader from '../components/PageHeroHeader';
import { TableSkeleton } from '../components/SkeletonLoaders';
import '../styles/RequestsPage.css';

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
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

const RequestsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [requests, setRequests] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [hrFormOpen, setHrFormOpen] = useState(false);
  const [hrDetailOpen, setHrDetailOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestForm, setRequestForm] = useState({
    category: 'Stationery',
    customCategory: '',
    title: '',
    description: '',
    quantity: 1,
    priority: 'medium',
  });

  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const { data } = await api.get('/resource-requests/mine');
      setRequests(data.requests || []);
      setCategories(data.categories || []);
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to load requests.', severity: 'error' });
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    const requestId = searchParams.get('requestId');
    if (!requestId || !requests.length) return;
    const match = requests.find((r) => r._id === requestId);
    if (match) {
      setSelectedRequest(match);
      setHrDetailOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [requests, searchParams, setSearchParams]);

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    setSubmittingRequest(true);
    try {
      await api.post('/resource-requests', requestForm);
      setSnackbar({ open: true, message: 'Request submitted successfully.', severity: 'success' });
      setHrFormOpen(false);
      setRequestForm({
        category: 'Stationery',
        customCategory: '',
        title: '',
        description: '',
        quantity: 1,
        priority: 'medium',
      });
      fetchRequests();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to submit request.', severity: 'error' });
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleRequestCancel = async (id) => {
    try {
      await api.patch(`/resource-requests/${id}/cancel`);
      setSnackbar({ open: true, message: 'Request cancelled.', severity: 'success' });
      setHrDetailOpen(false);
      fetchRequests();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to cancel.', severity: 'error' });
    }
  };

  const categoryLabel = (req) => {
    if (req.category === 'Other' && req.customCategory) return req.customCategory;
    return req.category?.replace(/_/g, ' ') || req.category;
  };

  return (
    <Box className="requests-page">
      <PageHeroHeader
        eyebrow="Workplace"
        title="Requests"
        description="Submit resource requests for stationery, IT hardware, furniture, and other workplace items. Use the + button for HR queries and IT tickets."
        icon={<Inventory2 />}
        actionArea={
          <Button variant="contained" size="large" startIcon={<Add />} onClick={() => setHrFormOpen(true)}>
            New Request
          </Button>
        }
      />

      <Paper elevation={0} className="requests-table-panel" sx={{ mt: 2 }}>
        {loadingRequests ? (
          <TableSkeleton rows={5} columns={5} />
        ) : requests.length === 0 ? (
          <Box className="requests-empty">
            <HRIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 1 }} />
            <Typography>No requests yet. Click &quot;New Request&quot; to get started.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Qty</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {requests.map((req) => (
                  <TableRow
                    key={req._id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => { setSelectedRequest(req); setHrDetailOpen(true); }}
                  >
                    <TableCell>{new Date(req.createdAt).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>{categoryLabel(req)}</TableCell>
                    <TableCell>{req.title}</TableCell>
                    <TableCell>{req.quantity}</TableCell>
                    <TableCell>
                      <Chip size="small" label={req.status} color={statusColor(req.status)} className="requests-status-chip" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog
        open={hrFormOpen}
        onClose={() => !submittingRequest && setHrFormOpen(false)}
        maxWidth="sm"
        fullWidth
        className="resource-request-dialog"
      >
        <DialogTitle>
          New Resource Request
          <Typography component="span" className="resource-dialog-subtitle">
            Fill in the details below. All fields marked with * are required.
          </Typography>
        </DialogTitle>
        <form onSubmit={handleRequestSubmit}>
          <DialogContent>
            <Typography className="resource-form-section-label">Request details</Typography>
            <div className="resource-form-grid">
              <TextField
                select
                fullWidth
                variant="outlined"
                label="Category"
                value={requestForm.category}
                onChange={(e) => setRequestForm((f) => ({ ...f, category: e.target.value }))}
                required
                InputLabelProps={{ shrink: true }}
              >
                {(categories.length ? categories : ['Stationery', 'IT_Hardware', 'Furniture', 'Office Supplies', 'Other']).map((c) => (
                  <MenuItem key={c} value={c}>{c.replace(/_/g, ' ')}</MenuItem>
                ))}
              </TextField>
              {requestForm.category === 'Other' && (
                <TextField
                  fullWidth
                  variant="outlined"
                  label="Specify request type"
                  value={requestForm.customCategory}
                  onChange={(e) => setRequestForm((f) => ({ ...f, customCategory: e.target.value }))}
                  required
                  InputLabelProps={{ shrink: true }}
                />
              )}
              <TextField
                fullWidth
                variant="outlined"
                label="Title"
                value={requestForm.title}
                onChange={(e) => setRequestForm((f) => ({ ...f, title: e.target.value }))}
                required
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                fullWidth
                variant="outlined"
                multiline
                minRows={4}
                label="Description"
                value={requestForm.description}
                onChange={(e) => setRequestForm((f) => ({ ...f, description: e.target.value }))}
                required
                InputLabelProps={{ shrink: true }}
              />
              <div className="resource-form-row">
                <TextField
                  type="number"
                  label="Quantity"
                  value={requestForm.quantity}
                  onChange={(e) => setRequestForm((f) => ({ ...f, quantity: e.target.value }))}
                  inputProps={{ min: 1, max: 999 }}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  select
                  label="Priority"
                  value={requestForm.priority}
                  onChange={(e) => setRequestForm((f) => ({ ...f, priority: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                >
                  {PRIORITIES.map((p) => (
                    <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                  ))}
                </TextField>
              </div>
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setHrFormOpen(false)} disabled={submittingRequest}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submittingRequest}>
              {submittingRequest ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={hrDetailOpen} onClose={() => setHrDetailOpen(false)} maxWidth="sm" fullWidth className="resource-request-dialog">
        {selectedRequest && (
          <>
            <DialogTitle>{selectedRequest.title}</DialogTitle>
            <DialogContent>
              <div className="resource-summary-panel">
                <Typography className="resource-summary-meta">
                  {categoryLabel(selectedRequest)} · Qty {selectedRequest.quantity} · {selectedRequest.priority} priority
                </Typography>
                <Chip size="small" label={selectedRequest.status} color={statusColor(selectedRequest.status)} />
              </div>
              <Typography variant="body2" paragraph sx={{ mt: 2 }}>{selectedRequest.description}</Typography>
              {selectedRequest.adminNotes && (
                <Typography variant="body2" color="text.secondary">Admin notes: {selectedRequest.adminNotes}</Typography>
              )}
            </DialogContent>
            <DialogActions>
              {selectedRequest.status === 'Pending' && (
                <Button color="error" onClick={() => handleRequestCancel(selectedRequest._id)}>Cancel Request</Button>
              )}
              <Button onClick={() => setHrDetailOpen(false)}>Close</Button>
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

export default RequestsPage;
