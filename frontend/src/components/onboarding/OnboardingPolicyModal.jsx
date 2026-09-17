// frontend/src/components/onboarding/OnboardingPolicyModal.jsx
// Fullscreen, undismissable policy compliance flow during onboarding.
// Uses ConsentWizard when a published template exists; otherwise the PDF viewer.

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useOnboarding } from '../../context/OnboardingContext';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const CustomPdfViewer = lazyWithRetry(() => import('../CustomPdfViewer'));
const ConsentWizard = lazyWithRetry(() => import('./ConsentWizard'));

const OnboardingPolicyModal = () => {
    const {
        mandatoryPolicy,
        recordReadingStart,
        acceptPolicy,
        policyAcceptancePending,
        reloadStatus,
    } = useOnboarding();

    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const blockNavigation = (e) => {
            if (e.key === 'Escape') e.preventDefault();
            if (e.altKey && e.key === 'ArrowLeft') e.preventDefault();
        };
        const blockBack = () => {
            window.history.pushState(null, '', window.location.pathname);
        };
        window.addEventListener('keydown', blockNavigation, true);
        window.addEventListener('popstate', blockBack);
        window.history.pushState(null, '', window.location.pathname);
        return () => {
            window.removeEventListener('keydown', blockNavigation, true);
            window.removeEventListener('popstate', blockBack);
        };
    }, []);

    const handleAccept = useCallback(async ({ checkboxAcknowledged, scrolledToBottom, readingDurationSeconds }) => {
        if (!checkboxAcknowledged || !scrolledToBottom || submitting || !mandatoryPolicy) return;
        setError('');
        setSubmitting(true);
        const result = await acceptPolicy({
            policyId: mandatoryPolicy._id,
            policyVersion: mandatoryPolicy.version,
            checkboxAcknowledged: true,
            scrolledToBottom: true,
            readingDurationSeconds,
        });
        if (!result.success) {
            setError(result.error || 'Failed to submit. Please try again.');
        }
        setSubmitting(false);
    }, [acceptPolicy, mandatoryPolicy, submitting]);

    if (!mandatoryPolicy?._id) return null;

    if (mandatoryPolicy.hasTemplate) {
        return (
            <Suspense fallback={null}>
                <ConsentWizard
                    open
                    onClose={() => {}}
                    policyId={mandatoryPolicy._id}
                    policyName={mandatoryPolicy.name}
                    logId={mandatoryPolicy.logId}
                    requireConsent
                    onSuccess={() => {
                        if (reloadStatus) reloadStatus();
                    }}
                />
            </Suspense>
        );
    }

    return (
        <Suspense fallback={null}>
            <CustomPdfViewer
                mode="onboarding-policy"
                pdfUrl={`/policies-gridfs/${mandatoryPolicy._id}/file`}
                title={mandatoryPolicy.name || 'Company Policy'}
                version={mandatoryPolicy.version || '1.0'}
                effectiveDate={mandatoryPolicy.effectiveFrom}
                dismissable={false}
                onReadingStart={recordReadingStart}
                onAccept={handleAccept}
                acceptancePending={submitting || policyAcceptancePending}
                acceptError={error}
            />
        </Suspense>
    );
};

export default OnboardingPolicyModal;
