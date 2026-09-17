import { useEffect, useState, useCallback, Suspense } from 'react';
import {
    Box, Typography, Chip, CircularProgress, Stack, Button, IconButton,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Dialog, DialogContent, Tooltip,
} from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import AdminEmployeeKycPanel from './AdminEmployeeKycPanel';
import api from '../../api/axios';
import { RED, RED_DARK, RED_BG, TEXT, MUTED, cardSx, sectionTitleSx } from './adminEmployeeTheme';

const SecurePdfViewer = lazyWithRetry(() => import('../SecurePdfViewer'));

const docStatusConfig = {
    pending: { label: 'Pending', color: '#92400e', bg: '#fef3c7', icon: <HourglassEmptyOutlinedIcon sx={{ fontSize: 14 }} /> },
    viewed: { label: 'Viewed', color: '#1e40af', bg: '#dbeafe', icon: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} /> },
    acknowledged: { label: 'Acknowledged', color: '#166534', bg: '#dcfce7', icon: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} /> },
    hr_pending: { label: 'HR Pending', color: '#9a3412', bg: '#ffedd5', icon: <WarningAmberOutlinedIcon sx={{ fontSize: 14 }} /> },
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
                '& .MuiChip-icon': { color: 'inherit' },
            }}
        />
    );
};

const AdminEmployeeDocumentsPanel = ({ employeeId }) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [viewerDoc, setViewerDoc] = useState(null);

    const loadDocuments = useCallback(async () => {
        if (!employeeId) return;
        setLoading(true);
        try {
            const { data } = await api.get(`/employee-documents/admin/compliance?employeeId=${employeeId}&limit=100`);
            setDocuments((data.records || []).filter((d) => d.fileRef));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [employeeId]);

    useEffect(() => { loadDocuments(); }, [loadDocuments]);

    const handleDownload = async (doc, e) => {
        e?.stopPropagation();
        try {
            const response = await api.get(`/employee-documents/${doc._id}/file`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = doc.fileName || `${doc.documentTypeLabel}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '—';
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric',
        });
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size={28} sx={{ color: RED }} />
            </Box>
        );
    }

    return (
        <>
            <Box sx={{ ...cardSx, borderLeft: `3px solid ${RED}` }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                    <DescriptionOutlinedIcon sx={{ fontSize: 20, color: RED }} />
                    <Box>
                        <Typography sx={{ ...sectionTitleSx, mb: 0 }}>
                            Assigned Letters & Documents
                        </Typography>
                        <Typography variant="caption" sx={{ color: MUTED }}>
                            {documents.length} document{documents.length === 1 ? '' : 's'} on file
                        </Typography>
                    </Box>
                </Stack>

                {documents.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 5, bgcolor: RED_BG, borderRadius: 2 }}>
                        <DescriptionOutlinedIcon sx={{ fontSize: 40, color: '#FBBCBC', mb: 1 }} />
                        <Typography variant="body2" sx={{ color: MUTED }}>
                            No documents have been assigned to this employee yet.
                        </Typography>
                    </Box>
                ) : (
                    <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ background: '#f8fafc' }}>
                                    {['Document', 'Assigned', 'Method', 'Ack Required', 'Status', 'Actions'].map((col) => (
                                        <TableCell
                                            key={col}
                                            sx={{
                                                fontWeight: 600,
                                                fontSize: '0.72rem',
                                                color: '#64748b',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.04em',
                                                py: 1.25,
                                            }}
                                        >
                                            {col}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {documents.map((doc) => (
                                    <TableRow key={doc._id} hover>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: TEXT }}>
                                                {doc.documentTypeLabel}
                                            </Typography>
                                            {doc.fileName && (
                                                <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                                    {doc.fileName}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell sx={{ fontSize: '0.8125rem', color: '#64748b' }}>
                                            {formatDate(doc.assignedAt)}
                                        </TableCell>
                                        <TableCell sx={{ fontSize: '0.8125rem', color: '#64748b', textTransform: 'capitalize' }}>
                                            {doc.method || 'manual'}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={doc.requiresAcknowledgment ? 'Yes' : 'No'}
                                                variant="outlined"
                                                sx={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 600,
                                                    borderColor: doc.requiresAcknowledgment ? '#c7d2fe' : '#e2e8f0',
                                                    color: doc.requiresAcknowledgment ? '#4338ca' : '#64748b',
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <DocStatusChip status={doc.displayStatus || doc.status} />
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={0.5}>
                                                <Tooltip title="View document">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => setViewerDoc(doc)}
                                                        sx={{ color: RED }}
                                                    >
                                                        <VisibilityOutlinedIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Download">
                                                    <IconButton
                                                        size="small"
                                                        onClick={(e) => handleDownload(doc, e)}
                                                        sx={{ color: '#64748b' }}
                                                    >
                                                        <DownloadOutlinedIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}

                {documents.some((d) => d.requiresAcknowledgment && !d.acknowledgedAt) && (
                    <Box sx={{ mt: 2, p: 1.5, background: RED_BG, borderRadius: 2, border: '1px solid #FBBCBC' }}>
                        <Typography variant="caption" sx={{ color: RED_DARK }}>
                            This employee has pending document acknowledgments.
                        </Typography>
                    </Box>
                )}
            </Box>

            {/* ── KYC Documents ── */}
            <AdminEmployeeKycPanel employeeId={employeeId} />

            {/* PDF Viewer Dialog */}
            <Dialog
                open={!!viewerDoc}
                onClose={() => setViewerDoc(null)}
                maxWidth="lg"
                fullWidth
                PaperProps={{ sx: { height: '85vh', borderRadius: 3, overflow: 'hidden' } }}
            >
                <DialogContent sx={{ p: 0, height: '100%', background: '#525659' }}>
                    {viewerDoc && (
                        <Suspense fallback={
                            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                <CircularProgress />
                            </Box>
                        }>
                            <SecurePdfViewer
                                pdfUrl={`/employee-documents/${viewerDoc._id}/file`}
                                policyName={viewerDoc.documentTypeLabel}
                                role="admin"
                                onClose={() => setViewerDoc(null)}
                            />
                        </Suspense>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
};

export default AdminEmployeeDocumentsPanel;
