'use strict';
// utils/storageKey.js
//
// Deterministic, collision-free B2 object key generation for payroll documents.
// The prefix is always B2_PREFIX (default: "payroll/") so the payroll B2 key
// (which is scoped to this prefix) can never reach outside its bucket namespace.
//
// Key schema:
//   payroll/Employees/{employeeId}/{year}/{month}/payslip.pdf
//   payroll/Shared/{adminFolder}/{filename}
//   payroll/Folders/{adminFolder}/   ← zero-byte folder marker
//
// SECURITY: All path segments from user input are sanitised through
// sanitizeSegment() which strips path traversal characters and control chars.
// The admin-defined folder name can NEVER escape its intended prefix.

const path = require('path');

const PREFIX = (process.env.B2_PREFIX || 'payroll/').replace(/\/+$/, '') + '/';

/**
 * Sanitises a single path segment from user-supplied input.
 * Strips: path separators, null bytes, control chars, leading dots.
 * @param {string} segment
 * @returns {string} safe segment
 */
function sanitizeSegment(segment) {
    return String(segment)
        // Remove path separators and null bytes
        .replace(/[/\\%\0]/g, '')
        // Remove control characters
        .replace(/[\x00-\x1f\x7f]/g, '')
        // Remove leading dots (prevents hidden files / relative traversal)
        .replace(/^\.+/, '')
        .trim();
}

/**
 * Builds the B2 key for a generated salary slip PDF.
 * @param {string} employeeId
 * @param {number|string} year   e.g. 2026
 * @param {number|string} month  e.g. 6 (June)
 * @returns {string}  e.g. "payroll/Employees/EMP042/2026/06/payslip.pdf"
 */
function buildPayslipKey(employeeId, year, month) {
    const safeId = sanitizeSegment(employeeId);
    const safeYear = sanitizeSegment(String(year));
    const safeMonth = String(month).padStart(2, '0');
    return `${PREFIX}Employees/${safeId}/${safeYear}/${safeMonth}/payslip.pdf`;
}

/**
 * Builds the zero-byte marker key for an ad-hoc shared folder.
 * @param {string} folderName  — user-supplied folder name, sanitised
 * @returns {string}  e.g. "payroll/Shared/MyFolder/"
 */
function buildSharedFolderMarkerKey(folderName) {
    const safeName = sanitizeSegment(folderName);
    if (!safeName) throw new Error('Folder name is empty after sanitisation');
    return `${PREFIX}Shared/${safeName}/`;
}

/**
 * Builds the key for a file inside a shared ad-hoc folder.
 * @param {string} folderName
 * @param {string} filename
 * @returns {string}
 */
function buildSharedFileKey(folderName, filename) {
    const safeName = sanitizeSegment(folderName);
    const safeFile = sanitizeSegment(path.basename(filename));
    if (!safeName || !safeFile) throw new Error('Empty folder name or filename after sanitisation');
    return `${PREFIX}Shared/${safeName}/${safeFile}`;
}

module.exports = {
    sanitizeSegment,
    buildPayslipKey,
    buildSharedFolderMarkerKey,
    buildSharedFileKey,
    PREFIX,
};
