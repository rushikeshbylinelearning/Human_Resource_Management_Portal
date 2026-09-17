// frontend/src/components/employeeDocuments/DocumentTemplateEditorDialog.jsx
// Modal editor for creating/updating a DocumentTemplate for one of the 4 built-in types.
// Follows the existing MUI Dialog pattern used throughout the project.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Typography, Box, Stack, Chip,
    Select, MenuItem, FormControl, InputLabel, Switch, FormControlLabel,
    IconButton, Alert, CircularProgress, Tooltip, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import api from '../../api/axios';

// Available tokens that can be inserted into the boilerplate
const TOKENS = [
    { key: 'employee_name', label: 'Employee Name' },
    { key: 'employee_code', label: 'Employee Code' },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' },
    { key: 'join_date', label: 'Joining Date' },
    { key: 'employment_status', label: 'Employment Status' },
    { key: 'probation_start_date', label: 'Probation Start Date' },
    { key: 'probation_end_date', label: 'Probation End Date' },
    { key: 'probation_duration_months', label: 'Probation Duration (months)' },
    { key: 'confirmation_date', label: 'Confirmation Date' },
    { key: 'manager_name', label: 'Manager Name' },
];

// Employee fields available for autoFillFrom
const AUTO_FILL_OPTIONS = [
    { value: '', label: 'None (manual entry)' },
    { value: 'employee_name', label: 'Employee Name' },
    { value: 'employee_code', label: 'Employee Code' },
    { value: 'designation', label: 'Designation' },
    { value: 'department', label: 'Department' },
    { value: 'join_date', label: 'Joining Date' },
    { value: 'employment_status', label: 'Employment Status' },
    { value: 'probation_start_date', label: 'Probation Start Date' },
    { value: 'probation_end_date', label: 'Probation End Date' },
    { value: 'probation_duration_months', label: 'Probation Duration (months)' },
    { value: 'confirmation_date', label: 'Confirmation Date' },
    { value: 'manager_name', label: 'Manager Name' },
];

const primaryBtnSx = {
    background: 'linear-gradient(135deg, #E53935 0%, #C62828 100%)',
    textTransform: 'none',
    fontWeight: 600,
    borderRadius: '10px',
    boxShadow: 'none',
    '&:hover': { background: 'linear-gradient(135deg, #C62828 0%, #B71C1C 100%)', boxShadow: 'none' },
};

const TYPE_LABELS = {
    joining_letter: 'Joining Letter',
    kra: 'KRA Letter',
    probation_confirmation: 'Probation Confirmation',
    probation_extension: 'Probation Extension',
};

export default function DocumentTemplateEditorDialog({ open, onClose, documentType, onSaved }) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [boilerplateHtml, setBoilerplateHtml] = useState('');
    const [fields, setFields] = useState([]);
    const [notesFieldLabel, setNotesFieldLabel] = useState('');
    const [includeNotes, setIncludeNotes] = useState(false);
    const [currentVersion, setCurrentVersion] = useState(null);

    const bodyRef = useRef(null);

    // Load existing template when dialog opens
    useEffect(() => {
        if (!open || !documentType) return;
        setError('');
        setSuccess('');
        setLoading(true);

        api.get(`/employee-documents/templates/${documentType}`)
            .then(({ data }) => {
                const t = data.template;
                if (t) {
                    setBoilerplateHtml(t.boilerplateHtml || '');
                    setFields((t.fieldsSchema || []).map((f, i) => ({ ...f, _id: `f_${i}_${Date.now()}` })));
                    const nl = t.notesFieldLabel || '';
                    setNotesFieldLabel(nl);
                    setIncludeNotes(!!nl);
                    setCurrentVersion(t.version);
                } else {
                    setBoilerplateHtml('');
                    setFields([]);
                    setNotesFieldLabel('');
                    setIncludeNotes(false);
                    setCurrentVersion(null);
                }
            })
            .catch(() => setError('Failed to load existing template.'))
            .finally(() => setLoading(false));
    }, [open, documentType]);

    const insertToken = useCallback((tokenKey) => {
        const ta = bodyRef.current;
        if (!ta) {
            setBoilerplateHtml((prev) => prev + `{{${tokenKey}}}`);
            return;
        }
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const token = `{{${tokenKey}}}`;
        setBoilerplateHtml((prev) => prev.slice(0, start) + token + prev.slice(end));
        // Restore cursor position after state update
        requestAnimationFrame(() => {
            ta.selectionStart = ta.selectionEnd = start + token.length;
            ta.focus();
        });
    }, []);

    const addField = () => {
        setFields((prev) => [
            ...prev,
            {
                _id: `f_new_${Date.now()}`,
                key: '',
                label: '',
                type: 'text',
                autoFillFrom: '',
                required: false,
            },
        ]);
    };

    const removeField = (id) => setFields((prev) => prev.filter((f) => f._id !== id));

    const moveField = (id, dir) => {
        setFields((prev) => {
            const idx = prev.findIndex((f) => f._id === id);
            if (idx < 0) return prev;
            const next = [...prev];
            const swapIdx = idx + dir;
            if (swapIdx < 0 || swapIdx >= next.length) return prev;
            [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
            return next;
        });
    };

    const updateField = (id, key, value) => {
        setFields((prev) =>
            prev.map((f) => {
                if (f._id !== id) return f;
                const updated = { ...f, [key]: value };
                // Auto-generate key from label if key is still empty
                if (key === 'label' && !f.key) {
                    updated.key = value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                }
                return updated;
            })
        );
    };

    const handleSave = async () => {
        setError('');
        setSuccess('');

        // Validate fields
        for (const f of fields) {
            if (!f.key.trim()) { setError('All fields must have a key.'); return; }
            if (!f.label.trim()) { setError('All fields must have a label.'); return; }
        }
        const keys = fields.map((f) => f.key.trim());
        if (new Set(keys).size !== keys.length) {
            setError('Field keys must be unique.');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                boilerplateHtml,
                fieldsSchema: fields.map((f) => ({
                    key: f.key.trim(),
                    label: f.label.trim(),
                    type: f.type,
                    autoFillFrom: f.autoFillFrom || null,
                    required: !!f.required,
                })),
                notesFieldLabel: includeNotes ? (notesFieldLabel || 'Additional Notes') : '',
            };

            const { data } = await api.put(`/employee-documents/templates/${documentType}`, payload);
            setCurrentVersion(data.template.version);
            setSuccess(`Template saved as version ${data.template.version}.`);
            onSaved?.();
        } catch (e) {
            setError(e.response?.data?.error || 'Failed to save template.');
        } finally {
            setSaving(false);
        }
    };

    const typeLabel = TYPE_LABELS[documentType] || documentType;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{ sx: { height: '90vh', borderRadius: 3, display: 'flex', flexDirection: 'column' } }}
        >
            <DialogTitle sx={{ fontWeight: 700, pb: 1, borderBottom: '1px solid #e2e8f0' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                            Manage Template — {typeLabel}
                        </Typography>
                        {currentVersion && (
                            <Typography variant="caption" sx={{ color: '#C62828' }}>
                                Current: v{currentVersion} (active) · Saving creates a new version
                            </Typography>
                        )}
                        {!currentVersion && !loading && (
                            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                No template configured yet
                            </Typography>
                        )}
                    </Box>
                </Box>
            </DialogTitle>

            <DialogContent sx={{ flex: 1, overflowY: 'auto', py: 2.5 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                        <CircularProgress size={28} sx={{ color: '#E53935' }} />
                    </Box>
                ) : (
                    <Stack spacing={3}>
                        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
                        {success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}

                        {/* ── Section 1: Boilerplate body ──────────────────── */}
                        <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b', mb: 0.5 }}>
                                Letter Body (Boilerplate)
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 1 }}>
                                Write the fixed letter text. Click a token button to insert a merge field at cursor position.
                            </Typography>

                            {/* Token inserter */}
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
                                {TOKENS.map((t) => (
                                    <Chip
                                        key={t.key}
                                        label={`+ ${t.label}`}
                                        size="small"
                                        onClick={() => insertToken(t.key)}
                                        sx={{
                                            fontSize: '0.72rem',
                                            cursor: 'pointer',
                                            borderColor: '#c7d2fe',
                                            background: '#eef2ff',
                                            color: '#4338ca',
                                            fontWeight: 500,
                                            '&:hover': { background: '#e0e7ff' },
                                        }}
                                        variant="outlined"
                                    />
                                ))}
                            </Box>

                            <TextField
                                inputRef={bodyRef}
                                multiline
                                minRows={8}
                                maxRows={18}
                                fullWidth
                                value={boilerplateHtml}
                                onChange={(e) => setBoilerplateHtml(e.target.value)}
                                placeholder="Dear {{employee_name}},&#10;&#10;We are pleased to confirm your joining at [Company Name] as {{designation}} in the {{department}} department, effective {{join_date}}.&#10;&#10;..."
                                sx={{
                                    '& .MuiInputBase-root': { fontFamily: 'monospace', fontSize: '0.875rem' },
                                }}
                            />
                        </Box>

                        <Divider />

                        {/* ── Section 2: Structured fields ─────────────────── */}
                        <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                <Box>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
                                        Variable Fields
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                                        Fields the admin fills in at assignment time. Auto-fill maps to the employee profile.
                                    </Typography>
                                </Box>
                                <Button
                                    size="small"
                                    startIcon={<AddIcon />}
                                    onClick={addField}
                                    variant="outlined"
                                    sx={{ textTransform: 'none', borderColor: '#c7d2fe', color: '#4338ca', whiteSpace: 'nowrap' }}
                                >
                                    Add Field
                                </Button>
                            </Box>

                            {fields.length === 0 && (
                                <Box sx={{ p: 2, background: '#f8fafc', borderRadius: 2, textAlign: 'center' }}>
                                    <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                                        No variable fields. Click "Add Field" to add inputs the admin fills per employee.
                                    </Typography>
                                </Box>
                            )}

                            <Stack spacing={1.5}>
                                {fields.map((field, idx) => (
                                    <Box
                                        key={field._id}
                                        sx={{
                                            p: 1.5,
                                            border: '1px solid #e2e8f0',
                                            borderRadius: 2,
                                            background: '#fafafa',
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                display: 'grid',
                                                gridTemplateColumns: {
                                                    xs: 'minmax(0, 1fr)',
                                                    sm: 'repeat(2, minmax(0, 1fr))',
                                                    lg: 'minmax(0, 1fr) minmax(0, 1fr) 140px 140px auto auto auto',
                                                },
                                                gap: 1,
                                                alignItems: 'flex-start',
                                            }}
                                        >
                                            <TextField
                                                size="small"
                                                label="Label"
                                                value={field.label}
                                                onChange={(e) => updateField(field._id, 'label', e.target.value)}
                                                required
                                            />
                                            <TextField
                                                size="small"
                                                label="Key"
                                                value={field.key}
                                                onChange={(e) => updateField(field._id, 'key', e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                                                placeholder="e.g. salary_amount"
                                                required
                                            />
                                            <FormControl size="small">
                                                <InputLabel>Type</InputLabel>
                                                <Select
                                                    value={field.type}
                                                    label="Type"
                                                    onChange={(e) => updateField(field._id, 'type', e.target.value)}
                                                >
                                                    <MenuItem value="text">Text</MenuItem>
                                                    <MenuItem value="date">Date</MenuItem>
                                                    <MenuItem value="textarea">Textarea</MenuItem>
                                                </Select>
                                            </FormControl>
                                            <FormControl size="small">
                                                <InputLabel>Auto-fill From</InputLabel>
                                                <Select
                                                    value={field.autoFillFrom || ''}
                                                    label="Auto-fill From"
                                                    onChange={(e) => updateField(field._id, 'autoFillFrom', e.target.value)}
                                                >
                                                    {AUTO_FILL_OPTIONS.map((o) => (
                                                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                            <FormControlLabel
                                                sx={{ m: 0, whiteSpace: 'nowrap' }}
                                                control={
                                                    <Switch
                                                        size="small"
                                                        checked={!!field.required}
                                                        onChange={(e) => updateField(field._id, 'required', e.target.checked)}
                                                    />
                                                }
                                                label={<Typography variant="caption">Required</Typography>}
                                            />
                                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                <Tooltip title="Move up">
                                                    <span>
                                                        <IconButton size="small" onClick={() => moveField(field._id, -1)} disabled={idx === 0}>
                                                            <ArrowUpwardIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                                <Tooltip title="Move down">
                                                    <span>
                                                        <IconButton size="small" onClick={() => moveField(field._id, 1)} disabled={idx === fields.length - 1}>
                                                            <ArrowDownwardIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </Box>
                                            <Tooltip title="Remove field">
                                                <IconButton size="small" onClick={() => removeField(field._id)} sx={{ color: '#ef4444' }}>
                                                    <DeleteOutlineIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </Box>
                                ))}
                            </Stack>
                        </Box>

                        <Divider />

                        {/* ── Section 3: Notes section toggle ──────────────── */}
                        <Box>
                            <FormControlLabel
                                sx={{ ml: 0 }}
                                control={
                                    <Switch
                                        checked={includeNotes}
                                        onChange={(e) => setIncludeNotes(e.target.checked)}
                                    />
                                }
                                label={
                                    <Box>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
                                            Include Notes Section
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                                            Shows a single free-text area for additional content at assignment time.
                                        </Typography>
                                    </Box>
                                }
                            />
                            {includeNotes && (
                                <TextField
                                    size="small"
                                    label="Notes Section Label"
                                    value={notesFieldLabel}
                                    onChange={(e) => setNotesFieldLabel(e.target.value)}
                                    placeholder="Additional Notes"
                                    sx={{ mt: 1.5, maxWidth: 360 }}
                                    helperText="This label appears above the free-text notes box at assignment time."
                                />
                            )}
                        </Box>

                        {/* Version info notice */}
                        <Alert severity="info" icon={<InfoOutlinedIcon fontSize="small" />} sx={{ fontSize: '0.8rem' }}>
                            Saving creates a <strong>new version</strong> — it does not modify any previously issued documents.
                            Old versions are kept for audit.
                        </Alert>
                    </Stack>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2, borderTop: '1px solid #e2e8f0', gap: 1 }}>
                <Button onClick={onClose} sx={{ textTransform: 'none' }}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={saving || loading}
                    sx={primaryBtnSx}
                >
                    {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Save Template'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
