const express = require('express');
const authenticateToken = require('../middleware/authenticateToken');
const AnnouncementMessage = require('../models/AnnouncementMessage');
const TeaBreakReturn = require('../models/TeaBreakReturn');
const User = require('../models/User');
const { getISTNow } = require('../utils/istTime');
const { markTeaBreakEnded } = require('../services/teaBreakState');
const {
  finalizeTeaBreakOnEnd,
  isEmployeeClockedIn,
  isEmployeeEligibleForTeaBreak,
  computeTeaBreakTiming,
  buildTeaBreakActivePayload,
  TEA_BREAK_SAFETY_CUTOFF_MS,
} = require('../services/teaBreakService');
const { emitTeaBreakEnded } = require('../utils/announcementHelpers');

const router = express.Router();

// Active tea break for dashboard timer (clocked-in employees only)
router.get('/active', authenticateToken, async (req, res) => {
  try {
    const now = getISTNow();
    const { LUNCH_BREAK_SAFETY_CUTOFF_MS } = require('../services/teaBreakService');
    const cutoff = new Date(now.getTime() - LUNCH_BREAK_SAFETY_CUTOFF_MS); // Use longer cutoff to catch lunch breaks

    const announcement = await AnnouncementMessage.findOne({
      isTEABreak: true,
      teaBreakStartedAt: { $gte: cutoff, $lte: now },
      teaBreakStoppedAt: null,
    })
      .sort({ teaBreakStartedAt: -1 })
      .select('teaBreakStartedAt teaBreakType sender')
      .populate('sender', '_id')
      .lean();

    if (!announcement?.teaBreakStartedAt) {
      return res.json({ active: false });
    }

    const breakType = announcement.teaBreakType === 'lunch' ? 'lunch' : 'tea';
    const timing = computeTeaBreakTiming(announcement.teaBreakStartedAt, now, breakType);
    if (now >= timing.safetyEndsAt) {
      return res.json({ active: false });
    }

    const isAdminOrHr = ['Admin', 'HR'].includes(req.user.role);
    if (!isAdminOrHr) {
      const clockedIn = await isEmployeeClockedIn(req.user.userId);
      if (!clockedIn) {
        return res.json({ active: false, reason: 'not_clocked_in' });
      }

      const eligible = await isEmployeeEligibleForTeaBreak(
        req.user.userId,
        announcement.teaBreakStartedAt,
        breakType
      );
      if (!eligible) {
        markTeaBreakEnded(announcement._id, req.user.userId);
        return res.json({ active: false, reason: 'joined_after_allowance' });
      }

      const alreadyEnded = await TeaBreakReturn.exists({
        announcementId: announcement._id,
        userId: req.user.userId,
      });
      if (alreadyEnded) {
        markTeaBreakEnded(announcement._id, req.user.userId);
        return res.json({ active: false, reason: 'already_ended' });
      }
    }

    res.json(buildTeaBreakActivePayload(announcement, timing));
  } catch (err) {
    console.error('[TeaBreak] GET /active error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/end', authenticateToken, async (req, res) => {
  try {
    const { announcementId } = req.body;
    if (!announcementId) {
      return res.status(400).json({ message: 'announcementId is required' });
    }

    const announcement = await AnnouncementMessage.findById(announcementId).lean();
    if (!announcement?.isTEABreak || !announcement.teaBreakStartedAt) {
      return res.status(404).json({ message: 'Tea break announcement not found' });
    }
    if (announcement.teaBreakStoppedAt) {
      return res.json({ success: true, overrunMinutes: 0, stopped: true });
    }

    const employeeId = req.user.userId;
    const breakType = announcement.teaBreakType === 'lunch' ? 'lunch' : 'tea';

    const { overrunMinutes } = await finalizeTeaBreakOnEnd(
      employeeId,
      announcementId,
      announcement.teaBreakStartedAt,
      breakType
    );

    markTeaBreakEnded(announcementId, employeeId);

    const endedAt = getISTNow();
    await TeaBreakReturn.findOneAndUpdate(
      { announcementId, userId: employeeId },
      { $set: { endedAt, overrunMinutes: overrunMinutes || 0 } },
      { upsert: true, new: true }
    );

    const employee = await User.findById(employeeId).select('fullName').lean();
    emitTeaBreakEnded({
      announcementId,
      employeeId,
      employeeName: employee?.fullName || req.user.fullName || 'An employee',
      overrunMinutes: overrunMinutes || 0,
    }).catch((err) => console.error('[TeaBreak] emitTeaBreakEnded failed:', err.message));

    try {
      const cache = require('../utils/cache');
      const { getISTDateString } = require('../utils/istTime');
      const today = getISTDateString();
      cache.delete(`employee_dashboard:${employeeId}:${today}`);
      cache.delete(`status:${employeeId}:${today}`);
    } catch (_) {
      /* cache optional */
    }

    res.json({ success: true, overrunMinutes });
  } catch (err) {
    console.error('[TeaBreak] POST /end error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin/HR: stop tea break for everyone (announcements-initiated break)
router.post('/stop', authenticateToken, async (req, res) => {
  try {
    if (!['Admin', 'HR'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only Admin/HR can stop tea breaks' });
    }

    const { stopTeaBreakAnnouncement, stopAllActiveTeaBreaks } = require('../services/teaBreakStopService');
    const { announcementId } = req.body;

    if (announcementId) {
      const result = await stopTeaBreakAnnouncement(announcementId);
      if (!result.success) {
        return res.status(404).json({ message: result.message || 'Tea break not found' });
      }
      return res.json(result);
    }

    const result = await stopAllActiveTeaBreaks();
    res.json(result);
  } catch (err) {
    console.error('[TeaBreak] POST /stop error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
