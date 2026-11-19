/**
 * Canonical org catalog for Advanced Editor / profile org fields.
 *
 * Dropdowns show the fixed company catalog only.
 * Current employee values are always included so legacy/edit records still resolve.
 * freeSolo "Add …" in OrgAssignmentFields covers intentional new entries.
 */

export const STANDARD_DEPARTMENTS = [
    'Management',
    'HR',
    'IT',
    'Instructional Designer',
    'Sales and Marketing',
    'Graphics',
    'Animation',
];

/** Base job titles per department (before Employee/Intern track expansion). */
export const BASE_DESIGNATIONS_BY_DEPARTMENT = {
    Management: [
        'Project Coordinator',
        'Manager',
        'Product Manager',
    ],
    HR: [
        'HR Executive',
        'Manager',
    ],
    IT: [
        'Full Stack Developer',
        'Network Engineer',
        'DevOps',
        'Cybersecurity',
    ],
    'Instructional Designer': [
        'Content Writer',
        'Instructional Content Writer',
        'Elearning Developer',
    ],
    'Sales and Marketing': [
        'Inside Sales',
        'Digital Marketing',
    ],
    Graphics: [
        'Graphics Designer',
        'Storyline Developer',
    ],
    Animation: [
        'Animator',
    ],
};

/**
 * Map legacy / typo department keys (still in prod data) → catalog key
 * used only for designation suggestions — stored department value is unchanged.
 */
const DEPARTMENT_ALIASES = {
    Development: 'IT',
    Design: 'Graphics',
    Marketing: 'Sales and Marketing',
    Instructional_Designer: 'Instructional Designer',
    Manaegement: 'Management',
    'Graphics Design': 'Graphics',
    Content: 'Instructional Designer',
};

const PLACEHOLDER_VALUES = new Set(['', 'unknown']);

export function normalizeOrgValue(value) {
    if (value == null) return '';
    return String(value).trim();
}

function isPlaceholder(value) {
    return PLACEHOLDER_VALUES.has(normalizeOrgValue(value).toLowerCase());
}

export function uniqueSorted(values) {
    return [...new Set(values.map(normalizeOrgValue).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
}

export function withEmployeeInternTracks(titles = []) {
    return titles.flatMap((title) => {
        const base = normalizeOrgValue(title);
        if (!base) return [];
        if (/\((employee|intern)\)\s*$/i.test(base)) return [base];
        return [`${base} (Employee)`, `${base} (Intern)`];
    });
}

/** Expanded catalog (Employee + Intern per title). Safe for older imports. */
export const DESIGNATIONS_BY_DEPARTMENT = Object.fromEntries(
    Object.entries(BASE_DESIGNATIONS_BY_DEPARTMENT).map(([dept, titles]) => [
        dept,
        withEmployeeInternTracks(titles),
    ])
);

export function canonicalizeDepartment(department) {
    const dept = normalizeOrgValue(department);
    if (!dept) return '';
    // Case-insensitive alias + catalog match
    const aliasHit = DEPARTMENT_ALIASES[dept]
        || DEPARTMENT_ALIASES[Object.keys(DEPARTMENT_ALIASES).find(
            (k) => k.toLowerCase() === dept.toLowerCase()
        )];
    if (aliasHit) return aliasHit;

    const standardHit = STANDARD_DEPARTMENTS.find(
        (d) => d.toLowerCase() === dept.toLowerCase()
    );
    return standardHit || dept;
}

/**
 * Infer employment track from a designation label.
 * Returns 'employee' | 'intern' | null
 */
export function inferTrackFromDesignation(designation) {
    const d = normalizeOrgValue(designation);
    if (!d) return null;
    if (/\(intern\)\s*$/i.test(d)) return 'intern';
    if (/\(employee\)\s*$/i.test(d)) return 'employee';
    if (/\bintern\b/i.test(d)) return 'intern';
    return null;
}

export function resolveOrgFields({ department, domain, designation } = {}) {
    const dept = normalizeOrgValue(department);
    const dom = normalizeOrgValue(domain);
    const canonicalDepartment = !isPlaceholder(dept) ? dept : (!isPlaceholder(dom) ? dom : (dept || dom));

    return {
        department: canonicalDepartment,
        domain: canonicalDepartment,
        designation: normalizeOrgValue(designation),
    };
}

/**
 * Departments shown in the picker.
 * Fixed catalog only — do NOT merge historical DB departments (causes redundancy).
 * `currentValue` is appended so an employee being edited keeps their legacy dept visible.
 */
export function getDepartmentOptions(_existingDepartments = [], currentValue = '') {
    return uniqueSorted([
        ...STANDARD_DEPARTMENTS,
        currentValue,
    ]);
}

/**
 * Designations for the selected department only (Employee + Intern tracks).
 * Does NOT merge the global DB designation dump — that made every title appear
 * regardless of department. `currentValue` is kept for edit/legacy safety.
 */
export function getDesignationOptions(department, _existingDesignations = [], currentValue = '') {
    const dept = normalizeOrgValue(department);
    if (!dept) {
        // Force department-first: empty list until a department is chosen
        return uniqueSorted([currentValue]);
    }

    const canonical = canonicalizeDepartment(dept);
    const baseTitles =
        BASE_DESIGNATIONS_BY_DEPARTMENT[dept]
        || BASE_DESIGNATIONS_BY_DEPARTMENT[canonical]
        || [];

    return uniqueSorted([
        ...withEmployeeInternTracks(baseTitles),
        currentValue,
    ]);
}
