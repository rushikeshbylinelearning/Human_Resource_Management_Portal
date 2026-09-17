import { useState, useEffect, useRef, Suspense } from "react";
import Megaphone from "lucide-react/dist/esm/icons/megaphone";
import AnnouncementModal from "./announcements/AnnouncementModal";
import { lazyWithRetry } from "../utils/lazyWithRetry";
import api from "../api/axios";
import socket from "../socket";
import { useAuth } from "../context/AuthContext";
import soundManager from "../services/NotificationSoundManager";
import useDesktopNotification from "../hooks/useDesktopNotification";
import { OPEN_ANNOUNCEMENT_HUB_EVENT } from "../utils/announcementHubEvents";
import "../styles/AnnouncementDropdown.css";

const AnnouncementHub = lazyWithRetry(() => import("./announcements/AnnouncementHub"));

const AnnouncementDropdown = () => {
  const [open, setOpen] = useState(false);
  const [hubState, setHubState] = useState({ tab: "feed", announcementId: null });
  const [hasUnread, setHasUnread] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastReadTime, setLastReadTime] = useState(null);
  const [lastReadTimeLoading, setLastReadTimeLoading] = useState(true); // NEW: Prevent race condition
  const dropdownRef = useRef(null);
  const channelRef = useRef(null);
  const seenAnnouncementIdsRef = useRef(new Set());
  const { user } = useAuth();
  const { showAnnouncementNotification, requestPermission } = useDesktopNotification();

  // Open hub from desktop notifications or deep links
  useEffect(() => {
    const handleOpenHub = (event) => {
      const { tab = "insights", announcementId = null } = event.detail || {};
      setHubState({ tab, announcementId });
      setOpen(true);
      setHasUnread(false);
      setUnreadCount(0);
    };

    window.addEventListener(OPEN_ANNOUNCEMENT_HUB_EVENT, handleOpenHub);
    return () => window.removeEventListener(OPEN_ANNOUNCEMENT_HUB_EVENT, handleOpenHub);
  }, []);

  // Load last read time from backend (with localStorage fallback) and request notification permission
  useEffect(() => {
    const loadLastReadTime = async () => {
      setLastReadTimeLoading(true); // Start loading
      
      try {
        // Try to fetch from backend first (cross-device sync)
        const { data } = await api.get('/announcements/last-read');
        
        if (data.lastReadTime) {
          const backendTime = new Date(data.lastReadTime);
          setLastReadTime(backendTime);
          // Update localStorage to match backend
          localStorage.setItem('announcements_last_read', data.lastReadTime);
          if (import.meta.env.DEV) console.log('[AnnouncementDropdown] Loaded lastReadTime from backend:', data.lastReadTime);
        } else {
          // Explicitly set to null (user never read)
          setLastReadTime(null);
          if (import.meta.env.DEV) console.log('[AnnouncementDropdown] No lastReadTime in backend (fresh user)');
          
          // Fallback to localStorage if backend has no record
          const stored = localStorage.getItem('announcements_last_read');
          if (stored) {
            setLastReadTime(new Date(stored));
            if (import.meta.env.DEV) console.log('[AnnouncementDropdown] Loaded lastReadTime from localStorage:', stored);
          }
        }
      } catch (error) {
        console.error('[AnnouncementDropdown] Error loading lastReadTime from backend:', error);
        
        // Fallback to localStorage on error
        const stored = localStorage.getItem('announcements_last_read');
        if (stored) {
          setLastReadTime(new Date(stored));
          if (import.meta.env.DEV) console.log('[AnnouncementDropdown] Fallback to localStorage:', stored);
        } else {
          setLastReadTime(null);
        }
      } finally {
        setLastReadTimeLoading(false); // Done loading
        if (import.meta.env.DEV) console.log('[AnnouncementDropdown] lastReadTime loading complete');
      }
    };

    loadLastReadTime();

    // Request desktop notification permission on mount
    requestPermission();

    // Initialize BroadcastChannel for multi-tab sync
    if ('BroadcastChannel' in window) {
      channelRef.current = new BroadcastChannel('announcements_channel');
      
      channelRef.current.onmessage = (event) => {
        if (import.meta.env.DEV) console.log('[AnnouncementDropdown] BroadcastChannel message:', event.data);
        
        if (event.data.type === 'MARK_READ') {
          // Another tab marked announcements as read
          setHasUnread(false);
          setUnreadCount(0);
          setLastReadTime(new Date(event.data.timestamp));
          localStorage.setItem('announcements_last_read', event.data.timestamp);
        } else if (event.data.type === 'NEW_ANNOUNCEMENT') {
          // Another tab received a new announcement
          setUnreadCount(prev => prev + 1);
          setHasUnread(true);
        }
      };

      if (import.meta.env.DEV) console.log('[AnnouncementDropdown] BroadcastChannel initialized');
    } else {
      console.warn('[AnnouncementDropdown] BroadcastChannel not supported');
    }

    return () => {
      // Cleanup BroadcastChannel on unmount
      if (channelRef.current) {
        channelRef.current.close();
        if (import.meta.env.DEV) console.log('[AnnouncementDropdown] BroadcastChannel closed');
      }
    };
  }, [requestPermission]);

  // Single unified check for unread messages (combines both checks)
  useEffect(() => {
    const checkUnreadMessages = async () => {
      // FIX: Don't calculate if still loading lastReadTime (prevents race condition)
      if (lastReadTimeLoading) {
        if (import.meta.env.DEV) console.log('[AnnouncementDropdown] Skipping unread calc - still loading lastReadTime');
        return;
      }
      
      try {
        const response = await api.get('/announcements');
        const messages = response.data;
        
        if (messages.length === 0) {
          setHasUnread(false);
          setUnreadCount(0);
          return;
        }

        // Filter out messages from current user
        const otherUsersMessages = messages.filter(msg => {
          const senderId = msg.sender?._id || msg.sender?.id;
          const currentUserId = user?._id || user?.id;
          return senderId !== currentUserId;
        });

        if (lastReadTime) {
          const unreadMessages = otherUsersMessages.filter(msg => 
            new Date(msg.createdAt) > lastReadTime
          );
          setUnreadCount(unreadMessages.length);
          setHasUnread(unreadMessages.length > 0);
          if (import.meta.env.DEV) console.log('[AnnouncementDropdown] Unread count calculated:', unreadMessages.length, 'lastReadTime:', lastReadTime.toISOString());
        } else {
          // No last read time means all messages from others are unread
          setUnreadCount(otherUsersMessages.length);
          setHasUnread(otherUsersMessages.length > 0);
          if (import.meta.env.DEV) console.log('[AnnouncementDropdown] No lastReadTime - all messages unread:', otherUsersMessages.length);
        }
      } catch (error) {
        console.error('Error checking unread messages:', error);
        // Set defaults on error to prevent infinite loops
        setHasUnread(false);
        setUnreadCount(0);
      }
    };

    // Only check if not currently open
    if (!open) {
      checkUnreadMessages();
      // PERFORMANCE FIX: Increased polling interval 30s → 5 minutes.
      // Real-time new announcements are delivered via Socket.IO (receiveAnnouncement event below).
      // This poll is only a fallback for when socket is disconnected.
      // 5 min is sufficient — announcements are not time-critical to the second.
      const interval = setInterval(() => {
        // Skip the HTTP poll if socket is connected — socket will push new announcements
        if (socket.connected) return;
        checkUnreadMessages();
      }, 5 * 60 * 1000); // 5 minutes
      return () => clearInterval(interval);
    }
  }, [lastReadTime, lastReadTimeLoading, open, user]); // Added lastReadTimeLoading dependency

  // Socket reconnection handler - refetch announcements on reconnect
  useEffect(() => {
    const handleReconnect = () => {
      if (import.meta.env.DEV) console.log('[AnnouncementDropdown] Socket reconnected, refetching announcements');
      
      // Refetch announcements to catch any missed during disconnect
      api.get('/announcements')
        .then(response => {
          const messages = response.data;
          
          // Recalculate unread count
          const otherUsersMessages = messages.filter(msg => {
            const senderId = msg.sender?._id || msg.sender?.id;
            const currentUserId = user?._id || user?.id;
            return senderId !== currentUserId;
          });

          if (lastReadTime) {
            const unreadMessages = otherUsersMessages.filter(msg => 
              new Date(msg.createdAt) > lastReadTime
            );
            setUnreadCount(unreadMessages.length);
            setHasUnread(unreadMessages.length > 0);
          } else {
            setUnreadCount(otherUsersMessages.length);
            setHasUnread(otherUsersMessages.length > 0);
          }
        })
        .catch(error => {
          console.error('[AnnouncementDropdown] Error refetching on reconnect:', error);
        });
    };

    socket.on('connect', handleReconnect);

    return () => {
      socket.off('connect', handleReconnect);
    };
  }, [lastReadTime, user]);

  // Listen for real-time announcements to update badge, play sound, and show desktop notification
  useEffect(() => {
    const handleNewAnnouncement = (msg) => {
      if (!msg?._id || seenAnnouncementIdsRef.current.has(msg._id)) {
        return;
      }
      seenAnnouncementIdsRef.current.add(msg._id);

      // Only show notification if dropdown is closed and message is from another user
      if (!open) {
        const senderId = msg.sender?._id || msg.sender?.id;
        const currentUserId = user?._id || user?.id;
        
        if (senderId !== currentUserId) {
          // Update badge
          setUnreadCount(prev => prev + 1);
          setHasUnread(true);
          
          // Broadcast to other tabs
          if (channelRef.current) {
            channelRef.current.postMessage({ 
              type: 'NEW_ANNOUNCEMENT',
              timestamp: new Date().toISOString()
            });
          }
          
          // Play announcement sound
          soundManager.playAnnouncement();
          
          // Tea break desktop toast is handled by TeaBreakContext (☕ Tea Break Started!)
          if (!msg.isTEABreak) {
            showAnnouncementNotification(msg, () => {
              // When notification is clicked, open the dropdown
              setOpen(true);
            });
          }
        }
      }
    };

    socket.on("receiveAnnouncement", handleNewAnnouncement);

    return () => {
      socket.off("receiveAnnouncement", handleNewAnnouncement);
    };
  }, [open, user, showAnnouncementNotification]);

  const handleOpen = async () => {
    setHubState({ tab: "feed", announcementId: null });
    setOpen(true);
    
    // Immediately hide badge
    setHasUnread(false);
    setUnreadCount(0);
    
    // Mark as read with current timestamp
    const now = new Date();
    setLastReadTime(now);
    const timestamp = now.toISOString();
    localStorage.setItem('announcements_last_read', timestamp);
    
    // Persist to backend for cross-device sync
    try {
      await api.post('/announcements/mark-read');
      if (import.meta.env.DEV) console.log('[AnnouncementDropdown] Marked as read on backend');
    } catch (error) {
      console.error('[AnnouncementDropdown] Error marking as read on backend:', error);
      // Continue with localStorage fallback (already saved above)
    }
    
    // Broadcast to other tabs
    if (channelRef.current) {
      channelRef.current.postMessage({ 
        type: 'MARK_READ',
        timestamp: timestamp
      });
      if (import.meta.env.DEV) console.log('[AnnouncementDropdown] Broadcasted MARK_READ to other tabs');
    }
  };

  const handleClose = async () => {
    if (!open) return;
    setOpen(false);
    
    // Update lastReadTime again when closing to ensure it's saved
    const now = new Date();
    setLastReadTime(now);
    const timestamp = now.toISOString();
    localStorage.setItem('announcements_last_read', timestamp);
    
    // Persist to backend
    try {
      await api.post('/announcements/mark-read');
    } catch (error) {
      console.error('[AnnouncementDropdown] Error marking as read on close:', error);
    }
  };

  return (
    <div className="announcement-dropdown-container" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        className="announcement-icon-btn"
        aria-label="Announcements"
      >
        <Megaphone 
          size={20} 
          className={`announcement-icon ${hasUnread ? 'has-unread' : ''}`} 
        />
        {!open && unreadCount > 0 && (
          <span className={`announcement-badge ${hasUnread ? 'pulse' : ''}`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnnouncementModal
        open={open}
        onClose={handleClose}
        ariaLabel="Company announcements"
      >
        <Suspense fallback={<div className="announcement-hub-loading">Loading announcements…</div>}>
          <AnnouncementHub
            onClose={handleClose}
            initialTab={hubState.tab}
            initialAnnouncementId={hubState.announcementId}
          />
        </Suspense>
      </AnnouncementModal>
    </div>
  );
};

export default AnnouncementDropdown;
