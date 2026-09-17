import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    CircularProgress,
    IconButton,
    Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import FreeBreakfastOutlinedIcon from '@mui/icons-material/FreeBreakfastOutlined';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import TimerOffOutlinedIcon from '@mui/icons-material/TimerOffOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import api from '../api/axios';
import { formatISTTime, formatISTTimeHHMM, getISTDateString, getISTNow } from '../utils/istTime';
import '../styles/BulkAttendanceAssistant.css';

const ACTION_META = {
    refresh_live_attendance: {
        label: 'Refresh live attendance',
        shortLabel: 'Refresh attendance',
        icon: RefreshIcon,
    },
    stop_tea_breaks: {
        label: 'Stop all tea breaks',
        shortLabel: 'Stop tea breaks',
        icon: FreeBreakfastOutlinedIcon,
    },
    end_lunch_breaks: {
        label: 'End all lunch breaks',
        shortLabel: 'End lunch breaks',
        icon: RestaurantOutlinedIcon,
    },
    end_other_breaks: {
        label: 'End all other breaks',
        shortLabel: 'End other breaks',
        icon: PauseCircleOutlineIcon,
    },
    overwrite_tea_break_overruns: {
        label: 'Clear tea break overruns',
        shortLabel: 'Clear overruns',
        icon: TimerOffOutlinedIcon,
    },
    checkout_all_employees: {
        label: 'Check out all employees',
        shortLabel: 'Check out all',
        icon: LogoutOutlinedIcon,
    },
};

const getCurrentIstHHmm = () => {
    const formatted = formatISTTimeHHMM(getISTNow());
    const match = String(formatted).match(/(\d{1,2}):(\d{2})/);
    if (!match) return '18:00';
    return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
};

const formatSelectedTimeLabel = (hhmm) => {
    if (!hhmm) return '';
    const today = getISTDateString(getISTNow());
    return formatISTTime(new Date(`${today}T${hhmm}:00+05:30`), {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
};

const POSITION_KEY = 'baa-position';
const DRAG_THRESHOLD_PX = 6;
const FAB_SIZE = 56;

const loadSavedPosition = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
        if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            return parsed;
        }
    } catch {
        /* ignore */
    }
    return null;
};

const clampPosition = (x, y) => {
    const pad = 8;
    const maxX = Math.max(pad, window.innerWidth - FAB_SIZE - pad);
    const maxY = Math.max(pad, window.innerHeight - FAB_SIZE - pad);
    return {
        x: Math.min(Math.max(pad, x), maxX),
        y: Math.min(Math.max(pad, y), maxY),
    };
};

const getDefaultPosition = () => {
    const bottomOffset = window.location.pathname === '/admin/attendance-summary' ? 96 : 20;
    return clampPosition(
        window.innerWidth - 24 - FAB_SIZE,
        window.innerHeight - bottomOffset - FAB_SIZE,
    );
};

const BulkAttendanceAssistant = ({ onActionComplete }) => {
    const [open, setOpen] = useState(false);
    const [preview, setPreview] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [selectedAction, setSelectedAction] = useState(null);
    const [checkoutTime, setCheckoutTime] = useState('');
    const [status, setStatus] = useState(null);
    const [position, setPosition] = useState(() => {
        const saved = loadSavedPosition() || getDefaultPosition();
        return clampPosition(saved.x, saved.y);
    });
    const [dragging, setDragging] = useState(false);

    const rootRef = useRef(null);
    const dragCleanupRef = useRef(null);
    const suppressClickRef = useRef(false);

    const persistPosition = useCallback((next) => {
        setPosition(next);
        try {
            localStorage.setItem(POSITION_KEY, JSON.stringify(next));
        } catch {
            /* ignore */
        }
    }, []);

    const startDrag = useCallback((event) => {
        if (event.button != null && event.button !== 0) return;

        const origin = rootRef.current?.getBoundingClientRect();
        const originX = origin?.left ?? position.x;
        const originY = origin?.top ?? position.y;
        const pointerId = event.pointerId;
        const startX = event.clientX;
        const startY = event.clientY;
        const drag = { moved: false, last: { x: originX, y: originY } };

        const onMove = (ev) => {
            if (ev.pointerId !== pointerId) return;
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (!drag.moved && (dx * dx + dy * dy) < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
                return;
            }
            drag.moved = true;
            setDragging(true);
            ev.preventDefault();
            const next = clampPosition(originX + dx, originY + dy);
            drag.last = next;
            const node = rootRef.current;
            if (node) {
                node.style.left = `${next.x}px`;
                node.style.top = `${next.y}px`;
            }
        };

        const onUp = (ev) => {
            if (ev.pointerId !== pointerId) return;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            dragCleanupRef.current = null;
            setDragging(false);
            if (drag.moved) {
                suppressClickRef.current = true;
                persistPosition(drag.last);
                window.setTimeout(() => {
                    suppressClickRef.current = false;
                }, 50);
            }
        };

        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        dragCleanupRef.current = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
    }, [persistPosition]);

    useEffect(() => () => {
        dragCleanupRef.current?.();
    }, []);

    useEffect(() => {
        const onResize = () => {
            setPosition((prev) => clampPosition(prev.x, prev.y));
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const fetchPreview = useCallback(async () => {
        setLoadingPreview(true);
        try {
            const { data } = await api.get('/admin/bulk-attendance-actions/preview');
            setPreview(data?.actions ?? null);
        } catch (err) {
            setStatus({
                type: 'error',
                text: err.response?.data?.error || 'Could not load actions. Please try again.',
            });
        } finally {
            setLoadingPreview(false);
        }
    }, []);

    useEffect(() => {
        if (open) {
            setStatus(null);
            setSelectedAction(null);
            setCheckoutTime(getCurrentIstHHmm());
            fetchPreview();
        }
    }, [open, fetchPreview]);

    useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open]);

    const handleClose = () => {
        setOpen(false);
        setSelectedAction(null);
        setCheckoutTime('');
        setStatus(null);
    };

    const handleSelectAction = (actionKey) => {
        setStatus(null);
        setSelectedAction(actionKey);
        if (actionKey === 'checkout_all_employees') {
            setCheckoutTime((prev) => prev || getCurrentIstHHmm());
        }
    };

    const handleBack = () => {
        setSelectedAction(null);
        setStatus(null);
    };

    const handleConfirm = async () => {
        if (!selectedAction || executing) return;

        if (selectedAction === 'checkout_all_employees' && !checkoutTime) {
            setStatus({ type: 'error', text: 'Select a checkout time first.' });
            return;
        }

        setExecuting(true);
        setStatus(null);

        try {
            const payload = {
                action: selectedAction,
                confirm: true,
            };
            if (selectedAction === 'checkout_all_employees') {
                payload.checkoutTime = checkoutTime;
            }

            const { data } = await api.post('/admin/bulk-attendance-actions/execute', payload);

            const count = data?.processedCount ?? 0;
            const failed = data?.failedCount ?? 0;
            const timeLabel = selectedAction === 'checkout_all_employees'
                ? ` at ${formatSelectedTimeLabel(checkoutTime)}`
                : '';
            const failedLabel = failed > 0 ? `, ${failed} skipped` : '';
            setStatus({
                type: 'success',
                text: `${ACTION_META[selectedAction].label} completed (${count} processed${failedLabel})${timeLabel}.`,
            });
            setSelectedAction(null);
            setPreview(null);
            await fetchPreview();
            onActionComplete?.(data);
        } catch (err) {
            setStatus({
                type: 'error',
                text: err.response?.data?.error || 'Action failed. Please try again.',
            });
        } finally {
            setExecuting(false);
        }
    };

    const selectedPreview = selectedAction ? preview?.[selectedAction] : null;
    const selectedMeta = selectedAction ? ACTION_META[selectedAction] : null;

    // Overrun detail list for the tea break overruns action
    const renderOverrunDetails = (overrunDetails) => {
        if (!overrunDetails || overrunDetails.length === 0) {
            return (
                <p className="baa-overrun-empty">No overruns found for today.</p>
            );
        }
        return (
            <ul className="baa-overrun-list">
                {overrunDetails.map((item) => (
                    <li key={item.userId} className="baa-overrun-item">
                        <span className="baa-overrun-name">
                            {item.fullName}
                            {item.employeeCode ? (
                                <span className="baa-overrun-code"> · {item.employeeCode}</span>
                            ) : null}
                        </span>
                        <span className="baa-overrun-badge">
                            +{item.overrunMinutes} min over
                        </span>
                    </li>
                ))}
            </ul>
        );
    };

    const renderClockedInEmployees = (employees) => {
        if (!employees || employees.length === 0) {
            return (
                <p className="baa-overrun-empty">No employees are clocked in right now.</p>
            );
        }
        return (
            <ul className="baa-overrun-list">
                {employees.map((item) => (
                    <li key={item.userId} className="baa-overrun-item">
                        <span className="baa-overrun-name">
                            {item.fullName}
                            {item.employeeCode ? (
                                <span className="baa-overrun-code"> · {item.employeeCode}</span>
                            ) : null}
                        </span>
                        <span className="baa-overrun-badge baa-overrun-badge--neutral">
                            In {item.clockInTime ? formatISTTime(item.clockInTime, { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
                        </span>
                    </li>
                ))}
            </ul>
        );
    };

    const isCheckoutAction = selectedAction === 'checkout_all_employees';
    const isOverrunAction = selectedAction === 'overwrite_tea_break_overruns';

    const ui = (
        <>
            {open && (
                <button
                    type="button"
                    className="baa-backdrop"
                    aria-label="Close bulk actions"
                    onClick={handleClose}
                />
            )}

            <div
                ref={rootRef}
                className={`baa-root${dragging ? ' baa-root--dragging' : ''}`}
                style={{ left: position.x, top: position.y }}
            >
                {open && (
                    <div className={`baa-panel${isCheckoutAction ? ' baa-panel--wide' : ''}`} role="dialog" aria-label="Bulk actions">
                    <header
                        className="baa-panel__header"
                        onPointerDown={startDrag}
                    >
                        <div className="baa-panel__title-wrap">
                            {selectedAction ? (
                                <IconButton
                                    size="small"
                                    onClick={handleBack}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    aria-label="Back to actions"
                                    className="baa-panel__back"
                                    disabled={executing}
                                >
                                    <ArrowBackIcon fontSize="small" />
                                </IconButton>
                            ) : null}
                            <div className="baa-panel__titles">
                                <div className="baa-panel__title">
                                    {selectedAction ? 'Confirm' : 'Bulk actions'}
                                </div>
                                {selectedAction && (
                                    <div className="baa-panel__subtitle">{selectedMeta?.shortLabel}</div>
                                )}
                            </div>
                        </div>
                        <IconButton
                            size="small"
                            onClick={handleClose}
                            onPointerDown={(e) => e.stopPropagation()}
                            aria-label="Close panel"
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </header>

                    <div className="baa-body">
                        {status && (
                            <div className={`baa-status baa-status--${status.type}`}>
                                {status.text}
                            </div>
                        )}

                        {loadingPreview && (
                            <div className="baa-loading">
                                <CircularProgress size={18} sx={{ color: '#d32f2f' }} />
                                <span>Loading…</span>
                            </div>
                        )}

                        {!loadingPreview && !selectedAction && preview && (
                            <ul className="baa-action-list">
                                {Object.entries(ACTION_META).map(([key, meta]) => {
                                    const Icon = meta.icon;
                                    const count = preview[key]?.affectedCount ?? 0;
                                    const isOverrun = key === 'overwrite_tea_break_overruns';
                                    const isCheckout = key === 'checkout_all_employees';
                                    return (
                                        <li key={key}>
                                            <button
                                                type="button"
                                                className="baa-action-item"
                                                onClick={() => handleSelectAction(key)}
                                            >
                                                <span className={`baa-action-item__icon${isOverrun ? ' baa-action-item__icon--amber' : ''}${isCheckout ? ' baa-action-item__icon--slate' : ''}`}>
                                                    <Icon fontSize="small" />
                                                </span>
                                                <span className="baa-action-item__label">{meta.shortLabel}</span>
                                                <span className={`baa-action-item__count${isOverrun && count > 0 ? ' baa-action-item__count--amber' : ''}`}>
                                                    {count}
                                                </span>
                                                <ChevronRightIcon className="baa-action-item__chevron" fontSize="small" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        {!loadingPreview && selectedAction && selectedPreview && (
                            <div className="baa-confirm">
                                <p className="baa-confirm__desc">{selectedPreview.description}</p>

                                {isOverrunAction && (
                                    <div className="baa-overrun-section">
                                        <div className="baa-overrun-header">
                                            Employees with overruns today
                                        </div>
                                        {renderOverrunDetails(selectedPreview.overrunDetails)}
                                    </div>
                                )}

                                {isCheckoutAction && (
                                    <>
                                        <div className="baa-time-field">
                                            <label htmlFor="baa-checkout-time">Checkout time (IST)</label>
                                            <div className="baa-time-field__row">
                                                <input
                                                    id="baa-checkout-time"
                                                    type="time"
                                                    value={checkoutTime}
                                                    onChange={(e) => setCheckoutTime(e.target.value)}
                                                    disabled={executing}
                                                />
                                                <span className="baa-time-field__preview">
                                                    {formatSelectedTimeLabel(checkoutTime) || 'Select time'}
                                                </span>
                                            </div>
                                            <p className="baa-time-field__hint">
                                                Applied to all clocked-in employees. Future times are not allowed.
                                            </p>
                                        </div>
                                        <div className="baa-overrun-section">
                                            <div className="baa-overrun-header">
                                                Currently clocked in
                                            </div>
                                            {renderClockedInEmployees(selectedPreview.employees)}
                                        </div>
                                    </>
                                )}

                                <div className="baa-confirm__impact">
                                    <span className="baa-confirm__impact-label">Affected</span>
                                    <span className={`baa-confirm__impact-value${isOverrunAction ? ' baa-confirm__impact-value--amber' : ''}`}>
                                        {selectedPreview.affectedCount}
                                    </span>
                                </div>
                                <div className="baa-confirm__actions">
                                    <button
                                        type="button"
                                        className={`baa-btn${isOverrunAction ? ' baa-btn--amber' : ' baa-btn--primary'}`}
                                        onClick={handleConfirm}
                                        disabled={executing || (isCheckoutAction && !checkoutTime)}
                                    >
                                        {executing && <CircularProgress size={16} color="inherit" />}
                                        {isOverrunAction ? 'Clear overruns' : isCheckoutAction ? 'Check out all' : 'Run action'}
                                    </button>
                                    <button
                                        type="button"
                                        className="baa-btn baa-btn--ghost"
                                        onClick={handleBack}
                                        disabled={executing}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <Tooltip
                title={open ? 'Close bulk actions' : 'Bulk actions'}
                placement="left"
                disableHoverListener={dragging}
            >
                <button
                    type="button"
                    className={`baa-fab${open ? ' baa-fab--open' : ''}`}
                    aria-label="Bulk actions"
                    aria-expanded={open}
                    onPointerDown={startDrag}
                    onClick={() => {
                        if (suppressClickRef.current) {
                            suppressClickRef.current = false;
                            return;
                        }
                        setOpen((prev) => !prev);
                    }}
                >
                    {open ? <CloseIcon /> : <BoltOutlinedIcon />}
                </button>
            </Tooltip>
            </div>
        </>
    );

    return createPortal(ui, document.body);
};

export default BulkAttendanceAssistant;
