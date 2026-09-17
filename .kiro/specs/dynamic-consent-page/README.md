# Dynamic Consent Page Spec

## Overview

This spec transforms the existing Policy Management system's static PDF-based acknowledgement flow into a structured, editable 5-step consent wizard. HR can author and edit structured consent content inline—renaming steps, editing body copy, managing summary cards, adding/removing consent checkboxes, and replacing hero images—without re-uploading PDFs for every wording change.

## Key Features

### For HR/Admin
- **Import from PDF**: Upload a PDF, extract its text, use LLM to seed structured clauses and consent checkboxes
- **Visual Editor**: Edit hero banner, 5 wizard steps (At a glance, What we collect, Your choices, Full notice, Consent), consent checkboxes, and guardian rights
- **Per-Layout Editors**: Card grids, column grids, numbered clause lists, and consent forms
- **Autosave**: Changes saved automatically on blur (1s debounce)
- **Version Control**: Publish templates, archive previous versions

### For Employees
- **5-Step Wizard**: Linear flow with stepper header, clear progress indication
- **Guardian Identity Capture**: Student details, guardian relationship, contact info
- **Multi-Checkbox Consent**: Individual required checkboxes with category labels
- **Three Clear Paths**: Provide consent, continue without consent, or request alternative

### Technical Highlights
- **Non-Breaking**: Extends existing Policy/PolicyAcceptanceLog models with optional fields
- **Conditional Rendering**: hasTemplate flag controls wizard vs. PDF viewer
- **LLM-Powered Extraction**: AI parses PDF text into structured clauses + checkbox candidates
- **Immutable Audit Trail**: PolicyAcceptanceLog captures guardian identity, checkbox responses, outcome

---

## Document Structure

### [requirements.md](./requirements.md)
**EARS-style acceptance criteria + glossary**

- 6 requirements (one per phase):
  1. Data Models (PolicyTemplate, extended PolicyAcceptanceLog)
  2. PDF Extraction and Template CRUD (backend services + endpoints)
  3. Admin Template Editor UI (visual editor with per-layout step editors)
  4. Consent Submission API (three endpoints: submit, continue-without-consent, request-alternative)
  5. Employee-Facing Consent Wizard UI (5-step wizard with guardian fields + checkboxes)
  6. Integration and Migration (conditional rendering, migration script, worked example)

- Glossary defines 30+ domain terms (PolicyTemplate, sourceType, hero, steps, consentCheckboxes, guardianRights, outcome, guardian, checkboxResponses, templateVersion, etc.)

- Non-functional requirements: Performance (LLM <30s, autosave debounce 1s), Security (auth, XSS sanitization, audit logging), Data Integrity (immutable logs, referential integrity), Backwards Compatibility (no breaking changes)

### [design.md](./design.md)
**Architecture diagram + schema + key code snippets per phase**

- **Architecture**: Backend (routes, controllers, services, models) ↔ Frontend (pages, components)
- **Phase 1**: PolicyTemplate schema (flexible itemSchema per layout, partial unique index), PolicyAcceptanceLog extensions (templateVersion, guardian, checkboxResponses, outcome)
- **Phase 2**: pdfExtractionService (GridFS streaming + pdf-parse), llmConsentService (OpenAI API with strict JSON schema), policyTemplateController (6 endpoints), routes
- **Phase 3**: PolicyTemplateList, PolicyTemplateEditorPage (stepper, hero editor, per-layout editors), extend AdminPoliciesPage with 6th tab
- **Phase 4**: Consent routes (submit validation, guardian validation, checkbox validation), NewNotificationService integration
- **Phase 5**: ConsentWizard (5 steps, visitedSteps tracking, canSubmit validation, variable substitution), conditional rendering
- **Phase 6**: Migration script (CLI tool, idempotent, logs to JSON lines), getPendingPolicies extension (hasTemplate flag)

- **Dependencies**: pdf-parse (new backend dependency), existing pdfjs-dist (already in frontend)
- **Route Map**: 9 new endpoints (policy-templates CRUD + consent submission)
- **Component Map**: 3 new components (PolicyTemplateList, PolicyTemplateEditorPage, ConsentWizard) + 3 extended components

### [tasks.md](./tasks.md)
**Phased checklist with verification gates**

- **Phase 1 (8h)**: 3 tasks — create PolicyTemplate model, extend PolicyAcceptanceLog, verify clean boot
- **Phase 2 (16h)**: 6 tasks — install pdf-parse, create extraction services, create controller + routes, test extraction flow
- **Phase 3 (24h)**: 8 tasks — create template list + editor page, add 6th tab, implement per-layout editors (card_grid, column_grid, clause_list, consent_form), guardianRights editor, hero image upload, extend PolicyUploadForm
- **Phase 4 (12h)**: 3 tasks — create consent routes (submit, continue-without-consent, request-alternative), test validation
- **Phase 5 (24h)**: 7 tasks — create ConsentWizard, implement per-layout renderers, variable substitution, canSubmit validation, handleProvideConsent, conditional rendering, test wizard flow
- **Phase 6 (16h)**: 6 tasks — extend getPendingPolicies, update frontend hasTemplate logic, create migration script, test migration, migrate one worked example, document migration process

- **Total**: 33 tasks across 6 phases, ~100 hours estimated
- **Verification Gates**: 6 phase gates + final verification checklist (15 items)
- **Post-Launch Enhancements**: 7 optional future improvements (rich text editor, drag-and-drop, versioning history, analytics dashboard, multi-language, email reminders, bulk export)

---

## Implementation Order

1. **Phase 1 (Data Models)** — Foundation; no UI changes yet
2. **Phase 2 (Backend CRUD + Extraction)** — Backend-only; test via Postman/curl
3. **Phase 3 (Admin Editor UI)** — First visible UI; admin-facing only
4. **Phase 4 (Consent API)** — Backend-only; test via Postman/curl
5. **Phase 5 (Employee Wizard UI)** — Employee-facing UI; end-to-end flow visible
6. **Phase 6 (Integration + Migration)** — Polish, conditional rendering, worked example

Each phase has a **verification gate** — do not proceed to the next phase until the gate is cleared.

---

## Key Constraints

### Non-Breaking Changes Only
- All new fields on PolicyAcceptanceLog are optional (default: null)
- Policy model is unchanged
- Existing non-consent policies continue to work via PDF viewer (StandalonePolicyModal)
- hasTemplate flag controls conditional rendering

### Reuse Existing Patterns
- authenticateToken + requireAdminOrHr middleware (from policiesGridFS routes)
- getPolicyBucket() GridFS bucket (from db.js)
- NewNotificationService (for alternative requests)
- MUI styling conventions (cardBaseSx, scrollBoxSx, color palette from AdminPoliciesPage.jsx)
- pdfjs-dist (already in frontend for pdfPollParser.js)

### LLM Extraction is a Seed, Not Final Content
- HR must manually review and edit extracted clauses before publishing
- LLM only extracts clause_list and proposedCheckboxes — card_grid and column_grid are manually curated by HR
- 30s timeout + fallback to manual authoring if extraction fails

---

## Success Metrics

1. ✅ One policy migrated end-to-end (PDF → draft template → HR review + edit → publish → employee sees wizard → consent submitted)
2. ✅ Admin can edit template content inline without re-uploading PDF
3. ✅ Employee can complete wizard in <5 minutes
4. ✅ Zero breaking changes to existing Policy or PolicyAcceptanceLog documents (backwards compatible)
5. ✅ LLM extraction completes within 30 seconds for test PDFs up to 50 pages
6. ✅ Autosave debounced by 1 second (no excessive API calls)
7. ✅ All sensitive endpoints use authenticateToken + requireAdminOrHr middleware

---

## Dependencies

### Backend (New)
- `pdf-parse@^1.1.1` — PDF text extraction (reuses getPolicyBucket for GridFS streaming)

### Backend (Existing, Reused)
- `pdfkit` — already in package.json (used for salary slip generation, not for parsing)
- `mongoose` — PolicyTemplate and extended PolicyAcceptanceLog models
- `express` + `authenticateToken` + `requireAdminOrHr` middleware
- GridFS via `getPolicyBucket()` from `db.js`
- `NewNotificationService` — notify HR on alternative requests

### Frontend (Existing, Reused)
- React 18, MUI 5+, React Router
- `pdfjs-dist` — already in vite.config.js (used in pdfPollParser.js)
- `axios` — API calls
- Existing onboarding context (`useOnboarding()`)

### External APIs (New)
- OpenAI API (or equivalent LLM provider) — for clause extraction from PDF text
- Requires `OPENAI_API_KEY` environment variable

---

## Migration Guide (for HR)

1. **Identify policies to migrate** — e.g., "Student Data Privacy Notice", "Consent for Data Processing"
2. **Run migration script** — `node backend/scripts/migrate-policy-to-template.js <policyId> <adminUserId>`
3. **Review draft template** — Open Consent Templates tab, click Edit on the draft
4. **Edit extracted clauses** — Fix titles/bodies, add/remove clauses as needed
5. **Add curated content** — Manually author "At a glance" (card_grid) and "What we collect" (column_grid) steps
6. **Configure consent checkboxes** — Review proposed checkboxes, edit labels, set required flags, disable if not needed
7. **Add guardian rights** — Add informational rights chips to "Your choices" step
8. **Replace hero image** — Upload a branded hero banner image
9. **Publish** — Click Publish button; template becomes active, previous active version archived
10. **Monitor submissions** — Check Onboarding Compliance tab for consent logs

---

## Troubleshooting

### LLM Extraction Fails
- **Symptom**: POST /policy-templates/:id/extract-from-pdf returns 500 or timeout
- **Cause**: PDF structure too complex, token limit exceeded, LLM API down
- **Fix**: Edit the draft template manually in the editor; extraction is optional

### Template Not Appearing in Wizard
- **Symptom**: Employee sees PDF viewer instead of wizard
- **Cause**: Template status is 'draft' or 'archived', not 'active'
- **Fix**: Publish the template from the editor; confirm status: 'active' in MongoDB

### Wizard Validation Errors
- **Symptom**: "All required consent checkboxes must be checked" error persists
- **Cause**: Checkbox IDs mismatch between template and frontend state
- **Fix**: Check browser console for checkbox ID errors; ensure template.consentCheckboxes[].id matches wizard checkboxStates keys

### Autosave Not Working
- **Symptom**: Changes lost on page refresh
- **Cause**: Autosave debounce not triggering, network error, auth token expired
- **Fix**: Check browser network tab for failed PATCH requests; re-login if token expired; increase debounce delay if typing too fast

---

## Next Steps After Launch

1. **Monitor Consent Completion Rate** — Track how many employees complete vs. abandon the wizard
2. **Gather Feedback** — Ask HR and employees for usability feedback
3. **Iterate on Extracted Content Quality** — Fine-tune LLM prompt based on real PDFs
4. **Add Analytics Dashboard** — Visualize consent metrics (completion rate, average time per step, most-skipped checkboxes)
5. **Add Multi-Language Support** — Extend variables map to support multiple locales
6. **Add Email Reminders** — Notify employees with pending consent submissions

---

## Reference Files

- **Backend Models**: `backend/models/PolicyTemplate.js`, `backend/models/PolicyAcceptanceLog.js` (extended)
- **Backend Services**: `backend/services/pdfExtractionService.js`, `backend/services/llmConsentService.js`
- **Backend Controllers**: `backend/controllers/policyTemplateController.js`
- **Backend Routes**: `backend/routes/policyTemplates.js`, `backend/routes/consent.js`
- **Frontend Pages**: `frontend/src/pages/admin/PolicyTemplateEditorPage.jsx`
- **Frontend Components**: `frontend/src/components/admin/PolicyTemplateList.jsx`, `frontend/src/components/onboarding/ConsentWizard.jsx`
- **Migration Script**: `backend/scripts/migrate-policy-to-template.js`
- **Migration Log**: `backend/logs/policy-template-migration.log`

---

## Contact

For questions or clarifications on this spec, contact the System Architect or refer to the detailed requirements, design, and tasks documents in this directory.
