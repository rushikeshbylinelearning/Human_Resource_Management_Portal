import React, { Suspense } from 'react';
import { useOnboarding } from '../../context/OnboardingContext';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const ConsentWizard = lazyWithRetry(() => import('./ConsentWizard'));
const StandalonePolicyModal = lazyWithRetry(() => import('./StandalonePolicyModal'));

/**
 * ConditionalPolicyModal
 * 
 * Routes between the ConsentWizard (for policies with active templates)
 * and StandalonePolicyModal (for legacy PDF-only policies).
 * 
 * Reads state from OnboardingContext and conditionally renders the appropriate modal.
 */
const ConditionalPolicyModal = () => {
  const {
    standalonePolicyModalOpen,
    currentStandalonePolicy,
    closeStandalonePolicyModal,
    hasTemplate,
    loadPendingPolicies,
  } = useOnboarding();

  if (!standalonePolicyModalOpen || !currentStandalonePolicy) {
    return null;
  }

  // If policy has an active template, show the ConsentWizard
  if (hasTemplate) {
    return (
      <Suspense fallback={null}>
        <ConsentWizard
          open={standalonePolicyModalOpen}
          onClose={closeStandalonePolicyModal}
          policyId={currentStandalonePolicy.policyId}
          policyName={currentStandalonePolicy.policyName}
          logId={currentStandalonePolicy.logId}
          onSuccess={() => {
            loadPendingPolicies({ forceOpen: true });
          }}
        />
      </Suspense>
    );
  }

  // Otherwise, show the legacy PDF viewer (StandalonePolicyModal manages its own state)
  return (
    <Suspense fallback={null}>
      <StandalonePolicyModal />
    </Suspense>
  );
};

export default ConditionalPolicyModal;
