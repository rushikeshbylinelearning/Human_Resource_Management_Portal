// src/components/AdminLeaveForm.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Grid, Select, MenuItem, InputLabel, FormControl, Stack, Divider, Box, Typography, Autocomplete, IconButton, Avatar, Alert, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { getWorkingLeaveDateKeys } from '../utils/leaveDayAllocations';
import LazyDatePicker from './lazy/LazyDatePicker';
import { eachDayOfInterval } from 'date-fns';
import EditCalendarOutlinedIcon from '@mui/icons-material/EditCalendarOutlined';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { SkeletonBox } from '../components/SkeletonLoaders';
import CloseIcon from '@mui/icons-material/Close'; // UI unified with Employee Leave Modal

const initialFormState = {
    employee: '',
    requestType: 'Planned',
    leaveType: 'Full Day',
    leaveDates: [null],
    alternateDate: null,
    reason: '',
    status: 'Approved', // ✅ FIX: Admin-created leaves default to Approved to trigger balance deduction
    appliedDate: new Date(), // Employee applied date - default to today for new requests
};

const buildLeaveDateRangeFromRequest = (leaveDates) => {
    if (!leaveDates?.length) return [null];
    const sorted = [...leaveDates].map((d) => new Date(d)).sort((a, b) => a - b);
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    if (start.getTime() === end.getTime()) return [start];
    return [start, end];
};

const buildDayTypesFromRequest = (req, dateKeys) => {
    const dayTypes = {};
    dateKeys.forEach((key) => { dayTypes[key] = 'Loss of Pay'; });
    (req?.dayTypeAllocations || []).forEach((a) => {
        const d = new Date(a.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (dateKeys.includes(key)) dayTypes[key] = a.requestType;
    });
    return dayTypes;
};

const expandLeaveDatesToStrings = (leaveDates) => {
    if (!leaveDates?.[0]) return [];
    const pad = (n) => String(n).padStart(2, '0');
    if (leaveDates[1]) {
        const all = eachDayOfInterval({ start: leaveDates[0], end: leaveDates[1] });
        return all.map((d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    }
    return [`${leaveDates[0].getFullYear()}-${pad(leaveDates[0].getMonth() + 1)}-${pad(leaveDates[0].getDate())}`];
};

const AdminLeaveForm = ({ open, onClose, onSave, request, employees, isSaving, error, onClearError }) => {
    const [formData, setFormData] = useState(initialFormState);
    const [dayTypes, setDayTypes] = useState({});
    const isEditing = !!request;

    useEffect(() => {
        if (open) {
            if (isEditing) {
                const range = buildLeaveDateRangeFromRequest(request.leaveDates);
                const keys = getWorkingLeaveDateKeys(expandLeaveDatesToStrings(range));
                setFormData({
                    _id: request._id,
                    employee: request.employee?._id || '',
                    requestType: request.requestType || 'Planned',
                    leaveType: request.leaveType || 'Full Day',
                    leaveDates: range,
                    alternateDate: request.alternateDate ? new Date(request.alternateDate) : null,
                    reason: request.reason || '',
                    status: request.status || 'Pending',
                    appliedDate: request.createdAt ? new Date(request.createdAt) : null,
                });
                setDayTypes(buildDayTypesFromRequest(request, keys));
            } else {
                setFormData(initialFormState);
                setDayTypes({});
            }
        }
    }, [request, open, isEditing]);

    const workingDayKeys = useMemo(() => {
        if (formData.requestType !== 'Loss of Pay') return [];
        return getWorkingLeaveDateKeys(expandLeaveDatesToStrings(formData.leaveDates));
    }, [formData.requestType, formData.leaveDates]);

    useEffect(() => {
        if (!open) return;
        if (formData.requestType !== 'Loss of Pay') {
            setDayTypes({});
            return;
        }
        setDayTypes((prev) => {
            const next = { ...prev };
            workingDayKeys.forEach((key) => {
                if (!next[key]) next[key] = 'Loss of Pay';
            });
            Object.keys(next).forEach((key) => {
                if (!workingDayKeys.includes(key)) delete next[key];
            });
            return next;
        });
    }, [workingDayKeys, formData.requestType, open]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleEmployeeChange = (event, newValue) => {
        const employeeId = newValue?._id || '';
        setFormData(prev => {
            // Reset requestType when employee changes to ensure valid selection
            const allowedTypes = getAllowedLeaveTypesForEmployee(newValue);
            const currentType = prev.requestType;
            const newRequestType = allowedTypes.includes(currentType) ? currentType : allowedTypes[0] || 'Loss of Pay';
            
            return {
                ...prev,
                employee: employeeId,
                requestType: newRequestType
            };
        });
    };

    const handleDateChange = (date) => {
        setFormData(prev => ({ ...prev, leaveDates: [date] }));
    };

    const handleAlternateDateChange = (date) => {
        setFormData(prev => ({ ...prev, alternateDate: date }));
    };

    const handleAppliedDateChange = (date) => {
        setFormData(prev => ({ ...prev, appliedDate: date }));
    };

    const handleSaveClick = () => {
        if (!formData.employee || !formData.reason || !formData.leaveDates[0]) {
            console.error("Validation failed");
            return;
        }
        const dayTypeAllocations = formData.requestType === 'Loss of Pay'
            ? Object.entries(dayTypes)
                .filter(([, type]) => type !== 'Loss of Pay')
                .map(([date, requestType]) => ({ date, requestType }))
            : [];
        onSave({ ...formData, dayTypeAllocations });
    };

    // Get selected employee object for Autocomplete
    const selectedEmployee = employees.find(emp => emp._id === formData.employee) || null;

    // Get allowed leave types based on employee status
    const getAllowedLeaveTypesForEmployee = (employee) => {
        if (!employee) return ['Loss of Pay']; // Default fallback
        
        const status = employee.employmentStatus || employee.status;
        
        if (status === 'Permanent') {
            return ['Planned', 'Sick', 'Casual', 'Loss of Pay', 'Compensatory', 'Backdated Leave'];
        }
        
        if (status === 'Probation' || status === 'Intern') {
            return ['Loss of Pay', 'Compensatory'];
        }
        
        // Default fallback
        return ['Loss of Pay'];
    };

    const allowedLeaveTypes = getAllowedLeaveTypesForEmployee(selectedEmployee);

    // Map leave types to display names
    const getLeaveTypeDisplayName = (type) => {
        switch (type) {
            case 'Planned': return 'Planned Leave';
            case 'Sick': return 'Sick Leave';
            case 'Casual': return 'Casual Leave';
            case 'Loss of Pay': return 'LOP Loss of Pay';
            case 'Compensatory': return 'Compensatory';
            case 'Backdated Leave': return 'Backdated Leave';
            default: return type;
        }
    };

    return (
        <Dialog 
            open={open} 
            onClose={onClose} 
            fullWidth 
            maxWidth="sm" 
            PaperProps={{ 
                sx: { 
                    borderRadius: '16px',
                    width: '580px',
                    maxHeight: '80vh',
                    backgroundColor: '#FFFFFF',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)',
                    border: '1px solid #E5E7EB',
                    overflow: 'hidden', // Keep overflow hidden on the container
                    position: 'relative' // For absolute positioning of error notification
                } 
            }}
        >
            {/* Error Notification - Top Right Inside Modal */}
            {error && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: 16,
                        right: 16,
                        zIndex: 1500, // Higher than modal content
                        maxWidth: '350px',
                        animation: 'slideInRight 0.3s ease-out',
                        '@keyframes slideInRight': {
                            '0%': {
                                opacity: 0,
                                transform: 'translateX(20px)',
                            },
                            '100%': {
                                opacity: 1,
                                transform: 'translateX(0)',
                            },
                        },
                    }}
                >
                    <Alert 
                        severity="error" 
                        onClose={onClearError}
                        sx={{ 
                            width: '100%',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                            '& .MuiAlert-message': {
                                fontSize: '0.875rem',
                                fontWeight: 500,
                            }
                        }}
                        variant="filled"
                    >
                        {error}
                    </Alert>
                </Box>
            )}

            {/* redesigned header UI – neutral theme */}
            <DialogTitle sx={{ 
                backgroundColor: '#FFFFFF',
                borderBottom: '1px solid #E5E7EB',
                padding: '16px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <Box>
                    <Typography variant="h6" sx={{ color: '#111827', fontWeight: 600, fontSize: '1.125rem' }}>
                        {isEditing ? 'Edit Leave Request' : 'Log Leave Request'}
                    </Typography>
                    <Typography sx={{ color: '#6B7280', fontWeight: 400, fontSize: '0.875rem', mt: '4px' }}>
                        Log a new leave of absence for an employee.
                    </Typography>
                </Box>
                <IconButton
                    onClick={onClose}
                    sx={{
                        color: '#6B7280',
                        '&:hover': {
                            backgroundColor: '#F3F4F6',
                            color: '#111827',
                        },
                    }}
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ 
                backgroundColor: '#ffffff', // UI unified with Employee Leave Modal
                p: 3, // UI unified with Employee Leave Modal - 24px padding
                maxHeight: 'calc(90vh - 200px)', // UI unified with Employee Leave Modal - internal scroll
                overflow: 'auto',
                '&.MuiDialogContent-root': {
                    paddingTop: 3
                }
            }}>
                <Stack spacing={3}> {/* UI unified with Employee Leave Modal - consistent spacing */}
                    {/* Employee Dropdown with Search - Admin only field */}
                    <Autocomplete
                        options={employees}
                        getOptionLabel={(option) => `${option.fullName} (${option.employeeCode})`}
                        value={selectedEmployee}
                        onChange={handleEmployeeChange}
                        disabled={!employees.length}
                        loading={!employees.length}
                        aria-label="Select employee"
                        PaperComponent={({ children }) => (
                            <Box sx={{
                                // redesigned dropdown UI – neutral theme
                                backgroundColor: '#FFFFFF',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                                border: '1px solid #E5E7EB',
                                marginTop: '8px',
                            }}>{children}</Box>
                        )}
                        renderOption={(props, option) => (
                            <Box component="li" sx={{ '& > img': { mr: 2, flexShrink: 0 } }} {...props}>
                                <Avatar sx={{ mr: 2, bgcolor: '#E5E7EB', color: '#4B5563' }}>
                                    {option.fullName.charAt(0)}
                                </Avatar>
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                        {option.fullName}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        (#{option.employeeCode})
                                    </Typography>
                                </Box>
                            </Box>
                        )}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label="Employee"
                                required
                                aria-required="true"
                                sx={{
                                    // redesigned form field UI – neutral theme
                                    '& .MuiInputLabel-root': {
                                        color: '#6B7280',
                                        fontSize: '0.875rem',
                                        '&.Mui-focused': {
                                            color: '#111827',
                                        },
                                    },
                                    '& .MuiOutlinedInput-root': {
                                        backgroundColor: '#FFFFFF',
                                        borderRadius: '8px',
                                        '& fieldset': {
                                            borderColor: '#D1D5DB',
                                        },
                                        '&:hover fieldset': {
                                            borderColor: '#9CA3AF',
                                        },
                                        '&.Mui-focused fieldset': {
                                            borderColor: '#111827',
                                            borderWidth: '1px',
                                        },
                                    },
                                }}
                            />
                        )}
                    />

                    {/* Employee Status Indicator */}
                    {selectedEmployee && (
                        <Box sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 1, 
                            padding: '8px 12px',
                            backgroundColor: '#F9FAFB',
                            borderRadius: '8px',
                            border: '1px solid #E5E7EB'
                        }}>
                            <Typography variant="body2" sx={{ color: '#6B7280', fontWeight: 500 }}>
                                Employee Status:
                            </Typography>
                            <Typography variant="body2" sx={{ 
                                color: '#111827', 
                                fontWeight: 600,
                                textTransform: 'capitalize'
                            }}>
                                {selectedEmployee.employmentStatus || selectedEmployee.status || 'Unknown'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9CA3AF', ml: 1 }}>
                                ({allowedLeaveTypes.length} leave type{allowedLeaveTypes.length !== 1 ? 's' : ''} available)
                            </Typography>
                        </Box>
                    )}

                    {/* Leave Category & Leave Type - Side by Side */}
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth required sx={{
                                // redesigned form field UI – neutral theme
                                '& .MuiInputLabel-root': {
                                    color: '#6B7280',
                                    fontSize: '0.875rem',
                                    '&.Mui-focused': {
                                        color: '#111827',
                                    },
                                },
                                '& .MuiOutlinedInput-root': {
                                    backgroundColor: '#FFFFFF',
                                    borderRadius: '8px',
                                    '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: '#D1D5DB',
                                    },
                                    '&:hover .MuiOutlinedInput-notchedOutline': {
                                        borderColor: '#9CA3AF',
                                    },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                        borderColor: '#111827',
                                        borderWidth: '1px',
                                    },
                                },
                            }}>
                                <InputLabel>Leave Category</InputLabel>
                                <Select 
                                    name="requestType" 
                                    label="Leave Category" 
                                    value={formData.requestType} 
                                    onChange={handleChange}
                                    aria-label="Request type"
                                    aria-required="true"
                                    MenuProps={{
                                        PaperProps: {
                                            sx: {
                                                // redesigned dropdown UI – neutral theme
                                                backgroundColor: '#FFFFFF',
                                                borderRadius: '8px',
                                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                                                border: '1px solid #E5E7EB',
                                                marginTop: '8px',
                                            },
                                        },
                                    }}
                                >
                                    {allowedLeaveTypes.map(type => (
                                        <MenuItem key={type} value={type}>
                                            {getLeaveTypeDisplayName(type)}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth required sx={{
                                // redesigned form field UI – neutral theme
                                '& .MuiInputLabel-root': {
                                    color: '#6B7280',
                                    fontSize: '0.875rem',
                                    '&.Mui-focused': {
                                        color: '#111827',
                                    },
                                },
                                '& .MuiOutlinedInput-root': {
                                    backgroundColor: '#FFFFFF',
                                    borderRadius: '8px',
                                    '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: '#D1D5DB',
                                    },
                                    '&:hover .MuiOutlinedInput-notchedOutline': {
                                        borderColor: '#9CA3AF',
                                    },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                        borderColor: '#111827',
                                        borderWidth: '1px',
                                    },
                                },
                            }}>
                                <InputLabel>Leave Type</InputLabel>
                                <Select 
                                    name="leaveType" 
                                    label="Leave Type" 
                                    value={formData.leaveType} 
                                    onChange={handleChange}
                                    aria-label="Leave type"
                                    aria-required="true"
                                    MenuProps={{
                                        PaperProps: {
                                            sx: {
                                                // redesigned dropdown UI – neutral theme
                                                backgroundColor: '#FFFFFF',
                                                borderRadius: '8px',
                                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                                                border: '1px solid #E5E7EB',
                                                marginTop: '8px',
                                            },
                                        },
                                    }}
                                >
                                    <MenuItem value="Full Day">Full Day</MenuItem>
                                    <MenuItem value="Half Day - First Half">Half Day - First Half</MenuItem>
                                    <MenuItem value="Half Day - Second Half">Half Day - Second Half</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                    {/* Start Date */}
                    <LazyDatePicker 
                            label="Start Date" 
                            value={formData.leaveDates[0]} 
                            onChange={handleDateChange}
                            slotProps={{
                                textField: {
                                    fullWidth: true,
                                    required: true,
                                    placeholder: 'Select Date',
                                    'aria-label': 'Leave date',
                                    'aria-required': 'true',
                                    sx: {
                                        // redesigned form field UI – neutral theme
                                        '& .MuiInputLabel-root': {
                                            color: '#6B7280',
                                            fontSize: '0.875rem',
                                            '&.Mui-focused': {
                                                color: '#111827',
                                            },
                                        },
                                        '& .MuiOutlinedInput-root': {
                                            backgroundColor: '#FFFFFF',
                                            borderRadius: '8px',
                                            '& .MuiOutlinedInput-notchedOutline': {
                                                borderColor: '#D1D5DB',
                                            },
                                            '&:hover .MuiOutlinedInput-notchedOutline': {
                                                borderColor: '#9CA3AF',
                                            },
                                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                                borderColor: '#111827',
                                                borderWidth: '1px',
                                            },
                                        },
                                    }
                                }
                            }}
                        />

                    {/* End Date (optional) - UI unified with Employee Leave Modal */}
                    {formData.requestType !== 'Compensatory' && (
                        <LazyDatePicker 
                                label="End Date (optional)" 
                                value={formData.leaveDates[1] || null} 
                                onChange={(date) => {
                                    setFormData(prev => ({ 
                                        ...prev, 
                                        leaveDates: date ? [prev.leaveDates[0], date] : [prev.leaveDates[0]]
                                    }));
                                }}
                                minDate={formData.leaveDates[0]}
                                disabled={!formData.leaveDates[0]}
                                slotProps={{
                                    textField: {
                                        fullWidth: true,
                                        placeholder: 'Select Date',
                                        sx: {
                                            // redesigned form field UI – neutral theme
                                            '& .MuiInputLabel-root': {
                                                color: '#6B7280',
                                                fontSize: '0.875rem',
                                                '&.Mui-focused': {
                                                    color: '#111827',
                                                },
                                            },
                                            '& .MuiOutlinedInput-root': {
                                                backgroundColor: '#FFFFFF',
                                                borderRadius: '8px',
                                                '& .MuiOutlinedInput-notchedOutline': {
                                                    borderColor: '#D1D5DB',
                                                },
                                                '&:hover .MuiOutlinedInput-notchedOutline': {
                                                    borderColor: '#9CA3AF',
                                                },
                                                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                                    borderColor: '#111827',
                                                    borderWidth: '1px',
                                                },
                                            },
                                        }
                                    }
                                }}
                            />
                    )}

                    {/* Alternate Date for Compensatory Leave */}
                    {formData.requestType === 'Compensatory' && (
                        <LazyDatePicker 
                                label="Alternate Working Date (Saturday or Sunday)" 
                                value={formData.alternateDate} 
                                onChange={handleAlternateDateChange}
                                shouldDisableDate={(date) => {
                                    const day = date.getDay();
                                    return day !== 0 && day !== 6;
                                }}
                                slotProps={{
                                    textField: {
                                        fullWidth: true,
                                        required: true,
                                        placeholder: 'Select Date',
                                        sx: {
                                            // redesigned form field UI – neutral theme
                                            '& .MuiInputLabel-root': {
                                                color: '#6B7280',
                                                fontSize: '0.875rem',
                                                '&.Mui-focused': {
                                                    color: '#111827',
                                                },
                                            },
                                            '& .MuiOutlinedInput-root': {
                                                backgroundColor: '#FFFFFF',
                                                borderRadius: '8px',
                                                '& .MuiOutlinedInput-notchedOutline': {
                                                    borderColor: '#D1D5DB',
                                                },
                                                '&:hover .MuiOutlinedInput-notchedOutline': {
                                                    borderColor: '#9CA3AF',
                                                },
                                                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                                    borderColor: '#111827',
                                                    borderWidth: '1px',
                                                },
                                            },
                                        }
                                    }
                                }}
                            />
                    )}
                    {formData.requestType === 'Loss of Pay' && workingDayKeys.length >= 2 && (
                        <Box sx={{ p: 2, border: '1px solid #E5E7EB', borderRadius: '8px', bgcolor: '#F9FAFB' }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                Split LOP days (Planned / Casual)
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                                Assign working days to Planned or Casual; remaining days stay as LOP. Works for pending and approved leaves.
                            </Typography>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Date</TableCell>
                                        <TableCell>Effective type</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {workingDayKeys.map((dateKey) => (
                                        <TableRow key={dateKey}>
                                            <TableCell>{dateKey}</TableCell>
                                            <TableCell>
                                                <Select
                                                    size="small"
                                                    fullWidth
                                                    value={dayTypes[dateKey] || 'Loss of Pay'}
                                                    onChange={(e) => setDayTypes((prev) => ({
                                                        ...prev,
                                                        [dateKey]: e.target.value,
                                                    }))}
                                                >
                                                    <MenuItem value="Loss of Pay">Loss of Pay</MenuItem>
                                                    <MenuItem value="Planned">Planned</MenuItem>
                                                    <MenuItem value="Casual">Casual</MenuItem>
                                                </Select>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Box>
                    )}

                    {/* Reason Textarea */}
                    <TextField 
                        name="reason" 
                        label="Reason" 
                        multiline 
                        rows={4} // UI unified with Employee Leave Modal - consistent rows
                        value={formData.reason} 
                        onChange={handleChange} 
                        fullWidth 
                        required
                        placeholder="Enter reason for leave"
                        aria-label="Reason for leave"
                        aria-required="true"
                        sx={{
                            // redesigned form field UI – neutral theme
                            '& .MuiInputLabel-root': {
                                color: '#6B7280',
                                fontSize: '0.875rem',
                                '&.Mui-focused': {
                                    color: '#111827',
                                },
                            },
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: '#FFFFFF',
                                borderRadius: '8px',
                                '& .MuiOutlinedInput-notchedOutline': {
                                    borderColor: '#D1D5DB',
                                },
                                '&:hover .MuiOutlinedInput-notchedOutline': {
                                    borderColor: '#9CA3AF',
                                },
                                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                    borderColor: '#111827',
                                    borderWidth: '1px',
                                },
                            },
                        }}
                    />
                    
                    {/* Employee Applied Date - Admin only field, visible for both create and edit */}
                    <LazyDatePicker 
                            label="Employee Applied Date" 
                            value={formData.appliedDate} 
                            onChange={handleAppliedDateChange}
                            maxDate={new Date()} // Cannot be in the future
                            slotProps={{
                                textField: {
                                        fullWidth: true,
                                        placeholder: 'Select Date',
                                        sx: {
                                            // redesigned form field UI – neutral theme
                                            '& .MuiInputLabel-root': {
                                                color: '#6B7280',
                                                fontSize: '0.875rem',
                                                '&.Mui-focused': {
                                                    color: '#111827',
                                                },
                                            },
                                            '& .MuiOutlinedInput-root': {
                                                backgroundColor: '#FFFFFF',
                                                borderRadius: '8px',
                                                '& .MuiOutlinedInput-notchedOutline': {
                                                    borderColor: '#D1D5DB',
                                                },
                                                '&:hover .MuiOutlinedInput-notchedOutline': {
                                                    borderColor: '#9CA3AF',
                                                },
                                                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                                    borderColor: '#111827',
                                                    borderWidth: '1px',
                                                },
                                            },
                                        }
                                    }
                                }}
                            />

                    {/* Status Dropdown - Admin only field */}
                    <FormControl fullWidth required sx={{
                        // redesigned form field UI – neutral theme
                        '& .MuiInputLabel-root': {
                            color: '#6B7280',
                            fontSize: '0.875rem',
                            '&.Mui-focused': {
                                color: '#111827',
                            },
                        },
                        '& .MuiOutlinedInput-root': {
                            backgroundColor: '#FFFFFF',
                            borderRadius: '8px',
                            '& .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#D1D5DB',
                            },
                            '&:hover .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#9CA3AF',
                            },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#111827',
                                borderWidth: '1px',
                            },
                        },
                    }}>
                        <InputLabel>Status</InputLabel>
                        <Select 
                            name="status" 
                            label="Status" 
                            value={formData.status} 
                            onChange={handleChange}
                            aria-label="Leave request status"
                            aria-required="true"
                            MenuProps={{
                                PaperProps: {
                                    sx: {
                                        // redesigned dropdown UI – neutral theme
                                        backgroundColor: '#FFFFFF',
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                                        border: '1px solid #E5E7EB',
                                        marginTop: '8px',
                                    },
                                },
                            }}
                        >
                            <MenuItem 
                                value="Pending"
                                sx={{
                                    // redesigned dropdown item UI – neutral theme
                                    '&:hover': {
                                        backgroundColor: '#F9FAFB'
                                    },
                                    '&.Mui-selected': {
                                        backgroundColor: '#F3F4F6',
                                        '&:hover': {
                                            backgroundColor: '#F9FAFB'
                                        }
                                    }
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box 
                                        sx={{ 
                                            width: 12, 
                                            height: 12, 
                                            borderRadius: '50%', 
                                            backgroundColor: '#9CA3AF' 
                                        }} 
                                    />
                                    Pending
                                </Box>
                            </MenuItem>
                            <MenuItem 
                                value="Approved"
                                sx={{
                                    // redesigned dropdown item UI – neutral theme
                                    '&:hover': {
                                        backgroundColor: '#F9FAFB'
                                    },
                                    '&.Mui-selected': {
                                        backgroundColor: '#F3F4F6',
                                        '&:hover': {
                                            backgroundColor: '#F9FAFB'
                                        }
                                    }
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box 
                                        sx={{ 
                                            width: 12, 
                                            height: 12, 
                                            borderRadius: '50%', 
                                            backgroundColor: '#6B7280' 
                                        }} 
                                    />
                                    Approved
                                </Box>
                            </MenuItem>
                            <MenuItem 
                                value="Rejected"
                                sx={{
                                    // redesigned dropdown item UI – neutral theme
                                    '&:hover': {
                                        backgroundColor: '#F9FAFB'
                                    },
                                    '&.Mui-selected': {
                                        backgroundColor: '#F3F4F6',
                                        '&:hover': {
                                            backgroundColor: '#F9FAFB'
                                        }
                                    }
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box 
                                        sx={{ 
                                            width: 12, 
                                            height: 12, 
                                            borderRadius: '50%', 
                                            backgroundColor: '#4B5563' 
                                        }} 
                                    />
                                    Rejected
                                </Box>
                            </MenuItem>
                        </Select>
                    </FormControl>
                </Stack>
            </DialogContent>

            {/* redesigned footer UI – neutral theme */}
            <DialogActions sx={{ 
                padding: '16px 24px',
                backgroundColor: '#FFFFFF',
                borderTop: '1px solid #E5E7EB',
            }}>
                <Button 
                    onClick={onClose}
                    variant="outlined"
                    disabled={isSaving}
                    sx={{
                        // redesigned secondary button UI – neutral theme
                        borderColor: '#D1D5DB',
                        color: '#374151',
                        fontWeight: 600,
                        borderRadius: '8px',
                        textTransform: 'none',
                        '&:hover': {
                            borderColor: '#9CA3AF',
                            backgroundColor: '#F9FAFB',
                        },
                    }}
                >
                    Cancel
                </Button>
                <Button 
                    onClick={handleSaveClick} 
                    variant="contained" 
                    disabled={isSaving} 
                    sx={{ 
                        // redesigned primary button UI – neutral theme
                        backgroundColor: '#111827',
                        color: '#FFFFFF',
                        fontWeight: 600,
                        borderRadius: '8px',
                        textTransform: 'none',
                        boxShadow: 'none',
                        '&:hover': {
                            backgroundColor: '#1F2937',
                        },
                        '&:disabled': {
                            backgroundColor: '#D1D5DB',
                            color: '#9CA3AF',
                        }
                    }}
                >
                    {isSaving ? <SkeletonBox width="24px" height="24px" borderRadius="50%" /> : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default AdminLeaveForm;