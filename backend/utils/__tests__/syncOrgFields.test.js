const { syncOrgFields, pickCanonicalDepartment } = require('../syncOrgFields');

describe('syncOrgFields', () => {
    test('uses department as the canonical org unit and mirrors it to domain', () => {
        expect(syncOrgFields({
            department: 'Development',
            domain: 'Marketing',
            designation: ' Software Engineer ',
        })).toEqual({
            department: 'Development',
            domain: 'Development',
            designation: 'Software Engineer',
        });
    });

    test('fills empty department from domain so older records stay usable', () => {
        expect(syncOrgFields({
            department: '',
            domain: 'Finance',
            designation: 'Accountant',
        })).toEqual({
            department: 'Finance',
            domain: 'Finance',
            designation: 'Accountant',
        });
    });

    test('ignores Unknown placeholders when a real value exists on the other field', () => {
        expect(pickCanonicalDepartment('Unknown', 'Sales')).toBe('Sales');
        expect(pickCanonicalDepartment('HR', 'Unknown')).toBe('HR');
    });
});
