/**
 * Domain and department both described the same org unit. Department is the
 * operational field (filters, reports, leaves). Domain is kept as a mirror so
 * SSO payloads and older readers stay consistent.
 */
function normalizeOrgValue(value) {
    if (value == null) return '';
    return String(value).trim();
}

function isPlaceholderOrgValue(value) {
    const normalized = normalizeOrgValue(value);
    return !normalized || normalized.toLowerCase() === 'unknown';
}

function pickCanonicalDepartment(department, domain) {
    const dept = normalizeOrgValue(department);
    const dom = normalizeOrgValue(domain);

    if (!isPlaceholderOrgValue(dept)) return dept;
    if (!isPlaceholderOrgValue(dom)) return dom;
    return dept || dom;
}

/**
 * @param {{ department?: string, domain?: string, designation?: string }} fields
 * @returns {{ department: string, domain: string, designation: string }}
 */
function syncOrgFields(fields = {}) {
    const department = pickCanonicalDepartment(fields.department, fields.domain);
    return {
        department,
        domain: department,
        designation: normalizeOrgValue(fields.designation),
    };
}

module.exports = {
    normalizeOrgValue,
    isPlaceholderOrgValue,
    pickCanonicalDepartment,
    syncOrgFields,
};
