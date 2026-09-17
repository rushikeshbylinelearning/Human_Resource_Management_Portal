// frontend/src/components/EmployeeForm.jsx
import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Grid, Select, MenuItem, InputLabel, FormControl, Box, Stack, Typography, Chip, OutlinedInput, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OrgAssignmentFields from './OrgAssignmentFields';
import { resolveOrgFields } from '../utils/orgFieldOptions';

import { SkeletonBox } from '../components/SkeletonLoaders';
const initialFormState = {
    employeeCode: '',
    fullName: '',
    email: '',
    password: '',
    role: 'Employee',
    domain: '',
    designation: '',
    department: '',
    joiningDate: new Date().toISOString().slice(0, 10),
    shiftGroup: '',
    isActive: true,
    alternateSaturdayPolicy: 'All Saturdays Working',
    employmentStatus: 'Probation',
    probationDurationMonths: 3,
    internshipDurationMonths: 6,
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    leaveBalances: {
        paid: 0,
        sick: 0,
        // --- START OF FIX ---
        casual: 0,
        // --- END OF FIX ---
    }
};

const roles = ['Admin', 'HR', 'Employee', 'Intern'];
const satPolicies = ['Week 1 & 3 Off', 'Week 2 & 4 Off', 'All Saturdays Working', 'All Saturdays Off'];
const employmentStatuses = ['Intern', 'Probation', 'Permanent'];
const allWeekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

const cardSx = {
    background: '#fff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 14px rgba(0,0,0,0.08)'
};

const textFieldSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: '12px',
        backgroundColor: '#fff'
    },
    '& .MuiInputLabel-root': {
        color: '#666'
    }
};

const formControlStyles = {
    '& .MuiOutlinedInput-root': { 
        borderRadius: '12px',
        backgroundColor: '#fff'
    },
    '& .MuiInputBase-root': { 
        borderRadius: '12px',
        backgroundColor: '#fff'
    },
    '& .MuiInputLabel-root': {
        color: '#666'
    }
};

const EmployeeForm = ({ open, onClose, onSave, employee, shifts, isSaving }) => {
    const [formData, setFormData] = useState(initialFormState);
    const [errors, setErrors] = useState({});

    const isEditing = !!employee;

    useEffect(() => {
        if (open) {
            if (isEditing) {
                const orgFields = resolveOrgFields(employee);
                setFormData({
                    employeeCode: employee.employeeCode || '',
                    fullName: employee.fullName || '',
                    email: employee.email || '',
                    password: '',
                    role: employee.role || 'Employee',
                    domain: orgFields.domain,
                    designation: orgFields.designation,
                    department: orgFields.department,
                    joiningDate: employee.joiningDate ? new Date(employee.joiningDate).toISOString().slice(0, 10) : '',
                    shiftGroup: employee.shiftGroup?._id || '',
                    isActive: employee.isActive,
                    alternateSaturdayPolicy: employee.alternateSaturdayPolicy || 'All Saturdays Working',
                    employmentStatus: employee.employmentStatus || 'Probation',
                    probationDurationMonths: employee.probationDurationMonths || 3,
                    internshipDurationMonths: employee.internshipDurationMonths || 6,
                    workingDays: employee.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                    leaveBalances: {
                        paid: employee.leaveBalances?.paid || 0,
                        sick: employee.leaveBalances?.sick || 0,
                        // --- START OF FIX ---
                        casual: employee.leaveBalances?.casual || 0,
                        // --- END OF FIX ---
                    }
                });
            } else {
                setFormData(initialFormState);
            }
            setErrors({});
        }
    }, [employee, open, isEditing]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleOrgFieldsChange = ({ department, designation, domain }) => {
        setFormData(prev => ({
            ...prev,
            department,
            designation,
            domain,
        }));
    };

    const handleBalanceChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            leaveBalances: {
                ...prev.leaveBalances,
                [name]: value === '' ? '' : Number(value)
            }
        }));
    };

    const validate = () => {
        let tempErrors = {};
        if (!formData.employeeCode) tempErrors.employeeCode = "Employee Code is required.";
        if (!formData.fullName) tempErrors.fullName = "Full Name is required.";
        if (!formData.email) tempErrors.email = "Email is required.";
        if (!isEditing && !formData.password) tempErrors.password = "Password is required for new employees.";
        if (formData.employmentStatus === 'Probation' && !formData.probationDurationMonths) {
            tempErrors.probationDurationMonths = "Select a probation duration.";
        }
        setErrors(tempErrors);
        return Object.keys(tempErrors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (validate()) {
            const orgFields = resolveOrgFields(formData);
            const dataToSave = {
                ...formData,
                department: orgFields.department,
                domain: orgFields.domain,
                designation: orgFields.designation,
            };
            
            // Save email exactly as typed by admin (no normalization)
            // Normalization is only applied in SSO authentication flow
            
            if (!dataToSave.password) {
                delete dataToSave.password;
            }
            onSave(dataToSave);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: '24px' } }}>
            <DialogTitle sx={{ px: 4, pt: 3, pb: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box>
                        <Typography variant="overline" sx={{ color: '#E53935', letterSpacing: 1 }}>
                            Advanced Editor
                        </Typography>
                        <Typography variant="h6" fontWeight={700}>
                            {isEditing ? 'Edit Employee Details' : 'Add New Employee'}
                        </Typography>
                    </Box>
                    <IconButton onClick={onClose} size="large">
                        <CloseIcon />
                    </IconButton>
                </Stack>
            </DialogTitle>
            <DialogContent dividers sx={{ backgroundColor: '#f9fafb', px: 4, py: 4 }}>
                <Stack spacing={3}>
                    <Box sx={cardSx}>
                        <Typography variant="h6" fontWeight={700} gutterBottom>
                            Section 1 — Job Details
                        </Typography>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <TextField 
                                    name="fullName" 
                                    label="Full Name" 
                                    value={formData.fullName} 
                                    onChange={handleChange} 
                                    fullWidth 
                                    required 
                                    error={!!errors.fullName} 
                                    helperText={errors.fullName} 
                                    sx={textFieldSx} 
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField 
                                    name="employeeCode" 
                                    label="Employee Code" 
                                    value={formData.employeeCode} 
                                    onChange={handleChange} 
                                    fullWidth 
                                    required 
                                    error={!!errors.employeeCode} 
                                    helperText={errors.employeeCode} 
                                    sx={textFieldSx} 
                                />
                            </Grid>
                            <OrgAssignmentFields
                                department={formData.department}
                                designation={formData.designation}
                                onChange={handleOrgFieldsChange}
                                textFieldSx={textFieldSx}
                            />
                            <Grid item xs={12} md={6}>
                                <TextField 
                                    name="joiningDate" 
                                    label="Joining Date" 
                                    type="date" 
                                    value={formData.joiningDate} 
                                    onChange={handleChange} 
                                    fullWidth 
                                    InputLabelProps={{ shrink: true }} 
                                    sx={textFieldSx} 
                                />
                            </Grid>
                        </Grid>
                    </Box>

                    <Box sx={cardSx}>
                        <Typography variant="h6" fontWeight={700} gutterBottom>
                            Section 2 — System & Access
                        </Typography>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <TextField 
                                    name="email" 
                                    label="Email Address" 
                                    type="email" 
                                    value={formData.email} 
                                    onChange={handleChange}
                                    fullWidth 
                                    required 
                                    error={!!errors.email} 
                                    helperText={errors.email} 
                                    sx={textFieldSx}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField 
                                    name="password" 
                                    label="Password" 
                                    type="password" 
                                    value={formData.password} 
                                    onChange={handleChange} 
                                    fullWidth 
                                    required={!isEditing} 
                                    helperText={isEditing ? "Leave blank to keep current password" : "Required for new employee"} 
                                    error={!!errors.password} 
                                    sx={textFieldSx} 
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth sx={formControlStyles}>
                                    <InputLabel>Role</InputLabel>
                                    <Select name="role" label="Role" value={formData.role} onChange={handleChange}>
                                        {roles.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                    </Box>
                    
                    <Box sx={cardSx}>
                        <Typography variant="h6" fontWeight={700} gutterBottom>
                            Section 3 — Work & Leave Policy
                        </Typography>
                        <Grid container spacing={3}>
                            {/* Row 1: Policy Settings - 4 equal columns */}
                            <Grid item xs={12} sm={6} md={3}>
                                <FormControl fullWidth sx={formControlStyles}>
                                    <InputLabel>Shift Group</InputLabel>
                                    <Select name="shiftGroup" label="Shift Group" value={formData.shiftGroup} onChange={handleChange}>
                                        <MenuItem value=""><em>None</em></MenuItem>
                                        {shifts?.map(s => <MenuItem key={s._id} value={s._id}>{s.shiftName}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                                <FormControl fullWidth sx={formControlStyles}>
                                    <InputLabel>Employment Status</InputLabel>
                                    <Select name="employmentStatus" label="Employment Status" value={formData.employmentStatus} onChange={handleChange}>
                                        {employmentStatuses.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            {formData.employmentStatus === 'Probation' && (
                                <Grid item xs={12} sm={6} md={3}>
                                    <FormControl fullWidth sx={formControlStyles} error={!!errors.probationDurationMonths}>
                                        <InputLabel>Probation Period</InputLabel>
                                        <Select
                                            name="probationDurationMonths"
                                            label="Probation Period"
                                            value={formData.probationDurationMonths}
                                            onChange={handleChange}
                                        >
                                            {monthOptions.map(m => (
                                                <MenuItem key={`probation-${m}`} value={m}>
                                                    {m} Month{m > 1 ? 's' : ''}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    {errors.probationDurationMonths && (
                                        <Typography variant="caption" color="error.main" sx={{ mt: 0.5, display: 'block' }}>
                                            {errors.probationDurationMonths}
                                        </Typography>
                                    )}
                                </Grid>
                            )}
                            {formData.employmentStatus === 'Intern' && (
                                <Grid item xs={12} sm={6} md={3}>
                                    <FormControl fullWidth sx={formControlStyles}>
                                        <InputLabel>Internship Duration</InputLabel>
                                        <Select name="internshipDurationMonths" label="Internship Duration" value={formData.internshipDurationMonths} onChange={handleChange}>
                                            {monthOptions.map(m => <MenuItem key={m} value={m}>{m} Month{m > 1 ? 's' : ''}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                </Grid>
                            )}
                            {formData.employmentStatus === 'Permanent' && (
                                <Grid item xs={12} sm={6} md={3}>
                                    <FormControl fullWidth sx={formControlStyles}>
                                        <InputLabel>Duration</InputLabel>
                                        <Select disabled>
                                            <MenuItem value="">Permanent</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                            )}
                            <Grid item xs={12} sm={6} md={3}>
                                <FormControl fullWidth sx={formControlStyles}>
                                    <InputLabel>Alternate Saturday Policy</InputLabel>
                                    <Select name="alternateSaturdayPolicy" label="Alternate Saturday Policy" value={formData.alternateSaturdayPolicy} onChange={handleChange}>
                                        {satPolicies.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            
                            {/* Row 2: Leave Balances - 3 equal columns */}
                            <Grid item xs={12} sm={4} md={4}>
                                <TextField 
                                    name="sick" 
                                    label="Sick Leaves Balance" 
                                    type="number" 
                                    value={formData.leaveBalances.sick} 
                                    onChange={handleBalanceChange} 
                                    fullWidth 
                                    sx={textFieldSx} 
                                />
                            </Grid>
                            <Grid item xs={12} sm={4} md={4}>
                                <TextField 
                                    name="casual" 
                                    label="Casual Leaves Balance" 
                                    type="number" 
                                    value={formData.leaveBalances.casual} 
                                    onChange={handleBalanceChange} 
                                    fullWidth 
                                    sx={textFieldSx} 
                                />
                            </Grid>
                            <Grid item xs={12} sm={4} md={4}>
                                <TextField 
                                    name="paid" 
                                    label="Planned Leaves Balance" 
                                    type="number" 
                                    value={formData.leaveBalances.paid} 
                                    onChange={handleBalanceChange} 
                                    fullWidth 
                                    sx={textFieldSx} 
                                />
                            </Grid>
                            
                            {/* Row 3: Working Days - Full width */}
                            <Grid item xs={12}>
                                <FormControl fullWidth sx={formControlStyles}>
                                    <InputLabel>Working Days</InputLabel>
                                    <Select
                                        multiple
                                        name="workingDays"
                                        value={formData.workingDays}
                                        onChange={handleChange}
                                        input={<OutlinedInput label="Working Days" sx={{ borderRadius: '12px' }} />}
                                        renderValue={(selected) => (
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                {selected.map((value) => <Chip key={value} label={value} />)}
                                            </Box>
                                        )}
                                    >
                                        {allWeekDays.map((day) => (<MenuItem key={day} value={day}>{day}</MenuItem>))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 4, py: 3, gap: 1.5 }}>
                <Button 
                    onClick={onClose} 
                    variant="outlined"
                    sx={{ borderRadius: '12px' }}
                >
                    Cancel
                </Button>
                <Button 
                    onClick={handleSubmit} 
                    variant="contained" 
                    disabled={isSaving} 
                    sx={{
                        backgroundColor: '#E53935',
                        borderRadius: '12px',
                        minWidth: 140,
                        '&:hover': { backgroundColor: '#d32f2f' }
                    }}
                >
                    {isSaving ? <SkeletonBox width="22px" height="22px" borderRadius="50%" /> : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default EmployeeForm;