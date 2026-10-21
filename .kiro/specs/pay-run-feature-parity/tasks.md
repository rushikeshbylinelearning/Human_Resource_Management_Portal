# Implementation Tasks — Pay Run Feature Parity

## Implementation Notes

Work strictly in phase order. Each phase has a verification gate — do not start the next phase
until the gate is cleared. Phase 1 data model changes are a prerequisite for every subsequent
phase.

Existing files are edited in-place; only new service/component files are created fresh.
The `salary-service` backend lives at `salary-service/` and the frontend at
`salary-service-frontend/src/`.

---

## Phase 1 — Data Model Extensions

- [x] 1. Update `salary-service/models/PayrollRun.js`
  - Add `payRunType`, `approvalStatus`, `submittedBy`, `submittedAt`, `approvedBy`, `approvedAt`, `rejectedBy`, `rejectedAt`, `rejectionReason`, `payDate`, `comments` array fields as specified in design.md §1.1
  - Remove the existing `{ month: 1, year: 1 }` unique index
  - Add the partial unique index `unique_regular_run_per_month` scoped to `payRunType: 'regular'` (design.md §1.1)

- [x] 2. Update `salary-service/models/SalarySlip.js`
  - Add `withheld` sub-document, `skipped`, `arrears`, `lopAdjustments`, `oneTimeEntries`, `paymentStatus`, `paidAt`, `paidBy`, `paymentMode`, `pendingArrearsSuggestion` fields as specified in design.md §1.2
  - Keep existing `STATUSES` enum and `status` field unchanged

- [x] 3. Update `salary-service/models/AuditLog.js`
  - Append the 10 new action types to the `ACTIONS` array as listed in design.md §1.3

- [x] 4. Update `salary-service/services/payrollCompute.js`
  - Add `lopAdjustments = []` and `oneTimeEntries = []` optional parameters to `computeSalarySlip`
  - Implement the additive LOP delta and one-time entry summation logic as specified in design.md §1.4
  - Ensure all existing call sites still work (no signature-breaking changes — new params default to `[]`)

- [x] **Phase 1 verification gate**: Confirm the following before proceeding to Phase 2:
  - Start the service and verify clean boot (no Mongoose schema errors in logs)
  - Confirm existing PayrollRun documents (if any) still load without error from the DB
  - Confirm `computeSalarySlip` called without the new params produces identical output to before

---

## Phase 2 — Employee Summary Tab

- [x] 5. Create `salary-service/services/slipAdjustmentService.js`
  - Implement `guardDraftSlip(runId, slipId)` helper
  - Implement `recomputeAndSaveSlip(slip, settings, profile)` helper that calls `computeSalarySlip` with current `lopAdjustments` and `oneTimeEntries`, saves updated fields, and updates parent run totals
  - Implement `applyLopAdjustment(slip, { days, reason, type, sourceRunId, actorId })` — appends to `lopAdjustments`, calls `recomputeAndSaveSlip`
  - Implement `applyOneTimeEntry(slip, { label, amount, kind, actorId })` — appends to `oneTimeEntries`, calls `recomputeAndSaveSlip`

- [x] 6. Add per-slip mutation handlers to `salary-service/controllers/payrollRunController.js`
  - `patchSlipLop` — Add LOP adjustment; uses `applyLopAdjustment`; fires `SLIP_LOP_ADJUSTED`
  - `patchSlipOneTime` — Add one-time entry; uses `applyOneTimeEntry`
  - `patchSlipWithhold` — Sets `withheld.isWithheld = true`; requires non-empty reason; fires `SLIP_WITHHELD`
  - `patchSlipRelease` — Clears `withheld.isWithheld`; fires `SLIP_RELEASED`
  - `patchSlipSkip` — Sets `skipped = true`; fires `SLIP_SKIPPED`
  - `getSlipTdsSheet` — Returns read-only TDS breakdown object (no DB write)
  - `patchSlipReverseLop` — Draft runs only: appends `type: 'reversal'` entry with negative days; uses `applyLopAdjustment`; fires `SLIP_LOP_ADJUSTED`

- [x] 7. Register all Phase 2 endpoints in `salary-service/routes/payrollRuns.js`
  - `PATCH /:id/slips/:slipId/lop` → `authenticate, requireAdmin, ctrl.patchSlipLop`
  - `PATCH /:id/slips/:slipId/one-time` → `authenticate, requireAdmin, ctrl.patchSlipOneTime`
  - `PATCH /:id/slips/:slipId/withhold` → `authenticate, requireAdmin, ctrl.patchSlipWithhold`
  - `PATCH /:id/slips/:slipId/release` → `authenticate, requireAdmin, ctrl.patchSlipRelease`
  - `PATCH /:id/slips/:slipId/skip` → `authenticate, requireAdmin, ctrl.patchSlipSkip`
  - `GET  /:id/slips/:slipId/tds-sheet` → `authenticate, payrollAccess, ctrl.getSlipTdsSheet`
  - `PATCH /:id/slips/:slipId/reverse-lop` → `authenticate, requireAdmin, ctrl.patchSlipReverseLop`

- [x] 8. Create `salary-service-frontend/src/components/SlipActionDialogs.jsx`
  - `AddLopDialog` — number input for days (min 0.5), required reason text
  - `AddOneTimeEntryDialog` — label text, amount number, `earning`/`deduction` toggle
  - `WithholdDialog` — required reason text only
  - `ReverseLopDialog` — days number, reason text
  - Each dialog calls the appropriate API endpoint on confirm and refreshes parent data via callback

- [x] 9. Create `salary-service-frontend/src/components/EmployeeSummaryTab.jsx`
  - MUI Table with columns: Checkbox, Employee (name + ID), Gross Pay, LOP Days, Total Deductions, Net Pay, Payment Status, Actions (⋯)
  - Overflow menu using `MoreVert` icon + MUI `Menu` component
  - Conditional menu items per the visibility rules table in design.md §2.3
  - Row-select state; "Mark as Paid" toolbar appears when `selectedIds.size > 0`
  - All currency cells use `className="currency"`
  - Skipped rows: `color: 'var(--ink-muted)'`; withheld rows: amber `Chip` "Withheld"
  - Opens dialogs from `SlipActionDialogs.jsx` on menu item click

- [x] 10. Refactor `salary-service-frontend/src/pages/PayrollRunDetailPage.jsx`
  - Replace the flat slip `Table` with MUI `Tabs` containing `EmployeeSummaryTab` (tab 0, default) and a placeholder for `TaxesDeductionsTab` (tab 1, Phase 3)
  - Keep all existing header, banners, action buttons, and `ConfirmDialog` unchanged
  - Pass `run`, `slips`, `isAdmin`, and a `reload` callback down to `EmployeeSummaryTab`

- [x] **Phase 2 verification gate**:
  - For each of the 7 overflow actions, call the API manually and inspect the raw MongoDB document before and after to confirm the correct field changed
  - Verify "Mark as Paid" toolbar button appears on row selection

---

## Phase 3 — Taxes and Deductions Tab

- [x] 11. Create `salary-service-frontend/src/components/TaxesDeductionsTab.jsx`
  - Four aggregate summary cards: Total PF, Total ESI, Total PT, Total TDS — matching the existing "Gross Pay" card style from `PayrollRunDetailPage.jsx`
  - Per-employee breakdown MUI Table: Employee, PF, ESI, PT, TDS, LOP Deduction, Net Pay
  - Excludes `slip.skipped === true` rows from all aggregates and the table
  - Read-only — no action buttons, no overflow menus
  - All amounts use `className="currency"`

- [x] 12. Wire `TaxesDeductionsTab` into `PayrollRunDetailPage.jsx`
  - Replace the tab 1 placeholder (from task 10) with `<TaxesDeductionsTab slips={slips} />`

---

## Phase 4 — Bulk CSV Import/Export

- [x] 13. Create `salary-service/services/csvImportService.js`
  - `parseLopeRows(csvText)` — parses `employeeId, lopDays, reason` rows; trims whitespace; returns array
  - `parseOneTimeRows(csvText)` — parses `employeeId, kind, label, amount` rows; validates `kind` enum
  - `validateEmployeeIds(runId, rows)` — builds Set from run's slips; returns `{ validIds, errors }`
  - `importLop(runId, rows, actorId)` — validates then calls `applyLopAdjustment` per row; returns `{ applied, errors }`
  - `importOneTime(runId, rows, actorId)` — validates then calls `applyOneTimeEntry` per row; returns `{ applied, errors }`
  - **Whole-import rejection**: if `errors.length > 0` from `validateEmployeeIds`, throw before applying anything

- [x] 14. Add CSV import/export handlers to `salary-service/controllers/payrollRunController.js`
  - `importLopCsv` — reads uploaded file buffer, calls `csvImportService.importLop`, returns applied count or error list
  - `importOneTimeCsv` — same pattern for one-time entries
  - `exportEmployeeSummary` — streams CSV response with `Content-Disposition: attachment`

- [x] 15. Register import/export endpoints in `salary-service/routes/payrollRuns.js`
  - `POST /:id/import/lop` → `authenticate, requireAdmin, uploadPayrollDoc (memStorage), ctrl.importLopCsv`
  - `POST /:id/import/one-time` → `authenticate, requireAdmin, uploadPayrollDoc (memStorage), ctrl.importOneTimeCsv`
  - `GET  /:id/export/employee-summary` → `authenticate, payrollAccess, ctrl.exportEmployeeSummary`

- [x] 16. Create `salary-service-frontend/src/components/CsvImportExport.jsx`
  - "Import / Export" Button with `UploadFile` icon, opens MUI `Menu`
  - "Import LOP Details" and "Import Earnings/Deductions" items disabled when `run.status !== 'draft'`
  - "Export Employee Summary" item always enabled
  - File picker (`<input type="file" accept=".csv" hidden>`) triggered on menu item click
  - Error dialog showing per-row error table if API returns validation errors
  - Wire into `PayrollRunDetailPage.jsx` header area

- [x] **Phase 4 verification gate**:
  - Upload a CSV with at least one unknown `employeeId`; confirm the API returns an error list and zero changes are applied to any slip

---

## Phase 5 — Approval Workflow

- [x] 17. Add approval handlers to `salary-service/controllers/payrollRunController.js`
  - `submitForApproval` — requires `run.status === 'draft'` and at least one slip; if requester is Admin sets `approvalStatus: 'approved'` (combined action), otherwise `'submitted'`; fires appropriate audit event
  - `approveRun` — requires Admin; sets `approvalStatus: 'approved'`; fires `PAYRUN_APPROVED`
  - `rejectRun` — requires Admin; requires non-empty `rejectionReason` body field; sets `approvalStatus: 'rejected'`; fires `PAYRUN_REJECTED`

- [x] 18. Update `finalizeRun` in `salary-service/controllers/payrollRunController.js`
  - Add guard: if `run.approvalStatus !== 'approved'`, return HTTP 422 with message: `"This run must be approved before it can be finalized. Current approval status: <value>"`

- [x] 19. Register approval endpoints in `salary-service/routes/payrollRuns.js`
  - `POST /:id/submit` → `authenticate, payrollAccess, ctrl.submitForApproval`
  - `POST /:id/approve` → `authenticate, requireAdmin, ctrl.approveRun`
  - `POST /:id/reject` → `authenticate, requireAdmin, ctrl.rejectRun`

- [x] 20. Create `salary-service-frontend/src/components/ApprovalToolbar.jsx`
  - Renders below the existing action buttons in `PayrollRunDetailPage.jsx` header
  - Conditional rendering per the state/role table in design.md §5.2
  - "Finalize" button shows disabled tooltip "Approval required before finalizing" when `approvalStatus !== 'approved'`
  - Rejection banner shows amber `Alert` with `rejectionReason` text and a "Resubmit" button
  - Wire into `PayrollRunDetailPage.jsx`

- [x] **Phase 5 verification gate**:
  - Boot the service cleanly; confirm routeAudit logs show all 3 new endpoints have auth middleware
  - Confirm `finalizeRun` returns HTTP 422 with the explicit message when called on an unapproved run

---

## Phase 6 — Payment Recording

- [x] 21. Create `salary-service/services/notificationService.js`
  - `sendPayslipNotification({ slip, run, actorId })` — checks `EMAIL_NOTIFICATIONS_ENABLED`; if false, writes audit note with explicit skip reason; if true, placeholder `// TODO: implement SMTP`
  - Must never throw — wrap in try/catch and log errors

- [x] 22. Update `markPaid` (whole run) in `salary-service/controllers/payrollRunController.js`
  - Accept `paymentMode` (required, enum: `bankTransfer|cheque|cash`) and `payDate` (required, Date) from request body
  - Set `paymentStatus: 'paid'`, `paidAt`, `paidBy`, `paymentMode` on all slips where `withheld.isWithheld !== true` and `skipped !== true`
  - Accept `notifyEmployee` boolean; call `notificationService.sendPayslipNotification` per slip if true

- [x] 23. Add `markSlipPaid` handler to `salary-service/controllers/payrollRunController.js`
  - `POST /:id/slips/:slipId/mark-paid` — accepts `paymentMode`, `paidAt`, `notifyEmployee`
  - Sets slip `paymentStatus: 'paid'`, `paidAt`, `paidBy`, `paymentMode`
  - Fires `SLIP_MARKED_PAID_INDIVIDUAL` audit event
  - After save, queries all eligible slips in the run; if all paid, sets `PayrollRun.status = 'paid'`
  - Calls `notificationService.sendPayslipNotification` if `notifyEmployee === true`

- [x] 24. Register `markSlipPaid` in `salary-service/routes/payrollRuns.js`
  - `POST /:id/slips/:slipId/mark-paid` → `authenticate, requireAdmin, ctrl.markSlipPaid`

- [x] 25. Update "Mark as Paid" toolbar in `EmployeeSummaryTab.jsx` (Phase 2)
  - When activated with selected rows, open a `RecordPaymentDialog` that collects `paymentMode`, `paidAt` date, and `notifyEmployee` checkbox
  - Call `POST /api/payroll-runs/:id/slips/:slipId/mark-paid` for each selected slip
  - `notifyEmployee` checkbox label: "Notify employee by email (requires email configuration)"

- [x] **Phase 6 verification gate**:
  - Mark one slip as paid individually; confirm the slip document has `paymentStatus: 'paid'` and the parent run still has `status: 'finalized'`
  - Mark all remaining eligible slips as paid; confirm the parent run flips to `status: 'paid'` automatically

---

## Phase 7 — Comments / Notes

- [x] 26. Add `addComment` handler to `salary-service/controllers/payrollRunController.js`
  - Validates `text` is non-empty and ≤ 2000 chars
  - Pushes to `PayrollRun.comments` array
  - Fires `PAYRUN_COMMENT_ADDED` audit event

- [x] 27. Register comments endpoint in `salary-service/routes/payrollRuns.js`
  - `POST /:id/comments` → `authenticate, payrollAccess, ctrl.addComment`

- [x] 28. Create `salary-service-frontend/src/components/CommentsPanel.jsx`
  - MUI `Drawer` anchor="right", width 360px
  - Scrollable comment list showing `authorEmail`, `text`, formatted `createdAt`
  - `TextField multiline` + "Add Note" `Button` at bottom
  - Empty state: "No notes yet"
  - No edit/delete — append-only

- [x] 29. Wire `CommentsPanel` into `PayrollRunDetailPage.jsx`
  - Add "Notes" `Button` (`ChatBubbleOutline` icon, outlined, `var(--brand-red)`) in top-right of header
  - Toggles `commentsOpen` state to show/hide the `Drawer`
  - `comments` data comes from existing `GET /api/payroll-runs/:id` response — no extra fetch
  - After adding a comment, call `load()` to refresh comments list

---

## Phase 8 — New Joinee Arrears

- [x] 30. Update `generatePayrollRun` in `salary-service/services/payrollRunService.js`
  - After each slip is saved, check if `attendanceData.joiningDate` falls within the current payroll month (strictly after period start, on or before period end)
  - If so, compute prorated arrears amount: `(daysWorked / totalDays) × monthlyGross`
  - Set `pendingArrearsSuggestion` on the slip — do NOT push to `arrears[]` array

- [x] 31. Add arrears confirmation handlers to `salary-service/controllers/payrollRunController.js`
  - `confirmArrears` — moves `pendingArrearsSuggestion` data into `arrears[]` array entry; clears the suggestion; fires `SLIP_ARREARS_ADDED`; triggers `recomputeAndSaveSlip`
  - `dismissArrears` — sets `pendingArrearsSuggestion.dismissed = true`; no audit event needed

- [x] 32. Register arrears endpoints in `salary-service/routes/payrollRuns.js`
  - `POST /:id/slips/:slipId/confirm-arrears` → `authenticate, requireAdmin, ctrl.confirmArrears`
  - `POST /:id/slips/:slipId/dismiss-arrears` → `authenticate, requireAdmin, ctrl.dismissArrears`

- [x] 33. Update `EmployeeSummaryTab.jsx` to surface arrears suggestions
  - Rows with `pendingArrearsSuggestion.dismissed === false && pendingArrearsSuggestion.amount > 0` show an amber `Chip` label "Arrears Pending"
  - Clicking the chip (or a row expand) shows an inline panel: suggested amount, reason, "Add to Slip" and "Dismiss" buttons

---

## Phase 9 — LOP Reversal (next-run pattern)

- [x] 34. Add `applyReversalToNextRun` handler to `salary-service/controllers/payrollRunController.js`
  - Verifies source run is `finalized` or `paid`
  - Verifies `nextRunId` (from request body) is a `draft` run
  - Finds the employee's slip in the next run; returns 404 if not found (employee not yet in next run)
  - Appends `type: 'manual_addition'` entry to that slip's `lopAdjustments` with `sourceRunId` pointing to the original run
  - Calls `recomputeAndSaveSlip` on the next run's slip
  - Fires `SLIP_LOP_ADJUSTED` audit event on the next run's slip

- [x] 35. Register reversal endpoint in `salary-service/routes/payrollRuns.js`
  - `POST /:id/slips/:slipId/apply-reversal-to-next-run` → `authenticate, requireAdmin, ctrl.applyReversalToNextRun`

- [x] 36. Update `EmployeeSummaryTab.jsx` — finalized/paid run view
  - For finalized/paid runs, replace the draft-only overflow menu with a read-only actions section
  - Add "Apply Correction to Next Run" action that opens a dialog collecting: days, reason, and a dropdown to select the target draft run (fetched from `GET /api/payroll-runs?status=draft`)
  - UI copy below the dialog: _"Corrections to finalized runs are applied to the employee's next pay run. This will not change the paid slip or its PDF."_

- [x] **Phase 9 verification gate**:
  - Create and confirm a reversal to a next draft run; inspect the target slip's `lopAdjustments` array and confirm `sourceRunId` references the original run's `_id`

---

## Phase 10 — Off-cycle and Resettlement Run Types

- [x] 37. Update `salary-service/services/payrollRunService.js` — `createPayrollRun`
  - Add `payRunType = 'regular'` and `employeeIds = null` parameters
  - For `offCycle`: skip the duplicate-run check; pass `employeeIds` filter to generate step
  - For `resettlement`: validate each `employeeId` against AMS feed for inactive/terminated status via `fetchEmployeeAttendance` or a new `fetchEmployeeProfile` call; throw if any are active

- [x] 38. Update `generatePayrollRun` in `salary-service/services/payrollRunService.js`
  - If run has `payRunType: 'offCycle'` and `employeeIds` array is set, filter `profiles` to only those in `employeeIds`
  - If run has `payRunType: 'resettlement'`, skip the AMS attendance fetch; set all `attendanceData` fields to 0; slip computation relies on `oneTimeEntries` only

- [ ] 39. Update `createRun` handler in `salary-service/controllers/payrollRunController.js`
  - Accept `payRunType`, `employeeIds` from request body
  - Validate `employeeIds` is non-empty for `offCycle` and `resettlement` types

- [ ] 40. Write background migration script `salary-service/scripts/migratePayRunType.js`
  - Sets `payRunType: 'regular'` on all existing `PayrollRun` documents where `payRunType` is undefined/null
  - Idempotent (safe to re-run)
  - Logs count of documents updated

- [ ] 41. Update `salary-service-frontend/src/pages/PayrollRunsPage.jsx`
  - Replace the single "New Run" `Button` with a split-button or `Button` + `Menu` pattern offering three options: Regular Payroll, Off-Cycle Payroll, Resettlement Payroll
  - Regular dialog: existing month/year/notes form unchanged
  - Off-Cycle dialog: adds multi-select employee picker (`Autocomplete` MUI, multiple, fetches from `GET /api/financial-profiles?isActive=true`)
  - Resettlement dialog: same picker but fetches from `GET /api/financial-profiles?isActive=false`; note: "Only inactive/terminated employees can be included in a resettlement run"
  - All three dialogs pass `payRunType` and `employeeIds` in the POST body

---

## Final Verification Checklist

Before considering the feature complete, confirm:

- [ ] Phase 1: Service boots cleanly; existing PayrollRun/SalarySlip documents load without error
- [ ] Phase 2: Raw before/after of slip document for each of the 7 overflow actions confirming field changes
- [ ] Phase 4: Deliberate malformed CSV import (unknown employeeId) returns error list; zero slips modified
- [ ] Phase 5: `routeAudit.js` boot log shows all new endpoints have auth middleware
- [ ] Phase 6: Individual slip mark-paid sets `paymentStatus: 'paid'`; parent run stays `finalized` until all eligible slips are paid
- [ ] Phase 9: Reversal to next run shows `sourceRunId` back-reference in the adjustment entry
- [ ] All phases: No `--brand-red` or design token regressions in the UI; tabular-nums applied to all currency columns
