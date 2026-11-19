import { useMemo } from 'react';
import { Autocomplete, createFilterOptions, Grid, TextField } from '@mui/material';
import {
    getDepartmentOptions,
    getDesignationOptions,
    resolveOrgFields,
} from '../utils/orgFieldOptions';

const defaultGrid = { xs: 12, md: 6 };
const filter = createFilterOptions();

const resolveGridSize = (gridProps = {}) => {
    if (gridProps.size) return gridProps.size;
    const size = {};
    ['xs', 'sm', 'md', 'lg', 'xl'].forEach((key) => {
        if (gridProps[key] != null) size[key] = gridProps[key];
    });
    if (size.xs == null) size.xs = 12;
    return size;
};

/**
 * Creatable department / designation fields.
 * Catalog is fixed; freeSolo + "Add …" covers intentional new values.
 * Does not pull historical org-options into the list (avoids redundant legacy depts).
 */
const OrgAssignmentFields = ({
    department,
    designation,
    onChange,
    textFieldSx,
    gridProps = defaultGrid,
    disabled = false,
    dense = false,
}) => {
    const departmentOptions = useMemo(
        () => getDepartmentOptions([], department),
        [department]
    );

    const designationOptions = useMemo(
        () => getDesignationOptions(department, [], designation),
        [department, designation]
    );

    const emit = (nextDepartment, nextDesignation) => {
        const resolved = resolveOrgFields({
            department: nextDepartment,
            designation: nextDesignation,
        });
        onChange(resolved);
    };

    const creatableFilter = (options, params) => {
        const filtered = filter(options, params);
        const input = (params.inputValue || '').trim();
        if (!input) return filtered;
        const exists = options.some((opt) => String(opt).toLowerCase() === input.toLowerCase());
        if (!exists) {
            filtered.push(`Add "${input}"`);
        }
        return filtered;
    };

    const resolveCreatableValue = (value) => {
        if (value == null) return '';
        const raw = String(value);
        const match = raw.match(/^Add "(.+)"$/);
        return match ? match[1] : raw;
    };

    return (
        <>
            <Grid size={resolveGridSize(gridProps)}>
                <Autocomplete
                    freeSolo
                    selectOnFocus
                    clearOnBlur
                    handleHomeEndKeys
                    disabled={disabled}
                    options={departmentOptions}
                    value={department || ''}
                    filterOptions={creatableFilter}
                    onChange={(_, value) => {
                        const nextDept = resolveCreatableValue(value);
                        const nextDesignation = nextDept === department ? designation : '';
                        emit(nextDept, nextDesignation);
                    }}
                    onInputChange={(_, value, reason) => {
                        if (reason === 'input' || reason === 'clear') {
                            // Keep designation while typing; only clear on actual department change (onChange)
                            emit(value, designation);
                        }
                    }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Department"
                            size={dense ? 'small' : 'medium'}
                            helperText={dense ? undefined : 'Select or type to add a new department.'}
                            sx={textFieldSx}
                        />
                    )}
                />
            </Grid>
            <Grid size={resolveGridSize(gridProps)}>
                <Autocomplete
                    freeSolo
                    selectOnFocus
                    clearOnBlur
                    handleHomeEndKeys
                    disabled={disabled || !department}
                    options={designationOptions}
                    value={designation || ''}
                    filterOptions={creatableFilter}
                    onChange={(_, value) => emit(department, resolveCreatableValue(value))}
                    onInputChange={(_, value, reason) => {
                        if (reason === 'input' || reason === 'clear') {
                            emit(department, value);
                        }
                    }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Designation"
                            size={dense ? 'small' : 'medium'}
                            helperText={dense
                                ? undefined
                                : (department
                                    ? `Titles for ${department}. Type to add a new one.`
                                    : 'Select a department first.')}
                            sx={textFieldSx}
                        />
                    )}
                />
            </Grid>
        </>
    );
};

export default OrgAssignmentFields;
