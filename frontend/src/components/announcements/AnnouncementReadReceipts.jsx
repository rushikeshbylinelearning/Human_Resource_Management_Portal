import { useEffect, useState } from "react";
import Download from "lucide-react/dist/esm/icons/download";
import api from "../../api/axios";
import UserAvatar from "../common/UserAvatar";
import { formatAnswerSummary } from "../../utils/pollHelpers";
import { loadXLSX } from "../../utils/lazyLibraries";

function formatPostedAt(date) {
  if (!date) return null;
  const d = new Date(date);
  const datePart = d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart} · ${timePart} IST`;
}

function formatIstShort(date) {
  if (!date) return "";
  return new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatAnswerForQuestion(user, questionIndex, pollQuestions) {
  const answer = user.answers?.find((a) => a.questionIndex === questionIndex);
  if (!answer) {
    if (questionIndex === 0 && user.optionIndices?.length && !user.answers?.length) {
      const q = pollQuestions[0];
      return user.optionIndices
        .map((i) => q?.options?.[i]?.text || `Option ${i + 1}`)
        .join(", ");
    }
    return "";
  }
  if (answer.text) return answer.text;
  const q = pollQuestions[questionIndex];
  return (answer.optionIndices || [])
    .map((i) => q?.options?.[i]?.text || `Option ${i + 1}`)
    .join(", ");
}

function safeFilename(name) {
  return (name || "poll")
    .replace(/[<>:"/\\|?*]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60);
}

const TEA_BREAK_STATUS_CLASS = {
  break_closed: "break-closed",
  on_break: "on-break",
  not_checked_in: "not-checked-in",
  clocked_out_open: "clocked-out-open",
};

const AnnouncementReadReceipts = ({ announcementId, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("seen");
  const [expandedUser, setExpandedUser] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!announcementId) return;
    const load = async () => {
      try {
        setLoading(true);
        const { data: receipts } = await api.get(
          `/announcements/${announcementId}/read-receipts`
        );
        setData(receipts);
        if (receipts?.contentType === "poll") {
          setTab("submitted");
        } else if (receipts?.isTEABreak) {
          setTab("breakClosed");
        }
      } catch (error) {
        console.error("Failed to load read receipts:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [announcementId]);

  if (loading) {
    return (
      <div className="read-receipts-panel">
        <div className="read-receipts-empty">Loading…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="read-receipts-panel">
        <div className="read-receipts-empty">Could not load read receipts</div>
      </div>
    );
  }

  const isPoll = data.contentType === "poll";
  const pollQuestions = data.pollQuestions || [];
  const isTeaBreak = Boolean(data.isTEABreak);

  const breakClosedList = data.breakClosed || data.returned || [];
  const onBreakList = data.onBreak || [];
  const notApplicableList = data.notApplicable || [];

  const list =
    tab === "seen"
      ? data.seen
      : tab === "unseen"
        ? data.unseen
        : tab === "submitted"
          ? data.submitted || []
          : tab === "notSubmitted"
            ? data.notSubmitted || []
            : tab === "breakClosed"
              ? breakClosedList
              : tab === "onBreak"
                ? onBreakList
                : tab === "notApplicable"
                  ? notApplicableList
                  : data.pending || data.stillOut || [];

  const tabLabels = isPoll
    ? [
        { key: "submitted", label: `Submitted (${data.submittedCount || 0})` },
        { key: "notSubmitted", label: `Not submitted (${data.notSubmittedCount || 0})` },
        { key: "seen", label: `Opened (${data.seenCount})` },
        { key: "unseen", label: `Not opened (${data.unseenCount})` },
      ]
    : isTeaBreak
      ? [
          {
            key: "breakClosed",
            label: `Break closed (${data.breakClosedCount ?? data.returnedCount ?? 0})`,
          },
          {
            key: "onBreak",
            label: `On break (${data.onBreakCount ?? 0})`,
          },
          {
            key: "notApplicable",
            label: `Not in scope (${data.notApplicableCount ?? 0})`,
          },
          { key: "seen", label: `Opened (${data.seenCount})` },
          { key: "unseen", label: `Not opened (${data.unseenCount})` },
        ]
      : [
          { key: "seen", label: `Opened (${data.seenCount})` },
          { key: "unseen", label: `Not opened (${data.unseenCount})` },
        ];

  const formatVoteAnswer = (user) => {
    if (user.answers?.length) {
      return formatAnswerSummary(user.answers, pollQuestions);
    }
    if (user.optionIndices?.length) {
      return `Options: ${user.optionIndices.map((i) => i + 1).join(", ")}`;
    }
    return "";
  };

  const emptyMessage = () => {
    if (tab === "submitted") return "No submissions yet";
    if (tab === "notSubmitted") return "Everyone has submitted";
    if (tab === "seen") return "No one has opened this announcement yet";
    if (tab === "unseen") return "Everyone has opened this announcement";
    if (tab === "breakClosed") return "No one has closed the break yet";
    if (tab === "onBreak") return "No one is currently on break without closing";
    if (tab === "notApplicable") return "Everyone checked in was accounted for";
    return "No entries";
  };

  const handleExportExcel = async () => {
    if (!isPoll || exporting) return;
    try {
      setExporting(true);
      const XLSX = await loadXLSX();
      const xlsx = XLSX.default ?? XLSX;

      const seenMap = new Map(
        (data.seen || []).map((u) => [u.userId?.toString(), u.viewedAt])
      );

      const questionHeaders = pollQuestions.map(
        (q, i) => `Q${i + 1}: ${(q.text || `Question ${i + 1}`).slice(0, 80)}`
      );

      const rows = [];

      for (const u of data.submitted || []) {
        const row = {
          Name: u.fullName || "",
          Role: u.role || "",
          Department: u.department || "",
          Status: "Submitted",
          Opened: seenMap.has(u.userId?.toString()) || u.votedAt ? "Yes" : "No",
          "Opened at": formatIstShort(
            seenMap.get(u.userId?.toString()) || u.votedAt
          ),
          "Submitted at": formatIstShort(u.votedAt),
        };
        pollQuestions.forEach((_, i) => {
          row[questionHeaders[i]] = formatAnswerForQuestion(u, i, pollQuestions);
        });
        rows.push(row);
      }

      for (const u of data.notSubmitted || []) {
        const viewedAt = seenMap.get(u.userId?.toString());
        const row = {
          Name: u.fullName || "",
          Role: u.role || "",
          Department: u.department || "",
          Status: "Not submitted",
          Opened: viewedAt ? "Yes" : "No",
          "Opened at": formatIstShort(viewedAt),
          "Submitted at": "",
        };
        pollQuestions.forEach((_, i) => {
          row[questionHeaders[i]] = "";
        });
        rows.push(row);
      }

      rows.sort((a, b) => a.Name.localeCompare(b.Name));

      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 24 },
        { wch: 14 },
        { wch: 18 },
        { wch: 14 },
        { wch: 10 },
        { wch: 18 },
        { wch: 18 },
        ...questionHeaders.map(() => ({ wch: 28 })),
      ];
      xlsx.utils.book_append_sheet(wb, ws, "Poll submissions");

      const title = safeFilename(data.message || "poll");
      const dateStamp = new Date().toISOString().slice(0, 10);
      xlsx.writeFile(wb, `${title}_submissions_${dateStamp}.xlsx`);
    } catch (error) {
      console.error("Failed to export poll Excel:", error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="read-receipts-panel">
      <div className="read-receipts-header">
        <div className="read-receipts-header-top">
          <h4>
            {isPoll
              ? "Poll submissions"
              : isTeaBreak
                ? "Tea break tracking"
                : "Read receipts"}
          </h4>
          {isPoll && (
            <button
              type="button"
              className="read-receipts-export-btn"
              onClick={handleExportExcel}
              disabled={exporting}
              title="Download Excel"
            >
              <Download size={14} />
              {exporting ? "Exporting…" : "Excel"}
            </button>
          )}
        </div>
        <p>
          {isPoll ? (
            <>
              {data.submittedCount || 0} submitted · {data.notSubmittedCount || 0} pending
              {" · "}
              {data.seenCount} opened
            </>
          ) : isTeaBreak ? (
            <>
              {data.seenCount} opened · {data.unseenCount} not opened
              {" · "}
              {data.breakClosedCount ?? data.returnedCount ?? 0} break closed
              {" · "}
              {data.onBreakCount ?? 0} on break
              {" · "}
              {data.notApplicableCount ?? 0} not in scope
            </>
          ) : (
            <>
              {data.seenCount} opened · {data.unseenCount} not opened
            </>
          )}
        </p>
        {data.createdAt && (
          <p className="read-receipts-posted-at">Posted {formatPostedAt(data.createdAt)}</p>
        )}
        {onClose && (
          <button
            type="button"
            className="announcement-hub-tab"
            style={{ marginTop: 8 }}
            onClick={onClose}
          >
            ← Back
          </button>
        )}
      </div>

      <div className="read-receipts-tabs">
        {tabLabels.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`read-receipts-tab${tab === key ? " active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {isTeaBreak && tab === "notApplicable" && notApplicableList.length > 0 && (
        <p className="read-receipts-tab-hint">
          These people were not checked in when the break ran, so the tea break does not apply to them.
        </p>
      )}
      {isTeaBreak && tab === "onBreak" && (
        <p className="read-receipts-tab-hint">
          Checked-in employees who have not tapped &quot;End Break&quot; on their dashboard yet.
        </p>
      )}
      {tab === "unseen" && (
        <p className="read-receipts-tab-hint">
          {isTeaBreak
            ? "These people did not open this post in Company Announcements. They may still have acted on the break from a notification or their dashboard."
            : "These people did not open this announcement in Company Announcements."}
        </p>
      )}

      <div className="read-receipts-list">
        {list.length === 0 ? (
          <div className="read-receipts-empty">{emptyMessage()}</div>
        ) : (
          list.map((u) => {
            const answerSummary = isPoll && tab === "submitted" ? formatVoteAnswer(u) : "";
            const isExpanded = expandedUser === u.userId?.toString();
            const statusClass = TEA_BREAK_STATUS_CLASS[u.teaBreakStatus] || "";

            return (
              <div key={u.userId} className="read-receipts-user">
                <UserAvatar user={u} size="xs" />
                <div className="read-receipts-user-info">
                  <div className="read-receipts-user-name">{u.fullName}</div>
                  {isTeaBreak && u.teaBreakStatusLabel && (
                    <span className={`tea-break-status-pill ${statusClass}`}>
                      {u.teaBreakStatusLabel}
                    </span>
                  )}
                  <div className="read-receipts-user-meta">
                    {u.role}
                    {(u.votedAt || u.viewedAt) &&
                      ` · opened ${formatIstShort(u.votedAt || u.viewedAt)}`}
                    {u.endedAt &&
                      ` · closed ${formatIstShort(u.endedAt)}`}
                    {u.overrunMinutes > 0 && ` · ${u.overrunMinutes} min over`}
                  </div>
                  {answerSummary && (
                    <div className="read-receipts-answer-preview">{answerSummary}</div>
                  )}
                  {isPoll && tab === "submitted" && u.answers?.length > 0 && (
                    <button
                      type="button"
                      className="read-receipts-expand-btn"
                      onClick={() =>
                        setExpandedUser(isExpanded ? null : u.userId?.toString())
                      }
                    >
                      {isExpanded ? "Hide answers" : "View answers"}
                    </button>
                  )}
                  {isExpanded &&
                    u.answers?.map((a) => {
                      const q = pollQuestions[a.questionIndex];
                      return (
                        <div key={a.questionIndex} className="read-receipts-answer-detail">
                          <strong>Q{a.questionIndex + 1}:</strong>{" "}
                          {q?.text || `Question ${a.questionIndex + 1}`}
                          <div>
                            {a.text
                              ? a.text
                              : (a.optionIndices || [])
                                  .map((i) => q?.options?.[i]?.text || `Option ${i + 1}`)
                                  .join(", ")}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AnnouncementReadReceipts;
