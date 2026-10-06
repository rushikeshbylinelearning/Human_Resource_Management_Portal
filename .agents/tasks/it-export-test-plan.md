# IT Ticket Excel Export - Manual Test Plan

## Implementation Status
✓ Backend controller function implemented
✓ Backend route configured with authentication
✓ Frontend export button added
✓ Frontend handler implemented
✓ Code validation: 14/14 checks passed

## Required Manual Testing

### Prerequisites
1. Start backend server: `cd backend && npm run dev` (port 3011)
2. Start frontend server: `cd frontend && npm start` (port 3000)
3. Login as admin or IT support staff

### Test Cases

#### Test 1: Basic Export Functionality
**Steps:**
1. Navigate to Operational Dashboard
2. Click on "IT" tab
3. Verify "Export to Excel" button is visible with download icon
4. Click "Export to Excel" button
5. Verify button changes to "Exporting..." and is disabled
6. Verify Excel file downloads with name pattern: `IT_Support_Tickets_YYYY-MM-DD.xlsx`

**Expected Results:**
- Excel file downloads successfully
- File opens without errors
- Contains 15 columns: Ticket ID, Created By, Employee Code, Department, Category, Title, Description, Priority, Status, Assigned To, Location, Created At, Updated At, Resolved At, Resolution Notes, Image Count
- Header row has bold font and gray background
- Data rows contain actual ticket data
- Dates are formatted in IST timezone
- Null values show as "—" or "N/A"

#### Test 2: Status Filter
**Steps:**
1. Navigate to Operational Dashboard → IT tab
2. Select Status filter: "OPEN"
3. Click "Export to Excel"
4. Open downloaded Excel file
5. Verify all tickets have status "OPEN"

**Expected Results:**
- Only tickets with OPEN status are exported
- Filter is correctly applied to API call

#### Test 3: Priority Filter
**Steps:**
1. Navigate to Operational Dashboard → IT tab
2. Select Priority filter: "High"
3. Click "Export to Excel"
4. Open downloaded Excel file
5. Verify all tickets have priority "High"

**Expected Results:**
- Only High priority tickets are exported
- Filter parameter is passed correctly

#### Test 4: Category Filter
**Steps:**
1. Navigate to Operational Dashboard → IT tab
2. Select a Category from dropdown (e.g., "Hardware")
3. Click "Export to Excel"
4. Verify exported tickets match selected category

**Expected Results:**
- Only tickets with selected category are exported

#### Test 5: Search Filter
**Steps:**
1. Navigate to Operational Dashboard → IT tab
2. Enter search term in search box (e.g., "printer")
3. Click "Export to Excel"
4. Verify exported tickets contain search term

**Expected Results:**
- Search term is included in query params
- Results match search criteria

#### Test 6: Multiple Filters Combined
**Steps:**
1. Set Status = "OPEN"
2. Set Priority = "High"
3. Set Category = "Hardware"
4. Enter search term
5. Click "Export to Excel"

**Expected Results:**
- All filters are applied correctly
- Exported data matches all filter criteria

#### Test 7: Empty Results
**Steps:**
1. Apply filters that result in no tickets
2. Click "Export to Excel"

**Expected Results:**
- Excel file still downloads
- Contains header row only
- No error occurs

#### Test 8: Authentication Required
**Steps:**
1. Attempt to access export endpoint without auth token:
   ```bash
   curl http://localhost:3011/api/it-support/tickets/export/excel -o test.xlsx
   ```

**Expected Results:**
- Returns 401 Unauthorized
- No file is downloaded

#### Test 9: IT Support Access Required
**Steps:**
1. Login as regular employee (non-IT, non-Admin)
2. Try to access Operational Dashboard → IT tab

**Expected Results:**
- Either tab is not visible, or
- Export button is not accessible, or
- API returns 403 Forbidden

#### Test 10: Error Handling - Backend Down
**Steps:**
1. Stop backend server
2. Click "Export to Excel" button
3. Verify error handling

**Expected Results:**
- User sees error message: "Failed to export tickets."
- Button returns to normal state
- No console errors crash the app

#### Test 11: Large Dataset
**Steps:**
1. Ensure database has 100+ tickets
2. Export all tickets (no filters)
3. Verify Excel file

**Expected Results:**
- All tickets are exported (no pagination limit)
- Excel file opens successfully
- No performance issues
- All rows have data

#### Test 12: Special Characters in Data
**Steps:**
1. Create ticket with special characters in title/description (e.g., quotes, commas, newlines)
2. Export to Excel
3. Open Excel and verify data integrity

**Expected Results:**
- Special characters are properly escaped
- Data displays correctly in Excel cells
- No formatting issues

## Automated Tests (if available)
```bash
cd backend
npm test -- itSupportController.test.js
```

## API Testing with cURL

### Get auth token first:
```bash
# Login
curl -X POST http://localhost:3011/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"employeeCode":"ADMIN001","password":"your-password"}'
```

### Test export endpoint:
```bash
# Basic export
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:3011/api/it-support/tickets/export/excel \
  -o test.xlsx

# With status filter
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:3011/api/it-support/tickets/export/excel?status=OPEN" \
  -o test-open.xlsx

# With multiple filters
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:3011/api/it-support/tickets/export/excel?status=OPEN&priority=High&category=Hardware" \
  -o test-filtered.xlsx

# With search
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:3011/api/it-support/tickets/export/excel?search=printer" \
  -o test-search.xlsx
```

## Success Criteria
- All 12 test cases pass
- No console errors
- Excel files download correctly
- Data is accurate and formatted properly
- Filters work as expected
- Authentication and authorization work correctly
- Error handling is graceful

## Known Limitations
- Cannot run manual tests in current environment (requires running servers)
- Code validation passed 14/14 checks
- Implementation matches FEAT specifications exactly

## Next Steps
1. User must manually run servers and test the feature
2. If any issues are found, they should be reported for fixing
3. Once tested, feature can be marked as verified
