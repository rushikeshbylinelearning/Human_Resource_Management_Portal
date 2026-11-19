// frontend/src/components/employeeDocuments/DocumentTemplateEditorDialog.jsx
// Modal editor for creating/updating a DocumentTemplate for one of the 4 built-in types.
// Follows the existing MUI Dialog pattern used throughout the project.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Typography, Box, Stack, Chip,
    Select, MenuItem, FormControl, InputLabel, Switch, FormControlLabel,
    IconButton, Alert, CircularProgress, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import api from '../../api/axios';
import {
    RED, RED_DARK, RED_BG, RED_LIGHT, TEXT, MUTED, BORDER, SURFACE, FONT,
    INFO_BG, INFO_TEXT,
    primaryBtnSx, outlineBtnSx, ghostBtnSx, fieldSx, iconBoxSx,
} from '../../theme/policiesPageTheme';

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

const TYPE_LABELS = {
    joining_letter: 'Joining Letter',
    kra: 'KRA Letter',
    probation_confirmation: 'Probation Confirmation',
    probation_extension: 'Probation Extension',
};

const sectionLabelSx = {
    fontWeight: 700,
    fontSize: '0.9rem',
    color: TEXT,
    fontFamily: FONT,
    letterSpacing: '-0.01em',
};

const sectionHintSx = {
    fontSize: '0.78rem',
    color: MUTED,
    fontFamily: FONT,
    display: 'block',
    lineHeight: 1.5,
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
            PaperProps={{
                sx: {
                    height: '88vh',
                    maxHeight: '88vh',
                    borderRadius: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    fontFamily: FONT,
                    overflow: 'hidden',
                },
            }}
        >
            <DialogTitle sx={{ px: 3, pt: 2.5, pb: 2, borderBottom: `1px solid ${BORDER}` }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Box sx={iconBoxSx}>
                        <DescriptionOutlinedIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: TEXT, letterSpacing: '-0.02em', fontFamily: FONT, lineHeight: 1.25 }}>
                            Manage Template — {typeLabel}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.6, flexWrap: 'wrap' }}>
                            {currentVersion ? (
                                <Chip
                                    size="small"
                                    label={`v${currentVersion} active`}
                                    sx={{
                                        height: 22,
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        background: RED_BG,
                                        color: RED_DARK,
                                        border: 'none',
                                        fontFamily: FONT,
                                    }}
                                />
                            ) : !loading ? (
                                <Chip
                                    size="small"
                                    label="Not configured"
                                    sx={{
                                        height: 22,
                                        fontSize: '0.7rem',
                                        fontWeight: 600,
                                        background: SURFACE,
                                        color: MUTED,
                                        border: `1px solid ${BORDER}`,
                                        fontFamily: FONT,
                                    }}
                                />
                            ) : null}
                            <Typography sx={{ fontSize: '0.75rem', color: MUTED, fontFamily: FONT }}>
                                Saving creates a new version · issued letters stay unchanged
                            </Typography>
                        </Box>
                    </Box>
                </Box>
            </DialogTitle>

            <DialogContent sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                        <CircularProgress size={28} sx={{ color: RED }} />
                    </Box>
                ) : (
                    <Stack spacing={2.5}>
                        {error && <Alert severity="error" onClose={() => setError('')} sx={{ borderRadius: '10px' }}>{error}</Alert>}
                        {success && <Alert severity="success" onClose={() => setSuccess('')} sx={{ borderRadius: '10px' }}>{success}</Alert>}

                        {/* ── Letter body ──────────────────── */}
                        <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: '14px', p: 2, background: '#fff' }}>
                            <Typography sx={{ ...sectionLabelSx, mb: 0.35 }}>Letter Body</Typography>
                            <Typography sx={{ ...sectionHintSx, mb: 1.5 }}>
                                Write the fixed letter text. Click a token to insert a merge field at the cursor.
                            </Typography>

                            <Box sx={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 0.6,
                                mb: 1.5,
                                p: 1.25,
                                borderRadius: '10px',
                                background: SURFACE,
                                border: `1px solid ${BORDER}`,
                            }}>
                                {TOKENS.map((t) => (
                                    <Chip
                                        key={t.key}
                                        label={`+ ${t.label}`}
                                        size="small"
                                        onClick={() => insertToken(t.key)}
                                        sx={{
                                            fontSize: '0.72rem',
                                            height: 26,
                                            cursor: 'pointer',
                                            borderColor: 'rgba(198, 40, 40, 0.22)',
                                            background: '#fff',
                                            color: RED_DARK,
                                            fontWeight: 600,
                                            fontFamily: FONT,
                                            '&:hover': { background: RED_LIGHT, borderColor: RED },
                                        }}
                                        variant="outlined"
                                    />
                                ))}
                            </Box>

                            <TextField
                                inputRef={bodyRef}
                                multiline
                                minRows={9}
                                maxRows={16}
                                fullWidth
                                value={boilerplateHtml}
                                onChange={(e) => setBoilerplateHtml(e.target.value)}
                                placeholder={`Dear {{employee_name}},\n\nWe are pleased to confirm your joining as {{designation}} in {{department}}, effective {{join_date}}.\n\n...`}
                                sx={{
                                    ...fieldSx,
                                    '& .MuiInputBase-root': {
                                        fontFamily: "'IBM Plex Mono', 'Consolas', monospace",
                                        fontSize: '0.84rem',
                                        lineHeight: 1.55,
                                        background: '#fff',
                                        borderRadius: '10px',
                                    },
                                }}
                            />
                        </Box>

                        {/* ── Variable fields ─────────────────── */}
                        <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: '14px', p: 2, background: '#fff' }}>
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
                                <Box>
                                    <Typography sx={sectionLabelSx}>Variable Fields</Typography>
                                    <Typography sx={sectionHintSx}>
                                        Inputs filled at assignment. Auto-fill can map to the employee profile.
                                    </Typography>
                                </Box>
                                <Button
                                    size="small"
                                    startIcon={<AddIcon />}
                                    onClick={addField}
                                    variant="outlined"
                                    sx={{ ...outlineBtnSx, whiteSpace: 'nowrap' }}
                                >
                                    Add Field
                                </Button>
                            </Box>

                            {fields.length === 0 && (
                                <Box sx={{
                                    p: 2.25,
                                    background: SURFACE,
                                    borderRadius: '12px',
                                    textAlign: 'center',
                                    border: `1px dashed ${BORDER}`,
                                }}>
                                    <Typography sx={{ fontSize: '0.85rem', color: MUTED, fontFamily: FONT }}>
                                        No variable fields yet. Add fields the admin fills per employee.
                                    </Typography>
                                </Box>
                            )}

                            <Stack spacing={1.25}>
                                {fields.map((field, idx) => (
                                    <Box
                                        key={field._id}
                                        sx={{
                                            p: 1.5,
                                            border: `1px solid ${BORDER}`,
                                            borderRadius: '12px',
                                            background: SURFACE,
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                display: 'grid',
                                                gridTemplateColumns: {
                                                    xs: '1fr',
                                                    sm: '1fr 1fr',
                                                    md: '1.2fr 1fr 120px 150px auto',
                                                },
                                                gap: 1.25,
                                                alignItems: 'center',
                                            }}
                                        >
                                            <TextField
                                                size="small"
                                                label="Label"
                                                value={field.label}
                                                onChange={(e) => updateField(field._id, 'label', e.target.value)}
                                                required
                                                sx={fieldSx}
                                            />
                                            <TextField
                                                size="small"
                                                label="Key"
                                                value={field.key}
                                                onChange={(e) => updateField(field._id, 'key', e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                                                placeholder="e.g. salary_amount"
                                                required
                                                sx={fieldSx}
                                            />
                                            <FormControl size="small" sx={fieldSx}>
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
                                            <FormControl size="small" sx={fieldSx}>
                                                <InputLabel>Auto-fill</InputLabel>
                                                <Select
                                                    value={field.autoFillFrom || ''}
                                                    label="Auto-fill"
                                                    onChange={(e) => updateField(field._id, 'autoFillFrom', e.target.value)}
                                                >
                                                    {AUTO_FILL_OPTIONS.map((o) => (
                                                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                                                <FormControlLabel
                                                    sx={{ m: 0, mr: 0.5 }}
                                                    control={
                                                        <Switch
                                                            size="small"
                                                            checked={!!field.required}
                                                            onChange={(e) => updateField(field._id, 'required', e.target.checked)}
                                                            sx={{
                                                                '& .MuiSwitch-switchBase.Mui-checked': { color: RED },
                                                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: RED },
                                                            }}
                                                        />
                                                    }
                                                    label={<Typography sx={{ fontSize: '0.72rem', color: MUTED, fontFamily: FONT }}>Req.</Typography>}
                                                />
                                                <Tooltip title="Move up">
                                                    <span>
                                                        <IconButton size="small" onClick={() => moveField(field._id, -1)} disabled={idx === 0} sx={{ color: MUTED }}>
                                                            <ArrowUpwardIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                                <Tooltip title="Move down">
                                                    <span>
                                                        <IconButton size="small" onClick={() => moveField(field._id, 1)} disabled={idx === fields.length - 1} sx={{ color: MUTED }}>
                                                            <ArrowDownwardIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                                <Tooltip title="Remove field">
                                                    <IconButton size="small" onClick={() => removeField(field._id)} sx={{ color: RED_DARK }}>
                                                        <DeleteOutlineIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </Box>
                                    </Box>
                                ))}
                            </Stack>
                        </Box>

                        {/* ── Notes + version notice ──────────────── */}
                        <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: '14px', p: 2, background: '#fff' }}>
                            <FormControlLabel
                                sx={{ ml: 0, alignItems: 'flex-start' }}
                                control={
                                    <Switch
                                        checked={includeNotes}
                                        onChange={(e) => setIncludeNotes(e.target.checked)}
                                        sx={{
                                            mt: 0.25,
                                            '& .MuiSwitch-switchBase.Mui-checked': { color: RED },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: RED },
                                        }}
                                    />
                                }
                                label={
                                    <Box sx={{ ml: 0.5 }}>
                                        <Typography sx={sectionLabelSx}>Include Notes Section</Typography>
                                        <Typography sx={sectionHintSx}>
                                            Adds a free-text area for extra letter content at assignment time.
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
                                    sx={{ mt: 1.75, maxWidth: 360, ...fieldSx }}
                                    helperText="Shown above the notes box when assigning."
                                />
                            )}
                        </Box>

                        <Alert
                            severity="info"
                            icon={<InfoOutlinedIcon fontSize="small" />}
                            sx={{
                                fontSize: '0.8rem',
                                borderRadius: '10px',
                                background: INFO_BG,
                                color: INFO_TEXT,
                                border: '1px solid #BFDBFE',
                                fontFamily: FONT,
                            }}
                        >
                            Saving creates a <strong>new version</strong>. Previously issued documents are never modified.
                        </Alert>
                    </Stack>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 1.75, borderTop: `1px solid ${BORDER}`, gap: 1 }}>
                <Button onClick={onClose} sx={ghostBtnSx}>Cancel</Button>
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
