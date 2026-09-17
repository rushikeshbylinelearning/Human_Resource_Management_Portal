import { StaticDateTimePicker } from '@mui/x-date-pickers/StaticDateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

export default function BoundStaticDateTimePicker(props) {
    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <StaticDateTimePicker {...props} />
        </LocalizationProvider>
    );
}
