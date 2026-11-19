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
    Divider, Chip,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PreviewOutlinedIcon from '@mui/icons-material/PreviewOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import api from '../../api/axios';
import { PdfDocument, PdfPage } from '../lazy/LazyPdfComponents';
import {
    RED, RED_DARK, RED_BG, TEXT, MUTED, BORDER, SURFACE, FONT,
    INFO_BG, INFO_TEXT,
    primaryBtnSx, ghostBtnSx, fieldSx, iconBoxSx,
} from '../../theme/policiesPageTheme';

const TYPE_LABELS = {
    joining_letter: 'Joining Letter',
    kra: 'KRA Letter',
    probation_confirmation: 'Probation Confirmation',
    probation_extension: 'Probation Extension',
};

const sectionLabelSx = {
    fontWeight: 700,
    fontSize: '0.88rem',
    color: TEXT,
    fontFamily: FONT,
    letterSpacing: '-0.01em',
    mb: 1,
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
            PaperProps={{
                sx: {
                    height: step === STEP.PREVIEW ? '88vh' : 'auto',
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
                        <AssignmentOutlinedIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: TEXT, letterSpacing: '-0.02em', fontFamily: FONT, lineHeight: 1.25 }}>
                            Assign {typeLabel}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.55, flexWrap: 'wrap' }}>
                            {template && (
                                <Chip
                                    size="small"
                                    label={`Template v${template.version}`}
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
                            )}
                            <Typography sx={{ fontSize: '0.75rem', color: MUTED, fontFamily: FONT }}>
                                Fields auto-fill from the employee profile
                            </Typography>
                        </Box>
                    </Box>
                </Box>
            </DialogTitle>

            <DialogContent sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
                {loadingTemplate ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                        <CircularProgress size={28} sx={{ color: RED }} />
                    </Box>
                ) : templateError ? (
                    <Alert
                        severity="warning"
                        icon={<WarningAmberOutlinedIcon />}
                        sx={{ borderRadius: '10px' }}
                    >
                        {templateError}
                    </Alert>
                ) : step === STEP.FORM ? (
                    <Stack spacing={2.25}>
                        <Box>
                            <Typography sx={sectionLabelSx}>Employees</Typography>
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
                                        label="Select employees"
                                        size="small"
                                        placeholder="Search by name or code"
                                        error={!!formErrors._employees}
                                        helperText={formErrors._employees}
                                        sx={fieldSx}
                                    />
                                )}
                            />
                            {selectedEmployees.length > 1 && (
                                <Alert severity="info" sx={{ mt: 1.25, fontSize: '0.8rem', py: 0.75, borderRadius: '10px', background: INFO_BG, color: INFO_TEXT, border: '1px solid #BFDBFE' }}>
                                    Auto-fill uses the <strong>first selected employee</strong>. The same values apply to all {selectedEmployees.length} employees.
                                </Alert>
                            )}
                        </Box>

                        {selectedEmployees.length > 0 && Object.keys(autoFilledValues).length > 0 && (
                            <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: '12px', p: 1.75, background: SURFACE }}>
                                <Typography sx={{ ...sectionLabelSx, display: 'flex', alignItems: 'center', gap: 0.6, mb: 1.25 }}>
                                    <LockOutlinedIcon sx={{ fontSize: 15, color: RED_DARK }} />
                                    Auto-filled from profile
                                    {loadingContext && (
                                        <CircularProgress size={12} sx={{ ml: 0.5, color: RED }} />
                                    )}
                                </Typography>
                                <Box sx={{
                                    display: 'grid',
                                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                                    gap: 1,
                                }}>
                                    {(template?.fieldsSchema || [])
                                        .filter((f) => f.autoFillFrom && autoFilledValues[f.key] !== undefined && autoFilledValues[f.key] !== '')
                                        .map((f) => (
                                            <Box key={f.key} sx={{
                                                px: 1.25,
                                                py: 1,
                                                borderRadius: '8px',
                                                background: '#fff',
                                                border: `1px solid ${BORDER}`,
                                            }}>
                                                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: FONT }}>
                                                    {f.label}
                                                </Typography>
                                                <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: TEXT, mt: 0.25, fontFamily: FONT }}>
                                                    {autoFilledValues[f.key] || '—'}
                                                </Typography>
                                            </Box>
                                        ))
                                    }
                                </Box>
                            </Box>
                        )}

                        {selectedEmployees.length > 0 && manualFields.length > 0 && (
                            <Box>
                                <Typography sx={sectionLabelSx}>
                                    Additional Fields
                                    {loadingContext && (
                                        <CircularProgress size={14} sx={{ ml: 1, color: RED, verticalAlign: 'middle' }} />
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
                                                    sx={fieldSx}
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
                                                    sx={fieldSx}
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
                                                    sx={fieldSx}
                                                />
                                            )}
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>
                        )}

                        {template?.notesFieldLabel && (
                            <Box>
                                <Divider sx={{ mb: 2 }} />
                                <Typography sx={sectionLabelSx}>{template.notesFieldLabel}</Typography>
                                <TextField
                                    fullWidth
                                    multiline
                                    minRows={3}
                                    size="small"
                                    placeholder="Enter any additional notes to include in this letter…"
                                    value={notesContent}
                                    onChange={(e) => setNotesContent(e.target.value)}
                                    sx={fieldSx}
                                />
                            </Box>
                        )}

                        <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: '12px', p: 1.75, background: SURFACE }}>
                            <FormControlLabel
                                sx={{ ml: 0, mb: 1.25 }}
                                control={
                                    <Switch
                                        size="small"
                                        checked={requiresAck}
                                        onChange={(e) => setRequiresAck(e.target.checked)}
                                        sx={{
                                            '& .MuiSwitch-switchBase.Mui-checked': { color: RED },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: RED },
                                        }}
                                    />
                                }
                                label={
                                    <Typography sx={{ fontSize: '0.85rem', color: TEXT, fontFamily: FONT, fontWeight: 500 }}>
                                        Require employee acknowledgment
                                    </Typography>
                                }
                            />
                            <TextField
                                size="small"
                                label="Internal note (optional)"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                fullWidth
                                sx={fieldSx}
                            />
                        </Box>

                        {Object.keys(formErrors).filter((k) => k !== '_employees').length > 0 && (
                            <Alert severity="error" sx={{ borderRadius: '10px' }}>
                                Please fill all required fields before generating the preview.
                            </Alert>
                        )}
                    </Stack>
                ) : (
                    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                            <PreviewOutlinedIcon sx={{ color: RED_DARK, fontSize: 18 }} />
                            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: TEXT, fontFamily: FONT }}>
                                Preview — {typeLabel}
                                {selectedEmployees.length > 0 && (
                                    <Typography component="span" sx={{ fontSize: '0.75rem', color: MUTED, ml: 1, fontWeight: 500 }}>
                                        {selectedEmployees[0].fullName}
                                    </Typography>
                                )}
                            </Typography>
                        </Box>

                        {previewLoading && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 2 }}>
                                <CircularProgress size={32} sx={{ color: RED }} />
                                <Typography sx={{ fontSize: '0.85rem', color: MUTED, fontFamily: FONT }}>
                                    Generating preview…
                                </Typography>
                            </Box>
                        )}
                        {previewError && (
                            <Alert severity="error" sx={{ borderRadius: '10px' }}>{previewError}</Alert>
                        )}
                        {!previewLoading && !previewError && previewBlob && (
                            <Box sx={{
                                flex: 1,
                                minHeight: 0,
                                background: '#3f4450',
                                borderRadius: '12px',
                                p: 2,
                                overflowY: 'auto',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                            }}>
                                <Suspense fallback={<CircularProgress sx={{ color: '#fff' }} />}>
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
                            <Alert severity="error" sx={{ mt: 2, borderRadius: '10px', whiteSpace: 'pre-line' }}>
                                {assignError}
                            </Alert>
                        )}

                        {selectedEmployees.length > 1 && (
                            <Alert severity="info" sx={{ mt: 1.5, fontSize: '0.8rem', borderRadius: '10px', background: INFO_BG, color: INFO_TEXT, border: '1px solid #BFDBFE' }}>
                                Preview shows <strong>{selectedEmployees[0].fullName}</strong>. Confirming assigns to all {selectedEmployees.length} employees.
                            </Alert>
                        )}
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 1.75, borderTop: `1px solid ${BORDER}`, gap: 1, flexWrap: 'wrap' }}>
                {step === STEP.FORM && (
                    <>
                        <Button onClick={onClose} sx={ghostBtnSx}>Cancel</Button>
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
                        <Button onClick={() => { setStep(STEP.FORM); setPreviewBlob(null); setAssignError(''); }} sx={ghostBtnSx}>
                            ← Back
                        </Button>
                        <Box sx={{ flex: 1 }} />
                        <Button onClick={onClose} sx={ghostBtnSx}>Cancel</Button>
                        <Button
                            variant="contained"
                            onClick={handleConfirmAssign}
                            disabled={assigning || !!previewError || previewLoading}
                            startIcon={assigning ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <AssignmentOutlinedIcon />}
                            sx={primaryBtnSx}
                        >
                            {assigning ? 'Assigning…' : `Confirm & Assign (${selectedEmployees.length})`}
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
}
