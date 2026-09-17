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
    RED, RED_DARK, RED_BG, RED_LIGHT, TEXT, MUTED, BORDER, SURFACE,
    cardSx, sectionTitleSx, primaryBtnSx, tabSx,
} from './adminEmployee/adminEmployeeTheme';

const roles = ['Admin', 'HR', 'Employee', 'Intern'];
const statusOptions = ['Active', 'Inactive'];
const employmentStatusOptions = ['Intern', 'Probation', 'Permanent'];

const textFieldSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: '8px',
        backgroundColor: '#fff',
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: RED },
    },
    '& .MuiInputLabel-root.Mui-focused': { color: RED },
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

    const renderValue = (label, value, icon = null) => (
        <Box>
            <Typography
                variant="caption"
                sx={{
                    color: MUTED,
                    fontWeight: 500,
                    fontSize: '0.7rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    mb: 0.5,
                }}
            >
                {icon}
                {label}
            </Typography>
            <Typography
                variant="body2"
                sx={{
                    color: value ? TEXT : '#cbd5e1',
                    fontWeight: value ? 500 : 400,
                    fontSize: '0.875rem',
                }}
            >
                {value || '—'}
            </Typography>
        </Box>
    );

    const renderField = ({ label, name, type = 'text', select = false, options = [] }) => (
        isEditing ? (
            <TextField
                label={label}
                name={name}
                value={formData[name]}
                onChange={handleChange}
                fullWidth
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
        ) : renderValue(label, formData[name])
    );

    const renderPhoneField = ({ label, name, countryCodeName }) => (
        isEditing ? (
            <Stack direction="row" spacing={1}>
                <Box sx={{ minWidth: 180 }}>
                    <CountryCodeSelector
                        value={formData[countryCodeName]}
                        onChange={handleCountryCodeChange(countryCodeName)}
                        label="Country Code"
                    />
                </Box>
                <TextField
                    label={label}
                    name={name}
                    value={formData[name]}
                    onChange={handleChange}
                    fullWidth
                    sx={textFieldSx}
                    inputProps={{ maxLength: 15 }}
                    helperText={`${formData[name].length} digits`}
                />
            </Stack>
        ) : renderValue(label, formData[countryCodeName] ? `${formData[countryCodeName]} ${formData[name]}` : formData[name] || '—')
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
                        borderRadius: '16px',
                        overflow: 'hidden',
                        boxShadow: '0 16px 48px rgba(15, 23, 42, 0.12)',
                    },
                }}
            >
                <DialogTitle
                    sx={{
                        px: 3,
                        py: 2,
                        background: '#fff',
                        borderBottom: `1px solid ${BORDER}`,
                        borderTop: `3px solid ${RED}`,
                    }}
                >
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ minWidth: 0 }}>
                            <Avatar
                                sx={{
                                    width: 48,
                                    height: 48,
                                    background: `linear-gradient(135deg, ${RED} 0%, ${RED_DARK} 100%)`,
                                    color: '#fff',
                                    fontWeight: 700,
                                    fontSize: '1.1rem',
                                }}
                            >
                                {(employee?.fullName || 'U').charAt(0).toUpperCase()}
                            </Avatar>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="h6" fontWeight={700} color={TEXT} lineHeight={1.3} noWrap>
                                    {employee?.fullName || 'Employee Details'}
                                </Typography>
                                <Typography variant="body2" sx={{ color: MUTED }} noWrap>
                                    {[employee?.department, employee?.email].filter(Boolean).join(' · ') || employee?.employeeCode || '—'}
                                </Typography>
                                <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }} flexWrap="wrap" useFlexGap>
                                    <Chip label={employee?.employeeCode || 'N/A'} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600, borderColor: BORDER }} />
                                    <Chip label={employee?.role || 'Employee'} size="small" sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600, bgcolor: RED_BG, color: RED, border: '1px solid #FBBCBC' }} />
                                    <Chip
                                        label={employee?.isActive === false ? 'Inactive' : 'Active'}
                                        size="small"
                                        sx={{
                                            height: 22,
                                            fontSize: '0.7rem',
                                            fontWeight: 600,
                                            bgcolor: employee?.isActive === false ? '#fef2f2' : '#f0fdf4',
                                            color: employee?.isActive === false ? '#991b1b' : '#166534',
                                        }}
                                    />
                                </Stack>
                            </Box>
                        </Stack>
                        <IconButton onClick={handleClose} size="small" sx={{ color: MUTED, '&:hover': { color: RED, bgcolor: RED_BG } }}>
                            <CloseIcon />
                        </IconButton>
                    </Stack>
                </DialogTitle>

                <Box sx={{ px: 3, background: '#fff', borderBottom: `1px solid ${BORDER}` }}>
                    <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={tabSx}>
                        <Tab label="Overview" />
                        <Tab label="Personal" />
                        <Tab label="Compliance" />
                        <Tab label="Documents" />
                        <Tab label="KYC Documents" />
                    </Tabs>
                </Box>

                <DialogContent sx={{ backgroundColor: SURFACE, px: 3, py: 2.5 }}>
                    {activeTab === 0 && (
                    <Stack spacing={2}>
                        {(user?.role === 'Admin' || user?.role === 'HR') && employee?._id && (
                            <CIFSummaryCard employeeId={employee._id} />
                        )}

                        <Box sx={{ ...cardSx, borderLeft: `3px solid ${RED}` }}>
                            <Typography sx={sectionTitleSx}>
                                <BadgeOutlinedIcon sx={{ fontSize: 18, color: RED }} />
                                Employment Details
                            </Typography>
                            <Grid container spacing={2.5}>
                                <Grid item xs={12} sm={6} md={4}>{renderField({ label: 'Full Name', name: 'fullName' })}</Grid>
                                <Grid item xs={12} sm={6} md={4}>{renderField({ label: 'Employee ID', name: 'employeeCode' })}</Grid>
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
                                        <Grid item xs={12} sm={6} md={4}>{renderValue('Department', formData.department)}</Grid>
                                        <Grid item xs={12} sm={6} md={4}>{renderValue('Designation', formData.designation)}</Grid>
                                    </>
                                )}
                                <Grid item xs={12} sm={6} md={4}>{renderField({ label: 'Email', name: 'email', type: 'email' })}</Grid>
                                <Grid item xs={12} sm={6} md={4}>{renderField({ label: 'Joining Date', name: 'joiningDate', type: 'date' })}</Grid>
                                <Grid item xs={12} sm={6} md={4}>
                                    {isEditing
                                        ? renderField({ label: 'Role', name: 'role', select: true, options: roles })
                                        : renderValue('Role', formData.role)
                                    }
                                </Grid>
                                <Grid item xs={12} sm={6} md={4}>
                                    {isEditing
                                        ? renderField({ label: 'Status', name: 'status', select: true, options: statusOptions })
                                        : renderValue('Status', formData.status)
                                    }
                                </Grid>
                                <Grid item xs={12} sm={6} md={4}>
                                    {isEditing
                                        ? renderField({ label: 'Employment Status', name: 'employmentStatus', select: true, options: employmentStatusOptions })
                                        : renderValue('Employment Status', formData.employmentStatus)
                                    }
                                </Grid>
                            </Grid>

                            <Box sx={{ borderTop: `1px solid ${BORDER}`, mt: 2.5, pt: 2.5 }}>
                                <Typography sx={{ ...sectionTitleSx, mb: 1.5 }}>
                                    <PersonOutlineIcon sx={{ fontSize: 18, color: RED }} />
                                    Reporting Manager
                                </Typography>

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
                                    <Typography variant="body2" sx={{ color: MUTED }}>
                                        No reporting manager assigned
                                    </Typography>
                                ) : (
                                    <Grid container spacing={2.5}>
                                        <Grid item xs={12} sm={4}>
                                            {renderValue('Name', employee?.reportingPerson?.fullName)}
                                        </Grid>
                                        <Grid item xs={12} sm={4}>
                                            {renderValue('Email', employee?.reportingPerson?.email)}
                                        </Grid>
                                        <Grid item xs={12} sm={4}>
                                            {renderValue('Department', employee?.reportingPerson?.department)}
                                        </Grid>
                                    </Grid>
                                )}
                            </Box>
                        </Box>

                    </Stack>
                    )}

                    {/* ── Tab 1: Personal ── */}
                    {activeTab === 1 && (
                    <Stack spacing={2}>
                        <Box sx={cardSx}>
                            <Typography sx={sectionTitleSx}>
                                <ContactPageOutlinedIcon sx={{ fontSize: 18, color: RED }} />
                                Personal Details
                            </Typography>
                            <Grid container spacing={2.5}>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Date of Birth', name: 'dateOfBirth', type: 'date' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Gender', name: 'gender', select: true, options: ['Male', 'Female', 'Other'] })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Blood Group', name: 'bloodGroup' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Marital Status', name: 'maritalStatus', select: true, options: ['Single', 'Married', 'Divorced', 'Widowed'] })}</Grid>
                                <Grid item xs={12} md={6}>{renderPhoneField({ label: 'Phone Number', name: 'phoneNumber', countryCodeName: 'phoneCountryCode' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Alternate Phone', name: 'alternatePhone' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Personal Email', name: 'personalEmail', type: 'email' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Emergency Contact Name', name: 'emergencyContactName' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Relationship', name: 'emergencyContactRelationship' })}</Grid>
                                <Grid item xs={12} md={6}>{renderPhoneField({ label: 'Emergency Contact Number', name: 'emergencyContactNumber', countryCodeName: 'emergencyContactCountryCode' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Emergency Contact Email', name: 'emergencyContactEmail', type: 'email' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Flat / House', name: 'addressFlat' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Area / Street', name: 'addressArea' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'City', name: 'addressCity' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'State', name: 'addressState' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Pincode', name: 'addressPincode' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Marriage Date', name: 'marriageDate', type: 'date' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Interests', name: 'interests' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Hobbies', name: 'hobbies' })}</Grid>
                            </Grid>
                        </Box>

                        <Box sx={cardSx}>
                            <Typography sx={sectionTitleSx}>
                                <AccountBalanceOutlinedIcon sx={{ fontSize: 18, color: RED }} />
                                Identity &amp; Bank Details
                            </Typography>
                            <Grid container spacing={2.5}>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Aadhaar Number', name: 'aadhaarNumber' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'PAN Card Number', name: 'panCardNumber' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Bank Name', name: 'bankName' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Account Number', name: 'accountNumber' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'IFSC Code', name: 'ifscCode' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'Branch Name', name: 'bankBranch' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'UAN Number', name: 'uanNumber' })}</Grid>
                                <Grid item xs={12} md={6}>{renderField({ label: 'PF Account Number', name: 'pfAccountNumber' })}</Grid>
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
                        <AdminEmployeeKycPanel employeeId={employee._id} />
                    )}
                </DialogContent>

                {/* ── Footer Actions ── */}
                <DialogActions
                    sx={{
                        px: 3,
                        py: 2,
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
                            sx={{ mr: 'auto', color: MUTED, fontWeight: 500, textTransform: 'none', '&:hover': { color: RED, bgcolor: 'transparent' } }}
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
                            sx={primaryBtnSx}
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
