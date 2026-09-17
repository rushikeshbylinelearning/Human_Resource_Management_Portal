import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { PdfDocument, PdfPage } from './lazy/LazyPdfComponents';
import '../styles/CustomPdfViewer.css';
import api from '../api/axios';

const MIN_READ_SECONDS = 60;

const CustomPdfViewer = ({
    pdfUrl,
    title,
    version,
    effectiveDate,
    onClose,
    mode,
    dismissable = true,
    onAccept,
    onReadingStart,
    acceptancePending = false,
    acceptError = '',
}) => {
    const isAcknowledgmentMode = mode === 'onboarding-policy' || mode === 'employee-document';
    const isOnboardingPolicy = mode === 'onboarding-policy';

    const [numPages, setNumPages] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [scale, setScale] = useState(isAcknowledgmentMode ? 1.2 : 1.0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pdfBlob, setPdfBlob] = useState(null);
    const [acknowledged, setAcknowledged] = useState(false);
    const [hasReachedEnd, setHasReachedEnd] = useState(false);
    const [readingSeconds, setReadingSeconds] = useState(0);

    const modalRef = useRef(null);
    const contentRef = useRef(null);
    const pageRefs = useRef({});
    const readingStartRef = useRef(null);
    const readingStartNotifiedRef = useRef(false);

    const timerComplete = readingSeconds >= MIN_READ_SECONDS;
    const canAcknowledge = timerComplete && hasReachedEnd;

    const checkReachedEnd = useCallback((pageHint) => {
        const el = contentRef.current;
        if (!el || !numPages) return false;

        const threshold = 64;
        const scrollTop = el.scrollTop;
        const scrollHeight = el.scrollHeight;
        const clientHeight = el.clientHeight;
        const atScrollBottom = scrollHeight - scrollTop - clientHeight <= threshold;

        const scrollPercentage = scrollTop / Math.max(scrollHeight - clientHeight, 1);
        const calculatedPage = pageHint ?? Math.min(
            Math.ceil(scrollPercentage * numPages) || 1,
            numPages
        );

        return atScrollBottom || calculatedPage >= numPages;
    }, [numPages]);

    const onDocumentLoadSuccess = useCallback(({ numPages: pages }) => {
        setNumPages(pages);
        setLoading(false);
        setError(null);
    }, []);

    const onDocumentLoadError = useCallback((err) => {
        console.error('Error loading PDF:', err);
        setError('Failed to load PDF document');
        setLoading(false);
    }, []);

    useEffect(() => {
        const fetchPdf = async () => {
            try {
                setLoading(true);
                setError(null);
                setAcknowledged(false);
                setHasReachedEnd(false);
                setReadingSeconds(0);
                readingStartNotifiedRef.current = false;
                const response = await api.get(pdfUrl, { responseType: 'blob' });
                setPdfBlob(response.data);
            } catch (err) {
                console.error('Error fetching PDF:', err);
                setError(err.message || 'Failed to load PDF');
                setLoading(false);
            }
        };

        fetchPdf();
    }, [pdfUrl]);

    // Minimum reading timer — starts when the policy document first renders
    useEffect(() => {
        if (!isAcknowledgmentMode || !numPages) return undefined;

        readingStartRef.current = Date.now();
        if (onReadingStart && !readingStartNotifiedRef.current) {
            readingStartNotifiedRef.current = true;
            onReadingStart();
        }

        const intervalId = setInterval(() => {
            setReadingSeconds(Math.floor((Date.now() - readingStartRef.current) / 1000));
        }, 1000);

        return () => clearInterval(intervalId);
    }, [isAcknowledgmentMode, numPages, onReadingStart]);

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

    useEffect(() => {
        if (!dismissable) return undefined;

        const handleEscKey = (event) => {
            if (event.key === 'Escape') onClose();
        };

        document.addEventListener('keydown', handleEscKey);
        return () => document.removeEventListener('keydown', handleEscKey);
    }, [onClose, dismissable]);

    useEffect(() => {
        if (modalRef.current) {
            modalRef.current.focus();
        }
    }, []);

    // Track current page and detect when the employee has reached the document end
    useEffect(() => {
        const handleScroll = () => {
            if (!contentRef.current || !numPages) return;

            const scrollTop = contentRef.current.scrollTop;
            const scrollHeight = contentRef.current.scrollHeight;
            const clientHeight = contentRef.current.clientHeight;

            const scrollPercentage = scrollTop / Math.max(scrollHeight - clientHeight, 1);
            const calculatedPage = Math.min(
                Math.ceil(scrollPercentage * numPages) || 1,
                numPages
            );
            setCurrentPage(calculatedPage);

            if (isAcknowledgmentMode) {
                setHasReachedEnd(checkReachedEnd());
            }
        };

        const contentElement = contentRef.current;
        if (contentElement) {
            contentElement.addEventListener('scroll', handleScroll);
            handleScroll();
            return () => contentElement.removeEventListener('scroll', handleScroll);
        }
        return undefined;
    }, [numPages, isAcknowledgmentMode, checkReachedEnd]);

    // Re-check end position after page jumps (toolbar prev/next)
    useEffect(() => {
        if (!isAcknowledgmentMode || !numPages) return undefined;
        const timer = setTimeout(() => {
            setHasReachedEnd(checkReachedEnd());
        }, 350);
        return () => clearTimeout(timer);
    }, [currentPage, scale, isAcknowledgmentMode, numPages, checkReachedEnd]);

    // Clear checkbox if gating conditions are not met (fresh session safety)
    useEffect(() => {
        if (!canAcknowledge && acknowledged) {
            setAcknowledged(false);
        }
    }, [canAcknowledge, acknowledged]);

    const scrollToPage = useCallback((pageNum) => {
        const pageElement = pageRefs.current[pageNum];
        if (pageElement && contentRef.current) {
            pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setCurrentPage(pageNum);
            if (isAcknowledgmentMode) {
                window.setTimeout(() => {
                    setHasReachedEnd(checkReachedEnd(pageNum));
                }, 400);
            }
        }
    }, [isAcknowledgmentMode, checkReachedEnd]);

    const goToPrevPage = () => scrollToPage(Math.max(currentPage - 1, 1));
    const goToNextPage = () => scrollToPage(Math.min(currentPage + 1, numPages || 1));

    const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 3.0));
    const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.5));
    const resetZoom = () => setScale(isAcknowledgmentMode ? 1.2 : 1.0);
    const fitToWidth = () => setScale(1.2);

    const handleBackdropClick = (e) => {
        if (dismissable && e.target === e.currentTarget) {
            onClose();
        }
    };

    const handleAcceptClick = () => {
        if (!acknowledged || !canAcknowledge || acceptancePending) return;
        onAccept?.({
            checkboxAcknowledged: acknowledged,
            scrolledToBottom: true,
            readingDurationSeconds: readingSeconds,
        });
    };

    const formattedEffectiveDate = effectiveDate
        ? new Date(effectiveDate).toLocaleDateString()
        : 'N/A';

    const timerRemaining = Math.max(0, MIN_READ_SECONDS - readingSeconds);

    return createPortal(
        <>
            <div
                className={`pdf-modal-backdrop${isAcknowledgmentMode ? ' pdf-modal-backdrop-onboarding' : ''}`}
                onClick={handleBackdropClick}
                aria-hidden="true"
            />

            <div
                className={`pdf-modal-container${isAcknowledgmentMode ? ' pdf-modal-container-onboarding' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="pdf-viewer-title"
                ref={modalRef}
                tabIndex={-1}
            >
                <div className={`custom-pdf-viewer${isAcknowledgmentMode ? ' onboarding-policy-mode' : ''}`}>
                    <div className={`pdf-viewer-header${isAcknowledgmentMode ? ' pdf-viewer-header-onboarding' : ''}`}>
                        {isAcknowledgmentMode && <div className="pdf-viewer-accent-bar" />}
                        <div className="pdf-viewer-title">
                            {isAcknowledgmentMode && (
                                <span className="pdf-viewer-overline">
                                    {isOnboardingPolicy ? 'Mandatory Compliance' : 'Document Acknowledgment'}
                                </span>
                            )}
                            <h2 id="pdf-viewer-title">{title}</h2>
                            <p>
                                Version {version} • Effective from {formattedEffectiveDate}
                            </p>
                        </div>
                        {dismissable && (
                            <button
                                className="pdf-viewer-close"
                                onClick={onClose}
                                aria-label="Close PDF viewer"
                                title="Close (ESC)"
                            >
                                ×
                            </button>
                        )}
                    </div>

                    <div className="pdf-viewer-toolbar">
                        <div className="pdf-toolbar-section">
                            <button
                                className="pdf-toolbar-btn"
                                onClick={goToPrevPage}
                                disabled={currentPage <= 1}
                                title="Previous Page"
                                aria-label="Previous page"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                            <span className="pdf-page-info" aria-live="polite">
                                Page {currentPage} of {numPages || '...'}
                            </span>
                            <button
                                className="pdf-toolbar-btn"
                                onClick={goToNextPage}
                                disabled={currentPage >= (numPages || 1)}
                                title="Next Page"
                                aria-label="Next page"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                        </div>

                        <div className="pdf-toolbar-section">
                            <button className="pdf-toolbar-btn" onClick={zoomOut} disabled={scale <= 0.5} title="Zoom Out" aria-label="Zoom out">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
                                    <path d="M8 11H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            </button>
                            <span className="pdf-zoom-info" aria-live="polite">{Math.round(scale * 100)}%</span>
                            <button className="pdf-toolbar-btn" onClick={zoomIn} disabled={scale >= 3.0} title="Zoom In" aria-label="Zoom in">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
                                    <path d="M11 8V14M8 11H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            </button>
                            <button className="pdf-toolbar-btn" onClick={resetZoom} title="Reset Zoom (100%)" aria-label="Reset zoom to 100%">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <path d="M1 4V10H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M23 20V14H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                            <button className="pdf-toolbar-btn" onClick={fitToWidth} title="Fit to Width" aria-label="Fit to width">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                                    <path d="M9 3V21M15 3V21" stroke="currentColor" strokeWidth="2" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div className={`pdf-viewer-body${isAcknowledgmentMode ? ' pdf-viewer-body-onboarding' : ''}`}>
                    <div
                        className={`pdf-viewer-content${isAcknowledgmentMode ? ' pdf-viewer-content-onboarding' : ''}${isAcknowledgmentMode && hasReachedEnd ? ' pdf-viewer-content-with-bar' : ''}`}
                        ref={contentRef}
                    >
                        {loading && (
                            <div className="pdf-loading">
                                <div className="pdf-spinner" />
                                <p>Loading PDF...</p>
                            </div>
                        )}

                        {error && (
                            <div className="pdf-error">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="#E53935" strokeWidth="2" />
                                    <path d="M12 8V12" stroke="#E53935" strokeWidth="2" strokeLinecap="round" />
                                    <circle cx="12" cy="16" r="1" fill="#E53935" />
                                </svg>
                                <p>{error}</p>
                            </div>
                        )}

                        {!error && pdfBlob && (
                            <Suspense fallback={
                                <div className="pdf-loading">
                                    <div className="pdf-spinner" />
                                    <p>Loading PDF...</p>
                                </div>
                            }>
                            <PdfDocument
                                file={pdfBlob}
                                onLoadSuccess={onDocumentLoadSuccess}
                                onLoadError={onDocumentLoadError}
                                loading=""
                                error=""
                            >
                                {Array.from(new Array(numPages), (_, index) => (
                                    <div
                                        key={`page_${index + 1}`}
                                        ref={(el) => { pageRefs.current[index + 1] = el; }}
                                        className="pdf-page-wrapper"
                                        data-page-number={index + 1}
                                    >
                                        <PdfPage
                                            pageNumber={index + 1}
                                            scale={scale}
                                            renderTextLayer={true}
                                            renderAnnotationLayer={true}
                                            loading={
                                                <div className="pdf-page-loading">
                                                    <div className="pdf-page-spinner" />
                                                </div>
                                            }
                                        />
                                        <div className="pdf-page-number-badge">
                                            Page {index + 1} of {numPages}
                                        </div>
                                    </div>
                                ))}
                            </PdfDocument>
                            </Suspense>
                        )}
                    </div>

                        {isAcknowledgmentMode && hasReachedEnd && !error && numPages && (
                            <div
                                className="pdf-ack-consent-bar"
                                role="region"
                                aria-label="Policy acknowledgment"
                            >
                                <div className="pdf-ack-bar-inner">
                                    <div className="pdf-ack-meta">
                                        <span className="pdf-ack-policy" title={title}>{title}</span>
                                        <span className="pdf-ack-version">v{version}</span>
                                        <span className="pdf-ack-sep" aria-hidden="true" />
                                        <span
                                            id="pdf-ack-status-timer"
                                            className={`pdf-ack-req${timerComplete ? ' is-met' : ''}`}
                                        >
                                            {timerComplete ? 'Minimum read time met' : `${timerRemaining}s remaining`}
                                        </span>
                                        <span className="pdf-ack-req is-met">Document reviewed</span>
                                    </div>

                                    <div className="pdf-ack-actions">
                                        <label
                                            className={`pdf-ack-checkbox-row${acknowledged ? ' checked' : ''}${!canAcknowledge ? ' locked' : ''}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={acknowledged}
                                                onChange={(e) => setAcknowledged(e.target.checked)}
                                                disabled={!canAcknowledge}
                                                aria-describedby={!canAcknowledge ? 'pdf-ack-status-timer' : undefined}
                                            />
                                            <span className="pdf-ack-checkbox-text">
                                                I have read and understood this policy
                                            </span>
                                        </label>

                                        <button
                                            type="button"
                                            className="pdf-ack-accept-btn"
                                            disabled={!acknowledged || !canAcknowledge || acceptancePending}
                                            onClick={handleAcceptClick}
                                        >
                                            {acceptancePending ? 'Submitting…' : 'Accept & Continue'}
                                        </button>
                                    </div>
                                </div>

                                {acceptError && (
                                    <p className="pdf-ack-error" role="alert">{acceptError}</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>,
        document.body
    );
};

export default CustomPdfViewer;
