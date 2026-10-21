const express = require("express");
const router = express.Router();
const AnnouncementMessage = require("../models/AnnouncementMessage");
const AnnouncementRead = require("../models/AnnouncementRead");
const PollVote = require("../models/PollVote");
const AnnouncementView = require("../models/AnnouncementView");
const authenticateToken = require("../middleware/authenticateToken");
const {
  isAdminOrHr,
  transformSender,
  transformMessages,
  enrichMessagesForUser,
  validatePollPayload,
  buildPollFromPayload,
  validatePollAnswers,
  applyPollAnswers,
  getPollQuestions,
  isMultiQuestionPoll,
  isPollOpen,
  recordViewsForUser,
  getReadReceipts,
  getReadReceiptsSummaries,
  emitAnnouncementEvent,
  emitTeaBreakStarted,
} = require("../utils/announcementHelpers");

async function populateAndTransform(doc) {
  const populated = await doc.populate("sender", "fullName role profileImageUrl");
  return transformSender(populated.toObject());
}

// Get messages with pagination (infinite scroll)
// Query params: ?limit=50&before=<messageId> (for loading older messages)
router.get("/", authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const beforeId = req.query.before; // Message ID to load messages before (older than this)

    // Build query
    const query = {};
    if (beforeId) {
      // Find messages created before the specified message
      const beforeMsg = await AnnouncementMessage.findById(beforeId).select('createdAt').lean();
      if (beforeMsg) {
        query.createdAt = { $lt: beforeMsg.createdAt };
      }
    }

    // Fetch messages in descending order (newest first), then reverse for display
    const messages = await AnnouncementMessage.find(query)
      .populate("sender", "fullName role profileImageUrl")
      .sort({ createdAt: -1 }) // Newest first for pagination
      .limit(Math.min(limit, 100)) // Max 100 per request
      .lean();

    // Reverse to chronological order for display
    const chronologicalMessages = messages.reverse();

    const transformed = transformMessages(chronologicalMessages);
    const enriched = await enrichMessagesForUser(transformed, req.user.userId);

    // Check if there are more messages to load
    const hasMore = messages.length === Math.min(limit, 100);
    const oldestId = chronologicalMessages.length > 0 ? chronologicalMessages[0]._id : null;

    res.set("Cache-Control", "private, max-age=15"); // Shorter cache for pagination
    res.json({
      messages: enriched,
      hasMore,
      oldestId, // Use this as 'before' param to load more
    });
  } catch (err) {
    console.error("[Announcements] Error fetching messages:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Post message or poll
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { message, type, isTEABreak, teaBreakType, contentType, poll } = req.body;
    const isPoll = contentType === "poll";

    if (isPoll && !isAdminOrHr(req.user.role)) {
      return res.status(403).json({ message: "Only Admin/HR can create polls" });
    }

    if (isPoll) {
      const pollError = validatePollPayload(poll);
      if (pollError) return res.status(400).json({ message: pollError });
    } else {
      if (!message || message.trim() === "") {
        return res.status(400).json({ message: "Message is required" });
      }
      if (message.length > 1000) {
        return res.status(400).json({ message: "Message too long (max 1000 characters)" });
      }
    }

    const User = require("../models/User");
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const createPayload = {
      sender: user._id,
      type: type || "general",
      contentType: isPoll ? "poll" : "text",
    };

    if (isPoll) {
      const builtPoll = buildPollFromPayload(poll);
      const questions = getPollQuestions(builtPoll);
      const summary =
        (message || builtPoll.title || questions[0]?.text || "Poll").trim();
      createPayload.message = summary.slice(0, 1000);
      createPayload.poll = builtPoll;
    } else {
      createPayload.message = message.trim();
    }

    if (isTEABreak === true) {
      if (!isAdminOrHr(req.user.role)) {
        return res.status(403).json({ message: "Only Admin/HR can post tea break announcements" });
      }
      if (!teaBreakType || !["morning", "evening", "lunch"].includes(teaBreakType)) {
        return res.status(400).json({ message: "teaBreakType must be 'morning', 'evening', or 'lunch'" });
      }
      const { getISTNow } = require("../utils/istTime");
      createPayload.isTEABreak = true;
      createPayload.teaBreakType = teaBreakType;
      createPayload.teaBreakStartedAt = getISTNow();
    }

    const newMessage = await AnnouncementMessage.create(createPayload);
    const msgObj = await populateAndTransform(newMessage);

    emitAnnouncementEvent("receiveAnnouncement", msgObj, req.user.userId);

    if (msgObj.isTEABreak && msgObj.teaBreakStartedAt) {
      const teaPayload = {
        announcementId: msgObj._id,
        teaBreakStartedAt: msgObj.teaBreakStartedAt,
        teaBreakType: msgObj.teaBreakType,
        durationMinutes: msgObj.teaBreakType === 'lunch' ? 30 : 10,
      };
      emitTeaBreakStarted(teaPayload, req.user.userId).catch((err) => {
        console.error("[Announcements] tea_break_started broadcast failed:", err.message);
      });

      try {
        const { scheduleTeaBreakEnforcement } = require("../jobs/teaBreakEnforcer");
        const breakType = msgObj.teaBreakType === 'lunch' ? 'lunch' : 'tea';
        scheduleTeaBreakEnforcement(msgObj._id, msgObj.teaBreakStartedAt, breakType);
      } catch (jobErr) {
        console.error("[Announcements] tea break enforcer schedule failed:", jobErr.message);
      }
    }

    res.status(201).json(msgObj);
  } catch (err) {
    console.error("[Announcements] Error posting message:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Mark announcements as read + record per-announcement views
router.post("/mark-read", authenticateToken, async (req, res) => {
  try {
    const now = new Date();

    await AnnouncementRead.findOneAndUpdate(
      { userId: req.user.userId },
      { lastReadTime: now },
      { upsert: true, new: true }
    );

    await recordViewsForUser(req.user.userId, now);

    res.json({
      success: true,
      lastReadTime: now.toISOString(),
    });
  } catch (err) {
    console.error("[Announcements] Error marking as read:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get last read time
router.get("/last-read", authenticateToken, async (req, res) => {
  try {
    const record = await AnnouncementRead.findOne({ userId: req.user.userId });
    res.json({
      lastReadTime: record?.lastReadTime?.toISOString() || null,
    });
  } catch (err) {
    console.error("[Announcements] Error fetching last read time:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Admin: batch insight summaries (counts only — must be before /:id/read-receipts)
router.get("/insights/summaries", authenticateToken, async (req, res) => {
  try {
    if (!isAdminOrHr(req.user.role)) {
      return res.status(403).json({ message: "Only Admin/HR can view insights" });
    }

    const idsParam = req.query.ids;
    const ids =
      typeof idsParam === "string" && idsParam.trim()
        ? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

    const summaries = await getReadReceiptsSummaries(ids);
    res.set("Cache-Control", "private, max-age=15");
    res.json(summaries);
  } catch (err) {
    console.error("[Announcements] Error fetching insight summaries:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Admin: read receipts for a single announcement
router.get("/:id/read-receipts", authenticateToken, async (req, res) => {
  try {
    if (!isAdminOrHr(req.user.role)) {
      return res.status(403).json({ message: "Only Admin/HR can view read receipts" });
    }

    const receipts = await getReadReceipts(req.params.id);
    if (!receipts) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    res.json(receipts);
  } catch (err) {
    console.error("[Announcements] Error fetching read receipts:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Record view of a specific announcement
router.post("/:id/view", authenticateToken, async (req, res) => {
  try {
    const announcement = await AnnouncementMessage.findById(req.params.id).select("_id");
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    const now = new Date();
    await AnnouncementView.findOneAndUpdate(
      { announcementId: announcement._id, userId: req.user.userId },
      { $set: { viewedAt: now } },
      { upsert: true, new: true }
    );

    res.json({ success: true, viewedAt: now.toISOString() });
  } catch (err) {
    console.error("[Announcements] Error recording view:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Vote on / submit a poll
router.post("/:id/vote", authenticateToken, async (req, res) => {
  try {
    const { optionIndices, answers } = req.body;

    const announcement = await AnnouncementMessage.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }
    if (announcement.contentType !== "poll" || !announcement.poll) {
      return res.status(400).json({ message: "This announcement is not a poll" });
    }
    if (!isPollOpen(announcement)) {
      return res.status(400).json({ message: "This poll is closed" });
    }

    const existingVote = await PollVote.findOne({
      announcementId: announcement._id,
      userId: req.user.userId,
    });
    if (existingVote) {
      return res.status(409).json({ message: "You have already submitted this poll" });
    }

    const isMulti = isMultiQuestionPoll(announcement.poll);
    let votePayload;
    let responseUserVote = null;
    let responseUserAnswers = null;

    if (isMulti || Array.isArray(answers)) {
      const validationError = validatePollAnswers(announcement, answers);
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const normalizedAnswers = answers.map((a) => {
        const entry = { questionIndex: Number(a.questionIndex) };
        if (a.text != null) {
          entry.text = a.text.trim();
        } else {
          entry.optionIndices = [...new Set((a.optionIndices || []).map((i) => Number(i)))];
        }
        return entry;
      });

      votePayload = { answers: normalizedAnswers };
      responseUserAnswers = normalizedAnswers;
      applyPollAnswers(announcement, normalizedAnswers);
    } else {
      if (!Array.isArray(optionIndices) || optionIndices.length === 0) {
        return res.status(400).json({ message: "optionIndices array is required" });
      }

      const maxIndex = announcement.poll.options.length - 1;
      const uniqueIndices = [...new Set(optionIndices.map((i) => Number(i)))];
      if (uniqueIndices.some((i) => !Number.isInteger(i) || i < 0 || i > maxIndex)) {
        return res.status(400).json({ message: "Invalid option selection" });
      }
      if (!announcement.poll.allowMultiple && uniqueIndices.length > 1) {
        return res.status(400).json({ message: "This poll allows only one selection" });
      }

      votePayload = { optionIndices: uniqueIndices };
      responseUserVote = uniqueIndices;

      for (const idx of uniqueIndices) {
        announcement.poll.options[idx].voteCount += 1;
      }
      announcement.poll.totalVotes += 1;
      announcement.markModified("poll");
    }

    await PollVote.create({
      announcementId: announcement._id,
      userId: req.user.userId,
      ...votePayload,
    });

    await announcement.save();

    await AnnouncementView.findOneAndUpdate(
      { announcementId: announcement._id, userId: req.user.userId },
      { $set: { viewedAt: new Date() } },
      { upsert: true }
    );

    const populated = await populateAndTransform(announcement);
    const enriched = (await enrichMessagesForUser([populated], req.user.userId))[0];

    emitAnnouncementEvent("poll_updated", enriched);

    res.json({
      success: true,
      announcement: enriched,
      userVote: responseUserVote,
      userAnswers: responseUserAnswers,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "You have already submitted this poll" });
    }
    console.error("[Announcements] Error voting:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Close a poll (Admin/HR)
router.patch("/:id/poll/close", authenticateToken, async (req, res) => {
  try {
    if (!isAdminOrHr(req.user.role)) {
      return res.status(403).json({ message: "Only Admin/HR can close polls" });
    }

    const announcement = await AnnouncementMessage.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }
    if (announcement.contentType !== "poll") {
      return res.status(400).json({ message: "This announcement is not a poll" });
    }

    announcement.poll.isClosed = true;
    announcement.markModified("poll");
    await announcement.save();

    const msgObj = await populateAndTransform(announcement);
    emitAnnouncementEvent("poll_updated", msgObj);

    res.json(msgObj);
  } catch (err) {
    console.error("[Announcements] Error closing poll:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Update message
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({ message: "Message is required" });
    }
    if (message.length > 1000) {
      return res.status(400).json({ message: "Message too long (max 1000 characters)" });
    }

    const announcement = await AnnouncementMessage.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }
    if (announcement.contentType === "poll") {
      return res.status(400).json({ message: "Poll announcements cannot be edited as text" });
    }

    const isOwner = announcement.sender.toString() === req.user.userId;
    if (!isOwner && !isAdminOrHr(req.user.role)) {
      return res.status(403).json({ message: "Not authorized to update this announcement" });
    }

    announcement.message = message.trim();
    await announcement.save();

    const msgObj = await populateAndTransform(announcement);
    res.json(msgObj);
  } catch (err) {
    console.error("[Announcements] Error updating message:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete message
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const announcement = await AnnouncementMessage.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    const isOwner = announcement.sender.toString() === req.user.userId;
    if (!isOwner && !isAdminOrHr(req.user.role)) {
      return res.status(403).json({ message: "Not authorized to delete this announcement" });
    }

    await Promise.all([
      PollVote.deleteMany({ announcementId: announcement._id }),
      AnnouncementView.deleteMany({ announcementId: announcement._id }),
      AnnouncementMessage.findByIdAndDelete(announcement._id),
    ]);

    res.json({ message: "Announcement deleted successfully", id: req.params.id });
  } catch (err) {
    console.error("[Announcements] Error deleting message:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Pin/Unpin message
router.patch("/:id/pin", authenticateToken, async (req, res) => {
  try {
    const { pinned } = req.body;

    if (!isAdminOrHr(req.user.role)) {
      return res.status(403).json({ message: "Only Admin/HR can pin announcements" });
    }

    const announcement = await AnnouncementMessage.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    const willPin = Boolean(pinned);
    const { getISTNow } = require("../utils/istTime");
    announcement.pinned = willPin;
    announcement.pinnedAt = willPin ? getISTNow() : null;
    await announcement.save();

    const msgObj = await populateAndTransform(announcement);
    emitAnnouncementEvent("announcementPinned", msgObj);
    res.json(msgObj);
  } catch (err) {
    console.error("[Announcements] Error pinning message:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
