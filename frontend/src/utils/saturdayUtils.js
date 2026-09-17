/**
 * Utility functions for handling Saturday policies and attendance status
 * Frontend display only - all policy logic handled by backend
 */

/**
 * Get attendance status for a specific date
 * @param {Date} date - The date to check
 * @param {Object} log - The attendance log for the date (if any)
 * @param {string} saturdayPolicy - The Saturday policy ('All Saturdays Working', 'All Saturdays Off', 'Week 1 & 3 Off', 'Week 2 & 4 Off')
 * @param {Array} holidays - Array of holiday objects
 * @param {Array} leaves - Array of leave objects for the employee
 * @returns {Object} Status object with status, color, and other properties
 */
export const getAttendanceStatus = (date, log, saturdayPolicy = 'All Saturdays Working', holidays = [], leaves = []) => {
  const dateString = date.toLocaleDateString('en-CA');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentDate = new Date(date);
  currentDate.setHours(0, 0, 0, 0);
  
  // NOTE: We no longer early-return for future dates here because calendar/timeline
  // should still indicate scheduled Weekend/Week Off days even if they are in the future.
  // Future working days without logs will still be represented as 'N/A' later.
  
  // Helper function to check if a date is a holiday
  const getHolidayForDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    return holidays.find(holiday => {
      // Skip tentative holidays (no date or isTentative flag)
      if (!holiday.date || holiday.isTentative) {
        return false;
      }
      const holidayDate = new Date(holiday.date);
      if (isNaN(holidayDate.getTime())) {
        return false;
      }
      const holidayYear = holidayDate.getFullYear();
      const holidayMonth = String(holidayDate.getMonth() + 1).padStart(2, '0');
      const holidayDay = String(holidayDate.getDate()).padStart(2, '0');
      const holidayDateStr = `${holidayYear}-${holidayMonth}-${holidayDay}`;
      return holidayDateStr === dateStr;
    });
  };

  // Helper function to check if a date is a leave
  const getLeaveForDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    return leaves.find(leave => {
      if (leave.status !== 'Approved') return false;
      return leave.leaveDates.some(leaveDateItem => {
        const leaveDate = new Date(leaveDateItem);
        const leaveYear = leaveDate.getFullYear();
        const leaveMonth = String(leaveDate.getMonth() + 1).padStart(2, '0');
        const leaveDay = String(leaveDate.getDate()).padStart(2, '0');
        const leaveDateStr = `${leaveYear}-${leaveMonth}-${leaveDay}`;
        return leaveDateStr === dateStr;
      });
    });
  };

  // Check for holidays and leaves first (regardless of log existence)
  const holiday = getHolidayForDate(date);
  const leave = getLeaveForDate(date);
  
  if (holiday) {
    return { 
      status: `Holiday - ${holiday.name}`, 
      color: '#6c5ce7', 
      bgColor: '#f0f0ff' 
    };
  }
  
  if (leave) {
    // Handle special leave types with distinct colors and labels
    if (leave.requestType === 'Compensatory') {
      return { 
        status: 'Comp Off', 
        color: '#1976d2', 
        bgColor: '#CCE5FF',
        leaveType: 'Comp Off',
        leaveData: leave
      };
    } else if (leave.requestType === 'Swap Leave') {
      return { 
        status: 'Swap Leave', 
        color: '#f57c00', 
        bgColor: '#FFE5B4',
        leaveType: 'Swap Leave',
        leaveData: leave
      };
    } else {
      const formattedRequestType = leave.requestType === 'Loss of Pay' ? 'Loss of pay' : leave.requestType;
      return { 
        status: `Leave - ${formattedRequestType}`, 
        color: '#e74c3c', 
        bgColor: '#ffeaea',
        leaveType: formattedRequestType,
        leaveData: leave
      };
    }
  }
  
  // If there's a log with sessions, require meaningful shift time when shift has ended
  if (log && log.sessions && log.sessions.length > 0) {
    const shiftEnded = log.clockInTime && log.clockOutTime;
    if (shiftEnded) {
      const elapsedHours = (new Date(log.clockOutTime) - new Date(log.clockInTime)) / (1000 * 60 * 60);
      if (elapsedHours < 5) {
        return {
          status: 'Absent',
          color: '#e74c3c',
          bgColor: '#ffeaea'
        };
      }
    }
    return {
      status: 'Present',
      color: '#27ae60',
      bgColor: '#eafaf1'
    };
  }
  
  // No log - determine expected status based on day of week and Saturday policy
  const dayOfWeek = date.getDay();
  let expectedStatus = 'Working Day';
  
  if (dayOfWeek === 0) {
    // Sunday
    expectedStatus = 'Weekend';
  } else if (dayOfWeek === 6) {
    // Saturday - check policy
    const weekNum = Math.ceil(date.getDate() / 7);
    let isWorkingSaturday = true;
    
    if (saturdayPolicy === 'All Saturdays Off') {
      isWorkingSaturday = false;
    } else if (saturdayPolicy === 'Week 1 & 3 Off' && (weekNum === 1 || weekNum === 3)) {
      isWorkingSaturday = false;
    } else if (saturdayPolicy === 'Week 2 & 4 Off' && (weekNum === 2 || weekNum === 4)) {
      isWorkingSaturday = false;
    }
    
    expectedStatus = isWorkingSaturday ? 'Working Day' : 'Week Off';
  }
  
  // If it's a working day and it's in the past, mark as absent
  if (expectedStatus === 'Working Day' && currentDate < today) {
    return { 
      status: 'Absent', 
      color: '#e74c3c', 
      bgColor: '#ffeaea' 
    };
  }
  
  // If it's a future date and expectedStatus is a working day with no log, return N/A
  if (currentDate > today && expectedStatus === 'Working Day') {
    return {
      status: 'N/A',
      color: '#6c757d',
      bgColor: '#f8f9fa'
    };
  }

  // Return the expected status
  const statusColors = {
    'Weekend': { color: '#ffd43b', bgColor: '#fff8e1' },
    'Week Off': { color: '#ffd43b', bgColor: '#fff8e1' },
    'Working Day': { color: '#e74c3c', bgColor: '#ffeaea' } // This would be absent for working days without attendance
  };
  
  const colors = statusColors[expectedStatus] || { color: '#6c757d', bgColor: '#f8f9fa' };
  
  return { 
    status: expectedStatus, 
    color: colors.color, 
    bgColor: colors.bgColor 
  };
};

/**
 * Check if a specific Saturday is a working day based on policy
 * @param {Date} date - The date to check (should be a Saturday)
 * @param {string} saturdayPolicy - The Saturday policy
 * @returns {boolean} True if it's a working Saturday
 */
export const isWorkingSaturday = (date, saturdayPolicy) => {
  if (date.getDay() !== 6) return false; // Not a Saturday
  
  const weekNum = Math.ceil(date.getDate() / 7);
  
  switch (saturdayPolicy) {
    case 'All Saturdays Working':
      return true;
    case 'All Saturdays Off':
      return false;
    case 'Week 1 & 3 Off':
      return !(weekNum === 1 || weekNum === 3);
    case 'Week 2 & 4 Off':
      return !(weekNum === 2 || weekNum === 4);
    default:
      return true;
  }
};

/**
 * Expected weekly working hours based on employee Saturday schedule.
 * 6 working days → 54 hrs (3240 min); 5 working days → 45 hrs (2700 min).
 * @param {string} saturdayPolicy - 'All Saturdays Working' | 'All Saturdays Off' | 'Week 1 & 3 Off' | 'Week 2 & 4 Off'
 * @param {Date} weekSaturdayDate - The Saturday of the week (Sun–Sat)
 * @returns {{ workingDays: number, expectedMinutes: number }}
 */
export const getExpectedWeeklyWorkingHours = (saturdayPolicy, weekSaturdayDate) => {
  const workingSaturday = isWorkingSaturday(weekSaturdayDate, saturdayPolicy || 'All Saturdays Working');
  const workingDays = workingSaturday ? 6 : 5;
  const expectedMinutes = workingDays * 9 * 60; // 9 hrs per day
  return { workingDays, expectedMinutes };
};

/**
 * Format leave request type for display
 * Converts "Loss of Pay" to "Loss of pay" for better readability
 * @param {string} requestType - The leave request type
 * @returns {string} Formatted leave request type for display
 */
export const formatLeaveRequestType = (requestType) => {
  if (!requestType) return '';
  if (requestType === 'Loss of Pay') return 'Loss of pay';
  return requestType;
};







