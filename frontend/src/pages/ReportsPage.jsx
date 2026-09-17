// src/pages/ReportsPage.jsx

import React, { useState, useEffect, useCallback, memo } from 'react';
import { Typography, Button, Paper, Grid, Alert, Autocomplete, TextField, FormControl, InputLabel, Select, MenuItem, Chip, Stack, ListItemText, Card, CardContent, CardActions, Box, IconButton, Tooltip, Divider, Avatar } from '@mui/material';
import LazyDatePicker from '../components/lazy/LazyDatePicker';
import api from '../api/axios';
import { loadJsPDFWithAutoTable, loadXLSX } from '../utils/lazyLibraries';
import { format, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, eachDayOfInterval, differenceInDays } from 'date-fns';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import DescriptionIcon from '@mui/icons-material/Description';
import AssessmentIcon from '@mui/icons-material/Assessment';
import EventNoteIcon from '@mui/icons-material/EventNote';
import HistoryIcon from '@mui/icons-material/History';
import { formatLeaveRequestType, isWorkingSaturday } from '../utils/saturdayUtils';
import PageHeroHeader from '../components/PageHeroHeader';
import { SkeletonBox } from '../components/SkeletonLoaders';
import '../styles/ReportsPage.css'; // Import the new stylesheet

// --- HELPER FUNCTIONS ---
const formatDuration = (mins) => {
    if (isNaN(mins) || mins <= 0) return '0h 0m';
    const hours = Math.floor(mins / 60);
    const minutes = Math.round(mins % 60);
    return `${hours}h ${minutes}m`;
};
const getReportPeriod = (dateRange) => {
    if (!dateRange || !dateRange.start || !dateRange.end) return 'Report';
    const days = differenceInDays(dateRange.end, dateRange.start);
    if (days >= 5 && days <= 9) return 'Weekly_Report';
    if (days >= 28 && days <= 31) return 'Monthly_Report';
    return 'Report';
};
const selectAllOption = { _id: 'SELECT_ALL', fullName: 'Select All Employees', employeeCode: 'ALL' };

const mapLeaveReportRow = (row) => {
    if (row.recordType === 'absent') {
        return {
            date: row.date,
            employeeName: row.employee?.fullName || '',
            employeeCode: row.employee?.employeeCode || '',
            recordType: 'Absent',
            type: 'Absent',
            status: 'Absent',
            reason: row.reason || '-',
            isAbsent: true
        };
    }
    return {
        date: format(new Date(row.createdAt), 'yyyy-MM-dd'),
        employeeName: row.employee?.fullName || '',
        employeeCode: row.employee?.employeeCode || '',
        recordType: 'Leave Request',
        type: formatLeaveRequestType(row.requestType),
        status: row.status,
        reason: row.reason || '-',
        isAbsent: false
    };
};

// --- PDF GENERATION LOGIC (UPDATED) ---
const generatePdf = async (reportType, data, selectedEmployees, dateRange) => {
    const { jsPDF, autoTable } = await loadJsPDFWithAutoTable();
    const doc = new jsPDF({ orientation: reportType === 'notes' ? 'portrait' : 'landscape' });
    let title, head, body;

    // Create a map of employee IDs to their Saturday policies
    // Also create maps by employeeCode and employeeName for fallback matching
    const employeePolicyMap = new Map();
    const employeeCodePolicyMap = new Map();
    const employeeNamePolicyMap = new Map();
    
    selectedEmployees.forEach(emp => {
        const policy = emp.alternateSaturdayPolicy || 'All Saturdays Working';
        if (emp._id) {
            employeePolicyMap.set(emp._id.toString(), policy);
        }
        if (emp.employeeCode) {
            employeeCodePolicyMap.set(emp.employeeCode, policy);
        }
        if (emp.fullName) {
            employeeNamePolicyMap.set(emp.fullName, policy);
        }
    });

    if (reportType === 'attendance') {
        title = 'Attendance & Break Report';
        head = [['Date', 'Employee', 'Status', 'Shift', 'Clock In', 'Clock Out', 'Work Time', 'Paid Break', 'Unpaid Break', 'Extra Unpaid Break', 'Penalty Break Time', 'Total Break', 'Overtime']];
        body = data.map(row => [
            row.date,
            row.employeeName,
            row.status,
            row.shiftName,
            row.clockIn ? format(new Date(row.clockIn), 'p') : 'N/A',
            row.clockOut ? format(new Date(row.clockOut), 'p') : 'N/A',
            formatDuration(row.totalWorkMinutes),
            formatDuration(row.paidBreakMinutes),
            formatDuration(row.unpaidBreakMinutes),
            formatDuration(row.extraUnpaidBreakMinutes),
            `${row.penaltyMinutes || 0} min`,
            formatDuration(row.totalBreakMinutes),
            formatDuration(row.overtimeMinutes || 0)
        ]);
    } else if (reportType === 'leaves') {
        title = 'Leave Request Report';
        head = [['Date', 'Employee', 'Record', 'Type', 'Status', 'Reason']];
        body = data.map(row => {
            const mapped = mapLeaveReportRow(row);
            return [mapped.date, mapped.employeeName, mapped.recordType, mapped.type, mapped.status, mapped.reason];
        });
    } else if (reportType === 'notes') {
        title = 'Attendance Notes Report';
        head = [['Date', 'Employee', 'Status', 'Shift', 'Clock In', 'Clock Out', 'Notes']];
        body = data.map(row => [
            row.date,
            row.employeeName,
            row.status,
            row.shiftName,
            row.clockInTime ? format(new Date(row.clockInTime), 'p') : 'N/A',
            row.clockOutTime ? format(new Date(row.clockOutTime), 'p') : 'N/A',
            row.notes
        ]);
    }

    doc.text(title, 14, 16);
    
    // For attendance reports, add row coloring
    const tableConfig = {
        head, 
        body, 
        startY: 22,
        styles: { fontSize: 8 },
        columnStyles: reportType === 'notes' ? { 6: { cellWidth: 80 } } : {}
    };

    if (reportType === 'leaves') {
        const leaveOriginalData = data.map(mapLeaveReportRow);
        tableConfig.didParseCell = (cellData) => {
            if (cellData.row.index >= 0 && cellData.row.index < leaveOriginalData.length) {
                const mapped = leaveOriginalData[cellData.row.index];
                if (mapped?.isAbsent) {
                    cellData.cell.styles.fillColor = [255, 182, 193];
                    cellData.cell.styles.textColor = [255, 255, 255];
                }
            }
        };
    }

    // Add row styling for attendance reports
    if (reportType === 'attendance') {
        // Store original data for reference in didParseCell
        const originalData = data;
        
        tableConfig.didParseCell = (cellData) => {
            // Only style body rows (skip header which has index -1)
            if (cellData.row.index >= 0 && cellData.row.index < originalData.length) {
                const originalRow = originalData[cellData.row.index];
                if (!originalRow) return;
                
                // Get employee ID, status, and date from original data
                const employeeId = originalRow.employeeId ? originalRow.employeeId.toString() : null;
                const employeeCode = originalRow.employeeCode;
                const employeeName = originalRow.employeeName;
                const status = originalRow.status;
                const dateStr = originalRow.date;
                const date = new Date(dateStr);
                
                // Get Saturday policy - first try from row data, then from maps
                let saturdayPolicy = originalRow.alternateSaturdayPolicy || 'All Saturdays Working';
                if (!saturdayPolicy || saturdayPolicy === 'All Saturdays Working') {
                    // Fallback to maps if not in row data
                    if (employeeId && employeePolicyMap.has(employeeId)) {
                        saturdayPolicy = employeePolicyMap.get(employeeId);
                    } else if (employeeCode && employeeCodePolicyMap.has(employeeCode)) {
                        saturdayPolicy = employeeCodePolicyMap.get(employeeCode);
                    } else if (employeeName && employeeNamePolicyMap.has(employeeName)) {
                        saturdayPolicy = employeeNamePolicyMap.get(employeeName);
                    }
                }
                
                // Check if it's a weekend
                const dayOfWeek = date.getDay();
                const isSunday = dayOfWeek === 0;
                const isSaturday = dayOfWeek === 6;
                
                // Check if user is present on Saturday (Present or Late status)
                const isPresentOnSaturday = isSaturday && (status === 'Present' || status === 'Late');
                
                // Check if Saturday is working for this employee
                let isWeekendOff = false;
                if (status === 'Weekend') {
                    // If status is already Weekend, check if it's Sunday or Saturday (off)
                    if (isSunday) {
                        isWeekendOff = true; // Sunday is always off
                    } else if (isSaturday) {
                        isWeekendOff = !isWorkingSaturday(date, saturdayPolicy);
                    }
                } else {
                    // Check day of week for weekends
                    if (isSunday) {
                        isWeekendOff = true; // Sunday is always off
                    } else if (isSaturday) {
                        // Only mark as weekend off if it's not a working Saturday AND user is not present
                        isWeekendOff = !isWorkingSaturday(date, saturdayPolicy) && !isPresentOnSaturday;
                    }
                }
                
                // Apply colors based on status
                if (isWeekendOff) {
                    // Yellowish orange for weekends (when Saturday is OFF and user is not present)
                    cellData.cell.styles.fillColor = [255, 220, 100]; // Yellowish orange
                } else if (status === 'On Leave') {
                    // Blue for leaves
                    cellData.cell.styles.fillColor = [135, 206, 250]; // Sky blue
                } else if (status === 'Absent') {
                    // Light red background with white text for absent
                    cellData.cell.styles.fillColor = [255, 182, 193]; // Light red/pink
                    cellData.cell.styles.textColor = [255, 255, 255]; // White text
                } else if (status === 'N/A') {
                    // Gray background for N/A (future dates)
                    cellData.cell.styles.fillColor = [240, 240, 240]; // Light gray
                    cellData.cell.styles.textColor = [128, 128, 128]; // Gray text
                }
            }
        };
    }
    
    autoTable(doc, tableConfig);
    
    const period = getReportPeriod(dateRange);
    const reportSuffix = reportType === 'attendance' ? `Attendance_${period}` : 
                        reportType === 'leaves' ? `Leave_${period}` : 
                        `Notes_${period}`;
    const employeeName = selectedEmployees.length === 1 ? selectedEmployees[0].fullName.replace(/\s/g, '_') : 'Employees';
    doc.save(`${employeeName}_${reportSuffix}.pdf`);
};

// --- EXCEL GENERATION LOGIC (UPDATED) ---
const generateExcel = async (reportType, data, selectedEmployees, dateRange) => {
    const XLSX = await loadXLSX();
    const xlsx = XLSX.default ?? XLSX;
    const wb = xlsx.utils.book_new();
    let reportName;
    const boldStyle = { font: { bold: true } };

    if (reportType === 'attendance') {
        const detailedLogData = data.map(row => ({
            'Employee Code': row.employeeCode,
            'Employee Name': row.employeeName,
            'Date': row.date,
            'Status': row.status,
            'Shift': row.shiftName,
            'Clock In': row.clockIn ? format(new Date(row.clockIn), 'p') : 'N/A',
            'Clock Out': row.clockOut ? format(new Date(row.clockOut), 'p') : 'N/A',
            'Work Time': formatDuration(row.totalWorkMinutes),
            'Paid Break': formatDuration(row.paidBreakMinutes),
            'Unpaid Break': formatDuration(row.unpaidBreakMinutes),
            'Extra Unpaid Break': formatDuration(row.extraUnpaidBreakMinutes),
            'Penalty Break Time (Mins)': row.penaltyMinutes || 0,
            'Total Break': formatDuration(row.totalBreakMinutes),
            'Overtime': formatDuration(row.overtimeMinutes || 0)
        }));
        const ws1 = xlsx.utils.json_to_sheet(detailedLogData);
        ws1['!cols'] = [ { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 22 }, { wch: 12 }, { wch: 12 }];
        const range1 = xlsx.utils.decode_range(ws1['!ref']);
        for (let C = range1.s.c; C <= range1.e.c; ++C) { const address = xlsx.utils.encode_cell({ r: 0, c: C }); if (ws1[address]) ws1[address].s = boldStyle; }
        xlsx.utils.book_append_sheet(wb, ws1, 'Detailed Log');

        // Add summary counts for single user reports
        if (selectedEmployees.length === 1) {
            let totalWorkingDays = 0; // Total working days (excluding weekends)
            let actualWorkingDays = 0; // Days actually worked (Present/Late)
            let onLeaveDays = 0; // Days on leave
            let holidayDays = 0; // Company holidays
            let weekendDays = 0; // Weekend days
            let absentDays = 0; // Absent days
            let totalNetMinutes = 0; // Total work time without breaks
            let totalMinutesWithBreak = 0; // Total time including breaks
            let totalOvertimeMinutes = 0; // Total overtime

            data.forEach(row => {
                const day = new Date(row.date);
                const dayOfWeek = day.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                if (isWeekend) {
                    weekendDays++;
                } else if (row.status === 'Holiday') {
                    // Holidays are not counted as working days
                    holidayDays++;
                } else {
                    // It's a working day (not weekend, not holiday)
                    totalWorkingDays++;
                    
                    if (row.status === 'Present' || row.status === 'Late') {
                        actualWorkingDays++;
                        // Add work time and break time
                        totalNetMinutes += row.totalWorkMinutes || 0;
                        totalMinutesWithBreak += (row.totalWorkMinutes || 0) + (row.totalBreakMinutes || 0);
                        totalOvertimeMinutes += row.overtimeMinutes || 0;
                    } else if (row.status === 'On Leave') {
                        onLeaveDays++;
                    } else if (row.status === 'Absent') {
                        absentDays++;
                    }
                }
            });

            // Calculate averages
            const avgWorkingMinutes = actualWorkingDays > 0 ? totalNetMinutes / actualWorkingDays : 0;

            const summaryData = [
                ['Summary'],
                ['Total Working Days', totalWorkingDays],
                ['Actual Working Days', actualWorkingDays],
                ['On Leave Days', onLeaveDays],
                ['Holiday Days', holidayDays],
                ['Absent Days', absentDays],
                ['Weekend Days', weekendDays],
                [],
                ['Time Summary'],
                ['Total Net Hours (Work Time)', formatDuration(totalNetMinutes)],
                ['Total Hours with Break', formatDuration(totalMinutesWithBreak)],
                ['Average Working Hours', formatDuration(avgWorkingMinutes)],
                ['Total Overtime Hours', formatDuration(totalOvertimeMinutes)]
            ];
            const wsSummary = xlsx.utils.aoa_to_sheet(summaryData);
            wsSummary['!cols'] = [{ wch: 30 }, { wch: 20 }];
            const rangeSummary = xlsx.utils.decode_range(wsSummary['!ref']);
            // Make "Summary" header bold (row 0)
            for (let C = rangeSummary.s.c; C <= rangeSummary.e.c; ++C) {
                const address = xlsx.utils.encode_cell({ r: 0, c: C });
                if (wsSummary[address]) wsSummary[address].s = boldStyle;
            }
            // Make "Time Summary" header bold (row 8)
            for (let C = rangeSummary.s.c; C <= rangeSummary.e.c; ++C) {
                const address = xlsx.utils.encode_cell({ r: 8, c: C });
                if (wsSummary[address]) wsSummary[address].s = boldStyle;
            }
            xlsx.utils.book_append_sheet(wb, wsSummary, 'Summary');
        }

        const allDatesInRange = eachDayOfInterval(dateRange);
        const dateHeaders = allDatesInRange.map(date => format(date, 'MMM dd, EEE'));
        const musterHeaders = ['Employee Code', 'Employee Name', ...dateHeaders];
        const logsByEmployeeAndDate = data.reduce((acc, row) => {
            if (!acc[row.employeeId]) acc[row.employeeId] = {};
            acc[row.employeeId][row.date] = { status: row.status };
            return acc;
        }, {});
        const getMusterStatus = (dayLog, date) => {
            if (dayLog) {
                if (dayLog.status === 'Present' || dayLog.status === 'Late') return 'P';
                if (dayLog.status === 'On Leave') return 'OL';
                if (dayLog.status === 'N/A') return 'N/A';
                if (dayLog.status === 'Holiday') return 'H';
                if (dayLog.status === 'Weekend') return 'W';
                return dayLog.status.charAt(0);
            }
            const dayOfWeek = date.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) return 'W';
            return 'A';
        };
        const musterRows = selectedEmployees.map(employee => {
            const rowData = [employee.employeeCode, employee.fullName];
            const employeeLogs = logsByEmployeeAndDate[employee._id] || {};
            allDatesInRange.forEach(date => {
                const dateStr = format(date, 'yyyy-MM-dd');
                const dayLog = employeeLogs[dateStr];
                rowData.push(getMusterStatus(dayLog, date));
            });
            return rowData;
        });
        const ws2 = xlsx.utils.aoa_to_sheet([musterHeaders, ...musterRows]);
        ws2['!cols'] = [ { wch: 15 }, { wch: 25 }, ...dateHeaders.map(() => ({ wch: 15 }))];
        const range2 = xlsx.utils.decode_range(ws2['!ref']);
        for (let C = range2.s.c; C <= range2.e.c; ++C) { const address = xlsx.utils.encode_cell({ r: 0, c: C }); if (ws2[address]) ws2[address].s = boldStyle; }
        xlsx.utils.book_append_sheet(wb, ws2, 'Muster Roll');
        
        reportName = 'Attendance';

    } else if (reportType === 'leaves') {
        const leaveWorksheetData = data
            .filter(row => row.recordType !== 'absent')
            .map(row => {
                const mapped = mapLeaveReportRow(row);
                return {
                    'Date': mapped.date,
                    'Employee Code': mapped.employeeCode,
                    'Employee Name': mapped.employeeName,
                    'Type': mapped.type,
                    'Status': mapped.status,
                    'Reason': mapped.reason
                };
            });
        const ws = xlsx.utils.json_to_sheet(leaveWorksheetData);
        ws['!cols'] = [ { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 40 }];
        const range = xlsx.utils.decode_range(ws['!ref']);
        for (let C = range.s.c; C <= range.e.c; ++C) { const address = xlsx.utils.encode_cell({ r: 0, c: C }); if (ws[address]) ws[address].s = boldStyle; }
        xlsx.utils.book_append_sheet(wb, ws, 'Leave Report');
        reportName = 'Leave';
    } else if (reportType === 'notes') {
        const notesWorksheetData = data.map(row => ({
            'Date': row.date,
            'Employee Code': row.employeeCode,
            'Employee Name': row.employeeName,
            'Status': row.status,
            'Shift': row.shiftName,
            'Clock In': row.clockInTime ? format(new Date(row.clockInTime), 'p') : 'N/A',
            'Clock Out': row.clockOutTime ? format(new Date(row.clockOutTime), 'p') : 'N/A',
            'Notes': row.notes,
            'Created At': format(new Date(row.createdAt), 'yyyy-MM-dd HH:mm'),
            'Updated At': format(new Date(row.updatedAt), 'yyyy-MM-dd HH:mm')
        }));
        const ws = xlsx.utils.json_to_sheet(notesWorksheetData);
        ws['!cols'] = [ { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 60 }, { wch: 20 }, { wch: 20 }];
        const range = xlsx.utils.decode_range(ws['!ref']);
        for (let C = range.s.c; C <= range.e.c; ++C) { const address = xlsx.utils.encode_cell({ r: 0, c: C }); if (ws[address]) ws[address].s = boldStyle; }
        xlsx.utils.book_append_sheet(wb, ws, 'Attendance Notes');
        reportName = 'Notes';
    }
    
    const period = getReportPeriod(dateRange);
    const employeeName = selectedEmployees.length === 1 ? selectedEmployees[0].fullName.replace(/\s/g, '_') : 'Employees';
    xlsx.writeFile(wb, `${employeeName}_${reportName}_${period}.xlsx`);
};

// Generate PDF for Activity Logs
const generateActivityLogsPdf = async (logs, dateRange) => {
    const { jsPDF, autoTable } = await loadJsPDFWithAutoTable();
    const doc = new jsPDF({ orientation: 'landscape' });
    const title = 'Activity Logs Report';
    const head = [['Date', 'Time', 'User', 'Employee Code', 'Type', 'Category', 'Priority', 'Message', 'Read Status']];
    
    const body = logs.map(log => [
        log.date,
        log.time,
        log.user,
        log.employeeCode,
        log.type,
        log.category,
        log.priority,
        log.message.length > 50 ? log.message.substring(0, 50) + '...' : log.message,
        log.read
    ]);
    
    doc.setFontSize(16);
    doc.text(title, 14, 22);
    doc.setFontSize(10);
    doc.text(`Period: ${format(dateRange.start, 'MMM dd, yyyy')} - ${format(dateRange.end, 'MMM dd, yyyy')}`, 14, 30);
    doc.text(`Total Logs: ${logs.length}`, 14, 36);
    
    autoTable(doc, {
        head: head,
        body: body,
        startY: 45,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [215, 58, 73] },
        columnStyles: {
            7: { cellWidth: 60 } // Message column wider
        }
    });
    
    const period = getReportPeriod(dateRange);
    doc.save(`Activity_Logs_${period}.pdf`);
};

const ReportCard = memo(({ title, description, icon, onPdfClick, onExcelClick, disabled, children, xs = 12, md = 6, lg = 3 }) => (
    <Grid item xs={xs} md={md} lg={lg}>
        <Card className="report-card" elevation={0}>
            <CardContent className="report-card-content">
                <Box className="report-card-header">
                    <Box className="report-icon-container">
                        {icon}
                    </Box>
                    <Box className="report-card-text">
                        <Typography variant="h6" className="report-card-title">
                            {title}
                        </Typography>
                        <Typography variant="body2" className="report-card-description">
                            {description}
                        </Typography>
                    </Box>
                </Box>
                {children && (
                    <>
                        <Divider className="report-card-divider" />
                        <Box className="report-card-children">
                            {children}
                        </Box>
                    </>
                )}
                <Box className="report-card-spacer" />
            </CardContent>
            <CardActions className="report-card-actions" disableSpacing>
                <Button 
                    variant="outlined" 
                    size="small"
                    className="report-action-button report-pdf-button"
                    onClick={onPdfClick} 
                    disabled={disabled}
                    startIcon={<PictureAsPdfIcon />}
                >
                    Export PDF
                </Button>
                <Button 
                    variant="contained" 
                    size="small"
                    className="report-action-button report-excel-button"
                    onClick={onExcelClick} 
                    disabled={disabled}
                    startIcon={<TableChartIcon />}
                >
                    Export Excel
                </Button>
            </CardActions>
        </Card>
    </Grid>
));


const ReportsPage = () => {
    // ... (State and other functions are unchanged)
    const [employees, setEmployees] = useState([]);
    const [selectedEmployees, setSelectedEmployees] = useState([]);
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    const [leaveStatus, setLeaveStatus] = useState('All');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchEmployees = async () => {
            try {
                const { data } = await api.get('/admin/employees?all=true');
                setEmployees(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error('Error fetching employees:', err);
                setError('Could not load employee list.');
            }
        };
        fetchEmployees();
    }, []);

    const handleDownload = useCallback(async (reportType, formatType) => {
        // Special handling for activity logs - doesn't require employee selection
        if (reportType === 'activity-logs') {
            if (!startDate || !endDate) {
                setError('Please select a date range.');
                return;
            }
            setLoading(true);
            setError('');

            try {
                const params = {
                    startDate: format(startDate, 'yyyy-MM-dd'),
                    endDate: format(endDate, 'yyyy-MM-dd'),
                    format: formatType === 'excel' ? 'csv' : 'json'
                };
                
                const { data } = await api.get('/new-notifications/activity-logs/download', { params });
                
                if (formatType === 'excel') {
                    // For CSV, the response is already a CSV string
                    const blob = new Blob([data], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `activity_logs_${format(startDate, 'yyyy-MM-dd')}_to_${format(endDate, 'yyyy-MM-dd')}.csv`;
                    link.click();
                    window.URL.revokeObjectURL(url);
                } else if (formatType === 'pdf') {
                    // Generate PDF from the JSON data
                    const dateRange = { start: startDate, end: endDate };
                    await generateActivityLogsPdf(data.logs, dateRange);
                }
            } catch (err) {
                setError(err.response?.data?.error || 'Failed to download activity logs.');
            } finally {
                setLoading(false);
            }
            return;
        }

        // Original logic for other report types
        if (!startDate || !endDate || selectedEmployees.length === 0) {
            setError('Please select a date range and at least one employee.');
            return;
        }
        setLoading(true);
        setError('');

        const payload = {
            startDate: format(startDate, 'yyyy-MM-dd'),
            endDate: format(endDate, 'yyyy-MM-dd'),
            employeeIds: selectedEmployees.map(e => e._id),
            status: leaveStatus
        };

        try {
            const { data } = await api.post(`/admin/reports/${reportType}`, payload);
            // Leave Excel should contain leave requests only — skip attendance "Absent" rows.
            const reportData = (reportType === 'leaves' && formatType === 'excel')
                ? (data || []).filter(row => row.recordType !== 'absent')
                : data;
            if (!reportData || reportData.length === 0) {
                setError('No data found for the selected criteria.');
                setLoading(false);
                return; 
            }
            const dateRange = { start: startDate, end: endDate };
            if (formatType === 'pdf') {
                await generatePdf(reportType, reportData, selectedEmployees, dateRange);
            } else if (formatType === 'excel') {
                await generateExcel(reportType, reportData, selectedEmployees, dateRange);
            }
        } catch (err) {
            setError(err.response?.data?.error || `Failed to generate ${reportType} report.`);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, selectedEmployees, leaveStatus]);

    const handleDateRangePreset = (range) => {
        const now = new Date();
        let start, end;
        switch (range) {
            case 'this_week': start = startOfWeek(now, { weekStartsOn: 1 }); end = endOfWeek(now, { weekStartsOn: 1 }); break;
            case 'last_week': start = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }); end = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }); break;
            case 'this_month': start = startOfMonth(now); end = endOfMonth(now); break;
            case 'last_month': start = startOfMonth(subMonths(now, 1)); end = endOfMonth(subMonths(now, 1)); break;
            default: return;
        }
        setStartDate(start);
        setEndDate(end);
    };

    const handleAttendancePdfClick = useCallback(() => handleDownload('attendance', 'pdf'), [handleDownload]);
    const handleAttendanceExcelClick = useCallback(() => handleDownload('attendance', 'excel'), [handleDownload]);
    const handleLeavesPdfClick = useCallback(() => handleDownload('leaves', 'pdf'), [handleDownload]);
    const handleLeavesExcelClick = useCallback(() => handleDownload('leaves', 'excel'), [handleDownload]);
    const handleNotesPdfClick = useCallback(() => handleDownload('notes', 'pdf'), [handleDownload]);
    const handleNotesExcelClick = useCallback(() => handleDownload('notes', 'excel'), [handleDownload]);
    const handleActivityLogsPdfClick = useCallback(() => handleDownload('activity-logs', 'pdf'), [handleDownload]);
    const handleActivityLogsExcelClick = useCallback(() => handleDownload('activity-logs', 'excel'), [handleDownload]);

    const handleEmployeeSelectionChange = useCallback((event, newValue) => {
        if (newValue.some(option => option._id === 'SELECT_ALL')) {
            setSelectedEmployees(selectedEmployees.length === employees.length ? [] : employees);
        } else {
            setSelectedEmployees(newValue);
        }
    }, [employees, selectedEmployees.length]);

    const isDownloadDisabled = !startDate || !endDate || selectedEmployees.length === 0 || loading;

    return (
        <div className="reports-page">
            <PageHeroHeader
                eyebrow="Reports & Exports"
                title="Generate Reports"
                description="Export attendance, leave, and activity insights."
            />
            
            {loading && <div className="loading-overlay"><SkeletonBox width="24px" height="24px" borderRadius="50%" /></div>}
            {error && <Alert severity="error" onClose={() => setError('')} className="error-alert">{error}</Alert>}

            <Paper className="filter-card" elevation={0}>
                <Box className="filter-card-header">
                    <Box className="filter-icon-wrapper">
                        <AssessmentIcon sx={{ fontSize: 24 }} />
                    </Box>
                    <Box>
                        <Typography variant="h5" className="filter-card-title">Report Filters</Typography>
                        <Typography variant="body2" className="filter-card-subtitle">Configure your report parameters</Typography>
                    </Box>
                </Box>
                <Divider className="filter-divider" />
                <Box className="filter-fields">
                    <Box className="filter-field filter-field--date">
                        <LazyDatePicker 
                                label="Start Date" 
                                value={startDate} 
                                onChange={setStartDate} 
                                sx={{ width: '100%' }}
                                slotProps={{
                                    textField: {
                                        className: 'filter-date-picker'
                                    }
                                }}
                            />
                    </Box>
                    <Box className="filter-field filter-field--date">
                        <LazyDatePicker 
                                label="End Date" 
                                value={endDate} 
                                onChange={setEndDate} 
                                sx={{ width: '100%' }}
                                slotProps={{
                                    textField: {
                                        className: 'filter-date-picker'
                                    }
                                }}
                            />
                    </Box>
                    <Box className="filter-field filter-field--presets">
                        <Box className="date-presets-container">
                            <Typography variant="caption" className="presets-label">Quick Presets</Typography>
                            <Stack direction="row" className="date-presets" flexWrap="wrap">
                                <Button 
                                    variant="outlined" 
                                    size="small" 
                                    className="preset-button"
                                    onClick={() => handleDateRangePreset('this_week')}
                                >
                                    This Week
                                </Button>
                                <Button 
                                    variant="outlined" 
                                    size="small" 
                                    className="preset-button"
                                    onClick={() => handleDateRangePreset('last_week')}
                                >
                                    Last Week
                                </Button>
                                <Button 
                                    variant="outlined" 
                                    size="small" 
                                    className="preset-button"
                                    onClick={() => handleDateRangePreset('this_month')}
                                >
                                    This Month
                                </Button>
                                <Button 
                                    variant="outlined" 
                                    size="small" 
                                    className="preset-button"
                                    onClick={() => handleDateRangePreset('last_month')}
                                >
                                    Last Month
                                </Button>
                            </Stack>
                        </Box>
                    </Box>
                    <Box className="filter-field filter-field--employees">
                        <Autocomplete
                            multiple
                            options={[selectAllOption, ...employees]}
                            getOptionLabel={(option) => {
                                if (!option) return '';
                                if (option._id === 'SELECT_ALL') return option.fullName || 'Select All Employees';
                                return option.fullName || option.employeeCode || '';
                            }}
                            value={selectedEmployees}
                            disableCloseOnSelect={false}
                            onChange={handleEmployeeSelectionChange}
                            filterOptions={(options, params) => {
                                const { inputValue } = params;
                                if (!inputValue || inputValue.trim() === '') {
                                    // Show all options when search is empty, with Select All at top
                                    return options;
                                }
                                const filtered = options.filter((option) => {
                                    if (option._id === 'SELECT_ALL') return true; // Always show Select All
                                    const searchLower = inputValue.toLowerCase().trim();
                                    const nameMatch = (option.fullName || '').toLowerCase().includes(searchLower);
                                    const codeMatch = (option.employeeCode || '').toLowerCase().includes(searchLower);
                                    return nameMatch || codeMatch;
                                });
                                // Keep "Select All" at top if it exists
                                const selectAll = filtered.find(opt => opt._id === 'SELECT_ALL');
                                const others = filtered.filter(opt => opt._id !== 'SELECT_ALL');
                                return selectAll ? [selectAll, ...others] : others;
                            }}
                            renderInput={(params) => (
                                <TextField 
                                    {...params} 
                                    label="Select Employees" 
                                    className="employee-select-input"
                                    placeholder={selectedEmployees.length === 0 ? "Search by name or employee ID" : ""}
                                />
                            )}
                            renderOption={(props, option, { selected }) => {
                                const { key, ...otherProps } = props;
                                const isSelectAll = option._id === 'SELECT_ALL';
                                const getInitial = (name) => {
                                    if (!name) return '?';
                                    return name.charAt(0).toUpperCase();
                                };
                                
                                return (
                                    <li key={key} {...otherProps} className={`employee-option ${isSelectAll ? 'select-all-option' : ''}`}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                                            {!isSelectAll && (
                                                <Avatar 
                                                    sx={{ 
                                                        width: 28, 
                                                        height: 28, 
                                                        bgcolor: '#e0e0e0',
                                                        color: '#666',
                                                        fontSize: '14px',
                                                        fontWeight: 500,
                                                        flexShrink: 0
                                                    }}
                                                >
                                                    {getInitial(option.fullName)}
                                                </Avatar>
                                            )}
                                            {isSelectAll && (
                                                <Box sx={{ width: 28, flexShrink: 0 }} />
                                            )}
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Typography
                                                    className="employee-name-text"
                                                    sx={{
                                                        fontWeight: selected ? 700 : (isSelectAll ? 600 : 500),
                                                        fontSize: '14px',
                                                        lineHeight: 1.5,
                                                        color: '#1a1a1a',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                >
                                                    {option.fullName || 'Select All Employees'}
                                                </Typography>
                                                {!isSelectAll && option.employeeCode && (
                                                    <Typography
                                                        className="employee-code-text"
                                                        sx={{
                                                            fontSize: '12px',
                                                            color: '#666',
                                                            marginTop: '2px',
                                                            fontWeight: 400,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        (#{option.employeeCode})
                                                    </Typography>
                                                )}
                                                {isSelectAll && (
                                                    <Typography
                                                        className="employee-code-text"
                                                        sx={{
                                                            fontSize: '12px',
                                                            color: '#666',
                                                            marginTop: '2px',
                                                            fontWeight: 400
                                                        }}
                                                    >
                                                        Select all employees at once
                                                    </Typography>
                                                )}
                                            </Box>
                                        </Box>
                                    </li>
                                );
                            }}
                            renderTags={(value, getTagProps) => {
                                if (value.length === 0) return null;
                                const renderChip = (label, index) => {
                                    const { key, ...tagProps } = getTagProps({ index });
                                    return <Chip key={key} label={label} {...tagProps} className="employee-chip" />;
                                };
                                if (value.length === employees.length && employees.length > 0) {
                                    return renderChip("All Employees Selected", 0);
                                }
                                if (value.length > 3) {
                                    return renderChip(`${value.length} Employees Selected`, 0);
                                }
                                return value.map((option, index) => renderChip(option.fullName, index));
                            }}
                            ListboxProps={{
                                className: 'employee-listbox'
                            }}
                            className="employee-autocomplete"
                            sx={{ width: '100%' }}
                            slotProps={{
                                popper: {
                                    className: 'employee-autocomplete-popper',
                                    placement: 'bottom-start',
                                    modifiers: [
                                        {
                                            name: 'offset',
                                            options: {
                                                offset: [0, 4]
                                            }
                                        },
                                        {
                                            name: 'flip',
                                            enabled: true
                                        },
                                        {
                                            name: 'preventOverflow',
                                            enabled: true
                                        }
                                    ]
                                },
                                paper: {
                                    className: 'employee-autocomplete-paper',
                                    elevation: 8
                                }
                            }}
                        />
                    </Box>
                </Box>
            </Paper>

            <Grid container spacing={2.5} className="reports-grid-container">
                <ReportCard 
                    title="Attendance & Break Report" 
                    description="Detailed attendance logs with work hours and break times"
                    icon={<AssessmentIcon />}
                    onPdfClick={handleAttendancePdfClick} 
                    onExcelClick={handleAttendanceExcelClick} 
                    disabled={isDownloadDisabled}
                />
                <ReportCard 
                    title="Leave Request Report" 
                    description="Employee leave requests, approval status, and absent days"
                    icon={<EventNoteIcon />}
                    onPdfClick={handleLeavesPdfClick} 
                    onExcelClick={handleLeavesExcelClick} 
                    disabled={isDownloadDisabled}
                >
                    <FormControl fullWidth className="report-card-filter">
                        <InputLabel>Status</InputLabel>
                        <Select value={leaveStatus} label="Status" onChange={(e) => setLeaveStatus(e.target.value)}>
                            <MenuItem value="All">All</MenuItem>
                            <MenuItem value="Pending">Pending</MenuItem>
                            <MenuItem value="Approved">Approved</MenuItem>
                            <MenuItem value="Rejected">Rejected</MenuItem>
                        </Select>
                    </FormControl>
                </ReportCard>
                <ReportCard 
                    title="Attendance Notes Report" 
                    description="Employee notes and comments from attendance summary"
                    icon={<DescriptionIcon />}
                    onPdfClick={handleNotesPdfClick} 
                    onExcelClick={handleNotesExcelClick} 
                    disabled={isDownloadDisabled}
                />
                <ReportCard 
                    title="Activity Logs Report" 
                    description="System activity logs and user actions"
                    icon={<HistoryIcon />}
                    onPdfClick={handleActivityLogsPdfClick} 
                    onExcelClick={handleActivityLogsExcelClick} 
                    disabled={isDownloadDisabled}
                />
            </Grid>
        </div>
    );
};

export default ReportsPage;