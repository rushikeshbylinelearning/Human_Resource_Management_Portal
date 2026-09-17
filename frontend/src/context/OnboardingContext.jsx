// frontend/src/context/OnboardingContext.jsx
// Manages the onboarding flow state. Works alongside AuthContext without duplicating
// any auth logic. Reads onboarding status from the user object (returned by /api/auth/me).

import React, {
    createContext, useContext, useState, useCallback, useEffect, useRef
} from 'react';
import { useAuth } from './AuthContext';
import api from '../api/axios';

const OnboardingContext = createContext(null);

// Steps in order:
// 0 = not started / loading
// 1 = policy popup
// 2 = app tour
// 3 = profile completion prompt
// 4 = fully complete (don't show anything)
const STEP = {
    LOADING:  0,
    POLICY:   1,
    TOUR:     2,
    PROFILE:  3,
    DONE:     4,
};

export const OnboardingProvider = ({ children }) => {
    const { user, authStatus, updateUserContext } = useAuth();
    const [step, setStep] = useState(STEP.LOADING);
    const [mandatoryPolicy, setMandatoryPolicy] = useState(null);
    const [statusLoaded, setStatusLoaded] = useState(false);
    const [policyAcceptancePending, setPolicyAcceptancePending] = useState(false);
    const [tourPending, setTourPending] = useState(false);
    const firstLoginApiCalled = useRef(false);

    // New state for standalone policy acknowledgements (for existing employees)
    const [pendingPolicies, setPendingPolicies] = useState([]);
    const [standalonePolicyModalOpen, setStandalonePolicyModalOpen] = useState(false);
    const [currentStandalonePolicy, setCurrentStandalonePolicy] = useState(null);
    const [hasTemplate, setHasTemplate] = useState(false);
    const [pendingTour, setPendingTour] = useState(false);
    const [flow, setFlow] = useState({
        requirePolicy: true,
        requireTour: true,
        requireProfile: true,
    });

    // Determine which step the user is at based on their onboarding object.
    // This is purely derived — never stores its own copy of user data.
    // Caller must only invoke this for employees eligible for onboarding
    // (created after the feature start date, or admin-forced).
    const computeStep = useCallback((onboarding, policy, flowSettings) => {
        if (!onboarding) return STEP.DONE;
        if (onboarding.completed) return STEP.DONE;

        const requirePolicy = flowSettings?.requirePolicy !== false;
        const requireTour = flowSettings?.requireTour !== false;
        const requireProfile = flowSettings?.requireProfile !== false;

        if (requirePolicy && !onboarding.policyAccepted && policy) return STEP.POLICY;
        if ((requireTour || onboarding.tourRequired) && !onboarding.tourCompleted) return STEP.TOUR;
        if (requireProfile && !onboarding.profileCompleted) return STEP.PROFILE;
        return STEP.DONE;
    }, []);

    // Load onboarding status from backend (includes mandatory policy reference)
    const loadStatus = useCallback(async () => {
        if (!user || authStatus !== 'authenticated') return;

        // Skip onboarding for Admin and HR
        if (user.role === 'Admin' || user.role === 'HR') {
            setStep(STEP.DONE);
            setStatusLoaded(true);
            return;
        }

        try {
            const { data } = await api.get('/onboarding/status');
            setMandatoryPolicy(data.mandatoryPolicy || null);
            setPendingTour(Boolean(data.pendingTour));
            const flowSettings = data.flow || { requirePolicy: true, requireTour: true, requireProfile: true };
            setFlow(flowSettings);

            if (!data.isNewOnboardingEmployee) {
                setStep(data.pendingTour ? STEP.TOUR : STEP.DONE);
                loadPendingPolicies();
                return;
            }

            let ob = data.onboarding || user.onboarding || {};

            if (!ob.firstLoginCompleted && !firstLoginApiCalled.current) {
                firstLoginApiCalled.current = true;
                try {
                    const { data: fl } = await api.post('/onboarding/first-login');
                    if (fl.isNewOnboardingEmployee === false) {
                        setStep(data.pendingTour ? STEP.TOUR : STEP.DONE);
                        loadPendingPolicies();
                        return;
                    }
                    ob = fl.onboarding || ob;
                    updateUserContext({ onboarding: ob });
                } catch (e) {
                    console.error('[Onboarding] recordFirstLogin failed:', e.message);
                }
            }

            const nextStep = computeStep(ob, data.mandatoryPolicy, flowSettings);
            setStep(nextStep);
            if (nextStep !== STEP.POLICY) {
                loadPendingPolicies();
            }
        } catch (e) {
            console.error('[Onboarding] Failed to load status:', e.message);
            // On error, don't block the user — let them proceed normally
            setStep(STEP.DONE);
        } finally {
            setStatusLoaded(true);
        }
    }, [user, authStatus, computeStep, updateUserContext]);

    // When auth becomes authenticated, load status once
    useEffect(() => {
        if (authStatus === 'authenticated' && user && !statusLoaded) {
            loadStatus();
        }
        if (authStatus === 'unauthenticated') {
            setStep(STEP.LOADING);
            setStatusLoaded(false);
            firstLoginApiCalled.current = false;
        }
    }, [authStatus, user, statusLoaded, loadStatus]);

    // Record first login (idempotent — backend handles duplicates).
    // Prefer enrollment via loadStatus; this remains for orchestrator fallback.
    const recordFirstLogin = useCallback(async () => {
        if (firstLoginApiCalled.current) return;
        firstLoginApiCalled.current = true;
        try {
            const { data } = await api.post('/onboarding/first-login');
            if (data.isNewOnboardingEmployee === false) {
                setStep(STEP.DONE);
                return;
            }
            updateUserContext({ onboarding: data.onboarding });
            setStep(computeStep(data.onboarding, mandatoryPolicy, flow));
        } catch (e) {
            console.error('[Onboarding] recordFirstLogin failed:', e.message);
        }
    }, [updateUserContext, computeStep, mandatoryPolicy, flow]);

    // Called when employee starts reading the policy
    const recordReadingStart = useCallback(async () => {
        try {
            await api.post('/onboarding/policy/start-reading');
        } catch (e) {
            console.error('[Onboarding] recordReadingStart failed:', e.message);
        }
    }, []);

    // Called when employee accepts policy
    const acceptPolicy = useCallback(async (payload) => {
        setPolicyAcceptancePending(true);
        try {
            const { data } = await api.post('/onboarding/policy/accept', payload);
            updateUserContext({ onboarding: data.onboarding });
            setStep(computeStep(data.onboarding, mandatoryPolicy, flow));
            return { success: true };
        } catch (e) {
            const msg = e.response?.data?.error || 'Failed to accept policy.';
            return { success: false, error: msg };
        } finally {
            setPolicyAcceptancePending(false);
        }
    }, [updateUserContext, computeStep, mandatoryPolicy, flow]);

    // Called when employee finishes the tour
    const completeTour = useCallback(async () => {
        setTourPending(true);
        try {
            const { data } = await api.post('/onboarding/tour/complete');
            updateUserContext({ onboarding: data.onboarding });
            setPendingTour(false);
            setStep(computeStep(data.onboarding, mandatoryPolicy, flow));
        } catch (e) {
            console.error('[Onboarding] completeTour failed:', e.message);
        } finally {
            setTourPending(false);
        }
    }, [updateUserContext, computeStep, mandatoryPolicy, flow]);

    // Called only after all required profile fields are saved
    const completeProfile = useCallback(async () => {
        try {
            const { data } = await api.post('/onboarding/profile/complete');
            updateUserContext({ onboarding: data.onboarding });
            setStep(STEP.DONE);
            return { success: true };
        } catch (e) {
            const msg = e.response?.data?.error || 'Failed to complete onboarding.';
            console.error('[Onboarding] completeProfile failed:', msg);
            return { success: false, error: msg };
        }
    }, [updateUserContext]);

    // Dismiss profile reminder (doesn't complete it — just hides the banner temporarily)
    const dismissProfileBanner = useCallback(() => {
        setStep(STEP.DONE);
    }, []);

    // ─── Standalone Policy Acknowledgement Functions ─────────────────────────────

    // Load pending policies for existing employees
    const loadPendingPolicies = useCallback(async (opts = {}) => {
        if (!user || authStatus !== 'authenticated') return;
        if (user.role === 'Admin' || user.role === 'HR') return;

        try {
            const { data } = await api.get('/onboarding/pending-policies');
            const next = data.pendingPolicies || [];
            setPendingPolicies(next);

            if (next.length > 0 && (!standalonePolicyModalOpen || opts.forceOpen)) {
                const firstPolicy = next[0];
                setCurrentStandalonePolicy(firstPolicy);
                setHasTemplate(firstPolicy.hasTemplate || false);
                setStandalonePolicyModalOpen(true);
            } else if (next.length === 0) {
                setStandalonePolicyModalOpen(false);
                setCurrentStandalonePolicy(null);
                setHasTemplate(false);
                if (pendingTour) setStep(STEP.TOUR);
            }
        } catch (e) {
            console.error('[Onboarding] Failed to load pending policies:', e.message);
        }
    }, [user, authStatus, standalonePolicyModalOpen, pendingTour]);

    // Check if a policy has an active template (for conditional rendering)
    const checkPolicyHasTemplate = useCallback(async (policyName) => {
        try {
            await api.get(`/policy-templates/active?name=${encodeURIComponent(policyName)}`);
            setHasTemplate(true);
        } catch (e) {
            // 404 means no template exists - use PDF viewer
            setHasTemplate(false);
        }
    }, []);

    // Record reading start for standalone policy
    const recordStandaloneReadingStart = useCallback(async (logId) => {
        try {
            await api.post('/onboarding/policy/standalone-start-reading', { logId });
        } catch (e) {
            console.error('[Onboarding] recordStandaloneReadingStart failed:', e.message);
        }
    }, []);

    // Accept standalone policy
    const acceptStandalonePolicy = useCallback(async (payload) => {
        setPolicyAcceptancePending(true);
        try {
            const { data } = await api.post('/onboarding/policy/standalone-accept', payload);
            
            // Remove the accepted policy from pending list
            setPendingPolicies(prev => prev.filter(p => p.logId !== payload.logId));
            
            // Close modal and show next pending policy if any
            const remaining = pendingPolicies.filter(p => p.logId !== payload.logId);
            if (remaining.length > 0) {
                setCurrentStandalonePolicy(remaining[0]);
            } else {
                setStandalonePolicyModalOpen(false);
                setCurrentStandalonePolicy(null);
                if (pendingTour) setStep(STEP.TOUR);
            }
            
            return { success: true };
        } catch (e) {
            const msg = e.response?.data?.error || 'Failed to accept policy.';
            return { success: false, error: msg };
        } finally {
            setPolicyAcceptancePending(false);
        }
    }, [pendingPolicies, pendingTour]);

    // Manually open standalone policy modal
    const openStandalonePolicyModal = useCallback((policyData = null) => {
        const policy = policyData || (pendingPolicies.length > 0 ? pendingPolicies[0] : null);
        if (policy) {
            setCurrentStandalonePolicy(policy);
            // Use the hasTemplate flag from the policy object (already set by API)
            setHasTemplate(policy.hasTemplate || false);
        }
        setStandalonePolicyModalOpen(true);
    }, [pendingPolicies]);

    // Close standalone policy modal
    const closeStandalonePolicyModal = useCallback(() => {
        setStandalonePolicyModalOpen(false);
        setCurrentStandalonePolicy(null);
    }, []);

    const value = {
        STEP,
        step,
        mandatoryPolicy,
        statusLoaded,
        policyAcceptancePending,
        tourPending,
        isOnboardingActive: step > STEP.LOADING && step < STEP.DONE,
        showPolicyModal: step === STEP.POLICY,
        showTour: step === STEP.TOUR,
        showProfilePrompt: step === STEP.PROFILE,
        recordFirstLogin,
        recordReadingStart,
        acceptPolicy,
        completeTour,
        completeProfile,
        dismissProfileBanner,
        reloadStatus: loadStatus,
        // Standalone policy acknowledgement
        pendingPolicies,
        standalonePolicyModalOpen,
        currentStandalonePolicy,
        hasTemplate, // NEW: flag for conditional rendering
        loadPendingPolicies,
        recordStandaloneReadingStart,
        acceptStandalonePolicy,
        openStandalonePolicyModal,
        closeStandalonePolicyModal,
    };

    return (
        <OnboardingContext.Provider value={value}>
            {children}
        </OnboardingContext.Provider>
    );
};

export const useOnboarding = () => {
    const ctx = useContext(OnboardingContext);
    if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
    return ctx;
};

export default OnboardingContext;
