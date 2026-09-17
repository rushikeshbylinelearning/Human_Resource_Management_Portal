import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { createPortal } from "react-dom";
import { format, isValid } from "date-fns";
import CalendarClock from "lucide-react/dist/esm/icons/calendar-clock";
import X from "lucide-react/dist/esm/icons/x";
import { lazyWithRetry } from "../../utils/lazyWithRetry";

const BoundStaticDateTimePicker = lazyWithRetry(() =>
  import("../lazy/BoundStaticDateTimePicker")
);

const PANEL_WIDTH = 368;
const PANEL_GAP = 20;
const VIEWPORT_PAD = 16;

function formatDisplay(value) {
  if (!value || !isValid(value)) return "";
  return format(value, "dd MMM yyyy, hh:mm aa");
}

function getSidePanelPosition() {
  const modal = document.querySelector(".apple-modal-card");
  if (!modal) {
    return {
      left: VIEWPORT_PAD,
      top: VIEWPORT_PAD,
    };
  }

  const rect = modal.getBoundingClientRect();
  let left = rect.left - PANEL_WIDTH - PANEL_GAP;
  const estimatedHeight = Math.min(520, window.innerHeight - VIEWPORT_PAD * 2);
  let top = rect.top + (rect.height - estimatedHeight) / 2;

  if (left < VIEWPORT_PAD) {
    left = VIEWPORT_PAD;
  }

  top = Math.max(
    VIEWPORT_PAD,
    Math.min(top, window.innerHeight - estimatedHeight - VIEWPORT_PAD)
  );

  return { left, top };
}

const PollCloseDateTime = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const triggerRef = useRef(null);

  const updatePosition = useCallback(() => {
    setPosition(getSidePanelPosition());
  }, []);

  const openPanel = () => {
    setDraft(value);
    updatePosition();
    setOpen(true);
  };

  const closePanel = () => setOpen(false);

  const applyDraft = () => {
    onChange(draft);
    closePanel();
  };

  const clearValue = () => {
    onChange(null);
    setDraft(null);
    closePanel();
  };

  useEffect(() => {
    if (!open) return undefined;

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closePanel();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, updatePosition]);

  return (
    <div className="poll-close-datetime">
      <label className="poll-close-datetime-label" htmlFor="poll-closes">
        Closes at (optional)
      </label>

      <div className="poll-close-datetime-row">
        <button
          ref={triggerRef}
          id="poll-closes"
          type="button"
          className={`poll-close-datetime-trigger${value ? " has-value" : ""}`}
          onClick={openPanel}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <CalendarClock size={16} className="poll-close-datetime-trigger-icon" />
          <span className="poll-close-datetime-trigger-text">
            {value ? formatDisplay(value) : "Select date and time"}
          </span>
        </button>

        {value && (
          <button
            type="button"
            className="poll-close-datetime-clear"
            onClick={clearValue}
            aria-label="Clear close date"
          >
            Clear
          </button>
        )}
      </div>

      <p className="poll-close-datetime-hint">
        Leave empty to keep the poll open until you close it manually.
      </p>

      {open &&
        createPortal(
          <>
            <button
              type="button"
              className="poll-datetime-side-backdrop"
              aria-label="Close date picker"
              onClick={closePanel}
            />
            <div
              className="poll-datetime-side-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Select poll close date and time"
              style={{
                left: `${position.left}px`,
                top: `${position.top}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="poll-datetime-side-header">
                <div>
                  <h4>Close poll at</h4>
                  <p>Pick when voting should end</p>
                </div>
                <button
                  type="button"
                  className="poll-datetime-side-close"
                  onClick={closePanel}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="poll-datetime-side-body">
                <Suspense fallback={<div className="poll-datetime-side-skeleton" aria-hidden="true" />}>
                  <BoundStaticDateTimePicker
                    value={draft}
                    onChange={setDraft}
                    disablePast
                    ampm
                    displayStaticWrapperAs="desktop"
                    slotProps={{
                      actionBar: { actions: [] },
                    }}
                  />
                </Suspense>
              </div>

              <div className="poll-datetime-side-actions">
                <button
                  type="button"
                  className="poll-datetime-side-btn ghost"
                  onClick={closePanel}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="poll-datetime-side-btn ghost"
                  onClick={clearValue}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="poll-datetime-side-btn primary"
                  onClick={applyDraft}
                  disabled={!draft || !isValid(draft)}
                >
                  Apply
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
};

export default PollCloseDateTime;
