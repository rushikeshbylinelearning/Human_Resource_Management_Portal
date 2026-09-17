// frontend/src/components/employeeDocuments/EmployeeDocumentsDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, Paper, Chip, Button, IconButton, Select, MenuItem, FormControl,
    InputLabel, TextField, CircularProgress, Dialog, DialogTitle, DialogContent,
    DialogActions, Alert, Switch, FormControlLabel, Autocomplete, Stack, Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import AddIcon from '@mui/icons-material/Add';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import api from '../../api/axios';
import DocumentTemplateEditorDialog from './DocumentTemplateEditorDialog';
import TemplateAssignDialog from './TemplateAssignDialog';
import {
    RED, RED_DARK, RED_BG, RED_LIGHT, TEXT, MUTED, BORDER, SURFACE,
    FONT, SUCCESS_BG, SUCCESS_TEXT, WARN_BG, WARN_TEXT, INFO_BG, INFO_TEXT,
    cardSx, sectionTitleSx, sectionDescSx, primaryBtnSx, outlineBtnSx,
    fieldSx, tableHeadCellSx, iconBoxSx, pageTitleSx, pageDescSx,
} from '../../theme/policiesPageTheme';

const BUILT_IN_KEYS = ['joining_letter', 'kra', 'probation_confirmation', 'probation_extension'];

const docStatusConfig = {
    pending: { label: 'Pending', color: WARN_TEXT, bg: WARN_BG, icon: <HourglassEmptyOutlinedIcon sx={{ fontSize: 14 }} /> },
    viewed: { label: 'Viewed', color: INFO_TEXT, bg: INFO_BG, icon: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} /> },
    acknowledged: { label: 'Acknowledged', color: SUCCESS_TEXT, bg: SUCCESS_BG, icon: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} /> },
    hr_pending: { label: 'HR Pending', color: RED_DARK, bg: RED_BG, icon: <WarningAmberOutlinedIcon sx={{ fontSize: 14 }} /> },
};

const DocStatusChip = ({ status }) => {
    const cfg = docStatusConfig[status] || docStatusConfig.pending;
    return (
        <Chip
            size="small"
            icon={cfg.icon}
            label={cfg.label}
        sx={{
                background: cfg.bg,
                color: cfg.color,
                fontWeight: 600,
                fontSize: '0.72rem',
                height: 24,
                border: 'none',
                fontFamily: FONT,
                '& .MuiChip-icon': { color: 'inherit' },
            }}
        />
    );
};

const BoolChip = ({ val }) => (
    <Chip
        size="small"
        label={val ? 'Yes' : 'No'}
        variant="outlined"
        sx={{
            borderColor: val ? '#A5D6A7' : '#F5C6C6',
            background: val ? SUCCESS_BG : RED_BG,
            color: val ? SUCCESS_TEXT : RED_DARK,
            fontWeight: 600,
            fontSize: '0.72rem',
            height: 22,
            fontFamily: FONT,
        }}
    />
);

const SectionHeader = ({ icon, title, description }) => (
    <Box sx={{ mb: 2 }}>
        <Typography component="div" sx={sectionTitleSx}>
            <Box sx={iconBoxSx}>{icon}</Box>
            {title}
        </Typography>
        {description && (
            <Typography variant="body2" sx={{ ...sectionDescSx, mt: 0.75, pl: '48px' }}>
                {description}
            </Typography>
        )}
    </Box>
);

const ChangeStatusDialog = ({ open, onClose, employee, onSuccess }) => {
    const [effectiveDate, setEffectiveDate] = useState('');
    const [note, setNote] = useState('');
    const [documentId, setDocumentId] = useState('');
    const [employeeDocs, setEmployeeDocs] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open || !employee?.employeeId) return;
        setEffectiveDate(new Date().toISOString().slice(0, 10));
        setNote('');
        setDocumentId('');
        setError('');
        api.get(`/employee-documents/admin/compliance?employeeId=${employee.employeeId}&limit=50`)
            .then((r) => setEmployeeDocs(r.data.records || []))
            .catch(console.error);
    }, [open, employee?.employeeId]);

    const handleSubmit = async () => {
        if (!effectiveDate) {
            setError('Effective date is required.');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await api.post(`/employee-documents/admin/change-status/${employee.employeeId}`, {
                employmentStatus: 'Permanent',
                effectiveDate,
                note,
                documentId: documentId || undefined,
            });
            onSuccess?.();
            onClose();
        } catch (e) {
            setError(e.response?.data?.error || 'Failed to change status.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Change Employment Status</DialogTitle>
            <DialogContent>
                <Typography variant="body2" sx={{ mb: 2, color: MUTED }}>
                    {employee?.employeeName} ({employee?.employeeCode}) — current: {employee?.employmentStatus || 'Unknown'}
                </Typography>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField fullWidth size="small" label="New Status" value="Permanent" disabled />
                    <TextField
                        fullWidth size="small" type="date" label="Effective Date"
                        value={effectiveDate}
                        onChange={(e) => setEffectiveDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                    />
                    <FormControl fullWidth size="small">
                        <InputLabel>Confirmation Letter (optional)</InputLabel>
                        <Select
                            value={documentId}
                            label="Confirmation Letter (optional)"
                            onChange={(e) => setDocumentId(e.target.value)}
                        >
                            <MenuItem value="">None</MenuItem>
                            {employeeDocs.filter((d) => d.fileRef).map((d) => (
                                <MenuItem key={d._id} value={d._id}>
                                    {d.documentTypeLabel} — {new Date(d.assignedAt).toLocaleDateString('en-IN')}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <TextField
                        fullWidth size="small" label="Note (optional)" multiline rows={2}
                        value={note} onChange={(e) => setNote(e.target.value)}
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} sx={{ textTransform: 'none' }}>Cancel</Button>
                <Button variant="contained" onClick={handleSubmit} disabled={submitting} sx={primaryBtnSx}>
                    {submitting ? 'Saving…' : 'Confirm Permanent'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

const EmployeeDocumentsDashboard = () => {
    const [types, setTypes] = useState([]);
    const [records, setRecords] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({ status: '', department: '', documentType: '' });
    const [snack, setSnack] = useState('');

    // Template editor / assign dialogs for built-in types
    const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
    const [templateEditorType, setTemplateEditorType] = useState('');
    const [templateAssignOpen, setTemplateAssignOpen] = useState(false);
    const [templateAssignType, setTemplateAssignType] = useState('');

    // Custom (non-built-in) direct-upload assign
    const [employees, setEmployees] = useState([]);
    const [selectedEmployees, setSelectedEmployees] = useState([]);
    const [assignType, setAssignType] = useState('');
    const [customTypeLabel, setCustomTypeLabel] = useState('');
    const [requiresAck, setRequiresAck] = useState(false);
    const [assignNote, setAssignNote] = useState('');
    const [assignFile, setAssignFile] = useState(null);
    const [assigning, setAssigning] = useState(false);

    const [newTypeLabel, setNewTypeLabel] = useState('');
    const [savingTypes, setSavingTypes] = useState(false);

    const [statusDialog, setStatusDialog] = useState({ open: false, employee: null });

    const loadTypes = useCallback(async () => {
        try {
            const { data } = await api.get('/employee-documents/types');
            setTypes(data.types || []);
        } catch (e) {
            console.error(e);
        }
    }, []);

    const loadRecords = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, limit: 25 });
            if (filters.status) params.set('status', filters.status);
            if (filters.department) params.set('department', filters.department);
            if (filters.documentType) params.set('documentType', filters.documentType);
            const { data } = await api.get(`/employee-documents/admin/compliance?${params}`);
            setRecords(data.records || []);
            setTotal(data.total || 0);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [page, filters]);

    const loadEmployees = useCallback(async () => {
        try {
            const { data } = await api.get('/admin/employees?all=true&slim=true');
            setEmployees(Array.isArray(data) ? data : (data.employees || []));
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        loadTypes();
        loadEmployees();
    }, [loadTypes, loadEmployees]);

    useEffect(() => { loadRecords(); }, [loadRecords]);

    const handleAddCustomType = async () => {
        if (!newTypeLabel.trim()) return;
        const key = newTypeLabel.trim().toLowerCase().replace(/\s+/g, '_');
        const updated = [...types, { key, label: newTypeLabel.trim(), isBuiltIn: false }];
        setSavingTypes(true);
        try {
            const { data } = await api.put('/employee-documents/types', { types: updated });
            setTypes(data.types);
            setNewTypeLabel('');
            setSnack('Document type added.');
        } catch (e) {
            setSnack(e.response?.data?.error || 'Failed to add type.');
        } finally {
            setSavingTypes(false);
        }
    };

    // Direct PDF upload — only for custom (non-built-in) types
    const handleAssignCustom = async () => {
        if (!selectedEmployees.length || !assignType || !assignFile) {
            setSnack('Select employee(s), document type, and upload a PDF.');
            return;
        }
        setAssigning(true);
        try {
            const formData = new FormData();
            formData.append('file', assignFile);
            formData.append('documentType', assignType);
            formData.append('employeeIds', JSON.stringify(selectedEmployees.map((e) => e._id)));
            formData.append('requiresAcknowledgment', requiresAck);
            if (assignNote) formData.append('note', assignNote);
            if (assignType === 'custom' && customTypeLabel) {
                formData.append('customTypeLabel', customTypeLabel);
            }

            await api.post('/employee-documents/assign', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            setSnack('Document assigned successfully.');
            setSelectedEmployees([]);
            setAssignFile(null);
            setAssignNote('');
            setRequiresAck(false);
            loadRecords();
        } catch (e) {
            setSnack(e.response?.data?.error || 'Failed to assign document.');
        } finally {
            setAssigning(false);
        }
    };

    // Whether the currently selected assign type is a built-in (templated) type
    const isBuiltInAssignType = BUILT_IN_KEYS.includes(assignType);

    const totalPages = Math.ceil(total / 25);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, fontFamily: FONT }}>
            <Box>
                <Typography sx={pageTitleSx}>
                    Employee Documents
                </Typography>
                <Typography sx={{ ...pageDescSx, mt: 0.4, maxWidth: 640 }}>
                    Manage document types, assign letters from templates, and track employee compliance.
                </Typography>
            </Box>

            {snack && (
                <Alert severity="info" onClose={() => setSnack('')} sx={{ borderRadius: 2 }}>
                    {snack}
                </Alert>
            )}

            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
                gap: 2.5,
                alignItems: 'stretch',
            }}>
            {/* ── Document Types card ─────────────────────────────────── */}
            <Box sx={{ ...cardSx, height: '100%' }}>
                <SectionHeader
                    icon={<CategoryOutlinedIcon sx={{ fontSize: 18 }} />}
                    title="Document Types"
                    description="Built-in types use templates. Click the gear to configure. Custom types use direct PDF upload."
                />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2, minHeight: 32 }}>
                    {types.length === 0 ? (
                        <Typography variant="body2" sx={{ color: MUTED, fontStyle: 'italic' }}>
                            No document types configured.
                        </Typography>
                    ) : types.map((t) => (
                        <Box
                            key={t.key}
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.25,
                                pl: 1.25,
                                pr: t.isBuiltIn ? 0.4 : 1.25,
                                py: 0.35,
                                borderRadius: '999px',
                                border: `1px solid ${t.isBuiltIn ? 'rgba(198, 40, 40, 0.22)' : BORDER}`,
                                background: t.isBuiltIn ? RED_LIGHT : SURFACE,
                            }}
                        >
                            <Typography sx={{
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                color: t.isBuiltIn ? RED_DARK : TEXT,
                                fontFamily: FONT,
                            }}>
                                {t.label}
                            </Typography>
                            {t.isBuiltIn && BUILT_IN_KEYS.includes(t.key) && (
                                <Tooltip title={`Manage template for ${t.label}`}>
                                    <IconButton
                                        size="small"
                                        onClick={() => { setTemplateEditorType(t.key); setTemplateEditorOpen(true); }}
                                        sx={{ p: 0.4, color: RED_DARK, '&:hover': { background: RED_BG } }}
                                        aria-label={`Manage template for ${t.label}`}
                                    >
                                        <TuneOutlinedIcon sx={{ fontSize: 15 }} />
                                    </IconButton>
                                </Tooltip>
                            )}
                        </Box>
                    ))}
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField
                        size="small"
                        placeholder="New custom type name"
                        value={newTypeLabel}
                        onChange={(e) => setNewTypeLabel(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCustomType()}
                        sx={{ flex: 1, ...fieldSx }}
                    />
                    <Button
                        variant="outlined"
                        startIcon={savingTypes ? <CircularProgress size={16} /> : <AddIcon />}
                        onClick={handleAddCustomType}
                        disabled={savingTypes || !newTypeLabel.trim()}
                        sx={{ ...outlineBtnSx, whiteSpace: 'nowrap' }}
                    >
                        Add Custom Type
                    </Button>
                </Stack>
            </Box>

            {/* ── Assign Document card ─────────────────────────────────── */}
            <Box sx={{ ...cardSx, height: '100%' }}>
                <SectionHeader
                    icon={<AssignmentOutlinedIcon sx={{ fontSize: 18 }} />}
                    title="Assign Document"
                    description="Select a document type. Built-in types generate from a template; custom types require a PDF upload."
                />

                {/* Step 1: pick type */}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2 }}>
                    <FormControl size="small" sx={fieldSx}>
                        <InputLabel>Document Type</InputLabel>
                        <Select
                            value={assignType}
                            label="Document Type"
                            onChange={(e) => {
                                setAssignType(e.target.value);
                                setSelectedEmployees([]);
                                setAssignFile(null);
                                setCustomTypeLabel('');
                            }}
                        >
                            {types.map((t) => (
                                <MenuItem key={t.key} value={t.key}>
                                    {t.label}
                                    {t.isBuiltIn && (
                                        <Typography component="span" variant="caption" sx={{ ml: 1, color: RED_DARK }}>
                                            (template)
                                        </Typography>
                                    )}
                                </MenuItem>
                            ))}
                            <MenuItem value="custom">Custom (manual label)</MenuItem>
                        </Select>
                    </FormControl>
                    {assignType === 'custom' && (
                        <TextField
                            size="small"
                            label="Custom Type Label"
                            value={customTypeLabel}
                            onChange={(e) => setCustomTypeLabel(e.target.value)}
                        />
                    )}
                </Box>

                {/* Built-in type → open template assign dialog */}
                {isBuiltInAssignType && (
                    <Box>
                        <Alert severity="info" sx={{ mb: 2, borderRadius: 2, fontSize: '0.8rem' }}>
                            This is a <strong>templated document type</strong>. Fields will be auto-filled from the
                            employee profile. You can override any field and optionally add notes before the PDF is generated.
                        </Alert>
                        <Button
                            variant="contained"
                            startIcon={<AssignmentOutlinedIcon />}
                            onClick={() => { setTemplateAssignType(assignType); setTemplateAssignOpen(true); }}
                            sx={primaryBtnSx}
                        >
                            Open Assign Form
                        </Button>
                    </Box>
                )}

                {/* Custom / non-built-in → direct PDF upload (unchanged) */}
                {assignType && !isBuiltInAssignType && (
                    <Stack spacing={2}>
                        <Autocomplete
                            multiple
                            options={employees}
                            getOptionLabel={(o) => `${o.fullName} (${o.employeeCode})`}
                            value={selectedEmployees}
                            onChange={(_, v) => setSelectedEmployees(v)}
                            renderInput={(params) => (
                                <TextField {...params} label="Employees" size="small" placeholder="Search by name or code" />
                            )}
                        />
                        <TextField
                            size="small"
                            label="Note"
                            placeholder="Optional internal note"
                            value={assignNote}
                            onChange={(e) => setAssignNote(e.target.value)}
                        />
                        <Button
                            variant="outlined"
                            component="label"
                            fullWidth
                            startIcon={assignFile ? <InsertDriveFileOutlinedIcon /> : <CloudUploadOutlinedIcon />}
                            sx={{
                                py: 1.5,
                                textTransform: 'none',
                                fontWeight: 600,
                                borderRadius: '10px',
                                borderStyle: 'dashed',
                                borderColor: assignFile ? RED : BORDER,
                                color: assignFile ? RED_DARK : MUTED,
                                background: assignFile ? RED_LIGHT : SURFACE,
                                '&:hover': { borderStyle: 'dashed', borderColor: RED, background: RED_LIGHT },
                            }}
                        >
                            {assignFile ? assignFile.name : 'Choose PDF file to upload'}
                            <input
                                type="file"
                                hidden
                                accept="application/pdf"
                                onChange={(e) => setAssignFile(e.target.files?.[0] || null)}
                            />
                        </Button>
                        <FormControlLabel
                            sx={{ ml: 0 }}
                            control={
                                <Switch
                                    checked={requiresAck}
                                    onChange={(e) => setRequiresAck(e.target.checked)}
                                    size="small"
                                    sx={{
                                        '& .MuiSwitch-switchBase.Mui-checked': { color: RED },
                                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: RED },
                                    }}
                                />
                            }
                            label={
                                <Typography variant="body2" sx={{ color: MUTED }}>
                                    Require employee acknowledgment
                                </Typography>
                            }
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <Button
                                variant="contained"
                                onClick={handleAssignCustom}
                                disabled={assigning || !selectedEmployees.length || !assignType || !assignFile}
                                sx={primaryBtnSx}
                            >
                                {assigning ? 'Assigning…' : 'Assign Document'}
                            </Button>
                        </Box>
                    </Stack>
                )}
            </Box>
            </Box>

            {/* ── Compliance Table ─────────────────────────────────────── */}
            <Box sx={cardSx}>
                <Box sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 2,
                    mb: 1,
                    flexWrap: 'wrap',
                }}>
                    <Box>
                        <SectionHeader
                            icon={<FactCheckOutlinedIcon sx={{ fontSize: 18 }} />}
                            title="Compliance Records"
                            description={`${total} assignment${total === 1 ? '' : 's'} tracked across employees.`}
                        />
                    </Box>
                    <Tooltip title="Refresh records">
                        <IconButton
                            size="small"
                            onClick={loadRecords}
                            disabled={loading}
                            sx={{ border: `1px solid ${BORDER}`, borderRadius: '10px', color: MUTED }}
                        >
                            <RefreshIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel>Status</InputLabel>
                        <Select
                            value={filters.status}
                            label="Status"
                            onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
                        >
                            <MenuItem value="">All</MenuItem>
                            <MenuItem value="pending">Pending</MenuItem>
                            <MenuItem value="viewed">Viewed</MenuItem>
                            <MenuItem value="acknowledged">Acknowledged</MenuItem>
                            <MenuItem value="hr_pending">HR Pending</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField
                        size="small"
                        label="Department"
                        value={filters.department}
                        onChange={(e) => { setFilters((f) => ({ ...f, department: e.target.value })); setPage(1); }}
                        sx={{ minWidth: 160 }}
                    />
                    <FormControl size="small" sx={{ minWidth: 180 }}>
                        <InputLabel>Document Type</InputLabel>
                        <Select
                            value={filters.documentType}
                            label="Document Type"
                            onChange={(e) => { setFilters((f) => ({ ...f, documentType: e.target.value })); setPage(1); }}
                        >
                            <MenuItem value="">All</MenuItem>
                            {types.map((t) => (
                                <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>

                <TableContainer
                    component={Paper}
                    variant="outlined"
                    sx={{
                        borderRadius: '12px',
                        borderColor: BORDER,
                        boxShadow: 'none',
                        overflowX: 'auto',
                        overflowY: 'hidden',
                        WebkitOverflowScrolling: 'touch',
                    }}
                >
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                {['Employee', 'Department', 'Document', 'Assigned', 'Viewed', 'Acknowledged', 'Forwarded', 'Assigned By', 'Status', 'Actions'].map((col) => (
                                    <TableCell key={col} sx={tableHeadCellSx}>
                                        {col}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading && (
                                <TableRow>
                                    <TableCell colSpan={10} align="center" sx={{ py: 5 }}>
                                        <CircularProgress size={24} sx={{ color: RED }} />
                                    </TableCell>
                                </TableRow>
                            )}
                            {!loading && records.map((r) => (
                                <TableRow key={r._id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 600, color: TEXT }}>
                                            {r.employeeName}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: MUTED }}>
                                            {r.employeeCode}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ color: MUTED, fontSize: '0.8125rem' }}>
                                        {r.department || '—'}
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '0.8125rem', color: TEXT }}>
                                        {r.documentTypeLabel}
                                        {r.templateVersion != null && (
                                            <Typography variant="caption" sx={{ display: 'block', color: MUTED }}>
                                                template v{r.templateVersion}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell sx={{ color: MUTED, fontSize: '0.8125rem' }}>
                                        {r.assignedAt ? new Date(r.assignedAt).toLocaleDateString('en-IN') : '—'}
                                    </TableCell>
                                    <TableCell><BoolChip val={!!r.viewedAt} /></TableCell>
                                    <TableCell>
                                        {r.requiresAcknowledgment ? <BoolChip val={!!r.acknowledgedAt} /> : '—'}
                                    </TableCell>
                                    <TableCell>
                                        {r.forwardedToPersonalEmailAt ? (
                                            <Tooltip title={new Date(r.forwardedToPersonalEmailAt).toLocaleString('en-IN')}>
                                                <span>
                                                    <BoolChip val />
                                                </span>
                                            </Tooltip>
                                        ) : (
                                            <BoolChip val={false} />
                                        )}
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '0.8125rem', color: MUTED }}>
                                        {r.assignedByDisplay}
                                    </TableCell>
                                    <TableCell><DocStatusChip status={r.displayStatus || r.status} /></TableCell>
                                    <TableCell>
                                        {r.employmentStatus === 'Probation' && (
                                            <Button
                                                size="small"
                                                startIcon={<SwapHorizOutlinedIcon sx={{ fontSize: 16 }} />}
                                                onClick={() => setStatusDialog({
                                                    open: true,
                                                    employee: {
                                                        employeeId: r.employeeId,
                                                        employeeName: r.employeeName,
                                                        employeeCode: r.employeeCode,
                                                        employmentStatus: r.employmentStatus,
                                                    },
                                                })}
                                                sx={{
                                                    textTransform: 'none',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    color: RED_DARK,
                                                    minWidth: 0,
                                                    px: 1,
                                                }}
                                            >
                                                Change Status
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!loading && records.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={10} align="center" sx={{ color: '#94a3b8', py: 5 }}>
                                        No compliance records found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                {totalPages > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5, mt: 2 }}>
                        <Button
                            size="small"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                            sx={{ textTransform: 'none' }}
                        >
                            Previous
                        </Button>
                        <Typography variant="body2" sx={{ color: MUTED }}>
                            Page {page} of {totalPages}
                        </Typography>
                        <Button
                            size="small"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                            sx={{ textTransform: 'none' }}
                        >
                            Next
                        </Button>
                    </Box>
                )}
            </Box>

            {/* ── Template editor ──────────────────────────────────── */}
            <DocumentTemplateEditorDialog
                open={templateEditorOpen}
                onClose={() => setTemplateEditorOpen(false)}
                documentType={templateEditorType}
                onSaved={() => setSnack('Template saved successfully.')}
            />

            {/* ── Template-based assign ────────────────────────────── */}
            <TemplateAssignDialog
                open={templateAssignOpen}
                onClose={() => setTemplateAssignOpen(false)}
                documentType={templateAssignType}
                employees={employees}
                onAssigned={() => { setSnack('Document(s) assigned successfully.'); loadRecords(); }}
            />

            <ChangeStatusDialog
                open={statusDialog.open}
                employee={statusDialog.employee}
                onClose={() => setStatusDialog({ open: false, employee: null })}
                onSuccess={() => { setSnack('Employment status updated.'); loadRecords(); }}
            />
        </Box>
    );
};

export default EmployeeDocumentsDashboard;
