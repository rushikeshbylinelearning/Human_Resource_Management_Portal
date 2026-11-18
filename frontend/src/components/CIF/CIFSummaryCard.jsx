import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Chip,
  Grid,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  InfoOutlined as InfoIcon
} from '@mui/icons-material';
import api from '../../api/axios';
import { RED, TEXT, MUTED, profileCardSx, iconWellSx } from '../adminEmployee/adminEmployeeTheme';

const CIFSummaryCard = ({ employeeId }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (employeeId) {
      fetchSummary();
    }
  }, [employeeId]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/admin/cif/employee-summary/${employeeId}`);
      setSummary(response.data);
    } catch (err) {
      console.error('Error fetching CIF summary:', err);
      setError('Failed to load CIF summary');
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (riskLevel) => {
    const colors = {
      critical: 'error',
      high: 'warning',
      medium: 'info',
      low: 'success'
    };
    return colors[riskLevel] || 'default';
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const cardBase = profileCardSx;

  const statTile = {
    background: '#fff',
    borderRadius: '12px',
    padding: '12px 14px',
    border: '1px solid #E7E9EE',
    height: '100%',
  };

  if (loading) {
    return (
      <Box sx={cardBase}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={24} sx={{ color: RED }} />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={cardBase}>
        <Alert severity="error" variant="outlined" sx={{ borderRadius: '12px' }}>
          {error}
        </Alert>
      </Box>
    );
  }

  if (!summary || summary.total === 0) {
    return (
      <Box sx={{ ...cardBase, display: 'flex', alignItems: 'center', gap: 1.75, py: 1.75 }}>
        <Box sx={iconWellSx('#ECFDF3', '#166534')}>
          <InfoIcon sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: TEXT, letterSpacing: '-0.02em' }}>
            Clear record
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: MUTED, mt: 0.2 }}>
            No incident records on file for this employee.
          </Typography>
        </Box>
        <Chip
          label="No cases"
          size="small"
          sx={{
            height: 26,
            fontWeight: 700,
            fontSize: '0.72rem',
            bgcolor: '#ECFDF3',
            color: '#166534',
            border: '1px solid #ABEFC6',
          }}
        />
      </Box>
    );
  }

  return (
    <Box sx={cardBase}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={iconWellSx()}>
            <InfoIcon sx={{ fontSize: 18 }} />
          </Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: TEXT, letterSpacing: '-0.02em' }}>
            CIF Summary
          </Typography>
        </Box>
        <Chip
          label={`Risk: ${summary.riskLevel.toUpperCase()}`}
          size="small"
          color={getRiskColor(summary.riskLevel)}
          sx={{
            fontWeight: 700,
            fontSize: '11px',
            borderRadius: '8px',
            height: 26
          }}
        />
      </Box>

      {/* Stats Grid */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Box sx={statTile}>
            <Typography sx={{ fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5 }}>
              Total Cases
            </Typography>
            <Typography sx={{ fontSize: '24px', fontWeight: 800, color: TEXT, lineHeight: 1 }}>
              {summary.total}
            </Typography>
          </Box>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Box sx={statTile}>
            <Typography sx={{ fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5 }}>
              Open Cases
            </Typography>
            <Typography sx={{ fontSize: '24px', fontWeight: 800, color: '#F59E0B', lineHeight: 1 }}>
              {summary.open}
            </Typography>
          </Box>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Box sx={statTile}>
            <Typography sx={{ fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5 }}>
              High Severity
            </Typography>
            <Typography sx={{ fontSize: '24px', fontWeight: 800, color: '#dc2626', lineHeight: 1 }}>
              {summary.highCount}
            </Typography>
          </Box>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Box sx={statTile}>
            <Typography sx={{ fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5 }}>
              Last Incident
            </Typography>
            <Typography sx={{ fontSize: '13px', fontWeight: 700, color: TEXT, lineHeight: 1.3, mt: 0.5 }}>
              {formatDate(summary.lastIncidentDate)}
            </Typography>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default CIFSummaryCard;
