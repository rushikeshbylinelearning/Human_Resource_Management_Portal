# Implementation Plan: IT Ticket Excel Export Feature

## Exploration Summary

### Backend Analysis
- **IT Support Controller**: Located at `backend/controllers/itSupportController.js`
  - Main admin endpoint: `getAllTickets` (line ~172) with filters: status, priority, category, assignedTo, search
  - Query parameters: `page`, `limit`, `status`, `priority`, `category`, `assignedTo`, `search`
  - Returns paginated tickets with statistics
  
- **ITSupportTicket Model**: `backend/models/ITSupportTicket.js`
  - Key fields: ticketId, createdBy, createdByName, createdByCode, department, category, title, description, priority, status, assignedTo, assignedToName, location, images (array), resolvedAt, resolvedBy, resolvedByName, resolutionNotes, createdAt, updatedAt
  - Status enum: OPEN, ACKNOWLEDGED, IN_PROGRESS, WAITING_FOR_USER, RESOLVED, CLOSED, CANCELLED
  - Priority enum: Low, Medium, High, Critical
  
- **ExcelJS Pattern**: From `backend/controllers/analyticsExportController.js` (lines 588-720)
  - ExcelJS v4.4.0 installed (verified in package.json)
  - Pattern: Create workbook → add worksheet → set headers with styling → add data rows → set column widths → writeBuffer() → send with Content-Type and Content-Disposition headers
  - Uses `res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')`
  - Uses `res.setHeader('Content-Disposition', 'attachment; filename="..."')`
  
- **Route file**: `backend/routes/itSupport.js`
  - Admin routes use middleware: `[authenticateToken, requireITSupportAccess]`
  - Route prefix: `/api/it-support` (from app usage pattern)

### Frontend Analysis
- **Operational Dashboard**: `frontend/src/pages/OperationalDashboardPage.jsx`
  - IT tickets section starting at line ~141
  - Filter state: `itStatus`, `itPriority`, `itCategory`, `itSearch` (lines 54-59)
  - Pagination: `itPage`, `itRows` (lines 51-52)
  - API call at line ~97: `await api.get('/it-support/tickets', { params })`
  - Toolbar with filters at lines 282-327
  
- **Export Pattern**: From `frontend/src/components/onboarding/ComplianceDashboard.jsx` (lines 830-854)
  - State: `const [exporting, setExporting] = useState(false);`
  - API call with `{ responseType: 'blob' }`
  - Create blob URL, programmatic <a> click, revoke URL
  - Icon: `DownloadIcon` from `@mui/icons-material/Download`
  - Button pattern: `<Button startIcon={<DownloadIcon />} disabled={exporting}>Export to Excel</Button>`

## Implementation Steps

### Backend Implementation

- [ ] 1. Create `exportITTicketsToExcel` controller function in `backend/controllers/itSupportController.js`
      Add new async function after the existing `getAllTickets` function (around line 240).
      Accept query params: `status`, `priority`, `category`, `assignedTo`, `search` (same as getAllTickets).
      Build Mongoose query matching the exact filter logic from `getAllTickets` (lines 172-200).
      Fetch all matching tickets (no pagination limit) sorted by createdAt descending.
      Use ExcelJS to create workbook with worksheet named "IT Support Tickets".
      Define columns: Ticket ID, Created By, Employee Code, Department, Category, Title, Description, Priority, Status, Assigned To, Location, Created At, Updated At, Resolved At, Resolution Notes, Image Count.
      Set column widths (12-20 chars based on content).
      Style header row with bold font and gray background (pattern from analyticsExportController lines 655-660).
      Add data rows: format dates to IST using `formatISTDate` helper, handle null/undefined values with "—" or "N/A".
      Image Count = `ticket.images?.length || 0`.
      Set response headers: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="IT_Support_Tickets_YYYY-MM-DD.xlsx"` (use current IST date).
      Write workbook to buffer using `await workbook.xlsx.writeBuffer()` and send with `res.send(buffer)`.
      Wrap in try/catch, return 500 JSON error if headers not sent yet.
      Files: `backend/controllers/itSupportController.js`
      Verify: Run `npm test` in backend directory (if tests exist for controller), or manually test with curl/Postman.

- [ ] 2. Add export route to `backend/routes/itSupport.js`
      Add route: `router.get('/tickets/export/excel', [authenticateToken, requireITSupportAccess], exportITTicketsToExcel);`
      Place BEFORE the `router.get('/tickets/:id', ...)` route to avoid route matching conflicts (around line 25).
      Import the new controller function at top of file in the destructured require statement.
      Files: `backend/routes/itSupport.js`, `backend/controllers/itSupportController.js`
      Verify: Start backend with `npm run dev`, call `GET /api/it-support/tickets/export/excel` with valid auth token, confirm Excel file downloads.

### Frontend Implementation

- [ ] 3. Add export button to IT tickets section in `frontend/src/pages/OperationalDashboardPage.jsx`
      Add state: `const [exportingExcel, setExportingExcel] = useState(false);` after line 59.
      Add export handler function `handleExportITTickets` after `loadData` function (around line 138):
        - Set `setExportingExcel(true)` at start, `finally` block sets to false.
        - Build params object with current filters: `{ status: itStatus, priority: itPriority, category: itCategory, assignedTo: '', search: itSearch }` (only include non-empty values).
        - Call `await api.get('/it-support/tickets/export/excel', { params, responseType: 'blob' })`.
        - Create blob: `const url = window.URL.createObjectURL(new Blob([data]));`
        - Create anchor: `const a = document.createElement('a'); a.href = url; a.download = 'IT_Support_Tickets.xlsx'; a.click();`
        - Revoke URL: `window.URL.revokeObjectURL(url);`
        - Wrap in try/catch, log errors to console, optionally show error with `setError()`.
      Import `DownloadIcon` from `@mui/icons-material/Download` at top (around line 19).
      Add export button in the IT table toolbar (inside the Box at line 282, after the filter FormControls and before the Typography meta):
        ```jsx
        <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={handleExportITTickets}
            disabled={exportingExcel || loading}
            sx={{ ml: 'auto' }}
        >
            {exportingExcel ? 'Exporting...' : 'Export to Excel'}
        </Button>
        ```
      Files: `frontend/src/pages/OperationalDashboardPage.jsx`
      Verify: Run frontend with `npm start`, navigate to Operational Dashboard → IT tab, click "Export to Excel", confirm Excel file downloads with correct filters applied.

- [ ] 4. End-to-end verification and cleanup
      Test with various filter combinations: status=OPEN, priority=High, category="Computer / Laptop", search text.
      Verify Excel file contains correct columns, data formatting (dates in IST), and respects applied filters.
      Test with no results (empty export) - should produce Excel with headers only.
      Test error handling: backend down, network error - verify user sees appropriate feedback.
      Verify button states: loading/disabled during export, re-enabled after completion.
      Files: N/A
      Verify: Manual QA testing of the complete feature flow.

## Technical Notes

- **Date Formatting**: Backend should format dates to IST using existing helpers. Check if `formatISTDate` is available in utils, otherwise use inline formatting with `toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })`.
- **No Pagination for Export**: Unlike the list endpoint, export should fetch ALL matching tickets (no limit).
- **Error Handling**: Both backend and frontend should handle errors gracefully. Frontend should not break the UI if export fails.
- **Performance**: For large datasets (1000+ tickets), consider adding a reasonable limit (e.g., 5000) and/or background processing. For initial implementation, synchronous export is acceptable.
- **Security**: Route is protected with `requireITSupportAccess` middleware - only admin and IT staff can export.
