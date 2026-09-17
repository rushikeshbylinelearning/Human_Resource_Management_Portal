// frontend/src/components/employeeDocuments/TemplateAssignDialog.jsx
// Hybrid assign dialog for built-in (templated) document types.
// Loads the active template, auto-fills employee fields from their profile,
// lets admin override/complete remaining fields, previews the PDF, and on
// confirm generates + stores + assigns the document.
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Box, Stack, Alert, CircularProgress,
    TextField, Switch, FormControlLabel, Autocomplete,
    Divider,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PreviewOutlinedIcon from '@mui/icons-material/PreviewOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import api from '../../api/axios';
import { PdfDocument, PdfPage } from '../lazy/LazyPdfComponents';

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

// Step enum
const STEP = { FORM: 'form', PREVIEW: 'preview', CONFIRM: 'confirm' };

export default function TemplateAssignDialog({
    open,
    onClose,
    documentType,
    employees,     // all available employees for selection
    onAssigned,
}) {
    const [step, setStep] = useState(STEP.FORM);

    // Form state
    const [selectedEmployees, setSelectedEmployees] = useState([]);
    const [template, setTemplate] = useState(null);
    const [loadingTemplate, setLoadingTemplate] = useState(false);
    const [templateError, setTemplateError] = useState('');

    // Per-employee: fieldValues keyed by employeeId
    // When multiple employees selected we show a shared form and distribute later.
    // For multi-employee, the admin fills once; values apply to all.
    const [fieldValues, setFieldValues] = useState({});
    const [notesContent, setNotesContent] = useState('');
    const [requiresAck, setRequiresAck] = useState(false);
    const [note, setNote] = useState('');

    // Auto-fill state for the first selected employee (used to pre-populate form)
    const [autoFilledValues, setAutoFilledValues] = useState({});
    const [manualFields, setManualFields] = useState([]); // fields requiring admin input
    const [loadingContext, setLoadingContext] = useState(false);

    // Preview state
    const [previewBlob, setPreviewBlob] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const [previewNumPages, setPreviewNumPages] = useState(null);

    // Assign state
    const [assigning, setAssigning] = useState(false);
    const [assignError, setAssignError] = useState('');
    const [formErrors, setFormErrors] = useState({});

    const typeLabel = TYPE_LABELS[documentType] || documentType;

    // Load template when dialog opens or documentType changes
    useEffect(() => {
        if (!open || !documentType) return;
        setStep(STEP.FORM);
        setSelectedEmployees([]);
        setFieldValues({});
        setAutoFilledValues({});
        setManualFields([]);
        setNotesContent('');
        setRequiresAck(false);
        setNote('');
        setPreviewBlob(null);
        setPreviewError('');
        setAssignError('');
        setFormErrors({});
        setTemplateError('');

        setLoadingTemplate(true);
        api.get(`/employee-documents/templates/${documentType}`)
            .then(({ data }) => {
                if (!data.template) {
                    setTemplateError('No active template configured for this document type. Please configure one first.');
                    setTemplate(null);
                } else {
                    setTemplate(data.template);
                }
            })
            .catch(() => setTemplateError('Failed to load template.'))
            .finally(() => setLoadingTemplate(false));
    }, [open, documentType]);

    // Auto-fill when the first selected employee changes
    useEffect(() => {
        if (!template || selectedEmployees.length === 0) {
            setAutoFilledValues({});
            setFieldValues({});
            setManualFields([]);
            return;
        }

        const firstEmployee = selectedEmployees[0];
        setLoadingContext(true);

        api.post(`/employee-documents/templates/${documentType}/preview-context`, {
            employeeId: firstEmployee._id,
        })
            .then(({ data }) => {
                const fv = data.fieldValues || {};
                setAutoFilledValues(fv);
                // Only populate manual (non-auto-filled) fields in form state
                const manual = data.manualFields || [];
                setManualFields(manual);
                // Initialize form values with empty strings for manual fields only
                setFieldValues(() => {
                    const next = {};
                    for (const field of manual) {
                        next[field.key] = fv[field.key] || '';
                    }
                    return next;
                });
            })
            .catch(() => { setManualFields([]); })
            .finally(() => setLoadingContext(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEmployees, template, documentType]);

    const handleFieldChange = (key, value) => {
        setFieldValues((prev) => ({ ...prev, [key]: value }));
        setFormErrors((prev) => ({ ...prev, [key]: '' }));
    };

    const validateForm = () => {
        if (!template) return false;
        if (selectedEmployees.length === 0) {
            setFormErrors({ _employees: 'Select at least one employee.' });
            return false;
        }
        const errs = {};
        // Only validate manual fields — auto-filled fields are always resolved from the profile
        for (const field of manualFields) {
            if (field.required && !fieldValues[field.key]?.toString().trim()) {
                errs[field.key] = `${field.label} is required.`;
            }
        }
        setFormErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handlePreview = async () => {
        if (!validateForm()) return;

        setPreviewError('');
        setPreviewBlob(null);
        setPreviewLoading(true);
        setStep(STEP.PREVIEW);

        try {
            const response = await api.post(
                `/employee-documents/templates/${documentType}/generate-preview`,
                {
                    employeeId: selectedEmployees[0]._id,
                    // Only send manual field values — auto-filled fields are
                    // resolved from the employee profile on the backend.
                    fieldValues,
                    notesContent,
                    templateVersion: template.version,
                },
                { responseType: 'blob' }
            );
            setPreviewBlob(response.data);
        } catch (e) {
            let errMsg = 'Failed to generate preview.';
            if (e.response?.data) {
                // blob error response — read as text
                try {
                    const text = await e.response.data.text();
                    const parsed = JSON.parse(text);
                    errMsg = parsed.error || errMsg;
                } catch { /* ignore */ }
            }
            setPreviewError(errMsg);
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleConfirmAssign = async () => {
        setAssignError('');
        setAssigning(true);

        try {
            // Build per-employee field values map (same values for all selected employees)
            const fieldValuesByEmployee = {};
            for (const emp of selectedEmployees) {
                fieldValuesByEmployee[emp._id] = { ...fieldValues };
            }

            const { data } = await api.post(
                `/employee-documents/templates/${documentType}/assign`,
                {
                    employeeIds: selectedEmployees.map((e) => e._id),
                    fieldValuesByEmployee,
                    notesContent,
                    requiresAcknowledgment: requiresAck,
                    note,
                }
            );

            if (data.errors && data.errors.length > 0 && data.assigned === 0) {
                setAssignError(data.errors.map((e) => `${e.employeeName}: ${e.error}`).join('\n'));
                return;
            }

            onAssigned?.();
            onClose();
        } catch (e) {
            setAssignError(e.response?.data?.error || 'Failed to assign documents.');
        } finally {
            setAssigning(false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth={step === STEP.PREVIEW ? 'lg' : 'sm'}
            fullWidth
            PaperProps={{ sx: { height: step === STEP.PREVIEW ? '90vh' : 'auto', borderRadius: 3, display: 'flex', flexDirection: 'column' } }}
        >
            <DialogTitle sx={{ fontWeight: 700, pb: 1, borderBottom: '1px solid #e2e8f0' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AssignmentOutlinedIcon sx={{ color: '#C62828' }} />
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                            Assign {typeLabel}
                        </Typography>
                        {template && (
                            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                Template v{template.version} · Fields auto-filled from employee profile
                            </Typography>
                        )}
                    </Box>
                </Box>
            </DialogTitle>

            <DialogContent sx={{ flex: 1, overflowY: 'auto', py: 2.5 }}>
                {loadingTemplate ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                        <CircularProgress size={28} sx={{ color: '#E53935' }} />
                    </Box>
                ) : templateError ? (
                    <Alert
                        severity="warning"
                        icon={<WarningAmberOutlinedIcon />}
                        sx={{ borderRadius: 2 }}
                    >
                        {templateError}
                    </Alert>
                ) : step === STEP.FORM ? (
                    <Stack spacing={2.5}>
                        {/* Employee selector */}
                        <Box>
                            <Autocomplete
                                multiple
                                options={employees}
                                getOptionLabel={(o) => `${o.fullName} (${o.employeeCode})`}
                                value={selectedEmployees}
                                onChange={(_, v) => {
                                    setSelectedEmployees(v);
                                    setFormErrors((prev) => ({ ...prev, _employees: '' }));
                                }}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Employees"
                                        size="small"
                                        placeholder="Search by name or code"
                                        error={!!formErrors._employees}
                                        helperText={formErrors._employees}
                                    />
                                )}
                            />
                            {selectedEmployees.length > 1 && (
                                <Alert severity="info" sx={{ mt: 1, fontSize: '0.8rem', py: 0.5 }}>
                                    Fields are auto-filled from the <strong>first selected employee</strong>.
                                    The same field values will be used for all {selectedEmployees.length} employees —
                                    review carefully before generating.
                                </Alert>
                            )}
                        </Box>

                        {/* Auto-filled profile fields — read-only summary */}
                        {selectedEmployees.length > 0 && Object.keys(autoFilledValues).length > 0 && (
                            <Box>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b', mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <LockOutlinedIcon sx={{ fontSize: 15, color: '#C62828' }} />
                                    Auto-Filled from Employee Profile
                                    {loadingContext && (
                                        <CircularProgress size={12} sx={{ ml: 1, color: '#E53935' }} />
                                    )}
                                </Typography>
                                <Box sx={{
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 2,
                                    p: 1.5,
                                    display: 'grid',
                                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                                    gap: 0.75,
                                }}>
                                    {(template?.fieldsSchema || [])
                                        .filter((f) => f.autoFillFrom && autoFilledValues[f.key] !== undefined && autoFilledValues[f.key] !== '')
                                        .map((f) => (
                                            <Box key={f.key} sx={{ display: 'flex', gap: 0.75 }}>
                                                <Typography variant="caption" sx={{ color: '#64748b', minWidth: 120, fontWeight: 600 }}>
                                                    {f.label}:
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: '#1e293b' }}>
                                                    {autoFilledValues[f.key] || '—'}
                                                </Typography>
                                            </Box>
                                        ))
                                    }
                                </Box>
                                <Typography variant="caption" sx={{ color: '#94a3b8', mt: 0.5, display: 'block' }}>
                                    These values are pulled directly from the employee's profile and cannot be changed here.
                                </Typography>
                            </Box>
                        )}

                        {/* Manual fields — only fields with no autoFillFrom */}
                        {selectedEmployees.length > 0 && manualFields.length > 0 && (
                            <Box>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b', mb: 1 }}>
                                    Additional Fields
                                    {loadingContext && (
                                        <CircularProgress size={14} sx={{ ml: 1, color: '#E53935', verticalAlign: 'middle' }} />
                                    )}
                                </Typography>
                                <Stack spacing={1.5}>
                                    {manualFields.map((field) => (
                                        <Box key={field.key}>
                                            {field.type === 'textarea' ? (
                                                <TextField
                                                    fullWidth
                                                    size="small"
                                                    label={field.label}
                                                    multiline
                                                    minRows={3}
                                                    value={fieldValues[field.key] || ''}
                                                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                                    required={field.required}
                                                    error={!!formErrors[field.key]}
                                                    helperText={formErrors[field.key]}
                                                />
                                            ) : field.type === 'date' ? (
                                                <TextField
                                                    fullWidth
                                                    size="small"
                                                    label={field.label}
                                                    type="date"
                                                    value={fieldValues[field.key] || ''}
                                                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                                    InputLabelProps={{ shrink: true }}
                                                    required={field.required}
                                                    error={!!formErrors[field.key]}
                                                    helperText={formErrors[field.key]}
                                                />
                                            ) : (
                                                <TextField
                                                    fullWidth
                                                    size="small"
                                                    label={field.label}
                                                    value={fieldValues[field.key] || ''}
                                                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                                    required={field.required}
                                                    error={!!formErrors[field.key]}
                                                    helperText={formErrors[field.key]}
                                                />
                                            )}
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>
                        )}

                        {/* Notes section */}
                        {template?.notesFieldLabel && (
                            <>
                                <Divider />
                                <Box>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b', mb: 1 }}>
                                        {template.notesFieldLabel}
                                    </Typography>
                                    <TextField
                                        fullWidth
                                        multiline
                                        minRows={4}
                                        size="small"
                                        placeholder="Enter any additional notes to include in this letter…"
                                        value={notesContent}
                                        onChange={(e) => setNotesContent(e.target.value)}
                                    />
                                </Box>
                            </>
                        )}

                        <Divider />

                        {/* Options */}
                        <Stack spacing={1}>
                            <FormControlLabel
                                sx={{ ml: 0 }}
                                control={
                                    <Switch
                                        size="small"
                                        checked={requiresAck}
                                        onChange={(e) => setRequiresAck(e.target.checked)}
                                    />
                                }
                                label={
                                    <Typography variant="body2" sx={{ color: '#475569' }}>
                                        Require employee acknowledgment
                                    </Typography>
                                }
                            />
                            <TextField
                                size="small"
                                label="Internal Note (optional)"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                fullWidth
                            />
                        </Stack>

                        {Object.keys(formErrors).filter((k) => k !== '_employees').length > 0 && (
                            <Alert severity="error" sx={{ borderRadius: 2 }}>
                                Please fill all required fields before generating the preview.
                            </Alert>
                        )}
                    </Stack>
                ) : (
                    /* ── Preview step ─────────────────────────────────── */
                    <Box sx={{ height: '100%' }}>
                        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PreviewOutlinedIcon sx={{ color: '#C62828', fontSize: 18 }} />
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
                                Preview — {typeLabel}
                                {selectedEmployees.length > 0 && (
                                    <Typography component="span" variant="caption" sx={{ color: '#94a3b8', ml: 1 }}>
                                        showing first employee: {selectedEmployees[0].fullName}
                                    </Typography>
                                )}
                            </Typography>
                        </Box>

                        {previewLoading && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 2 }}>
                                <CircularProgress size={32} sx={{ color: '#E53935' }} />
                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                    Generating preview…
                                </Typography>
                            </Box>
                        )}
                        {previewError && (
                            <Alert severity="error" sx={{ borderRadius: 2 }}>{previewError}</Alert>
                        )}
                        {!previewLoading && !previewError && previewBlob && (
                            <Box sx={{
                                background: '#525659',
                                borderRadius: 2,
                                p: 2,
                                overflowY: 'auto',
                                maxHeight: 'calc(90vh - 220px)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                            }}>
                                <Suspense fallback={<CircularProgress />}>
                                <PdfDocument
                                    file={previewBlob}
                                    onLoadSuccess={({ numPages }) => setPreviewNumPages(numPages)}
                                    onLoadError={() => setPreviewError('Failed to render PDF preview.')}
                                    loading=""
                                >
                                    {Array.from(new Array(previewNumPages || 0), (_, i) => (
                                        <Box key={`page_${i + 1}`} sx={{ mb: 1 }}>
                                            <PdfPage
                                                pageNumber={i + 1}
                                                scale={1.2}
                                                renderTextLayer
                                                renderAnnotationLayer
                                            />
                                        </Box>
                                    ))}
                                </PdfDocument>
                                </Suspense>
                            </Box>
                        )}

                        {assignError && (
                            <Alert severity="error" sx={{ mt: 2, borderRadius: 2, whiteSpace: 'pre-line' }}>
                                {assignError}
                            </Alert>
                        )}

                        {selectedEmployees.length > 1 && (
                            <Alert severity="info" sx={{ mt: 1.5, fontSize: '0.8rem' }}>
                                The preview shows the document for <strong>{selectedEmployees[0].fullName}</strong>.
                                Confirming will generate and assign documents for all {selectedEmployees.length} selected employees.
                            </Alert>
                        )}
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2, borderTop: '1px solid #e2e8f0', gap: 1, flexWrap: 'wrap' }}>
                {step === STEP.FORM && (
                    <>
                        <Button onClick={onClose} sx={{ textTransform: 'none' }}>Cancel</Button>
                        <Button
                            variant="contained"
                            onClick={handlePreview}
                            disabled={!template || selectedEmployees.length === 0}
                            startIcon={<PreviewOutlinedIcon />}
                            sx={primaryBtnSx}
                        >
                            Generate &amp; Preview
                        </Button>
                    </>
                )}
                {step === STEP.PREVIEW && (
                    <>
                        <Button onClick={() => { setStep(STEP.FORM); setPreviewBlob(null); setAssignError(''); }} sx={{ textTransform: 'none' }}>
                            ← Back to Form
                        </Button>
                        <Box sx={{ flex: 1 }} />
                        <Button onClick={onClose} sx={{ textTransform: 'none' }}>Cancel</Button>
                        <Button
                            variant="contained"
                            onClick={handleConfirmAssign}
                            disabled={assigning || !!previewError || previewLoading}
                            startIcon={assigning ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <AssignmentOutlinedIcon />}
                            sx={primaryBtnSx}
                        >
                            {assigning ? 'Assigning…' : `Confirm & Assign to ${selectedEmployees.length} Employee${selectedEmployees.length !== 1 ? 's' : ''}`}
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
}
