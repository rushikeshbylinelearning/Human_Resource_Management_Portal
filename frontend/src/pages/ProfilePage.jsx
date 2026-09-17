import { useCallback, useEffect, useState, useMemo, useRef, Suspense } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import socket from '../socket';
import ProfileMain from '../components/Profile/ProfileMain';
import ProfilePolicies from '../components/Profile/ProfilePolicies';
import ProfileSidebar from '../components/Profile/ProfileSidebar';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import ProfileCompletionBanner from '../components/onboarding/ProfileCompletionBanner';
import { useOnboarding } from '../context/OnboardingContext';
import '../styles/ProfilePage.css';

const CustomPdfViewer = lazyWithRetry(() => import('../components/CustomPdfViewer'));

/**
 * ROOT CAUSE FIX #1: Prevent re-renders from causing layout mutations
 * - Memoize child components
 * - Use refs to track layout lock state
 * - Separate data loading from layout rendering
 */

const ProfilePage = () => {
    const { user, refreshUserData } = useAuth();
    const { showProfilePrompt, completeProfile, STEP, step } = useOnboarding();
    const [searchParams, setSearchParams] = useSearchParams();
    const [formData, setFormData] = useState({
        // Personal
        dateOfBirth: '', gender: '', bloodGroup: '', maritalStatus: '',
        // Contact
        phoneNumber: '', phoneCountryCode: '+91',
        alternatePhone: '', personalEmail: '',
        // Address
        addressFlat: '', addressArea: '', addressCity: '', addressState: '', addressPincode: '',
        marriageDate: '', interests: '', hobbies: '',
        // Emergency contact
        emergencyContactName: '', emergencyContactNumber: '', emergencyContactCountryCode: '+91',
        emergencyContactRelationship: '', emergencyContactEmail: '',
        // Identity & Bank
        aadhaarNumber: '', panCardNumber: '',
        bankName: '', accountNumber: '', ifscCode: '', bankBranch: '',
        uanNumber: '', pfAccountNumber: '',
    });
    const [saving, setSaving] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [policies, setPolicies] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [selectedPolicy, setSelectedPolicy] = useState(null);
    const [policyModalOpen, setPolicyModalOpen] = useState(false);
    const [documentCenterOpen, setDocumentCenterOpen] = useState(false);
    const [initialDocumentId, setInitialDocumentId] = useState(null);
    
    // ROOT CAUSE FIX: Track if initial layout has been rendered
    const layoutLocked = useRef(false);
    const initialLoadComplete = useRef(false);

    // ROOT CAUSE FIX: Load data ONCE on mount, not on every user change
    useEffect(() => {
        if (initialLoadComplete.current) return;
        
        const loadInitialData = async () => {
            if (!user) return;
            
            // Set form data synchronously to prevent layout shift
            setFormData({
                // Personal
                dateOfBirth:   user.personalDetails?.dateOfBirth   || '',
                gender:        user.personalDetails?.gender        || '',
                bloodGroup:    user.personalDetails?.bloodGroup    || '',
                maritalStatus: user.personalDetails?.maritalStatus || '',
                // Contact
                phoneNumber:      user.personalDetails?.phoneNumber      || '',
                phoneCountryCode: user.personalDetails?.phoneCountryCode || '+91',
                alternatePhone:   user.personalDetails?.alternatePhone   || '',
                personalEmail:    user.personalDetails?.personalEmail    || '',
                // Address
                addressFlat:    user.personalDetails?.address?.flat    || '',
                addressArea:    user.personalDetails?.address?.area    || '',
                addressCity:    user.personalDetails?.address?.city    || '',
                addressState:   user.personalDetails?.address?.state   || '',
                addressPincode: user.personalDetails?.address?.pincode || '',
                marriageDate:   user.personalDetails?.marriageDate   || '',
                interests:      user.personalDetails?.interests      || '',
                hobbies:        user.personalDetails?.hobbies        || '',
                // Emergency contact
                emergencyContactName:         user.personalDetails?.emergencyContactName         || '',
                emergencyContactNumber:       user.personalDetails?.emergencyContactNumber       || '',
                emergencyContactCountryCode:  user.personalDetails?.emergencyContactCountryCode  || '+91',
                emergencyContactRelationship: user.personalDetails?.emergencyContactRelationship || '',
                emergencyContactEmail:        user.personalDetails?.emergencyContactEmail        || '',
                // Identity & Bank
                aadhaarNumber:   user.identityDetails?.aadhaarNumber   || '',
                panCardNumber:   user.identityDetails?.panCardNumber   || '',
                bankName:        user.identityDetails?.bankName        || '',
                accountNumber:   user.identityDetails?.accountNumber   || '',
                ifscCode:        user.identityDetails?.ifscCode        || '',
                bankBranch:      user.identityDetails?.bankBranch      || '',
                uanNumber:       user.identityDetails?.uanNumber       || '',
                pfAccountNumber: user.identityDetails?.pfAccountNumber || '',
            });

            // Load policies asynchronously WITHOUT affecting layout
            try {
                const [policiesRes, docsRes] = await Promise.all([
                    api.get('/policies-gridfs'),
                    api.get('/employee-documents/mine').catch(() => ({ data: { documents: [] } })),
                ]);
                setPolicies(policiesRes.data.policies || []);
                setDocuments(docsRes.data.documents || []);
                
                // Check if we need to open a specific policy from URL params
                const section = searchParams.get('section');
                const policyId = searchParams.get('policyId');
                const documentId = searchParams.get('documentId');
                
                if (section === 'policies' && policyId && policiesRes.data.policies) {
                    const policy = policiesRes.data.policies.find(p => p._id === policyId);
                    if (policy) {
                        setSelectedPolicy(policy);
                        setPolicyModalOpen(true);
                        setSearchParams({});
                    }
                } else if (section === 'documents' && documentId) {
                    setInitialDocumentId(documentId);
                    setDocumentCenterOpen(true);
                    setSearchParams({});
                } else if (section === 'documents') {
                    setInitialDocumentId(null);
                    setDocumentCenterOpen(true);
                    setSearchParams({});
                } else if (section === 'policies') {
                    // Just scroll to policies section if no specific policy
                    setTimeout(() => {
                        const policiesSection = document.querySelector('.profile-policies');
                        if (policiesSection) {
                            policiesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }, 300);
                    setSearchParams({});
                }
            } catch (e) {
                console.error('Failed to load policies:', e);
            }
            
            initialLoadComplete.current = true;
            
            // Lock layout after first render
            setTimeout(() => {
                layoutLocked.current = true;
            }, 100);
        };
        
        loadInitialData();
    }, []); // Only run once on mount

    // Listen for profile updates via Socket.IO
    useEffect(() => {
        if (!user) return;

        const handleProfileUpdate = (data) => {
            // Check if the update is for the current user
            if (data.userId === user.id || data.userId === user._id) {
                console.log('[ProfilePage] Received profile update event:', data);
                // Refresh user data from server
                refreshUserData().then(() => {
                    console.log('[ProfilePage] User data refreshed after profile update');
                    // Show notification if reporting person changed
                    if (data.field === 'reportingPerson') {
                        setSnackbar({ 
                            open: true, 
                            severity: 'info', 
                            message: 'Your reporting person has been updated by admin' 
                        });
                    }
                }).catch(err => {
                    console.error('[ProfilePage] Failed to refresh user data:', err);
                });
            }
        };

        // Listen for user profile updates
        socket.on('user_profile_updated', handleProfileUpdate);

        // Cleanup listener on unmount
        return () => {
            socket.off('user_profile_updated', handleProfileUpdate);
        };
    }, [user, refreshUserData]);

    // Update form data when user data changes (e.g., after socket update)
    useEffect(() => {
        if (!user || !initialLoadComplete.current) return;
        
        // Update form data with latest user data
        setFormData({
            dateOfBirth:   user.personalDetails?.dateOfBirth   || '',
            gender:        user.personalDetails?.gender        || '',
            bloodGroup:    user.personalDetails?.bloodGroup    || '',
            maritalStatus: user.personalDetails?.maritalStatus || '',
            phoneNumber:      user.personalDetails?.phoneNumber      || '',
            phoneCountryCode: user.personalDetails?.phoneCountryCode || '+91',
            alternatePhone:   user.personalDetails?.alternatePhone   || '',
            personalEmail:    user.personalDetails?.personalEmail    || '',
            addressFlat:    user.personalDetails?.address?.flat    || '',
            addressArea:    user.personalDetails?.address?.area    || '',
            addressCity:    user.personalDetails?.address?.city    || '',
            addressState:   user.personalDetails?.address?.state   || '',
            addressPincode: user.personalDetails?.address?.pincode || '',
            marriageDate:   user.personalDetails?.marriageDate   || '',
            interests:      user.personalDetails?.interests      || '',
            hobbies:        user.personalDetails?.hobbies        || '',
            emergencyContactName:         user.personalDetails?.emergencyContactName         || '',
            emergencyContactNumber:       user.personalDetails?.emergencyContactNumber       || '',
            emergencyContactCountryCode:  user.personalDetails?.emergencyContactCountryCode  || '+91',
            emergencyContactRelationship: user.personalDetails?.emergencyContactRelationship || '',
            emergencyContactEmail:        user.personalDetails?.emergencyContactEmail        || '',
            aadhaarNumber:   user.identityDetails?.aadhaarNumber   || '',
            panCardNumber:   user.identityDetails?.panCardNumber   || '',
            bankName:        user.identityDetails?.bankName        || '',
            accountNumber:   user.identityDetails?.accountNumber   || '',
            ifscCode:        user.identityDetails?.ifscCode        || '',
            bankBranch:      user.identityDetails?.bankBranch      || '',
            uanNumber:       user.identityDetails?.uanNumber       || '',
            pfAccountNumber: user.identityDetails?.pfAccountNumber || '',
        });
    }, [user?.personalDetails, user?.identityDetails, user?.reportingPerson]);

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            const payload = {
                personalDetails: {
                    dateOfBirth:   formData.dateOfBirth,
                    gender:        formData.gender,
                    bloodGroup:    formData.bloodGroup,
                    maritalStatus: formData.maritalStatus,
                    phoneNumber:      formData.phoneNumber,
                    phoneCountryCode: formData.phoneCountryCode,
                    alternatePhone:   formData.alternatePhone,
                    personalEmail:    formData.personalEmail,
                    address: {
                        flat:    formData.addressFlat,
                        area:    formData.addressArea,
                        city:    formData.addressCity,
                        state:   formData.addressState,
                        pincode: formData.addressPincode,
                    },
                    emergencyContactName:         formData.emergencyContactName,
                    emergencyContactNumber:       formData.emergencyContactNumber,
                    emergencyContactCountryCode:  formData.emergencyContactCountryCode,
                    emergencyContactRelationship: formData.emergencyContactRelationship,
                    emergencyContactEmail:        formData.emergencyContactEmail,
                    marriageDate: formData.marriageDate,
                    interests:    formData.interests,
                    hobbies:      formData.hobbies,
                },
                identityDetails: {
                    aadhaarNumber:   formData.aadhaarNumber,
                    panCardNumber:   formData.panCardNumber,
                    bankName:        formData.bankName,
                    accountNumber:   formData.accountNumber,
                    ifscCode:        formData.ifscCode,
                    bankBranch:      formData.bankBranch,
                    uanNumber:       formData.uanNumber,
                    pfAccountNumber: formData.pfAccountNumber,
                },
            };
            
            await api.put('/user/update-profile', payload);
            await refreshUserData();
            setSnackbar({ open: true, severity: 'success', message: 'Profile updated successfully!' });

            // Onboarding completes only after all required profile fields are saved
            if (step === STEP?.PROFILE) {
                const { data: onboardingStatus } = await api.get('/onboarding/status');
                if (onboardingStatus.profileCompleted) {
                    const result = await completeProfile();
                    if (result?.success === false) {
                        setSnackbar({
                            open: true,
                            severity: 'error',
                            message: result.error || 'Complete all required profile fields to finish onboarding.',
                        });
                    }
                }
            }
        } catch (e) {
            setSnackbar({ open: true, severity: 'error', message: 'Failed to save profile.' });
        }
        setSaving(false);
    }, [formData, refreshUserData, step, STEP, completeProfile]);

    const handleFieldChange = useCallback((field, value) => {
        // ROOT CAUSE FIX: Prevent layout mutations during form updates
        if (layoutLocked.current) {
            setFormData(prev => ({ ...prev, [field]: value }));
        }
    }, []);

    const handlePolicyClick = useCallback((policy) => {
        setSelectedPolicy(policy);
        setPolicyModalOpen(true);
    }, []);

    const handleClosePolicyModal = useCallback(() => {
        setPolicyModalOpen(false);
        setSelectedPolicy(null);
    }, []);

    const loadDocuments = useCallback(async () => {
        try {
            const { data } = await api.get('/employee-documents/mine');
            setDocuments(data.documents || []);
            return data.documents || [];
        } catch (e) {
            console.error('Failed to load documents:', e);
            return [];
        }
    }, []);

    const handleCloseDocumentCenter = useCallback(() => {
        setDocumentCenterOpen(false);
        setInitialDocumentId(null);
    }, []);
    const getPdfUrl = (policy) => {
        if (!policy?._id) return '';
        
        // Relative to the api axios baseURL (/api).
        // Do NOT include /api prefix here; the axios instance already has it as baseURL.
        return `/policies-gridfs/${policy._id}/file`;
    };

    // ROOT CAUSE FIX: Memoize sidebar to prevent re-renders
    const memoizedSidebar = useMemo(() => (
        <ProfileSidebar user={user} />
    ), [user?.fullName, user?.employeeCode, user?.department, user?.joiningDate, user?.email, user?.profileImageUrl]);

    // ROOT CAUSE FIX: Memoize policies to prevent re-renders
    const memoizedPolicies = useMemo(() => (
        <ProfilePolicies
            policies={policies}
            onPolicyClick={handlePolicyClick}
            documents={documents}
            documentCenterOpen={documentCenterOpen}
            initialDocumentId={initialDocumentId}
            onDocumentCenterClose={handleCloseDocumentCenter}
            onDocumentsUpdated={loadDocuments}
            hasPersonalEmail={!!(user?.personalDetails?.personalEmail)}
        />
    ), [policies, documents, documentCenterOpen, initialDocumentId, handlePolicyClick, handleCloseDocumentCenter, loadDocuments, user?.personalDetails?.personalEmail]);

    return (
        <div className="profile-page">
            {/* Onboarding: show profile completion banner when in onboarding PROFILE step */}
            {showProfilePrompt && (
                <div style={{ padding: '0 0 8px 0' }}>
                    <ProfileCompletionBanner />
                </div>
            )}
            <div className="profile-container">
                {memoizedSidebar}
                <ProfileMain 
                    user={user}
                    formData={formData}
                    onFieldChange={handleFieldChange}
                    onSave={handleSave}
                    saving={saving}
                />
                {memoizedPolicies}
            </div>

            {snackbar.open && (
                <div className={`profile-snackbar profile-snackbar-${snackbar.severity}`}>
                    {snackbar.message}
                    <button onClick={() => setSnackbar({ ...snackbar, open: false })}>×</button>
                </div>
            )}

            {/* FIX: PDF Viewer now handles its own modal - removed redundant wrapper */}
            {policyModalOpen && selectedPolicy && (
                <Suspense fallback={null}>
                    <CustomPdfViewer
                        pdfUrl={getPdfUrl(selectedPolicy)}
                        title={selectedPolicy.name || 'Company Policy'}
                        version={selectedPolicy.version || '1.0'}
                        effectiveDate={selectedPolicy.effectiveFrom}
                        onClose={handleClosePolicyModal}
                    />
                </Suspense>
            )}
        </div>
    );
};

export default ProfilePage;
