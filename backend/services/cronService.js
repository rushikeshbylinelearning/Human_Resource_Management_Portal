// backend/services/cronService.js
const mongoose = require('mongoose');
const User = require('../models/User');
const Setting = require('../models/Setting');
const LeaveRequest = require('../models/LeaveRequest'); // <-- NEW
const { sendEmail } = require('./mailService');
const { checkAndSendWeeklyLateWarnings } = require('./analyticsEmailService');
// REMOVED: Legacy probation tracking service import
// Reason: All probation calculations now use /api/analytics/probation-tracker endpoint
const { checkAndAutoLogout } = require('./autoLogoutService');
const { getISTNow, startOfISTDay, parseISTDate, getISTDateString, getISTDateParts } = require('../utils/istTime');
const { executeLeaveAccrual } = require('../cron/leaveAccrualCron');
const { runOnboardingReminders } = require('../cron/onboardingReminderCron');
// NOTE: Employee document probation-end auto-assignment has been removed.
// Documents are only created by explicit admin action via the Assign Document flow.
const { sendMorningAttendanceReport, sendAfternoonAttendanceReport } = require('./teamsAttendanceNotificationService');

// --- CONFIGURATION (from .env) ---
const PROBATION_PERIOD_DAYS = parseInt(process.env.PROBATION_PERIOD_DAYS, 10) || 90;
// const INTERN_PERIOD_DAYS = parseInt(process.env.INTERN_PERIOD_DAYS, 10) || 180; // No longer needed
const REMINDER_WINDOW_DAYS = 7;

/**
 * A daily job to check for employees whose probation or internship is ending soon.
 */
const checkProbationAndInternshipEndings = async () => {
    // Check if database is connected before running queries
    if (mongoose.connection.readyState !== 1) return;

    try {
        // First try to get hiring-specific email setting
        let recipients = null;
        
        const hiringEmailSetting = await Setting.findOne({ key: 'hiringNotificationEmails' });
        if (hiringEmailSetting && Array.isArray(hiringEmailSetting.value) && hiringEmailSetting.value.length > 0) {
            recipients = hiringEmailSetting.value.join(',');
        } else {
            // Fallback to general HR emails if hiring emails not configured
            const hrEmailSetting = await Setting.findOne({ key: 'hrNotificationEmails' });
            if (hrEmailSetting && Array.isArray(hrEmailSetting.value) && hrEmailSetting.value.length > 0) {
                recipients = hrEmailSetting.value.join(',');
            }
        }

        if (!recipients) {
            console.log('[CRON] No hiring/HR email recipients configured. Skipping reminder emails.');
            return;
        }

        const today = startOfISTDay();

        const targetUsers = await User.find({
            isActive: true,
            employmentStatus: { $in: ['Probation', 'Intern'] }
        }).lean();

        for (const user of targetUsers) {
            const joiningDate = new Date(user.joiningDate);
            let endDate;
            let periodType = user.employmentStatus;

            if (user.employmentStatus === 'Probation') {
                // COMPANY POLICY: Probation is 6 calendar months from joining date, extended by approved leaves AND absences
                // Use IST utilities for all date calculations
                const probationStartDate = startOfISTDay(joiningDate);
                const probationStartDateStr = getISTDateString(probationStartDate);
                
                // Base end date: 6 calendar months from joining
                const baseEndDate = new Date(probationStartDate);
                baseEndDate.setMonth(baseEndDate.getMonth() + 6);
                
                // Calculate leave extensions (only approved leaves after joining date)
                const probationStartIST = parseISTDate(probationStartDateStr);
                const approvedLeaves = await LeaveRequest.find({
                    employee: user._id,
                    status: 'Approved',
                    leaveDates: {
                        $elemMatch: {
                            $gte: probationStartIST
                        }
                    }
                }).lean();
                
                let leaveExtensionDays = 0;
                const leaveDatesSet = new Set(); // Track leave dates to exclude from absent calculation
                
                approvedLeaves.forEach(leave => {
                    leave.leaveDates.forEach(leaveDate => {
                        const leaveDateStr = getISTDateString(leaveDate);
                        if (leaveDateStr >= probationStartDateStr) {
                            leaveDatesSet.add(leaveDateStr);
                            if (leave.leaveType === 'Full Day') {
                                leaveExtensionDays += 1;
                            } else if (leave.leaveType === 'Half Day - First Half' || leave.leaveType === 'Half Day - Second Half') {
                                leaveExtensionDays += 0.5;
                            }
                        }
                    });
                });
                
                // Calculate absence extensions (NEW - REQUIRED)
                const AttendanceLog = require('../models/AttendanceLog');
                const attendanceLogs = await AttendanceLog.find({
                    user: user._id,
                    attendanceDate: { $gte: probationStartDateStr }
                }).lean();
                
                let absentExtensionDays = 0;
                const absentDatesSet = new Set();
                
                attendanceLogs.forEach(log => {
                    const logDateStr = log.attendanceDate;
                    
                    // Skip if this date is covered by an approved leave
                    if (leaveDatesSet.has(logDateStr)) {
                        return;
                    }
                    
                    // Skip if already counted
                    if (absentDatesSet.has(logDateStr)) {
                        return;
                    }
                    
                    // Determine if absent (full or half day)
                    const status = log.attendanceStatus;
                    const hasClockIn = !!log.clockInTime;
                    const isHalfDayFlag = log.isHalfDay || false;
                    
                    // Full-day absent: No clock-in time OR status is 'Absent'
                    if (!hasClockIn || status === 'Absent') {
                        absentDatesSet.add(logDateStr);
                        absentExtensionDays += 1;
                    }
                    // Half-day absent: isHalfDay flag OR status is 'Half-day' (but no clock-in)
                    else if (isHalfDayFlag || status === 'Half-day') {
                        absentDatesSet.add(logDateStr);
                        absentExtensionDays += 0.5;
                    }
                });
                
                // Final end date: base + leave extensions + absent extensions (calendar days)
                endDate = new Date(baseEndDate);
                const totalExtensionDays = leaveExtensionDays + absentExtensionDays;
                endDate.setDate(baseEndDate.getDate() + Math.ceil(totalExtensionDays));
            } else if (user.employmentStatus === 'Intern' && user.internshipDurationMonths > 0) {
                // --- START: Internship Extension Logic ---
                // 1. Calculate base end date
                const baseEndDate = new Date(joiningDate.getTime());
                baseEndDate.setMonth(baseEndDate.getMonth() + user.internshipDurationMonths);

                // 2. Find all approved Planned or Sick leaves for this intern
                const approvedLeaves = await LeaveRequest.find({
                    employee: user._id,
                    status: 'Approved',
                    requestType: { $in: ['Planned', 'Sick'] }
                }).lean();

                // 3. Calculate total leave days to extend the internship
                let totalLeaveDays = 0;
                approvedLeaves.forEach(leave => {
                    const duration = leave.leaveDates.length * (leave.leaveType === 'Full Day' ? 1 : 0.5);
                    totalLeaveDays += duration;
                });
                
                // 4. Calculate the actual, extended end date
                endDate = new Date(baseEndDate.getTime());
                endDate.setDate(baseEndDate.getDate() + Math.ceil(totalLeaveDays)); // Use ceil to be safe
                // --- END: Internship Extension Logic ---
            }

            if (!endDate) continue; // Skip if no valid end date could be calculated
            
            const daysUntilEnd = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            if (daysUntilEnd > 0 && daysUntilEnd <= REMINDER_WINDOW_DAYS) {
                console.log(`[CRON] Sending reminder for ${user.fullName} whose ${periodType} period ends on ${endDate.toLocaleDateString()}`);

                const subject = `Reminder: ${user.fullName}'s ${periodType} Period Ending Soon`;
                const html = `
                    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                        <h2 style="color: #D32F2F;">Automated Reminder</h2>
                        <p>This is a notification that the <strong>${periodType}</strong> period for the following employee is scheduled to end soon:</p>
                        <ul>
                            <li><strong>Employee Name:</strong> ${user.fullName}</li>
                            <li><strong>Employee Code:</strong> ${user.employeeCode}</li>
                            <li><strong>Calculated End Date:</strong> ${endDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</li>
                        </ul>
                        <p>Please take the necessary action (e.g., confirmation, extension, etc.) in the admin panel.</p>
                        <p style="font-size: 0.9em; color: #777;">This is an automated message from the Attendance Management System.</p>
                    </div>
                `;
                
                sendEmail({ to: recipients, subject, html, isHREmail: true }).catch(err => {
                    console.error(`[CRON] Failed to send reminder email for ${user.fullName}:`, err);
                });
            }
        }
    } catch (error) {
        console.error('[CRON] Error during daily check:', error);
    }
};

/**
 * Weekly job to check for employees with 3+ late days and send warnings
 */
const checkWeeklyLateWarnings = async () => {
    if (mongoose.connection.readyState !== 1) return;

    try {
        await checkAndSendWeeklyLateWarnings();
    } catch (error) {
        console.error('[CRON] Error during weekly late check:', error);
    }
};

/**
 * Auto-logout check job - runs every 5 minutes
 * This checks for employees who should be auto-logged out and performs the logout
 */
const startAutoLogoutJob = () => {
    // Run immediately on startup (with a small delay to ensure DB is ready), then every 5 minutes
    // Use setTimeout to give the database a moment to be fully ready
    setTimeout(() => {
        checkAndAutoLogout().catch(err => {
            console.error('[cronService] Error in initial auto-logout check:', err);
        });
    }, 2000); // 2 second delay
    
    const AUTO_LOGOUT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    const intervalId = setInterval(() => {
        checkAndAutoLogout().catch(err => {
            console.error('[cronService] Error in scheduled auto-logout check:', err);
        });
    }, AUTO_LOGOUT_INTERVAL_MS);
    
    console.log('✅ Auto-logout job started (runs every 5 minutes)');
    
    // Store interval ID for potential cleanup (if needed in future)
    return intervalId;
};

/**
 * Half-day leave auto-conversion job - runs daily at 12:30 AM IST
 * Converts approved half-day leaves to full-day LOP when employee has no check-in
 * Also auto-reverts incorrectly converted leaves if attendance was added later
 */
const startHalfDayConversionJob = () => {
    const { autoConvertHalfDayLeaves, autoRevertIncorrectConversions } = require('./halfDayAutoConversionService');
    const { getISTDateString } = require('../utils/istTime');
    
    // Function to get yesterday's date in YYYY-MM-DD format
    const getYesterdayDateString = () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return getISTDateString(yesterday);
    };
    
    // Combined function to run both conversion and auto-revert
    const runDailyConversionChecks = async (dateStr) => {
        try {
            await autoConvertHalfDayLeaves(dateStr);
            await autoRevertIncorrectConversions(dateStr);
        } catch (err) {
            console.error(`[cronService] Error in daily conversion checks for ${dateStr}:`, err);
        }
    };
    
    // Run immediately on startup (with delay) for yesterday's data
    setTimeout(() => {
        const yesterday = getYesterdayDateString();
        runDailyConversionChecks(yesterday);
    }, 5000); // 5 second delay to ensure DB is ready
    
    // Schedule daily at 12:30 AM IST (00:30)
    const CONVERSION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
    
    // Calculate time until next 12:30 AM IST
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(0, 30, 0, 0); // Set to 12:30 AM today
    
    // If we've passed 12:30 AM today, schedule for tomorrow
    if (now > nextRun) {
        nextRun.setDate(nextRun.getDate() + 1);
    }
    
    const msUntilNextRun = nextRun.getTime() - now.getTime();
    
    // Schedule first run at 12:30 AM
    setTimeout(() => {
        const yesterday = getYesterdayDateString();
        runDailyConversionChecks(yesterday);
        
        // Then run every 24 hours
        setInterval(() => {
            const yesterday = getYesterdayDateString();
            runDailyConversionChecks(yesterday);
        }, CONVERSION_INTERVAL_MS);
    }, msUntilNextRun);
    
    console.log('✅ Half-day conversion job scheduled (runs daily at 12:30 AM IST)');
};

/**
 * Starts the scheduled jobs for the application.
 */
const startScheduledJobs = () => {
    // Daily jobs
    checkProbationAndInternshipEndings();
    setInterval(checkProbationAndInternshipEndings, 24 * 60 * 60 * 1000);
    
    // Weekly jobs (every Monday at 9 AM)
    checkWeeklyLateWarnings();
    setInterval(checkWeeklyLateWarnings, 7 * 24 * 60 * 60 * 1000);
    
    // Auto-logout job (runs every 5 minutes)
    startAutoLogoutJob();
    
    // Onboarding reminder job (runs daily)
    runOnboardingReminders();
    setInterval(runOnboardingReminders, 24 * 60 * 60 * 1000);

    // Employee document probation-end automation has been removed.
    // All document assignment is now explicit admin action only.
    
    // Half-day leave auto-conversion job (runs daily at 12:30 AM IST)
    startHalfDayConversionJob();
    
    // Monthly leave accrual job (runs on 1st of every month at 00:05 IST)
    startLeaveAccrualJob();
    
    // Daily Teams attendance notification (runs at 11:30 AM IST)
    startTeamsMorningReportJob();
    
    console.log('✅ Scheduled jobs (probation reminders, weekly late warnings, auto-logout, half-day conversion, leave accrual, teams morning report) have been started.');
};

/**
 * Start monthly leave accrual job
 * Runs on 1st of every month at 00:05 IST
 */
const startLeaveAccrualJob = () => {
    console.log('[CRON] Starting leave accrual job scheduler');
    
    // Check every hour if it's time to run accrual
    const checkAndRunAccrual = async () => {
        try {
            const now = getISTNow();
            const { day, hour, minute } = getISTDateParts(now);
            
            // Run on 1st of month at 00:05 IST (with 10-minute window)
            if (day === 1 && hour === 0 && minute >= 5 && minute < 15) {
                console.log('[CRON] Triggering monthly leave accrual');
                await executeLeaveAccrual();
            }
        } catch (error) {
            console.error('[CRON] Error in leave accrual job:', error);
        }
    };
    
    // Run immediately if it's the 1st of the month
    checkAndRunAccrual();
    
    // Check every hour
    setInterval(checkAndRunAccrual, 60 * 60 * 1000);
    
    console.log('[CRON] Leave accrual job scheduler started (runs 1st of month at 00:05 IST)');
};


/**
 * Starts the daily Teams attendance notification job.
 *
 * FIX 1 — Critical: getISTDateParts() only returns { year, month, day } — it
 *   does NOT return hour or minute.  Destructuring { hour, minute } from it
 *   always yields undefined, so the time checks (hour === 11 && minute >= 25)
 *   NEVER fire.  We now read the hour/minute directly from the IST Date object
 *   using the Intl formatter (same approach used elsewhere in istTime.js).
 *
 * FIX 2 — reportTime not respected: The admin can set a custom reportTime
 *   (e.g. "11:35") via the Settings UI and it gets saved to the DB, but the
 *   cron always hardcoded 11:25/11:30.  We now read reportTime from the DB
 *   config (teamsReportConfig) and derive the preview/send windows from it.
 *   Preview notification fires 5 minutes before the configured report time.
 *
 * FIX 3 — Preview notification window too narrow: A 2-minute window combined
 *   with a 60-second poll means if the poll fires just outside the window it
 *   is missed entirely.  Window expanded to 4 minutes to guarantee at least
 *   3 poll opportunities for both preview and auto-send.
 */
const startTeamsMorningReportJob = () => {
    // Teams dual attendance report job (morning + afternoon)

    const PREVIEW_NOTIF_SENT_KEY      = 'teamsPreviewNotifSentDate';
    const AFTERNOON_PREVIEW_SENT_KEY  = 'teamsAfternoonPreviewNotifSentDate';

    const getISTHourMinute = (date) => {
        const formatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
        });
        const parts = formatter.formatToParts(date);
        const hour   = parseInt(parts.find(p => p.type === 'hour').value,   10);
        const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
        return { hour, minute };
    };

    const parseReportTime = (timeStr, defaultH = 11, defaultM = 35) => {
        if (typeof timeStr === 'string' && /^\d{1,2}:\d{2}$/.test(timeStr)) {
            const [h, m] = timeStr.split(':').map(Number);
            if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) return { hour: h, minute: m };
        }
        return { hour: defaultH, minute: defaultM };
    };

    const subtractMinutes = ({ hour, minute }, offset) => {
        let total = hour * 60 + minute - offset;
        if (total < 0) total += 24 * 60;
        return { hour: Math.floor(total / 60), minute: total % 60 };
    };

    const PREVIEW_OFFSET_MINUTES = 5;
    const WINDOW_MINUTES = 4;

    const checkAndRun = async () => {
        try {
            const now = getISTNow();
            const { hour, minute } = getISTHourMinute(now);
            const todayStr = getISTDateString(now);

            // Read config from DB
            const configSetting = await Setting.findOne({ key: 'teamsReportConfig' });
            const storedConfig  = configSetting?.value || {};

            const morningTime   = parseReportTime(storedConfig.reportTime, 11, 35);
            const afternoonTime = parseReportTime(storedConfig.afternoonReportTime, 14, 0);
            const afternoonEnabled = storedConfig.afternoonReportEnabled !== false;

            const currentMins   = hour * 60 + minute;
            const morningMins   = morningTime.hour   * 60 + morningTime.minute;
            const afternoonMins = afternoonTime.hour * 60 + afternoonTime.minute;

            const fmtTime = (t) => `${String(t.hour).padStart(2,'0')}:${String(t.minute).padStart(2,'0')}`;

            // ── Morning preview notification ─────────────────────────────────────
            const morningPreviewMins = subtractMinutes(morningTime, PREVIEW_OFFSET_MINUTES).hour * 60 +
                                       subtractMinutes(morningTime, PREVIEW_OFFSET_MINUTES).minute;

            if (currentMins >= morningPreviewMins && currentMins < morningPreviewMins + WINDOW_MINUTES) {
                const alreadySent = await Setting.findOne({ key: PREVIEW_NOTIF_SENT_KEY });
                if (alreadySent?.value !== todayStr) {
                    const webhookSetting = await Setting.findOne({ key: 'teamsAttendanceWebhookUrl' });
                    if (webhookSetting?.value) {
                        try {
                            const NewNotificationService = require('./NewNotificationService');
                            await NewNotificationService.broadcastToAdmins({
                                message: `📊 Morning Teams attendance report (Shift 1 & 2) sending at ${fmtTime(morningTime)} IST. Click to preview & edit.`,
                                type: 'teams_report_preview',
                                category: 'admin',
                                priority: 'high',
                                actionData: { actionType: 'open_teams_preview', requiresAction: true },
                                navigationData: { page: 'teams_preview' },
                                metadata: { scheduledFor: fmtTime(morningTime), date: todayStr, scope: 'morning' },
                            });
                            await Setting.findOneAndUpdate({ key: PREVIEW_NOTIF_SENT_KEY }, { value: todayStr }, { upsert: true });
                            console.log(`[CRON] ✅ Teams morning preview notification sent (report at ${fmtTime(morningTime)} IST).`);
                        } catch (err) {
                            console.error('[CRON] Failed to send Teams morning preview notification:', err.message);
                        }
                    }
                }
            }

            // ── Auto-send morning report ─────────────────────────────────────────
            if (currentMins >= morningMins && currentMins < morningMins + WINDOW_MINUTES) {
                await sendMorningAttendanceReport();
            }

            // ── Afternoon preview notification ───────────────────────────────────
            if (afternoonEnabled) {
                const afPreviewTime = subtractMinutes(afternoonTime, PREVIEW_OFFSET_MINUTES);
                const afPreviewMins = afPreviewTime.hour * 60 + afPreviewTime.minute;

                if (currentMins >= afPreviewMins && currentMins < afPreviewMins + WINDOW_MINUTES) {
                    const alreadySent = await Setting.findOne({ key: AFTERNOON_PREVIEW_SENT_KEY });
                    if (alreadySent?.value !== todayStr) {
                        const webhookSetting = await Setting.findOne({ key: 'teamsAttendanceWebhookUrl' });
                        if (webhookSetting?.value) {
                            try {
                                const NewNotificationService = require('./NewNotificationService');
                                await NewNotificationService.broadcastToAdmins({
                                    message: `🕑 Afternoon Teams attendance report (All shifts) sending at ${fmtTime(afternoonTime)} IST. Click to preview & edit.`,
                                    type: 'teams_afternoon_report_preview',
                                    category: 'admin',
                                    priority: 'high',
                                    actionData: { actionType: 'open_teams_preview', requiresAction: true },
                                    navigationData: { page: 'teams_preview' },
                                    metadata: { scheduledFor: fmtTime(afternoonTime), date: todayStr, scope: 'afternoon' },
                                });
                                await Setting.findOneAndUpdate({ key: AFTERNOON_PREVIEW_SENT_KEY }, { value: todayStr }, { upsert: true });
                                console.log(`[CRON] ✅ Teams afternoon preview notification sent (report at ${fmtTime(afternoonTime)} IST).`);
                            } catch (err) {
                                console.error('[CRON] Failed to send Teams afternoon preview notification:', err.message);
                            }
                        }
                    }
                }

                // ── Auto-send afternoon report ───────────────────────────────────
                if (currentMins >= afternoonMins && currentMins < afternoonMins + WINDOW_MINUTES) {
                    await sendAfternoonAttendanceReport();
                }
            }

        } catch (error) {
            console.error('[CRON] Error in Teams attendance report job:', error);
        }
    };

    // Poll every 60 seconds
    setInterval(checkAndRun, 60 * 1000);
};

module.exports = { startScheduledJobs };
