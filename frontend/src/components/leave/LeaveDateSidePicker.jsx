import { useCallback, useEffect, useState, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { format, isValid } from 'date-fns';
import CloseIcon from '@mui/icons-material/Close';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { getLeaveSidePanelPosition, LEAVE_MODAL_SELECTOR } from '../../utils/leaveSidePanelPosition';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import '../../styles/LeaveSidePanel.css';

const BoundStaticDatePicker = lazyWithRetry(() => import('../lazy/BoundStaticDatePicker'));

function formatDateDisplay(value) {
    if (!value || !isValid(value)) return '';
    return format(value, 'dd MMM yyyy');
}

const LeaveDateSidePicker = ({
    value,
    onChange,
    label,
    shouldDisableDate,
    minDate = null,
    disabled = false,
    allowClear = false,
    open,
    onOpenChange,
}) => {
    const [draft, setDraft] = useState(value);
    const [position, setPosition] = useState({ left: 0, top: 0 });

    const updatePosition = useCallback(() => {
        setPosition(getLeaveSidePanelPosition(LEAVE_MODAL_SELECTOR, 'left'));
    }, []);

    const openPanel = () => {
        if (disabled) return;
        setDraft(value);
        updatePosition();
        onOpenChange(true);
    };

    const closePanel = () => onOpenChange(false);

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
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closePanel();
            }
        };
        window.addEventListener('keydown', onKeyDown, true);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('keydown', onKeyDown, true);
        };
    }, [open, updatePosition]);

    const triggerId = `leave-date-${label.replace(/\s+/g, '-').toLowerCase()}`;

    return (
        <div>
            <button
                id={triggerId}
                type="button"
                className={`leave-date-trigger${open ? ' is-open' : ''}`}
                onClick={openPanel}
                disabled={disabled}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={label}
            >
                <span>
                    <span className="leave-date-trigger-label">{label}</span>
                    <span className={`leave-date-trigger-value${value ? '' : ' leave-date-trigger-placeholder'}`}>
                        {value ? formatDateDisplay(value) : 'Select date'}
                    </span>
                </span>
                <CalendarTodayIcon className="leave-date-trigger-icon" sx={{ fontSize: 20 }} />
            </button>

            {open &&
                createPortal(
                    <>
                        <button
                            type="button"
                            className="leave-side-backdrop"
                            aria-label={`Close ${label} picker`}
                            onClick={closePanel}
                        />
                        <div
                            className="leave-side-panel leave-side-panel--left"
                            role="dialog"
                            aria-modal="true"
                            aria-label={label}
                            style={{ left: `${position.left}px`, top: `${position.top}px` }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="leave-side-header">
                                <div>
                                    <h4>{label}</h4>
                                    <p>Pick a date for your leave request</p>
                                </div>
                                <button
                                    type="button"
                                    className="leave-side-close"
                                    onClick={closePanel}
                                    aria-label="Close"
                                >
                                    <CloseIcon sx={{ fontSize: 16 }} />
                                </button>
                            </div>

                            <div className="leave-side-body">
                                <Suspense fallback={<div className="leave-side-skeleton" aria-hidden="true" />}>
                                    <BoundStaticDatePicker
                                        value={draft}
                                        onChange={setDraft}
                                        shouldDisableDate={shouldDisableDate}
                                        minDate={minDate || undefined}
                                        displayStaticWrapperAs="desktop"
                                        slotProps={{
                                            actionBar: { actions: [] },
                                        }}
                                    />
                                </Suspense>
                            </div>

                            <div className="leave-side-actions">
                                <button
                                    type="button"
                                    className="leave-side-btn ghost"
                                    onClick={closePanel}
                                >
                                    Cancel
                                </button>
                                {allowClear && (
                                    <button
                                        type="button"
                                        className="leave-side-btn ghost"
                                        onClick={clearValue}
                                    >
                                        Clear
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="leave-side-btn primary"
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

export default LeaveDateSidePicker;
