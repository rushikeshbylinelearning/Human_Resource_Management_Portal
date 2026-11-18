// frontend/src/components/PublicFormLinkGenerator.jsx
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Checkbox,
  TextField,
  Divider,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import axios from '../api/axios';

const RED = '#C62828';
const RED_LIGHT = '#FFEBEE';
const RED_BORDER = 'rgba(198,40,40,0.18)';

const PublicFormLinkGenerator = ({ employeeId, employeeName, onClose, mode = 'individual' }) => {
  const isShared = mode === 'shared';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [expiryHours, setExpiryHours] = useState(isShared ? 168 : 48);
  const [allowMultipleSubmissions, setAllowMultipleSubmissions] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (forceNew = false) => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);
      const response = await axios.post(
        isShared ? '/admin/public-form/generate-shared-link' : '/admin/public-form/generate-link',
        isShared
          ? { expiryHours, forceNew }
          : { employeeId, expiryHours, allowMultipleSubmissions }
      );
      if (response.data.success) {
        setGeneratedLink(response.data);
        setSuccess(true);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate link');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (generatedLink?.url) {
      navigator.clipboard.writeText(generatedLink.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendEmail = () => {
    if (generatedLink?.url && generatedLink?.employee?.email) {
      const subject = encodeURIComponent('Complete Your Employee Profile');
      const body = encodeURIComponent(
        `Dear ${generatedLink.employee.fullName},\n\n` +
          `Please complete your employee profile by clicking the link below:\n\n` +
          `${generatedLink.url}\n\n` +
          `The link is password protected. Sign in with your work email and account password. It updates only your employee record.\n\n` +
          `This link will expire on ${new Date(generatedLink.expiresAt).toLocaleString()}.\n\n` +
          `If you have any questions, please contact HR.\n\nBest regards,\nHR Team`
      );
      window.location.href = `mailto:${generatedLink.employee.email}?subject=${subject}&body=${body}`;
    }
  };

  const handleReset = () => {
    setSuccess(false);
    setGeneratedLink(null);
    setError(null);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            display: 'block',
            height: '4px',
            background: `linear-gradient(90deg, ${RED} 0%, #E53935 50%, #EF5350 100%)`,
          },
        },
      }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 2,
          borderBottom: '1px solid #F3F4F6',
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600, color: '#111827', fontSize: '16px' }}>
          {isShared ? 'Shared Profile Link' : 'Generate Profile Form Link'}
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: '#9CA3AF' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 3 }}>
        {!success ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Employee info */}
            <Box
              sx={{
                background: RED_LIGHT,
                border: `1px solid ${RED_BORDER}`,
                borderRadius: '8px',
                px: 2,
                py: 1.5,
              }}
            >
              {isShared ? (
                <Typography variant="body2" sx={{ color: '#4B5563' }}>
                  One link for every employee. Each person signs in with their work email and password, and the form updates only that employee. The change shows on their profile and in the admin record.
                </Typography>
              ) : (
                <>
                  <Typography variant="body2" sx={{ color: '#4B5563', mb: 0.5 }}>
                    <Box component="span" sx={{ fontWeight: 600, color: '#111827' }}>Employee: </Box>
                    {employeeName}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#4B5563', mb: 0.5 }}>
                    <Box component="span" sx={{ fontWeight: 600, color: '#111827' }}>Employee ID: </Box>
                    {employeeId}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#4B5563' }}>
                    The employee must sign in with their work email and password before the form opens.
                  </Typography>
                </>
              )}
            </Box>

            {/* Expiry select */}
            <FormControl fullWidth size="small">
              <InputLabel>Link Expiry</InputLabel>
              <Select
                value={expiryHours}
                label="Link Expiry"
                onChange={(e) => setExpiryHours(Number(e.target.value))}
                disabled={loading}
                sx={{ '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: RED } }}
              >
                <MenuItem value={24}>24 hours</MenuItem>
                <MenuItem value={48}>{isShared ? '48 hours' : '48 hours (Recommended)'}</MenuItem>
                <MenuItem value={72}>72 hours</MenuItem>
                <MenuItem value={168}>{isShared ? '7 days (Recommended)' : '7 days'}</MenuItem>
              </Select>
            </FormControl>

            {/* Checkbox */}
            {!isShared && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={allowMultipleSubmissions}
                  onChange={(e) => setAllowMultipleSubmissions(e.target.checked)}
                  disabled={loading}
                  size="small"
                  sx={{ color: RED, '&.Mui-checked': { color: RED } }}
                />
              }
              label={
                <Typography variant="body2" sx={{ color: '#4B5563' }}>
                  Allow multiple submissions (employee can update profile)
                </Typography>
              }
            />
            )}

            {error && (
              <Alert severity="error" sx={{ borderRadius: '8px', fontSize: '13px' }}>
                {error}
              </Alert>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Success state */}
            <Box sx={{ textAlign: 'center', py: 1 }}>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: RED_LIGHT,
                  border: `1px solid ${RED_BORDER}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 1.5,
                }}
              >
                <CheckCircleOutlineIcon sx={{ color: RED, fontSize: 28 }} />
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#111827' }}>
                Link Generated Successfully!
              </Typography>
              {generatedLink?.isExisting && (
                <Typography variant="caption" sx={{ color: '#6B7280' }}>
                  An existing valid link was found and returned.
                </Typography>
              )}
            </Box>

            {/* Details */}
            <Box
              sx={{
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                px: 2,
                py: 1.5,
              }}
            >
              {!isShared && (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                    <Typography variant="body2" sx={{ color: '#6B7280', fontWeight: 500 }}>Employee</Typography>
                    <Typography variant="body2" sx={{ color: '#111827', fontWeight: 600 }}>
                      {generatedLink?.employee?.fullName}
                    </Typography>
                  </Box>
                  <Divider sx={{ my: 0.75 }} />
                </>
              )}
              {isShared && (
                <Typography variant="body2" sx={{ color: '#4B5563', mb: 1 }}>
                  Anyone with an active account can open this link. Their email and password decide which record is updated.
                </Typography>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ color: '#6B7280', fontWeight: 500 }}>Expires</Typography>
                <Typography variant="body2" sx={{ color: '#111827', fontWeight: 600 }}>
                  {new Date(generatedLink?.expiresAt).toLocaleString()}
                </Typography>
              </Box>
            </Box>

            {/* Link copy */}
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 1 }}>
                Generated Link
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  value={generatedLink?.url || ''}
                  size="small"
                  fullWidth
                  inputProps={{ readOnly: true, style: { fontFamily: 'monospace', fontSize: '12px' } }}
                  onClick={(e) => e.target.select()}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      background: '#F9FAFB',
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: RED },
                    },
                  }}
                />
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleCopy}
                  startIcon={<ContentCopyIcon fontSize="small" />}
                  sx={{
                    background: RED,
                    whiteSpace: 'nowrap',
                    px: 2,
                    '&:hover': { background: '#B71C1C' },
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '13px',
                  }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </Box>
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          borderTop: '1px solid #F3F4F6',
          gap: 1,
          justifyContent: success ? 'space-between' : 'flex-end',
        }}
      >
        {!success ? (
          <>
            <Button
              onClick={onClose}
              variant="outlined"
              sx={{
                borderColor: '#E5E7EB',
                color: '#6B7280',
                textTransform: 'none',
                fontWeight: 500,
                '&:hover': { borderColor: '#D1D5DB', background: '#F9FAFB' },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleGenerate(false)}
              variant="contained"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={14} color="inherit" /> : null}
              sx={{
                background: RED,
                textTransform: 'none',
                fontWeight: 600,
                px: 3,
                '&:hover': { background: '#B71C1C' },
                '&.Mui-disabled': { background: '#FFCDD2', color: '#fff' },
              }}
            >
              {loading ? 'Generating...' : 'Generate Link'}
            </Button>
          </>
        ) : (
          <>
            {!isShared && (
            <Button
              onClick={handleSendEmail}
              variant="outlined"
              startIcon={<EmailOutlinedIcon fontSize="small" />}
              sx={{
                borderColor: '#E5E7EB',
                color: '#374151',
                textTransform: 'none',
                fontWeight: 500,
                '&:hover': { borderColor: '#D1D5DB', background: '#F9FAFB' },
              }}
            >
              Send via Email
            </Button>
            )}
            <Button
              onClick={() => handleGenerate(isShared)}
              variant="contained"
              startIcon={<RefreshIcon fontSize="small" />}
              sx={{
                background: RED,
                textTransform: 'none',
                fontWeight: 600,
                px: 3,
                '&:hover': { background: '#B71C1C' },
              }}
            >
              Generate Another
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default PublicFormLinkGenerator;
