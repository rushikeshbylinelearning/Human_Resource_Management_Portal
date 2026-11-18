// frontend/src/pages/PublicProfileForm.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import './PublicProfileForm.css';
import { getApiOrigin } from '../utils/apiBaseUrl';
import { aadhaarError, panError, accountNumberError, ifscError, digitsOnly } from '../utils/indiaIdentity';

// Plain axios — no auth interceptors
const API_BASE_URL = getApiOrigin();
const publicApi = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

// ── Default state (flat field names matching the rest of the app) ──
const DEFAULT_FORM = {
  personalDetails: {
    dateOfBirth: '', gender: '', bloodGroup: '', maritalStatus: '',
    phoneNumber: '', phoneCountryCode: '+91', alternatePhone: '', personalEmail: '',
    addressFlat: '', addressArea: '', addressCity: '', addressState: '', addressPincode: '',
    emergencyContactName: '', emergencyContactNumber: '', emergencyContactCountryCode: '+91',
    emergencyContactRelationship: '', emergencyContactEmail: '',
  },
  identityDetails: {
    aadhaarNumber: '', panCardNumber: '', bankName: '', accountNumber: '', ifscCode: '',
    bankBranch: '', uanNumber: '', pfAccountNumber: '',
  },
};

const mergeWithDefaults = (defaults, server) => {
  if (!server || typeof server !== 'object') return { ...defaults };
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const sv = server[key];
    if (sv !== undefined && sv !== null && sv !== '') {
      result[key] = (typeof defaults[key] === 'object' && !Array.isArray(defaults[key]))
        ? mergeWithDefaults(defaults[key], sv)
        : sv;
    }
  }
  return result;
};

const buildFormFromEmployee = (emp) => ({
  personalDetails: mergeWithDefaults(DEFAULT_FORM.personalDetails, {
    dateOfBirth:                  emp.personalDetails?.dateOfBirth || '',
    gender:                       emp.personalDetails?.gender || '',
    bloodGroup:                   emp.personalDetails?.bloodGroup || '',
    maritalStatus:                emp.personalDetails?.maritalStatus || '',
    phoneNumber:                  emp.personalDetails?.phoneNumber || '',
    phoneCountryCode:             emp.personalDetails?.phoneCountryCode || '+91',
    alternatePhone:               emp.personalDetails?.alternatePhone || '',
    personalEmail:                emp.personalDetails?.personalEmail || '',
    addressFlat:                  emp.personalDetails?.address?.flat || '',
    addressArea:                  emp.personalDetails?.address?.area || '',
    addressCity:                  emp.personalDetails?.address?.city || '',
    addressState:                 emp.personalDetails?.address?.state || '',
    addressPincode:               emp.personalDetails?.address?.pincode || '',
    emergencyContactName:         emp.personalDetails?.emergencyContactName || '',
    emergencyContactNumber:       emp.personalDetails?.emergencyContactNumber || '',
    emergencyContactCountryCode:  emp.personalDetails?.emergencyContactCountryCode || '+91',
    emergencyContactRelationship: emp.personalDetails?.emergencyContactRelationship || '',
    emergencyContactEmail:        emp.personalDetails?.emergencyContactEmail || '',
  }),
  identityDetails: mergeWithDefaults(DEFAULT_FORM.identityDetails, {
    aadhaarNumber:   emp.identityDetails?.aadhaarNumber || '',
    panCardNumber:   emp.identityDetails?.panCardNumber || '',
    bankName:        emp.identityDetails?.bankName || '',
    accountNumber:   emp.identityDetails?.accountNumber || '',
    ifscCode:        emp.identityDetails?.ifscCode || '',
    bankBranch:      emp.identityDetails?.bankBranch || '',
    uanNumber:       emp.identityDetails?.uanNumber || '',
    pfAccountNumber: emp.identityDetails?.pfAccountNumber || '',
  }),
});

const PATTERNS = {
  phone:   /^[6-9]\d{9}$/,
  pincode: /^\d{6}$/,
  email:   /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};

const STEPS = ['Personal', 'Address', 'Emergency', 'Identity', 'Documents'];

// ── KYC document types (mirrors backend catalogue) ────────────────────────────
// Always required: Aadhaar, PAN, Educational Certificates.
// Each orGroup needs one upload. Everything else is optional.
const KYC_TYPES = [
  { key: 'aadhaar',                 label: 'Aadhaar Card',             isOptional: false },
  { key: 'pan',                     label: 'PAN Card',                 isOptional: false },
  { key: 'educational_certificate', label: 'Educational Certificates', isOptional: false },
  { key: 'utility_bill',            label: 'Utility Bill',             isOptional: false, orGroup: 'address_proof' },
  { key: 'rent_agreement',          label: 'Rent Agreement',           isOptional: false, orGroup: 'address_proof' },
  { key: 'salary_slip',             label: 'Salary Slips',             isOptional: false, orGroup: 'income_proof' },
  { key: 'bank_statement',          label: 'Bank Statements',          isOptional: false, orGroup: 'income_proof' },
  { key: 'bank_details',            label: 'Bank Details',             isOptional: false, orGroup: 'bank_proof' },
  { key: 'cancelled_cheque',        label: 'Cancelled Cheque',         isOptional: false, orGroup: 'bank_proof' },
  { key: 'passport',                label: 'Passport',                 isOptional: true },
  { key: 'driving_license',         label: "Driver's License",         isOptional: true },
  { key: 'relieving_letter',        label: 'Relieving Letter',         isOptional: true },
  { key: 'experience_letter',       label: 'Experience Letter',        isOptional: true },
];

const KYC_OR_GROUPS = [
  { id: 'address_proof', label: 'Utility Bill or Rent Agreement' },
  { id: 'income_proof',  label: 'Salary Slips or Bank Statements' },
  { id: 'bank_proof',    label: 'Bank Details or Cancelled Cheque' },
];

const KYC_ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
const KYC_MAX_SIZE = 5 * 1024 * 1024;

function kycGetExt(filename = '') {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx).toLowerCase();
}
function kycGetMime(ext) {
  const map = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
  return map[ext] || 'application/octet-stream';
}
function kycGetStatusMeta(status) {
  switch (status) {
    case 'verified':       return { label: 'Verified',       className: 'kyc-status--verified' };
    case 'rejected':       return { label: 'Rejected',       className: 'kyc-status--rejected' };
    case 'pending_review': return { label: 'Pending Review', className: 'kyc-status--pending'  };
    default:               return { label: 'Not Uploaded',   className: 'kyc-status--none'     };
  }
}

// ── KycRow — single document upload row for the public form ─────────────────
// Uses the public-token API endpoints instead of the JWT-authenticated ones.
const KycRow = ({ typeMeta, document: doc, token, onUploaded }) => {
  const [uploading, setUploading] = React.useState(false);
  const [error, setError]         = React.useState('');
  const [progress, setProgress]   = React.useState(0);
  const fileInputRef               = React.useRef(null);
  const statusMeta                 = kycGetStatusMeta(doc?.status);

  const handleFileSelect = React.useCallback(async (file) => {
    setError('');
    setProgress(0);
    if (!file) return;

    const ext = kycGetExt(file.name);
    if (!KYC_ALLOWED_EXTENSIONS.includes(ext)) {
      setError(`Not allowed. Use: ${KYC_ALLOWED_EXTENSIONS.join(', ')}`);
      return;
    }
    if (file.size > KYC_MAX_SIZE) {
      setError('File exceeds 5 MB limit.');
      return;
    }
    if (file.size === 0) {
      setError('File is empty.');
      return;
    }

    const mimeType = kycGetMime(ext);
    setUploading(true);

    try {
      // Single-request proxy upload — file goes to our own backend as
      // multipart/form-data; the backend uploads it to B2 server-side.
      // No presigned URL, no direct-to-B2 PUT, no B2 CORS involved at all.
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('documentType', typeMeta.key);

      setProgress(10);
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) setProgress(10 + Math.round((e.loaded / e.total) * 80));
      });

      const confirmed = await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (_) {
              reject(new Error('Upload succeeded but the server response could not be read.'));
            }
          } else {
            let detail = `HTTP ${xhr.status}`;
            try {
              const parsed = JSON.parse(xhr.responseText);
              if (parsed?.error) detail = parsed.error;
            } catch (_) {}
            reject(new Error(detail));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload. Check your connection and try again.'));
        xhr.ontimeout = () => reject(new Error('Upload timed out. Please try again on a faster connection.'));
        xhr.timeout = 2 * 60 * 1000; // 2 minutes — well above what a 2MB upload to our own server needs
        xhr.open('POST', `/api/public/kyc/upload?token=${encodeURIComponent(token)}`);
        xhr.withCredentials = true;
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        // No manual Content-Type header — the browser sets the correct
        // multipart/form-data boundary automatically for FormData bodies.
        xhr.send(form);
      });

      setProgress(100);
      onUploaded(typeMeta.key, confirmed.document);
    } catch (err) {
      const data = err.response?.data;
      const msg = data?.error || data?.message || err.message || 'Upload failed.';
      const retryAfter = data?.retryAfter;
      setError(retryAfter
        ? `${msg} (retry in ${Math.ceil(retryAfter / 60)} min)`
        : msg
      );
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [typeMeta.key, token, onUploaded]);

  return (
    <div className={`kyc-row${uploading ? ' kyc-row--uploading' : ''}`}>
      <div className="kyc-row-info">
        <span className="kyc-row-label">
          {typeMeta.label}
          {typeMeta.isOptional && (
            <span className="pf-label-optional" style={{ marginLeft: 6 }}>Optional</span>
          )}
          {typeMeta.orGroup && (
            <span className="pf-label-optional" style={{ marginLeft: 6 }}>Either</span>
          )}
        </span>
        <span className={`kyc-status ${statusMeta.className}`}>{statusMeta.label}</span>
        {doc?.status === 'rejected' && doc?.rejectionReason && (
          <span className="kyc-rejection-reason">Reason: {doc.rejectionReason}</span>
        )}
        {doc?.originalFileName && (
          <span className="kyc-file-name">{doc.originalFileName}</span>
        )}
      </div>

      <div className="kyc-row-actions">
        <label
          className={`kyc-btn kyc-btn--upload${uploading ? ' kyc-btn--disabled' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelect(f); }}
          role="button"
          tabIndex={uploading ? -1 : 0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
          aria-label={doc ? `Re-upload ${typeMeta.label}` : `Upload ${typeMeta.label}`}
        >
          {uploading ? (
            <span className="kyc-spinner" aria-hidden="true" />
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {uploading ? (progress > 0 ? `${progress}%` : 'Uploading…') : (doc ? 'Replace' : 'Upload')}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="kyc-file-input"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
            disabled={uploading}
            tabIndex={-1}
            aria-hidden="true"
          />
        </label>
      </div>

      {uploading && progress > 0 && (
        <div className="kyc-progress-bar-wrap" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="kyc-progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {error && <span className="kyc-row-error" role="alert">⚠ {error}</span>}
    </div>
  );
};

const Field = ({ label, children, error: fieldErr, optional }) => (
  <div className="pf-field">
    <label className="pf-label">
      {label}
      {optional && <span className="pf-label-optional">Optional</span>}
    </label>
    {children}
    {fieldErr && <span className="pf-error-text">⚠ {[].concat(fieldErr).join(', ')}</span>}
  </div>
);

const Input = ({ value, onChange, type = 'text', placeholder = '', maxLength, upper = false, hasError = false, ...rest }) => (
  <input
    className={`pf-input ${hasError ? 'has-error' : ''}`}
    type={type}
    value={value}
    onChange={e => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
    placeholder={placeholder}
    maxLength={maxLength}
    {...rest}
  />
);

const Select = ({ value, onChange, options }) => (
  <select className="pf-select" value={value} onChange={e => onChange(e.target.value)}>
    <option value="">Select</option>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);

// ── Component ─────────────────────────────────────────────────────────────────
const PublicProfileForm = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);
  const [success, setSuccess]       = useState(false);
  const [employee, setEmployee]     = useState(null);
  const [needsAuth, setNeedsAuth]   = useState(false);
  const [linkType, setLinkType]     = useState('individual');
  const [authEmail, setAuthEmail]   = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError]   = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [validationErrors, setValidationErrors] = useState({});
  const [formData, setFormData]     = useState(DEFAULT_FORM);

  // ── Step 5: KYC document state ──
  const [kycDocMap, setKycDocMap]         = useState({}); // key → doc | null
  const [kycLoading, setKycLoading]       = useState(false);
  const [kycLoadError, setKycLoadError]   = useState('');
  const [kycStepErrors, setKycStepErrors] = useState({}); // key → error msg for required docs

  useEffect(() => {
    if (!token) { setError('Invalid or missing link.'); setLoading(false); return; }
    publicApi.get('/api/public/validate', { params: { token } })
      .then(({ data }) => {
        if (data.requiresAuth) {
          setNeedsAuth(true);
          setLinkType(data.linkType || 'individual');
          return;
        }
        if (data.success && data.employee) {
          setNeedsAuth(false);
          setEmployee(data.employee);
          setFormData(buildFormFromEmployee(data.employee));
        }
      })
      .catch((err) => {
        const d = err.response?.data || {};
        if (d.expired) setError('This link has expired. Please contact HR for a new link.');
        else if (d.alreadyUsed) setError('This form has already been submitted. Contact HR to update.');
        else setError(d.error || 'Invalid link.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const draftKey = employee?._id ? `pf_draft_${employee._id}` : null;

  useEffect(() => {
    if (!draftKey || !employee) return;
    const id = setTimeout(() => localStorage.setItem(draftKey, JSON.stringify(formData)), 800);
    return () => clearTimeout(id);
  }, [formData, draftKey, employee]);

  useEffect(() => {
    if (!draftKey || !employee) return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const p = JSON.parse(saved);
        setFormData({
          personalDetails: mergeWithDefaults(DEFAULT_FORM.personalDetails, p.personalDetails),
          identityDetails: mergeWithDefaults(DEFAULT_FORM.identityDetails, p.identityDetails),
        });
      }
    } catch (_) {}
  }, [draftKey, employee]);

  // Load existing KYC documents when step 5 is first reached
  useEffect(() => {
    if (currentStep !== 5 || !token || !employee) return;
    if (Object.keys(kycDocMap).length > 0) return; // already loaded
    setKycLoading(true);
    setKycLoadError('');
    publicApi.get('/api/public/kyc/my-documents', { params: { token } })
      .then(({ data }) => {
        const map = {};
        for (const entry of data.documents) {
          map[entry.key] = entry.document;
        }
        setKycDocMap(map);
      })
      .catch(() => setKycLoadError('Failed to load existing documents. You can still upload below.'))
      .finally(() => setKycLoading(false));
  }, [currentStep, token, employee]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPD = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, personalDetails: { ...prev.personalDetails, [field]: value } }));
    setValidationErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }, []);
  const setID = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, identityDetails: { ...prev.identityDetails, [field]: value } }));
    setValidationErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }, []);

  const validateStep = (step) => {
    const errs = {};
    const pd = formData.personalDetails;
    const id = formData.identityDetails;

    if (step === 1) {
      if (pd.phoneNumber && !PATTERNS.phone.test(pd.phoneNumber))
        errs.phoneNumber = 'Must be a valid 10-digit Indian mobile number';
      const alternate = (pd.alternatePhone || '').trim();
      if (alternate && !PATTERNS.phone.test(alternate))
        errs.alternatePhone = 'Must be a valid 10-digit Indian mobile number';
      if (pd.personalEmail && !PATTERNS.email.test(pd.personalEmail))
        errs.personalEmail = 'Invalid email format';
    }
    if (step === 2) {
      if (pd.addressPincode && !PATTERNS.pincode.test(pd.addressPincode))
        errs.addressPincode = 'Must be a 6-digit pincode';
    }
    if (step === 3) {
      if (pd.emergencyContactNumber && !PATTERNS.phone.test(pd.emergencyContactNumber))
        errs.emergencyContactNumber = 'Must be a valid 10-digit Indian mobile number';
    }
    if (step === 4) {
      const aadhaarMsg = aadhaarError(id.aadhaarNumber);
      const panMsg = panError(id.panCardNumber);
      const accountMsg = accountNumberError(id.accountNumber);
      const ifscMsg = ifscError(id.ifscCode);
      if (aadhaarMsg) errs.aadhaarNumber = aadhaarMsg;
      if (panMsg) errs.panCardNumber = panMsg;
      if (accountMsg) errs.accountNumber = accountMsg;
      if (ifscMsg) errs.ifscCode = ifscMsg;
    }

    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  useEffect(() => {
    if (!error || !employee) return;
    const firstProblem = document.querySelector('.pf-error-text, [role="alert"].pf-error-text');
    if (firstProblem) firstProblem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error, employee, validationErrors, kycStepErrors]);

  const handleNext = () => { if (validateStep(currentStep)) setCurrentStep(s => Math.min(s + 1, 5)); };
  const handlePrev = () => setCurrentStep(s => Math.max(s - 1, 1));

  const validateKycStep = () => {
    const errs = {};
    for (const typeMeta of KYC_TYPES) {
      if (typeMeta.isOptional || typeMeta.orGroup) continue;
      if (!kycDocMap[typeMeta.key]) {
        errs[typeMeta.key] = 'This document is required before submitting.';
      }
    }
    for (const group of KYC_OR_GROUPS) {
      const hasOne = KYC_TYPES.some((t) => t.orGroup === group.id && kycDocMap[t.key]);
      if (!hasOne) {
        errs[group.id] = `Upload at least one: ${group.label}.`;
      }
    }
    setKycStepErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep(1)) {
      setCurrentStep(1);
      setError('Check the phone numbers. Alternate phone can be left blank.');
      return;
    }
    if (!validateStep(4)) {
      setCurrentStep(4);
      setError('Check Aadhaar, PAN, account number, and IFSC. Leave a field blank, or match its format.');
      return;
    }
    if (!validateKycStep()) {
      setError('Please upload all required documents before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await publicApi.post('/api/public/submit', {
        token,
        personalDetails: formData.personalDetails,
        identityDetails: formData.identityDetails,
      });
      if (data.success) {
        setSuccess(true);
        if (employee?._id) localStorage.removeItem(`pf_draft_${employee._id}`);
      }
    } catch (err) {
      const d = err.response?.data || {};
      if (d.requiresAuth || err.response?.status === 401) {
        setNeedsAuth(true);
        setEmployee(null);
        setAuthError('Your sign-in expired. Please enter your email and password again.');
        return;
      }
      if (d.errors) {
        setValidationErrors(d.errors);
        setError(Object.values(d.errors).flat().join(' • '));
      } else {
        setError(d.error || 'Submission failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };


  const handleUnlock = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      const { data } = await publicApi.post('/api/public/unlock', {
        token,
        email: authEmail.trim(),
        password: authPassword,
      });
      if (data.success && data.employee) {
        setAuthPassword('');
        setNeedsAuth(false);
        setEmployee(data.employee);
        setFormData(buildFormFromEmployee(data.employee));
        setKycDocMap({});
      }
    } catch (err) {
      const d = err.response?.data || {};
      setAuthError(d.error || 'Sign-in failed. Please try again.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  if (loading) return (
    <div className="pf-state-page">
      <div className="pf-state-card">
        <div className="pf-loading-icon" />
        <h2 className="pf-state-title">Validating your link…</h2>
        <p className="pf-state-body">Please wait while we verify your access.</p>
      </div>
    </div>
  );

  if (needsAuth && !employee) return (
    <div className="public-form-root">
      <form className="pf-card pf-auth-card" onSubmit={handleUnlock}>
        <div className="pf-header">
          <div className="pf-header-top">
            <div className="pf-header-text">
              <h1>Sign in to continue</h1>
              <p>
                {linkType === 'shared'
                  ? 'Use your work email and password. This form updates only your employee record.'
                  : 'This link is protected. Sign in with the work email and password for this employee.'}
              </p>
            </div>
          </div>
        </div>
        <div className="pf-auth-body">
          {authError && <div className="pf-alert pf-alert--error" role="alert">{authError}</div>}
          <label className="pf-label" htmlFor="pf-auth-email">Work email</label>
          <input
            id="pf-auth-email"
            className="pf-input"
            type="email"
            autoComplete="username"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            placeholder="name@company.com"
            required
            disabled={authSubmitting}
          />
          <label className="pf-label" htmlFor="pf-auth-password">Password</label>
          <input
            id="pf-auth-password"
            className="pf-input"
            type="password"
            autoComplete="current-password"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            placeholder="Your account password"
            required
            disabled={authSubmitting}
          />
          <button type="submit" className="pf-btn pf-btn--primary" disabled={authSubmitting}>
            {authSubmitting ? 'Checking…' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  );

  // ── Error state ────────────────────────────────────────────────────────────
  if (error && !employee) return (
    <div className="pf-state-page">
      <div className="pf-state-card">
        <div className="pf-error-icon">⚠️</div>
        <h2 className="pf-state-title">Unable to Load Form</h2>
        <p className="pf-state-body">{error}</p>
        <p className="pf-state-hint">Please contact your HR department for assistance.</p>
      </div>
    </div>
  );

  // ── Success state ──────────────────────────────────────────────────────────
  if (success) return (
    <div className="pf-state-page">
      <div className="pf-state-card">
        <div className="pf-success-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2 className="pf-state-title">Profile Submitted Successfully!</h2>
        <p className="pf-state-body">Thank you, <strong>{employee.fullName}</strong></p>
        <p className="pf-state-body">Your information has been saved and will reflect in the system shortly.</p>
        <p className="pf-state-hint">You can now close this window.</p>
      </div>
    </div>
  );

  const progress = (currentStep / 5) * 100;
  const pd = formData.personalDetails;
  const id = formData.identityDetails;

  return (
    <div className="public-form-root">
      {error && (
        <div className="pf-alert pf-alert--error pf-alert-fixed" role="alert">
          <span>{error}</span>
          <button type="button" className="pf-alert-close" onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      <div className="pf-card">
        {/* ── Header ── */}
        <div className="pf-header">
          <div className="pf-header-top">
            <div className="pf-logo-mark">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <div className="pf-header-text">
              <h1>Employee Profile Form</h1>
              <p>Complete your profile information</p>
            </div>
          </div>

          <div className="pf-employee-strip">
            <div className="pf-employee-avatar">{employee.fullName.charAt(0)}</div>
            <div className="pf-employee-info">
              <div className="pf-employee-name">{employee.fullName}</div>
              <div className="pf-employee-meta">
                <span className="pf-badge pf-badge--code">{employee.employeeCode}</span>
                {employee.department && <span className="pf-badge pf-badge--dept">{employee.department}</span>}
              </div>
            </div>
          </div>

          <div className="pf-progress-wrap">
            <div className="pf-progress-track">
              <div className="pf-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="pf-steps">
              {STEPS.map((label, i) => (
                <div key={label} className={`pf-step ${currentStep >= i + 1 ? 'active' : ''} ${currentStep > i + 1 ? 'done' : ''}`}>
                  <div className="pf-step-num">{i + 1}</div>
                  <div className="pf-step-label">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && currentStep < 5 && e.target.tagName !== 'TEXTAREA') {
              e.preventDefault();
              handleNext();
            }
          }}
        >
          <div className="pf-body">
            {/* ── Step 1: Personal ── */}
            {currentStep === 1 && (
              <div className="pf-step-content">
                <h3 className="pf-section-title">Personal Details</h3>
                <p className="pf-section-desc">Basic information about you</p>
                <div className="pf-grid">
                  <Field label="Date of Birth" optional><Input value={pd.dateOfBirth} onChange={v => setPD('dateOfBirth', v)} type="date" /></Field>
                  <Field label="Gender" optional><Select value={pd.gender} onChange={v => setPD('gender', v)} options={['Male', 'Female', 'Other']} /></Field>
                  <Field label="Blood Group" optional><Select value={pd.bloodGroup} onChange={v => setPD('bloodGroup', v)} options={['A+','A-','B+','B-','AB+','AB-','O+','O-']} /></Field>
                  <Field label="Marital Status" optional><Select value={pd.maritalStatus} onChange={v => setPD('maritalStatus', v)} options={['Single','Married','Divorced','Widowed']} /></Field>
                </div>
                <div className="pf-sub-label">Contact Information</div>
                <div className="pf-grid">
                  <Field label="Phone Number" error={validationErrors.phoneNumber}>
                    <div className="pf-phone-row">
                      <div className="pf-phone-code">
                        <select className="pf-select" value={pd.phoneCountryCode} onChange={e => setPD('phoneCountryCode', e.target.value)}>
                          <option value="+91">🇮🇳 +91</option>
                          <option value="+1">🇺🇸 +1</option>
                          <option value="+44">🇬🇧 +44</option>
                          <option value="+971">🇦🇪 +971</option>
                          <option value="+65">🇸🇬 +65</option>
                        </select>
                      </div>
                      <div className="pf-phone-input"><Input value={pd.phoneNumber} onChange={v => setPD('phoneNumber', v)} type="tel" placeholder="10-digit number" maxLength={10} hasError={!!validationErrors.phoneNumber} /></div>
                    </div>
                  </Field>
                  <Field label="Alternate Phone" error={validationErrors.alternatePhone} optional>
                    <Input value={pd.alternatePhone} onChange={v => setPD('alternatePhone', v)} type="tel" placeholder="10-digit number" maxLength={10} hasError={!!validationErrors.alternatePhone} />
                  </Field>
                  <Field label="Personal Email" error={validationErrors.personalEmail} optional>
                    <Input value={pd.personalEmail} onChange={v => setPD('personalEmail', v)} type="email" placeholder="personal@email.com" hasError={!!validationErrors.personalEmail} />
                  </Field>
                </div>
              </div>
            )}

            {/* ── Step 2: Address ── */}
            {currentStep === 2 && (
              <div className="pf-step-content">
                <h3 className="pf-section-title">Home Address</h3>
                <p className="pf-section-desc">Your current residential address</p>
                <div className="pf-grid">
                  <Field label="Flat / House No." optional><Input value={pd.addressFlat} onChange={v => setPD('addressFlat', v)} placeholder="Apt / Floor / Unit" /></Field>
                  <Field label="Area / Street" optional><Input value={pd.addressArea} onChange={v => setPD('addressArea', v)} placeholder="Street name or locality" /></Field>
                  <Field label="City" optional><Input value={pd.addressCity} onChange={v => setPD('addressCity', v)} placeholder="City" /></Field>
                  <Field label="State" optional><Input value={pd.addressState} onChange={v => setPD('addressState', v)} placeholder="State" /></Field>
                  <Field label="Pincode" error={validationErrors.addressPincode} optional>
                    <Input value={pd.addressPincode} onChange={v => setPD('addressPincode', v)} placeholder="6-digit pincode" maxLength={6} hasError={!!validationErrors.addressPincode} />
                  </Field>
                </div>
              </div>
            )}

            {/* ── Step 3: Emergency ── */}
            {currentStep === 3 && (
              <div className="pf-step-content">
                <h3 className="pf-section-title">Emergency Contact</h3>
                <p className="pf-section-desc">Person to contact in case of emergency</p>
                <div className="pf-grid">
                  <Field label="Contact Name" optional><Input value={pd.emergencyContactName} onChange={v => setPD('emergencyContactName', v)} placeholder="Full name" /></Field>
                  <Field label="Relationship" optional><Input value={pd.emergencyContactRelationship} onChange={v => setPD('emergencyContactRelationship', v)} placeholder="e.g. Father, Spouse" /></Field>
                  <Field label="Contact Number" error={validationErrors.emergencyContactNumber} optional>
                    <div className="pf-phone-row">
                      <div className="pf-phone-code">
                        <select className="pf-select" value={pd.emergencyContactCountryCode} onChange={e => setPD('emergencyContactCountryCode', e.target.value)}>
                          <option value="+91">🇮🇳 +91</option>
                          <option value="+1">🇺🇸 +1</option>
                          <option value="+44">🇬🇧 +44</option>
                          <option value="+971">🇦🇪 +971</option>
                          <option value="+65">🇸🇬 +65</option>
                        </select>
                      </div>
                      <div className="pf-phone-input"><Input value={pd.emergencyContactNumber} onChange={v => setPD('emergencyContactNumber', v)} type="tel" placeholder="10-digit number" maxLength={10} hasError={!!validationErrors.emergencyContactNumber} /></div>
                    </div>
                  </Field>
                  <Field label="Contact Email" optional><Input value={pd.emergencyContactEmail} onChange={v => setPD('emergencyContactEmail', v)} type="email" placeholder="email@example.com" /></Field>
                </div>
              </div>
            )}

            {/* ── Step 4: Identity & Bank ── */}
            {currentStep === 4 && (
              <div className="pf-step-content">
                <h3 className="pf-section-title">Identity & Bank Details</h3>
                <p className="pf-section-desc">Secure information for payroll and compliance</p>
                <div className="pf-security-banner">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Encrypted and securely stored. Visible only to payroll admins.</span>
                </div>
                <div className="pf-grid">
                  <Field label="Aadhaar Number" error={validationErrors.aadhaarNumber} optional>
                    <Input value={id.aadhaarNumber} onChange={v => setID('aadhaarNumber', digitsOnly(v, 12))} placeholder="12-digit Aadhaar" maxLength={12} inputMode="numeric" hasError={!!validationErrors.aadhaarNumber} />
                  </Field>
                  <Field label="PAN Number" error={validationErrors.panCardNumber} optional>
                    <Input value={id.panCardNumber} onChange={v => setID('panCardNumber', v)} placeholder="ABCPD1234F" maxLength={10} upper hasError={!!validationErrors.panCardNumber} />
                  </Field>
                </div>
                <div className="pf-sub-label">Bank Details</div>
                <div className="pf-grid">
                  <Field label="Bank Name" optional><Input value={id.bankName} onChange={v => setID('bankName', v)} placeholder="e.g. State Bank of India" /></Field>
                  <Field label="Account Number" error={validationErrors.accountNumber} optional>
                    <Input value={id.accountNumber} onChange={v => setID('accountNumber', digitsOnly(v, 18))} placeholder="9 to 18 digits" maxLength={18} inputMode="numeric" hasError={!!validationErrors.accountNumber} />
                  </Field>
                  <Field label="IFSC Code" error={validationErrors.ifscCode} optional>
                    <Input value={id.ifscCode} onChange={v => setID('ifscCode', v)} placeholder="SBIN0001234" maxLength={11} upper hasError={!!validationErrors.ifscCode} />
                  </Field>
                  <Field label="Branch Name" optional><Input value={id.bankBranch} onChange={v => setID('bankBranch', v)} placeholder="Branch name" /></Field>
                </div>
                <div className="pf-sub-label">PF Details</div>
                <div className="pf-grid">
                  <Field label="UAN Number" error={validationErrors.uanNumber} optional>
                    <Input value={id.uanNumber} onChange={v => setID('uanNumber', v)} placeholder="9–12 digit UAN" maxLength={12} hasError={!!validationErrors.uanNumber} />
                  </Field>
                  <Field label="PF Account Number" optional>
                    <Input value={id.pfAccountNumber} onChange={v => setID('pfAccountNumber', v)} placeholder="PF account number" />
                  </Field>
                </div>

                {/* ── KYC documents notice removed — uploading happens on Step 5 ── */}
              </div>
            )}

            {/* ── Step 5: Documents ── */}
            {currentStep === 5 && (
              <div className="pf-step-content">
                <h3 className="pf-section-title">KYC &amp; Compliance Documents</h3>
                <p className="pf-section-desc">Upload your identity and compliance documents. Aadhaar, PAN, and educational certificates are required. For the pairs below, upload either document. Files are stored securely and reviewed by HR.</p>

                <div className="pf-security-banner" style={{ marginBottom: 20 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Documents are encrypted and stored securely. Visible only to HR admins.</span>
                </div>

                {kycLoading && (
                  <div className="kyc-loading" aria-busy="true">
                    <span className="kyc-spinner" />
                    <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--text-muted)' }}>Loading existing documents…</span>
                  </div>
                )}

                {kycLoadError && (
                  <div className="pf-alert pf-alert--error" style={{ marginBottom: 16 }}>{kycLoadError}</div>
                )}

                {!kycLoading && (
                  <>
                    {/* Required documents */}
                    <div className="kyc-section-header" style={{ marginBottom: 8 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Required &amp; Optional Documents
                      <span className="kyc-badge-info">PDF, JPG, PNG · Max 5 MB</span>
                    </div>

                    <div className="kyc-group-label">Required Documents</div>
                    <div className="kyc-list" role="list">
                      {KYC_TYPES.filter(t => !t.isOptional && !t.orGroup).map((typeMeta) => (
                        <div key={typeMeta.key}>
                          <KycRow
                            typeMeta={typeMeta}
                            document={kycDocMap[typeMeta.key] || null}
                            token={token}
                            onUploaded={(key, doc) => {
                              setKycDocMap(prev => ({ ...prev, [key]: doc }));
                              setKycStepErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
                            }}
                          />
                          {kycStepErrors[typeMeta.key] && (
                            <span className="pf-error-text" role="alert" style={{ paddingLeft: 4 }}>
                              ⚠ {kycStepErrors[typeMeta.key]}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {KYC_OR_GROUPS.map((group) => (
                      <div key={group.id} className="kyc-or-group">
                        <div className="kyc-group-label">
                          {group.label}
                          <span className="kyc-optional-note">Upload either one</span>
                        </div>
                        <div className="kyc-list" role="list">
                          {KYC_TYPES.filter(t => t.orGroup === group.id).map((typeMeta) => (
                            <KycRow
                              key={typeMeta.key}
                              typeMeta={typeMeta}
                              document={kycDocMap[typeMeta.key] || null}
                              token={token}
                              onUploaded={(key, doc) => {
                                setKycDocMap(prev => ({ ...prev, [key]: doc }));
                                setKycStepErrors(prev => { const n = { ...prev }; delete n[group.id]; return n; });
                              }}
                            />
                          ))}
                        </div>
                        {kycStepErrors[group.id] && (
                          <span className="pf-error-text" role="alert" style={{ display: 'block', marginTop: 8 }}>
                            ⚠ {kycStepErrors[group.id]}
                          </span>
                        )}
                      </div>
                    ))}

                    <div className="kyc-group-label kyc-group-label--optional" style={{ marginTop: 24 }}>
                      Optional Documents
                      <span className="kyc-optional-note">Not required to complete your profile</span>
                    </div>
                    <div className="kyc-list" role="list">
                      {KYC_TYPES.filter(t => t.isOptional).map((typeMeta) => (
                        <KycRow
                          key={typeMeta.key}
                          typeMeta={typeMeta}
                          document={kycDocMap[typeMeta.key] || null}
                          token={token}
                          onUploaded={(key, doc) => setKycDocMap(prev => ({ ...prev, [key]: doc }))}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Footer / Actions ── */}
          <div className="pf-footer">
            <div className="pf-footer-meta">
              <div className="pf-autosave">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Progress is automatically saved
              </div>
              <div className="pf-secure">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Your data is encrypted and secure
              </div>
            </div>
            <div className="pf-actions">
              {currentStep > 1 && (
                <button type="button" onClick={handlePrev} className="pf-btn pf-btn--secondary" disabled={submitting}>
                  Previous
                </button>
              )}
              {currentStep < 5 ? (
                <button type="button" onClick={handleNext} className="pf-btn pf-btn--primary">
                  Next
                </button>
              ) : (
                <button type="submit" className="pf-btn pf-btn--primary" disabled={submitting}>
                  {submitting && <div className="pf-btn-spinner" />}
                  {submitting ? 'Submitting…' : 'Submit Profile'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PublicProfileForm;