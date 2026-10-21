import React, { useState, useEffect, useMemo } from 'react';
import { Typography, TextField, FormControl, InputLabel, Select, MenuItem, Button, IconButton, Avatar, Alert } from '@mui/material';
import {
  ArrowBack,
  ArrowLeft,
  ArrowRight,
  CalendarMonth,
  Download,
  Search
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from '../api/axios';
import PageHeroHeader from '../components/PageHeroHeader';
import { getISTDateString } from '../utils/istTime';
import { loadJsPDFWithAutoTable } from '../utils/lazyLibraries';

import { SkeletonBox } from '../components/SkeletonLoaders';
import { filterActiveEmployees } from '../utils/employeeFilterUtils';
import '../styles/EmployeeMusterRollPage.css';

const STATUS = {
  P: { code: 'P', label: 'Present', color: '#1e8e4e', bgColor: '#eafaf1' },
  A: { code: 'A', label: 'Absent', color: '#d32f2f', bgColor: '#ffeaea' },
  HD: { code: 'HD', label: 'Half Day', color: '#c62828', bgColor: '#ffebee' },
  HF: { code: 'HF', label: 'Half Day Leave', color: '#1e88e5', bgColor: '#e3f2fd' },
  FF: { code: 'FF', label: 'Full Day Leave', color: '#1e88e5', bgColor: '#e3f2fd' },
  L: { code: 'L', label: 'Leave', color: '#d32f2f', bgColor: '#ffeaea' },
  LOP: { code: 'LOP', label: 'Loss of Pay', color: '#721c24', bgColor: '#f8d7da' },
  HL: { code: 'HL', label: 'Holiday', color: '#6c5ce7', bgColor: '#f0f0ff' },
  W: { code: 'W', label: 'Weekend', color: '#b8860b', bgColor: '#fff8e1' },
  NA: { code: 'N/A', label: 'N/A', color: '#6c757d', bgColor: '#f4f6f8' },
};

const joiningDateKey = (employee) => {
  const sourceDate = employee?.joiningDate || employee?.createdAt;
  if (!sourceDate) return null;
  return getISTDateString(new Date(sourceDate));
};

/** Map the attendance summary payload (same source as the summary page) onto muster codes. */
const musterStatusFromSummary = (entry, dateKey, employee) => {
  const todayKey = getISTDateString(new Date());
  if (dateKey > todayKey) return STATUS.NA;

  const startKey = joiningDateKey(employee);
  if (startKey && dateKey < startKey) return STATUS.NA;

  if (!entry) return dateKey < todayKey ? STATUS.A : STATUS.NA;

  const leaveType = entry.leaveInfo?.leaveType || '';
  const requestType = entry.leaveInfo?.requestType || '';
  const halfDayLeave = entry.hasHalfDayLeave
    || leaveType === 'Half Day - First Half'
    || leaveType === 'Half Day - Second Half'
    || String(leaveType).startsWith('Half Day');

  if (entry.isHoliday || entry.attendanceStatus === 'Holiday') {
    return { ...STATUS.HL, label: entry.holidayInfo?.name ? `Holiday - ${entry.holidayInfo.name}` : STATUS.HL.label };
  }
  if (entry.isWeeklyOff || entry.attendanceStatus === 'Weekly Off') return STATUS.W;
  if (halfDayLeave) return { ...STATUS.HF, label: leaveType || STATUS.HF.label };
  if (entry.isLeave || entry.attendanceStatus === 'Leave') {
    const lossOfPay = String(requestType).toLowerCase().includes('loss of pay');
    if (lossOfPay) {
      return STATUS.LOP;
    }
    if (leaveType === 'Full Day') return STATUS.FF;
    return { ...STATUS.L, label: requestType ? `Leave - ${requestType}` : STATUS.L.label };
  }
  if (entry.isHalfDay || entry.attendanceStatus === 'Half-day' || entry.attendanceStatus === 'Half Day') {
    return { ...STATUS.HD, label: entry.halfDayReason || STATUS.HD.label };
  }
  if (entry.attendanceStatus === 'On-time' || entry.attendanceStatus === 'Late' || entry.attendanceStatus === 'Present') {
    return STATUS.P;
  }
  if (entry.isAbsent || entry.attendanceStatus === 'Absent') return STATUS.A;
  return STATUS.NA;
};

const EmployeeMusterRollPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [musterCodes, setMusterCodes] = useState({});
  const [departments, setDepartments] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  
  // Filters
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Get month start and end dates
  const monthStart = useMemo(() => {
    return new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  }, [selectedMonth]);

  const monthEnd = useMemo(() => {
    return new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
  }, [selectedMonth]);

  // Get all days in the month
  const monthDays = useMemo(() => {
    const days = [];
    const current = new Date(monthStart);
    while (current <= monthEnd) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [monthStart, monthEnd]);

  // One request for the whole month. Search and filters stay on the client.
  useEffect(() => {
    let cancelled = false;

    const fetchMuster = async () => {
      if (!user || !['Admin', 'HR'].includes(user.role)) {
        setError('Access denied. This page requires Admin or HR role.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await axios.get('/attendance/muster', {
          params: {
            startDate: getISTDateString(monthStart),
            endDate: getISTDateString(monthEnd),
          },
        });
        if (cancelled) return;
        const list = filterActiveEmployees(Array.isArray(response.data?.employees) ? response.data.employees : []);
        setEmployees(list);
        setMusterCodes(response.data?.codes || {});
        const deptSet = new Set(list.map((emp) => emp.department).filter(Boolean));
        setDepartments([...deptSet]);
      } catch (fetchError) {
        if (cancelled) return;
        console.error('Error fetching muster roll:', fetchError);
        if (fetchError.response?.status === 403) {
          setError('Access denied. This page requires Admin or HR role.');
        } else {
          setError('Failed to fetch attendance data');
        }
        setEmployees([]);
        setMusterCodes({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchMuster();
    return () => {
      cancelled = true;
    };
  }, [monthStart, monthEnd, user]);

  // Filter employees based on search and department (exclude admin accounts)
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      // Exclude admin accounts
      if (emp.role === 'Admin') {
        return false;
      }
      const matchesSearch = !searchTerm || 
        emp.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.employeeCode.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDepartment = !selectedDepartment || emp.department === selectedDepartment;
      const matchesEmployee = !selectedEmployee || emp._id === selectedEmployee;
      return matchesSearch && matchesDepartment && matchesEmployee;
    });
  }, [employees, searchTerm, selectedDepartment, selectedEmployee]);

  const statusByCode = useMemo(() => {
    const map = {};
    Object.values(STATUS).forEach((status) => {
      map[status.code] = status;
    });
    return map;
  }, []);

  const getAttendanceStatusForEmployee = (employeeId, date) => {
    const employee = employees.find((emp) => emp._id === employeeId);
    const dateKey = getISTDateString(date);
    const code = musterCodes[employeeId]?.[dateKey];
    if (code && statusByCode[code]) return statusByCode[code];
    return musterStatusFromSummary(null, dateKey, employee);
  };

  const isEmployeeExpectedToWork = (employee, date) => {
    const dateKey = getISTDateString(date);
    const code = musterCodes[employee._id]?.[dateKey];
    if (!code || code === 'N/A' || code === 'HL' || code === 'W' || code === 'L' || code === 'FF' || code === 'LOP') {
      return false;
    }
    return true;
  };

  // Calculate summary counts for each day
  const getDailySummary = useMemo(() => {
    const summary = {};
    
    monthDays.forEach(day => {
      const dayString = getISTDateString(day);
      let presentCount = 0;
      let absentCount = 0;
      let totalWorkingEmployees = 0;
      
      filteredEmployees.forEach(employee => {
        const status = getAttendanceStatusForEmployee(employee._id, day);
        
        // Only count employees who should be working on this day
        const shouldBeWorking = isEmployeeExpectedToWork(employee, day);
        
        if (shouldBeWorking) {
          totalWorkingEmployees++;
          
          if (status.code === 'P') {
            presentCount++;
          } else if (status.code === 'A') {
            absentCount++;
          }
        }
      });
      
      summary[dayString] = {
        present: presentCount,
        absent: absentCount,
        total: totalWorkingEmployees,
        presentPercentage: totalWorkingEmployees > 0 ? Math.round((presentCount / totalWorkingEmployees) * 100) : 0
      };
    });
    
    return summary;
  }, [filteredEmployees, monthDays, musterCodes, employees]);

  const handleExport = async () => {
    if (exporting || loading) return;
    setExporting(true);
    setExportError('');

    try {
      const { jsPDF, autoTable } = await loadJsPDFWithAutoTable();
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 8;
      const employeeCol = 48;
      const sumCol = 18;
      const dayCol = (pageWidth - margin * 2 - employeeCol - sumCol) / Math.max(monthDays.length, 1);
      const hexToRgb = (hex) => {
        const value = hex.replace('#', '');
        return [
          parseInt(value.slice(0, 2), 16),
          parseInt(value.slice(2, 4), 16),
          parseInt(value.slice(4, 6), 16),
        ];
      };

      const head = [[
        'Employee',
        ...monthDays.map((day) => `${day.getDate()}\n${day.toLocaleDateString('en-US', { weekday: 'short' })}`),
        'Sum',
      ]];

      const body = filteredEmployees.map((employee) => {
        let presentDays = 0;
        let absentDays = 0;
        let workingDays = 0;
        const dayCells = monthDays.map((day) => {
          const status = getAttendanceStatusForEmployee(employee._id, day);
          if (status.code === 'P') presentDays += 1;
          if (status.code === 'A') absentDays += 1;
          if (isEmployeeExpectedToWork(employee, day)) workingDays += 1;
          return {
            content: status.code,
            styles: {
              fillColor: hexToRgb(status.bgColor),
              textColor: hexToRgb(status.color),
              fontStyle: 'bold',
            },
          };
        });
        const percentage = workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 0;
        return [
          { content: `${employee.employeeCode || ''}\n${employee.fullName || ''}`, styles: { halign: 'left', fontStyle: 'bold', textColor: [31, 41, 55] } },
          ...dayCells,
          { content: `${presentDays} / ${absentDays}\n${percentage}%`, styles: { fillColor: [248, 249, 251], textColor: [31, 41, 55], fontStyle: 'bold' } },
        ];
      });

      body.push([
        { content: 'Daily summary', styles: { halign: 'left', fontStyle: 'bold', textColor: [192, 57, 43], fillColor: [248, 249, 251] } },
        ...monthDays.map((day) => {
          const summary = getDailySummary[getISTDateString(day)] || { present: 0, absent: 0 };
          return {
            content: `${summary.present}\n${summary.absent}`,
            styles: { fillColor: [248, 249, 251], textColor: [31, 41, 55], fontStyle: 'bold' },
          };
        }),
        {
          content: `${monthTotals.present} / ${monthTotals.absent}\n${monthTotals.percentage}%`,
          styles: { fillColor: [232, 241, 251], textColor: [31, 41, 55], fontStyle: 'bold' },
        },
      ]);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(44, 62, 80);
      doc.text(`Employee Muster Roll — ${monthLabel}`, margin, 12);
      doc.setDrawColor(52, 152, 219);
      doc.setLineWidth(0.7);
      doc.line(margin, 14.5, margin + 72, 14.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(90, 98, 104);
      doc.text(legendItems.map((item) => item.label).join('     '), margin, 19);

      autoTable(doc, {
        startY: 23,
        head,
        body,
        theme: 'grid',
        margin: { top: 12, left: margin, right: margin, bottom: 10 },
        tableWidth: pageWidth - margin * 2,
        showHead: 'everyPage',
        rowPageBreak: 'avoid',
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: 1.3,
          halign: 'center',
          valign: 'middle',
          overflow: 'linebreak',
          lineColor: [225, 229, 235],
          lineWidth: 0.15,
          minCellHeight: 8,
        },
        headStyles: {
          fillColor: [248, 249, 251],
          textColor: [192, 57, 43],
          fontStyle: 'bold',
          fontSize: 8,
          valign: 'middle',
        },
        columnStyles: {
          0: { cellWidth: employeeCol, halign: 'left' },
          [monthDays.length + 1]: { cellWidth: sumCol },
          ...Object.fromEntries(monthDays.map((_, index) => [index + 1, { cellWidth: dayCol }])),
        },
        didParseCell: (data) => {
          if (data.section === 'head' && data.column.index > 0 && data.column.index <= monthDays.length) {
            const day = monthDays[data.column.index - 1];
            if (day.getDay() === 0 || day.getDay() === 6) {
              data.cell.styles.fillColor = [255, 248, 225];
            }
          }
        },
        didDrawPage: (data) => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(120, 128, 136);
          doc.text(
            `Page ${data.pageNumber}`,
            pageWidth - margin,
            pageHeight - 4,
            { align: 'right' }
          );
        },
      });

      const fileMonth = getISTDateString(monthStart).slice(0, 7);
      doc.save(`Employee_Muster_Roll_${fileMonth}.pdf`);
    } catch (exportFailure) {
      console.error('Muster roll export failed:', exportFailure);
      setExportError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handlePreviousMonth = () => {
    const newDate = new Date(selectedMonth);
    newDate.setMonth(newDate.getMonth() - 1);
    setSelectedMonth(newDate);
  };

  const handleNextMonth = () => {
    const newDate = new Date(selectedMonth);
    newDate.setMonth(newDate.getMonth() + 1);
    setSelectedMonth(newDate);
  };

  const monthLabel = selectedMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });

  const monthTotals = useMemo(() => {
    const days = Object.values(getDailySummary);
    const present = days.reduce((sum, day) => sum + day.present, 0);
    const absent = days.reduce((sum, day) => sum + day.absent, 0);
    const working = days.reduce((sum, day) => sum + day.total, 0);
    return {
      present,
      absent,
      percentage: working > 0 ? Math.round((present / working) * 100) : 0
    };
  }, [getDailySummary]);

  const legendItems = [
    { label: 'P Present', color: '#1e8e4e', bg: '#eafaf1' },
    { label: 'HD Half day', color: '#c62828', bg: '#ffebee' },
    { label: 'A Absent', color: '#d32f2f', bg: '#ffeaea' },
    { label: 'HL Holiday', color: '#6c5ce7', bg: '#f0f0ff' },
    { label: 'W Weekend', color: '#b8860b', bg: '#fff8e1' },
    { label: 'HF Half day', color: '#1e88e5', bg: '#e3f2fd' },
    { label: 'FF Full day', color: '#1e88e5', bg: '#e3f2fd' },
    { label: 'L Leave', color: '#d32f2f', bg: '#ffeaea' },
    { label: 'N/A', color: '#6c757d', bg: '#f4f6f8' }
  ];

  return (
    <div className="muster-roll-page">
      <PageHeroHeader
        eyebrow="Attendance"
        title="Employee Muster Roll"
        description="Monthly attendance status for every employee."
        icon={<CalendarMonth />}
        actionArea={(
          <>
            <IconButton className="muster-back" onClick={() => navigate(-1)} aria-label="Back">
              <ArrowBack />
            </IconButton>
            <Button
              className="muster-export"
              variant="contained"
              startIcon={<Download />}
              onClick={handleExport}
              disabled={exporting || loading}
            >
              {exporting ? 'Exporting...' : 'Export'}
            </Button>
          </>
        )}
      />

      <div className="muster-toolbar">
        <div className="muster-month">
          <IconButton onClick={handlePreviousMonth} size="small" aria-label="Previous month">
            <ArrowLeft />
          </IconButton>
          <Typography className="muster-month-label">{monthLabel}</Typography>
          <IconButton onClick={handleNextMonth} size="small" aria-label="Next month">
            <ArrowRight />
          </IconButton>
        </div>
        <TextField
          className="muster-search"
          placeholder="Search employees..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <Search sx={{ mr: 1, color: '#d32f2f', fontSize: 20 }} />
          }}
          size="small"
        />
        <FormControl className="muster-filter" size="small">
          <InputLabel>Department</InputLabel>
          <Select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            label="Department"
          >
            <MenuItem value="">All Departments</MenuItem>
            {departments.map((dept) => (
              <MenuItem key={dept} value={dept}>{dept}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl className="muster-filter" size="small">
          <InputLabel>Employee</InputLabel>
          <Select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            label="Employee"
          >
            <MenuItem value="">All Employees</MenuItem>
            {employees.map((emp) => (
              <MenuItem key={emp._id} value={emp._id}>
                {emp.fullName} ({emp.employeeCode})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </div>

      {exportError && <Alert severity="error">{exportError}</Alert>}

      <section className="muster-card">
        {loading ? (
          <div className="muster-loading">
            <SkeletonBox width="24px" height="24px" borderRadius="50%" />
          </div>
        ) : error ? (
          <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>
        ) : (
          <div className="muster-scroll">
            <table className="muster-table">
              <colgroup>
                <col className="muster-col-employee" />
                {monthDays.map((day) => (
                  <col key={day.toISOString()} className="muster-col-day" />
                ))}
                <col className="muster-col-summary" />
              </colgroup>
              <thead>
                <tr>
                  <th className="muster-sticky">Employee</th>
                  {monthDays.map((day) => {
                    const weekend = day.getDay() === 0 || day.getDay() === 6;
                    return (
                      <th key={day.toISOString()} className={weekend ? 'is-weekend' : undefined}>
                        <div className="muster-day-head">
                          <span className="muster-day-num">{day.getDate()}</span>
                          <span className="muster-day-dow">
                            {day.toLocaleDateString('en-US', { weekday: 'short' })}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                  <th title="Present, absent, and attendance percentage">Sum</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td className="muster-empty" colSpan={monthDays.length + 2}>
                      No employees match the current filters.
                    </td>
                  </tr>
                ) : filteredEmployees.map((employee) => {
                  let presentDays = 0;
                  let absentDays = 0;
                  let workingDays = 0;
                  const cells = monthDays.map((day) => {
                    const status = getAttendanceStatusForEmployee(employee._id, day);
                    if (status.code === 'P') presentDays += 1;
                    if (status.code === 'A') absentDays += 1;
                    if (isEmployeeExpectedToWork(employee, day)) workingDays += 1;
                    return { day, status };
                  });
                  const percentage = workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 0;

                  return (
                    <tr key={employee._id}>
                      <td className="muster-sticky">
                        <div className="muster-employee">
                          <Avatar sx={{ width: 34, height: 34, fontSize: 15, bgcolor: '#2c3e50' }}>
                            {employee.fullName.charAt(0)}
                          </Avatar>
                          <div className="muster-employee-text">
                            <span className="muster-employee-code">{employee.employeeCode}</span>
                            <span className="muster-employee-name">{employee.fullName}</span>
                          </div>
                        </div>
                      </td>
                      {cells.map(({ day, status }) => (
                        <td
                          key={day.toISOString()}
                          className="muster-status"
                          title={`${day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${status.label}`}
                          style={{ backgroundColor: status.bgColor, color: status.color }}
                        >
                          {status.code}
                        </td>
                      ))}
                      <td
                        className="muster-summary-cell"
                        title={`Present ${presentDays}, Absent ${absentDays}, ${percentage}%`}
                      >
                        <div className="muster-mini-sum">
                          <span className="p">{presentDays}</span>
                          <span className="a">{absentDays}</span>
                          <span className="pct">{percentage}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="muster-summary-row">
                  <td className="muster-sticky">Daily summary</td>
                  {monthDays.map((day) => {
                    const dayString = getISTDateString(day);
                    const summary = getDailySummary[dayString] || { present: 0, absent: 0, presentPercentage: 0 };
                    return (
                      <td
                        key={day.toISOString()}
                        title={`${summary.present} present, ${summary.absent} absent, ${summary.presentPercentage}%`}
                      >
                        <div className="muster-mini-sum">
                          <span className="p">{summary.present}</span>
                          <span className="a">{summary.absent}</span>
                        </div>
                      </td>
                    );
                  })}
                  <td
                    className="muster-total-cell"
                    title={`Present ${monthTotals.present}, Absent ${monthTotals.absent}, ${monthTotals.percentage}%`}
                  >
                    <div className="muster-mini-sum">
                      <span className="p">{monthTotals.present}</span>
                      <span className="a">{monthTotals.absent}</span>
                      <span className="pct">{monthTotals.percentage}%</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="muster-legend">
          <span className="muster-legend-label">Legend</span>
          {legendItems.map((item) => (
            <span
              key={item.label}
              className="muster-chip"
              style={{ color: item.color, backgroundColor: item.bg }}
            >
              {item.label}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
};

export default EmployeeMusterRollPage;
