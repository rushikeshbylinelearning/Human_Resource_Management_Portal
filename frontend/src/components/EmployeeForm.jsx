import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Grid,
    Select, MenuItem, InputLabel, FormControl, Box, Stack, Typography,
    IconButton, alpha
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OrgAssignmentFields from './OrgAssignmentFields';
import { resolveOrgFields, inferTrackFromDesignation } from '../utils/orgFieldOptions';
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
    probationDurationMonths: 6,
    internshipDurationMonths: 3,
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    leaveBalances: {
        paid: 0,
        sick: 0,
        casual: 0,
    }
};

const roles = ['Admin', 'HR', 'Employee', 'Intern', 'Operations'];
const satPolicies = ['Week 1 & 3 Off', 'Week 2 & 4 Off', 'All Saturdays Working', 'All Saturdays Off'];
const employmentStatuses = ['Intern', 'Probation', 'Permanent'];
const allWeekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

const INK = '#1a1a1a';
const MUTED = '#6b7280';
const LINE = '#e8eaed';
const ACCENT = '#c62828';

const fieldSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: '10px',
        backgroundColor: '#fff',
        fontSize: '0.9rem',
        '& fieldset': { borderColor: LINE },
        '&:hover fieldset': { borderColor: '#c5c9d0' },
        '&.Mui-focused fieldset': { borderColor: ACCENT, borderWidth: 1.5 },
    },
    '& .MuiInputLabel-root': { fontSize: '0.875rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: ACCENT },
    '& .MuiFormHelperText-root': {
        mx: 0.25,
        mt: 0.6,
        fontSize: '0.7rem',
        color: MUTED,
    },
};

const selectSx = {
    ...fieldSx,
    '& .MuiInputBase-root': { borderRadius: '10px', backgroundColor: '#fff' },
};

const SectionLabel = ({ index, title }) => (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Typography
            component="span"
            sx={{
                fontSize: '0.65rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: MUTED,
                fontVariantNumeric: 'tabular-nums',
            }}
        >
            {String(index).padStart(2, '0')}
        </Typography>
        <Typography
            component="span"
            sx={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: INK,
                letterSpacing: '0.02em',
            }}
        >
            {title}
        </Typography>
        <Box sx={{ flex: 1, height: '1px', bgcolor: LINE }} />
    </Stack>
);

function applyTrackPolicy(prev, designation) {
    const track = inferTrackFromDesignation(designation);
    if (track === 'intern') {
        return {
            ...prev,
            designation,
            employmentStatus: 'Intern',
            internshipDurationMonths: 3,
        };
    }
    if (track === 'employee') {
        const keepStatus = prev.employmentStatus === 'Permanent';
        return {
            ...prev,
            designation,
            employmentStatus: keepStatus ? 'Permanent' : 'Probation',
            probationDurationMonths: keepStatus ? prev.probationDurationMonths : 6,
        };
    }
    return { ...prev, designation };
}

const EmployeeForm = ({ open, onClose, onSave, employee, shifts, isSaving }) => {
    const [formData, setFormData] = useState(initialFormState);
    const [errors, setErrors] = useState({});
    const lastAutoDesignation = useRef('');

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
                    probationDurationMonths: employee.probationDurationMonths || 6,
                    internshipDurationMonths: employee.internshipDurationMonths || 3,
                    workingDays: employee.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                    leaveBalances: {
                        paid: employee.leaveBalances?.paid || 0,
                        sick: employee.leaveBalances?.sick || 0,
                        casual: employee.leaveBalances?.casual || 0,
                    }
                });
                lastAutoDesignation.current = orgFields.designation || '';
            } else {
                setFormData(initialFormState);
                lastAutoDesignation.current = '';
            }
            setErrors({});
        }
    }, [employee, open, isEditing]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleOrgFieldsChange = ({ department, designation, domain }) => {
        setFormData(prev => {
            const next = { ...prev, department, designation, domain };
            if (designation !== lastAutoDesignation.current) {
                lastAutoDesignation.current = designation;
                return applyTrackPolicy(next, designation);
            }
            return next;
        });
    };

    const toggleWorkingDay = (day) => {
        setFormData(prev => {
            const has = prev.workingDays.includes(day);
            return {
                ...prev,
                workingDays: has
                    ? prev.workingDays.filter((d) => d !== day)
                    : [...prev.workingDays, day],
            };
        });
    };

    const validate = () => {
        let tempErrors = {};
        if (!formData.employeeCode) tempErrors.employeeCode = 'Employee Code is required.';
        if (!formData.fullName) tempErrors.fullName = 'Full Name is required.';
        if (!formData.email) tempErrors.email = 'Email is required.';
        if (!isEditing && !formData.password) tempErrors.password = 'Password is required for new employees.';
        if (formData.employmentStatus === 'Probation' && !formData.probationDurationMonths) {
            tempErrors.probationDurationMonths = 'Select a probation duration.';
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
                leaveBalances: formData.leaveBalances,
            };

            if (!dataToSave.password) {
                delete dataToSave.password;
            }
            onSave(dataToSave);
        }
    };

    const track = inferTrackFromDesignation(formData.designation);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="sm"
            PaperProps={{
                sx: {
                    borderRadius: '16px',
                    overflow: 'hidden',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.12)',
                    maxWidth: 560,
                }
            }}
        >
            <DialogTitle
                sx={{
                    px: 3,
                    pt: 2.5,
                    pb: 2,
                    borderBottom: `1px solid ${LINE}`,
                }}
            >
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                    <Box>
                        <Typography
                            sx={{
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                letterSpacing: '0.12em',
                                textTransform: 'uppercase',
                                color: ACCENT,
                                mb: 0.4,
                            }}
                        >
                            Advanced Editor
                        </Typography>
                        <Typography sx={{ fontSize: '1.15rem', fontWeight: 600, color: INK, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                            {isEditing ? 'Edit employee' : 'Add employee'}
                        </Typography>
                    </Box>
                    <IconButton
                        onClick={onClose}
                        size="small"
                        aria-label="Close"
                        sx={{
                            color: MUTED,
                            mt: -0.25,
                            '&:hover': { bgcolor: alpha(INK, 0.04), color: INK },
                        }}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Stack>
            </DialogTitle>

            <DialogContent
                sx={{
                    px: 3,
                    py: 3,
                    bgcolor: '#fff',
                    maxHeight: { xs: '68vh', sm: '70vh' },
                }}
            >
                <Box sx={{ mb: 3.5 }}>
                    <SectionLabel index={1} title="Identity" />
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 7 }}>
                            <TextField
                                name="fullName"
                                label="Full name"
                                value={formData.fullName}
                                onChange={handleChange}
                                fullWidth
                                required
                                size="small"
                                error={!!errors.fullName}
                                helperText={errors.fullName}
                                sx={fieldSx}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 5 }}>
                            <TextField
                                name="employeeCode"
                                label="Employee code"
                                value={formData.employeeCode}
                                onChange={handleChange}
                                fullWidth
                                required
                                size="small"
                                error={!!errors.employeeCode}
                                helperText={errors.employeeCode}
                                sx={fieldSx}
                            />
                        </Grid>
                        <OrgAssignmentFields
                            department={formData.department}
                            designation={formData.designation}
                            onChange={handleOrgFieldsChange}
                            textFieldSx={fieldSx}
                            dense
                        />
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                name="joiningDate"
                                label="Joining date"
                                type="date"
                                value={formData.joiningDate}
                                onChange={handleChange}
                                fullWidth
                                size="small"
                                InputLabelProps={{ shrink: true }}
                                sx={fieldSx}
                            />
                        </Grid>
                        {track ? (
                            <Grid size={12}>
                                <Typography sx={{ fontSize: '0.72rem', color: MUTED, mt: -0.5 }}>
                                    {track === 'intern'
                                        ? 'Intern track → 3-month internship applied'
                                        : 'Employee track → 6-month probation applied'}
                                </Typography>
                            </Grid>
                        ) : null}
                    </Grid>
                </Box>

                <Box sx={{ mb: 3.5 }}>
                    <SectionLabel index={2} title="Access" />
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 7 }}>
                            <TextField
                                name="email"
                                label="Email"
                                type="email"
                                value={formData.email}
                                onChange={handleChange}
                                fullWidth
                                required
                                size="small"
                                error={!!errors.email}
                                helperText={errors.email}
                                sx={fieldSx}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 5 }}>
                            <FormControl fullWidth size="small" sx={selectSx}>
                                <InputLabel>Role</InputLabel>
                                <Select name="role" label="Role" value={formData.role} onChange={handleChange}>
                                    {roles.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={12}>
                            <TextField
                                name="password"
                                label="Password"
                                type="password"
                                value={formData.password}
                                onChange={handleChange}
                                fullWidth
                                required={!isEditing}
                                size="small"
                                helperText={isEditing ? 'Leave blank to keep current password' : undefined}
                                error={!!errors.password}
                                sx={fieldSx}
                            />
                        </Grid>
                    </Grid>
                </Box>

                <Box>
                    <SectionLabel index={3} title="Work policy" />
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <FormControl fullWidth size="small" sx={selectSx}>
                                <InputLabel>Employment status</InputLabel>
                                <Select
                                    name="employmentStatus"
                                    label="Employment status"
                                    value={formData.employmentStatus}
                                    onChange={handleChange}
                                >
                                    {employmentStatuses.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        {formData.employmentStatus === 'Probation' && (
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <FormControl fullWidth size="small" sx={selectSx} error={!!errors.probationDurationMonths}>
                                    <InputLabel>Probation</InputLabel>
                                    <Select
                                        name="probationDurationMonths"
                                        label="Probation"
                                        value={formData.probationDurationMonths}
                                        onChange={handleChange}
                                    >
                                        {monthOptions.map(m => (
                                            <MenuItem key={`probation-${m}`} value={m}>
                                                {m} month{m > 1 ? 's' : ''}
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
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <FormControl fullWidth size="small" sx={selectSx}>
                                    <InputLabel>Internship</InputLabel>
                                    <Select
                                        name="internshipDurationMonths"
                                        label="Internship"
                                        value={formData.internshipDurationMonths}
                                        onChange={handleChange}
                                    >
                                        {monthOptions.map(m => (
                                            <MenuItem key={m} value={m}>{m} month{m > 1 ? 's' : ''}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        )}
                        {formData.employmentStatus === 'Permanent' && (
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    label="Duration"
                                    value="Permanent"
                                    fullWidth
                                    size="small"
                                    disabled
                                    sx={fieldSx}
                                />
                            </Grid>
                        )}
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <FormControl fullWidth size="small" sx={selectSx}>
                                <InputLabel>Shift group</InputLabel>
                                <Select name="shiftGroup" label="Shift group" value={formData.shiftGroup} onChange={handleChange}>
                                    <MenuItem value=""><em>None</em></MenuItem>
                                    {shifts?.map(s => <MenuItem key={s._id} value={s._id}>{s.shiftName}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <FormControl fullWidth size="small" sx={selectSx}>
                                <InputLabel>Saturday policy</InputLabel>
                                <Select
                                    name="alternateSaturdayPolicy"
                                    label="Saturday policy"
                                    value={formData.alternateSaturdayPolicy}
                                    onChange={handleChange}
                                >
                                    {satPolicies.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={12}>
                            <Typography sx={{ fontSize: '0.75rem', color: MUTED, mb: 1 }}>
                                Working days
                            </Typography>
                            <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.75}>
                                {allWeekDays.map((day) => {
                                    const selected = formData.workingDays.includes(day);
                                    const short = day.slice(0, 3);
                                    return (
                                        <Box
                                            key={day}
                                            component="button"
                                            type="button"
                                            onClick={() => toggleWorkingDay(day)}
                                            aria-pressed={selected}
                                            sx={{
                                                border: `1px solid ${selected ? ACCENT : LINE}`,
                                                bgcolor: selected ? alpha(ACCENT, 0.06) : '#fff',
                                                color: selected ? ACCENT : MUTED,
                                                borderRadius: '8px',
                                                px: 1.25,
                                                py: 0.65,
                                                fontSize: '0.72rem',
                                                fontWeight: selected ? 600 : 500,
                                                cursor: 'pointer',
                                                fontFamily: 'inherit',
                                                lineHeight: 1,
                                                transition: 'border-color 0.15s ease, background-color 0.15s ease',
                                                '&:hover': {
                                                    borderColor: selected ? ACCENT : '#c5c9d0',
                                                },
                                            }}
                                        >
                                            {short}
                                        </Box>
                                    );
                                })}
                            </Stack>
                        </Grid>
                    </Grid>
                </Box>
            </DialogContent>

            <DialogActions
                sx={{
                    px: 3,
                    py: 2,
                    gap: 1,
                    borderTop: `1px solid ${LINE}`,
                    bgcolor: '#fafafa',
                }}
            >
                <Button
                    onClick={onClose}
                    sx={{
                        textTransform: 'none',
                        fontWeight: 500,
                        color: MUTED,
                        px: 2,
                        borderRadius: '8px',
                        '&:hover': { bgcolor: alpha(INK, 0.04), color: INK },
                    }}
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    disableElevation
                    disabled={isSaving}
                    sx={{
                        backgroundColor: ACCENT,
                        borderRadius: '8px',
                        minWidth: 108,
                        textTransform: 'none',
                        fontWeight: 600,
                        px: 2.5,
                        '&:hover': { backgroundColor: '#b71c1c' }
                    }}
                >
                    {isSaving ? <SkeletonBox width="20px" height="20px" borderRadius="50%" /> : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default EmployeeForm;
