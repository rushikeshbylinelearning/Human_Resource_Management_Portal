import { memo, useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { PdfDocument, PdfPage } from '../lazy/LazyPdfComponents';
import api from '../../api/axios';
import '../../styles/CustomPdfViewer.css';

const MIN_READ_SECONDS = 60;

const STATUS = {
    pending: { label: 'Pending', className: 'is-pending' },
    viewed: { label: 'Viewed', className: 'is-viewed' },
    acknowledged: { label: 'Acknowledged', className: 'is-acknowledged' },
    hr_pending: { label: 'HR Pending', className: 'is-pending' },
};

const DocumentCenterModal = memo(({
    open,
    onClose,
    documents,
    initialDocumentId = null,
    onDocumentsUpdated,
    hasPersonalEmail = false,
}) => {
    const [selectedId, setSelectedId] = useState(null);
    const [pdfBlob, setPdfBlob] = useState(null);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [pdfError, setPdfError] = useState(null);
    const [numPages, setNumPages] = useState(null);
    const [scale] = useState(1.15);

    const [acknowledged, setAcknowledged] = useState(false);
    const [hasReachedEnd, setHasReachedEnd] = useState(false);
    const [readingSeconds, setReadingSeconds] = useState(0);
    const [ackPending, setAckPending] = useState(false);
    const [ackError, setAckError] = useState('');

    // Forward-to-email state: keyed by document _id so each row is independent
    const [forwardingId, setForwardingId] = useState(null);
    const [forwardToast, setForwardToast] = useState({ open: false, message: '', isError: false });

    const contentRef = useRef(null);
    const readingStartRef = useRef(null);
    const readingStartNotifiedRef = useRef(false);

    const visibleDocs = documents.filter((d) => d.fileRef);
    const selectedDoc = visibleDocs.find((d) => d._id === selectedId) || null;
    const needsAck = selectedDoc?.requiresAcknowledgment && !selectedDoc?.acknowledgedAt;
    const timerComplete = readingSeconds >= MIN_READ_SECONDS;
    const canAcknowledge = timerComplete && hasReachedEnd;

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric',
        });
    };

    const checkReachedEnd = useCallback(() => {
        const el = contentRef.current;
        if (!el || !numPages) return false;
        const threshold = 64;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
        return atBottom;
    }, [numPages]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    useEffect(() => {
        if (!open) return;
        if (visibleDocs.length === 0) {
            setSelectedId(null);
            return;
        }
        setSelectedId((prev) => {
            if (prev && visibleDocs.some((d) => d._id === prev)) return prev;
            if (initialDocumentId && visibleDocs.some((d) => d._id === initialDocumentId)) {
                return initialDocumentId;
            }
            return visibleDocs[0]._id;
        });
    }, [open, initialDocumentId, documents]);

    useEffect(() => {
        if (!open || !selectedId) return;

        setPdfBlob(null);
        setPdfError(null);
        setNumPages(null);
        setAcknowledged(false);
        setHasReachedEnd(false);
        setReadingSeconds(0);
        setAckError('');
        readingStartNotifiedRef.current = false;
        readingStartRef.current = null;

        const load = async () => {
            setPdfLoading(true);
            try {
                await api.post(`/employee-documents/${selectedId}/view`);
                const response = await api.get(`/employee-documents/${selectedId}/file`, { responseType: 'blob' });
                setPdfBlob(response.data);
            } catch (err) {
                setPdfError(err.response?.data?.error || 'Failed to load document.');
            } finally {
                setPdfLoading(false);
            }
        };

        load();
    }, [open, selectedId]);

    useEffect(() => {
        if (!needsAck || !numPages) return undefined;

        readingStartRef.current = Date.now();
        if (!readingStartNotifiedRef.current) {
            readingStartNotifiedRef.current = true;
            api.post(`/employee-documents/${selectedId}/start-reading`).catch(console.error);
        }

        const intervalId = setInterval(() => {
            setReadingSeconds(Math.floor((Date.now() - readingStartRef.current) / 1000));
        }, 1000);

        return () => clearInterval(intervalId);
    }, [needsAck, numPages, selectedId]);

    useEffect(() => {
        const el = contentRef.current;
        if (!el) return undefined;

        const onScroll = () => {
            if (needsAck) setHasReachedEnd(checkReachedEnd());
        };

        el.addEventListener('scroll', onScroll);
        onScroll();
        return () => el.removeEventListener('scroll', onScroll);
    }, [needsAck, numPages, pdfBlob, checkReachedEnd]);

    const handleDownload = async (doc, e) => {
        e?.stopPropagation();
        try {
            const response = await api.get(`/employee-documents/${doc._id}/file`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = doc.fileName || `${doc.documentTypeLabel}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
            await api.post(`/employee-documents/${doc._id}/view`);
            onDocumentsUpdated?.();
        } catch (err) {
            console.error(err);
        }
    };

    const handleForwardEmail = async (doc, e) => {
        e?.stopPropagation();
        setForwardingId(doc._id);
        try {
            const { data } = await api.post(`/employee-documents/${doc._id}/forward-email`);
            setForwardToast({ open: true, message: data.message || 'Document sent to your personal email.', isError: false });
        } catch (err) {
            const msg = err.response?.data?.error || 'Failed to send. Please try again.';
            setForwardToast({ open: true, message: msg, isError: true });
        } finally {
            setForwardingId(null);
        }
    };

    const handleAcknowledge = async () => {
        if (!selectedDoc || !acknowledged || !canAcknowledge) return;
        setAckPending(true);
        setAckError('');
        try {
            await api.post(`/employee-documents/${selectedDoc._id}/acknowledge`, {
                checkboxAcknowledged: true,
                scrolledToBottom: true,
                readingDurationSeconds: readingSeconds,
            });
            await onDocumentsUpdated?.();
        } catch (err) {
            setAckError(err.response?.data?.error || 'Failed to acknowledge document.');
        } finally {
            setAckPending(false);
        }
    };

    // Auto-dismiss the forward toast after 4.5 s
    useEffect(() => {
        if (!forwardToast.open) return undefined;
        const id = setTimeout(() => setForwardToast((t) => ({ ...t, open: false })), 4500);
        return () => clearTimeout(id);
    }, [forwardToast.open]);

    if (!open) return null;

    const timerRemaining = Math.max(0, MIN_READ_SECONDS - readingSeconds);

    const modal = createPortal(
        <div className="doc-center-overlay" onClick={onClose} role="presentation">
            <div
                className="doc-center-modal doc-center-modal-split"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="doc-center-title"
            >
                <header className="doc-center-header">
                    <div className="doc-center-header-text">
                        <h2 id="doc-center-title" className="doc-center-title">Document Center</h2>
                        <p className="doc-center-subtitle">
                            {visibleDocs.length} document{visibleDocs.length !== 1 ? 's' : ''} assigned to you
                        </p>
                    </div>
                    <button type="button" className="doc-center-close" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </header>

                {visibleDocs.length === 0 ? (
                    <div className="doc-center-body">
                        <p className="doc-center-empty">No documents assigned yet.</p>
                    </div>
                ) : (
                    <div className="doc-center-split">
                        {/* Left — document list */}
                        <aside className="doc-center-sidebar">
                            <ul className="doc-center-list">
                                {visibleDocs.map((doc) => {
                                    const status = STATUS[doc.displayStatus] || STATUS.pending;
                                    const isSelected = doc._id === selectedId;

                                    return (
                                        <li key={doc._id}>
                                            <div
                                                className={`doc-center-card${isSelected ? ' is-selected' : ''}`}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setSelectedId(doc._id)}
                                                onKeyDown={(e) => e.key === 'Enter' && setSelectedId(doc._id)}
                                            >
                                                <div className="doc-center-card-icon" aria-hidden="true">
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                                        <path d="M14 2H6C5.47 2 4.96 2.21 4.59 2.59C4.21 2.96 4 3.47 4 4v16c0 .53.21 1.04.59 1.41.37.38.88.59 1.41.59h12c.53 0 1.04-.21 1.41-.59.38-.37.59-.88.59-1.41V8L14 2z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                                                        <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                </div>

                                                <div className="doc-center-card-info">
                                                    <div className="doc-center-card-title-row">
                                                        <span className="doc-center-card-title">{doc.documentTypeLabel}</span>
                                                        <span className={`doc-center-status ${status.className}`}>
                                                            {status.label}
                                                        </span>
                                                    </div>
                                                    <span className="doc-center-card-date">
                                                        Assigned {formatDate(doc.assignedAt)}
                                                    </span>
                                                </div>

                                                <div className="doc-center-card-actions">
                                                    <button
                                                        type="button"
                                                        className="doc-center-btn-download"
                                                        onClick={(e) => handleDownload(doc, e)}
                                                    >
                                                        Download
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="doc-center-btn-forward"
                                                        onClick={(e) => handleForwardEmail(doc, e)}
                                                        disabled={forwardingId === doc._id || !hasPersonalEmail}
                                                        title={
                                                            !hasPersonalEmail
                                                                ? 'Add a personal email in your profile to enable this'
                                                                : 'Forward to your personal email'
                                                        }
                                                        aria-label={
                                                            !hasPersonalEmail
                                                                ? 'Forward unavailable — add a personal email in your profile'
                                                                : `Forward ${doc.documentTypeLabel} to your personal email`
                                                        }
                                                    >
                                                        {forwardingId === doc._id ? (
                                                            <span className="doc-center-btn-forward-spinner" aria-hidden="true" />
                                                        ) : (
                                                            /* mail/send icon */
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                                                <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                            </svg>
                                                        )}
                                                    </button>
                                                    {!hasPersonalEmail && (
                                                        <span className="doc-center-btn-forward-hint" aria-live="polite">
                                                            No personal email —{' '}
                                                            <a
                                                                href="#contact"
                                                                onClick={(e) => { e.stopPropagation(); onClose(); }}
                                                                className="doc-center-btn-forward-hint-link"
                                                            >
                                                                add one in your profile
                                                            </a>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </aside>

                        {/* Right — document preview */}
                        <div className="doc-center-preview-pane">
                            {selectedDoc ? (
                                <>
                                    <div className="doc-center-preview-head">
                                        <h3 className="doc-center-preview-title">{selectedDoc.documentTypeLabel}</h3>
                                        <span className="doc-center-preview-date">
                                            Assigned {formatDate(selectedDoc.assignedAt)}
                                        </span>
                                    </div>

                                    <div
                                        className={`doc-center-preview-scroll${needsAck && hasReachedEnd ? ' with-ack-bar' : ''}`}
                                        ref={contentRef}
                                    >
                                        {pdfLoading && (
                                            <div className="doc-center-preview-loading">
                                                <div className="pdf-spinner" />
                                                <p>Loading document…</p>
                                            </div>
                                        )}
                                        {pdfError && (
                                            <div className="doc-center-preview-error">{pdfError}</div>
                                        )}
                                        {!pdfLoading && !pdfError && pdfBlob && (
                                            <Suspense fallback={
                                                <div className="doc-center-preview-loading">
                                                    <div className="pdf-spinner" />
                                                    <p>Loading document…</p>
                                                </div>
                                            }>
                                            <PdfDocument
                                                file={pdfBlob}
                                                onLoadSuccess={({ numPages: pages }) => setNumPages(pages)}
                                                onLoadError={() => setPdfError('Failed to render PDF.')}
                                                loading=""
                                            >
                                                {Array.from(new Array(numPages), (_, i) => (
                                                    <div key={`p_${i + 1}`} className="doc-center-pdf-page">
                                                        <PdfPage
                                                            pageNumber={i + 1}
                                                            scale={scale}
                                                            renderTextLayer
                                                            renderAnnotationLayer
                                                        />
                                                    </div>
                                                ))}
                                            </PdfDocument>
                                            </Suspense>
                                        )}
                                    </div>

                                    {needsAck && hasReachedEnd && numPages && !pdfError && (
                                        <div className="pdf-ack-consent-bar doc-center-ack-bar" role="region">
                                            <div className="pdf-ack-bar-inner">
                                                <div className="pdf-ack-meta">
                                                    <span className="pdf-ack-policy">{selectedDoc.documentTypeLabel}</span>
                                                    <span
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
                                                        />
                                                        <span className="pdf-ack-checkbox-text">
                                                            I have read and understood this document
                                                        </span>
                                                    </label>
                                                    <button
                                                        type="button"
                                                        className="pdf-ack-accept-btn"
                                                        disabled={!acknowledged || !canAcknowledge || ackPending}
                                                        onClick={handleAcknowledge}
                                                    >
                                                        {ackPending ? 'Submitting…' : 'Acknowledge'}
                                                    </button>
                                                </div>
                                            </div>
                                            {ackError && <p className="pdf-ack-error" role="alert">{ackError}</p>}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="doc-center-preview-placeholder">
                                    Select a document from the list to preview
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );

    return (
        <>
            {modal}
            {/* Forward-email toast — separate portal so it floats above the modal overlay */}
            {forwardToast.open && createPortal(
                <div
                    className={`doc-forward-toast${forwardToast.isError ? ' is-error' : ''}`}
                    role="status"
                    aria-live="polite"
                >
                    {forwardToast.isError ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                            <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    )}
                    <span>{forwardToast.message}</span>
                    <button
                        type="button"
                        className="doc-forward-toast-close"
                        onClick={() => setForwardToast((t) => ({ ...t, open: false }))}
                        aria-label="Dismiss"
                    >
                        ×
                    </button>
                </div>,
                document.body
            )}
        </>
    );
});

DocumentCenterModal.displayName = 'DocumentCenterModal';
export default DocumentCenterModal;
