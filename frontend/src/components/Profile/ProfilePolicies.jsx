import { memo, useState, useEffect, Suspense } from 'react';
import HRQueryChat from '../HRQueryChat';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const DocumentCenterModal = lazyWithRetry(() => import('./DocumentCenterModal'));

const ProfilePolicies = memo(({
    policies,
    onPolicyClick,
    documents = [],
    documentCenterOpen = false,
    initialDocumentId = null,
    onDocumentCenterClose,
    onDocumentsUpdated,
    hasPersonalEmail = false,
}) => {
    const [centerOpen, setCenterOpen] = useState(false);

    const docCount = documents.filter((d) => d.fileRef).length;
    const pendingCount = documents.filter(
        (d) => d.fileRef && d.displayStatus === 'pending'
    ).length;

    useEffect(() => {
        if (documentCenterOpen) setCenterOpen(true);
    }, [documentCenterOpen]);

    const handleCloseCenter = () => {
        setCenterOpen(false);
        onDocumentCenterClose?.();
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-IN', {
            month: 'short', day: 'numeric', year: 'numeric',
        });
    };

    return (
        <div className="profile-policies">
            <h3 className="policies-title">Policies &amp; Feedback</h3>

            {/* Company Policies */}
            <div className="policies-section">
                <h4 className="policies-section-title">COMPANY POLICIES</h4>
                <div className="policies-list">
                    {policies.length === 0 ? (
                        <p className="policies-empty">No policies available</p>
                    ) : (
                        policies.map((policy) => (
                            <div
                                key={policy._id}
                                className="policy-item"
                                onClick={() => onPolicyClick(policy)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => e.key === 'Enter' && onPolicyClick(policy)}
                            >
                                <div className="policy-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                        <path d="M14 2H6C5.47 2 4.96 2.21 4.59 2.59C4.21 2.96 4 3.47 4 4v16c0 .53.21 1.04.59 1.41.37.38.88.59 1.41.59h12c.53 0 1.04-.21 1.41-.59.38-.37.59-.88.59-1.41V8L14 2z" stroke="#E53935" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <polyline points="14 2 14 8 20 8" stroke="#E53935" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </div>
                                <div className="policy-content">
                                    <div className="policy-header">
                                        <span className="policy-name">{policy.name}</span>
                                        <span className={`policy-status ${policy.status === 'Active' ? 'status-active' : 'status-archived'}`}>
                                            {policy.status}
                                        </span>
                                    </div>
                                    <div className="policy-meta">
                                        <span className="policy-version">v{policy.version}</span>
                                        <span className="policy-divider">·</span>
                                        <span className="policy-date">Effective {formatDate(policy.effectiveFrom)}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* My Documents — Document Center entry */}
            <div className="policies-section">
                <h4 className="policies-section-title">MY DOCUMENTS</h4>
                <button
                    type="button"
                    className="document-center-btn"
                    onClick={() => setCenterOpen(true)}
                >
                    <span className="document-center-btn-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </span>
                    <span className="document-center-btn-text">
                        <span className="document-center-btn-label">Document Center</span>
                        <span className="document-center-btn-hint">
                            {docCount === 0
                                ? 'No documents yet'
                                : `${docCount} document${docCount !== 1 ? 's' : ''}${pendingCount > 0 ? ` · ${pendingCount} pending` : ''}`}
                        </span>
                    </span>
                    {pendingCount > 0 && (
                        <span className="document-center-badge">{pendingCount}</span>
                    )}
                    <svg className="document-center-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>
            </div>

            <Suspense fallback={null}>
                <DocumentCenterModal
                    open={centerOpen}
                    onClose={handleCloseCenter}
                    documents={documents}
                    initialDocumentId={initialDocumentId}
                    onDocumentsUpdated={onDocumentsUpdated}
                    hasPersonalEmail={hasPersonalEmail}
                />
            </Suspense>

            {/* HR Query Chat */}
            <div className="policies-section">
                <h4 className="policies-section-title-bold">ASK HR</h4>
                <HRQueryChat />
            </div>
        </div>
    );
});

ProfilePolicies.displayName = 'ProfilePolicies';
export default ProfilePolicies;
