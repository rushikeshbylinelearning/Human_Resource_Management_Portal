import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Box,
    Typography,
    Snackbar,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Divider,
    Tabs,
    Tab,
} from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import FolderCopyOutlinedIcon from '@mui/icons-material/FolderCopyOutlined';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import PolicyIcon from '@mui/icons-material/Policy';
import PageHeroHeader from '../components/PageHeroHeader';
import PolicyUploadForm from '../components/PolicyUploadForm';
import PolicyViewer from '../components/PolicyViewer';
import AnonymousMessagesList from '../components/AnonymousMessagesList';
import PolicyListCompact from '../components/PolicyListCompact';
import ComplianceDashboard from '../components/onboarding/ComplianceDashboard';
import EmployeeDocumentsDashboard from '../components/employeeDocuments/EmployeeDocumentsDashboard';
import OnboardingControlPanel from '../components/admin/OnboardingControlPanel';
import HRQueryManagement from '../components/admin/HRQueryManagement';
import PolicyTemplateList from '../components/admin/PolicyTemplateList';
import api from '../api/axios';
import '../styles/AdminPoliciesPage.css';
import {
    cardSx,
    primaryBtnSx,
    tabBarSx,
    TEXT,
    MUTED,
    SURFACE,
    SUCCESS_BG,
    SUCCESS_TEXT,
    INFO_BG,
    INFO_TEXT,
    FONT,
} from '../theme/policiesPageTheme';

const scrollBoxSx = {
    overflowY: 'auto',
    pr: 1,
    '&::-webkit-scrollbar': { width: '6px' },
    '&::-webkit-scrollbar-track': { background: '#f1f1f1', borderRadius: '4px' },
    '&::-webkit-scrollbar-thumb': { background: '#888', borderRadius: '4px' },
    '&::-webkit-scrollbar-thumb:hover': { background: '#555' },
};

const AdminPoliciesPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab = searchParams.get('tab') === 'employee-documents' ? 4 : 0;
    const [activeTab, setActiveTab] = useState(initialTab);
    const [policies, setPolicies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [viewerOpen, setViewerOpen] = useState(false);
    const [selectedPolicy, setSelectedPolicy] = useState(null);
    const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
    const [policyToReplace, setPolicyToReplace] = useState(null);
    const [anonymousMessages, setAnonymousMessages] = useState([]);
    const [messagesLoading, setMessagesLoading] = useState(true);
    const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);

    useEffect(() => {
        loadPolicies();
        loadAnonymousMessages();
    }, []);

    useEffect(() => {
        if (searchParams.get('tab') === 'employee-documents') {
            setActiveTab(4);
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    const loadPolicies = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/policies-gridfs');
            setPolicies(data.policies || []);
        } catch (error) {
            console.error('Failed to load policies:', error);
            setSnackbar({ open: true, message: 'Failed to load policies', severity: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const loadAnonymousMessages = async () => {
        setMessagesLoading(true);
        try {
            const { data } = await api.get('/policies/anonymous-feedback');
            setAnonymousMessages(data.feedback || []);
        } catch (error) {
            console.error('Failed to load anonymous messages:', error);
            setSnackbar({ open: true, message: 'Failed to load anonymous messages', severity: 'error' });
        } finally {
            setMessagesLoading(false);
        }
    };

    const handleDeleteMessage = (messageId) => {
        setAnonymousMessages(prev => prev.filter(msg => msg._id !== messageId));
        setSnackbar({ open: true, message: 'Message deleted successfully', severity: 'success' });
    };

    const handleUpload = async (formData) => {
        setSubmitting(true);
        try {
            await api.post('/policies-gridfs/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setSnackbar({ open: true, message: 'Policy uploaded successfully', severity: 'success' });
            loadPolicies();
        } catch (error) {
            console.error('Failed to upload policy:', error);
            setSnackbar({
                open: true,
                message: error.response?.data?.error || 'Failed to upload policy',
                severity: 'error'
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleReplace = async (policyId, formData) => {
        setSubmitting(true);
        try {
            await api.post(`/policies-gridfs/${policyId}/replace`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setSnackbar({ open: true, message: 'Policy replaced successfully', severity: 'success' });
            setReplaceDialogOpen(false);
            setPolicyToReplace(null);
            loadPolicies();
        } catch (error) {
            console.error('Failed to replace policy:', error);
            setSnackbar({
                open: true,
                message: error.response?.data?.error || 'Failed to replace policy',
                severity: 'error'
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (policyId) => {
        if (!window.confirm('Are you sure you want to delete this policy?')) return;
        try {
            await api.delete(`/policies-gridfs/${policyId}`);
            setSnackbar({ open: true, message: 'Policy deleted successfully', severity: 'success' });
            loadPolicies();
        } catch (error) {
            console.error('Failed to delete policy:', error);
            setSnackbar({
                open: true,
                message: error.response?.data?.error || 'Failed to delete policy',
                severity: 'error'
            });
        }
    };

    const handleView = (policy) => {
        setSelectedPolicy(policy);
        setViewerOpen(true);
    };

    const openReplaceDialog = (policy) => {
        setPolicyToReplace(policy);
        setReplaceDialogOpen(true);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    };

    return (
        <Box className="admin-policies-page" sx={{ width: '100%', maxWidth: '100%', minHeight: '100%', background: '#F8F9FB', boxSizing: 'border-box', fontFamily: FONT }}>
            <PageHeroHeader
                eyebrow="Operations Control"
                title="Policies Management"
                description="Upload, manage, and monitor company policy compliance."
            />

            {/* Tab navigation */}
            <Box className="policies-tabs-wrap">
                <Tabs
                    value={activeTab}
                    onChange={(_, v) => setActiveTab(v)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={tabBarSx}
                >
                    <Tab icon={<DescriptionOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Policies" />
                    <Tab icon={<QuestionAnswerIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="HR Queries" />
                    <Tab icon={<ForumOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Anonymous Messages" />
                    <Tab icon={<VerifiedUserOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Onboarding Compliance" />
                    <Tab icon={<FolderCopyOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Employee Documents" />
                    <Tab icon={<PolicyIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Consent Templates" />
                </Tabs>
            </Box>

            <Box sx={{ py: 0, px: 0, maxWidth: '100%' }}>

                {/* ── Tab 0: Policies ──────────────────────────────────────── */}
                {activeTab === 0 && (
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                        gap: 3,
                        width: '100%'
                    }}>
                        <Box sx={cardSx}>
                            <Typography sx={{ fontWeight: 700, color: TEXT, fontSize: '1rem', letterSpacing: '-0.015em', mb: 2.5, fontFamily: FONT }}>
                                Upload New Policy
                            </Typography>
                            <PolicyUploadForm onSubmit={handleUpload} submitting={submitting} />

                            <Divider sx={{ my: 3 }} />

                            <Typography sx={{ fontWeight: 700, color: TEXT, fontSize: '1rem', letterSpacing: '-0.015em', mb: 2, fontFamily: FONT }}>
                                Existing Policies
                            </Typography>
                            <Box sx={{ maxHeight: '400px', ...scrollBoxSx }}>
                                <PolicyListCompact
                                    policies={policies}
                                    loading={loading}
                                    onView={handleView}
                                    onReplace={openReplaceDialog}
                                    onDelete={handleDelete}
                                    formatDate={formatDate}
                                />
                            </Box>
                        </Box>

                        {/* Right column: quick stats */}
                        <Box sx={cardSx}>
                            <Typography sx={{ fontWeight: 700, color: TEXT, fontSize: '1rem', letterSpacing: '-0.015em', mb: 2.5, fontFamily: FONT }}>
                                Policy Overview
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1.5, background: SURFACE, borderRadius: '10px', border: '1px solid #E5E7EB' }}>
                                    <Typography variant="body2" sx={{ color: MUTED, fontWeight: 500 }}>Total Policies</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700, color: TEXT }}>{policies.length}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1.5, background: SUCCESS_BG, borderRadius: '10px', border: '1px solid #C8E6C9' }}>
                                    <Typography variant="body2" sx={{ color: SUCCESS_TEXT, fontWeight: 500 }}>Active</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700, color: SUCCESS_TEXT }}>
                                        {policies.filter(p => p.status === 'Active').length}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1.5, background: SURFACE, borderRadius: '10px', border: '1px solid #E5E7EB' }}>
                                    <Typography variant="body2" sx={{ color: MUTED, fontWeight: 500 }}>Archived</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700, color: TEXT }}>
                                        {policies.filter(p => p.status === 'Archived').length}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1.5, background: INFO_BG, borderRadius: '10px', border: '1px solid #BFDBFE' }}>
                                    <Typography variant="body2" sx={{ color: INFO_TEXT, fontWeight: 500 }}>Mandatory Onboarding</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700, color: INFO_TEXT }}>
                                        {policies.filter(p => p.isMandatoryOnboarding).length}
                                    </Typography>
                                </Box>
                            </Box>
                            <Box sx={{ mt: 3 }}>
                                <Typography variant="body2" sx={{ color: MUTED, fontSize: '0.8rem' }}>
                                    To configure the mandatory onboarding policy, go to the
                                    <strong style={{ color: '#C62828', cursor: 'pointer' }} onClick={() => setActiveTab(3)}>
                                        {' '}Onboarding Compliance
                                    </strong>{' '}tab.
                                </Typography>
                            </Box>
                        </Box>
                    </Box>
                )}

                {/* ── Tab 1: HR Queries ─────────────────────────────────── */}
                {activeTab === 1 && (
                    <Box sx={{ width: '100%', minWidth: 0, minHeight: 0 }}>
                        <HRQueryManagement />
                    </Box>
                )}

                {/* ── Tab 2: Anonymous Messages ────────────────────────────── */}
                {activeTab === 2 && (
                    <Box sx={cardSx}>
                        <Typography sx={{ fontWeight: 700, color: TEXT, fontSize: '1rem', letterSpacing: '-0.015em', mb: 2.5, fontFamily: FONT }}>
                            Anonymous Messages
                        </Typography>
                        <Box sx={{ maxHeight: '700px', ...scrollBoxSx }}>
                            <AnonymousMessagesList
                                messages={anonymousMessages}
                                loading={messagesLoading}
                                onDelete={handleDeleteMessage}
                            />
                        </Box>
                    </Box>
                )}

                {/* ── Tab 3: Onboarding Compliance ─────────────────────────── */}
                {activeTab === 3 && (
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 2.5, gap: 2, flexWrap: 'wrap' }}>
                            <Box>
                                <Typography sx={{ fontWeight: 700, color: TEXT, fontSize: '1.05rem', letterSpacing: '-0.02em', fontFamily: FONT }}>
                                    Onboarding Compliance
                                </Typography>
                                <Typography sx={{ fontSize: '0.8rem', color: MUTED, mt: 0.35 }}>
                                    See who has finished notice, tour, and profile. Use the control panel to decide what people see on first login.
                                </Typography>
                            </Box>
                            <Button
                                variant="contained"
                                onClick={() => setAssignmentModalOpen(true)}
                                sx={primaryBtnSx}
                            >
                                Onboarding control panel
                            </Button>
                        </Box>
                        <ComplianceDashboard
                            policies={policies}
                            onRefreshPolicies={loadPolicies}
                            onOpenControl={() => setAssignmentModalOpen(true)}
                        />
                    </Box>
                )}

                {/* ── Tab 4: Employee Documents ─────────────────────────────── */}
                {activeTab === 4 && (
                    <Box sx={{ px: { xs: 0, sm: 0.5 } }}>
                        <EmployeeDocumentsDashboard />
                    </Box>
                )}

                {/* ── Tab 5: Consent Templates ──────────────────────────────── */}
                {activeTab === 5 && (
                    <Box sx={{ width: '100%' }}>
                        <PolicyTemplateList />
                    </Box>
                )}
            </Box>

            {/* Policy Viewer Dialog */}
            <Dialog open={viewerOpen} onClose={() => setViewerOpen(false)} maxWidth="lg" fullWidth
                PaperProps={{ sx: { height: '80vh' } }}>
                <DialogContent sx={{ p: 3 }}>
                    <PolicyViewer policy={selectedPolicy} onClose={() => setViewerOpen(false)} />
                </DialogContent>
            </Dialog>

            {/* Replace Policy Dialog */}
            <Dialog open={replaceDialogOpen} onClose={() => setReplaceDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Replace Policy: {policyToReplace?.name}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" mb={3}>
                        Upload a new version. The current version will be automatically archived.
                    </Typography>
                    <PolicyUploadForm
                        onSubmit={(formData) => handleReplace(policyToReplace._id, formData)}
                        submitting={submitting}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setReplaceDialogOpen(false)}>Cancel</Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                    severity={snackbar.severity}
                    variant="filled"
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>

            {/* Policy Assignment Modal */}
            <OnboardingControlPanel
                open={assignmentModalOpen}
                onClose={() => setAssignmentModalOpen(false)}
                onSaved={() => {
                    loadPolicies();
                    setSnackbar({
                        open: true,
                        message: 'Onboarding settings updated',
                        severity: 'success',
                    });
                }}
            />
        </Box>
    );
};

export default AdminPoliciesPage;
