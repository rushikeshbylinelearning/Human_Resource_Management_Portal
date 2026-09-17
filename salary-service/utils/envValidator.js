'use strict';
// utils/envValidator.js
//
// Hard validation of required environment variables at process boot.
// This is the single most important guardrail against the F-HIGH-002 pattern
// (hardcoded fallback keys) found in the AMS audit:
//
//   WRONG (AMS pattern to avoid):
//     const secret = process.env.JWT_SECRET || 'fallback-secret';
//
//   RIGHT (this service):
//     If JWT_SECRET is missing → process.exit(1) with a clear error.
//
// All crypto material must come from the environment; there are NO fallbacks.

const REQUIRED = [
    {
        key: 'JWT_SECRET',
        minLength: 64,
        description: 'JWT signing secret — generate with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
    },
    {
        key: 'ENCRYPTION_KEY',
        minLength: 64,
        description: 'AES-256 encryption key (32 bytes as hex) for EmployeeFinancialProfile — generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    },
    {
        key: 'MONGODB_URI',
        minLength: 20,
        description: 'MongoDB connection string for salary-service-db',
    },
    {
        key: 'SERVICE_TOKEN',
        minLength: 32,
        description: 'Service-to-service token for AMS internal feed — generate with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    },
    {
        key: 'B2_KEY_ID',
        minLength: 1,
        description: 'Backblaze B2 application key ID (payroll bucket)',
    },
    {
        key: 'B2_APPLICATION_KEY',
        minLength: 1,
        description: 'Backblaze B2 application key secret (payroll bucket)',
    },
    {
        key: 'B2_BUCKET_NAME',
        minLength: 1,
        description: 'Backblaze B2 bucket name for payroll documents',
    },
    {
        key: 'B2_ENDPOINT',
        minLength: 1,
        description: 'Backblaze B2 S3-compatible endpoint (e.g. s3.us-east-005.backblazeb2.com)',
    },
];

/**
 * Validates all required env vars. Throws a single collected error message
 * listing every missing/invalid var so the operator can fix all issues in
 * one restart cycle.
 *
 * @throws {Error} if any required variable is missing or too short
 */
function validate() {
    const errors = [];

    for (const spec of REQUIRED) {
        const val = process.env[spec.key];
        if (!val || val.trim().length === 0) {
            errors.push(`  ✗ ${spec.key} is not set\n    → ${spec.description}`);
            continue;
        }
        if (val.trim().length < spec.minLength) {
            errors.push(
                `  ✗ ${spec.key} is too short (got ${val.trim().length} chars, need ≥ ${spec.minLength})\n    → ${spec.description}`
            );
        }
    }

    if (errors.length > 0) {
        throw new Error(
            `\n\n❌ salary-service: REFUSING TO START — missing or invalid environment variables:\n\n${errors.join('\n\n')}\n\n` +
            `Copy env.example to .env and fill in all required values.\n`
        );
    }
}

/**
 * Validates and exits the process on failure.
 * Call this before any other initialization.
 */
function validateAndExit() {
    try {
        validate();
        console.log('✅ Environment variables validated');
        // ── Optional vars: apply documented defaults (no exit on absence) ─────
        // MONTH_END_AUTO_GENERATE_ENABLED — default: enabled (any value other than 'false')
        // MONTH_END_CRON_SCHEDULE         — default: '0 3 1 * *' (03:00 on 1st of month)
        // Both are read directly in monthEndScheduler.js with safe defaults inline.
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}

module.exports = { validateAndExit };
