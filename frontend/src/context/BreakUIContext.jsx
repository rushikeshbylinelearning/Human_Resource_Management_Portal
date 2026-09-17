import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const BreakUIContext = createContext(null);

/** Grace window after a local end-break: ignore stale backend payloads that still show the same break as active. */
export const BREAK_UI_RECONCILE_GRACE_MS = 90 * 1000;

const toMs = (t) => {
  if (t == null) return NaN;
  if (typeof t === 'number' && Number.isFinite(t)) return t;
  const ms = new Date(t).getTime();
  return ms;
};

/** True when a break record matches the locally ended break (id and/or startTime). Never matches id "local". */
export const breakMatchesEnded = (breakLike, ended) => {
  if (!breakLike || !ended) return false;
  const bid = breakLike._id || breakLike.id;
  const endedId = ended.id;
  if (
    endedId &&
    endedId !== 'local' &&
    bid &&
    String(bid) !== 'local' &&
    String(bid) === String(endedId)
  ) {
    return true;
  }
  const a = toMs(ended.startTime);
  const b = toMs(breakLike.startTime);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
};

const getBackendActiveBreak = (dailyStatus) => {
  const breaks = dailyStatus?.breaks;
  if (Array.isArray(breaks)) {
    const active = breaks.find((b) => b && !b.endTime);
    if (active && active.startTime) {
      return {
        id: active._id || active.id || 'backend',
        type: active.breakType || active.type,
        startTime: active.startTime,
        source: 'backend',
      };
    }
  }

  const activeBreak = dailyStatus?.activeBreak;
  if (activeBreak && activeBreak.startTime) {
    return {
      id: activeBreak._id || activeBreak.id || 'backend',
      type: activeBreak.breakType || activeBreak.type,
      startTime: activeBreak.startTime,
      source: 'backend',
    };
  }

  return null;
};

export const BreakUIProvider = ({ children }) => {
  const [uiBreakState, setUiBreakState] = useState(null);
  const [locallyEndedBreak, setLocallyEndedBreak] = useState(null);

  const lastClearedAtRef = useRef(0);
  const lastClearedBreakKeyRef = useRef(null);
  const uiBreakStateRef = useRef(null);
  const locallyEndedBreakRef = useRef(null);

  uiBreakStateRef.current = uiBreakState;
  locallyEndedBreakRef.current = locallyEndedBreak;

  const isWithinGrace = useCallback((endedAt) => {
    const at = endedAt ?? lastClearedAtRef.current;
    return !!at && Date.now() < at + BREAK_UI_RECONCILE_GRACE_MS;
  }, []);

  const startUiBreak = useCallback((breakType) => {
    const now = Date.now();
    setUiBreakState({
      id: 'local',
      type: breakType,
      startTime: now,
      source: 'ui',
    });
  }, []);

  const endUiBreak = useCallback(() => {
    const prev = uiBreakStateRef.current;
    const endedAt = Date.now();
    lastClearedAtRef.current = endedAt;
    lastClearedBreakKeyRef.current = prev?.id || prev?.startTime || null;

    // Keep an earlier real-break stamp if this is just rolling back an optimistic start
    // (end-then-start-fail should not drop the "A is ended" marker).
    const isOptimisticLocal = prev?.source === 'ui' && (prev?.id === 'local' || !prev);
    if (!(isOptimisticLocal && locallyEndedBreakRef.current)) {
      const snapshot = {
        id: prev?.id ?? null,
        startTime: prev?.startTime ?? null,
        endedAt,
      };
      locallyEndedBreakRef.current = snapshot;
      setLocallyEndedBreak(snapshot);
    }

    setUiBreakState(null);
  }, []);

  const clearLocallyEndedBreak = useCallback(() => {
    lastClearedAtRef.current = 0;
    lastClearedBreakKeyRef.current = null;
    locallyEndedBreakRef.current = null;
    setLocallyEndedBreak(null);
  }, []);

  const applyLocallyEndedOverlay = useCallback((breaks) => {
    const ended = locallyEndedBreak;
    if (!Array.isArray(breaks) || !ended || !isWithinGrace(ended.endedAt)) {
      return Array.isArray(breaks) ? breaks : [];
    }
    return breaks.map((b) => {
      if (!b || b.endTime) return b;
      if (!breakMatchesEnded(b, ended)) return b;
      return { ...b, endTime: new Date(ended.endedAt).toISOString() };
    });
  }, [locallyEndedBreak, isWithinGrace]);

  // Expire the overlay after the grace window so a later fetch is free to show server truth.
  useEffect(() => {
    if (!locallyEndedBreak) return;
    const remaining = locallyEndedBreak.endedAt + BREAK_UI_RECONCILE_GRACE_MS - Date.now();
    if (remaining <= 0) {
      locallyEndedBreakRef.current = null;
      setLocallyEndedBreak(null);
      return;
    }
    const t = setTimeout(() => {
      locallyEndedBreakRef.current = null;
      setLocallyEndedBreak(null);
    }, remaining);
    return () => clearTimeout(t);
  }, [locallyEndedBreak]);

  const reconcileFromBackend = useCallback((dailyStatus) => {
    const backend = getBackendActiveBreak(dailyStatus);
    const ended = locallyEndedBreakRef.current;
    const backendIsLocallyEnded = backend && ended && isWithinGrace(ended.endedAt) && breakMatchesEnded(backend, ended);

    const ignoreBackendUntil = lastClearedAtRef.current
      ? lastClearedAtRef.current + BREAK_UI_RECONCILE_GRACE_MS
      : 0;

    setUiBreakState((current) => {
      if (current) {
        if (current.source === 'ui' && backend) {
          // Stale payload of the just-ended break must not overwrite a newly started local break.
          if (backendIsLocallyEnded) {
            return current;
          }
          return {
            id: backend.id,
            type: backend.type,
            startTime: backend.startTime,
            source: 'backend',
          };
        }
        return current;
      }

      if (!backend) return null;

      if (ignoreBackendUntil && Date.now() < ignoreBackendUntil) {
        return null;
      }

      if (backendIsLocallyEnded) {
        return null;
      }

      const lastKey = lastClearedBreakKeyRef.current;
      const isSameAsCleared = lastKey && (String(lastKey) === String(backend.id) || String(lastKey) === String(backend.startTime));
      if (isSameAsCleared) {
        return null;
      }

      return backend;
    });
  }, [isWithinGrace]);

  const value = useMemo(
    () => ({
      uiBreakState,
      setUiBreakState,
      startUiBreak,
      endUiBreak,
      reconcileFromBackend,
      locallyEndedBreak,
      applyLocallyEndedOverlay,
      clearLocallyEndedBreak,
    }),
    [
      uiBreakState,
      startUiBreak,
      endUiBreak,
      reconcileFromBackend,
      locallyEndedBreak,
      applyLocallyEndedOverlay,
      clearLocallyEndedBreak,
    ]
  );

  return <BreakUIContext.Provider value={value}>{children}</BreakUIContext.Provider>;
};

export const useBreakUI = () => {
  const ctx = useContext(BreakUIContext);
  if (!ctx) {
    throw new Error('useBreakUI must be used within a BreakUIProvider');
  }
  return ctx;
};
