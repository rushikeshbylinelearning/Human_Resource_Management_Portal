import React, { useState, useEffect } from 'react';
import {
  Box,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Typography,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PublishOutlinedIcon from '@mui/icons-material/PublishOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import AddIcon from '@mui/icons-material/Add';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import PolicyOutlinedIcon from '@mui/icons-material/PolicyOutlined';
import DraftsOutlinedIcon from '@mui/icons-material/DraftsOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { RED, RED_DARK, RED_BG, TEXT, MUTED, BORDER, SURFACE } from '../adminEmployee/adminEmployeeTheme';
import ConsentWizard from '../onboarding/ConsentWizard';
import OnboardingControlPanel from './OnboardingControlPanel';

const primaryBtnSx = {
  background: `linear-gradient(135deg, ${RED} 0%, ${RED_DARK} 100%)`,
  textTransform: 'none',
  fontWeight: 600,
  borderRadius: '10px',
  boxShadow: 'none',
  px: 2.25,
  '&:hover': {
    background: `linear-gradient(135deg, ${RED_DARK} 0%, #B71C1C 100%)`,
    boxShadow: 'none',
  },
};

const outlineBtnSx = {
  textTransform: 'none',
  fontWeight: 600,
  borderRadius: '10px',
  color: RED_DARK,
  borderColor: 'rgba(198, 40, 40, 0.28)',
  background: '#fff',
  '&:hover': {
    borderColor: RED,
    background: RED_BG,
  },
};

const statusSx = (status) => {
  if (status === 'active') {
    return { background: '#E8F5E9', color: '#2E7D32' };
  }
  if (status === 'draft') {
    return { background: RED_BG, color: RED_DARK };
  }
  return { background: '#F3F4F6', color: MUTED };
};

const PolicyTemplateList = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Import-from-PDF dialog state
  const [importOpen, setImportOpen] = useState(false);
  const [importName, setImportName] = useState('');
  const [importEffectiveDate, setImportEffectiveDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [previewLoadingId, setPreviewLoadingId] = useState(null);
  const [assignTemplateId, setAssignTemplateId] = useState(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/policy-templates');
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (templateId) => {
    navigate(`/admin/policy-templates/${templateId}/edit`);
  };

  const handlePublish = async (templateId) => {
    try {
      await api.post(`/policy-templates/${templateId}/publish`);
      loadTemplates();
    } catch (error) {
      console.error('Failed to publish template:', error);
    }
  };

  const handleCreateNew = () => {
    navigate('/admin/policy-templates/create');
  };

  const handlePreview = async (templateId) => {
    setPreviewLoadingId(templateId);
    try {
      const { data } = await api.get(`/policy-templates/${templateId}`);
      setPreviewTemplate(data.template);
      setPreviewOpen(true);
    } catch (error) {
      console.error('Failed to load template preview:', error);
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const openImportDialog = () => {
    setImportName('');
    setImportEffectiveDate(new Date().toISOString().split('T')[0]);
    setImportFile(null);
    setImportError('');
    setImportOpen(true);
  };

  // Import-from-PDF flow: upload the PDF to GridFS, create a draft template
  // pointed at it, run extraction, then drop HR straight into the editor to
  // review what was extracted. Three backend calls in sequence — extraction
  // itself can take a while (LLM round trip), so this stays a blocking modal
  // rather than optimistic navigation.
  const handleImportFromPdf = async () => {
    if (!importFile) {
      setImportError('Select a PDF file first.');
      return;
    }
    if (!importName.trim()) {
      setImportError('Template name is required.');
      return;
    }

    setImporting(true);
    setImportError('');
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const { data: uploadData } = await api.post(
        '/policy-templates/upload-source-pdf',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      const { data: createData } = await api.post('/policy-templates', {
        name: importName.trim(),
        effectiveDate: importEffectiveDate,
        sourceType: 'pdf_import',
        sourcePdfFileId: uploadData.fileId,
      });

      const templateId = createData.template._id;
      await api.post(`/policy-templates/${templateId}/extract-from-pdf`);

      setImportOpen(false);
      navigate(`/admin/policy-templates/${templateId}/edit`);
    } catch (error) {
      console.error('PDF import failed:', error);
      setImportError(
        error.response?.data?.details || error.response?.data?.error || 'Import failed. Please try again.'
      );
    } finally {
      setImporting(false);
    }
  };

  const draftCount = templates.filter((t) => t.status === 'draft').length;
  const activeCount = templates.filter((t) => t.status === 'active').length;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 280 }}>
        <CircularProgress sx={{ color: RED }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: '100%',
        background: '#fff',
        border: `1px solid ${BORDER}`,
        borderRadius: '16px',
        boxShadow: '0 8px 28px rgba(16, 24, 40, 0.06)',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2,
          px: { xs: 2, md: 3 },
          py: 2.25,
          borderBottom: `1px solid ${BORDER}`,
          background: `linear-gradient(180deg, ${SURFACE} 0%, #fff 100%)`,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, color: TEXT, letterSpacing: '-0.02em', fontFamily: "'Inter', 'Roboto', system-ui, sans-serif" }}>
            Consent Templates
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: MUTED, mt: 0.35 }}>
            Design, publish, and version structured consent workflows.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<UploadFileOutlinedIcon />} onClick={openImportDialog} sx={outlineBtnSx}>
            Import from PDF
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateNew} sx={primaryBtnSx}>
            Create Template
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, px: { xs: 2, md: 3 }, py: 2, flexWrap: 'wrap' }}>
        {[
          { label: 'Total', value: templates.length, icon: <PolicyOutlinedIcon sx={{ fontSize: 18 }} />, color: RED_DARK, bg: RED_BG },
          { label: 'Draft', value: draftCount, icon: <DraftsOutlinedIcon sx={{ fontSize: 18 }} />, color: '#B45309', bg: '#FFF7ED' },
          { label: 'Published', value: activeCount, icon: <CheckCircleOutlineIcon sx={{ fontSize: 18 }} />, color: '#2E7D32', bg: '#E8F5E9' },
        ].map((stat) => (
          <Box
            key={stat.label}
            sx={{
              px: 1.75,
              py: 1.1,
              borderRadius: '12px',
              border: `1px solid ${BORDER}`,
              background: '#fff',
              minWidth: 128,
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
            }}
          >
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '10px',
                background: stat.bg,
                color: stat.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {stat.icon}
            </Box>
            <Box>
              <Typography sx={{ fontSize: '0.68rem', color: MUTED, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {stat.label}
              </Typography>
              <Typography sx={{ fontSize: '1.2rem', fontWeight: 700, color: TEXT, lineHeight: 1.15 }}>
                {stat.value}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {templates.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8, px: 3 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '14px',
              background: RED_BG,
              color: RED_DARK,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 1.5,
            }}
          >
            <PolicyOutlinedIcon />
          </Box>
          <Typography sx={{ fontWeight: 700, color: TEXT, mb: 0.5 }}>No consent templates yet</Typography>
          <Typography sx={{ fontSize: '0.85rem', color: MUTED }}>
            Create a template to enable structured consent workflows
          </Typography>
        </Box>
      ) : (
        <TableContainer>
          <Table sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow sx={{ background: SURFACE }}>
                {['Name', 'Version', 'Status', 'Effective Date', 'Source', 'Actions'].map((col) => (
                  <TableCell
                    key={col}
                    align={col === 'Actions' ? 'right' : 'left'}
                    sx={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: MUTED,
                      borderBottom: `1px solid ${BORDER}`,
                      py: 1.25,
                    }}
                  >
                    {col}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((t) => (
                <TableRow
                  key={t._id}
                  hover
                  sx={{
                    '&:hover': { background: 'rgba(229, 57, 53, 0.035)' },
                    '& td': { borderBottom: `1px solid ${BORDER}`, py: 1.6 },
                  }}
                >
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, color: TEXT, fontSize: '0.9rem' }}>{t.name}</Typography>
                  </TableCell>
                  <TableCell sx={{ color: MUTED, fontWeight: 600 }}>{t.version}</TableCell>
                  <TableCell>
                    <Chip
                      label={t.status}
                      size="small"
                      sx={{
                        height: 22,
                        fontWeight: 700,
                        fontSize: '0.68rem',
                        letterSpacing: '0.03em',
                        textTransform: 'capitalize',
                        ...statusSx(t.status),
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: MUTED }}>{new Date(t.effectiveDate).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Chip
                      label={t.sourceType === 'pdf_import' ? 'PDF Import' : 'Manual'}
                      size="small"
                      sx={{
                        height: 22,
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        background: '#fff',
                        border: `1px solid ${BORDER}`,
                        color: TEXT,
                      }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Preview">
                      <IconButton
                        size="small"
                        onClick={() => handlePreview(t._id)}
                        disabled={previewLoadingId === t._id}
                        sx={{ color: MUTED, '&:hover': { color: RED_DARK, background: RED_BG } }}
                      >
                        {previewLoadingId === t._id ? (
                          <CircularProgress size={16} sx={{ color: RED }} />
                        ) : (
                          <VisibilityOutlinedIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={() => handleEdit(t._id)}
                        sx={{ color: MUTED, '&:hover': { color: RED_DARK, background: RED_BG } }}
                      >
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {t.status === 'active' && (
                      <Tooltip title="Assign to employees">
                        <IconButton
                          size="small"
                          onClick={() => setAssignTemplateId(t._id)}
                          sx={{ color: MUTED, '&:hover': { color: RED_DARK, background: RED_BG } }}
                        >
                          <PersonAddAltOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {t.status === 'draft' && (
                      <Tooltip title="Publish">
                        <IconButton
                          size="small"
                          onClick={() => handlePublish(t._id)}
                          sx={{ color: RED, '&:hover': { color: RED_DARK, background: RED_BG } }}
                        >
                          <PublishOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={importOpen}
        onClose={() => !importing && setImportOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: TEXT }}>Import Consent Template from PDF</DialogTitle>
        <DialogContent>
          {importError && <Alert severity="error" sx={{ mb: 2 }}>{importError}</Alert>}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The uploaded PDF's numbered clauses become the "Full notice" step, and any
            "I consent to…" phrasing becomes proposed checkboxes. You'll land in the editor
            to review and adjust everything before publishing — nothing goes live automatically.
          </Typography>
          <Button
            variant="outlined"
            component="label"
            startIcon={<UploadFileOutlinedIcon />}
            sx={{ mb: 2, ...outlineBtnSx }}
            disabled={importing}
          >
            {importFile ? importFile.name : 'Select PDF File'}
            <input
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            />
          </Button>
          <TextField
            fullWidth
            label="Template Name *"
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
            placeholder="e.g., Online Examination Proctoring Notice"
            size="small"
            sx={{ mb: 2 }}
            disabled={importing}
          />
          <TextField
            fullWidth
            label="Effective From *"
            type="date"
            value={importEffectiveDate}
            onChange={(e) => setImportEffectiveDate(e.target.value)}
            size="small"
            InputLabelProps={{ shrink: true }}
            disabled={importing}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setImportOpen(false)} disabled={importing} sx={{ textTransform: 'none', color: MUTED }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleImportFromPdf}
            disabled={importing}
            startIcon={importing ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : null}
            sx={primaryBtnSx}
          >
            {importing ? 'Importing…' : 'Import & Review'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConsentWizard
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewTemplate(null);
        }}
        previewTemplate={previewTemplate}
      />

      <OnboardingControlPanel
        open={Boolean(assignTemplateId)}
        templateId={assignTemplateId}
        onClose={() => setAssignTemplateId(null)}
        onSaved={() => setAssignTemplateId(null)}
      />
    </Box>
  );
};

export default PolicyTemplateList;
