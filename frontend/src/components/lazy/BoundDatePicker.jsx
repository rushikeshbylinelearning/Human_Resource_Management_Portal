import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

export default function BoundDatePicker(props) {
    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DatePicker {...props} />
        </LocalizationProvider>
    );
}
