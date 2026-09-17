import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Grid, TextField } from '@mui/material';
import api from '../api/axios';
import {
    getDepartmentOptions,
    getDesignationOptions,
    resolveOrgFields,
} from '../utils/orgFieldOptions';

const defaultGrid = { xs: 12, md: 6 };

const OrgAssignmentFields = ({
    department,
    designation,
    onChange,
    textFieldSx,
    gridProps = defaultGrid,
    disabled = false,
}) => {
    const [existing, setExisting] = useState({ departments: [], designations: [] });

    useEffect(() => {
        let cancelled = false;
        api.get('/admin/employees/org-options')
            .then(({ data }) => {
                if (cancelled) return;
                setExisting({
                    departments: data?.departments || [],
                    designations: data?.designations || [],
                });
            })
            .catch(() => {
                if (!cancelled) setExisting({ departments: [], designations: [] });
            });
        return () => { cancelled = true; };
    }, []);

    const departmentOptions = useMemo(
        () => getDepartmentOptions(existing.departments, department),
        [existing.departments, department]
    );

    const designationOptions = useMemo(
        () => getDesignationOptions(department, existing.designations, designation),
        [department, existing.designations, designation]
    );

    const emit = (nextDepartment, nextDesignation) => {
        const resolved = resolveOrgFields({
            department: nextDepartment,
            designation: nextDesignation,
        });
        onChange(resolved);
    };

    return (
        <>
            <Grid item {...gridProps}>
                <Autocomplete
                    freeSolo
                    disabled={disabled}
                    options={departmentOptions}
                    value={department || ''}
                    onChange={(_, value) => emit(value || '', designation)}
                    onInputChange={(_, value, reason) => {
                        if (reason === 'input' || reason === 'clear') {
                            emit(value, designation);
                        }
                    }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Department"
                            helperText="Team / org unit. Domain is kept in sync with this value."
                            sx={textFieldSx}
                        />
                    )}
                />
            </Grid>
            <Grid item {...gridProps}>
                <Autocomplete
                    freeSolo
                    disabled={disabled}
                    options={designationOptions}
                    value={designation || ''}
                    onChange={(_, value) => emit(department, value || '')}
                    onInputChange={(_, value, reason) => {
                        if (reason === 'input' || reason === 'clear') {
                            emit(department, value);
                        }
                    }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Designation"
                            helperText={department
                                ? `Job title suggestions for ${department}`
                                : 'Job title. Pick a department to see relevant titles.'}
                            sx={textFieldSx}
                        />
                    )}
                />
            </Grid>
        </>
    );
};

export default OrgAssignmentFields;
