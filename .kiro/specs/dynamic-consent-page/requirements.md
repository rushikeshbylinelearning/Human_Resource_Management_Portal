# Requirements Document

## Introduction

The **Dynamic Consent Page** feature transforms the existing Policy Management system's static PDF-based acknowledgement flow into a structured, editable 5-step consent wizard. The feature extends the existing `backend/models/Policy.js` and `backend/models/PolicyAcceptanceLog.js` (preserving all current fields) with a parallel template-driven system that enables HR to author and edit structured consent content inline—renaming steps, editing body copy, managing summary cards, adding/removing consent checkboxes, and replacing hero images—without re-uploading PDFs for every wording change.

When a PDF is uploaded, the system extracts its text and uses it to seed a structured "Full notice" clause list automatically, which HR reviews and edits before publishing. The PDF becomes an import source and retained audit artifact rather than the runtime employee-facing document.

The employee-facing experience shifts from scrolling a single PDF to a 5-step wizard (At a glance, What we collect, Your choices, Full notice, Consent) with guardian identity fields, individually-required consent checkboxes, and three clear outcome paths: provide consent, continue without consent, or request an alternative.

All changes are **additive and non-breaking**. Existing non-consent policies (Code of Conduct, Leave & Attendance Policy, etc.) continue to work through the current PDF-viewer flow unchanged. This is a new, opt-in feature per policy, not a replacement of the general Policy Management page.

---

## Glossary

- **Policy**: The existing flat MongoDB document representing a policy PDF (name, version, effectiveFrom, department, status, fileId, fileName, isMandatoryOnboarding, wordCount). Unchanged.
- **PolicyAcceptanceLog**: The existing immutable audit log for policy acceptance (userId, policyId, reading metrics, accepted, checkboxAcknowledged, timeline, status, profileDeadline). Extended, not replaced.
- **PolicyTemplate**: A new MongoDB model for structured, editable consent content (name, version, status, effectiveDate, sourceType, sourcePdfFileId, variables, hero, steps, consentCheckboxes, guardianRights, createdBy, updatedBy).
- **sourceType**: Enum on PolicyTemplate distinguishing `pdf_import` (extracted from uploaded PDF) vs. `manual` (authored from scratch).
- **sourcePdfFileId**: GridFS ObjectId reference to the PDF that seeded this template (retained for audit/legal compliance).
- **variables**: A map of `{{placeholder}} → value` (e.g., `{{schoolName}}`, `{{productName}}`, `{{privacyEmail}}`, `{{examContact}}`) used for runtime substitution in rendered content.
- **hero**: The top banner section of the consent wizard (badge, title, titleHighlight, body, imageUrl).
- **steps**: An ordered array of wizard steps (key, order, title, layout, intro, items). Each step has a layout enum: `card_grid`, `column_grid`, `clause_list`, or `consent_form`.
- **consentCheckboxes**: An array of individually-required checkboxes (id, order, label, required, category, enabled) that appear in the final "Consent" step.
- **guardianRights**: An array of informational rights badges (label, enabled) displayed in the "Your choices" step.
- **outcome**: A new enum field on PolicyAcceptanceLog distinguishing `consented`, `continued_without_consent`, or `alternative_requested`.
- **guardian**: A new sub-document on PolicyAcceptanceLog capturing guardian identity (studentFullName, studentAdmissionId, guardianName, relationship, guardianEmail, guardianMobile, remark).
- **checkboxResponses**: A new array on PolicyAcceptanceLog recording which checkboxes were checked (checkboxId, label, required, checked).
- **templateVersion**: A new String field on PolicyAcceptanceLog linking the log to the PolicyTemplate version accepted.
- **LLM extraction**: An AI-powered service call that parses PDF text into structured JSON (clause_list items + consentCheckboxes candidates) constrained to a strict schema.
- **GridFS bucket**: The existing `getPolicyBucket()` from `backend/db.js` used for PDF storage. Reused for template hero images.
- **AdminPoliciesPage.jsx**: The existing "Policies Management" admin page (5 tabs: Policies, HR Queries, Anonymous Messages, Onboarding Compliance, Employee Documents). Extended with a 6th tab: "Consent Templates".
- **ConsentWizard.jsx**: The new employee-facing 5-step wizard component that replaces the PDF viewer for consent-enabled policies.
- **StandalonePolicyModal.jsx**: The existing employee-facing policy acknowledgement modal (embeds PolicyViewer, tracks reading time/scroll, single checkbox). Bypassed for consent-enabled policies.
- **PolicyViewer.jsx**: The existing PDF iframe/embed component. Continues to be used for non-consent policies.
- **authenticateToken**: The existing JWT middleware used across the backend for all authenticated routes. Reused for all new endpoints.
- **requireAdminOrHr**: The existing role-gate middleware used on policy upload/delete routes. Reused for all mutating template endpoints.
- **pdfjs-dist**: The existing PDF text extraction library already in use in `frontend/src/utils/pdfPollParser.js`. Reused for backend PDF text extraction.

---

## Requirements

### Requirement 1 — Phase 1: Data Models

**User Story:** As a system architect, I want the PolicyTemplate and extended PolicyAcceptanceLog models to carry all fields needed for structured consent authoring, guardian identity capture, and multi-checkbox consent outcomes, so that subsequent feature phases have a stable data foundation.

#### Acceptance Criteria

1. THE PolicyTemplate Model SHALL be a new Mongoose schema with the following fields:
   - `name` (String, required, trim)
   - `version` (String, required, trim)
   - `status` (enum: `draft`, `active`, `archived`, default: `draft`)
   - `effectiveDate` (Date, required)
   - `sourceType` (enum: `pdf_import`, `manual`, required)
   - `sourcePdfFileId` (ObjectId, GridFS reference, optional — null for manual templates)
   - `variables` (Map of String → String, default: `{}`)
   - `hero` sub-document with `badge` (String), `title` (String, required), `titleHighlight` (String), `body` (String), `imageUrl` (String)
   - `steps` array where each element contains `key` (String, required, enum: `at_a_glance`, `what_we_collect`, `your_choices`, `full_notice`, `consent`), `order` (Number, required), `title` (String, required), `layout` (enum: `card_grid`, `column_grid`, `clause_list`, `consent_form`, required), `intro` sub-document with `eyebrow` (String), `heading` (String), `subheading` (String), and `items` (Array of Mixed, schema varies by layout)
   - `consentCheckboxes` array where each element contains `id` (String, required, unique per template), `order` (Number, required), `label` (String, required), `required` (Boolean, default: true), `category` (String), `enabled` (Boolean, default: true)
   - `guardianRights` array where each element contains `label` (String, required), `enabled` (Boolean, default: true)
   - `createdBy` (ObjectId ref User, required), `updatedBy` (ObjectId ref User), `createdAt` (Date, auto), `updatedAt` (Date, auto)

2. THE PolicyTemplate Model SHALL have a compound unique index on `(name, version, status)` ensuring only one `active` template per name at any time.

3. THE PolicyTemplate steps[].items array SHALL support three item type discriminators:
   - `card_grid` items: `{ icon, title, body, enabled }`
   - `column_grid` items: `{ title, bullets: [{ text, enabled }], enabled }`
   - `clause_list` items: `{ clauseNumber, title, body, enabled }`

4. THE PolicyAcceptanceLog Model SHALL be extended (not replaced) with the following new fields:
   - `templateVersion` (String, optional — null for legacy PDF-only logs)
   - `guardian` sub-document with `studentFullName` (String), `studentAdmissionId` (String), `guardianName` (String, required when guardian present), `relationship` (enum: `parent`, `legal_guardian`, `other_authorized_guardian`, required when guardian present), `guardianEmail` (String), `guardianMobile` sub-document with `countryCode` (String, default: `+966`), `number` (String), `remark` (String)
   - `checkboxResponses` array where each element contains `checkboxId` (String, required), `label` (String, required), `required` (Boolean, required), `checked` (Boolean, required)
   - `outcome` (enum: `consented`, `continued_without_consent`, `alternative_requested`, optional — null for legacy logs)

5. THE PolicyAcceptanceLog Model SHALL retain all existing fields (userId, policyId, policyName, policyVersion, readingStartedAt, readingCompletedAt, readingDurationSeconds, minimumReadingSeconds, scrolledToBottom, accepted, acceptedAt, checkboxAcknowledged, ipAddress, userAgent, deviceType, browser, timeline, status, onboardingCompletedAt, profileDeadline, createdAt, updatedAt) unchanged.

6. WHEN a PolicyAcceptanceLog is created with `outcome: 'consented'`, THE System SHALL validate that every `checkboxResponses[i].checked === true` where the corresponding template checkbox has `required: true`, returning HTTP 422 if validation fails.

---

### Requirement 2 — Phase 2: PDF Extraction and Template CRUD

**User Story:** As an Admin, I want to upload a PDF and have the system extract its text and propose structured clauses and consent checkboxes for my review, so that I can seed a template from legal documents without manual retyping.

#### Acceptance Criteria

1. WHEN an Admin uploads a PDF via the new "Import from PDF" flow, THE System SHALL create a draft PolicyTemplate with `sourceType: 'pdf_import'` and store the PDF in GridFS, recording `sourcePdfFileId`.

2. WHEN an Admin triggers PDF extraction on a draft template, THE System SHALL extract text from the stored PDF using the existing `pdfjs-dist` library (reused from `frontend/src/utils/pdfPollParser.js` pattern) and send the extracted text to an LLM API call with a strict JSON schema constraint.

3. THE LLM extraction endpoint SHALL return a JSON object containing:
   - `clauses` array for the `full_notice` step, each with `{ clauseNumber, title, body }`
   - `proposedCheckboxes` array with `{ label, category }` candidates derived from "I consent to…" or "I agree…" phrasing in the PDF text
   - THE LLM SHALL NOT generate card_grid or column_grid content; those steps are curated by HR from sensible starter defaults.

4. WHEN the LLM extraction completes, THE System SHALL populate the template's `steps` array with a single `clause_list` step containing the extracted clauses and populate `consentCheckboxes` with the proposed checkboxes (all defaulting to `required: true` and `enabled: true`).

5. THE System SHALL provide a `POST /policy-templates` endpoint that creates a blank draft template or a `pdf_import` template from an uploaded file, authenticated via `authenticateToken` and gated by `requireAdminOrHr`.

6. THE System SHALL provide a `POST /policy-templates/:id/extract-from-pdf` endpoint that triggers the LLM extraction flow, returning the populated `steps` and `consentCheckboxes` for HR review.

7. THE System SHALL provide a `PATCH /policy-templates/:id` endpoint that accepts partial updates to any template field (hero, steps, consentCheckboxes, guardianRights, variables), authenticated and admin-gated.

8. THE System SHALL provide a `POST /policy-templates/:id/publish` endpoint that sets `status: 'active'`, increments or sets `version`, and archives any previously `active` template with the same `name`.

9. THE System SHALL provide a `GET /policy-templates/active` endpoint that resolves the current active template by `name` query param, returning 404 if none exists.

10. WHERE the existing `backend/package.json` already includes a PDF parsing library (checked: none found except `pdfkit` for generation), THE System SHALL add `pdf-parse` as a new dependency for backend text extraction.

---

### Requirement 3 — Phase 3: Admin Template Editor UI

**User Story:** As an HR Admin, I want a visual editor where I can rename steps, edit body copy, add/remove summary cards and bullets, add/remove consent checkboxes, and replace the hero image, so that I can iterate on consent content without developer help.

#### Acceptance Criteria

1. WHEN an Admin opens the new "Consent Templates" tab on AdminPoliciesPage.jsx, THE System SHALL render a list of all PolicyTemplates (draft, active, archived) with columns for Name, Version, Status, Effective Date, and Actions (Edit, Publish, Archive).

2. WHEN an Admin clicks "Edit" or "Import from PDF" on a template, THE System SHALL navigate to a new `PolicyTemplateEditorPage.jsx` route (`/admin/policy-templates/:id/edit`).

3. THE PolicyTemplateEditorPage SHALL render a stepper header matching the attached screenshots (numbered circles 01-05 for the 5 steps, green filled for visited/current, gray for future, connecting lines between steps).

4. THE PolicyTemplateEditorPage SHALL render the hero banner block with inline editable text fields for `badge`, `title`, `titleHighlight`, `body`, and a "Replace image" button that opens a file picker and uploads the image to GridFS, updating `hero.imageUrl`.

5. WHEN an Admin selects a step in the stepper, THE Editor SHALL switch the main content area to that step's layout editor based on `steps[i].layout`:
   - `card_grid`: grid of cards, each with icon picker, title input, body textarea, red "Disable" pill (soft-toggle, sets `enabled: false`), "+ Add new card" dashed-border button
   - `column_grid`: 3-column layout, each column with title input, bulleted list (text input per bullet, red trash icon, "+ Add bullet"), "+ Add new card" for new column
   - `clause_list`: numbered white cards (auto-renumber on reorder/insert), title input, body textarea, red "Disable" pill, green "+" expand icon, "Add new notice section" form at bottom with Section title input, Section body textarea, "Add section" button
   - `consent_form`: guardian identity field layout (Student full name, Student/Admission ID, Parent/Guardian name, Relationship dropdown, Parent/Guardian email, Parent/Guardian mobile with country code selector, Remark textarea) + list of consentCheckboxes each with red "Disable" pill + "+ Add new checkbox" button

6. THE "Your choices" step editor SHALL render a chip row for `guardianRights[]` with each chip showing its label and a red "Disable" pill, plus a "+ Add new right" button.

7. THE Editor SHALL autosave changes on blur (PATCH `/policy-templates/:id`) without requiring an explicit save button, displaying a subtle "Saved" indicator on successful patch.

8. THE Editor SHALL show an explicit "Publish" button in the top-right that calls `POST /policy-templates/:id/publish` and redirects to the Consent Templates tab.

9. THE "Import from PDF" entry point on the existing `PolicyUploadForm.jsx` SHALL, after PDF upload, call `POST /policy-templates` with `sourceType: 'pdf_import'`, then call `POST /policy-templates/:id/extract-from-pdf`, and route directly into the editor with the draft pre-populated for HR review.

10. THE Editor SHALL follow the existing MUI styling conventions from `AdminPoliciesPage.jsx` exactly (cardBaseSx, scrollBoxSx, color palette `#6366f1` primary, `#166534` green, `#f8fafc` neutral backgrounds).

---

### Requirement 4 — Phase 4: Consent Submission API

**User Story:** As a backend service, I want to validate and record consent submissions with guardian identity and multi-checkbox responses, so that the system captures legally compliant consent records.

#### Acceptance Criteria

1. THE System SHALL provide a `POST /consent/submit` endpoint (new file `backend/routes/consent.js` or extend `backend/routes/onboarding.js`) that accepts:
   - `policyId` (ObjectId, required)
   - `templateVersion` (String, required)
   - `guardian` sub-document (all fields optional unless relationship is provided, then guardianName and relationship are required)
   - `checkboxResponses` array (each entry: `checkboxId`, `label`, `required`, `checked`)
   - `readingDurationSeconds` (Number, required)
   - `visitedSteps` array (String[], required — must include all 5 step keys)

2. WHEN `/consent/submit` is called, THE System SHALL:
   - Load the active PolicyTemplate by `templateVersion`
   - Validate that `visitedSteps` includes all 5 step keys
   - Validate that every `checkboxResponses[i].checked === true` where the template checkbox has `required: true`
   - Validate that `guardian.guardianName` and `guardian.relationship` are present if any guardian field is provided
   - Create a PolicyAcceptanceLog with `outcome: 'consented'`, `accepted: true`, `templateVersion`, `guardian`, `checkboxResponses`, and all existing reading metrics fields
   - Return HTTP 201 with the created log

3. THE System SHALL provide a `POST /consent/continue-without-consent` endpoint that creates a PolicyAcceptanceLog with `outcome: 'continued_without_consent'`, `accepted: false`, and all provided reading metrics.

4. THE System SHALL provide a `POST /consent/request-alternative` endpoint that creates a PolicyAcceptanceLog with `outcome: 'alternative_requested'`, `accepted: false`, and triggers a notification to the school/HR contact via the existing `NewNotificationService`.

5. THE `/consent/submit` endpoint SHALL reuse the existing reading-time validation logic from `standaloneAcceptPolicy` in `backend/controllers/onboardingController.js` (minimum reading seconds threshold based on wordCount or step content length).

6. THE System SHALL use the existing `authenticateToken` middleware for all consent endpoints and apply the same role-based access control as the current `standaloneAcceptPolicy` endpoint.

---

### Requirement 5 — Phase 5: Employee-Facing Consent Wizard UI

**User Story:** As an Employee, I want to step through a 5-step consent wizard with clear explanations, guardian identity fields, and individually-required checkboxes, so that I can provide informed consent or choose an alternative path.

#### Acceptance Criteria

1. WHEN an Employee opens a consent-enabled policy (a policy with an active PolicyTemplate linked), THE System SHALL render the new `ConsentWizard.jsx` component instead of the existing `StandalonePolicyModal.jsx`.

2. THE ConsentWizard SHALL render a 5-step linear flow with the following steps in order:
   - 01 At a glance (card_grid layout)
   - 02 What we collect (column_grid layout)
   - 03 Your choices (informational rights chips + three action paths)
   - 04 Full notice (clause_list layout — the extracted PDF clauses)
   - 05 Consent (consent_form layout — guardian fields + consent checkboxes)

3. THE Wizard SHALL display a stepper header (same visual style as the admin editor: numbered circles, green filled for visited, gray for future, connecting lines) showing the current step.

4. THE Wizard SHALL replace all `{{placeholder}}` tokens in rendered content with the corresponding values from `PolicyTemplate.variables` at runtime (e.g., `{{schoolName}}` → "Kodeit Ascend").

5. THE Wizard SHALL track which steps have been visited and require that the Employee visit all 5 steps before the "Provide consent" button becomes enabled.

6. THE Wizard SHALL reuse the existing `useOnboarding()` context plumbing from `StandalonePolicyModal.jsx` (standalonePolicyModalOpen, currentStandalonePolicy, policyAcceptancePending) so it plugs into the existing PendingPolicyBanner → modal-open flow without changing that trigger logic.

7. THE Wizard SHALL implement the "Three clear paths" UI shown in the reference screenshots on the "Your choices" step:
   - "Open consent form" (proceeds to step 05)
   - "Record non-consent" (calls `/consent/continue-without-consent`, closes wizard)
   - "Contact the School" (calls `/consent/request-alternative`, closes wizard)

8. THE "Consent" step (05) SHALL render:
   - Guardian identity fields: Student full name, Student/Admission ID, Parent/Guardian name, Relationship dropdown (Parent / Legal Guardian / Other Authorized Guardian), Parent/Guardian email, Parent/Guardian mobile (country code selector + number input), Remark textarea
   - All consent checkboxes from `PolicyTemplate.consentCheckboxes` where `enabled: true`, each rendered as a Material-UI Checkbox with its label
   - "Provide consent" button (disabled until all required checkboxes are checked + all required guardian fields are filled + all 5 steps visited + minimum time on Full notice step)
   - "Continue without consent" button (calls `/consent/continue-without-consent`)

9. THE Wizard SHALL track reading time on the "Full notice" step (step 04) and require a minimum time threshold (same logic as `StandalonePolicyModal.jsx` readingStartTime/scrolledToBottom) before allowing submission.

10. WHEN the Employee clicks "Provide consent", THE Wizard SHALL call `POST /consent/submit` with guardian{}, checkboxResponses[], visitedSteps[], and readingDurationSeconds, then close the wizard and refresh the PendingPolicyBanner state.

11. IF `/consent/submit` returns HTTP 422 (validation failure), THE Wizard SHALL display an error alert with the validation message and NOT close the wizard.

12. THE Wizard SHALL follow the existing MUI styling conventions and color palette from `StandalonePolicyModal.jsx` and `AdminPoliciesPage.jsx`.

---

### Requirement 6 — Phase 6: Integration and Migration

**User Story:** As a system administrator, I want the consent wizard to coexist with the existing PDF-viewer flow and to migrate one existing policy as a worked example, so that I can validate the feature before rolling it out to all policies.

#### Acceptance Criteria

1. WHEN a Policy document has NO linked PolicyTemplate (determined by checking for an active PolicyTemplate with matching name), THE System SHALL render the existing `StandalonePolicyModal.jsx` with `PolicyViewer.jsx` (PDF iframe) unchanged.

2. WHEN a Policy document HAS a linked active PolicyTemplate, THE System SHALL render `ConsentWizard.jsx` instead of `StandalonePolicyModal.jsx`.

3. THE "Import from PDF" flow SHALL preserve the original PDF in GridFS via `sourcePdfFileId` so that it remains available for audit and legal compliance, even after the template is published and employees see only the structured wizard.

4. THE System SHALL provide a manual migration script `backend/scripts/migrate-policy-to-template.js` that:
   - Accepts a Policy `_id` as a command-line argument
   - Loads the Policy and its PDF from GridFS
   - Creates a PolicyTemplate with `sourceType: 'pdf_import'`, `sourcePdfFileId` set to the Policy's `fileId`, and status `draft`
   - Triggers the LLM extraction flow
   - Logs the template `_id` for HR review in the editor
   - Does NOT auto-publish the template (HR must review/edit/publish manually)

5. THE Migration script SHALL be idempotent (safe to re-run) and SHALL NOT modify the original Policy document.

6. THE System SHALL migrate one existing policy (e.g., "Student Data Privacy Notice" or "Consent for Data Processing") as a worked example, following the full flow: upload PDF → extract → HR edits in editor → publish → employee sees wizard.

7. THE Worked example SHALL be documented in a migration log file `backend/logs/policy-template-migration.log` with timestamps, Policy _id, Template _id, extraction summary (clause count, checkbox count), and publish timestamp.

8. WHEN the existing `getPendingPolicies` endpoint in `backend/controllers/onboardingController.js` is called, THE System SHALL include a `hasTemplate` boolean flag per policy indicating whether an active PolicyTemplate exists, so the frontend can conditionally render the wizard vs. PDF viewer.

---

## Non-Functional Requirements

### NFR-1: Performance

1. THE LLM extraction endpoint SHALL complete PDF text extraction and AI inference within 30 seconds for PDFs up to 50 pages.
2. THE Admin editor autosave (PATCH `/policy-templates/:id`) SHALL debounce user input by 1 second to avoid excessive API calls.
3. THE ConsentWizard SHALL lazy-load step content (only render the current step's items) to minimize initial render time.

### NFR-2: Security

1. ALL new endpoints SHALL use the existing `authenticateToken` middleware and role-based access control (`requireAdminOrHr` for mutating endpoints, `requireAuth` for read-only).
2. THE System SHALL sanitize all user-provided text inputs (template content, guardian identity fields) to prevent XSS injection.
3. THE System SHALL log all PolicyTemplate mutations (create, update, publish, archive) to the existing AuditLog collection (if available) or a dedicated PolicyTemplateAuditLog collection.

### NFR-3: Data Integrity

1. THE System SHALL never delete PolicyAcceptanceLog records — all logs are immutable once created.
2. THE System SHALL retain archived PolicyTemplates indefinitely for audit purposes.
3. THE System SHALL enforce referential integrity for `sourcePdfFileId` — prevent GridFS file deletion if it is referenced by any PolicyTemplate.

### NFR-4: Backwards Compatibility

1. THE System SHALL NOT modify the existing `Policy` or `PolicyAcceptanceLog` schemas in a breaking way — only add new optional fields.
2. THE System SHALL NOT break the existing PDF-viewer flow for policies without templates.
3. THE System SHALL handle legacy PolicyAcceptanceLog documents (created before this feature) gracefully — they will have `templateVersion: null`, `outcome: null`, `guardian: null`, `checkboxResponses: []`.
