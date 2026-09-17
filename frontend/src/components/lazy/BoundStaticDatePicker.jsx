import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

export default function BoundStaticDatePicker(props) {
    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <StaticDatePicker {...props} />
        </LocalizationProvider>
    );
}
