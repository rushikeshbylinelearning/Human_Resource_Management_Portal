// frontend/src/utils/employeeFilterUtils.js

/**
 * Filters out Admin accounts and inactive/deactivated employees from employee lists.
 * This is a defensive filter to ensure Admin and inactive users never appear in employee lists,
 * even if backend filtering fails or data comes from other sources.
 * 
 * Business Rule: Admin accounts and deactivated employees should NOT appear in:
 * - Employee lists
 * - Leave lists
 * - Leave counts
 * - Intern counts
 * - Manage employee sections
 * 
 * @param {Array} employees - Array of employee objects
 * @returns {Array} Filtered array excluding Admin role and inactive users
 */
export const filterActiveEmployees = (employees) => {
    if (!Array.isArray(employees)) return [];
    
    return employees.filter(emp => {
        // Exclude Admin role
        if (emp.role === 'Admin') return false;
        
        // Exclude inactive/deactivated users
        if (emp.isActive === false) return false;
        
        // Include if role is Employee, HR, or Intern and isActive is true (or undefined for backward compatibility)
        return true;
    });
};

/**
 * Filters employees by role (Employee or Intern) and excludes Admin and inactive users.
 * 
 * @param {Array} employees - Array of employee objects
 * @param {string} role - 'Employee' or 'Intern' to filter by
 * @returns {Array} Filtered array
 */
export const filterEmployeesByRole = (employees, role) => {
    if (!Array.isArray(employees)) return [];
    
    return employees.filter(emp => {
        // Exclude Admin role
        if (emp.role === 'Admin') return false;
        
        // Exclude inactive/deactivated users
        if (emp.isActive === false) return false;
        
        // Filter by specified role
        return emp.role === role;
    });
};

