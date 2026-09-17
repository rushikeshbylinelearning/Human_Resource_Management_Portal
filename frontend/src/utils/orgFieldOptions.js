export const STANDARD_DEPARTMENTS = [
    'Development',
    'Design',
    'Marketing',
    'Instructional_Designer',
    'HR',
    'Management',
];

export const DESIGNATIONS_BY_DEPARTMENT = {
    Development: [
        'Full Stack Developer',
        'Frontend Developer',
        'Backend Developer',
        'DevOps Engineer',
    ],
    Design: [
        'UI Designer',
        'UX Designer',
        'Graphic Designer',
    ],
    Marketing: [
        'Marketing Executive',
        'Content Writer',
        'Digital Marketing Manager',
        'SEO Specialist',
        'Sales Executive',
        'Business Development Executive',
        'Sales Manager',
    ],
    Instructional_Designer: [
        'Instrcutional Designer',
        'Instrcutional Designer Intern',
        'Instrcutional Designer Manager',
        'Instrcutional Designer Lead',
        'Instrcutional Designer Specialist',
        'Instrcutional Designer Coordinator',
    ],
    HR: [
        'HR Executive',
        'HR Intern',
        'Recruiter',
    ],
    Management: [
        'Project Manager',
        'Product Manager',
        'Project Coordinator',
    ],
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

export function getDepartmentOptions(existingDepartments = [], currentValue = '') {
    return uniqueSorted([
        ...STANDARD_DEPARTMENTS,
        ...existingDepartments,
        currentValue,
    ]);
}

export function getDesignationOptions(department, existingDesignations = [], currentValue = '') {
    const fromDepartment = DESIGNATIONS_BY_DEPARTMENT[department] || [];
    const fallback = department
        ? fromDepartment
        : Object.values(DESIGNATIONS_BY_DEPARTMENT).flat();

    return uniqueSorted([
        ...fallback,
        ...existingDesignations,
        currentValue,
    ]);
}
