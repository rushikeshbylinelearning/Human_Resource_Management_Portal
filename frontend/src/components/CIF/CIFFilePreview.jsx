import React, { useEffect, useRef, useState, Suspense } from 'react';
import { createPortal } from 'react-dom';
import {
  Box,
  IconButton,
  Typography,
  Button,
  CircularProgress
} from '@mui/material';
import {
  Close as CloseIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import api from '../../api/axios';

const CustomPdfViewer = lazyWithRetry(() => import('../CustomPdfViewer'));

const CIFFilePreview = ({ file, onClose, onDownload }) => {
  const modalRef = useRef(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [imageBlobUrl, setImageBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isImage = file.fileType?.startsWith('image/');
  const isPDF = file.fileType === 'application/pdf';
  const isDoc = file.fileType?.includes('word') || file.fileType?.includes('document');

  // Fetch PDF as blob and create object URL
  useEffect(() => {
    if (isPDF) {
      const fetchPdfBlob = async () => {
        try {
          setLoading(true);
          setError(null);
          const response = await api.get(`/admin/cif/attachments/${file._id}/download`, {
            responseType: 'blob'
          });
          const blobUrl = URL.createObjectURL(response.data);
          setPdfBlobUrl(blobUrl);
        } catch (err) {
          console.error('Error fetching PDF:', err);
          setError('Failed to load PDF file');
        } finally {
          setLoading(false);
        }
      };

      fetchPdfBlob();

      // Cleanup blob URL on unmount
      return () => {
        if (pdfBlobUrl) {
          URL.revokeObjectURL(pdfBlobUrl);
        }
      };
    }
  }, [isPDF, file._id]);

  // Fetch image as blob and create object URL
  useEffect(() => {
    if (isImage) {
      const fetchImageBlob = async () => {
        try {
          setLoading(true);
          setError(null);
          const response = await api.get(`/admin/cif/attachments/${file._id}/download`, {
            responseType: 'blob'
          });
          const blobUrl = URL.createObjectURL(response.data);
          setImageBlobUrl(blobUrl);
        } catch (err) {
          console.error('Error fetching image:', err);
          setError('Failed to load image file');
        } finally {
          setLoading(false);
        }
      };

      fetchImageBlob();

      // Cleanup blob URL on unmount
      return () => {
        if (imageBlobUrl) {
          URL.revokeObjectURL(imageBlobUrl);
        }
      };
    }
  }, [isImage, file._id]);

  // Lock body scroll when modal opens
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, []);

  // ESC key handler
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.focus();
    }
  }, []);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // For PDF files, show loading or use the CustomPdfViewer component
  if (isPDF) {
    if (loading) {
      return createPortal(
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Box
            sx={{
              bgcolor: 'white',
              borderRadius: '12px',
              p: 4,
              textAlign: 'center',
              minWidth: '300px'
            }}
          >
            <CircularProgress sx={{ color: '#DC2626', mb: 2 }} />
            <Typography variant="body1" sx={{ color: '#374151', fontWeight: 600 }}>
              Loading PDF...
            </Typography>
          </Box>
        </Box>,
        document.body
      );
    }

    if (error) {
      return createPortal(
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={onClose}
        >
          <Box
            sx={{
              bgcolor: 'white',
              borderRadius: '12px',
              p: 4,
              textAlign: 'center',
              minWidth: '300px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Typography variant="h6" sx={{ color: '#DC2626', mb: 2, fontWeight: 600 }}>
              Error Loading PDF
            </Typography>
            <Typography variant="body2" sx={{ color: '#6B7280', mb: 3 }}>
              {error}
            </Typography>
            <Button
              variant="contained"
              onClick={onClose}
              sx={{
                bgcolor: '#DC2626',
                color: 'white',
                textTransform: 'none',
                fontWeight: 600,
                '&:hover': {
                  bgcolor: '#B91C1C'
                }
              }}
            >
              Close
            </Button>
          </Box>
        </Box>,
        document.body
      );
    }

    if (pdfBlobUrl) {
      return (
        <Suspense fallback={
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <CircularProgress />
          </Box>
        }>
          <CustomPdfViewer
            pdfUrl={pdfBlobUrl}
            title={file.originalName}
            version="1.0"
            effectiveDate={file.createdAt}
            onClose={onClose}
          />
        </Suspense>
      );
    }

    return null;
  }

  // For images and other files, use custom modal
  return createPortal(
    <>
      {/* Backdrop */}
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={handleBackdropClick}
        ref={modalRef}
        tabIndex={-1}
      >
        {/* Modal Content */}
        <Box
          sx={{
            position: 'relative',
            maxWidth: '90vw',
            maxHeight: '90vh',
            bgcolor: 'white',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 2.5,
              borderBottom: '1px solid #E5E7EB',
              bgcolor: '#F9FAFB'
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0, mr: 2 }}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color: '#111827',
                  fontSize: '1.125rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {file.originalName}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: '#6B7280',
                  fontSize: '0.8125rem'
                }}
              >
                {new Date(file.createdAt).toLocaleDateString('en-IN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 1 }}>
              {onDownload && (
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={() => onDownload(file._id, file.originalName)}
                  sx={{
                    borderColor: '#D1D5DB',
                    color: '#374151',
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    '&:hover': {
                      borderColor: '#9CA3AF',
                      bgcolor: '#F9FAFB'
                    }
                  }}
                >
                  Download
                </Button>
              )}
              <IconButton
                onClick={onClose}
                sx={{
                  color: '#6B7280',
                  '&:hover': {
                    bgcolor: '#F3F4F6',
                    color: '#374151'
                  }
                }}
              >
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>

          {/* Content */}
          <Box
            sx={{
              flex: 1,
              overflow: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 3,
              bgcolor: '#F9FAFB',
              minHeight: '400px'
            }}
          >
            {loading ? (
              <Box sx={{ textAlign: 'center' }}>
                <CircularProgress sx={{ color: '#DC2626', mb: 2 }} />
                <Typography variant="body2" sx={{ color: '#6B7280' }}>
                  Loading {isImage ? 'image' : 'file'}...
                </Typography>
              </Box>
            ) : error ? (
              <Box sx={{ textAlign: 'center', p: 4 }}>
                <Typography
                  variant="h6"
                  sx={{
                    color: '#DC2626',
                    mb: 2,
                    fontWeight: 600
                  }}
                >
                  Error Loading File
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: '#6B7280',
                    mb: 3
                  }}
                >
                  {error}
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={() => onDownload(file._id, file.originalName)}
                  sx={{
                    bgcolor: '#DC2626',
                    color: 'white',
                    textTransform: 'none',
                    fontWeight: 600,
                    '&:hover': {
                      bgcolor: '#B91C1C'
                    }
                  }}
                >
                  Download File Instead
                </Button>
              </Box>
            ) : isImage && imageBlobUrl ? (
              <img
                src={imageBlobUrl}
                alt={file.originalName}
                style={{
                  maxWidth: '100%',
                  maxHeight: '75vh',
                  objectFit: 'contain',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                }}
              />
            ) : isDoc ? (
              <Box
                sx={{
                  textAlign: 'center',
                  p: 4
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    color: '#6B7280',
                    mb: 2,
                    fontWeight: 600
                  }}
                >
                  Preview not available for this file type
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: '#9CA3AF',
                    mb: 3
                  }}
                >
                  Word documents cannot be previewed in the browser.
                  Please download the file to view it.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={() => onDownload(file._id, file.originalName)}
                  sx={{
                    bgcolor: '#DC2626',
                    color: 'white',
                    textTransform: 'none',
                    fontWeight: 600,
                    '&:hover': {
                      bgcolor: '#B91C1C'
                    }
                  }}
                >
                  Download File
                </Button>
              </Box>
            ) : (
              <Box
                sx={{
                  textAlign: 'center',
                  p: 4
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    color: '#6B7280',
                    mb: 2,
                    fontWeight: 600
                  }}
                >
                  Preview not available
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: '#9CA3AF',
                    mb: 3
                  }}
                >
                  This file type cannot be previewed.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={() => onDownload(file._id, file.originalName)}
                  sx={{
                    bgcolor: '#DC2626',
                    color: 'white',
                    textTransform: 'none',
                    fontWeight: 600,
                    '&:hover': {
                      bgcolor: '#B91C1C'
                    }
                  }}
                >
                  Download File
                </Button>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </>,
    document.body
  );
};

export default CIFFilePreview;
