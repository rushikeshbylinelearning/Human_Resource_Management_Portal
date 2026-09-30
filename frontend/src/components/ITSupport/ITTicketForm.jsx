// frontend/src/components/ITSupport/ITTicketForm.jsx
import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    MenuItem,
    FormControl,
    InputLabel,
    Select,
    Box,
    Alert,
    CircularProgress,
    Typography,
    Divider
} from '@mui/material';
import api from '../../api/axios';
import ImageUploadInput from '../ImageUpload/ImageUploadInput';

const ISSUE_CATEGORIES = [
    'Computer / Laptop',
    'Network / LAN / Wi-Fi',
    'Printer / Scanner',
    'Email / Outlook',
    'Microsoft Teams',
    'Login / Access',
    'Software / Application',
    'System Performance',
    'Hardware Issue',
    'Other'
];

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

const ITTicketForm = ({ open, onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        category: '',
        title: '',
        description: '',
        priority: 'Medium',
        location: ''
    });
    const [selectedImages, setSelectedImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Validation
        if (!formData.category) {
            setError('Please select an issue category.');
            return;
        }
        if (!formData.title.trim()) {
            setError('Please enter a title for your issue.');
            return;
        }
        if (!formData.description.trim()) {
            setError('Please describe the issue in detail.');
            return;
        }

        setLoading(true);

        try {
            // Create FormData for multipart/form-data
            const submitData = new FormData();
            submitData.append('category', formData.category);
            submitData.append('title', formData.title.trim());
            submitData.append('description', formData.description.trim());
            submitData.append('priority', formData.priority);
            if (formData.location.trim()) {
                submitData.append('location', formData.location.trim());
            }

            // Append images
            selectedImages.forEach((image) => {
                submitData.append('images', image);
            });

            const response = await api.post('/it-support/tickets', submitData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            
            if (onSuccess) {
                onSuccess(response.data.ticket);
            }

            // Reset form
            setFormData({
                category: '',
                title: '',
                description: '',
                priority: 'Medium',
                location: ''
            });
            setSelectedImages([]);

            onClose();
        } catch (err) {
            console.error('Error creating IT support ticket:', err);
            setError(err.response?.data?.error || 'Failed to create ticket. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (!loading) {
            setFormData({
                category: '',
                title: '',
                description: '',
                priority: 'Medium',
                location: ''
            });
            setSelectedImages([]);
            setError('');
            onClose();
        }
    };

    return (
        <Dialog 
            open={open} 
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 2,
                    maxHeight: '90vh'
                }
            }}
        >
            <form onSubmit={handleSubmit}>
                <DialogTitle sx={{ pb: 1 }}>
                    <Typography variant="h6" component="div">
                        Raise IT Support Ticket
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Describe your IT issue and our team will assist you
                    </Typography>
                </DialogTitle>

                <DialogContent dividers>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                        {/* Issue Category */}
                        <FormControl fullWidth required>
                            <InputLabel>Issue Category</InputLabel>
                            <Select
                                name="category"
                                value={formData.category}
                                onChange={handleChange}
                                label="Issue Category"
                                disabled={loading}
                            >
                                {ISSUE_CATEGORIES.map((category) => (
                                    <MenuItem key={category} value={category}>
                                        {category}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        {/* Priority */}
                        <FormControl fullWidth required>
                            <InputLabel>Priority</InputLabel>
                            <Select
                                name="priority"
                                value={formData.priority}
                                onChange={handleChange}
                                label="Priority"
                                disabled={loading}
                            >
                                {PRIORITIES.map((priority) => (
                                    <MenuItem key={priority} value={priority}>
                                        {priority}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        {/* Title */}
                        <TextField
                            name="title"
                            label="Issue Title"
                            value={formData.title}
                            onChange={handleChange}
                            fullWidth
                            required
                            disabled={loading}
                            placeholder="Brief summary of the issue"
                            inputProps={{ maxLength: 200 }}
                            helperText={`${formData.title.length}/200 characters`}
                        />

                        {/* Description */}
                        <TextField
                            name="description"
                            label="Issue Description"
                            value={formData.description}
                            onChange={handleChange}
                            fullWidth
                            required
                            multiline
                            rows={6}
                            disabled={loading}
                            placeholder="Describe the issue clearly. Include what you were trying to do, what happened, and any error messages you received."
                            inputProps={{ maxLength: 3000 }}
                            helperText={`${formData.description.length}/3000 characters`}
                        />

                        {/* Location (Optional) */}
                        <TextField
                            name="location"
                            label="Location / Desk / Workstation (Optional)"
                            value={formData.location}
                            onChange={handleChange}
                            fullWidth
                            disabled={loading}
                            placeholder="e.g., Floor 2, Desk 45 or Building A, Room 101"
                            inputProps={{ maxLength: 200 }}
                        />

                        {/* Divider */}
                        <Divider sx={{ my: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                                Attachments (Optional)
                            </Typography>
                        </Divider>

                        {/* Image Upload */}
                        <ImageUploadInput
                            value={selectedImages}
                            onChange={setSelectedImages}
                            maxFiles={5}
                            maxSizeKB={500}
                            disabled={loading}
                            showPreview={true}
                            helperText="Attach screenshots or photos to help us understand the issue better"
                        />
                    </Box>
                </DialogContent>

                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button 
                        onClick={handleClose} 
                        disabled={loading}
                        color="inherit"
                    >
                        Cancel
                    </Button>
                    <Button 
                        type="submit" 
                        variant="contained" 
                        disabled={loading}
                        startIcon={loading && <CircularProgress size={16} />}
                    >
                        {loading ? 'Creating...' : 'Create Ticket'}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
};

export default ITTicketForm;
