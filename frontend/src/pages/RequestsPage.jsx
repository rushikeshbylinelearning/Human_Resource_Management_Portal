// Employee HR resource requests + IT support tickets
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Button, Paper, Typography, TextField, MenuItem, Chip, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
} from '@mui/material';
import { Add, Inventory2, BusinessCenter as HRIcon, SupportAgent as ITIcon } from '@mui/icons-material';
import api from '../api/axios';
import PageHeroHeader from '../components/PageHeroHeader';
import ITTicketForm from '../components/ITSupport/ITTicketForm';
import ITTicketDetailsModal from '../components/ITSupport/ITTicketDetailsModal';
import { TableSkeleton } from '../components/SkeletonLoaders';
import { formatISTDate } from '../utils/istTime';
import socket from '../socket';
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

const itStatusColor = (status) => {
  const s = (status || '').toUpperCase();
  if (s === 'OPEN' || s === 'PENDING') return 'warning';
  if (s.includes('PROGRESS')) return 'info';
  if (s === 'RESOLVED' || s === 'CLOSED') return 'success';
  return 'default';
};

const formatITStatus = (status) => {
  return status?.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ') || '';
};

const RequestsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState(0);
  const [requests, setRequests] = useState([]);
  const [itTickets, setItTickets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [hrFormOpen, setHrFormOpen] = useState(false);
  const [itFormOpen, setItFormOpen] = useState(false);
  const [hrDetailOpen, setHrDetailOpen] = useState(false);
  const [itDetailOpen, setItDetailOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
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

  const fetchITTickets = useCallback(async () => {
    setLoadingTickets(true);
    try {
      const { data } = await api.get('/it-support/tickets/mine');
      setItTickets(data.tickets || []);
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to load IT tickets.', severity: 'error' });
    } finally {
      setLoadingTickets(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
    fetchITTickets();
  }, [fetchRequests, fetchITTickets]);

  useEffect(() => {
    const requestId = searchParams.get('requestId');
    const ticketId = searchParams.get('ticketId');
    
    if (requestId && requests.length) {
      const match = requests.find((r) => r._id === requestId);
      if (match) {
        setSelectedRequest(match);
        setHrDetailOpen(true);
        setActiveTab(0);
        setSearchParams({}, { replace: true });
      }
    }
    
    if (ticketId && itTickets.length) {
      const match = itTickets.find((t) => t._id === ticketId);
      if (match) {
        setSelectedTicket(match);
        setItDetailOpen(true);
        setActiveTab(1);
        setSearchParams({}, { replace: true });
      }
    }
  }, [requests, itTickets, searchParams, setSearchParams]);

  // Real-time socket updates for IT tickets
  useEffect(() => {
    const handleTicketUpdate = (data) => {
      // Update the ticket in the list
      setItTickets(prev => prev.map(ticket => 
        ticket._id === data.ticketId ? { ...ticket, ...data.ticket } : ticket
      ));
      
      // Update selected ticket if it's the one being viewed
      if (selectedTicket && selectedTicket._id === data.ticketId) {
        setSelectedTicket(prev => ({ ...prev, ...data.ticket }));
      }
    };

    socket.on('it_ticket_updated', handleTicketUpdate);

    return () => {
      socket.off('it_ticket_updated', handleTicketUpdate);
    };
  }, [selectedTicket]);

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
        description="Submit HR resource requests for stationery, furniture, and workplace items, or raise IT support tickets for technical issues."
        icon={<Inventory2 />}
        actionArea={
          <Box className="requests-header-actions">
            <Button
              variant="contained"
              size="large"
              startIcon={<Add />}
              onClick={() => setHrFormOpen(true)}
              className="requests-btn-hr"
            >
              HR Request
            </Button>
            <Button
              variant="contained"
              size="large"
              startIcon={<ITIcon />}
              onClick={() => setItFormOpen(true)}
              className="requests-btn-it"
            >
              IT Request
            </Button>
          </Box>
        }
      />

      <Paper elevation={0} className="requests-table-panel" sx={{ mt: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          <Tab icon={<HRIcon />} label="HR Requests" iconPosition="start" />
          <Tab icon={<ITIcon />} label="IT Requests" iconPosition="start" />
        </Tabs>

        {activeTab === 0 && (
          loadingRequests ? (
            <TableSkeleton rows={5} columns={5} />
          ) : requests.length === 0 ? (
            <Box className="requests-empty">
              <HRIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 1 }} />
              <Typography>No HR requests yet. Click &quot;HR Request&quot; to get started.</Typography>
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
          )
        )}

        {activeTab === 1 && (
          loadingTickets ? (
            <TableSkeleton rows={5} columns={5} />
          ) : itTickets.length === 0 ? (
            <Box className="requests-empty">
              <ITIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 1 }} />
              <Typography>No IT requests yet. Click &quot;IT Request&quot; to get started.</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Ticket ID</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Title</TableCell>
                    <TableCell>Priority</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {itTickets.map((ticket) => {
                    const isUnresolved = ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED';
                    return (
                      <TableRow
                        key={ticket._id}
                        hover
                        sx={{ 
                          cursor: 'pointer',
                          backgroundColor: isUnresolved ? '#FEF3F3' : 'inherit',
                          borderLeft: isUnresolved ? '3px solid #C62828' : '3px solid transparent',
                          '&:hover': {
                            backgroundColor: isUnresolved ? '#FDDEDE !important' : undefined,
                          },
                        }}
                        onClick={() => { setSelectedTicket(ticket); setItDetailOpen(true); }}
                      >
                      <TableCell>{formatISTDate(ticket.createdAt)}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{ticket.ticketId}</TableCell>
                      <TableCell>{ticket.category}</TableCell>
                      <TableCell>{ticket.title}</TableCell>
                      <TableCell>
                        <Chip size="small" label={ticket.priority} color={itStatusColor(ticket.priority)} />
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={formatITStatus(ticket.status)} color={itStatusColor(ticket.status)} className="requests-status-chip" />
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )
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
          New HR Request
          <Typography component="span" className="resource-dialog-subtitle">
            Resource request for HR (stationery, furniture, supplies, etc.). Required fields are marked with *.
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
              {submittingRequest ? 'Submitting...' : 'Submit HR Request'}
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

      <ITTicketForm
        open={itFormOpen}
        onClose={() => setItFormOpen(false)}
        onSuccess={(ticket) => {
          setItFormOpen(false);
          setSnackbar({
            open: true,
            message: ticket?.ticketId
              ? `IT ticket ${ticket.ticketId} created successfully.`
              : 'IT request submitted successfully.',
            severity: 'success',
          });
          fetchITTickets();
        }}
      />

      <ITTicketDetailsModal
        open={itDetailOpen}
        onClose={() => setItDetailOpen(false)}
        ticket={selectedTicket}
        onUpdate={(updatedTicket) => {
          if (updatedTicket) {
            setItTickets(prev => prev.map(t => t._id === updatedTicket._id ? updatedTicket : t));
            setSelectedTicket(updatedTicket);
          } else {
            fetchITTickets();
          }
        }}
        isAdmin={false}
      />

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default RequestsPage;
