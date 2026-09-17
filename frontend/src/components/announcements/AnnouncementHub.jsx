import { useState, useEffect, Suspense } from "react";
import Megaphone from "lucide-react/dist/esm/icons/megaphone";
import X from "lucide-react/dist/esm/icons/x";
import { useAuth } from "../../context/AuthContext";
import api from "../../api/axios";
import AnnouncementChannel from "../AnnouncementChannel";
import AnnouncementInsights from "./AnnouncementInsights";
import AnnouncementReadReceipts from "./AnnouncementReadReceipts";
import { lazyWithRetry } from "../../utils/lazyWithRetry";
import "../../styles/AnnouncementModal.css";
import "../../styles/AnnouncementDropdown.css";

const PollCreateForm = lazyWithRetry(() => import("./PollCreateForm"));

const AnnouncementHub = ({ onClose, initialTab = "feed", initialAnnouncementId = null }) => {
  const { user } = useAuth();
  const isAdminOrHr = ["Admin", "HR"].includes(user?.role);
  const [tab, setTab] = useState(initialTab);
  const [messages, setMessages] = useState([]);
  const [receiptsId, setReceiptsId] = useState(null);
  const [channelKey, setChannelKey] = useState(0);
  const [insightsAnnouncementId, setInsightsAnnouncementId] = useState(initialAnnouncementId);

  useEffect(() => {
    setTab(initialTab);
    setInsightsAnnouncementId(initialAnnouncementId);
  }, [initialTab, initialAnnouncementId]);

  useEffect(() => {
    if (!isAdminOrHr) return;
    api.get("/announcements").then(({ data }) => setMessages(data)).catch(() => {});
  }, [isAdminOrHr, channelKey]);

  const handlePollCreated = () => {
    setTab("feed");
    setChannelKey((k) => k + 1);
  };

  const handleMessagesChange = (msgs) => {
    setMessages(msgs);
  };

  return (
    <div className="announcement-hub">
      <div className="announcement-hub-header">
        <div className="announcement-hub-title">
          <Megaphone size={20} />
          Company Announcements
        </div>
        <button
          type="button"
          className="announcement-hub-close"
          onClick={onClose}
          aria-label="Close announcements"
        >
          <X size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {isAdminOrHr && (
        <div className="announcement-hub-tabs">
          <button
            type="button"
            className={`announcement-hub-tab${tab === "feed" ? " active" : ""}`}
            onClick={() => {
              setTab("feed");
              setReceiptsId(null);
            }}
          >
            Feed
          </button>
          <button
            type="button"
            className={`announcement-hub-tab${tab === "poll" ? " active" : ""}`}
            onClick={() => {
              setTab("poll");
              setReceiptsId(null);
            }}
          >
            Create Poll
          </button>
          <button
            type="button"
            className={`announcement-hub-tab${tab === "insights" ? " active" : ""}`}
            onClick={() => {
              setTab("insights");
              setReceiptsId(null);
            }}
          >
            Insights
          </button>
        </div>
      )}

      <div className="announcement-hub-body">
        <div className="announcement-hub-main">
          {tab === "feed" && (
            <AnnouncementChannel
              key={channelKey}
              embedded
              onClose={onClose}
              onMessagesChange={handleMessagesChange}
              onAdminViewReceipts={isAdminOrHr ? setReceiptsId : undefined}
            />
          )}
          {tab === "poll" && isAdminOrHr && (
            <Suspense fallback={<div className="announcement-hub-loading">Loading poll editor…</div>}>
              <PollCreateForm onCreated={handlePollCreated} />
            </Suspense>
          )}
          {tab === "insights" && isAdminOrHr && (
            <AnnouncementInsights
              messages={messages}
              initialAnnouncementId={insightsAnnouncementId}
              onSelectAnnouncement={setReceiptsId}
            />
          )}
        </div>

        {isAdminOrHr && receiptsId && tab === "feed" && (
          <div className="announcement-hub-side">
            <AnnouncementReadReceipts
              announcementId={receiptsId}
              onClose={() => setReceiptsId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AnnouncementHub;
