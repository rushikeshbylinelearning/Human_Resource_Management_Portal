import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
    Box,
    TextField,
    Button,
    Grid,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Typography,
    Alert,
    FormControlLabel,
    Switch
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import LazyDatePicker from './lazy/LazyDatePicker';

const PolicyUploadForm = ({ onSubmit, submitting = false }) => {
    const [formData, setFormData] = useState({
        name: '',
        version: '',
        effectiveFrom: new Date(),
        department: '',
        status: 'Active',
        autoGenerateVersion: false
    });
    const [file, setFile] = useState(null);
    const [error, setError] = useState('');

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            if (selectedFile.type !== 'application/pdf') {
                setError('Only PDF files are allowed');
                setFile(null);
                e.target.value = '';
                return;
            }
            setError('');
            setFile(selectedFile);
        }
    };

    const handleChange = (field) => (event) => {
        setFormData({ ...formData, [field]: event.target.value });
    };

    const handleDateChange = (date) => {
        setFormData({ ...formData, effectiveFrom: date });
    };

    const handleSwitchChange = (event) => {
        setFormData({ ...formData, autoGenerateVersion: event.target.checked });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!file) {
            setError('Please select a PDF file');
            return;
        }

        if (!formData.name.trim()) {
            setError('Policy name is required');
            return;
        }

        if (!formData.autoGenerateVersion && !formData.version.trim()) {
            setError('Version is required or enable auto-generate');
            return;
        }

        const submitData = new FormData();
        submitData.append('file', file);
        submitData.append('name', formData.name);
        submitData.append('version', formData.autoGenerateVersion ? 'auto' : formData.version);
        submitData.append('effectiveFrom', formData.effectiveFrom.toISOString());
        submitData.append('department', formData.department);
        submitData.append('status', formData.status);

        onSubmit(submitData);
    };

    return (
        <Box component="form" onSubmit={handleSubmit}>
            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            <Grid container spacing={2.5}>
                <Grid item xs={12}>
                    <Button
                        variant="outlined"
                        component="label"
                        fullWidth
                        startIcon={<UploadFileIcon />}
                        sx={{
                            py: 1.5,
                            borderRadius: '10px',
                            borderStyle: 'dashed',
                            borderWidth: 2,
                            textTransform: 'none',
                            fontSize: '0.875rem',
                            fontWeight: 600
                        }}
                    >
                        {file ? file.name : 'Select PDF File'}
                        <input
                            type="file"
                            hidden
                            accept=".pdf"
                            onChange={handleFileChange}
                        />
                    </Button>
                    {file && (
                        <Typography variant="caption" color="success.main" display="block" mt={1}>
                            ✓ {file.name} selected
                        </Typography>
                    )}
                </Grid>

                <Grid item xs={12} md={6}>
                    <TextField
                        label="Policy Name"
                        fullWidth
                        required
                        value={formData.name}
                        onChange={handleChange('name')}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '12px'
                            }
                        }}
                    />
                </Grid>

                <Grid item xs={12} md={6}>
                    <TextField
                        label="Version"
                        fullWidth
                        required={!formData.autoGenerateVersion}
                        disabled={formData.autoGenerateVersion}
                        value={formData.version}
                        onChange={handleChange('version')}
                        placeholder="e.g., 1.0, 2.1"
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '12px'
                            }
                        }}
                    />
                    <FormControlLabel
                        control={
                            <Switch
                                checked={formData.autoGenerateVersion}
                                onChange={handleSwitchChange}
                                size="small"
                            />
                        }
                        label={<Typography variant="caption">Auto-generate version</Typography>}
                        sx={{ mt: 0.5 }}
                    />
                </Grid>

                <Grid item xs={12} md={6}>
                    <LazyDatePicker
                        label="Effective From"
                        value={formData.effectiveFrom}
                        onChange={handleDateChange}
                        slotProps={{
                            textField: {
                                fullWidth: true,
                                sx: {
                                    '& .MuiOutlinedInput-root': {
                                        borderRadius: '12px'
                                    }
                                }
                            }
                        }}
                    />
                </Grid>

                <Grid item xs={12} md={6}>
                    <TextField
                        label="Department (Optional)"
                        fullWidth
                        value={formData.department}
                        onChange={handleChange('department')}
                        placeholder="e.g., HR, IT, Finance"
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '12px'
                            }
                        }}
                    />
                </Grid>

                <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                        <InputLabel>Status</InputLabel>
                        <Select
                            value={formData.status}
                            label="Status"
                            onChange={handleChange('status')}
                            sx={{
                                borderRadius: '12px'
                            }}
                        >
                            <MenuItem value="Active">Active</MenuItem>
                            <MenuItem value="Archived">Archived</MenuItem>
                        </Select>
                    </FormControl>
                </Grid>

                <Grid item xs={12}>
                    <Button
                        type="submit"
                        variant="contained"
                        size="medium"
                        disabled={submitting}
                        sx={{
                            backgroundColor: '#E53935',
                            borderRadius: '10px',
                            px: 3,
                            py: 1,
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            textTransform: 'none',
                            '&:hover': {
                                backgroundColor: '#d32f2f'
                            }
                        }}
                    >
                        {submitting ? 'Uploading...' : 'Upload Policy'}
                    </Button>
                </Grid>
            </Grid>
        </Box>
    );
};

PolicyUploadForm.propTypes = {
    onSubmit: PropTypes.func.isRequired,
    submitting: PropTypes.bool
};

export default PolicyUploadForm;
