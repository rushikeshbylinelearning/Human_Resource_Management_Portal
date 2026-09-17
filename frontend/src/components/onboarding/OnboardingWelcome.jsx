// frontend/src/components/onboarding/OnboardingWelcome.jsx
// Premium welcome screen shown before the tour starts.
// Displays user name, company logo, progress steps, and a "Start Tour" CTA.
// Matches the AMS Red & White design system exactly.

import React from 'react';
import { useAuth } from '../../context/AuthContext';

// ── Helper ────────────────────────────────────────────────────────
const getFirstName = (fullName = '') => {
    const trimmed = (fullName || '').trim();
    if (!trimmed) return 'there';
    return trimmed.split(' ')[0];
};

const getRoleLabel = (role = '') => {
    const map = {
        Employee: 'Employee',
        Intern: 'Intern',
        HR: 'HR Manager',
        Admin: 'Administrator',
        Manager: 'Manager',
    };
    return map[role] || role || 'Employee';
};

// ── Step definitions ──────────────────────────────────────────────
const TOUR_STEPS = [
    { label: 'Welcome' },
    { label: 'Attendance' },
    { label: 'Leaves' },
    { label: 'Notifications' },
    { label: 'Profile' },
];

// ── Component ─────────────────────────────────────────────────────
const OnboardingWelcome = ({ onStart }) => {
    const { user } = useAuth();

    const firstName = getFirstName(user?.fullName);
    const roleLabel = getRoleLabel(user?.role);

    return (
        <div className="ams-welcome-overlay" role="dialog" aria-modal="true" aria-label="Welcome to Attendance Management Portal">
            <div className="ams-welcome-card">

                {/* ── Red header ── */}
                <div className="ams-welcome-header">
                    {/* Company logo */}
                    <img
                        src="/BL.svg"
                        alt="Company Logo"
                        className="ams-welcome-logo"
                        aria-hidden="true"
                        width="60"
                        height="60"
                    />

                    <div>
                        <div className="ams-welcome-greeting">
                            Welcome, {firstName}! 👋
                        </div>
                        <div className="ams-welcome-subtitle">
                            You&apos;re joining as a <strong style={{ color: 'rgba(255,255,255,0.95)' }}>{roleLabel}</strong>.
                            Let&apos;s take a quick guided tour so you know your way around.
                        </div>
                    </div>
                </div>

                {/* ── Body ── */}
                <div className="ams-welcome-body">

                    {/* Progress steps */}
                    <div className="ams-welcome-steps" aria-label="Tour progress">
                        {TOUR_STEPS.map((step, index) => (
                            <div
                                key={step.label}
                                className={`ams-welcome-step${index === 0 ? ' active' : ''}`}
                            >
                                <div className="ams-welcome-step-dot">
                                    {index + 1}
                                </div>
                                <div className="ams-welcome-step-label">{step.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Info cards */}
                    <div className="ams-welcome-info-row">
                        <div className="ams-welcome-info-card">
                            <div className="ams-welcome-info-card-icon">⏱️</div>
                            <div className="ams-welcome-info-card-label">Duration</div>
                            <div className="ams-welcome-info-card-value">~2 minutes</div>
                        </div>
                        <div className="ams-welcome-info-card">
                            <div className="ams-welcome-info-card-icon">📋</div>
                            <div className="ams-welcome-info-card-label">Steps</div>
                            <div className="ams-welcome-info-card-value">9 features</div>
                        </div>
                        <div className="ams-welcome-info-card">
                            <div className="ams-welcome-info-card-icon">🎯</div>
                            <div className="ams-welcome-info-card-label">Goal</div>
                            <div className="ams-welcome-info-card-value">Quick setup</div>
                        </div>
                    </div>

                    {/* CTA */}
                    <button
                        className="ams-welcome-cta"
                        onClick={onStart}
                        type="button"
                        autoFocus
                    >
                        Start Guided Tour
                        <span className="ams-welcome-cta-arrow" aria-hidden="true">→</span>
                    </button>

                    <p className="ams-welcome-time-label">
                        Takes about 2 minutes &nbsp;·&nbsp; Can be repeated from your profile anytime
                    </p>
                </div>
            </div>
        </div>
    );
};

export default OnboardingWelcome;
