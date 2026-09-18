// frontend/src/components/onboarding/AppTour.jsx
// Premium guided application tour using driver.js.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useOnboarding } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useNavigate } from 'react-router-dom';
import OnboardingWelcome from './OnboardingWelcome';

const withWhy = (body, why) =>
    `${body}<div class="ams-tour-why"><strong>Why it matters:</strong> ${why}</div>`;

const EMPLOYEE_STEPS = [
    {
        popover: {
            title: '👋 Your Dashboard',
            description: withWhy(
                'This is your main workspace. Every attendance action, leave request, and notification is accessible from here.',
                'Knowing your way around saves time every day and ensures your records are always accurate.'
            ),
            side: 'over',
            align: 'center',
        },
    },
    {
        element: '[data-tour="attendance-card"]',
        popover: {
            title: "📅 Today's Attendance",
            description: withWhy(
                'This card shows your real-time status — <b>Clocked In</b>, <b>On Break</b>, or <b>Clocked Out</b>. Your shift timing, hours worked, and break usage all update live.',
                'Your attendance record directly affects your payroll and leave balance.'
            ),
            side: 'bottom',
            align: 'start',
        },
    },
    {
        element: '[data-tour="clock-in"]',
        popover: {
            title: '⏰ Clock In',
            description: withWhy(
                'Click <b>Check In</b> to start your workday. The system records your exact check-in time and GPS location — make sure location permissions are enabled in your browser.',
                'Late check-ins are flagged automatically, so always clock in on time.'
            ),
            side: 'bottom',
            align: 'start',
        },
    },
    {
        element: '[data-tour="break-btn"]',
        popover: {
            title: '☕ Break Options',
            description: withWhy(
                'After clocking in, a <b>Start Break</b> button appears here. You can choose from:<br>' +
                '<ul style="margin:6px 0 4px 0;padding-left:18px;font-size:0.85rem;">' +
                '<li><b>Paid Break</b> — does not deduct from your work hours</li>' +
                '<li><b>Unpaid Break</b> — personal break, deducted from hours</li>' +
                '<li><b>Extra Break</b> — requires manager approval</li>' +
                '</ul>' +
                'Tap the button to open the real break selection dialog.',
                'Unended breaks count against your productive hours and may affect your attendance score.'
            ),
            side: 'bottom',
            align: 'start',
        },
    },
    {
        element: '[data-tour="clock-out"]',
        popover: {
            title: '🏠 Clock Out',
            description: withWhy(
                'The <b>Check Out</b> button appears here after you clock in. ' +
                'Before it becomes active, a few conditions must be met:' +
                '<div class="ams-tour-logout-timeline">' +
                '  <div class="ams-tour-logout-row"><span class="ams-tour-logout-dot ams-green">✓</span><span>You have <b>Clocked In</b></span></div>' +
                '  <div class="ams-tour-logout-row"><span class="ams-tour-logout-dot ams-green">✓</span><span>Your <b>Required Working Hours</b> are completed</span></div>' +
                '  <div class="ams-tour-logout-row"><span class="ams-tour-logout-dot ams-red">✗</span><span>No <b>active break</b> is running</span></div>' +
                '</div>' +
                'Tap the button to see the real early checkout confirmation dialog.',
                'Always check out at the end of your shift. A missed checkout is recorded as an anomaly and can affect your pay.'
            ),
            side: 'bottom',
            align: 'start',
        },
    },
    {
        element: '[data-tour="required-logout"]',
        popover: {
            title: '🕖 Required Logout Time',
            description: withWhy(
                'Your <b>Required Log Out</b> time is calculated from your shift start, breaks taken, and company policy. Check Out becomes available once this time is reached.',
                'This ensures you complete your required working hours before leaving.'
            ),
            side: 'left',
            align: 'center',
        },
    },
    {
        element: '[data-tour="sidebar-leaves"]',
        popover: {
            title: '🌴 Leave Requests',
            description: withWhy(
                'Apply for <b>casual leave</b>, <b>sick leave</b>, or <b>planned leave</b> here. Your manager is notified instantly and you receive an approval or rejection notification.',
                'Leave requests must be submitted in advance — retroactive requests may not be approved.'
            ),
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '[data-tour="sidebar-attendance"]',
        popover: {
            title: '📅 Attendance Summary',
            description: withWhy(
                'View your complete attendance history, monthly summaries, and download reports for any date range in Excel or PDF.',
                'This is the first place to check if you have a payroll or attendance query.'
            ),
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '[data-tour="notification-bell"]',
        popover: {
            title: '🔔 Notifications',
            description: withWhy(
                'All system alerts, leave approvals, policy updates, and reminders appear here. Click the bell icon to open your notification drawer.',
                'Keep notifications enabled — important HR updates are sent here first.'
            ),
            side: 'bottom',
            align: 'end',
        },
    },
    {
        element: '[data-tour="sidebar-profile"]',
        popover: {
            title: '👤 Your Profile',
            description: withWhy(
                'Access your profile, personal details, emergency contacts, and bank information from here. You\'ll be prompted to complete your profile right after this tour.',
                'Complete profiles help HR process payroll, benefits, and emergency contacts correctly.'
            ),
            side: 'bottom',
            align: 'end',
        },
    },
    {
        popover: {
            title: '🎉 You\'re All Set!',
            description: withWhy(
                'You\'ve completed the guided tour. <b>Next step:</b> please fill in your profile — it only takes a few minutes. Click <b>Finish & Set Up Profile</b> to continue.',
                'A complete profile ensures you receive your salary, benefits, and emergency assistance without delays.'
            ),
            side: 'over',
            align: 'center',
        },
    },
];

const ADMIN_STEPS = [
    {
        popover: {
            title: '👋 Admin Dashboard',
            description: withWhy(
                'Welcome to the Admin Dashboard. This gives you a real-time overview of all employee attendance, leaves, and system health.',
                'Quick visibility into your team\'s attendance lets you address issues proactively.'
            ),
            side: 'over',
            align: 'center',
        },
    },
    {
        element: '[data-tour="sidebar-attendance"]',
        popover: {
            title: '📅 Attendance Summary',
            description: withWhy(
                'View detailed attendance reports across all employees. Filter by department, date range, or status. Export to Excel or PDF.',
                'Regular attendance review helps identify patterns — absenteeism, overtime, or shift compliance issues.'
            ),
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '[data-tour="sidebar-leaves"]',
        popover: {
            title: '🌴 Leave Management',
            description: withWhy(
                'Approve or reject leave requests, configure leave types and balances, and view the leave calendar across your team.',
                'Timely leave approvals keep employees informed and prevent unauthorized absences.'
            ),
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '[data-tour="notification-bell"]',
        popover: {
            title: '🔔 Notifications',
            description: withWhy(
                'System alerts, leave approval requests, and employee activity flags appear here. Click the bell to view and act on them.',
                'Real-time alerts let you respond quickly to urgent requests.'
            ),
            side: 'bottom',
            align: 'end',
        },
    },
    {
        element: '[data-tour="sidebar-profile"]',
        popover: {
            title: '👤 Your Profile',
            description: withWhy(
                'Manage your admin profile, update your details, and configure your account preferences from here.',
                'Keeping your profile current ensures system-generated documents list accurate authority details.'
            ),
            side: 'bottom',
            align: 'end',
        },
    },
    {
        popover: {
            title: '🎉 Tour Complete!',
            description: withWhy(
                'You\'re all set. Explore the sidebar to discover more features — Employees, Analytics, Scheduling, Policies, and more.',
                'Each section is designed to make managing your workforce faster and more reliable.'
            ),
            side: 'over',
            align: 'center',
        },
    },
];

const scrollIntoViewAndWait = (element, timeoutMs = 600) => {
    return new Promise((resolve) => {
        if (!element) { resolve(); return; }

        const rect = element.getBoundingClientRect();
        const inView =
            rect.top >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight);

        if (inView) { resolve(); return; }

        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

        let resolved = false;
        const timer = setTimeout(() => {
            if (!resolved) { resolved = true; resolve(); }
        }, timeoutMs);

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting && !resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    observer.disconnect();
                    setTimeout(resolve, 80);
                }
            },
            { threshold: 0.5 }
        );
        observer.observe(element);
    });
};

const getBestSide = (element) => {
    if (!element) return 'bottom';
    const rect = element.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const space = {
        bottom: vh - rect.bottom,
        right: vw - rect.right,
        left: rect.left,
        top: rect.top,
    };

    const priority = ['bottom', 'right', 'left', 'top'];
    const minSpace = { bottom: 300, right: 420, left: 420, top: 300 };

    for (const side of priority) {
        if (space[side] >= minSpace[side]) return side;
    }

    return priority.reduce((best, side) => space[side] > space[best] ? side : best, 'bottom');
};

/**
 * Reposition the driver.js popover arrow so it points toward the highlighted element's center.
 */
const positionTourArrow = (element, side) => {
    const popover = document.querySelector('.ams-tour-popover');
    const arrow = popover?.querySelector('.driver-popover-arrow');
    if (!popover || !arrow || !element || !side || side === 'over') return;

    const elRect = element.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    const elCenterX = elRect.left + elRect.width / 2;
    const elCenterY = elRect.top + elRect.height / 2;

    popover.dataset.arrowSide = side;

    if (side === 'bottom' || side === 'top') {
        const offsetX = Math.max(18, Math.min(popRect.width - 18, elCenterX - popRect.left));
        arrow.style.left = `${offsetX}px`;
        arrow.style.top = '';
        arrow.style.right = '';
        arrow.style.bottom = '';
    } else {
        const offsetY = Math.max(18, Math.min(popRect.height - 18, elCenterY - popRect.top));
        arrow.style.top = `${offsetY}px`;
        arrow.style.left = '';
        arrow.style.right = '';
        arrow.style.bottom = '';
    }
};

const resolveStepElement = (step) => {
    if (!step.element) return step;

    const el = document.querySelector(step.element);
    if (el) {
        const bestSide = getBestSide(el);
        return {
            ...step,
            popover: { ...step.popover, side: bestSide },
        };
    }

    return { popover: step.popover };
};

const AppTour = () => {
    const { completeTour, tourPending } = useOnboarding();
    const { user } = useAuth();
    const { canAccess } = usePermissions();
    const navigate = useNavigate();

    const [showWelcome, setShowWelcome] = useState(true);
    const driverRef = useRef(null);
    const completedRef = useRef(false);
    const arrowRepositionRef = useRef(null);
    const highlightedElementRef = useRef(null);
    const highlightedSideRef = useRef('bottom');

    const isAdminOrHR = user?.role === 'Admin' || user?.role === 'HR';

    const buildSteps = useCallback(() => {
        const base = isAdminOrHR ? ADMIN_STEPS : EMPLOYEE_STEPS;
        const showLeaves = canAccess.leaves();
        return base
            .filter((step) => showLeaves || step.element !== '[data-tour="sidebar-leaves"]')
            .map(resolveStepElement);
    }, [isAdminOrHR, canAccess]);

    const clearArrowListeners = useCallback(() => {
        if (arrowRepositionRef.current) {
            window.removeEventListener('scroll', arrowRepositionRef.current, true);
            window.removeEventListener('resize', arrowRepositionRef.current);
            arrowRepositionRef.current = null;
        }
    }, []);

    const attachArrowListeners = useCallback((element, side) => {
        clearArrowListeners();
        highlightedElementRef.current = element;
        highlightedSideRef.current = side;

        const reposition = () => {
            if (highlightedElementRef.current) {
                positionTourArrow(
                    highlightedElementRef.current,
                    highlightedSideRef.current
                );
            }
        };

        arrowRepositionRef.current = reposition;
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        requestAnimationFrame(reposition);
    }, [clearArrowListeners]);

    const startDriverTour = useCallback(() => {
        if (tourPending) return;

        const handleTourDone = async () => {
            if (completedRef.current) return;
            completedRef.current = true;
            clearArrowListeners();
            await completeTour();
            if (!isAdminOrHR) {
                navigate('/profile', { replace: false });
            }
        };

        const steps = buildSteps();

        const driverInstance = driver({
            animate: true,
            showProgress: true,
            showButtons: ['next', 'previous'],
            nextBtnText: 'Next →',
            prevBtnText: '← Back',
            doneBtnText: isAdminOrHR ? 'Finish Tour' : 'Finish & Set Up Profile →',
            progressText: 'Step {{current}} of {{total}}',
            allowClose: false,
            overlayOpacity: 0.28,
            stagePadding: 20,
            stageRadius: 12,
            popoverClass: 'ams-tour-popover',
            steps,

            onHighlightStarted: async (element, step) => {
                if (element) {
                    await scrollIntoViewAndWait(element);
                    const side = step?.popover?.side || getBestSide(element);
                    attachArrowListeners(element, side);
                } else {
                    clearArrowListeners();
                }
            },

            onDestroyStarted: () => {
                if (!driverInstance.hasNextStep()) {
                    driverInstance.destroy();
                    handleTourDone();
                }
                return !driverInstance.hasNextStep();
            },
        });

        driverRef.current = driverInstance;
        driverInstance.drive();
    }, [tourPending, isAdminOrHR, buildSteps, completeTour, navigate, attachArrowListeners, clearArrowListeners]);

    const handleStart = () => {
        setShowWelcome(false);
        setTimeout(startDriverTour, 250);
    };

    useEffect(() => {
        return () => {
            clearArrowListeners();
            if (driverRef.current) {
                try { driverRef.current.destroy(); } catch (_) { /* noop */ }
            }
        };
    }, [clearArrowListeners]);

    if (showWelcome) {
        return <OnboardingWelcome onStart={handleStart} />;
    }

    return null;
};

export default AppTour;
