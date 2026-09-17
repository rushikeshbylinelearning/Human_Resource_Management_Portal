import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Drawer,
  Box,
  Typography,
  TextField,
  Button,
  MenuItem,
  CircularProgress,
  Alert,
  Autocomplete
} from '@mui/material';
import api from '../../api/axios';
import LazyDatePicker from '../lazy/LazyDatePicker';
import { CIF_CATEGORIES, CIF_SEVERITIES, CIF_STATUSES, STATUS_TRANSITIONS } from '../../constants/cifConstants';

const CATEGORIES = CIF_CATEGORIES;
const SEVERITIES = CIF_SEVERITIES;
const STATUSES = CIF_STATUSES;

const CIFDrawer = ({ open, onClose, mode, record, onSaveSuccess, hideEmployeeField = false }) => {
  const [formData, setFormData] = useState({
    employeeId: null,
    title: '',
    category: '',
    severity: '',
    description: '',
    incidentDate: null,
    status: 'open',
    assignedTo: null,
    followUpDate: null,
    resolutionNotes: '',
    confidentialLevel: 'internal'
  });
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [errors, setErrors] = useState({});

  const isReadOnly = mode === 'view';
  const isEdit = mode === 'edit';

  // Memoize fetch function
  const fetchEmployees = useCallback(async () => {
    try {
      setLoadingEmployees(true);
      const response = await api.get('/admin/employees', { params: { all: 'true' } });
      // Ensure response.data is an array
      setEmployees(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Error fetching employees:', err);
      setEmployees([]); // Set empty array on error
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  // Fetch employees
  useEffect(() => {
    if (open && employees.length === 0) {
      fetchEmployees();
    }
  }, [open, employees.length, fetchEmployees]);

  // Load record data
  useEffect(() => {
    if (record && (mode === 'edit' || mode === 'view')) {
      setFormData({
        employeeId: record.employeeId?._id || record.employeeId || null,
        title: record.title || '',
        category: record.category || '',
        severity: record.severity || '',
        description: record.description || '',
        incidentDate: record.incidentDate ? new Date(record.incidentDate) : null,
        status: record.status || 'open',
        assignedTo: record.assignedTo?._id || null,
        followUpDate: record.followUpDate ? new Date(record.followUpDate) : null,
        resolutionNotes: record.resolutionNotes || '',
        confidentialLevel: record.confidentialLevel || 'internal'
      });
    } else if (mode === 'create') {
      setFormData({
        employeeId: record?.employeeId || null,
        title: '',
        category: '',
        severity: '',
        description: '',
        incidentDate: null,
        status: 'open',
        assignedTo: null,
        followUpDate: null,
        resolutionNotes: '',
        confidentialLevel: 'internal'
      });
    }
    setError(null);
    setErrors({});
  }, [record, mode, open]);

  const validate = useCallback(() => {
    const newErrors = {};
    if (!formData.employeeId) newErrors.employeeId = 'Employee is required';
    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (!formData.category) newErrors.category = 'Category is required';
    if (!formData.severity) newErrors.severity = 'Severity is required';
    if (!formData.description.trim()) newErrors.description = 'Description is required';
    if (!formData.incidentDate) newErrors.incidentDate = 'Incident date is required';
    if (formData.incidentDate && formData.incidentDate > new Date()) {
      newErrors.incidentDate = 'Incident date cannot be in the future';
    }
    
    // Validate status transitions
    if (isEdit && record?.status) {
      const currentStatus = record.status;
      const newStatus = formData.status;
      const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
      
      if (newStatus !== currentStatus && !allowedTransitions.includes(newStatus)) {
        newErrors.status = `Cannot transition from ${currentStatus} to ${newStatus}`;
      }
    }
    
    // Require resolution notes when closing
    if (formData.status === 'closed' && !formData.resolutionNotes?.trim()) {
      newErrors.resolutionNotes = 'Resolution notes are required before closing the case';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, isEdit, record?.status]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;

    try {
      setSaving(true);
      setError(null);

      const payload = {
        employeeId: formData.employeeId,
        title: formData.title.trim(),
        category: formData.category,
        severity: formData.severity,
        description: formData.description.trim(),
        incidentDate: formData.incidentDate,
        status: formData.status,
        assignedTo: formData.assignedTo || undefined,
        followUpDate: formData.followUpDate || undefined,
        resolutionNotes: formData.resolutionNotes?.trim() || undefined,
        confidentialLevel: formData.confidentialLevel
      };

      if (isEdit) {
        await api.put(`/admin/cif/${record._id}`, payload);
      } else {
        await api.post('/admin/cif', payload);
      }

      onSaveSuccess();
    } catch (err) {
      console.error('Error saving CIF:', err);
      setError(err.response?.data?.error || 'Failed to save record');
    } finally {
      setSaving(false);
    }
  }, [validate, formData, isEdit, record, onSaveSuccess]);

  const selectedEmployee = useMemo(() => {
    return Array.isArray(employees) ? employees.find(emp => emp._id === formData.employeeId) || null : null;
  }, [employees, formData.employeeId]);

  const selectedAssignee = useMemo(() => {
    return Array.isArray(employees) ? employees.find(emp => emp._id === formData.assignedTo) || null : null;
  }, [employees, formData.assignedTo]);

  // Get available statuses based on current status and mode
  const availableStatuses = useMemo(() => {
    if (mode === 'create') {
      // For new records, allow draft and open
      return STATUSES.filter(s => ['draft', 'open'].includes(s.value));
    }
    
    if (isEdit && record?.status) {
      // For editing, show current status + allowed transitions
      const currentStatus = record.status;
      const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
      
      return STATUSES.filter(s => 
        s.value === currentStatus || allowedTransitions.includes(s.value)
      );
    }
    
    // Default: show all statuses
    return STATUSES;
  }, [mode, isEdit, record?.status]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 500 } } }}
    >
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
          {mode === 'create' ? 'New CIF Record' : mode === 'edit' ? 'Edit CIF Record' : 'View CIF Record'}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Employee - Only show if not hidden */}
          {!hideEmployeeField && (
            <Autocomplete
              options={employees}
              getOptionLabel={(option) => `${option.fullName || 'Unknown'} (${option.employeeCode || 'N/A'})`}
              value={selectedEmployee}
              onChange={(e, newValue) => setFormData({ ...formData, employeeId: newValue?._id || null })}
              loading={loadingEmployees}
              disabled={isReadOnly}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Employee"
                  required
                  error={!!errors.employeeId}
                  helperText={errors.employeeId}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingEmployees ? <CircularProgress size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    )
                  }}
                />
              )}
            />
          )}

          {/* Title */}
          <TextField
            label="Title"
            required
            fullWidth
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            disabled={isReadOnly}
            error={!!errors.title}
            helperText={errors.title}
          />

          {/* Category */}
          <TextField
            select
            label="Category"
            required
            fullWidth
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            disabled={isReadOnly}
            error={!!errors.category}
            helperText={errors.category}
          >
            {CATEGORIES.map((cat) => (
              <MenuItem key={cat.value} value={cat.value}>
                {cat.label}
              </MenuItem>
            ))}
          </TextField>

          {/* Severity */}
          <TextField
            select
            label="Severity"
            required
            fullWidth
            value={formData.severity}
            onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
            disabled={isReadOnly}
            error={!!errors.severity}
            helperText={errors.severity}
          >
            {SEVERITIES.map((sev) => (
              <MenuItem key={sev.value} value={sev.value}>
                {sev.label}
              </MenuItem>
            ))}
          </TextField>

          {/* Incident Date */}
          <LazyDatePicker
              label="Incident Date"
              value={formData.incidentDate}
              onChange={(date) => setFormData({ ...formData, incidentDate: date })}
              disabled={isReadOnly}
              maxDate={new Date()}
              slotProps={{
                textField: {
                  required: true,
                  fullWidth: true,
                  error: !!errors.incidentDate,
                  helperText: errors.incidentDate
                }
              }}
            />

          {/* Description */}
          <TextField
            label="Description"
            required
            fullWidth
            multiline
            rows={4}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            disabled={isReadOnly}
            error={!!errors.description}
            helperText={errors.description}
          />

          {/* Resolution Notes */}
          <TextField
            label="Resolution Notes"
            fullWidth
            multiline
            rows={3}
            value={formData.resolutionNotes}
            onChange={(e) => setFormData({ ...formData, resolutionNotes: e.target.value })}
            disabled={isReadOnly}
            required={formData.status === 'closed'}
            error={!!errors.resolutionNotes}
            helperText={
              errors.resolutionNotes || 
              (formData.status === 'closed' 
                ? 'Required before closing the case' 
                : 'Optional - Add notes about resolution or actions taken')
            }
          />

          {/* Assigned To */}
          <Autocomplete
            options={employees}
            getOptionLabel={(option) => `${option.fullName || 'Unknown'} (${option.employeeCode || 'N/A'})`}
            value={selectedAssignee}
            onChange={(e, newValue) => setFormData({ ...formData, assignedTo: newValue?._id || null })}
            loading={loadingEmployees}
            disabled={isReadOnly}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Assigned To"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingEmployees ? <CircularProgress size={20} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  )
                }}
              />
            )}
          />

          {/* Follow-up Date */}
          <LazyDatePicker
              label="Follow-up Date"
              value={formData.followUpDate}
              onChange={(date) => setFormData({ ...formData, followUpDate: date })}
              disabled={isReadOnly}
              slotProps={{
                textField: {
                  fullWidth: true
                }
              }}
            />

          {/* Status */}
          <TextField
            select
            label="Status"
            fullWidth
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            disabled={isReadOnly}
            error={!!errors.status}
            helperText={
              errors.status ||
              (isEdit && record?.status 
                ? `Current: ${STATUSES.find(s => s.value === record.status)?.label || record.status}` 
                : 'Select initial status')
            }
          >
            {availableStatuses.map((status) => (
              <MenuItem key={status.value} value={status.value}>
                {status.label}
              </MenuItem>
            ))}
          </TextField>

          {/* Actions */}
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <Button
              variant="outlined"
              fullWidth
              onClick={onClose}
              disabled={saving}
            >
              {isReadOnly ? 'Close' : 'Cancel'}
            </Button>
            {!isReadOnly && (
              <Button
                variant="contained"
                fullWidth
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <CircularProgress size={24} /> : 'Save'}
              </Button>
            )}
          </Box>
        </Box>
      </Box>
    </Drawer>
  );
};

export default CIFDrawer;
