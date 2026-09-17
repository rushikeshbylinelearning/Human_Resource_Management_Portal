import { useCallback, useEffect, useRef, useState } from 'react';

const FAB_SIZE = 56;
const MARGIN = 16;
const DRAG_THRESHOLD = 6;

const defaultPosition = { right: 24, bottom: 24 };

const readStoredPosition = (storageKey) => {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return defaultPosition;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.right === 'number' && typeof parsed?.bottom === 'number') {
            return parsed;
        }
    } catch {
        // Ignore invalid storage and fall back to the default corner.
    }
    return defaultPosition;
};

const clampPosition = (right, bottom) => {
    const maxRight = Math.max(MARGIN, window.innerWidth - FAB_SIZE - MARGIN);
    const maxBottom = Math.max(MARGIN, window.innerHeight - FAB_SIZE - MARGIN);
    return {
        right: Math.min(Math.max(MARGIN, right), maxRight),
        bottom: Math.min(Math.max(MARGIN, bottom), maxBottom),
    };
};

/**
 * Makes a fixed-position FAB draggable within the viewport.
 * A small movement is treated as a drag; a tap/click still fires onClick.
 */
export default function useDraggableFab(storageKey = 'hrQueryFabPosition') {
    const [position, setPosition] = useState(() => readStoredPosition(storageKey));
    const [isDragging, setIsDragging] = useState(false);

    const draggingRef = useRef(false);
    const didDragRef = useRef(false);
    const startRef = useRef({ x: 0, y: 0, right: defaultPosition.right, bottom: defaultPosition.bottom });

    useEffect(() => {
        setPosition((prev) => clampPosition(prev.right, prev.bottom));
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(position));
        } catch {
            // Storage can fail in private mode; dragging still works in-session.
        }
    }, [position, storageKey]);

    useEffect(() => {
        const onResize = () => {
            setPosition((prev) => clampPosition(prev.right, prev.bottom));
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const onPointerDown = useCallback((event) => {
        if (event.button != null && event.button !== 0) return;
        draggingRef.current = true;
        didDragRef.current = false;
        startRef.current = {
            x: event.clientX,
            y: event.clientY,
            right: position.right,
            bottom: position.bottom,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    }, [position.right, position.bottom]);

    const onPointerMove = useCallback((event) => {
        if (!draggingRef.current) return;
        const dx = event.clientX - startRef.current.x;
        const dy = event.clientY - startRef.current.y;
        if (!didDragRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!didDragRef.current) {
            didDragRef.current = true;
            setIsDragging(true);
        }
        setPosition(clampPosition(startRef.current.right - dx, startRef.current.bottom - dy));
    }, []);

    const endDrag = useCallback(() => {
        draggingRef.current = false;
        setIsDragging(false);
        // Click fires after pointerup; keep the drag flag briefly so the
        // drop does not open the chat, then clear it if no click arrives.
        window.setTimeout(() => {
            didDragRef.current = false;
        }, 80);
    }, []);

    const wrapClick = useCallback((onClick) => (event) => {
        if (didDragRef.current) {
            event.preventDefault();
            event.stopPropagation();
            didDragRef.current = false;
            return;
        }
        onClick?.(event);
    }, []);

    return {
        isDragging,
        wrapClick,
        dragHandlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
        },
        positionSx: {
            position: 'fixed',
            right: position.right,
            bottom: position.bottom,
            zIndex: 1200,
            width: FAB_SIZE,
            height: FAB_SIZE,
            minWidth: FAB_SIZE,
            minHeight: FAB_SIZE,
            cursor: isDragging ? 'grabbing' : 'grab',
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
        },
    };
}
