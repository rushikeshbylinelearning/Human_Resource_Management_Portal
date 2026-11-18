import { useEffect, useMemo, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Grid, Stack,
    Avatar, Chip, TextField, Button, Snackbar, Alert, IconButton, MenuItem, Autocomplete,
    Tabs, Tab,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import ContactPageOutlinedIcon from '@mui/icons-material/ContactPageOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CountryCodeSelector from './CountryCodeSelector';
import CIFSummaryCard from './CIF/CIFSummaryCard';
import AdminEmployeeCompliancePanel from './adminEmployee/AdminEmployeeCompliancePanel';
import AdminEmployeeDocumentsPanel from './adminEmployee/AdminEmployeeDocumentsPanel';
import AdminEmployeeKycPanel from './adminEmployee/AdminEmployeeKycPanel';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

import { SkeletonBox } from '../components/SkeletonLoaders';
import OrgAssignmentFields from './OrgAssignmentFields';
import { resolveOrgFields } from '../utils/orgFieldOptions';
import {
    RED, RED_DARK, RED_BG, TEXT, MUTED, BORDER,
    primaryBtnSx, profileCardSx, profileTabSx, iconWellSx,
} from './adminEmployee/adminEmployeeTheme';

const roles = ['Admin', 'HR', 'Employee', 'Intern', 'Operations'];
const statusOptions = ['Active', 'Inactive'];
const employmentStatusOptions = ['Intern', 'Probation', 'Permanent'];

const textFieldSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: '10px',
        backgroundColor: '#fff',
        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#E7E9EE' },
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#D0D5DD' },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: RED },
    },
    '& .MuiInputLabel-root.Mui-focused': { color: RED },
};

const VALUE_TONES = {
    Active: { bg: '#ECFDF3', color: '#166534', border: '#ABEFC6' },
    Inactive: { bg: '#FEF2F2', color: '#B42318', border: '#FECDCA' },
    Permanent: { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
    Probation: { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
    Intern: { bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' },
    Single: { bg: '#F8F9FB', color: '#344054', border: '#E7E9EE' },
    Married: { bg: '#ECFDF3', color: '#166534', border: '#ABEFC6' },
    Divorced: { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
    Widowed: { bg: '#F8F9FB', color: '#344054', border: '#E7E9EE' },
    Employee: { bg: '#FDECEC', color: '#C62828', border: '#FBBCBC' },
    Admin: { bg: '#FDECEC', color: '#C62828', border: '#FBBCBC' },
    HR: { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
    Operations: { bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' },
};

const formatDisplayValue = (value) => {
    if (!value || typeof value !== 'string') return value || '';
    if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const defaultFormState = {
    fullName: '',
    employeeCode: '',
    designation: '',
    department: '',
    domain: '',
    email: '',
    role: 'Employee',
    status: 'Active',
    joiningDate: '',
    dateOfBirth: '',
    gender: '',
    bloodGroup: '',
    maritalStatus: '',
    phoneNumber: '',
    phoneCountryCode: '+91',
    alternatePhone: '',
    personalEmail: '',
    addressFlat: '',
    addressArea: '',
    addressCity: '',
    addressState: '',
    addressPincode: '',
    marriageDate: '',
    interests: '',
    hobbies: '',
    emergencyContactName: '',
    emergencyContactNumber: '',
    emergencyContactCountryCode: '+91',
    emergencyContactRelationship: '',
    emergencyContactEmail: '',
    aadhaarNumber: '',
    panCardNumber: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    bankBranch: '',
    uanNumber: '',
    pfAccountNumber: '',
    reportingPersonId: '',
    employmentStatus: 'Probation',
};

const AdminEmployeeProfileDialog = ({
    open,
    mode = 'view',
    employee = null,
    onClose,
    onSaved,
    onOpenAdvancedEditor
}) => {
    const { user } = useAuth();
    const [formData, setFormData] = useState(defaultFormState);
    const [isEditing, setIsEditing] = useState(mode === 'edit');
    const [saving, setSaving] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [reportingOptions, setReportingOptions] = useState([]);
    const [reportingOptionsLoading, setReportingOptionsLoading] = useState(false);
    const [selectedReportingOption, setSelectedReportingOption] = useState(null);
    const [activeTab, setActiveTab] = useState(0);

    const buildFormState = useMemo(() => (data) => {
        const orgFields = resolveOrgFields(data);
        return {
        fullName: data?.fullName || '',
        employeeCode: data?.employeeCode || '',
        designation: orgFields.designation,
        department: orgFields.department,
        domain: orgFields.domain,
        email: data?.email || '',
        role: data?.role || 'Employee',
        status: data?.isActive === false ? 'Inactive' : 'Active',
        joiningDate: data?.joiningDate ? new Date(data.joiningDate).toISOString().slice(0, 10) : '',
        // Personal
        dateOfBirth:   data?.personalDetails?.dateOfBirth   || '',
        gender:        data?.personalDetails?.gender        || '',
        bloodGroup:    data?.personalDetails?.bloodGroup    || '',
        maritalStatus: data?.personalDetails?.maritalStatus || '',
        // Contact
        phoneNumber:      data?.personalDetails?.phoneNumber      || '',
        phoneCountryCode: data?.personalDetails?.phoneCountryCode || '+91',
        alternatePhone:   data?.personalDetails?.alternatePhone   || '',
        personalEmail:    data?.personalDetails?.personalEmail    || '',
        // Address
        addressFlat:    data?.personalDetails?.address?.flat    || '',
        addressArea:    data?.personalDetails?.address?.area    || '',
        addressCity:    data?.personalDetails?.address?.city    || '',
        addressState:   data?.personalDetails?.address?.state   || '',
        addressPincode: data?.personalDetails?.address?.pincode || '',
        marriageDate: data?.personalDetails?.marriageDate
            ? new Date(data.personalDetails.marriageDate).toISOString().slice(0, 10)
            : '',
        interests: data?.personalDetails?.interests || '',
        hobbies:   data?.personalDetails?.hobbies   || '',
        // Emergency contact
        emergencyContactName:         data?.personalDetails?.emergencyContactName         || '',
        emergencyContactNumber:       data?.personalDetails?.emergencyContactNumber       || '',
        emergencyContactCountryCode:  data?.personalDetails?.emergencyContactCountryCode  || '+91',
        emergencyContactRelationship: data?.personalDetails?.emergencyContactRelationship || '',
        emergencyContactEmail:        data?.personalDetails?.emergencyContactEmail        || '',
        // Identity & Bank
        aadhaarNumber:   data?.identityDetails?.aadhaarNumber   || '',
        panCardNumber:   data?.identityDetails?.panCardNumber   || '',
        bankName:        data?.identityDetails?.bankName        || '',
        accountNumber:   data?.identityDetails?.accountNumber   || '',
        ifscCode:        data?.identityDetails?.ifscCode        || '',
        bankBranch:      data?.identityDetails?.bankBranch      || '',
        uanNumber:       data?.identityDetails?.uanNumber       || '',
        pfAccountNumber: data?.identityDetails?.pfAccountNumber || '',
        reportingPersonId: data?.reportingPerson?._id || '',
        employmentStatus: data?.employmentStatus || 'Probation',
        };
    }, []);

    useEffect(() => {
        if (employee) {
            setFormData(buildFormState(employee));
        } else {
            setFormData(defaultFormState);
        }
        setIsEditing(mode === 'edit');
        if (open) setActiveTab(0);
    }, [employee, mode, buildFormState, open]);

    useEffect(() => {
        if (!open) return;
        let isActive = true;
        setReportingOptionsLoading(true);
        api.get('/admin/employees?all=true')
            .then(({ data }) => {
                if (!isActive) return;
                const list = Array.isArray(data) ? data : data.employees || [];
                setReportingOptions(list);
            })
            .catch((error) => {
                console.error('Failed to load reporting person options:', error);
            })
            .finally(() => {
                if (isActive) {
                    setReportingOptionsLoading(false);
                }
            });
        return () => {
            isActive = false;
        };
    }, [open]);

    useEffect(() => {
        if (!employee || !reportingOptions.length) {
            setSelectedReportingOption(null);
            return;
        }
        const match = reportingOptions.find(opt => employee.reportingPerson?._id && opt._id === employee.reportingPerson._id);
        setSelectedReportingOption(match || null);
    }, [employee, reportingOptions]);

    const validatePhoneNumber = (value) => {
        const digitsOnly = value.replace(/\D/g, '');
        return digitsOnly.slice(0, 15);
    };

    const validatePincode = (value) => {
        const digitsOnly = value.replace(/\D/g, '');
        return digitsOnly.slice(0, 10);
    };

    const handleChange = (event) => {
        const { name, value } = event.target;
        let processedValue = value;

        // Apply validation
        if (name === 'phoneNumber' || name === 'emergencyContactNumber') {
            processedValue = validatePhoneNumber(value);
        } else if (name === 'addressPincode') {
            processedValue = validatePincode(value);
        }

        setFormData((prev) => ({ ...prev, [name]: processedValue }));
    };

    const handleCountryCodeChange = (fieldName) => (event) => {
        setFormData((prev) => ({ ...prev, [fieldName]: event.target.value }));
    };

    const handleReportingSelection = (event, newValue) => {
        setSelectedReportingOption(newValue || null);
        if (newValue) {
            setFormData(prev => ({
                ...prev,
                reportingPersonId: newValue._id || ''
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                reportingPersonId: ''
            }));
        }
    };

    const handleReset = () => {
        if (employee) {
            setFormData(buildFormState(employee));
        }
    };

    const handleClose = () => {
        if (!saving) {
            onClose?.();
        }
    };

    const handleOrgFieldsChange = ({ department, designation, domain }) => {
        setFormData(prev => ({
            ...prev,
            department,
            designation,
            domain,
        }));
    };

    const buildPayload = () => {
        const orgFields = resolveOrgFields(formData);
        const payload = {
            fullName: formData.fullName,
            employeeCode: formData.employeeCode,
            designation: orgFields.designation,
            department: orgFields.department,
            domain: orgFields.domain,
            email: formData.email,
            role: formData.role,
            isActive: formData.status === 'Active',
            joiningDate: formData.joiningDate,
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
            reportingPerson: formData.reportingPersonId || null,
            employmentStatus: formData.employmentStatus,
        };

        if (!payload.joiningDate) {
            delete payload.joiningDate;
        }
        return payload;
    };

    const handleSave = async () => {
        if (!employee?._id) return;
        setSaving(true);
        try {
            await api.put(`/admin/employees/${employee._id}`, buildPayload());
            setSnackbar({ open: true, severity: 'success', message: 'Employee details updated successfully.' });
            setIsEditing(false);
            onSaved?.();
        } catch (error) {
            console.error('Failed to update employee profile:', error);
            setSnackbar({
                open: true,
                severity: 'error',
                message: error.response?.data?.error || 'Unable to save changes. Please try again.'
            });
        } finally {
            setSaving(false);
        }
    };

    const renderValue = (label, value, { mono = false, badge = false } = {}) => {
        const raw = value == null ? '' : String(value).trim();
        const shown = formatDisplayValue(raw);
        const filled = Boolean(shown);
        const tone = badge ? VALUE_TONES[shown] : null;

        return (
            <Box
                sx={{
                    height: '100%',
                    borderRadius: '12px',
                    px: 1.75,
                    py: 1.35,
                    background: filled ? '#fff' : '#FAFBFC',
                    border: filled ? '1px solid #E7E9EE' : '1px dashed #E4E7EC',
                    boxShadow: filled ? 'inset 0 1px 0 rgba(255,255,255,0.8)' : 'none',
                }}
            >
                <Typography
                    sx={{
                        color: '#8A93A3',
                        fontWeight: 600,
                        fontSize: '0.68rem',
                        letterSpacing: '0.07em',
                        textTransform: 'uppercase',
                        mb: 0.7,
                        lineHeight: 1.2,
                    }}
                >
                    {label}
                </Typography>
                {tone ? (
                    <Chip
                        label={shown}
                        size="small"
                        sx={{
                            height: 24,
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            bgcolor: tone.bg,
                            color: tone.color,
                            border: `1px solid ${tone.border}`,
                        }}
                    />
                ) : (
                    <Typography
                        sx={{
                            color: filled ? TEXT : '#C4C9D2',
                            fontWeight: filled ? 600 : 500,
                            fontSize: mono ? '0.84rem' : '0.92rem',
                            lineHeight: 1.35,
                            fontFamily: mono && filled ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : 'inherit',
                            letterSpacing: mono && filled ? '0.02em' : '-0.01em',
                            wordBreak: 'break-word',
                        }}
                    >
                        {shown || '—'}
                    </Typography>
                )}
            </Box>
        );
    };

    const renderField = ({ label, name, type = 'text', select = false, options = [], mono = false, badge = false }) => (
        isEditing ? (
            <TextField
                label={label}
                name={name}
                value={formData[name]}
                onChange={handleChange}
                fullWidth
                size="small"
                sx={textFieldSx}
                type={type}
                select={select}
                InputLabelProps={type === 'date' ? { shrink: true } : undefined}
                inputProps={name === 'phoneNumber' || name === 'emergencyContactNumber' ? { maxLength: 15 } : name === 'addressPincode' ? { maxLength: 10 } : undefined}
                helperText={name === 'phoneNumber' || name === 'emergencyContactNumber' ? `${formData[name].length} digits` : name === 'addressPincode' ? `${formData[name].length} digits` : undefined}
            >
                {select && options.map((option) => (
                    <MenuItem key={option} value={option}>
                        {option}
                    </MenuItem>
                ))}
            </TextField>
        ) : renderValue(label, formData[name], { mono, badge })
    );

    const renderPhoneField = ({ label, name, countryCodeName }) => {
        if (isEditing) {
            return (
                <Stack direction="row" spacing={1}>
                    <Box sx={{ minWidth: 160 }}>
                        <CountryCodeSelector
                            value={formData[countryCodeName]}
                            onChange={handleCountryCodeChange(countryCodeName)}
                            label="Code"
                        />
                    </Box>
                    <TextField
                        label={label}
                        name={name}
                        value={formData[name]}
                        onChange={handleChange}
                        fullWidth
                        size="small"
                        sx={textFieldSx}
                        inputProps={{ maxLength: 15 }}
                        helperText={`${formData[name].length} digits`}
                    />
                </Stack>
            );
        }
        const number = String(formData[name] || '').trim();
        const display = number ? `${formData[countryCodeName] || ''} ${number}`.trim() : '';
        return renderValue(label, display, { mono: true });
    };

    const SectionHeading = ({ icon, title, hint }) => (
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 2 }}>
            <Box sx={iconWellSx()}>{icon}</Box>
            <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: TEXT, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                    {title}
                </Typography>
                {hint && (
                    <Typography sx={{ fontSize: '0.75rem', color: MUTED, mt: 0.25 }}>
                        {hint}
                    </Typography>
                )}
            </Box>
        </Stack>
    );

    const Field = ({ children, md = 4, sm = 6 }) => (
        <Grid size={{ xs: 12, sm, md }}>{children}</Grid>
    );

    return (

        <>
            {/* ── Dialog Shell ── */}
            <Dialog
                open={open}
                onClose={handleClose}
                fullWidth
                maxWidth="lg"
                PaperProps={{
                    sx: {
                        borderRadius: '20px',
                        overflow: 'hidden',
                        boxShadow: '0 24px 80px rgba(15, 23, 42, 0.22)',
                        border: '1px solid rgba(255,255,255,0.7)',
                        background: '#fff',
                    },
                }}
            >
                <DialogTitle
                    sx={{
                        px: 3,
                        pt: 2.5,
                        pb: 2,
                        background: 'linear-gradient(180deg, #FFF6F6 0%, #FFFFFF 78%)',
                    }}
                >
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ minWidth: 0 }}>
                            <Avatar
                                sx={{
                                    width: 56,
                                    height: 56,
                                    background: `linear-gradient(145deg, ${RED} 0%, ${RED_DARK} 100%)`,
                                    color: '#fff',
                                    fontWeight: 700,
                                    fontSize: '1.25rem',
                                    boxShadow: '0 8px 18px rgba(198, 40, 40, 0.28)',
                                    border: '2px solid #fff',
                                }}
                            >
                                {(employee?.fullName || 'U').charAt(0).toUpperCase()}
                            </Avatar>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography
                                    sx={{
                                        fontWeight: 700,
                                        fontSize: '1.2rem',
                                        color: TEXT,
                                        letterSpacing: '-0.03em',
                                        lineHeight: 1.2,
                                    }}
                                    noWrap
                                >
                                    {employee?.fullName || 'Employee Details'}
                                </Typography>
                                <Typography sx={{ color: MUTED, fontSize: '0.84rem', mt: 0.35 }} noWrap>
                                    {[employee?.department, employee?.email].filter(Boolean).join('  ·  ') || employee?.employeeCode || '—'}
                                </Typography>
                                <Stack direction="row" spacing={0.75} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                                    <Chip
                                        label={employee?.employeeCode || 'N/A'}
                                        size="small"
                                        sx={{
                                            height: 24,
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            bgcolor: '#F8F9FB',
                                            color: TEXT,
                                            border: `1px solid ${BORDER}`,
                                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                                        }}
                                    />
                                    <Chip
                                        label={employee?.role || 'Employee'}
                                        size="small"
                                        sx={{ height: 24, fontSize: '0.72rem', fontWeight: 700, bgcolor: RED_BG, color: RED, border: '1px solid #FBBCBC' }}
                                    />
                                    <Chip
                                        label={employee?.isActive === false ? 'Inactive' : 'Active'}
                                        size="small"
                                        sx={{
                                            height: 24,
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            bgcolor: employee?.isActive === false ? '#FEF2F2' : '#ECFDF3',
                                            color: employee?.isActive === false ? '#B42318' : '#166534',
                                            border: `1px solid ${employee?.isActive === false ? '#FECDCA' : '#ABEFC6'}`,
                                        }}
                                    />
                                </Stack>
                            </Box>
                        </Stack>
                        <IconButton
                            onClick={handleClose}
                            size="small"
                            aria-label="Close"
                            sx={{
                                color: MUTED,
                                bgcolor: '#fff',
                                border: `1px solid ${BORDER}`,
                                '&:hover': { color: RED, bgcolor: RED_BG, borderColor: '#FBBCBC' },
                            }}
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                </DialogTitle>

                <Box sx={{ px: 2.5, background: '#fff', borderBottom: `1px solid ${BORDER}` }}>
                    <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={profileTabSx} variant="scrollable" scrollButtons="auto">
                        <Tab label="Overview" />
                        <Tab label="Personal" />
                        <Tab label="Compliance" />
                        <Tab label="Documents" />
                        <Tab label="KYC Documents" />
                    </Tabs>
                </Box>

                <DialogContent sx={{ backgroundColor: '#F3F5F8', px: { xs: 2, sm: 3 }, py: 2.75 }}>
                    {activeTab === 0 && (
                    <Stack spacing={2}>
                        {(user?.role === 'Admin' || user?.role === 'HR') && employee?._id && (
                            <CIFSummaryCard employeeId={employee._id} />
                        )}

                        <Box sx={profileCardSx}>
                            <SectionHeading
                                icon={<BadgeOutlinedIcon sx={{ fontSize: 18 }} />}
                                title="Employment Details"
                                hint="Role, team, and how this person is engaged"
                            />
                            <Grid container spacing={1.5}>
                                <Field>{renderField({ label: 'Full Name', name: 'fullName' })}</Field>
                                <Field>{renderField({ label: 'Employee ID', name: 'employeeCode', mono: true })}</Field>
                                {isEditing ? (
                                    <OrgAssignmentFields
                                        department={formData.department}
                                        designation={formData.designation}
                                        onChange={handleOrgFieldsChange}
                                        textFieldSx={textFieldSx}
                                        gridProps={{ xs: 12, sm: 6, md: 4 }}
                                    />
                                ) : (
                                    <>
                                        <Field>{renderValue('Department', formData.department)}</Field>
                                        <Field>{renderValue('Designation', formData.designation)}</Field>
                                    </>
                                )}
                                <Field>{renderField({ label: 'Email', name: 'email', type: 'email' })}</Field>
                                <Field>{renderField({ label: 'Joining Date', name: 'joiningDate', type: 'date' })}</Field>
                                <Field>{renderField({ label: 'Role', name: 'role', select: true, options: roles, badge: true })}</Field>
                                <Field>{renderField({ label: 'Status', name: 'status', select: true, options: statusOptions, badge: true })}</Field>
                                <Field>{renderField({ label: 'Employment Status', name: 'employmentStatus', select: true, options: employmentStatusOptions, badge: true })}</Field>
                            </Grid>

                            <Box sx={{ borderTop: `1px solid ${BORDER}`, mt: 2.75, pt: 2.25 }}>
                                <SectionHeading
                                    icon={<PersonOutlineIcon sx={{ fontSize: 18 }} />}
                                    title="Reporting Manager"
                                    hint="Who this employee reports to"
                                />

                                {isEditing && (
                                    <Box mb={2}>
                                        <Autocomplete
                                            options={reportingOptions}
                                            loading={reportingOptionsLoading}
                                            value={selectedReportingOption}
                                            onChange={handleReportingSelection}
                                            getOptionLabel={(option) => option?.fullName ? `${option.fullName}${option.employeeCode ? ` (${option.employeeCode})` : ''}` : ''}
                                            isOptionEqualToValue={(option, value) => option?._id === value?._id}
                                            renderInput={(params) => (
                                                <TextField
                                                    {...params}
                                                    label="Select manager"
                                                    placeholder="Search by name"
                                                    size="small"
                                                    sx={textFieldSx}
                                                    InputProps={{
                                                        ...params.InputProps,
                                                        endAdornment: (
                                                            <>
                                                                {reportingOptionsLoading ? <SkeletonBox width="20px" height="20px" borderRadius="50%" /> : null}
                                                                {params.InputProps.endAdornment}
                                                            </>
                                                        ),
                                                    }}
                                                />
                                            )}
                                        />
                                    </Box>
                                )}

                                {!isEditing && !employee?.reportingPerson?.fullName ? (
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1.5,
                                            px: 1.75,
                                            py: 1.5,
                                            borderRadius: '14px',
                                            border: '1px dashed #E4E7EC',
                                            background: '#FAFBFC',
                                        }}
                                    >
                                        <Avatar sx={{ width: 38, height: 38, bgcolor: '#F2F4F7', color: '#98A2B3' }}>
                                            <PersonOutlineIcon fontSize="small" />
                                        </Avatar>
                                        <Box>
                                            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: TEXT, letterSpacing: '-0.01em' }}>
                                                No manager assigned
                                            </Typography>
                                            <Typography sx={{ fontSize: '0.78rem', color: MUTED, mt: 0.15 }}>
                                                This employee does not report to anyone yet.
                                            </Typography>
                                        </Box>
                                    </Box>
                                ) : !isEditing ? (
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1.75,
                                            px: 1.75,
                                            py: 1.5,
                                            borderRadius: '14px',
                                            border: '1px solid #E7E9EE',
                                            background: 'linear-gradient(180deg, #FFFFFF 0%, #FAFBFC 100%)',
                                        }}
                                    >
                                        <Avatar
                                            sx={{
                                                width: 42,
                                                height: 42,
                                                background: `linear-gradient(145deg, ${RED} 0%, ${RED_DARK} 100%)`,
                                                fontWeight: 700,
                                                fontSize: '0.95rem',
                                            }}
                                        >
                                            {(employee?.reportingPerson?.fullName || 'M').charAt(0).toUpperCase()}
                                        </Avatar>
                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: TEXT, letterSpacing: '-0.02em' }} noWrap>
                                                {employee?.reportingPerson?.fullName}
                                            </Typography>
                                            <Typography sx={{ fontSize: '0.8rem', color: MUTED }} noWrap>
                                                {employee?.reportingPerson?.email || 'No email on file'}
                                            </Typography>
                                        </Box>
                                        {employee?.reportingPerson?.department && (
                                            <Chip
                                                label={employee.reportingPerson.department}
                                                size="small"
                                                sx={{ fontWeight: 700, fontSize: '0.72rem', bgcolor: '#F8F9FB', border: `1px solid ${BORDER}` }}
                                            />
                                        )}
                                    </Box>
                                ) : null}
                            </Box>
                        </Box>

                    </Stack>
                    )}

                    {/* ── Tab 1: Personal ── */}
                    {activeTab === 1 && (
                    <Stack spacing={2}>
                        <Box sx={profileCardSx}>
                            <SectionHeading
                                icon={<ContactPageOutlinedIcon sx={{ fontSize: 18 }} />}
                                title="Personal Details"
                                hint="Identity, contact, and home address"
                            />
                            <Grid container spacing={1.5}>
                                <Field>{renderField({ label: 'Date of Birth', name: 'dateOfBirth', type: 'date' })}</Field>
                                <Field>{renderField({ label: 'Gender', name: 'gender', select: true, options: ['Male', 'Female', 'Other'] })}</Field>
                                <Field>{renderField({ label: 'Blood Group', name: 'bloodGroup' })}</Field>
                                <Field>{renderField({ label: 'Marital Status', name: 'maritalStatus', select: true, options: ['Single', 'Married', 'Divorced', 'Widowed'], badge: true })}</Field>
                                <Field>{renderField({ label: 'Marriage Date', name: 'marriageDate', type: 'date' })}</Field>
                                <Field>{renderField({ label: 'Interests', name: 'interests' })}</Field>
                                <Field>{renderField({ label: 'Hobbies', name: 'hobbies' })}</Field>
                                <Field md={isEditing ? 6 : 4}>{renderPhoneField({ label: 'Phone Number', name: 'phoneNumber', countryCodeName: 'phoneCountryCode' })}</Field>
                                <Field>{renderField({ label: 'Alternate Phone', name: 'alternatePhone' })}</Field>
                                <Field>{renderField({ label: 'Personal Email', name: 'personalEmail', type: 'email' })}</Field>
                                <Field md={12}>
                                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#98A2B3', pt: 0.5 }}>
                                        Address
                                    </Typography>
                                </Field>
                                <Field>{renderField({ label: 'Flat / House', name: 'addressFlat' })}</Field>
                                <Field>{renderField({ label: 'Area / Street', name: 'addressArea' })}</Field>
                                <Field>{renderField({ label: 'City', name: 'addressCity' })}</Field>
                                <Field>{renderField({ label: 'State', name: 'addressState' })}</Field>
                                <Field>{renderField({ label: 'Pincode', name: 'addressPincode', mono: true })}</Field>
                                <Field md={12}>
                                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#98A2B3', pt: 0.5 }}>
                                        Emergency contact
                                    </Typography>
                                </Field>
                                <Field>{renderField({ label: 'Contact Name', name: 'emergencyContactName' })}</Field>
                                <Field>{renderField({ label: 'Relationship', name: 'emergencyContactRelationship' })}</Field>
                                <Field md={isEditing ? 6 : 4}>{renderPhoneField({ label: 'Contact Number', name: 'emergencyContactNumber', countryCodeName: 'emergencyContactCountryCode' })}</Field>
                                <Field>{renderField({ label: 'Contact Email', name: 'emergencyContactEmail', type: 'email' })}</Field>
                            </Grid>
                        </Box>

                        <Box sx={profileCardSx}>
                            <SectionHeading
                                icon={<AccountBalanceOutlinedIcon sx={{ fontSize: 18 }} />}
                                title="Identity & Bank Details"
                                hint="Government IDs and salary account"
                            />
                            <Grid container spacing={1.5}>
                                <Field>{renderField({ label: 'Aadhaar Number', name: 'aadhaarNumber', mono: true })}</Field>
                                <Field>{renderField({ label: 'PAN Card Number', name: 'panCardNumber', mono: true })}</Field>
                                <Field>{renderField({ label: 'UAN Number', name: 'uanNumber', mono: true })}</Field>
                                <Field>{renderField({ label: 'PF Account Number', name: 'pfAccountNumber', mono: true })}</Field>
                                <Field>{renderField({ label: 'Bank Name', name: 'bankName' })}</Field>
                                <Field>{renderField({ label: 'Account Number', name: 'accountNumber', mono: true })}</Field>
                                <Field>{renderField({ label: 'IFSC Code', name: 'ifscCode', mono: true })}</Field>
                                <Field>{renderField({ label: 'Branch Name', name: 'bankBranch' })}</Field>
                            </Grid>
                        </Box>
                    </Stack>
                    )}

                    {/* ── Tab 2: Compliance ── */}
                    {activeTab === 2 && employee?._id && (
                        <AdminEmployeeCompliancePanel employeeId={employee._id} />
                    )}

                    {/* ── Tab 3: Documents ── */}
                    {activeTab === 3 && employee?._id && (
                        <AdminEmployeeDocumentsPanel employeeId={employee._id} />
                    )}

                    {/* ── Tab 4: KYC Documents ── */}
                    {activeTab === 4 && employee?._id && (
                        <AdminEmployeeKycPanel employeeId={employee._id} flush />
                    )}
                </DialogContent>

                {/* ── Footer Actions ── */}
                <DialogActions
                    sx={{
                        px: 3,
                        py: 1.75,
                        background: '#fff',
                        borderTop: `1px solid ${BORDER}`,
                        gap: 1,
                    }}
                >
                    {onOpenAdvancedEditor && (
                        <Button
                            variant="text"
                            onClick={onOpenAdvancedEditor}
                            disabled={saving}
                            sx={{ mr: 'auto', color: MUTED, fontWeight: 600, textTransform: 'none', borderRadius: '10px', '&:hover': { color: RED, bgcolor: RED_BG } }}
                        >
                            Advanced Editor
                        </Button>
                    )}
                    {isEditing ? (
                        <>
                            <Button
                                variant="outlined"
                                onClick={handleReset}
                                disabled={saving}
                                sx={{ textTransform: 'none', borderColor: BORDER, color: MUTED, fontWeight: 600, '&:hover': { borderColor: RED, color: RED, bgcolor: RED_BG } }}
                            >
                                Reset
                            </Button>
                            <Button
                                variant="contained"
                                onClick={handleSave}
                                disabled={saving}
                                sx={primaryBtnSx}
                            >
                                {saving ? <SkeletonBox width="22px" height="22px" borderRadius="50%" /> : 'Save Changes'}
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="contained"
                            onClick={() => setIsEditing(true)}
                            startIcon={<EditOutlinedIcon />}
                            sx={{
                                ...primaryBtnSx,
                                borderRadius: '10px',
                                px: 2.5,
                                boxShadow: '0 8px 16px rgba(198, 40, 40, 0.22)',
                                '&:hover': {
                                    background: `linear-gradient(135deg, ${RED_DARK} 0%, #B71C1C 100%)`,
                                    boxShadow: '0 10px 20px rgba(198, 40, 40, 0.28)',
                                },
                            }}
                        >
                            Edit Details
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert
                    onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
                    severity={snackbar.severity}
                    variant="filled"
                    sx={{ width: '100%', borderRadius: '12px' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </>
    );
};

export default AdminEmployeeProfileDialog;
