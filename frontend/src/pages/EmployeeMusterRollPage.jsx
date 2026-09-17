import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Card, CardContent, Grid, TextField, FormControl, InputLabel, Select, MenuItem, Button, IconButton, Table, TableHead, TableBody, TableRow, TableCell, Avatar, Chip, Alert, Divider } from '@mui/material';
import {
  ArrowBack,
  ArrowLeft,
  ArrowRight,
  Download,
  FilterList,
  MoreVert,
  Search
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAttendanceStatus } from '../utils/saturdayUtils';
import axios from '../api/axios';

import { SkeletonBox } from '../components/SkeletonLoaders';
import { filterActiveEmployees } from '../utils/employeeFilterUtils';
const EmployeeMusterRollPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [departments, setDepartments] = useState([]);
  
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

  // Fetch employees first
  useEffect(() => {
    fetchEmployees();
    fetchHolidays();
    fetchLeaves();
  }, []);

  // Fetch attendance data after employees are loaded
  useEffect(() => {
    if (employees.length > 0) {
      fetchAttendanceData();
    }
  }, [selectedMonth, selectedEmployee, selectedDepartment, employees]);

  const fetchEmployees = async () => {
    try {
      const response = await axios.get('/admin/employees?all=true');
      const employeesData = response.data;
      // Filter out Admin accounts and inactive users (defensive filtering: backend should already filter)
      const nonAdminEmployees = filterActiveEmployees(Array.isArray(employeesData) ? employeesData : []);
      setEmployees(nonAdminEmployees);
      
      // Extract unique departments
      const deptSet = new Set(nonAdminEmployees.map(emp => emp.department).filter(Boolean));
      setDepartments([...deptSet]);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchAttendanceData = async () => {
    try {
      setLoading(true);
      
      // Check if user has permission
      if (!user || !['Admin', 'HR'].includes(user.role)) {
        setError('Access denied. This page requires Admin or HR role.');
        return;
      }
      
      // Get employees to fetch data for
      const employeesToFetch = selectedEmployee 
        ? employees.filter(emp => emp._id === selectedEmployee)
        : employees;
      
      // Don't make request if no employees
      if (employeesToFetch.length === 0) {
        setAttendanceData([]);
        return;
      }
      
      const startDate = monthStart.toLocaleDateString('en-CA');
      const endDate = monthEnd.toLocaleDateString('en-CA');
      
      console.log('Fetching attendance data for employees:', employeesToFetch.length);
      console.log('Date range:', { startDate, endDate });
      console.log('User role:', user.role);
      
      // Fetch attendance data for each employee using the same endpoint as AdminAttendanceSummaryPage
      const attendancePromises = employeesToFetch.map(async (employee) => {
        try {
          const response = await axios.get(`/admin/attendance/user/${employee._id}?startDate=${startDate}&endDate=${endDate}`);
          const logs = Array.isArray(response.data) ? response.data : [];
          return {
            employee: employee,
            logs: logs
          };
        } catch (error) {
          console.error(`Error fetching data for employee ${employee.fullName}:`, error);
          return {
            employee: employee,
            logs: []
          };
        }
      });
      
      const attendanceResults = await Promise.all(attendancePromises);
      setAttendanceData(attendanceResults);
      
    } catch (error) {
      console.error('Error fetching attendance data:', error);
      console.error('Error details:', error.response?.data);
      console.error('Error status:', error.response?.status);
      
      if (error.response?.status === 403) {
        setError('Access denied. This page requires Admin or HR role.');
      } else {
        setError('Failed to fetch attendance data');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchHolidays = async () => {
    try {
      const response = await axios.get('/leaves/holidays');
      const holidaysData = response.data || [];
      console.log('Fetched holidays:', holidaysData);
      setHolidays(holidaysData);
    } catch (error) {
      console.error('Error fetching holidays:', error);
    }
  };

  const fetchLeaves = async () => {
    try {
      const response = await axios.get('/admin/leaves/all');
      const allLeaves = Array.isArray(response.data.requests) ? response.data.requests : [];
      
      // Filter for approved leaves only
      const approvedLeaves = allLeaves.filter(leave => leave.status === 'Approved');
      setLeaves(approvedLeaves);
    } catch (error) {
      console.error('Error fetching leaves:', error);
    }
  };

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
      return matchesSearch && matchesDepartment;
    });
  }, [employees, searchTerm, selectedDepartment]);

  const getEmployeeStartDate = (employee) => {
    if (!employee) return null;
    const sourceDate = employee.joiningDate || employee.createdAt;
    if (!sourceDate) return null;
    const start = new Date(sourceDate);
    start.setHours(0, 0, 0, 0);
    return start;
  };

  // Get attendance status for a specific employee and date using the same logic as AdminAttendanceSummaryPage
  const getAttendanceStatusForEmployee = (employeeId, date) => {
    const dateString = date.toLocaleDateString('en-CA');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentDate = new Date(date);
    currentDate.setHours(0, 0, 0, 0);
    
    // Check if it's a future date
    if (currentDate > today) {
      return { code: 'N/A', label: 'N/A', color: '#6c757d', bgColor: '#f8f9fa' };
    }
    
    // Get employee data
    const employee = employees.find(emp => emp._id === employeeId);
    if (!employee) {
      return { code: 'A', label: 'Absent', color: '#e74c3c', bgColor: '#ffeaea' };
    }

    const employeeStartDate = getEmployeeStartDate(employee);
    if (employeeStartDate && currentDate < employeeStartDate) {
      return { code: 'N/A', label: 'Not Joined', color: '#6c757d', bgColor: '#f8f9fa' };
    }
    
    // Get attendance log for this date
    const employeeData = attendanceData.find(a => a.employee._id === employeeId);
    const log = employeeData ? employeeData.logs.find(l => l.attendanceDate === dateString) : null;
    
    // Debug logging for date matching
    if (employeeData && employeeData.logs.length > 0) {
      console.log(`Date matching for ${employee.fullName} on ${dateString}:`, {
        lookingFor: dateString,
        availableDates: employeeData.logs.map(l => l.attendanceDate),
        found: !!log,
        log: log
      });
    }
    
    // Filter leaves for this specific employee
    const employeeLeaves = leaves.filter(leave => 
      leave.employee._id === employeeId && leave.status === 'Approved'
    );
    
    // Use the centralized attendance status function (same as AdminAttendanceSummaryPage)
    const statusInfo = getAttendanceStatus(
      date, 
      log, 
      employee.alternateSaturdayPolicy || 'All Saturdays Working', 
      holidays, 
      employeeLeaves
    );
    
    // Map the status to muster roll codes
    let code, color, bgColor;
    let label = statusInfo.status;
    const leaveTypeValue = statusInfo.leaveData?.leaveType || statusInfo.leaveType || '';
    const normalizedLeaveType = leaveTypeValue.toLowerCase();
    const isHalfDayLeave = normalizedLeaveType.includes('half');
    const isFullDayLeave = normalizedLeaveType.includes('full') && !isHalfDayLeave;
    const leaveBlue = '#1e88e5';
    const leaveBlueBg = '#e3f2fd';
    
    if (isHalfDayLeave) {
      code = 'HF';
      color = leaveBlue;
      bgColor = leaveBlueBg;
      label = 'Half Day Leave';
    } else if (isFullDayLeave) {
      code = 'FF';
      color = leaveBlue;
      bgColor = leaveBlueBg;
      label = 'Full Day Leave';
    } else if (statusInfo.status.includes('Leave') || statusInfo.leaveData) {
      code = 'L';
      color = '#e74c3c';
      bgColor = '#ffeaea';
    } else if (statusInfo.status.includes('Holiday')) {
      code = 'HL';
      color = '#6c5ce7';
      bgColor = '#f0f0ff';
    } else if (statusInfo.status === 'Present') {
      code = 'P';
      color = '#27ae60';
      bgColor = '#eafaf1';
    } else if (statusInfo.status === 'Weekend') {
      code = 'W';
      color = '#ffd43b';
      bgColor = '#fff8e1';
    } else if (statusInfo.status === 'Week Off') {
      code = 'W';
      color = '#ffd43b';
      bgColor = '#fff8e1';
    } else if (statusInfo.status === 'Working Day') {
      // For working Saturdays without attendance, show absent
      code = 'A';
      color = '#e74c3c';
      bgColor = '#ffeaea';
    } else {
      // Default to absent
      code = 'A';
      color = '#e74c3c';
      bgColor = '#ffeaea';
    }
    
    return { 
      code, 
      label, 
      color, 
      bgColor 
    };
  };

  // Helper function to determine if an employee should be working on a given day
  const isEmployeeExpectedToWork = (employee, date) => {
    const dayOfWeek = date.getDay();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentDate = new Date(date);
    currentDate.setHours(0, 0, 0, 0);
    
    // Don't count future dates
    if (currentDate > today) {
      return false;
    }

    const employeeStartDate = getEmployeeStartDate(employee);
    if (employeeStartDate && currentDate < employeeStartDate) {
      return false;
    }
    
    // Check for holidays
    const holiday = holidays.find(h => {
      // Skip tentative holidays (no date or isTentative flag)
      if (!h.date || h.isTentative) {
        return false;
      }
      const holidayDate = new Date(h.date);
      if (isNaN(holidayDate.getTime())) {
        return false;
      }
      return holidayDate.toLocaleDateString('en-CA') === date.toLocaleDateString('en-CA');
    });
    
    if (holiday) {
      return false; // Holiday - not expected to work
    }
    
    // Check for approved leaves
    const employeeLeave = leaves.find(leave => 
      leave.employee._id === employee._id && 
      leave.status === 'Approved' &&
      leave.leaveDates.some(leaveDate => {
        const leaveDateObj = new Date(leaveDate);
        return leaveDateObj.toLocaleDateString('en-CA') === date.toLocaleDateString('en-CA');
      })
    );
    
    if (employeeLeave) {
      return false; // On leave - not expected to work
    }
    
    // Check weekend logic
    if (dayOfWeek === 0) {
      return false; // Sunday - not expected to work
    }
    
    if (dayOfWeek === 6) {
      // Saturday - check policy
      const weekNum = Math.ceil(date.getDate() / 7);
      const saturdayPolicy = employee.alternateSaturdayPolicy || 'All Saturdays Working';
      
      switch (saturdayPolicy) {
        case 'All Saturdays Off':
          return false;
        case 'Week 1 & 3 Off':
          return !(weekNum === 1 || weekNum === 3);
        case 'Week 2 & 4 Off':
          return !(weekNum === 2 || weekNum === 4);
        case 'All Saturdays Working':
        default:
          return true;
      }
    }
    
    // Monday to Friday - expected to work
    return true;
  };

  // Calculate summary counts for each day
  const getDailySummary = useMemo(() => {
    const summary = {};
    
    monthDays.forEach(day => {
      const dayString = day.toLocaleDateString('en-CA');
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
  }, [filteredEmployees, monthDays, attendanceData, holidays, leaves]);

  const handleExport = () => {
    // TODO: Implement export functionality
    console.log('Export functionality to be implemented');
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

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="50vh">
        <SkeletonBox width="24px" height="24px" borderRadius="50%" />
      </Box>
    );
  }

  return (
    <Box sx={{ backgroundColor: '#f8f9fa', minHeight: '100vh', p: { xs: 0, sm: 2, lg: 3 } }}>
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} sx={{ backgroundColor: '#2C3E50', borderRadius: '12px', p: 2, flexWrap: 'wrap', gap: 1.5 }}>
          <Box display="flex" alignItems="center" gap={2} sx={{ minWidth: 0 }}>
            <IconButton onClick={() => navigate(-1)} size="small" sx={{ color: '#FFFFFF' }}>
              <ArrowBack />
            </IconButton>
            <Typography variant="h4" component="h1" sx={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: { xs: '1.25rem', sm: '2.125rem' } }}>Employee Muster Roll</Typography>
          </Box>
          <Box display="flex" gap={2}>
            <Button variant="contained" startIcon={<Download />} onClick={handleExport} sx={{ backgroundColor: '#dc3545', '&:hover': { backgroundColor: '#c82333' } }}>Export</Button>
          </Box>
        </Box>

        {/* Month Navigation and Filters */}
        <Card sx={{ mb: 3, borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={3}>
                <Box display="flex" alignItems="center" justifyContent="center" gap={2}>
                  <IconButton onClick={handlePreviousMonth} size="small">
                    <ArrowLeft />
                  </IconButton>
                  <Typography variant="h6" sx={{ minWidth: '120px', textAlign: 'center' }}>
                    {selectedMonth.toLocaleDateString('en-US', { 
                      month: 'long', 
                      year: 'numeric' 
                    })}
                  </Typography>
                  <IconButton onClick={handleNextMonth} size="small">
                    <ArrowRight />
                  </IconButton>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: <Search sx={{ mr: 1, color: '#dc3545' }} />
                  }}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Department</InputLabel>
                  <Select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    label="Department"
                  >
                    <MenuItem value="">All Departments</MenuItem>
                    {departments.map((dept) => (
                      <MenuItem key={dept} value={dept}>
                        {dept}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small">
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
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Muster Roll Grid */}
        <Card sx={{ borderRadius: '16px', overflow: 'hidden' }}>
          <CardContent sx={{ p: 0 }}>
            {error ? (
              <Alert severity="error" sx={{ m: 2 }}>
                {error}
              </Alert>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table sx={{ minWidth: '100%' }}>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f8f9fa' }}>
                      {/* Sticky Employee Column */}
                      <TableCell 
                        sx={{ 
                          position: 'sticky',
                          left: 0,
                          zIndex: 10,
                          backgroundColor: '#f8f9fa',
                          minWidth: { xs: '140px', sm: '250px' },
                          fontWeight: 'bold',
                          color: '#dc3545',
                          borderRight: '2px solid #dee2e6'
                        }}
                      >
                        Employee
                      </TableCell>
                      
                      {/* Date Columns */}
                      {monthDays.map((day) => (
                        <TableCell 
                          key={day.toISOString()}
                          sx={{ 
                            minWidth: { xs: '64px', sm: '80px' },
                            textAlign: 'center',
                            fontWeight: 'bold',
                            color: '#dc3545',
                            backgroundColor: day.getDay() === 0 || day.getDay() === 6 ? '#fff8e1' : '#f8f9fa'
                          }}
                        >
                          <Box>
                            <Typography variant="caption" display="block">
                              {day.toLocaleDateString('en-US', { month: 'short' })}
                            </Typography>
                            <Typography variant="body2" fontWeight="bold">
                              {day.getDate()}
                            </Typography>
                            <Typography variant="caption" display="block">
                              {day.toLocaleDateString('en-US', { weekday: 'short' })}
                            </Typography>
                          </Box>
                        </TableCell>
                      ))}
                      
                      {/* Summary Column Header */}
                      <TableCell 
                        sx={{ 
                          minWidth: '120px',
                          textAlign: 'center',
                          fontWeight: 'bold',
                          color: '#dc3545',
                          backgroundColor: '#f8f9fa',
                          borderLeft: '2px solid #dee2e6'
                        }}
                      >
                        <Box>
                          <Typography variant="caption" display="block">
                            Summary
                          </Typography>
                          <Typography variant="body2" fontWeight="bold">
                            P/A Count
                          </Typography>
                          <Typography variant="caption" display="block">
                            %
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  
                  <TableBody>
                    {filteredEmployees.map((employee) => (
                      <TableRow key={employee._id} hover>
                        {/* Sticky Employee Info */}
                        <TableCell 
                          sx={{ 
                            position: 'sticky',
                            left: 0,
                            zIndex: 5,
                            backgroundColor: '#ffffff',
                            borderRight: '2px solid #dee2e6',
                            minWidth: { xs: '140px', sm: '250px' }
                          }}
                        >
                          <Box display="flex" alignItems="center" gap={2}>
                            <Avatar 
                              sx={{ width: 40, height: 40 }}
                            >
                              {employee.fullName.charAt(0)}
                            </Avatar>
                            <Box>
                              <Typography variant="body2" fontWeight="bold">
                                {employee.employeeCode}
                              </Typography>
                              <Typography variant="body2" color="textSecondary">
                                {employee.fullName}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        
                        {/* Attendance Status Cells */}
                        {monthDays.map((day) => {
                          const status = getAttendanceStatusForEmployee(employee._id, day);
                          return (
                            <TableCell 
                              key={day.toISOString()}
                              sx={{ 
                                textAlign: 'center',
                                backgroundColor: status.bgColor,
                                border: `1px solid ${status.color}20`,
                                minWidth: { xs: '64px', sm: '80px' }
                              }}
                            >
                              <Typography 
                                variant="body2" 
                                fontWeight="bold"
                                sx={{ color: status.color }}
                              >
                                {status.code}
                              </Typography>
                            </TableCell>
                          );
                        })}
                        
                        {/* Employee Summary Cell */}
                        <TableCell 
                          sx={{ 
                            textAlign: 'center',
                            backgroundColor: '#f8f9fa',
                            borderLeft: '2px solid #dee2e6',
                            minWidth: '120px'
                          }}
                        >
                          <Box>
                            <Typography variant="body2" fontWeight="bold" color="#27ae60">
                              P: {monthDays.reduce((count, day) => {
                                const status = getAttendanceStatusForEmployee(employee._id, day);
                                return count + (status.code === 'P' ? 1 : 0);
                              }, 0)}
                            </Typography>
                            <Typography variant="body2" fontWeight="bold" color="#e74c3c">
                              A: {monthDays.reduce((count, day) => {
                                const status = getAttendanceStatusForEmployee(employee._id, day);
                                return count + (status.code === 'A' ? 1 : 0);
                              }, 0)}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {(() => {
                                const presentDays = monthDays.reduce((count, day) => {
                                  const status = getAttendanceStatusForEmployee(employee._id, day);
                                  return count + (status.code === 'P' ? 1 : 0);
                                }, 0);
                                const workingDays = monthDays.reduce((count, day) => {
                                  return count + (isEmployeeExpectedToWork(employee, day) ? 1 : 0);
                                }, 0);
                                return workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 0;
                              })()}%
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                    
                    {/* Daily Summary Row */}
                    <TableRow sx={{ backgroundColor: '#f8f9fa', fontWeight: 'bold' }}>
                      <TableCell 
                        sx={{ 
                          position: 'sticky',
                          left: 0,
                          zIndex: 5,
                          backgroundColor: '#f8f9fa',
                          borderRight: '2px solid #dee2e6',
                          minWidth: { xs: '140px', sm: '250px' },
                          fontWeight: 'bold',
                          color: '#dc3545'
                        }}
                      >
                        <Typography variant="body2" fontWeight="bold" color="#dc3545">
                          Daily Summary
                        </Typography>
                      </TableCell>
                      
                      {/* Daily Summary Cells */}
                      {monthDays.map((day) => {
                        const dayString = day.toLocaleDateString('en-CA');
                        const summary = getDailySummary[dayString] || { present: 0, absent: 0, total: 0, presentPercentage: 0 };
                        
                        return (
                          <TableCell 
                            key={day.toISOString()}
                            sx={{ 
                              textAlign: 'center',
                              backgroundColor: '#f8f9fa',
                              border: '1px solid #dee2e6',
                              minWidth: { xs: '64px', sm: '80px' },
                              fontWeight: 'bold'
                            }}
                          >
                            <Box>
                              <Typography variant="body2" fontWeight="bold" color="#27ae60">
                                P: {summary.present}
                              </Typography>
                              <Typography variant="body2" fontWeight="bold" color="#e74c3c">
                                A: {summary.absent}
                              </Typography>
                              <Typography variant="caption" color="textSecondary">
                                {summary.presentPercentage}%
                              </Typography>
                            </Box>
                          </TableCell>
                        );
                      })}
                      
                      {/* Total Summary Cell */}
                      <TableCell 
                        sx={{ 
                          textAlign: 'center',
                          backgroundColor: '#e3f2fd',
                          borderLeft: '2px solid #dee2e6',
                          minWidth: '120px',
                          fontWeight: 'bold'
                        }}
                      >
                        <Box>
                          <Typography variant="body2" fontWeight="bold" color="#27ae60">
                            P: {Object.values(getDailySummary).reduce((sum, day) => sum + day.present, 0)}
                          </Typography>
                          <Typography variant="body2" fontWeight="bold" color="#e74c3c">
                            A: {Object.values(getDailySummary).reduce((sum, day) => sum + day.absent, 0)}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {(() => {
                              const totalPresent = Object.values(getDailySummary).reduce((sum, day) => sum + day.present, 0);
                              const totalWorking = Object.values(getDailySummary).reduce((sum, day) => sum + day.total, 0);
                              return totalWorking > 0 ? Math.round((totalPresent / totalWorking) * 100) : 0;
                            })()}%
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <Card sx={{ borderRadius: '16px', mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ color: '#dc3545', fontWeight: 'bold' }}>
              Status Legend
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={2} mb={2}>
              <Chip label="P - Present" sx={{ backgroundColor: '#eafaf1', color: '#27ae60', fontWeight: 'bold' }} />
              <Chip label="A - Absent" sx={{ backgroundColor: '#ffeaea', color: '#e74c3c', fontWeight: 'bold' }} />
              <Chip label="HL - Holiday" sx={{ backgroundColor: '#f0f0ff', color: '#6c5ce7', fontWeight: 'bold' }} />
              <Chip label="W - Weekend" sx={{ backgroundColor: '#fff8e1', color: '#f39c12', fontWeight: 'bold' }} />
              <Chip label="HF - Half Day Leave" sx={{ backgroundColor: '#e3f2fd', color: '#1e88e5', fontWeight: 'bold' }} />
              <Chip label="FF - Full Day Leave" sx={{ backgroundColor: '#e3f2fd', color: '#1e88e5', fontWeight: 'bold' }} />
              <Chip label="L - Leave" sx={{ backgroundColor: '#ffeaea', color: '#e74c3c', fontWeight: 'bold' }} />
              <Chip label="N/A - Not Available" sx={{ backgroundColor: '#f8f9fa', color: '#6c757d', fontWeight: 'bold' }} />
              <Chip label="OT - Overtime" sx={{ backgroundColor: '#e8f5e8', color: '#2ecc71', fontWeight: 'bold' }} />
              <Chip label="SL - Sick Leave" sx={{ backgroundColor: '#fff3cd', color: '#856404', fontWeight: 'bold' }} />
              <Chip label="OD - On Duty" sx={{ backgroundColor: '#d1ecf1', color: '#0c5460', fontWeight: 'bold' }} />
              <Chip label="LOP - Loss of Pay" sx={{ backgroundColor: '#f8d7da', color: '#721c24', fontWeight: 'bold' }} />
            </Box>
            
            <Divider sx={{ my: 2 }} />
            
            <Typography variant="h6" gutterBottom sx={{ color: '#dc3545', fontWeight: 'bold' }}>
              Summary Column Information
            </Typography>
            <Box>
              <Typography variant="body2" color="textSecondary" paragraph>
                <strong>Employee Summary:</strong> Shows individual employee's Present (P) and Absent (A) counts for the month, along with attendance percentage.
              </Typography>
              <Typography variant="body2" color="textSecondary" paragraph>
                <strong>Daily Summary:</strong> Shows total Present and Absent counts for each day, considering alternate Saturday policies.
              </Typography>
              <Typography variant="body2" color="textSecondary">
                <strong>Total Summary:</strong> Shows overall Present and Absent counts for the entire month across all employees.
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>
  );
};

export default EmployeeMusterRollPage;
