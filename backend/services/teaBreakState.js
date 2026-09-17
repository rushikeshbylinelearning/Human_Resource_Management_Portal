// In-memory tracking for tea break sessions (per announcement).
// Cache only — resets on server restart and is not shared across processes.
// Durable source of truth is TeaBreakReturn (written on POST /tea-break/end).

const TeaBreakReturn = require('../models/TeaBreakReturn');

const endedByAnnouncement = new Map();

function getEndedSet(announcementId) {
  const key = String(announcementId);
  if (!endedByAnnouncement.has(key)) {
    endedByAnnouncement.set(key, new Set());
  }
  return endedByAnnouncement.get(key);
}

function markTeaBreakEnded(announcementId, employeeId) {
  getEndedSet(announcementId).add(String(employeeId));
}

/** Fast-path memory check only. Never treat this as the sole source of truth. */
function hasTeaBreakEnded(announcementId, employeeId) {
  return getEndedSet(announcementId).has(String(employeeId));
}

function clearTeaBreakState(announcementId) {
  endedByAnnouncement.delete(String(announcementId));
}

/**
 * Memory first, then TeaBreakReturn. On a DB hit, hydrate the cache so later
 * ticks in this process skip the round-trip.
 */
async function hasEmployeeEndedTeaBreak(announcementId, employeeId) {
  if (hasTeaBreakEnded(announcementId, employeeId)) {
    return true;
  }
  const row = await TeaBreakReturn.findOne({
    announcementId,
    userId: employeeId,
  })
    .select('_id')
    .lean();
  if (row) {
    markTeaBreakEnded(announcementId, employeeId);
    return true;
  }
  return false;
}

/** Load every ended employee for an announcement and hydrate the in-memory cache. */
async function loadEndedEmployeeIdsFromDb(announcementId) {
  const rows = await TeaBreakReturn.find({ announcementId }).select('userId').lean();
  const ids = new Set();
  for (const row of rows) {
    const id = String(row.userId);
    ids.add(id);
    markTeaBreakEnded(announcementId, id);
  }
  return ids;
}

async function hydrateEndedStateFromDb(announcementId) {
  const ids = await loadEndedEmployeeIdsFromDb(announcementId);
  return ids.size;
}

module.exports = {
  markTeaBreakEnded,
  hasTeaBreakEnded,
  hasEmployeeEndedTeaBreak,
  loadEndedEmployeeIdsFromDb,
  hydrateEndedStateFromDb,
  clearTeaBreakState,
};
