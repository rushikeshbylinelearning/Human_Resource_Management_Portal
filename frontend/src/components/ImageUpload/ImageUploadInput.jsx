// frontend/src/components/ImageUpload/ImageUploadInput.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Button,
    IconButton,
    Typography,
    Alert,
    Paper,
    Chip,
    Tooltip,
    CircularProgress
} from '@mui/material';
import {
    CloudUpload as UploadIcon,
    Close as CloseIcon,
    Image as ImageIcon,
    CheckCircle as CheckIcon
} from '@mui/icons-material';
import {
    validateImageFiles,
    formatFileSize,
    createImagePreview,
    revokeImagePreview
} from '../../utils/imageUtils';

const ImageUploadInput = ({
    value = [],
    onChange,
    maxFiles = 5,
    maxSizeKB = 500,
    disabled = false,
    showPreview = true,
    helperText = '',
    error = false,
    required = false
}) => {
    const [selectedImages, setSelectedImages] = useState([]);
    const [previewUrls, setPreviewUrls] = useState([]);
    const [validationErrors, setValidationErrors] = useState([]);
    const fileInputRef = useRef(null);

    // Initialize from value prop
    useEffect(() => {
        if (value && value.length > 0 && value !== selectedImages) {
            setSelectedImages(value);
            
            // Create preview URLs for new files
            const newPreviews = value.map(file => createImagePreview(file));
            setPreviewUrls(newPreviews);
        }
    }, [value]);

    // Cleanup preview URLs on unmount
    useEffect(() => {
        return () => {
            revokeImagePreview(previewUrls);
        };
    }, []);

    const handleFileSelect = (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        // Calculate remaining slots
        const remainingSlots = maxFiles - selectedImages.length;
        const filesToValidate = Array.from(files).slice(0, remainingSlots);

        // Validate files
        const validation = validateImageFiles(
            filesToValidate,
            remainingSlots,
            maxSizeKB
        );

        if (validation.errors.length > 0) {
            setValidationErrors(validation.errors);
            return;
        }

        // Clear errors and add valid files
        setValidationErrors([]);
        const newImages = [...selectedImages, ...validation.validFiles];
        
        // Create preview URLs for new files
        const newPreviews = validation.validFiles.map(file => createImagePreview(file));
        const updatedPreviews = [...previewUrls, ...newPreviews];
        
        setSelectedImages(newImages);
        setPreviewUrls(updatedPreviews);
        
        // Notify parent component
        if (onChange) {
            onChange(newImages);
        }

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleRemoveImage = (index) => {
        // Revoke the preview URL
        revokeImagePreview(previewUrls[index]);

        // Remove from arrays
        const newImages = selectedImages.filter((_, i) => i !== index);
        const newPreviews = previewUrls.filter((_, i) => i !== index);

        setSelectedImages(newImages);
        setPreviewUrls(newPreviews);
        setValidationErrors([]);

        // Notify parent component
        if (onChange) {
            onChange(newImages);
        }
    };

    const handleClearAll = () => {
        // Revoke all preview URLs
        revokeImagePreview(previewUrls);

        setSelectedImages([]);
        setPreviewUrls([]);
        setValidationErrors([]);

        if (onChange) {
            onChange([]);
        }

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleButtonClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const remainingSlots = maxFiles - selectedImages.length;
    const hasImages = selectedImages.length > 0;

    return (
        <Box sx={{ width: '100%' }}>
            {/* File Input (Hidden) */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                multiple
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                disabled={disabled || remainingSlots === 0}
            />

            {/* Upload Button */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Button
                    variant="outlined"
                    startIcon={<UploadIcon />}
                    onClick={handleButtonClick}
                    disabled={disabled || remainingSlots === 0}
                    sx={{
                        borderStyle: error ? 'solid' : 'dashed',
                        borderColor: error ? 'error.main' : 'primary.main',
                        borderWidth: 2,
                        '&:hover': {
                            borderWidth: 2,
                            borderStyle: 'solid'
                        }
                    }}
                >
                    {hasImages ? 'Add More Images' : 'Select Images'}
                </Button>

                {hasImages && (
                    <Button
                        variant="text"
                        color="error"
                        size="small"
                        onClick={handleClearAll}
                        disabled={disabled}
                    >
                        Clear All
                    </Button>
                )}

                <Box sx={{ ml: 'auto' }}>
                    <Chip
                        label={`${selectedImages.length} / ${maxFiles}`}
                        size="small"
                        color={selectedImages.length === maxFiles ? 'success' : 'default'}
                        icon={selectedImages.length > 0 ? <CheckIcon /> : <ImageIcon />}
                    />
                </Box>
            </Box>

            {/* Helper Text */}
            {helperText && !error && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    {helperText}
                </Typography>
            )}

            {/* Info Text */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Maximum {maxFiles} images, {maxSizeKB}KB each. Formats: JPEG, PNG, GIF, WEBP
                {required && ' (Required)'}
            </Typography>

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setValidationErrors([])}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                        Upload Error:
                    </Typography>
                    {validationErrors.map((error, index) => (
                        <Typography key={index} variant="body2" sx={{ fontSize: '0.875rem' }}>
                            • {error}
                        </Typography>
                    ))}
                </Alert>
            )}

            {/* Image Previews */}
            {showPreview && hasImages && (
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: 'repeat(2, 1fr)',
                            sm: 'repeat(3, 1fr)',
                            md: 'repeat(4, 1fr)'
                        },
                        gap: 1.5
                    }}
                >
                    {selectedImages.map((image, index) => (
                        <Paper
                            key={index}
                            elevation={2}
                            sx={{
                                position: 'relative',
                                paddingTop: '100%', // 1:1 aspect ratio
                                borderRadius: 2,
                                overflow: 'hidden',
                                transition: 'transform 0.2s, box-shadow 0.2s',
                                '&:hover': {
                                    transform: 'translateY(-4px)',
                                    boxShadow: 4,
                                    '& .remove-button': {
                                        opacity: 1
                                    }
                                }
                            }}
                        >
                            {/* Image */}
                            <Box
                                component="img"
                                src={previewUrls[index]}
                                alt={image.name}
                                sx={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                }}
                            />

                            {/* Remove Button */}
                            {!disabled && (
                                <Tooltip title="Remove image">
                                    <IconButton
                                        className="remove-button"
                                        size="small"
                                        onClick={() => handleRemoveImage(index)}
                                        sx={{
                                            position: 'absolute',
                                            top: 4,
                                            right: 4,
                                            bgcolor: 'rgba(0, 0, 0, 0.7)',
                                            color: 'white',
                                            opacity: 0,
                                            transition: 'opacity 0.2s',
                                            '&:hover': {
                                                bgcolor: 'rgba(0, 0, 0, 0.9)',
                                            }
                                        }}
                                    >
                                        <CloseIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            )}

                            {/* Image Info Overlay */}
                            <Box
                                sx={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    bgcolor: 'rgba(0, 0, 0, 0.7)',
                                    color: 'white',
                                    px: 1,
                                    py: 0.5
                                }}
                            >
                                <Typography
                                    variant="caption"
                                    sx={{
                                        display: 'block',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {image.name}
                                </Typography>
                                <Typography variant="caption" sx={{ fontSize: '0.65rem', opacity: 0.8 }}>
                                    {formatFileSize(image.size)}
                                </Typography>
                            </Box>
                        </Paper>
                    ))}
                </Box>
            )}

            {/* Empty State */}
            {!hasImages && !error && (
                <Paper
                    variant="outlined"
                    sx={{
                        p: 3,
                        textAlign: 'center',
                        borderStyle: 'dashed',
                        borderWidth: 2,
                        borderColor: 'divider',
                        bgcolor: 'background.default',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        '&:hover': disabled ? {} : {
                            borderColor: 'primary.main',
                            bgcolor: 'action.hover'
                        }
                    }}
                    onClick={!disabled ? handleButtonClick : undefined}
                >
                    <ImageIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                        Click &quot;Select Images&quot; or drag and drop images here
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        (Drag and drop coming soon)
                    </Typography>
                </Paper>
            )}
        </Box>
    );
};

export default ImageUploadInput;
