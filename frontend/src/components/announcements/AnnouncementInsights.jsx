import { useCallback, useEffect, useMemo, useState } from "react";
import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3";
import Coffee from "lucide-react/dist/esm/icons/coffee";
import Megaphone from "lucide-react/dist/esm/icons/megaphone";
import PieChart from "lucide-react/dist/esm/icons/pie-chart";
import Users from "lucide-react/dist/esm/icons/users";
import api from "../../api/axios";
import socket from "../../socket";
import AnnouncementReadReceipts from "./AnnouncementReadReceipts";

function formatDate(date) {
  return new Date(date).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getInsightTimestamp(msg) {
  if (msg.isTEABreak && msg.teaBreakStartedAt) {
    return msg.teaBreakStartedAt;
  }
  return msg.createdAt;
}

function istDateKey(timestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function formatSectionLabel(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const key = istDateKey(date);
  const todayKey = istDateKey(now);

  if (key === todayKey) return "Today";

  const yesterday = new Date(now.getTime() - 86400000);
  if (key === istDateKey(yesterday)) return "Yesterday";

  const msgYear = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(date);
  const currentYear = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(now);

  if (msgYear === currentYear) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function groupMessagesByDay(messages) {
  const sorted = [...(messages || [])].sort(
    (a, b) => new Date(getInsightTimestamp(b)) - new Date(getInsightTimestamp(a))
  );

  const sections = [];
  let currentKey = null;
  let currentSection = null;

  for (const msg of sorted) {
    const ts = getInsightTimestamp(msg);
    const key = istDateKey(ts);
    if (key !== currentKey) {
      currentKey = key;
      currentSection = { key, label: formatSectionLabel(ts), items: [] };
      sections.push(currentSection);
    }
    currentSection.items.push(msg);
  }

  return sections;
}

function pct(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

import { getPollQuestions } from "../../utils/pollHelpers";

function getMessageMeta(msg) {
  if (msg.contentType === "poll") {
    const questions = getPollQuestions(msg.poll);
    const preview =
      msg.poll?.title ||
      (questions.length === 1 ? questions[0].text : null) ||
      msg.poll?.question ||
      msg.message;
    return {
      type: "poll",
      label: questions.length > 1 ? "Survey" : "Poll",
      icon: PieChart,
      preview,
      questionCount: questions.length,
    };
  }
  if (msg.isTEABreak) {
    const period = msg.teaBreakType === "evening" ? "Evening" : "Morning";
    return {
      type: "tea",
      label: `${period} Tea Break`,
      icon: Coffee,
      preview: msg.message,
    };
  }
  return {
    type: "announcement",
    label: "Announcement",
    icon: Megaphone,
    preview: msg.message,
  };
}

const AnnouncementInsights = ({ messages, onSelectAnnouncement, initialAnnouncementId = null }) => {
  const [receiptsMap, setReceiptsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(initialAnnouncementId);
  const [recentActivity, setRecentActivity] = useState([]);
  const [pulseId, setPulseId] = useState(null);

  const messageIdsKey = useMemo(
    () => (messages || []).map((m) => m._id).filter(Boolean).join(","),
    [messages]
  );

  const refreshSummaries = useCallback(async (idsKey, { signal } = {}) => {
    if (!idsKey) {
      setReceiptsMap({});
      return;
    }

    const { data } = await api.get("/announcements/insights/summaries", {
      params: { ids: idsKey },
      signal,
    });
    setReceiptsMap(data || {});
  }, []);

  const refreshOneSummary = useCallback(async (announcementId) => {
    if (!announcementId) return;
    try {
      const { data } = await api.get("/announcements/insights/summaries", {
        params: { ids: announcementId },
      });
      const summary = data?.[announcementId];
      if (summary) {
        setReceiptsMap((prev) => ({ ...prev, [announcementId]: summary }));
      }
    } catch {
      /* non-blocking live refresh */
    }
  }, []);

  useEffect(() => {
    if (!messageIdsKey) {
      setReceiptsMap({});
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        await refreshSummaries(messageIdsKey, { signal: controller.signal });
      } catch (error) {
        if (error?.code !== "ERR_CANCELED" && error?.name !== "CanceledError") {
          console.error("Failed to load insight summaries:", error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [messageIdsKey, refreshSummaries]);

  useEffect(() => {
    if (initialAnnouncementId) {
      setSelectedId(initialAnnouncementId);
    }
  }, [initialAnnouncementId]);

  useEffect(() => {
    const handleTeaBreakEnded = async (payload) => {
      const announcementId = payload?.announcementId;
      if (!announcementId) return;

      setRecentActivity((prev) => {
        const entry = {
          id: `${announcementId}-${payload.employeeId}-${payload.endedAt}`,
          announcementId,
          employeeName: payload.employeeName,
          overrunMinutes: payload.overrunMinutes || 0,
          endedAt: payload.endedAt || new Date().toISOString(),
        };
        return [entry, ...prev].slice(0, 8);
      });

      setPulseId(announcementId);
      setTimeout(() => setPulseId(null), 2400);

      await refreshOneSummary(announcementId);
    };

    const handlePollUpdated = async (payload) => {
      const announcementId = payload?._id;
      if (!announcementId) return;

      setPulseId(announcementId);
      setTimeout(() => setPulseId(null), 2400);

      await refreshOneSummary(announcementId);
    };

    socket.on("tea_break_ended", handleTeaBreakEnded);
    socket.on("poll_updated", handlePollUpdated);
    return () => {
      socket.off("tea_break_ended", handleTeaBreakEnded);
      socket.off("poll_updated", handlePollUpdated);
    };
  }, [refreshOneSummary]);

  const handleSelect = (id) => {
    setSelectedId(id);
    onSelectAnnouncement?.(id);
  };

  const groupedSections = useMemo(() => groupMessagesByDay(messages), [messages]);

  const aggregate = useMemo(() => {
    const entries = Object.values(receiptsMap).filter(Boolean);
    if (!entries.length) return null;
    const totalSeen = entries.reduce((sum, r) => sum + (r.seenCount || 0), 0);
    const totalNotOpened = entries.reduce((sum, r) => sum + (r.unseenCount || 0), 0);
    const totalBreakClosed = entries.reduce(
      (sum, r) => sum + (r.breakClosedCount ?? r.returnedCount ?? 0),
      0
    );
    const teaBreaks = entries.filter((r) => r.isTEABreak);
    return {
      announcements: entries.length,
      openRate: pct(totalSeen, totalSeen + totalNotOpened),
      teaBreakCount: teaBreaks.length,
      breakClosed: totalBreakClosed,
    };
  }, [receiptsMap]);

  if (selectedId) {
    return (
      <AnnouncementReadReceipts
        announcementId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="announcement-insights">
      {aggregate && (
        <div className="insights-summary-grid">
          <div className="insights-summary-card">
            <BarChart3 size={18} className="insights-summary-icon" />
            <div>
              <span className="insights-summary-value">{aggregate.announcements}</span>
              <span className="insights-summary-label">Tracked posts</span>
            </div>
          </div>
          <div className="insights-summary-card">
            <Users size={18} className="insights-summary-icon seen" />
            <div>
              <span className="insights-summary-value">{aggregate.openRate}%</span>
              <span className="insights-summary-label">Avg. open rate</span>
            </div>
          </div>
          {aggregate.teaBreakCount > 0 && (
            <div className="insights-summary-card">
              <Coffee size={18} className="insights-summary-icon tea" />
              <div>
                <span className="insights-summary-value">{aggregate.breakClosed}</span>
                <span className="insights-summary-label">Breaks closed</span>
              </div>
            </div>
          )}
        </div>
      )}

      {recentActivity.length > 0 && (
        <div className="insights-live-feed">
          <div className="insights-live-feed-header">
            <span className="insights-live-dot" aria-hidden="true" />
            Live activity
          </div>
          <ul className="insights-live-list">
            {recentActivity.map((item) => (
              <li key={item.id} className="insights-live-item">
                <Coffee size={14} />
                <span>
                  <strong>{item.employeeName}</strong> closed break
                  {item.overrunMinutes > 0
                    ? ` · ${item.overrunMinutes} min over`
                    : " · on time"}
                </span>
                <time className="insights-live-time" dateTime={item.endedAt}>
                  {formatDate(item.endedAt)} · {formatTime(item.endedAt)}
                </time>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="insights-skeleton-list">
          {[1, 2, 3].map((i) => (
            <div key={i} className="insights-skeleton-card" />
          ))}
        </div>
      ) : groupedSections.length === 0 ? (
        <div className="read-receipts-empty insights-empty-state">
          <BarChart3 size={32} strokeWidth={1.5} />
          <p>No announcements yet</p>
          <span>Insights will appear once you post company announcements.</span>
        </div>
      ) : (
        <div className="insights-card-list">
          {groupedSections.map((section) => (
            <section key={section.key} className="insights-day-section" aria-label={section.label}>
              <div className="insights-date-divider" role="separator">
                <span>{section.label}</span>
              </div>
              {section.items.map((msg) => {
            const r = receiptsMap[msg._id];
            const meta = getMessageMeta(msg);
            const Icon = meta.icon;
            const total = r?.totalEligible || 0;
            const seenPct = pct(r?.seenCount || 0, total);
            const closedPct = r?.isTEABreak
              ? pct(r.breakClosedCount ?? r.returnedCount ?? 0, total)
              : null;
            const onBreakPct = r?.isTEABreak
              ? pct(r.onBreakCount ?? 0, total)
              : null;
            const submittedPct =
              meta.type === "poll" ? pct(r?.submittedCount || 0, total) : null;
            const isPulsing = pulseId === msg._id;
            const insightTs = getInsightTimestamp(msg);
            const cardTime = formatTime(insightTs);

            return (
              <button
                key={msg._id}
                type="button"
                className={`announcement-insights-item${isPulsing ? " is-pulsing" : ""}`}
                onClick={() => handleSelect(msg._id)}
              >
                <div className="announcement-insights-item-leading">
                  <div className={`insights-type-icon insights-type-${meta.type}`}>
                    <Icon size={18} strokeWidth={2} />
                  </div>
                  <div className="announcement-insights-item-text">
                    <div className="insights-item-head">
                      <span className={`insights-type-badge insights-type-${meta.type}`}>
                        {meta.label}
                      </span>
                      <time
                        className="insights-card-time"
                        dateTime={insightTs}
                        title={`${formatDate(insightTs)} at ${cardTime} IST`}
                      >
                        {cardTime}
                      </time>
                    </div>
                    <p title={meta.preview}>{meta.preview}</p>
                  </div>
                </div>

                {r && (
                  <div className="announcement-insights-metrics">
                    <div className="insights-metric">
                      <div className="insights-metric-head">
                        <span>Opened</span>
                        <strong>{r.seenCount}/{total}</strong>
                      </div>
                      <div className="insights-progress">
                        <div
                          className="insights-progress-fill seen"
                          style={{ width: `${seenPct}%` }}
                        />
                      </div>
                    </div>

                    {r.isTEABreak && (
                      <div className="insights-metric">
                        <div className="insights-metric-head">
                          <span>Break closed</span>
                          <strong>{r.breakClosedCount ?? r.returnedCount ?? 0}/{total}</strong>
                        </div>
                        <div className="insights-progress">
                          <div
                            className="insights-progress-fill returned"
                            style={{ width: `${closedPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {r.isTEABreak && (r.onBreakCount ?? 0) > 0 && (
                      <div className="insights-metric">
                        <div className="insights-metric-head">
                          <span>On break</span>
                          <strong>{r.onBreakCount ?? 0}/{total}</strong>
                        </div>
                        <div className="insights-progress">
                          <div
                            className="insights-progress-fill on-break"
                            style={{ width: `${onBreakPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {meta.type === "poll" && (
                      <div className="insights-metric">
                        <div className="insights-metric-head">
                          <span>Submitted</span>
                          <strong>{r.submittedCount || 0}/{total}</strong>
                        </div>
                        <div className="insights-progress">
                          <div
                            className="insights-progress-fill submitted"
                            style={{ width: `${submittedPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="announcement-insights-stats">
                      <span className="announcement-insights-stat seen">
                        {r.seenCount} opened
                      </span>
                      <span className="announcement-insights-stat unseen">
                        {r.unseenCount} not opened
                      </span>
                      {meta.type === "poll" && (
                        <span className="announcement-insights-stat submitted">
                          {r.submittedCount || 0} submitted
                        </span>
                      )}
                      {r.isTEABreak && (
                        <span className="announcement-insights-stat returned">
                          {r.breakClosedCount ?? r.returnedCount ?? 0} closed
                        </span>
                      )}
                      {r.isTEABreak && (r.onBreakCount ?? 0) > 0 && (
                        <span className="announcement-insights-stat on-break">
                          {r.onBreakCount} on break
                        </span>
                      )}
                      {r.isTEABreak && (r.notApplicableCount ?? 0) > 0 && (
                        <span className="announcement-insights-stat not-applicable">
                          {r.notApplicableCount} N/A
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </button>
            );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default AnnouncementInsights;
