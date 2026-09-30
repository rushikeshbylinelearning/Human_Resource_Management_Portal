// frontend/src/components/ImageUpload/ImageViewerModal.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    IconButton,
    Box,
    Typography,
    Tooltip,
    Fade,
    CircularProgress,
    Alert
} from '@mui/material';
import {
    Close as CloseIcon,
    ZoomIn as ZoomInIcon,
    ZoomOut as ZoomOutIcon,
    Download as DownloadIcon,
    ChevronLeft as ChevronLeftIcon,
    ChevronRight as ChevronRightIcon,
    RestartAlt as ResetIcon
} from '@mui/icons-material';
import { downloadImage, formatFileSize, getImageFileId } from '../../utils/imageUtils';
import AuthenticatedImage from './AuthenticatedImage';

const ImageViewerModal = ({
    open,
    onClose,
    images = [],
    currentIndex = 0,
    resourceType, // 'it-support' or 'hr-query'
    resourceId,   // Ticket ID or Query ID
    showDownload = true,
    showNavigation = true
}) => {
    const [currentIdx, setCurrentIdx] = useState(currentIndex);
    const [zoom, setZoom] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [downloading, setDownloading] = useState(false);

    // Reset state when modal opens
    useEffect(() => {
        if (open) {
            setCurrentIdx(currentIndex);
            setZoom(1);
            setLoading(true);
            setError(null);
        }
    }, [open, currentIndex]);

    // Handle keyboard navigation
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (e) => {
            switch (e.key) {
                case 'ArrowLeft':
                    handlePrevious();
                    break;
                case 'ArrowRight':
                    handleNext();
                    break;
                case 'Escape':
                    onClose();
                    break;
                case '+':
                case '=':
                    handleZoomIn();
                    break;
                case '-':
                case '_':
                    handleZoomOut();
                    break;
                case '0':
                    handleResetZoom();
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, currentIdx, zoom]);

    const currentImage = images[currentIdx];
    const hasMultipleImages = images.length > 1;
    const canGoPrevious = currentIdx > 0;
    const canGoNext = currentIdx < images.length - 1;

    const handlePrevious = useCallback(() => {
        if (canGoPrevious) {
            setCurrentIdx(prev => prev - 1);
            setZoom(1);
            setLoading(true);
        }
    }, [canGoPrevious]);

    const handleNext = useCallback(() => {
        if (canGoNext) {
            setCurrentIdx(prev => prev + 1);
            setZoom(1);
            setLoading(true);
        }
    }, [canGoNext]);

    const handleZoomIn = () => {
        setZoom(prev => Math.min(prev + 0.25, 3));
    };

    const handleZoomOut = () => {
        setZoom(prev => Math.max(prev - 0.25, 0.25));
    };

    const handleResetZoom = () => {
        setZoom(1);
    };

    const handleDownload = async () => {
        if (!currentImage || downloading) return;

        setDownloading(true);
        try {
            await downloadImage(
                resourceType,
                resourceId,
                getImageFileId(currentImage),
                currentImage.originalName
            );
        } catch (error) {
            console.error('Download failed:', error);
            setError('Failed to download image. Please try again.');
        } finally {
            setDownloading(false);
        }
    };

    const handleImageLoad = () => {
        setLoading(false);
        setError(null);
    };

    const handleImageError = () => {
        setLoading(false);
        setError('Failed to load image');
    };

    if (!currentImage) return null;

    const currentFileId = getImageFileId(currentImage);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth={false}
            fullScreen
            PaperProps={{
                sx: {
                    bgcolor: 'rgba(0, 0, 0, 0.95)',
                    backgroundImage: 'none'
                }
            }}
            TransitionComponent={Fade}
        >
            <DialogContent
                sx={{
                    p: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    position: 'relative'
                }}
            >
                {/* Header */}
                <Box
                    sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        zIndex: 2,
                        bgcolor: 'rgba(0, 0, 0, 0.8)',
                        backdropFilter: 'blur(10px)',
                        p: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1
                    }}
                >
                    {/* Image Info */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                            variant="subtitle1"
                            sx={{
                                color: 'white',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {currentImage.originalName}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                            {formatFileSize(currentImage.size)} • {currentImage.mimetype}
                            {hasMultipleImages && ` • ${currentIdx + 1} of ${images.length}`}
                        </Typography>
                    </Box>

                    {/* Controls */}
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Zoom in (+)">
                            <span>
                                <IconButton
                                    size="small"
                                    onClick={handleZoomIn}
                                    disabled={zoom >= 3}
                                    sx={{ color: 'white' }}
                                >
                                    <ZoomInIcon />
                                </IconButton>
                            </span>
                        </Tooltip>

                        <Tooltip title="Zoom out (-)">
                            <span>
                                <IconButton
                                    size="small"
                                    onClick={handleZoomOut}
                                    disabled={zoom <= 0.25}
                                    sx={{ color: 'white' }}
                                >
                                    <ZoomOutIcon />
                                </IconButton>
                            </span>
                        </Tooltip>

                        <Tooltip title="Reset zoom (0)">
                            <IconButton
                                size="small"
                                onClick={handleResetZoom}
                                disabled={zoom === 1}
                                sx={{ color: 'white' }}
                            >
                                <ResetIcon />
                            </IconButton>
                        </Tooltip>

                        <Typography
                            variant="caption"
                            sx={{
                                color: 'white',
                                px: 1,
                                display: 'flex',
                                alignItems: 'center',
                                minWidth: 50,
                                justifyContent: 'center'
                            }}
                        >
                            {(zoom * 100).toFixed(0)}%
                        </Typography>

                        {showDownload && (
                            <Tooltip title="Download">
                                <IconButton
                                    size="small"
                                    onClick={handleDownload}
                                    disabled={downloading}
                                    sx={{ color: 'white' }}
                                >
                                    {downloading ? (
                                        <CircularProgress size={20} sx={{ color: 'white' }} />
                                    ) : (
                                        <DownloadIcon />
                                    )}
                                </IconButton>
                            </Tooltip>
                        )}

                        <Tooltip title="Close (Esc)">
                            <IconButton size="small" onClick={onClose} sx={{ color: 'white' }}>
                                <CloseIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {/* Image Container */}
                <Box
                    sx={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'auto',
                        p: 3,
                        pt: 10, // Account for header
                        pb: hasMultipleImages ? 10 : 3, // Account for footer if multiple images
                        position: 'relative'
                    }}
                >
                    {/* Loading Spinner */}
                    {loading && (
                        <Box
                            sx={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)'
                            }}
                        >
                            <CircularProgress sx={{ color: 'white' }} />
                        </Box>
                    )}

                    {/* Error Message */}
                    {error && (
                        <Alert severity="error" sx={{ position: 'absolute' }}>
                            {error}
                        </Alert>
                    )}

                    {/* Image */}
                    <AuthenticatedImage
                        resourceType={resourceType}
                        resourceId={resourceId}
                        imageId={currentFileId}
                        alt={currentImage.originalName}
                        onLoad={handleImageLoad}
                        onError={handleImageError}
                        sx={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            transform: `scale(${zoom})`,
                            transition: 'transform 0.2s ease',
                            cursor: zoom > 1 ? 'move' : 'default',
                            bgcolor: 'transparent'
                        }}
                    />

                    {/* Previous Button */}
                    {showNavigation && hasMultipleImages && canGoPrevious && (
                        <Tooltip title="Previous (←)">
                            <IconButton
                                onClick={handlePrevious}
                                sx={{
                                    position: 'absolute',
                                    left: 16,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    bgcolor: 'rgba(255, 255, 255, 0.9)',
                                    '&:hover': {
                                        bgcolor: 'white'
                                    }
                                }}
                            >
                                <ChevronLeftIcon fontSize="large" />
                            </IconButton>
                        </Tooltip>
                    )}

                    {/* Next Button */}
                    {showNavigation && hasMultipleImages && canGoNext && (
                        <Tooltip title="Next (→)">
                            <IconButton
                                onClick={handleNext}
                                sx={{
                                    position: 'absolute',
                                    right: 16,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    bgcolor: 'rgba(255, 255, 255, 0.9)',
                                    '&:hover': {
                                        bgcolor: 'white'
                                    }
                                }}
                            >
                                <ChevronRightIcon fontSize="large" />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>

                {/* Footer - Thumbnail Navigation */}
                {hasMultipleImages && (
                    <Box
                        sx={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            zIndex: 2,
                            bgcolor: 'rgba(0, 0, 0, 0.8)',
                            backdropFilter: 'blur(10px)',
                            p: 1.5,
                            display: 'flex',
                            gap: 1,
                            overflowX: 'auto',
                            justifyContent: 'center',
                            '&::-webkit-scrollbar': {
                                height: 6
                            },
                            '&::-webkit-scrollbar-thumb': {
                                bgcolor: 'rgba(255, 255, 255, 0.3)',
                                borderRadius: 3
                            }
                        }}
                    >
                        {images.map((img, idx) => (
                            <Box
                                key={getImageFileId(img) || idx}
                                onClick={() => {
                                    setCurrentIdx(idx);
                                    setZoom(1);
                                    setLoading(true);
                                }}
                                sx={{
                                    width: 60,
                                    height: 60,
                                    borderRadius: 1,
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    border: 2,
                                    borderColor: idx === currentIdx ? 'primary.main' : 'transparent',
                                    opacity: idx === currentIdx ? 1 : 0.6,
                                    transition: 'all 0.2s',
                                    flexShrink: 0,
                                    '&:hover': {
                                        opacity: 1,
                                        transform: 'scale(1.05)'
                                    }
                                }}
                            >
                                <AuthenticatedImage
                                    resourceType={resourceType}
                                    resourceId={resourceId}
                                    imageId={getImageFileId(img)}
                                    alt={img.originalName}
                                    sx={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover'
                                    }}
                                />
                            </Box>
                        ))}
                    </Box>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default ImageViewerModal;
