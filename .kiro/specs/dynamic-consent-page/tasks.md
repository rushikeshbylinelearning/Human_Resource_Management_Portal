# Implementation Tasks — Dynamic Consent Page

## Implementation Notes

Work strictly in phase order. Each phase has a verification gate — do not start the next phase until the gate is cleared. Phase 1 data model changes are a prerequisite for every subsequent phase.

Existing files are edited in-place; only new service/component files are created fresh. The `backend` lives at `backend/` and the frontend at `frontend/src/`.

---

## Phase 1 — Data Models

- [ ] 1. Create `backend/models/PolicyTemplate.js`
  - Implement the full schema as specified in design.md §1.1: name, version, status, effectiveDate, sourceType, sourcePdfFileId, variables (Map), hero sub-document, steps array with itemSchema, consentCheckboxes array, guardianRights array, createdBy, updatedBy, timestamps
  - Add compound partial unique index on `(name, version, status)` scoped to `status: 'active'`
  - Add index on `(name, status)` for fast active template lookup
  - Use `strict: false` on itemSchema to allow flexible per-layout fields

- [ ] 2. Update `backend/models/PolicyAcceptanceLog.js`
  - Add `templateVersion` (String, default: null)
  - Add `guardian` sub-document with studentFullName, studentAdmissionId, guardianName, relationship enum (parent/legal_guardian/other_authorized_guardian), guardianEmail, guardianMobile sub-document (countryCode, number), remark
  - Add `checkboxResponses` array with checkboxId, label, required, checked fields
  - Add `outcome` enum (consented/continued_without_consent/alternative_requested, default: null)
  - Do NOT remove any existing fields — only add new optional fields

- [ ] 3. Verify existing Policy.js model
  - Confirm no changes are needed to Policy.js (it remains unchanged)
  - Confirm `backend/db.js` exports `getPolicyBucket()` for GridFS access (already exists per grep search)

- [ ] **Phase 1 verification gate**: Confirm the following before proceeding to Phase 2:
  - Start the backend service and verify clean boot (no Mongoose schema errors in logs)
  - Confirm existing PolicyAcceptanceLog documents load without error
  - Confirm PolicyTemplate model can be imported and a test document can be created/saved

---

## Phase 2 — PDF Extraction and Template CRUD

- [ ] 4. Install PDF parsing dependency
  - Add `pdf-parse` to `backend/package.json` dependencies (version `^1.1.1`)
  - Run `npm install` in backend directory

- [ ] 5. Create `backend/services/pdfExtractionService.js`
  - Implement `extractTextFromGridFS(fileId)` as specified in design.md §2.1
  - Reuse `getPolicyBucket()` from `backend/db.js`
  - Stream PDF from GridFS, parse with `pdf-parse`, return plain text
  - Handle errors gracefully (invalid PDF, missing file, etc.)

- [ ] 6. Create `backend/services/llmConsentService.js`
  - Implement `extractConsentStructure(pdfText)` as specified in design.md §2.2
  - Configure LLM API endpoint and key from environment variables (`OPENAI_API_KEY` or equivalent)
  - Define strict JSON schema for LLM response (clauses array, proposedCheckboxes array)
  - Set system prompt to constrain LLM to extract only clause_list and checkboxes (no card_grid/column_grid)
  - Set temperature to 0.3 for deterministic extraction
  - Validate LLM response against schema before returning
  - Add timeout (30s) and error handling

- [ ] 7. Create `backend/controllers/policyTemplateController.js`
  - Implement `createTemplate(req, res)` — create blank draft or pdf_import draft (design.md §2.3)
  - Implement `extractFromPdf(req, res)` — call pdfExtractionService + llmConsentService, populate template steps and consentCheckboxes
  - Implement `updateTemplate(req, res)` — partial update via Object.assign
  - Implement `publishTemplate(req, res)` — set status: 'active', archive previous active template with same name, auto-increment version
  - Implement `getActiveTemplate(req, res)` — query by name param, return active template or 404
  - Implement `listTemplates(req, res)` — return all templates sorted by createdAt desc
  - Use existing `authenticateToken` and `requireAdminOrHr` middleware

- [ ] 8. Create `backend/routes/policyTemplates.js`
  - Register all 6 endpoints from design.md §2.4:
    - `GET /` → `authenticateToken, requireAdminOrHr, ctrl.listTemplates`
    - `GET /active` → `authenticateToken, ctrl.getActiveTemplate`
    - `POST /` → `authenticateToken, requireAdminOrHr, ctrl.createTemplate`
    - `POST /:id/extract-from-pdf` → `authenticateToken, requireAdminOrHr, ctrl.extractFromPdf`
    - `PATCH /:id` → `authenticateToken, requireAdminOrHr, ctrl.updateTemplate`
    - `POST /:id/publish` → `authenticateToken, requireAdminOrHr, ctrl.publishTemplate`
  - Mount router in `backend/server.js` as `/api/policy-templates`

- [ ] 9. Test PDF extraction flow manually
  - Upload a test PDF policy via existing `/policies-gridfs/upload` endpoint
  - Call `POST /policy-templates` with `sourceType: 'pdf_import'` and `sourcePdfFileId` set to the uploaded PDF's GridFS fileId
  - Call `POST /policy-templates/:id/extract-from-pdf` on the created template
  - Inspect the template document in MongoDB to confirm `steps[]` and `consentCheckboxes[]` are populated

- [ ] **Phase 2 verification gate**:
  - Confirm the LLM extraction endpoint completes within 30 seconds for a 10-page test PDF
  - Confirm extracted clauses have valid `clauseNumber`, `title`, `body` fields
  - Confirm proposedCheckboxes have valid `label` and `category` fields
  - Confirm the template status remains `draft` after extraction (not auto-published)

---

## Phase 3 — Admin Template Editor UI

- [x] 10. Create `frontend/src/components/admin/PolicyTemplateList.jsx`
  - Implement as specified in design.md §3.1
  - Fetch templates from `GET /api/policy-templates`
  - Render MUI Table with columns: Name, Version, Status (Chip with color), Effective Date, Source, Actions
  - Actions: Edit icon (navigate to editor), Publish icon (call `POST /api/policy-templates/:id/publish`)
  - Use existing MUI styling conventions (cardBaseSx from AdminPoliciesPage.jsx)

- [x] 11. Update `frontend/src/pages/AdminPoliciesPage.jsx`
  - Add 6th tab: "Consent Templates" (icon: `VerifiedUserOutlinedIcon`, value: 5)
  - Render `<PolicyTemplateList />` when `activeTab === 5`
  - Follow existing tab pattern (Tabs, Tab, scrollBoxSx)

- [x] 12. Create `frontend/src/pages/admin/PolicyTemplateEditorPage.jsx`
  - Implement skeleton as specified in design.md §3.2
  - Route: `/admin/policy-templates/:id/edit`
  - Fetch template from `GET /api/policy-templates/:id` (new endpoint to add: `GET /:id` → `ctrl.getTemplateById`)
  - Render stepper header with 5 steps (numbered circles, green filled for visited, gray for future)
  - Render hero banner editor: text fields for badge, title, titleHighlight, body; "Replace image" button
  - Implement autosave on blur: call `PATCH /api/policy-templates/:id` with updated fields, debounce by 1s
  - Show "Saved" indicator on successful patch (2s timeout)
  - Render "Publish" button that calls `POST /api/policy-templates/:id/publish` and redirects to Consent Templates tab
  - Step content editor: Switch on `currentStep.layout` to show placeholder alerts for each layout type

- [x] 13. Add `GET /api/policy-templates/:id` endpoint
  - In `backend/controllers/policyTemplateController.js`, implement `getTemplateById(req, res)`
  - Return full template document or 404
  - Register route: `GET /:id` → `authenticateToken, ctrl.getTemplateById` in `backend/routes/policyTemplates.js`

- [x] 14. Implement per-layout editors in PolicyTemplateEditorPage.jsx
  - **card_grid editor**: Grid of cards, each with icon picker (MUI Autocomplete or Select), title TextField, body TextField multiline, red "Disable" Chip (toggles `enabled: false`), "+ Add new card" Button at end
  - **column_grid editor**: 3-column Grid layout, each column with title TextField, bullets array (TextField per bullet, red DeleteIcon, "+ Add bullet" Button), "+ Add new card" Button for new column
  - **clause_list editor**: Numbered white Card per clause (auto-renumber based on array index), title TextField, body TextField multiline, red "Disable" Chip, green ExpandMoreIcon for collapse/expand, "Add new notice section" form at bottom (Section title TextField, Section body TextField multiline, "Add section" Button)
  - **consent_form editor**: Display guardian field labels (Student full name, Student/Admission ID, etc.) as read-only placeholders, list of consentCheckboxes with label TextField, required Checkbox toggle, red "Disable" Chip, "+ Add new checkbox" Button
  - All editors: Call autosave (PATCH `/api/policy-templates/:id`) on blur

- [x] 15. Implement "Your choices" guardianRights editor
  - In the step editor for `key: 'your_choices'`, render a Chip row showing all guardianRights
  - Each chip: label text, red "Disable" Chip (toggles `enabled: false`)
  - "+ Add new right" Button opens a dialog with TextField for label, "Add" Button appends to guardianRights array
  - Autosave on change

- [x] 16. Implement hero image upload
  - "Replace image" button opens file picker (`<input type="file" accept="image/*">`)
  - Upload image to GridFS or existing image storage (check if there's an existing image upload endpoint in the codebase — reuse if available, otherwise create new GridFS bucket for images)
  - Update `hero.imageUrl` with the uploaded image URL (GridFS download URL or CDN URL)
  - Autosave

- [ ] 17. Update `frontend/src/components/PolicyUploadForm.jsx`
  - Add "Import from PDF" checkbox or toggle in the upload form
  - If checked, after PDF upload completes, call `POST /api/policy-templates` with `sourceType: 'pdf_import'` and `sourcePdfFileId` set to the uploaded PDF's GridFS fileId
  - Then call `POST /api/policy-templates/:id/extract-from-pdf`
  - Navigate to `/admin/policy-templates/:id/edit` with the draft template ID

- [x] **Phase 3 verification gate**:
  - Confirm the editor loads a template without errors
  - Confirm autosave triggers on blur and updates the MongoDB document (check via MongoDB Compass or `db.policytemplates.findOne()`)
  - Confirm the "Publish" button sets status: 'active' and archives the previous active template with the same name
  - Confirm the "Import from PDF" flow creates a draft template, extracts content, and routes to the editor

---

## Phase 4 — Consent Submission API

- [x] 18. Create `backend/routes/consent.js` (or extend `backend/routes/onboarding.js`)
  - Implement `POST /submit` as specified in design.md §4.1
    - Validate all 5 steps visited (requiredSteps array: at_a_glance, what_we_collect, your_choices, full_notice, consent)
    - Validate all required checkboxes are checked (load active template, filter consentCheckboxes where `required: true` and `enabled: true`, check against checkboxResponses)
    - Validate guardian fields (if any guardian data provided, guardianName and relationship are required)
    - Create PolicyAcceptanceLog with outcome: 'consented', accepted: true, templateVersion, guardian, checkboxResponses, timeline events
    - Return HTTP 201 with logId
  - Implement `POST /continue-without-consent` — create log with outcome: 'continued_without_consent', accepted: false
  - Implement `POST /request-alternative` — create log with outcome: 'alternative_requested', call NewNotificationService.broadcastToAdmins to notify HR
  - Use existing `authenticateToken` middleware

- [x] 19. Register consent routes in `backend/server.js`
  - Mount router: `app.use('/api/consent', consentRouter)`

- [ ] 20. Test consent submission flow manually
  - Create a test active PolicyTemplate with 2 required checkboxes
  - Call `POST /consent/submit` with valid payload (all 5 steps visited, all required checkboxes checked, valid guardian data)
  - Confirm PolicyAcceptanceLog document is created with outcome: 'consented'
  - Call `POST /consent/submit` with invalid payload (missing required checkbox) — confirm HTTP 422 with error message
  - Call `POST /consent/continue-without-consent` — confirm log with outcome: 'continued_without_consent'
  - Call `POST /consent/request-alternative` — confirm log with outcome: 'alternative_requested' and HR notification sent

- [ ] **Phase 4 verification gate**:
  - Confirm all 3 consent endpoints return appropriate HTTP status codes (201, 422, 404)
  - Confirm validation errors list specific missing checkboxes or fields
  - Confirm PolicyAcceptanceLog documents are immutable (no update/delete routes exist)
  - Confirm NewNotificationService.sendToAdmins is called for alternative requests (check logs or notification collection)

---

## Phase 5 — Employee-Facing Consent Wizard UI

- [x] 21. Create `frontend/src/components/onboarding/ConsentWizard.jsx`
  - Implement skeleton as specified in design.md §5.1
  - Render MUI Dialog with stepper header (5 steps: At a glance, What we collect, Your choices, Full notice, Consent)
  - Track `activeStep` state (0-4), `visitedSteps` Set, `readingStartTime` timestamp
  - Fetch active template via `GET /api/policy-templates/active?name=...` on mount
  - Initialize `checkboxStates` Map from template.consentCheckboxes
  - Initialize `guardian` state object
  - Implement Next/Back buttons to navigate between steps
  - Mark each step as visited when entered (add to visitedSteps Set)

- [x] 22. Implement per-layout step renderers in ConsentWizard.jsx
  - **at_a_glance (card_grid)**: Render Grid of Card components, each showing icon, title, body from `currentStep.items` where `enabled: true`
  - **what_we_collect (column_grid)**: Render 3-column Grid, each column showing title and bulleted list from `currentStep.items` where `enabled: true`
  - **your_choices**: Render 3 action buttons: "Open consent form" (proceeds to step 4), "Record non-consent" (calls `/consent/continue-without-consent`, closes wizard), "Contact the School" (calls `/consent/request-alternative`, closes wizard). Also render guardianRights as informational Chip row.
  - **full_notice (clause_list)**: Render numbered white Card per clause, showing clauseNumber, title, body. Track reading time on this step (must spend minimum threshold, e.g., 60s).
  - **consent (consent_form)**: Render guardian identity fields (TextField per field, Select for relationship, mobile with country code Select + TextField), render all consentCheckboxes as FormControlLabel with Checkbox, "Provide consent" button (disabled until canSubmit), "Continue without consent" button

- [x] 23. Implement variable substitution in ConsentWizard
  - Before rendering any text content (hero.body, step.intro.heading, step.items[].body, checkbox.label), replace `{{placeholder}}` tokens with values from `template.variables`
  - Use a utility function `replaceVariables(text, variablesMap)` that iterates over variablesMap and replaces all occurrences

- [x] 24. Implement canSubmit validation in ConsentWizard
  - Check visitedSteps.size === 5
  - Check all required checkboxes are checked (requiredCheckboxes.every(cb => checkboxStates[cb.id] === true))
  - Check required guardian fields filled (if guardian.guardianName or guardian.relationship provided, both must be non-empty)
  - Disable "Provide consent" button when !canSubmit()

- [x] 25. Implement handleProvideConsent in ConsentWizard
  - Compute readingDurationSeconds = Math.floor((Date.now() - readingStartTime) / 1000)
  - Build payload: policyId, templateVersion, guardian, checkboxResponses (map checkboxStates to array), readingDurationSeconds, visitedSteps (map Set to array of step keys)
  - Call `POST /api/consent/submit`
  - On success: closeStandalonePolicyModal(), refresh PendingPolicyBanner state
  - On error (HTTP 422): display error Alert with validation message, do NOT close wizard

- [x] 26. Implement conditional rendering in onboarding flow
  - Extend `frontend/src/context/OnboardingContext.jsx` or the component that renders StandalonePolicyModal
  - When opening a policy modal, check if active template exists: `GET /api/policy-templates/active?name=...`
  - If template exists, render `<ConsentWizard />` instead of `<StandalonePolicyModal />`
  - If no template or API returns 404, render `<StandalonePolicyModal />` (existing PDF viewer flow)
  - Store `hasTemplate` boolean in state to avoid repeated API calls

- [ ] 27. Test wizard flow in dev environment
  - Open a consent-enabled policy (one with an active template)
  - Confirm wizard opens with stepper header showing 5 steps
  - Navigate through all 5 steps, confirm "Next" button works, visitedSteps tracked
  - On "Consent" step, confirm guardian fields and checkboxes render
  - Fill all required fields, check all required checkboxes, click "Provide consent"
  - Confirm success: wizard closes, policy no longer appears in PendingPolicyBanner
  - Test error case: uncheck a required checkbox, click "Provide consent" — confirm error Alert appears

- [x] **Phase 5 verification gate**:
  - Confirm wizard renders all 5 steps with correct content from template
  - Confirm "Provide consent" button is disabled until all validation passes
  - Confirm successful submission creates a PolicyAcceptanceLog with outcome: 'consented' and all checkbox responses captured
  - Confirm "Record non-consent" and "Contact the School" buttons work and create appropriate logs

---

## Phase 6 — Integration and Migration

- [x] 28. Extend `backend/controllers/onboardingController.js` → `getPendingPolicies`
  - After fetching pending policies, for each policy, check if an active template exists: `await PolicyTemplate.findOne({ name: policy.policyName, status: 'active' })`
  - Add `hasTemplate` boolean flag to each policy object in the response
  - Return updated policy list with `{ ...policy.toObject(), hasTemplate }`

- [x] 29. Update frontend to use hasTemplate flag
  - In `frontend/src/context/OnboardingContext.jsx` or wherever PendingPolicyBanner triggers the modal, use the `hasTemplate` flag from getPendingPolicies response instead of making a separate API call
  - Simplify conditional rendering: `if (policy.hasTemplate) <ConsentWizard /> else <StandalonePolicyModal />`

- [x] 30. Create `backend/scripts/migrate-policy-to-template.js`
  - Implement as specified in design.md §6.1
  - Accept CLI args: `node migrate-policy-to-template.js <policyId> <adminUserId>`
  - Load Policy by ID, create draft PolicyTemplate with sourceType: 'pdf_import', sourcePdfFileId
  - Call pdfExtractionService + llmConsentService to extract and populate template
  - Save template with status: 'draft'
  - Log migration details to `backend/logs/policy-template-migration.log` (JSON lines)
  - Make script idempotent (check if template already exists, skip if so)

- [ ] 31. Test migration script
  - Pick one existing policy (e.g., "Code of Conduct" or "Leave & Attendance Policy")
  - Run migration script: `node backend/scripts/migrate-policy-to-template.js <policyId> <adminUserId>`
  - Confirm draft template is created in MongoDB
  - Confirm log entry written to `backend/logs/policy-template-migration.log`
  - Do NOT publish the template yet — HR must review manually

- [ ] 32. Migrate one worked example policy end-to-end
  - Use migration script to create draft template for "Student Data Privacy Notice" (or similar)
  - Log in as HR admin, open Consent Templates tab, click Edit on the draft
  - Review extracted clauses, edit titles/bodies as needed
  - Add card_grid content to "At a glance" step manually (HR curated)
  - Add column_grid content to "What we collect" step manually
  - Add guardianRights to "Your choices" step
  - Review and edit consentCheckboxes labels
  - Click "Publish"
  - Log in as an employee, open the policy from PendingPolicyBanner
  - Confirm wizard opens (not PDF viewer)
  - Complete all 5 steps, provide consent
  - Confirm PolicyAcceptanceLog is created with outcome: 'consented'

- [x] 33. Document migration process
  - Create `backend/docs/consent-template-migration-guide.md` with step-by-step instructions for HR:
    1. Identify policies to migrate
    2. Run migration script per policy
    3. Review and edit draft templates in the editor
    4. Publish templates
    5. Monitor employee consent submissions
  - Include troubleshooting section (LLM extraction fails, template errors, etc.)

- [x] **Phase 6 verification gate**:
  - Confirm one policy has been migrated end-to-end (PDF → draft template → HR review → publish → employee sees wizard → consent submitted)
  - Confirm legacy policies without templates still show PDF viewer
  - Confirm migration script is idempotent (safe to re-run)
  - Confirm migration log file exists and contains valid JSON lines

---

## Final Verification Checklist

Before considering the feature complete, confirm:

- [ ] Phase 1: Service boots cleanly with new PolicyTemplate model; existing PolicyAcceptanceLog documents load without error
- [ ] Phase 2: LLM extraction completes within 30s for test PDFs; extracted data matches schema
- [ ] Phase 3: Admin editor loads, autosave works, publish sets status: 'active' and archives previous active
- [ ] Phase 4: All 3 consent endpoints validate inputs correctly; PolicyAcceptanceLog documents immutable
- [ ] Phase 5: Wizard renders all 5 steps; "Provide consent" button validation works; successful submission closes wizard
- [ ] Phase 6: One worked example policy migrated end-to-end; legacy policies still work via PDF viewer
- [ ] All phases: No breaking changes to existing Policy or PolicyAcceptanceLog documents (backwards compatible)
- [ ] All phases: Existing MUI styling conventions followed (cardBaseSx, scrollBoxSx, color palette #6366f1 primary, #166534 green)
- [ ] All phases: authenticateToken and requireAdminOrHr middleware applied to all sensitive endpoints
- [ ] Security: All user-provided text sanitized to prevent XSS
- [ ] Performance: Editor autosave debounced by 1s; wizard step content lazy-loaded

---

## Post-Launch Tasks (Optional Enhancements)

These are out of scope for the initial launch but recommended for future iterations:

- [ ] Add rich text editor (e.g., TinyMCE, Quill) for clause bodies and hero.body
- [ ] Add drag-and-drop reordering for clauses, checkboxes, guardianRights
- [ ] Add template versioning history view (show all archived versions)
- [ ] Add consent analytics dashboard (completion rate, average time per step, most-skipped checkboxes)
- [ ] Add multi-language support for templates (variables map per locale)
- [ ] Add email reminders for pending consent submissions
- [ ] Add bulk consent status export (CSV) for compliance reporting
