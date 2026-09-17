import { useEffect, useState, useRef, Fragment, useMemo, useCallback } from "react";
import api from "../api/axios";
import socket from "../socket";
import { useAuth } from "../context/AuthContext";
import UserAvatar from "./common/UserAvatar";
import PollMessage from "./announcements/PollMessage";
import Send from "lucide-react/dist/esm/icons/send";
import X from "lucide-react/dist/esm/icons/x";
import Megaphone from "lucide-react/dist/esm/icons/megaphone";
import Smile from "lucide-react/dist/esm/icons/smile";
import MoreVertical from "lucide-react/dist/esm/icons/more-vertical";
import Edit2 from "lucide-react/dist/esm/icons/edit-2";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import Pin from "lucide-react/dist/esm/icons/pin";
import PinOff from "lucide-react/dist/esm/icons/pin-off";
import Eye from "lucide-react/dist/esm/icons/eye";
import Lock from "lucide-react/dist/esm/icons/lock";
import OctagonX from "lucide-react/dist/esm/icons/octagon-x";
import EmojiPicker from "./EmojiPicker";

function sortMessagesChronologically(list) {
  return [...list].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function getPinnedPreview(msg) {
  if (msg.contentType === "poll") {
    return msg.poll?.title || msg.message || "Poll";
  }
  return msg.message || "Announcement";
}

const AnnouncementChannel = ({ onClose, embedded = false, onMessagesChange, onAdminViewReceipts }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [menuOpen, setMenuOpen] = useState(null);
  const [isTeaBreakAnnouncement, setIsTeaBreakAnnouncement] = useState(false);
  const [teaBreakType, setTeaBreakType] = useState("morning");
  const [activeTeaBreak, setActiveTeaBreak] = useState(null);
  const [stoppingTeaBreak, setStoppingTeaBreak] = useState(false);
  const messagesEndRef = useRef(null);
  const messageRefs = useRef({});
  const inputRef = useRef(null);
  const { user, token } = useAuth();

  const isAdminOrHr = ['Admin', 'HR'].includes(user?.role);

  const fetchActiveTeaBreak = async () => {
    if (!isAdminOrHr) return;
    try {
      const { data } = await api.get("/tea-break/active");
      if (data?.active) {
        setActiveTeaBreak(data);
      } else {
        setActiveTeaBreak(null);
      }
    } catch {
      setActiveTeaBreak(null);
    }
  };

  const handleStopTeaBreak = async () => {
    if (stoppingTeaBreak) return;

    const breakLabels = {
      'morning': 'Morning tea',
      'evening': 'Evening tea',
      'lunch': 'Lunch'
    };
    const breakLabel = breakLabels[activeTeaBreak?.teaBreakType] || 'Tea';
    
    const confirmed = window.confirm(
      activeTeaBreak
        ? `End the ${breakLabel} break for all employees? Timers and break state will be cleared for everyone who is checked in.`
        : 'End any active break for all employees?'
    );
    if (!confirmed) return;

    try {
      setStoppingTeaBreak(true);
      await api.post("/tea-break/stop", activeTeaBreak?.announcementId
        ? { announcementId: activeTeaBreak.announcementId }
        : {});
      setActiveTeaBreak(null);
      setIsTeaBreakAnnouncement(false);
    } catch (error) {
      console.error("Error stopping tea break:", error);
      alert(error.response?.data?.message || "Failed to end break for all");
    } finally {
      setStoppingTeaBreak(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    // Fetch messages on mount
    fetchMessages();
    fetchActiveTeaBreak();
    
    // Connect socket with authentication
    if (token && !socket.connected) {
      socket.auth = { token };
      socket.connect();
    }

    // Listen for new announcements
    const handleNewAnnouncement = (msg) => {
      setMessages((prev) => {
        const exists = prev.some((m) => String(m._id) === String(msg._id));
        if (exists) return prev;
        return sortMessagesChronologically([...prev, msg]);
      });
      setTimeout(scrollToBottom, 100);
    };

    // Listen for announcement updates
    const handleAnnouncementUpdated = (msg) => {
      setMessages((prev) => prev.map(m => m._id === msg._id ? msg : m));
    };

    // Listen for announcement deletions
    const handleAnnouncementDeleted = (data) => {
      setMessages((prev) => prev.filter(m => m._id !== data.id));
    };

    // Listen for announcement pin/unpin
    const handleAnnouncementPinned = (msg) => {
      setMessages((prev) => {
        const updated = prev.map((m) =>
          String(m._id) === String(msg._id) ? msg : m
        );
        return sortMessagesChronologically(updated);
      });
    };

    const handleTeaBreakStarted = () => {
      fetchActiveTeaBreak();
    };
    const handleTeaBreakStopped = (data) => {
      setActiveTeaBreak(null);
      setIsTeaBreakAnnouncement(false);
      if (data?.universalStop) {
        window.dispatchEvent(new CustomEvent('dashboard-refresh-requested'));
      }
    };

    const handlePollUpdated = (msg) => {
      setMessages((prev) => prev.map((m) => (m._id === msg._id ? msg : m)));
    };

    socket.on("receiveAnnouncement", handleNewAnnouncement);
    socket.on("announcementUpdated", handleAnnouncementUpdated);
    socket.on("announcementDeleted", handleAnnouncementDeleted);
    socket.on("announcementPinned", handleAnnouncementPinned);
    socket.on("tea_break_started", handleTeaBreakStarted);
    socket.on("tea_break_stopped", handleTeaBreakStopped);
    socket.on("poll_updated", handlePollUpdated);

    return () => {
      socket.off("receiveAnnouncement", handleNewAnnouncement);
      socket.off("announcementUpdated", handleAnnouncementUpdated);
      socket.off("announcementDeleted", handleAnnouncementDeleted);
      socket.off("announcementPinned", handleAnnouncementPinned);
      socket.off("tea_break_started", handleTeaBreakStarted);
      socket.off("tea_break_stopped", handleTeaBreakStopped);
      socket.off("poll_updated", handlePollUpdated);
    };
  }, [token]); // Only depend on token

  useEffect(() => {
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/announcements");
      setMessages(sortMessagesChronologically(data));
    } catch (error) {
      console.error("Error fetching announcements:", error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    try {
      setSending(true);
      const postBody = { message: input.trim() };
      if (isAdminOrHr && isTeaBreakAnnouncement) {
        postBody.isTEABreak = true;
        postBody.teaBreakType = teaBreakType;
      }

      const { data } = await api.post("/announcements", postBody);

      // Add message immediately to local state for instant feedback
      setMessages((prev) => [...prev, data]);
      setTimeout(scrollToBottom, 100);

      // Real-time delivery is handled server-side on POST /announcements
      if (data.isTEABreak) {
        fetchActiveTeaBreak();
        if (data._id) {
          sessionStorage.setItem(`tea_break_notified_${data._id}`, '1');
        }
      }
      setInput("");
      setIsTeaBreakAnnouncement(false);
    } catch (error) {
      console.error("Error sending announcement:", error);
      alert(error.response?.data?.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleEmojiSelect = (emoji) => {
    setInput((prev) => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const isCurrentUser = (senderId) => {
    return senderId === user?._id || senderId === user?.id;
  };

  const canEditDelete = (msg) => {
    const isOwner = isCurrentUser(msg.sender._id);
    const isAdmin = ['Admin', 'HR'].includes(user?.role);
    return isOwner || isAdmin;
  };

  const canPin = () => {
    return ['Admin', 'HR'].includes(user?.role);
  };

  const handleEdit = (msg) => {
    setEditingId(msg._id);
    setEditText(msg.message);
    setMenuOpen(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const handleSaveEdit = async (msgId) => {
    if (!editText.trim()) return;

    try {
      const { data } = await api.put(`/announcements/${msgId}`, {
        message: editText.trim(),
      });

      setMessages((prev) => prev.map(m => m._id === msgId ? data : m));
      socket.emit("updateAnnouncement", data);
      setEditingId(null);
      setEditText("");
    } catch (error) {
      console.error("Error updating announcement:", error);
      alert(error.response?.data?.message || "Failed to update message");
    }
  };

  const handleDelete = async (msgId) => {
    try {
      await api.delete(`/announcements/${msgId}`);
      setMessages((prev) => prev.filter(m => m._id !== msgId));
      socket.emit("deleteAnnouncement", { id: msgId });
      setMenuOpen(null);
    } catch (error) {
      console.error("Error deleting announcement:", error);
      alert(error.response?.data?.message || "Failed to delete message");
    }
  };

  const handlePin = async (msg) => {
    try {
      const { data } = await api.patch(`/announcements/${msg._id}/pin`, {
        pinned: !msg.pinned,
      });

      setMessages((prev) => {
        const updated = prev.map((m) =>
          String(m._id) === String(data._id) ? data : m
        );
        return sortMessagesChronologically(updated);
      });

      setMenuOpen(null);
    } catch (error) {
      console.error("Error pinning announcement:", error);
      alert(error.response?.data?.message || "Failed to pin message");
    }
  };

  const handleClosePoll = async (msgId) => {
    if (!window.confirm("Close this poll? No more votes will be accepted.")) return;
    try {
      const { data } = await api.patch(`/announcements/${msgId}/poll/close`);
      setMessages((prev) => prev.map((m) => (m._id === msgId ? data : m)));
      setMenuOpen(null);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to close poll");
    }
  };

  const handlePollVoted = (updated) => {
    setMessages((prev) => prev.map((m) => (m._id === updated._id ? updated : m)));
  };

  const istDateKey = (timestamp) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(timestamp));

  const isSameISTDay = (a, b) => istDateKey(a) === istDateKey(b);

  const formatMessageTime = (timestamp) =>
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(timestamp));

  const formatDateDivider = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const key = istDateKey(date);
    const todayKey = istDateKey(now);

    if (key === todayKey) return 'Today';

    const yesterday = new Date(now.getTime() - 86400000);
    if (key === istDateKey(yesterday)) return 'Yesterday';

    const msgYear = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
    }).format(date);
    const currentYear = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
    }).format(now);

    if (msgYear === currentYear) {
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(date);
    }

    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  const pinnedMessages = useMemo(
    () =>
      messages
        .filter((m) => m.pinned)
        .sort(
          (a, b) =>
            new Date(b.pinnedAt || b.createdAt).getTime() -
            new Date(a.pinnedAt || a.createdAt).getTime()
        ),
    [messages]
  );

  const scrollToMessage = useCallback((msgId) => {
    messageRefs.current[msgId]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, []);

  return (
    <div className={`announcement-channel${embedded ? " embedded" : ""}`}>
      {!embedded && (
      <div className="announcement-header">
        <div className="announcement-header-content">
          <Megaphone size={18} />
          <span className="announcement-title">Company Announcements</span>
        </div>
        <button onClick={onClose} className="announcement-close-btn" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      )}

      <div className="announcement-messages">
        {pinnedMessages.length > 0 && (
          <div className="announcement-pinned-bar" role="region" aria-label="Pinned announcements">
            {pinnedMessages.map((msg) => {
              const preview = getPinnedPreview(msg);
              const truncated =
                preview.length > 72 ? `${preview.slice(0, 72)}…` : preview;
              return (
                <button
                  key={`pin-${msg._id}`}
                  type="button"
                  className="announcement-pinned-item"
                  onClick={() => scrollToMessage(msg._id)}
                  title={preview}
                >
                  <Pin size={14} className="announcement-pinned-item-icon" aria-hidden="true" />
                  <span className="announcement-pinned-item-text">{truncated}</span>
                </button>
              );
            })}
          </div>
        )}
        {loading ? (
          <div className="announcement-loading">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="announcement-empty">
            <Megaphone size={32} />
            <p>No announcements yet</p>
            <span>Be the first to post!</span>
          </div>
        ) : (
          messages.map((msg, index) => {
            // Safety check for sender object
            if (!msg.sender) {
              console.warn('Message missing sender:', msg);
              return null;
            }
            
            const isOwn = isCurrentUser(msg.sender._id);
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const showDateDivider = !prevMsg || !isSameISTDay(msg.createdAt, prevMsg.createdAt);
            const showAvatar = showDateDivider || index === 0 || messages[index - 1]?.sender?._id !== msg.sender._id;
            const showName = showAvatar;
            const isEditing = editingId === msg._id;
            
            // Get sender name with fallback
            const senderName = msg.sender.firstName && msg.sender.lastName 
              ? `${msg.sender.firstName} ${msg.sender.lastName}`
              : msg.sender.fullName || 'Unknown User';
            
            return (
              <Fragment key={msg._id}>
              {showDateDivider && (
                <div className="announcement-date-divider" role="separator">
                  <span>{formatDateDivider(msg.createdAt)}</span>
                </div>
              )}
              <div 
                className={`announcement-message-wrapper ${isOwn ? 'own-message' : 'other-message'}`}
                ref={(el) => {
                  if (el) messageRefs.current[msg._id] = el;
                }}
                id={`announcement-msg-${msg._id}`}
              >
                {!isOwn && showAvatar && (
                  <div className="announcement-message-avatar">
                    <UserAvatar user={msg.sender} size="xs" />
                  </div>
                )}
                {!isOwn && !showAvatar && <div className="announcement-message-avatar-spacer" />}
                
                <div className="announcement-message-group">
                  {showName && (
                    <div className={`announcement-sender-label ${isOwn ? 'own' : ''}`}>
                      {isOwn ? 'You' : senderName}
                      {msg.pinned && <Pin size={12} className="pinned-icon" />}
                    </div>
                  )}
                  
                  {isEditing ? (
                    <div className="announcement-edit-container">
                      <textarea
                        className="announcement-edit-input"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        maxLength={1000}
                        autoFocus
                      />
                      <div className="announcement-edit-actions">
                        <button onClick={() => handleSaveEdit(msg._id)} className="edit-save-btn">
                          Save
                        </button>
                        <button onClick={handleCancelEdit} className="edit-cancel-btn">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="announcement-bubble-wrapper group">
                        {msg.contentType === "poll" ? (
                          <PollMessage
                            msg={msg}
                            isOwn={isOwn}
                            onVoted={handlePollVoted}
                          />
                        ) : (
                        <div className={`announcement-message-bubble ${isOwn ? 'own' : ''} ${msg.pinned ? 'pinned' : ''}`}>
                          {msg.message}
                        </div>
                        )}
                        {(canEditDelete(msg) || canPin() || (isAdminOrHr && onAdminViewReceipts)) && (
                          <>
                            <button 
                              className="message-menu-btn"
                              onClick={() => setMenuOpen(menuOpen === msg._id ? null : msg._id)}
                              aria-label="Message options"
                            >
                              <MoreVertical size={16} strokeWidth={2} />
                            </button>
                            
                            {menuOpen === msg._id && (
                              <div className="message-menu">
                                {isAdminOrHr && onAdminViewReceipts && (
                                  <button onClick={() => { onAdminViewReceipts(msg._id); setMenuOpen(null); }}>
                                    <Eye size={13} /> View read receipts
                                  </button>
                                )}
                                {isAdminOrHr && msg.contentType === "poll" && !msg.poll?.isClosed && (
                                  <button onClick={() => handleClosePoll(msg._id)}>
                                    <Lock size={13} /> Close poll
                                  </button>
                                )}
                                {canEditDelete(msg) && msg.contentType !== "poll" && (
                                  <>
                                    <button onClick={() => handleEdit(msg)}>
                                      <Edit2 size={13} /> Edit
                                    </button>
                                    <button onClick={() => handleDelete(msg._id)} className="delete-btn">
                                      <Trash2 size={13} /> Delete
                                    </button>
                                  </>
                                )}
                                {canEditDelete(msg) && msg.contentType === "poll" && (
                                  <button onClick={() => handleDelete(msg._id)} className="delete-btn">
                                    <Trash2 size={13} /> Delete
                                  </button>
                                )}
                                {canPin() && (
                                  <button onClick={() => handlePin(msg)}>
                                    {msg.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                                    {msg.pinned ? 'Unpin' : 'Pin'}
                                  </button>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <div className={`announcement-message-time ${isOwn ? 'own' : ''}`}>
                        <span className="announcement-message-time-value">{formatMessageTime(msg.createdAt)}</span>
                        {msg.updatedAt && msg.updatedAt !== msg.createdAt && (
                          <span className="announcement-message-edited">edited</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
              </Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {isAdminOrHr && activeTeaBreak && (
        <div className="announcement-tea-break-active">
          <div className="announcement-tea-break-active-header">
            <span className="announcement-tea-break-active-icon" aria-hidden="true">
              {activeTeaBreak.teaBreakType === 'lunch' ? '🍽️' : '☕'}
            </span>
            <div className="announcement-tea-break-active-label">
              {activeTeaBreak.teaBreakType === 'lunch' 
                ? 'Lunch break is live'
                : activeTeaBreak.teaBreakType === 'evening' 
                  ? 'Evening tea break is live' 
                  : 'Morning tea break is live'
              }
            </div>
          </div>
          <button
            type="button"
            onClick={handleStopTeaBreak}
            disabled={stoppingTeaBreak}
            className="announcement-tea-break-stop-btn"
          >
            <OctagonX size={16} strokeWidth={2} aria-hidden="true" />
            {stoppingTeaBreak ? 'Ending break…' : 'End Break for All'}
          </button>
        </div>
      )}

      {isAdminOrHr && (
        <div className="announcement-tea-break-options">
          <label className="announcement-tea-break-checkbox">
            <input
              type="checkbox"
              checked={isTeaBreakAnnouncement}
              onChange={(e) => setIsTeaBreakAnnouncement(e.target.checked)}
            />
            <span className="announcement-tea-break-checkbox-box" aria-hidden="true" />
            <span className="announcement-tea-break-checkbox-label">Apply bulk break to all employees</span>
          </label>
          {isTeaBreakAnnouncement && (
            <div className="announcement-tea-break-selector" role="group" aria-label="Break type">
              <button
                type="button"
                className={`announcement-tea-break-option${teaBreakType === 'morning' ? ' active' : ''}`}
                onClick={() => setTeaBreakType('morning')}
                aria-pressed={teaBreakType === 'morning'}
              >
                Morning Tea
              </button>
              <button
                type="button"
                className={`announcement-tea-break-option${teaBreakType === 'evening' ? ' active' : ''}`}
                onClick={() => setTeaBreakType('evening')}
                aria-pressed={teaBreakType === 'evening'}
              >
                Evening Tea
              </button>
              <button
                type="button"
                className={`announcement-tea-break-option${teaBreakType === 'lunch' ? ' active' : ''}`}
                onClick={() => setTeaBreakType('lunch')}
                aria-pressed={teaBreakType === 'lunch'}
              >
                Lunch Break
              </button>
            </div>
          )}
        </div>
      )}

      <div className="announcement-input-container">
        <button
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="announcement-emoji-btn"
          aria-label="Add emoji"
        >
          <Smile size={20} strokeWidth={1.5} />
        </button>
        
        {showEmojiPicker && (
          <EmojiPicker 
            onSelect={handleEmojiSelect} 
            onClose={() => setShowEmojiPicker(false)} 
          />
        )}
        
        <input
          ref={inputRef}
          className="announcement-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Write a message..."
          maxLength={1000}
          disabled={sending}
        />
        <button
          onClick={sendMessage}
          className="announcement-send-btn"
          disabled={!input.trim() || sending}
          aria-label="Send message"
          type="button"
        >
          <Send size={18} className="text-white" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

export default AnnouncementChannel;
