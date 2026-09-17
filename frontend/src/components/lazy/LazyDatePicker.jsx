import { Suspense } from 'react';
import { TextField } from '@mui/material';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const BoundDatePicker = lazyWithRetry(() => import('./BoundDatePicker'));

function DatePickerSkeleton({ label, sx, slotProps, disabled }) {
    const textFieldProps = slotProps?.textField || {};
    return (
        <TextField
            disabled
            label={label}
            placeholder={label || 'Date'}
            fullWidth={textFieldProps.fullWidth !== false}
            size={textFieldProps.size}
            className={textFieldProps.className}
            error={textFieldProps.error}
            helperText={textFieldProps.helperText}
            required={textFieldProps.required}
            sx={sx}
        />
    );
}

export default function LazyDatePicker(props) {
    return (
        <Suspense fallback={<DatePickerSkeleton {...props} />}>
            <BoundDatePicker {...props} />
        </Suspense>
    );
}
