// Quick validation test for IT ticket export feature
const fs = require('fs');
const path = require('path');

console.log('=== IT Ticket Export Feature Validation ===\n');

// Check backend implementation
const controllerPath = path.join(__dirname, '../../backend/controllers/itSupportController.js');
const routesPath = path.join(__dirname, '../../backend/routes/itSupport.js');
const frontendPath = path.join(__dirname, '../../frontend/src/pages/OperationalDashboardPage.jsx');

let issues = [];
let passed = 0;

// 1. Check if controller file exists and has export function
console.log('1. Checking backend controller...');
if (fs.existsSync(controllerPath)) {
    const controllerContent = fs.readFileSync(controllerPath, 'utf8');
    if (controllerContent.includes('exportITTicketsToExcel')) {
        console.log('   ✓ exportITTicketsToExcel function exists');
        passed++;
        
        // Check for ExcelJS
        if (controllerContent.includes("require('exceljs')")) {
            console.log('   ✓ ExcelJS is imported');
            passed++;
        } else {
            console.log('   ✗ ExcelJS import not found');
            issues.push('ExcelJS import missing in controller');
        }
        
        // Check for formatISTDate
        if (controllerContent.includes('formatISTDate')) {
            console.log('   ✓ formatISTDate is used for date formatting');
            passed++;
        } else {
            console.log('   ✗ formatISTDate not found');
            issues.push('Date formatting might be missing');
        }
        
        // Check for all 15 columns
        const requiredColumns = [
            'Ticket ID', 'Created By', 'Employee Code', 'Department', 'Category',
            'Title', 'Description', 'Priority', 'Status', 'Assigned To',
            'Location', 'Created At', 'Updated At', 'Resolved At', 'Resolution Notes', 'Image Count'
        ];
        
        let columnCount = 0;
        requiredColumns.forEach(col => {
            if (controllerContent.includes(col)) {
                columnCount++;
            }
        });
        
        if (columnCount >= 15) {
            console.log(`   ✓ All 15 required columns are present (${columnCount}/15)`);
            passed++;
        } else {
            console.log(`   ✗ Only ${columnCount}/15 columns found`);
            issues.push(`Missing columns in Excel export (found ${columnCount}/15)`);
        }
        
    } else {
        console.log('   ✗ exportITTicketsToExcel function not found');
        issues.push('exportITTicketsToExcel function missing');
    }
} else {
    console.log('   ✗ Controller file not found');
    issues.push('Controller file missing');
}

// 2. Check routes
console.log('\n2. Checking backend routes...');
if (fs.existsSync(routesPath)) {
    const routesContent = fs.readFileSync(routesPath, 'utf8');
    
    if (routesContent.includes('exportITTicketsToExcel')) {
        console.log('   ✓ exportITTicketsToExcel is imported');
        passed++;
    } else {
        console.log('   ✗ exportITTicketsToExcel import not found');
        issues.push('Export function not imported in routes');
    }
    
    if (routesContent.includes('/tickets/export/excel')) {
        console.log('   ✓ Route /tickets/export/excel is defined');
        passed++;
        
        // Check middleware
        if (routesContent.includes('authenticateToken') && routesContent.includes('requireITSupportAccess')) {
            console.log('   ✓ Route has correct authentication middleware');
            passed++;
        } else {
            console.log('   ✗ Missing authentication middleware');
            issues.push('Route missing proper authentication');
        }
        
        // Check route order (should be before generic /tickets route)
        const exportRouteIndex = routesContent.indexOf('/tickets/export/excel');
        const ticketsRouteMatch = routesContent.match(/router\.get\('\/tickets',/);
        if (ticketsRouteMatch) {
            const ticketsRouteIndex = routesContent.indexOf(ticketsRouteMatch[0]);
            if (exportRouteIndex < ticketsRouteIndex) {
                console.log('   ✓ Export route is defined before generic /tickets route');
                passed++;
            } else {
                console.log('   ✗ Export route might be shadowed by /tickets route');
                issues.push('Route order issue - export route after /tickets');
            }
        }
        
    } else {
        console.log('   ✗ Route /tickets/export/excel not found');
        issues.push('Export route not defined');
    }
} else {
    console.log('   ✗ Routes file not found');
    issues.push('Routes file missing');
}

// 3. Check frontend
console.log('\n3. Checking frontend implementation...');
if (fs.existsSync(frontendPath)) {
    const frontendContent = fs.readFileSync(frontendPath, 'utf8');
    
    if (frontendContent.includes('handleExportITTickets')) {
        console.log('   ✓ handleExportITTickets function exists');
        passed++;
    } else {
        console.log('   ✗ handleExportITTickets function not found');
        issues.push('Export handler missing in frontend');
    }
    
    if (frontendContent.includes('exportingExcel')) {
        console.log('   ✓ exportingExcel state variable exists');
        passed++;
    } else {
        console.log('   ✗ exportingExcel state not found');
        issues.push('Export state variable missing');
    }
    
    if (frontendContent.includes('/it-support/tickets/export/excel')) {
        console.log('   ✓ API endpoint is called correctly');
        passed++;
    } else {
        console.log('   ✗ API endpoint call not found');
        issues.push('API endpoint not called in frontend');
    }
    
    if (frontendContent.includes("responseType: 'blob'")) {
        console.log('   ✓ Response type is set to blob for file download');
        passed++;
    } else {
        console.log('   ✗ Blob response type not configured');
        issues.push('Missing blob responseType');
    }
    
    if (frontendContent.includes('Export to Excel') || frontendContent.includes('Exporting...')) {
        console.log('   ✓ Export button with proper labels exists');
        passed++;
    } else {
        console.log('   ✗ Export button not found');
        issues.push('Export button missing');
    }
    
    if (frontendContent.includes('DownloadIcon')) {
        console.log('   ✓ Download icon is imported and used');
        passed++;
    } else {
        console.log('   ✗ Download icon not found');
        issues.push('Download icon missing');
    }
    
} else {
    console.log('   ✗ Frontend file not found');
    issues.push('Frontend file missing');
}

// Summary
console.log('\n=== VALIDATION SUMMARY ===');
console.log(`Passed: ${passed} checks`);
console.log(`Issues: ${issues.length}`);

if (issues.length > 0) {
    console.log('\nIssues found:');
    issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue}`);
    });
    process.exit(1);
} else {
    console.log('\n✓ All validation checks passed!');
    console.log('\nNote: This validates code structure only.');
    console.log('Manual testing required to verify:');
    console.log('  - Backend server starts successfully');
    console.log('  - Frontend connects to backend');
    console.log('  - Excel file downloads correctly');
    console.log('  - Filters are applied correctly');
    console.log('  - Excel contains correct data and formatting');
    process.exit(0);
}
