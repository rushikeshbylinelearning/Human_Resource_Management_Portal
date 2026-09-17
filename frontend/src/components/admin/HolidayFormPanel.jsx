import React, { useState, useEffect } from 'react';
import {
    Drawer,
    Box,
    Typography,
    TextField,
    Button,
    MenuItem,
    IconButton,
    Alert
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import api from '../../api/axios';

const HolidayFormPanel = ({ open, onClose, holiday, yearId, onSuccess }) => {
    const [formData, setFormData] = useState({
        name: '',
        date: '',
        day: '',
        type: 'Company',
        appliesTo: 'All',
        isTentative: false
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (holiday) {
            setFormData({
                name: holiday.name || '',
                date: holiday.date ? holiday.date.split('T')[0] : '',
                day: holiday.day || '',
                type: holiday.type || 'Company',
                appliesTo: holiday.appliesTo || 'All',
                isTentative: holiday.isTentative || false
            });
        } else {
            setFormData({
                name: '',
                date: '',
                day: '',
                type: 'Company',
                appliesTo: 'All',
                isTentative: false
            });
        }
        setError(null);
    }, [holiday, open]);

    const handleChange = (field) => (event) => {
        setFormData({
            ...formData,
            [field]: event.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const payload = {
                ...formData,
                leaveYearId: yearId
            };

            if (holiday) {
                await api.put(`/holidays/admin/${holiday._id}`, payload);
            } else {
                await api.post('/holidays/admin', payload);
            }

            onSuccess();
            onClose();
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Failed to save holiday';
            setError(errorMessage);
            console.error('Error saving holiday:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    width: { xs: '100%', sm: 480 },
                    maxWidth: '100vw',
                    p: { xs: 2, sm: 3 },
                    boxSizing: 'border-box',
                    bgcolor: '#fafafa'
                }
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {holiday ? 'Edit Holiday' : 'Add Holiday'}
                </Typography>
                <IconButton onClick={onClose} size="small">
                    <CloseIcon />
                </IconButton>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            <form onSubmit={handleSubmit}>
                <TextField
                    fullWidth
                    label="Holiday Name"
                    value={formData.name}
                    onChange={handleChange('name')}
                    required
                    sx={{ mb: 2 }}
                />

                <TextField
                    fullWidth
                    label="Date"
                    type="date"
                    value={formData.date}
                    onChange={handleChange('date')}
                    InputLabelProps={{ shrink: true }}
                    required={!formData.isTentative}
                    sx={{ mb: 2 }}
                />

                <TextField
                    fullWidth
                    label="Day"
                    value={formData.day}
                    onChange={handleChange('day')}
                    placeholder="e.g., Monday"
                    sx={{ mb: 2 }}
                />

                <TextField
                    fullWidth
                    select
                    label="Type"
                    value={formData.type}
                    onChange={handleChange('type')}
                    sx={{ mb: 2 }}
                >
                    <MenuItem value="National">National</MenuItem>
                    <MenuItem value="Regional">Regional</MenuItem>
                    <MenuItem value="Company">Company</MenuItem>
                    <MenuItem value="Optional">Optional</MenuItem>
                </TextField>

                <TextField
                    fullWidth
                    select
                    label="Applies To"
                    value={formData.appliesTo}
                    onChange={handleChange('appliesTo')}
                    sx={{ mb: 3 }}
                >
                    <MenuItem value="All">All</MenuItem>
                    <MenuItem value="Department">Department</MenuItem>
                    <MenuItem value="Branch">Branch</MenuItem>
                </TextField>

                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                        disabled={loading}
                        sx={{
                            borderRadius: '12px',
                            textTransform: 'none',
                            py: 1.5
                        }}
                    >
                        {loading ? 'Saving...' : (holiday ? 'Update Holiday' : 'Add Holiday')}
                    </Button>
                    <Button
                        variant="outlined"
                        onClick={onClose}
                        disabled={loading}
                        sx={{
                            borderRadius: '12px',
                            textTransform: 'none',
                            py: 1.5
                        }}
                    >
                        Cancel
                    </Button>
                </Box>
            </form>
        </Drawer>
    );
};

export default HolidayFormPanel;
