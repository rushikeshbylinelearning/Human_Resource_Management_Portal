import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import PropTypes from 'prop-types';
import { PdfDocument, PdfPage } from './lazy/LazyPdfComponents';
import { Box, IconButton, Typography, Stack, CircularProgress } from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import DownloadIcon from '@mui/icons-material/Download';
import CloseIcon from '@mui/icons-material/Close';
import '../styles/SecurePdfViewer.css';
import api from '../api/axios';

const SecurePdfViewer = ({ pdfUrl, policyName, role = 'employee', onClose }) => {
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1.0);
    const [pdfBlob, setPdfBlob] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const containerRef = useRef(null);
    const pageRefs = useRef({});

    // Fetch PDF as blob to prevent direct URL access
    useEffect(() => {
        const fetchPdf = async () => {
            setLoading(true);
            setError(null);
            try {
                // Use the configured api axios instance — it always carries the
                // in-memory Authorization header set by AuthContext (Phase 1 model).
                // No sessionStorage reads needed.
                const response = await api.get(pdfUrl, { responseType: 'blob' });
                setPdfBlob(response.data);
            } catch (err) {
                console.error('Error loading PDF:', err);
                setError('Failed to load PDF. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        if (pdfUrl) {
            fetchPdf();
        }

        // Cleanup blob URL on unmount
        return () => {
            if (pdfBlob) {
                URL.revokeObjectURL(URL.createObjectURL(pdfBlob));
            }
        };
    }, [pdfUrl]);

    // Disable context menu (right-click)
    useEffect(() => {
        const handleContextMenu = (e) => {
            if (containerRef.current && containerRef.current.contains(e.target)) {
                e.preventDefault();
                return false;
            }
        };

        document.addEventListener('contextmenu', handleContextMenu);
        return () => document.removeEventListener('contextmenu', handleContextMenu);
    }, []);

    // Intercept keyboard shortcuts (Ctrl+S, Ctrl+P, Cmd+S, Cmd+P)
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Prevent save (Ctrl+S / Cmd+S)
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                return false;
            }
            // Prevent print (Ctrl+P / Cmd+P) for employees
            if (role === 'employee' && (e.ctrlKey || e.metaKey) && e.key === 'p') {
                e.preventDefault();
                return false;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [role]);

    // Update page number based on scroll position
    useEffect(() => {
        if (!numPages) return;

        const observerOptions = {
            root: containerRef.current?.querySelector('[style*="overflow: auto"]'),
            rootMargin: '-50% 0px -50% 0px',
            threshold: 0
        };

        const observerCallback = (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const pageNum = parseInt(entry.target.getAttribute('data-page-number'));
                    if (pageNum) {
                        setPageNumber(pageNum);
                    }
                }
            });
        };

        const observer = new IntersectionObserver(observerCallback, observerOptions);

        // Observe all page elements
        Object.values(pageRefs.current).forEach((pageElement) => {
            if (pageElement) {
                observer.observe(pageElement);
            }
        });

        return () => observer.disconnect();
    }, [numPages]);

    const onDocumentLoadSuccess = ({ numPages }) => {
        setNumPages(numPages);
        setPageNumber(1);
    };

    const scrollToPage = (pageNum) => {
        const pageElement = pageRefs.current[pageNum];
        if (pageElement) {
            pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setPageNumber(pageNum);
        }
    };

    const changePage = (offset) => {
        const newPage = pageNumber + offset;
        if (newPage >= 1 && newPage <= numPages) {
            scrollToPage(newPage);
        }
    };

    const previousPage = () => changePage(-1);
    const nextPage = () => changePage(1);

    const zoomIn = () => {
        setScale(prevScale => Math.min(prevScale + 0.2, 3.0));
    };

    const zoomOut = () => {
        setScale(prevScale => Math.max(prevScale - 0.2, 0.5));
    };

    const handleDownload = useCallback(() => {
        if (role !== 'admin' || !pdfBlob) return;

        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${policyName || 'policy'}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [pdfBlob, policyName, role]);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 400 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 400 }}>
                <Typography color="error">{error}</Typography>
            </Box>
        );
    }

    return (
        <Box
            ref={containerRef}
            className="secure-pdf-container"
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none'
            }}
        >
            {/* Toolbar */}
            <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                justifyContent="space-between"
                sx={{
                    p: 2,
                    borderBottom: '1px solid #e0e0e0',
                    backgroundColor: '#f5f5f5'
                }}
            >
                <Stack direction="row" spacing={1} alignItems="center">
                    {/* Page Navigation */}
                    <IconButton
                        onClick={previousPage}
                        disabled={pageNumber <= 1}
                        size="small"
                        title="Previous Page"
                    >
                        <NavigateBeforeIcon />
                    </IconButton>
                    <Typography variant="body2" sx={{ minWidth: 100, textAlign: 'center' }}>
                        Page {pageNumber} of {numPages}
                    </Typography>
                    <IconButton
                        onClick={nextPage}
                        disabled={pageNumber >= numPages}
                        size="small"
                        title="Next Page"
                    >
                        <NavigateNextIcon />
                    </IconButton>

                    {/* Zoom Controls */}
                    <Box sx={{ borderLeft: '1px solid #ccc', pl: 1, ml: 1 }}>
                        <IconButton onClick={zoomOut} disabled={scale <= 0.5} size="small" title="Zoom Out">
                            <ZoomOutIcon />
                        </IconButton>
                        <Typography variant="body2" component="span" sx={{ mx: 1 }}>
                            {Math.round(scale * 100)}%
                        </Typography>
                        <IconButton onClick={zoomIn} disabled={scale >= 3.0} size="small" title="Zoom In">
                            <ZoomInIcon />
                        </IconButton>
                    </Box>
                </Stack>

                <Stack direction="row" spacing={1}>
                    {/* Download Button (Admin Only) */}
                    {role === 'admin' && (
                        <IconButton onClick={handleDownload} size="small" title="Download PDF">
                            <DownloadIcon />
                        </IconButton>
                    )}

                    {/* Close Button */}
                    {onClose && (
                        <IconButton onClick={onClose} size="small" title="Close">
                            <CloseIcon />
                        </IconButton>
                    )}
                </Stack>
            </Stack>

            {/* PDF Display */}
            <Box
                sx={{
                    flex: 1,
                    overflow: 'auto',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    backgroundColor: '#525659',
                    p: 2
                }}
            >
                {pdfBlob && (
                    <Suspense fallback={
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                            <CircularProgress />
                        </Box>
                    }>
                    <PdfDocument
                        file={pdfBlob}
                        onLoadSuccess={onDocumentLoadSuccess}
                        loading={
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                                <CircularProgress />
                            </Box>
                        }
                        error={
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                                <Typography color="error">Failed to load PDF</Typography>
                            </Box>
                        }
                    >
                        {/* Render all pages for scrolling */}
                        {Array.from(new Array(numPages), (el, index) => (
                            <Box
                                key={`page_${index + 1}`}
                                ref={(el) => (pageRefs.current[index + 1] = el)}
                                data-page-number={index + 1}
                                sx={{ mb: 2 }}
                            >
                                <PdfPage
                                    pageNumber={index + 1}
                                    scale={scale}
                                    renderTextLayer={false}
                                    renderAnnotationLayer={false}
                                />
                            </Box>
                        ))}
                    </PdfDocument>
                    </Suspense>
                )}
            </Box>
        </Box>
    );
};

SecurePdfViewer.propTypes = {
    pdfUrl: PropTypes.string.isRequired,
    policyName: PropTypes.string,
    role: PropTypes.oneOf(['employee', 'admin']),
    onClose: PropTypes.func
};

export default SecurePdfViewer;
