const AnnouncementMessage = require('../models/AnnouncementMessage');
const { getISTNow } = require('../utils/istTime');
const {
  applyTeaBreakOverrun,
  getClockedInEmployeeIds,
  TEA_BREAK_DURATION_MS,
  TEA_BREAK_SAFETY_CUTOFF_MS,
  LUNCH_BREAK_DURATION_MS,
  LUNCH_BREAK_SAFETY_CUTOFF_MS,
} = require('../services/teaBreakService');
const { hasTeaBreakEnded, clearTeaBreakState, loadEndedEmployeeIdsFromDb, hydrateEndedStateFromDb } = require('../services/teaBreakState');

const RECURRING_INTERVAL_MS = 60 * 1000;

const activeJobs = new Map();

async function runEnforcementPass(announcementId, teaBreakStartedAt, breakType = 'tea') {
  const employeeIds = await getClockedInEmployeeIds();
  const dbEndedIds = await loadEndedEmployeeIdsFromDb(announcementId);
  let pendingCount = 0;
  let skippedEnded = 0;

  for (const employeeId of employeeIds) {
    const id = String(employeeId);
    if (hasTeaBreakEnded(announcementId, id) || dbEndedIds.has(id)) {
      skippedEnded += 1;
      continue;
    }
    pendingCount += 1;
    try {
      await applyTeaBreakOverrun(employeeId, teaBreakStartedAt, announcementId, breakType);
    } catch (err) {
      console.error(`[TeaBreak] Enforcement error for ${employeeId}:`, err.message);
    }
  }

  if (skippedEnded > 0 || pendingCount > 0) {
    console.log(
      `[TeaBreak] Enforcement ${announcementId}: skipped ${skippedEnded} already-ended (TeaBreakReturn), pending ${pendingCount}/${employeeIds.length}`
    );
  }

  return { pendingCount, totalClockedIn: employeeIds.length, skippedEnded };
}

function stopEnforcement(announcementId) {
  const key = String(announcementId);
  const job = activeJobs.get(key);
  if (!job) return;
  if (job.timeoutId) clearTimeout(job.timeoutId);
  if (job.intervalId) clearInterval(job.intervalId);
  activeJobs.delete(key);
  clearTeaBreakState(announcementId);
  console.log(`[TeaBreak] Stopped enforcement for announcement ${announcementId}`);
}

/**
 * Schedule tea break overrun enforcement for a given announcement.
 */
function scheduleTeaBreakEnforcement(announcementId, teaBreakStartedAt, breakType = 'tea') {
  const key = String(announcementId);
  if (activeJobs.has(key)) {
    stopEnforcement(announcementId);
  }

  const started = new Date(teaBreakStartedAt);
  const durationMs = breakType === 'lunch' ? LUNCH_BREAK_DURATION_MS : TEA_BREAK_DURATION_MS;
  const safetyCutoffMs = breakType === 'lunch' ? LUNCH_BREAK_SAFETY_CUTOFF_MS : TEA_BREAK_SAFETY_CUTOFF_MS;
  
  const firstRunAt = new Date(started.getTime() + durationMs + 1000);
  const cutoffAt = new Date(started.getTime() + safetyCutoffMs);
  const now = getISTNow();

  const runPass = async () => {
    if (getISTNow() >= cutoffAt) {
      stopEnforcement(announcementId);
      return;
    }
    const { pendingCount } = await runEnforcementPass(announcementId, teaBreakStartedAt, breakType);
    if (pendingCount === 0) {
      stopEnforcement(announcementId);
    }
  };

  const delay = Math.max(0, firstRunAt - now);
  const timeoutId = setTimeout(() => {
    runPass().catch((err) => console.error('[TeaBreak] First enforcement pass failed:', err));
    const intervalId = setInterval(() => {
      if (getISTNow() >= cutoffAt) {
        stopEnforcement(announcementId);
        return;
      }
      runPass().catch((err) => console.error('[TeaBreak] Recurring enforcement failed:', err));
    }, RECURRING_INTERVAL_MS);
    activeJobs.set(key, { timeoutId: null, intervalId, teaBreakStartedAt, breakType });
  }, delay);

  activeJobs.set(key, { timeoutId, intervalId: null, teaBreakStartedAt, breakType });
  console.log(`[TeaBreak] Scheduled ${breakType} break enforcement for ${announcementId} in ${Math.round(delay / 1000)}s`);
}

/**
 * Re-schedule enforcement after server restart if an active tea break exists.
 */
async function restoreActiveTeaBreakJobs() {
  try {
    const cutoff = new Date(getISTNow().getTime() - LUNCH_BREAK_SAFETY_CUTOFF_MS); // Use longer cutoff to catch lunch breaks
    const active = await AnnouncementMessage.find({
      isTEABreak: true,
      teaBreakStartedAt: { $gte: cutoff },
      teaBreakStoppedAt: null,
    })
      .sort({ teaBreakStartedAt: -1 })
      .limit(5)
      .lean();

    for (const ann of active) {
      if (!ann.teaBreakStartedAt) continue;
      const breakType = ann.teaBreakType === 'lunch' ? 'lunch' : 'tea';
      const safetyCutoffMs = breakType === 'lunch' ? LUNCH_BREAK_SAFETY_CUTOFF_MS : TEA_BREAK_SAFETY_CUTOFF_MS;
      const endsAt = new Date(new Date(ann.teaBreakStartedAt).getTime() + safetyCutoffMs);
      if (getISTNow() < endsAt) {
        const endedCount = await hydrateEndedStateFromDb(ann._id);
        console.log(
          `[TeaBreak] Restoring ${breakType} enforcement for ${ann._id}; hydrated ${endedCount} ended employee(s) from TeaBreakReturn`
        );
        scheduleTeaBreakEnforcement(ann._id, ann.teaBreakStartedAt, breakType);
      }
    }
  } catch (err) {
    console.error('[TeaBreak] Failed to restore jobs:', err.message);
  }
}

module.exports = {
  scheduleTeaBreakEnforcement,
  stopEnforcement,
  restoreActiveTeaBreakJobs,
};
