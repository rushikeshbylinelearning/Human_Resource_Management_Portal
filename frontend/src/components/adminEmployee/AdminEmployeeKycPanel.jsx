// frontend/src/components/adminEmployee/AdminEmployeeKycPanel.jsx
// Admin/HR view of an employee's KYC documents.
// Embedded as a sub-section inside the existing Employee Documents tab.
import { useEffect, useState, useCallback } from 'react';
import {
    Box, Typography, Chip, CircularProgress, Stack, Grid, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, Button, IconButton,
    Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import FingerprintOutlinedIcon from '@mui/icons-material/FingerprintOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import api from '../../api/axios';
import { RED, TEXT, MUTED, BORDER, profileCardSx, iconWellSx } from './adminEmployeeTheme';

// ─── Document type catalogue (mirrors backend) ────────────────────────────────
const KYC_TYPES = [
    { key: 'aadhaar',                 label: 'Aadhaar Card',             isOptional: false },
    { key: 'pan',                     label: 'PAN Card',                 isOptional: false },
    { key: 'educational_certificate', label: 'Educational Certificates', isOptional: false },
    { key: 'utility_bill',            label: 'Utility Bill',             isOptional: false, orGroup: 'address_proof' },
    { key: 'rent_agreement',          label: 'Rent Agreement',           isOptional: false, orGroup: 'address_proof' },
    { key: 'salary_slip',             label: 'Salary Slips',             isOptional: false, orGroup: 'income_proof' },
    { key: 'bank_statement',          label: 'Bank Statements',          isOptional: false, orGroup: 'income_proof' },
    { key: 'bank_details',            label: 'Bank Details',             isOptional: false, orGroup: 'bank_proof' },
    { key: 'cancelled_cheque',        label: 'Cancelled Cheque',         isOptional: false, orGroup: 'bank_proof' },
    { key: 'passport',                label: 'Passport',                 isOptional: true },
    { key: 'driving_license',         label: "Driver's License",         isOptional: true },
    { key: 'relieving_letter',        label: 'Relieving Letter',         isOptional: true },
    { key: 'experience_letter',       label: 'Experience Letter',        isOptional: true },
];

// ─── Status config ────────────────────────────────────────────────────────────
const statusConfig = {
    pending_review: {
        label: 'Pending Review',
        color: '#92400e',
        bg: '#fffbeb',
        border: '#fde68a',
        icon: <HourglassEmptyOutlinedIcon sx={{ fontSize: 13 }} />,
    },
    verified: {
        label: 'Verified',
        color: '#166534',
        bg: '#f0fdf4',
        border: '#bbf7d0',
        icon: <CheckCircleOutlineIcon sx={{ fontSize: 13 }} />,
    },
    rejected: {
        label: 'Rejected',
        color: '#b91c1c',
        bg: '#fef2f2',
        border: '#fecaca',
        icon: <CancelOutlinedIcon sx={{ fontSize: 13 }} />,
    },
    not_uploaded: {
        label: 'Not Uploaded',
        color: '#6b7280',
        bg: '#f9fafb',
        border: '#e5e7eb',
        icon: <UploadFileOutlinedIcon sx={{ fontSize: 13 }} />,
    },
};

const KycStatusChip = ({ status }) => {
    const cfg = statusConfig[status] || statusConfig.not_uploaded;
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
                border: `1px solid ${cfg.border}`,
                '& .MuiChip-icon': { color: 'inherit' },
            }}
        />
    );
};

// ─── Reject dialog ────────────────────────────────────────────────────────────
const RejectDialog = ({ open, onClose, onConfirm, loading }) => {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');

    const handleConfirm = () => {
        if (!reason.trim()) { setError('Please provide a rejection reason.'); return; }
        onConfirm(reason.trim());
    };

    const handleClose = () => {
        setReason('');
        setError('');
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>Reject Document</DialogTitle>
            <DialogContent>
                <Typography variant="body2" sx={{ color: MUTED, mb: 2 }}>
                    Provide a clear reason so the employee knows what to fix when re-uploading.
                </Typography>
                <TextField
                    autoFocus
                    fullWidth
                    multiline
                    minRows={2}
                    maxRows={4}
                    label="Rejection Reason"
                    value={reason}
                    onChange={(e) => { setReason(e.target.value); setError(''); }}
                    error={!!error}
                    helperText={error}
                    sx={{
                        '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: RED },
                        '& .MuiInputLabel-root.Mui-focused': { color: RED },
                    }}
                />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
                <Button
                    onClick={handleClose}
                    disabled={loading}
                    sx={{ textTransform: 'none', color: MUTED, fontWeight: 600 }}
                >
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleConfirm}
                    disabled={loading || !reason.trim()}
                    sx={{
                        textTransform: 'none',
                        fontWeight: 700,
                        background: '#b91c1c',
                        borderRadius: 2,
                        boxShadow: 'none',
                        '&:hover': { background: '#991b1b', boxShadow: 'none' },
                    }}
                >
                    {loading ? 'Rejecting…' : 'Reject'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

// ─── Main panel ───────────────────────────────────────────────────────────────
const AdminEmployeeKycPanel = ({ employeeId, flush = false }) => {
    const [rows, setRows] = useState([]); // array of { key, label, isOptional, document | null }
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(null); // docId | null
    const [rejectTarget, setRejectTarget] = useState(null);   // { docId } | null
    const [deleteTarget, setDeleteTarget] = useState(null);   // { docId, label } | null
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterType, setFilterType] = useState('all');
    const [snack, setSnack] = useState({ open: false, msg: '', isError: false });

    const load = useCallback(async () => {
        if (!employeeId) return;
        setLoading(true);
        try {
            const { data } = await api.get(`/kyc/admin/employee/${employeeId}`);
            setRows(data.documents || []);
        } catch (e) {
            console.error('[KYC Admin]', e);
        } finally {
            setLoading(false);
        }
    }, [employeeId]);

    useEffect(() => { load(); }, [load]);

    const showSnack = (msg, isError = false) => {
        setSnack({ open: true, msg, isError });
        setTimeout(() => setSnack((s) => ({ ...s, open: false })), 4000);
    };

    const handleView = async (docId) => {
        setActionLoading(docId);
        try {
            const { data } = await api.get(`/kyc/view/${docId}`);
            window.open(data.presignedGetUrl, '_blank', 'noopener,noreferrer');
        } catch (e) {
            showSnack(e.response?.data?.error || 'Failed to open document.', true);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDownload = async (doc) => {
        if (!doc?._id) return;
        setActionLoading(doc._id);
        try {
            const { data } = await api.get(`/kyc/view/${doc._id}`, {
                params: { download: 1 },
            });
            const a = document.createElement('a');
            a.href = data.presignedGetUrl;
            a.download = data.fileName || doc.originalFileName || 'document';
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (e) {
            showSnack(e.response?.data?.error || 'Failed to download document.', true);
        } finally {
            setActionLoading(null);
        }
    };

    const handleVerify = async (docId) => {
        setActionLoading(docId);
        try {
            await api.post(`/kyc/admin/verify/${docId}`);
            showSnack('Document verified.');
            load();
        } catch (e) {
            showSnack(e.response?.data?.error || 'Verification failed.', true);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        const { docId } = deleteTarget;
        setActionLoading(docId);
        try {
            await api.delete(`/kyc/admin/${docId}`);
            showSnack('Document deleted.');
            setDeleteTarget(null);
            load();
        } catch (e) {
            showSnack(e.response?.data?.error || 'Delete failed.', true);
        } finally {
            setActionLoading(null);
        }
    };

    const handleRejectConfirm = async (reason) => {
        if (!rejectTarget) return;
        const { docId } = rejectTarget;
        setActionLoading(docId);
        try {
            await api.post(`/kyc/admin/reject/${docId}`, { reason });
            showSnack('Document rejected.');
            setRejectTarget(null);
            load();
        } catch (e) {
            showSnack(e.response?.data?.error || 'Rejection failed.', true);
        } finally {
            setActionLoading(null);
        }
    };

    const formatDate = (d) => {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const formatSize = (bytes) => {
        if (!bytes) return '—';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // Apply client-side filters
    const filteredRows = rows.filter((row) => {
        const docStatus = row.document ? row.document.status : 'not_uploaded';
        if (filterStatus !== 'all' && docStatus !== filterStatus) return false;
        if (filterType !== 'all' && row.key !== filterType) return false;
        return true;
    });

    // Summary counts
    const counts = rows.reduce((acc, row) => {
        const s = row.document ? row.document.status : 'not_uploaded';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
    }, {});

    const panelSx = {
        ...profileCardSx,
        mt: flush ? 0 : 2,
    };

    if (loading) {
        return (
            <Box sx={panelSx}>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                    <CircularProgress size={26} sx={{ color: RED }} />
                </Box>
            </Box>
        );
    }

    return (
        <>
            <Box sx={panelSx}>
                <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 2 }}>
                    <Box sx={iconWellSx('#EEF2FF', '#4338CA')}>
                        <FingerprintOutlinedIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: TEXT, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                            KYC Documents
                        </Typography>
                        <Typography sx={{ color: MUTED, fontSize: '0.75rem', mt: 0.25 }}>
                            {rows.length} document types · {counts.verified || 0} verified · {counts.pending_review || 0} pending
                        </Typography>
                    </Box>
                </Stack>

                <Grid container spacing={1.25} sx={{ mb: 2 }}>
                    {['verified', 'pending_review', 'rejected', 'not_uploaded'].map((s) => {
                        const cfg = statusConfig[s];
                        const count = counts[s] || 0;
                        return (
                            <Grid key={s} size={{ xs: 6, sm: 3 }}>
                                <Box
                                    sx={{
                                        px: 1.5,
                                        py: 1.25,
                                        borderRadius: '12px',
                                        background: cfg.bg,
                                        border: `1px solid ${cfg.border}`,
                                        height: '100%',
                                    }}
                                >
                                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: cfg.color }}>
                                        {cfg.label}
                                    </Typography>
                                    <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: cfg.color, lineHeight: 1.15, mt: 0.4, letterSpacing: '-0.03em' }}>
                                        {count}
                                    </Typography>
                                </Box>
                            </Grid>
                        );
                    })}
                </Grid>

                {/* ── Filters ── */}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel sx={{ '&.Mui-focused': { color: RED } }}>Status</InputLabel>
                        <Select
                            value={filterStatus}
                            label="Status"
                            onChange={(e) => setFilterStatus(e.target.value)}
                            sx={{ borderRadius: '10px', bgcolor: '#fff', '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: RED } }}
                        >
                            <MenuItem value="all">All Statuses</MenuItem>
                            <MenuItem value="pending_review">Pending Review</MenuItem>
                            <MenuItem value="verified">Verified</MenuItem>
                            <MenuItem value="rejected">Rejected</MenuItem>
                            <MenuItem value="not_uploaded">Not Uploaded</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel sx={{ '&.Mui-focused': { color: RED } }}>Document Type</InputLabel>
                        <Select
                            value={filterType}
                            label="Document Type"
                            onChange={(e) => setFilterType(e.target.value)}
                            sx={{ borderRadius: '10px', bgcolor: '#fff', '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: RED } }}
                        >
                            <MenuItem value="all">All Types</MenuItem>
                            {KYC_TYPES.map((t) => (
                                <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>

                {/* ── Table ── */}
                {filteredRows.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 5, borderRadius: '14px', border: '1px dashed #E4E7EC', bgcolor: '#FAFBFC' }}>
                        <FingerprintOutlinedIcon sx={{ fontSize: 36, color: '#D0D5DD', mb: 1 }} />
                        <Typography sx={{ color: TEXT, fontWeight: 700, fontSize: '0.9rem' }}>
                            {rows.length === 0 ? 'Nothing uploaded yet' : 'No matches'}
                        </Typography>
                        <Typography sx={{ color: MUTED, fontSize: '0.8rem', mt: 0.4 }}>
                            {rows.length === 0
                                ? 'Uploaded identity documents will appear in this list.'
                                : 'No documents match the selected filters.'}
                        </Typography>
                    </Box>
                ) : (
                    <TableContainer sx={{ border: `1px solid ${BORDER}`, borderRadius: '14px', overflow: 'hidden' }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ background: '#F8F9FB' }}>
                                    {['Document', 'Required', 'Uploaded', 'Size', 'Status', 'Verified By', 'Actions'].map((col) => (
                                        <TableCell
                                            key={col}
                                            sx={{
                                                fontWeight: 700,
                                                fontSize: '0.68rem',
                                                color: '#667085',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.06em',
                                                py: 1.4,
                                                whiteSpace: 'nowrap',
                                                borderBottom: `1px solid ${BORDER}`,
                                            }}
                                        >
                                            {col}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredRows.map((row) => {
                                    const doc = row.document;
                                    const docStatus = doc ? doc.status : 'not_uploaded';
                                    const isActing = actionLoading === doc?._id;

                                    return (
                                        <TableRow
                                            key={row.key}
                                            hover
                                            sx={{
                                                '&:last-child td': { borderBottom: 0 },
                                                '& td': { py: 1.35, borderColor: '#F0F2F5' },
                                            }}
                                        >
                                            <TableCell>
                                                <Stack direction="row" spacing={1.25} alignItems="center">
                                                    <Box
                                                        sx={{
                                                            width: 32,
                                                            height: 32,
                                                            borderRadius: '9px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            flexShrink: 0,
                                                            bgcolor: doc ? (statusConfig[docStatus]?.bg || '#F8F9FB') : '#F8F9FB',
                                                            color: doc ? (statusConfig[docStatus]?.color || '#98A2B3') : '#98A2B3',
                                                        }}
                                                    >
                                                        <UploadFileOutlinedIcon sx={{ fontSize: 16 }} />
                                                    </Box>
                                                    <Box sx={{ minWidth: 0 }}>
                                                        <Typography sx={{ fontWeight: 700, fontSize: '0.84rem', color: TEXT, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                                                            {row.label}
                                                        </Typography>
                                                        {doc?.originalFileName && (
                                                            <Typography variant="caption" sx={{ color: '#98A2B3', display: 'block' }}>
                                                                {doc.originalFileName}
                                                            </Typography>
                                                        )}
                                                        {doc?.status === 'rejected' && doc?.rejectionReason && (
                                                            <Typography variant="caption" sx={{ color: '#b91c1c', display: 'block' }}>
                                                                {doc.rejectionReason}
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                </Stack>
                                            </TableCell>

                                            {/* Required / Either / Optional */}
                                            <TableCell>
                                                {(() => {
                                                    const requirement = row.orGroup
                                                        ? { label: 'Either', background: '#f5f3ff', color: '#5b21b6', border: '#ddd6fe' }
                                                        : row.isOptional
                                                            ? { label: 'Optional', background: '#f0f9ff', color: '#0369a1', border: '#bae6fd' }
                                                            : { label: 'Required', background: '#fef3c7', color: '#92400e', border: '#fde68a' };
                                                    return (
                                                        <Chip
                                                            size="small"
                                                            label={requirement.label}
                                                            sx={{
                                                                fontSize: '0.68rem',
                                                                fontWeight: 600,
                                                                background: requirement.background,
                                                                color: requirement.color,
                                                                border: `1px solid ${requirement.border}`,
                                                            }}
                                                        />
                                                    );
                                                })()}
                                            </TableCell>

                                            {/* Uploaded date */}
                                            <TableCell sx={{ fontSize: '0.8125rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                                                {doc ? formatDate(doc.uploadedAt) : '—'}
                                            </TableCell>

                                            {/* File size */}
                                            <TableCell sx={{ fontSize: '0.8125rem', color: '#64748b' }}>
                                                {doc ? formatSize(doc.fileSize) : '—'}
                                            </TableCell>

                                            {/* Status */}
                                            <TableCell>
                                                <KycStatusChip status={docStatus} />
                                            </TableCell>

                                            {/* Verified by */}
                                            <TableCell sx={{ fontSize: '0.8125rem', color: '#64748b' }}>
                                                {doc?.verifiedBy?.fullName || (doc?.verifiedAt ? 'Admin' : '—')}
                                                {doc?.verifiedAt && (
                                                    <Typography variant="caption" sx={{ display: 'block', color: '#94a3b8' }}>
                                                        {formatDate(doc.verifiedAt)}
                                                    </Typography>
                                                )}
                                            </TableCell>

                                            {/* Actions */}
                                            <TableCell>
                                                <Stack direction="row" spacing={0.5} alignItems="center">
                                                    {doc && (
                                                        <Tooltip title="View document">
                                                            <span>
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => handleView(doc._id)}
                                                                    disabled={isActing}
                                                                    sx={{ color: '#4338CA', bgcolor: '#EEF2FF', '&:hover': { bgcolor: '#E0E7FF' } }}
                                                                >
                                                                    {isActing ? (
                                                                        <CircularProgress size={14} sx={{ color: '#4338CA' }} />
                                                                    ) : (
                                                                        <VisibilityOutlinedIcon fontSize="small" />
                                                                    )}
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                    )}

                                                    {doc && (
                                                        <Tooltip title="Download document">
                                                            <span>
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => handleDownload(doc)}
                                                                    disabled={isActing}
                                                                    sx={{ color: '#64748b' }}
                                                                >
                                                                    <DownloadOutlinedIcon fontSize="small" />
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                    )}

                                                    {doc && docStatus !== 'verified' && (
                                                        <Tooltip title="Verify document">
                                                            <span>
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => handleVerify(doc._id)}
                                                                    disabled={isActing}
                                                                    sx={{ color: '#16a34a' }}
                                                                >
                                                                    <VerifiedOutlinedIcon fontSize="small" />
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                    )}

                                                    {doc && (
                                                        <Tooltip title="Delete document">
                                                            <span>
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => setDeleteTarget({ docId: doc._id, label: row.label })}
                                                                    disabled={isActing}
                                                                    sx={{ color: '#b91c1c' }}
                                                                >
                                                                    <DeleteOutlineIcon fontSize="small" />
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                    )}

                                                    {doc && docStatus !== 'rejected' && (
                                                        <Tooltip title="Reject document">
                                                            <span>
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => setRejectTarget({ docId: doc._id })}
                                                                    disabled={isActing}
                                                                    sx={{ color: '#dc2626' }}
                                                                >
                                                                    <CancelOutlinedIcon fontSize="small" />
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                    )}

                                                    {!doc && (
                                                        <Chip
                                                            size="small"
                                                            label="Awaiting upload"
                                                            sx={{
                                                                height: 24,
                                                                fontSize: '0.7rem',
                                                                fontWeight: 600,
                                                                color: '#667085',
                                                                bgcolor: '#F8F9FB',
                                                                border: `1px solid ${BORDER}`,
                                                            }}
                                                        />
                                                    )}
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}

                {/* Pending warning */}
                {(counts.pending_review || 0) > 0 && (
                    <Box sx={{ mt: 2, p: 1.5, background: '#fffbeb', borderRadius: 2, border: '1px solid #fde68a' }}>
                        <Typography variant="caption" sx={{ color: '#92400e', fontWeight: 600 }}>
                            {counts.pending_review} document{counts.pending_review === 1 ? '' : 's'} awaiting review.
                        </Typography>
                    </Box>
                )}
            </Box>

            <Dialog
                open={!!deleteTarget}
                onClose={() => actionLoading !== deleteTarget?.docId && setDeleteTarget(null)}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Delete document</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: TEXT }}>
                        Delete the uploaded {deleteTarget?.label || 'document'}? The file is removed and this row goes back to not uploaded.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button
                        onClick={() => setDeleteTarget(null)}
                        disabled={actionLoading === deleteTarget?.docId}
                        sx={{ textTransform: 'none' }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleDeleteConfirm}
                        disabled={actionLoading === deleteTarget?.docId}
                        sx={{ textTransform: 'none', fontWeight: 700, background: '#b91c1c', boxShadow: 'none', '&:hover': { background: '#991b1b', boxShadow: 'none' } }}
                    >
                        {actionLoading === deleteTarget?.docId ? 'Deleting…' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Reject dialog */}
            <RejectDialog
                open={!!rejectTarget}
                onClose={() => setRejectTarget(null)}
                onConfirm={handleRejectConfirm}
                loading={!!actionLoading}
            />

            {/* Toast */}
            {snack.open && (
                <Box
                    role="status"
                    aria-live="polite"
                    sx={{
                        position: 'fixed',
                        bottom: 24,
                        right: 24,
                        zIndex: 9999,
                        background: snack.isError ? '#fef2f2' : '#f0fdf4',
                        border: `1px solid ${snack.isError ? '#fecaca' : '#bbf7d0'}`,
                        color: snack.isError ? '#b91c1c' : '#166534',
                        borderRadius: 2,
                        px: 2.5,
                        py: 1.5,
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
                        maxWidth: 360,
                    }}
                >
                    {snack.msg}
                </Box>
            )}
        </>
    );
};

export default AdminEmployeeKycPanel;
