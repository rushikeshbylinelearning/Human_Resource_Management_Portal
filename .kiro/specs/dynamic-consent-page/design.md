# Technical Design — Dynamic Consent Page

## Overview

This document describes the technical implementation of the six-phase Dynamic Consent Page upgrade across the `backend` (Node.js/Express/MongoDB, port 3011) and the `frontend` (React 18 / MUI).

The existing Policy and PolicyAcceptanceLog schemas are preserved and extended with optional fields. A new PolicyTemplate model is introduced alongside the existing Policy model. The frontend conditionally renders either the existing `StandalonePolicyModal.jsx` (PDF viewer) or the new `ConsentWizard.jsx` (5-step wizard) based on whether an active template exists for the policy.

No existing policies are migrated automatically — HR must explicitly opt-in per policy by using the "Import from PDF" flow. The existing `getPolicyBucket()` GridFS bucket is reused for PDF storage and hero images.

---

## Architecture

```
frontend/                                backend/
src/pages/
  AdminPoliciesPage.jsx  (extended)  ←──REST──►  routes/
  admin/                                           policyTemplates.js    (new)
    PolicyTemplateEditorPage.jsx (new)             consent.js           (new or extend onboarding.js)
src/components/                                    policiesGridFS.js    (existing, unchanged)
  admin/                                           onboarding.js        (extended)
    PolicyTemplateList.jsx       (new)         controllers/
  onboarding/                                      policyTemplateController.js (new)
    ConsentWizard.jsx            (new)            onboardingController.js     (extended)
    StandalonePolicyModal.jsx (existing)       services/
  PolicyViewer.jsx             (existing)         pdfExtractionService.js     (new)
  PolicyUploadForm.jsx         (extended)         llmConsentService.js        (new)
  PolicyListCompact.jsx        (extended)      models/
                                                  PolicyTemplate.js            (new)
                                                  PolicyAcceptanceLog.js       (extended)
                                                  Policy.js                    (unchanged)
                                                db.js (getPolicyBucket — existing, reused)
```

---

## Phase 1 — Data Models

### 1.1 PolicyTemplate model (new)

File: `backend/models/PolicyTemplate.js`

```js
const mongoose = require('mongoose');

// Discriminated item type for steps[].items based on layout
const itemSchema = new mongoose.Schema({
  // Common fields
  enabled: { type: Boolean, default: true },
  
  // card_grid fields
  icon: { type: String, trim: true },
  title: { type: String, trim: true },
  body: { type: String, trim: true },
  
  // column_grid fields
  bullets: [{
    text: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },
  }],
  
  // clause_list fields
  clauseNumber: { type: Number },
  
}, { _id: false, strict: false }); // Allow flexible schema per layout

const stepSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    enum: ['at_a_glance', 'what_we_collect', 'your_choices', 'full_notice', 'consent'],
  },
  order: { type: Number, required: true },
  title: { type: String, required: true, trim: true },
  layout: {
    type: String,
    required: true,
    enum: ['card_grid', 'column_grid', 'clause_list', 'consent_form'],
  },
  intro: {
    eyebrow: { type: String, trim: true },
    heading: { type: String, trim: true },
    subheading: { type: String, trim: true },
  },
  items: [itemSchema],
}, { _id: false });

const policyTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  version: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'draft',
    index: true,
  },
  effectiveDate: { type: Date, required: true },
  
  sourceType: {
    type: String,
    enum: ['pdf_import', 'manual'],
    required: true,
  },
  sourcePdfFileId: {
    type: mongoose.Schema.Types.ObjectId,
    // GridFS reference to the original PDF (retained for audit)
  },
  
  // Variable substitution map: {{placeholder}} → value
  variables: {
    type: Map,
    of: String,
    default: () => new Map([
      ['schoolName', 'Kodeit Ascend'],
      ['productName', 'Kodeit Ascend Platform'],
      ['privacyEmail', 'privacy@kodeitascend.com'],
      ['examContact', 'exams@kodeitascend.com'],
    ]),
  },
  
  hero: {
    badge: { type: String, trim: true },
    title: { type: String, required: true, trim: true },
    titleHighlight: { type: String, trim: true },
    body: { type: String, trim: true },
    imageUrl: { type: String, trim: true }, // GridFS or CDN URL
  },
  
  steps: [stepSchema],
  
  consentCheckboxes: [{
    id: { type: String, required: true, trim: true }, // unique per template
    order: { type: Number, required: true },
    label: { type: String, required: true, trim: true, maxlength: 500 },
    required: { type: Boolean, default: true },
    category: { type: String, trim: true }, // e.g., "data_processing", "marketing"
    enabled: { type: Boolean, default: true },
  }],
  
  guardianRights: [{
    label: { type: String, required: true, trim: true, maxlength: 200 },
    enabled: { type: Boolean, default: true },
  }],
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

// Compound unique index: only one active template per name at any time
policyTemplateSchema.index(
  { name: 1, version: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
    name: 'unique_active_template_per_name',
  }
);

// Index for fast active template lookup by name
policyTemplateSchema.index({ name: 1, status: 1 });

const PolicyTemplate = mongoose.model('PolicyTemplate', policyTemplateSchema);
module.exports = PolicyTemplate;
```

**Design notes**:
- `items[]` uses a flexible Mixed schema (strict: false) rather than three rigid parallel arrays because HR will freely add/reorder items of different types within a step.
- The partial unique index ensures only one `active` template per `name`, while allowing unlimited `draft` and `archived` templates.
- `variables` is a Map for efficient runtime substitution (e.g., `template.variables.get('schoolName')`).

### 1.2 PolicyAcceptanceLog model extension

File: `backend/models/PolicyAcceptanceLog.js`

Add to the existing schema (do NOT remove any existing fields):

```js
// ── Template-based consent fields ─────────────────────────────────────────
templateVersion: { type: String, default: null },

guardian: {
  studentFullName: { type: String, trim: true },
  studentAdmissionId: { type: String, trim: true },
  guardianName: { type: String, trim: true },
  relationship: {
    type: String,
    enum: ['parent', 'legal_guardian', 'other_authorized_guardian'],
  },
  guardianEmail: { type: String, trim: true, lowercase: true },
  guardianMobile: {
    countryCode: { type: String, default: '+966', trim: true },
    number: { type: String, trim: true },
  },
  remark: { type: String, trim: true, maxlength: 1000 },
},

checkboxResponses: [{
  checkboxId: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  required: { type: Boolean, required: true },
  checked: { type: Boolean, required: true },
  _id: false,
}],

outcome: {
  type: String,
  enum: ['consented', 'continued_without_consent', 'alternative_requested'],
  default: null,
},
```

**Design notes**:
- All new fields are optional (default: null) so existing log documents remain valid.
- `guardian` is a sub-document, not a separate collection — keeps the log atomic.
- `checkboxResponses[]` captures a snapshot of the checkbox state at acceptance time (immutable audit trail).
- `outcome` distinguishes the three employee paths: consent, non-consent, or request-alternative.

---

## Phase 2 — PDF Extraction and Template CRUD

### 2.1 Backend — PDF text extraction service

File: `backend/services/pdfExtractionService.js`

```js
const pdfParse = require('pdf-parse');
const { getPolicyBucket } = require('../db');
const mongoose = require('mongoose');

/**
 * Extracts text from a GridFS-stored PDF.
 * Reuses the existing getPolicyBucket() from db.js.
 * @param {ObjectId} fileId - GridFS file ID
 * @returns {Promise<string>} - Extracted plain text
 */
async function extractTextFromGridFS(fileId) {
  const bucket = getPolicyBucket();
  const chunks = [];
  
  return new Promise((resolve, reject) => {
    const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
    
    downloadStream.on('data', (chunk) => chunks.push(chunk));
    downloadStream.on('error', reject);
    downloadStream.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const data = await pdfParse(buffer);
        resolve(data.text); // Extracted plain text
      } catch (err) {
        reject(err);
      }
    });
  });
}

module.exports = { extractTextFromGridFS };
```

**Design notes**:
- Reuses the existing `getPolicyBucket()` from `backend/db.js` (confirmed in the codebase as the GridFS bucket for policies).
- Streams the PDF from GridFS to avoid loading large files into memory at once.
- `pdf-parse` is a new dependency — add to `backend/package.json`.

### 2.2 Backend — LLM consent extraction service

File: `backend/services/llmConsentService.js`

```js
const axios = require('axios');

/**
 * Sends extracted PDF text to an LLM API with a strict JSON schema constraint
 * to extract structured clauses and consent checkbox candidates.
 * @param {string} pdfText - Plain text extracted from PDF
 * @returns {Promise<{clauses: Array, proposedCheckboxes: Array}>}
 */
async function extractConsentStructure(pdfText) {
  // Strict JSON schema for LLM response
  const schema = {
    type: 'object',
    properties: {
      clauses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            clauseNumber: { type: 'number' },
            title: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['title', 'body'],
        },
      },
      proposedCheckboxes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            category: { type: 'string' },
          },
          required: ['label'],
        },
      },
    },
    required: ['clauses', 'proposedCheckboxes'],
  };

  // System prompt constraining the LLM to extract only clause_list and checkboxes
  const systemPrompt = `You are a legal document parser. Extract the following from the provided policy text:
1. Numbered clauses (sections) from the document as an array of { clauseNumber, title, body }.
2. Proposed consent checkboxes derived from phrases like "I consent to…" or "I agree to…" as an array of { label, category }.

Do NOT generate card summaries or column content — only clauses and checkboxes.
Return valid JSON matching the provided schema.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Extract structured content from this policy:\n\n${pdfText}` },
  ];

  // Example: OpenAI API call (adapt to your LLM provider)
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4',
      messages,
      response_format: { type: 'json_object' }, // Ensures JSON output
      temperature: 0.3, // Low temperature for deterministic extraction
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const extracted = JSON.parse(response.data.choices[0].message.content);
  
  // Validate against schema (basic check)
  if (!extracted.clauses || !extracted.proposedCheckboxes) {
    throw new Error('LLM response missing required fields');
  }

  return extracted;
}

module.exports = { extractConsentStructure };
```

**Design notes**:
- Uses OpenAI's `gpt-4` model with `response_format: json_object` to enforce structured output.
- Adjust API endpoint/key based on your LLM provider (e.g., Azure OpenAI, Anthropic Claude, local model).
- The system prompt explicitly constrains the LLM to avoid generating card_grid/column_grid content.
- Temperature is set low (0.3) for deterministic extraction.

### 2.3 Backend — PolicyTemplate controller

File: `backend/controllers/policyTemplateController.js`

```js
const PolicyTemplate = require('../models/PolicyTemplate');
const { extractTextFromGridFS } = require('../services/pdfExtractionService');
const { extractConsentStructure } = require('../services/llmConsentService');

/**
 * POST /policy-templates
 * Create a new blank draft or pdf_import draft
 */
async function createTemplate(req, res) {
  try {
    const { name, version, effectiveDate, sourceType, sourcePdfFileId, variables } = req.body;
    
    const template = new PolicyTemplate({
      name,
      version: version || '1.0',
      effectiveDate: effectiveDate || new Date(),
      sourceType: sourceType || 'manual',
      sourcePdfFileId: sourcePdfFileId || null,
      variables: variables || undefined, // Use schema defaults if not provided
      hero: {
        title: name || 'Privacy Notice',
        body: 'This notice explains how we collect, use, and protect your personal data.',
      },
      steps: [], // Empty — populated by extract or manual editing
      consentCheckboxes: [],
      guardianRights: [],
      createdBy: req.user._id,
      status: 'draft',
    });
    
    await template.save();
    
    res.status(201).json({ template });
  } catch (error) {
    console.error('Failed to create template:', error);
    res.status(500).json({ error: 'Failed to create template', details: error.message });
  }
}

/**
 * POST /policy-templates/:id/extract-from-pdf
 * Trigger LLM extraction from the template's sourcePdfFileId
 */
async function extractFromPdf(req, res) {
  try {
    const template = await PolicyTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    
    if (!template.sourcePdfFileId) {
      return res.status(400).json({ error: 'No source PDF linked to this template' });
    }
    
    // Step 1: Extract text from GridFS PDF
    const pdfText = await extractTextFromGridFS(template.sourcePdfFileId);
    
    // Step 2: Send to LLM for structured extraction
    const { clauses, proposedCheckboxes } = await extractConsentStructure(pdfText);
    
    // Step 3: Populate template with extracted data
    // Find or create the "full_notice" step
    let fullNoticeStep = template.steps.find(s => s.key === 'full_notice');
    if (!fullNoticeStep) {
      fullNoticeStep = {
        key: 'full_notice',
        order: 4,
        title: 'Full Privacy Notice',
        layout: 'clause_list',
        intro: {
          eyebrow: 'Complete Legal Text',
          heading: 'Privacy Notice',
          subheading: 'Please review the full terms below.',
        },
        items: [],
      };
      template.steps.push(fullNoticeStep);
    }
    
    // Add extracted clauses to full_notice step
    fullNoticeStep.items = clauses.map((c, i) => ({
      clauseNumber: c.clauseNumber || (i + 1),
      title: c.title,
      body: c.body,
      enabled: true,
    }));
    
    // Populate consentCheckboxes with proposed checkboxes
    template.consentCheckboxes = proposedCheckboxes.map((cb, i) => ({
      id: `checkbox_${i + 1}`,
      order: i + 1,
      label: cb.label,
      required: true,
      category: cb.category || 'general',
      enabled: true,
    }));
    
    template.updatedBy = req.user._id;
    await template.save();
    
    res.json({
      message: 'Extraction complete',
      clauseCount: clauses.length,
      checkboxCount: proposedCheckboxes.length,
      template,
    });
  } catch (error) {
    console.error('PDF extraction failed:', error);
    res.status(500).json({ error: 'PDF extraction failed', details: error.message });
  }
}

/**
 * PATCH /policy-templates/:id
 * Update any template fields (partial update)
 */
async function updateTemplate(req, res) {
  try {
    const template = await PolicyTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    
    // Merge partial updates
    Object.assign(template, req.body);
    template.updatedBy = req.user._id;
    
    await template.save();
    
    res.json({ template });
  } catch (error) {
    console.error('Failed to update template:', error);
    res.status(500).json({ error: 'Failed to update template', details: error.message });
  }
}

/**
 * POST /policy-templates/:id/publish
 * Set status to active, archive previous active template with same name
 */
async function publishTemplate(req, res) {
  try {
    const template = await PolicyTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    
    // Archive any existing active template with the same name
    await PolicyTemplate.updateMany(
      { name: template.name, status: 'active' },
      { $set: { status: 'archived' } }
    );
    
    // Publish this template
    template.status = 'active';
    template.updatedBy = req.user._id;
    
    // Auto-increment version on publish if not manually set
    const currentVersion = parseFloat(template.version) || 1.0;
    template.version = (currentVersion + 0.1).toFixed(1);
    
    await template.save();
    
    res.json({ message: 'Template published', template });
  } catch (error) {
    console.error('Failed to publish template:', error);
    res.status(500).json({ error: 'Failed to publish template', details: error.message });
  }
}

/**
 * GET /policy-templates/active?name=...
 * Resolve the current active template by name
 */
async function getActiveTemplate(req, res) {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'name query param required' });
    
    const template = await PolicyTemplate.findOne({ name, status: 'active' });
    if (!template) return res.status(404).json({ error: 'No active template found for this name' });
    
    res.json({ template });
  } catch (error) {
    console.error('Failed to fetch active template:', error);
    res.status(500).json({ error: 'Failed to fetch active template', details: error.message });
  }
}

/**
 * GET /policy-templates
 * List all templates (admin view)
 */
async function listTemplates(req, res) {
  try {
    const templates = await PolicyTemplate.find()
      .sort({ createdAt: -1 })
      .select('name version status effectiveDate sourceType createdAt updatedAt');
    
    res.json({ templates });
  } catch (error) {
    console.error('Failed to list templates:', error);
    res.status(500).json({ error: 'Failed to list templates', details: error.message });
  }
}

module.exports = {
  createTemplate,
  extractFromPdf,
  updateTemplate,
  publishTemplate,
  getActiveTemplate,
  listTemplates,
};
```

### 2.4 Backend — PolicyTemplate routes

File: `backend/routes/policyTemplates.js`

```js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/policyTemplateController');
const authenticateToken = require('../middleware/authenticateToken');
const requireAdminOrHr = require('../middleware/requireAdminOrHr');

// List templates (admin view)
router.get('/', authenticateToken, requireAdminOrHr, ctrl.listTemplates);

// Get active template by name (public for employee view)
router.get('/active', authenticateToken, ctrl.getActiveTemplate);

// Create new template
router.post('/', authenticateToken, requireAdminOrHr, ctrl.createTemplate);

// Extract from PDF
router.post('/:id/extract-from-pdf', authenticateToken, requireAdminOrHr, ctrl.extractFromPdf);

// Update template (partial)
router.patch('/:id', authenticateToken, requireAdminOrHr, ctrl.updateTemplate);

// Publish template
router.post('/:id/publish', authenticateToken, requireAdminOrHr, ctrl.publishTemplate);

module.exports = router;
```

**Mount in `backend/server.js`** (or `backend/app.js`):

```js
const policyTemplatesRouter = require('./routes/policyTemplates');
app.use('/api/policy-templates', policyTemplatesRouter);
```

---

## Phase 3 — Admin Template Editor UI

### 3.1 Frontend — PolicyTemplateList component

File: `frontend/src/components/admin/PolicyTemplateList.jsx`

```jsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import PublishIcon from '@mui/icons-material/Publish';
import ArchiveIcon from '@mui/icons-material/Archive';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';

const PolicyTemplateList = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/policy-templates');
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (templateId) => {
    navigate(`/admin/policy-templates/${templateId}/edit`);
  };

  const handlePublish = async (templateId) => {
    try {
      await api.post(`/policy-templates/${templateId}/publish`);
      loadTemplates();
    } catch (error) {
      console.error('Failed to publish template:', error);
    }
  };

  const statusColor = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'draft': return 'warning';
      case 'archived': return 'default';
      default: return 'default';
    }
  };

  return (
    <Box>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Version</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Effective Date</TableCell>
            <TableCell>Source</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {templates.map((t) => (
            <TableRow key={t._id}>
              <TableCell>{t.name}</TableCell>
              <TableCell>{t.version}</TableCell>
              <TableCell>
                <Chip label={t.status} color={statusColor(t.status)} size="small" />
              </TableCell>
              <TableCell>{new Date(t.effectiveDate).toLocaleDateString()}</TableCell>
              <TableCell>{t.sourceType}</TableCell>
              <TableCell align="right">
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={() => handleEdit(t._id)}>
                    <EditIcon />
                  </IconButton>
                </Tooltip>
                {t.status === 'draft' && (
                  <Tooltip title="Publish">
                    <IconButton size="small" onClick={() => handlePublish(t._id)}>
                      <PublishIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
};

export default PolicyTemplateList;
```

### 3.2 Frontend — PolicyTemplateEditorPage

File: `frontend/src/pages/admin/PolicyTemplateEditorPage.jsx`

```jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Button,
  TextField,
  IconButton,
  Chip,
  Card,
  CardContent,
  Grid,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ImageIcon from '@mui/icons-material/Image';
import api from '../../api/axios';

const STEPS = [
  { key: 'at_a_glance', label: 'At a glance', order: 1 },
  { key: 'what_we_collect', label: 'What we collect', order: 2 },
  { key: 'your_choices', label: 'Your choices', order: 3 },
  { key: 'full_notice', label: 'Full notice', order: 4 },
  { key: 'consent', label: 'Consent', order: 5 },
];

const PolicyTemplateEditorPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    loadTemplate();
  }, [id]);

  const loadTemplate = async () => {
    try {
      const { data } = await api.get(`/policy-templates/${id}`);
      setTemplate(data.template);
    } catch (error) {
      console.error('Failed to load template:', error);
    }
  };

  const autosave = async (updates) => {
    try {
      await api.patch(`/policy-templates/${id}`, updates);
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (error) {
      console.error('Autosave failed:', error);
      setSaveStatus('Error saving');
    }
  };

  const handleHeroChange = (field, value) => {
    const updatedHero = { ...template.hero, [field]: value };
    setTemplate({ ...template, hero: updatedHero });
  };

  const handleHeroBlur = () => {
    autosave({ hero: template.hero });
  };

  const handlePublish = async () => {
    try {
      await api.post(`/policy-templates/${id}/publish`);
      navigate('/admin/policies?tab=consent-templates');
    } catch (error) {
      console.error('Failed to publish:', error);
    }
  };

  const currentStep = template?.steps?.[activeStepIndex];

  if (!template) return <Typography>Loading...</Typography>;

  return (
    <Box sx={{ p: 4, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" fontWeight={600}>
          {template.name} — Editor
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {saveStatus && (
            <Typography variant="body2" color="text.secondary">
              {saveStatus}
            </Typography>
          )}
          <Button variant="contained" color="primary" onClick={handlePublish}>
            Publish
          </Button>
        </Box>
      </Box>

      {/* Hero Banner Editor */}
      <Card sx={{ mb: 4, p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Hero Banner
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Badge"
              value={template.hero?.badge || ''}
              onChange={(e) => handleHeroChange('badge', e.target.value)}
              onBlur={handleHeroBlur}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Title"
              value={template.hero?.title || ''}
              onChange={(e) => handleHeroChange('title', e.target.value)}
              onBlur={handleHeroBlur}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Body"
              value={template.hero?.body || ''}
              onChange={(e) => handleHeroChange('body', e.target.value)}
              onBlur={handleHeroBlur}
            />
          </Grid>
          <Grid item xs={12}>
            <Button startIcon={<ImageIcon />} variant="outlined">
              Replace Image
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
              Current: {template.hero?.imageUrl || 'None'}
            </Typography>
          </Grid>
        </Grid>
      </Card>

      {/* Stepper Header */}
      <Stepper activeStep={activeStepIndex} sx={{ mb: 4 }}>
        {STEPS.map((step, index) => (
          <Step key={step.key} onClick={() => setActiveStepIndex(index)} sx={{ cursor: 'pointer' }}>
            <StepLabel>{step.label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step Content Editor */}
      <Card sx={{ p: 3 }}>
        {currentStep ? (
          <Box>
            <Typography variant="h6" gutterBottom>
              {currentStep.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Layout: {currentStep.layout}
            </Typography>
            <Alert severity="info" sx={{ mt: 2 }}>
              Step content editor for {currentStep.layout} layout — implement per-layout UI here
            </Alert>
            {/* TODO: Implement per-layout editors (card_grid, column_grid, clause_list, consent_form) */}
          </Box>
        ) : (
          <Alert severity="warning">No step selected</Alert>
        )}
      </Card>
    </Box>
  );
};

export default PolicyTemplateEditorPage;
```

**Design notes**:
- This is a skeleton — Phase 3 tasks will expand with per-layout editors (card_grid, column_grid, clause_list, consent_form).
- Autosave on blur (debounced by 1 second in production).
- Stepper header is clickable for navigation between steps.

### 3.3 Frontend — Extend AdminPoliciesPage.jsx

Add a 6th tab:

```jsx
// In AdminPoliciesPage.jsx, extend the Tabs component:
<Tab
  icon={<VerifiedUserOutlinedIcon />}
  label="Consent Templates"
  value={5}
/>

// In the tab content switch:
{activeTab === 5 && (
  <Box sx={{ ...cardBaseSx }}>
    <PolicyTemplateList />
  </Box>
)}
```

---

## Phase 4 — Consent Submission API

### 4.1 Backend — Consent routes

File: `backend/routes/consent.js` (or extend `backend/routes/onboarding.js`):

```js
const express = require('express');
const router = express.Router();
const PolicyAcceptanceLog = require('../models/PolicyAcceptanceLog');
const PolicyTemplate = require('../models/PolicyTemplate');
const Policy = require('../models/Policy');
const authenticateToken = require('../middleware/authenticateToken');
const NewNotificationService = require('../services/NewNotificationService');

/**
 * POST /consent/submit
 * Submit consent with guardian identity and checkbox responses
 */
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    const {
      policyId,
      templateVersion,
      guardian,
      checkboxResponses,
      readingDurationSeconds,
      visitedSteps,
    } = req.body;

    // Validate all 5 steps visited
    const requiredSteps = ['at_a_glance', 'what_we_collect', 'your_choices', 'full_notice', 'consent'];
    const missingSteps = requiredSteps.filter(s => !visitedSteps.includes(s));
    if (missingSteps.length > 0) {
      return res.status(422).json({
        error: 'All steps must be visited before submitting consent',
        missingSteps,
      });
    }

    // Load active template
    const policy = await Policy.findById(policyId);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });

    const template = await PolicyTemplate.findOne({
      name: policy.name,
      version: templateVersion,
      status: 'active',
    });
    if (!template) return res.status(404).json({ error: 'Template version not found or inactive' });

    // Validate required checkboxes are checked
    const requiredCheckboxes = template.consentCheckboxes.filter(cb => cb.required && cb.enabled);
    const uncheckedRequired = requiredCheckboxes.filter(rcb => {
      const response = checkboxResponses.find(r => r.checkboxId === rcb.id);
      return !response || !response.checked;
    });

    if (uncheckedRequired.length > 0) {
      return res.status(422).json({
        error: 'All required consent checkboxes must be checked',
        uncheckedCheckboxes: uncheckedRequired.map(cb => cb.label),
      });
    }

    // Validate guardian fields if any guardian data provided
    if (guardian && (guardian.guardianName || guardian.relationship)) {
      if (!guardian.guardianName || !guardian.relationship) {
        return res.status(422).json({
          error: 'Guardian name and relationship are required when providing guardian information',
        });
      }
    }

    // Create PolicyAcceptanceLog
    const log = new PolicyAcceptanceLog({
      userId: req.user._id,
      userName: req.user.name,
      employeeCode: req.user.employeeCode,
      department: req.user.department || '',
      policyId: policy._id,
      policyName: policy.name,
      policyVersion: policy.version,
      templateVersion: template.version,
      readingDurationSeconds,
      accepted: true,
      acceptedAt: new Date(),
      checkboxAcknowledged: true,
      guardian: guardian || undefined,
      checkboxResponses,
      outcome: 'consented',
      status: 'completed',
      timeline: [
        { event: 'policy_opened', timestamp: new Date(), notes: 'Consent wizard opened' },
        { event: 'policy_accepted', timestamp: new Date(), notes: 'Consent provided' },
      ],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    await log.save();

    res.status(201).json({ message: 'Consent recorded successfully', logId: log._id });
  } catch (error) {
    console.error('Failed to submit consent:', error);
    res.status(500).json({ error: 'Failed to submit consent', details: error.message });
  }
});

/**
 * POST /consent/continue-without-consent
 * Record non-consent outcome
 */
router.post('/continue-without-consent', authenticateToken, async (req, res) => {
  try {
    const { policyId, templateVersion, readingDurationSeconds } = req.body;

    const policy = await Policy.findById(policyId);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });

    const log = new PolicyAcceptanceLog({
      userId: req.user._id,
      userName: req.user.name,
      employeeCode: req.user.employeeCode,
      policyId: policy._id,
      policyName: policy.name,
      policyVersion: policy.version,
      templateVersion,
      readingDurationSeconds,
      accepted: false,
      outcome: 'continued_without_consent',
      status: 'completed',
      timeline: [
        { event: 'policy_opened', timestamp: new Date() },
        { event: 'reading_completed', timestamp: new Date(), notes: 'Continued without consent' },
      ],
    });

    await log.save();

    res.status(201).json({ message: 'Non-consent recorded', logId: log._id });
  } catch (error) {
    console.error('Failed to record non-consent:', error);
    res.status(500).json({ error: 'Failed to record non-consent', details: error.message });
  }
});

/**
 * POST /consent/request-alternative
 * Record alternative request and notify HR
 */
router.post('/request-alternative', authenticateToken, async (req, res) => {
  try {
    const { policyId, templateVersion, reason } = req.body;

    const policy = await Policy.findById(policyId);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });

    const log = new PolicyAcceptanceLog({
      userId: req.user._id,
      userName: req.user.name,
      employeeCode: req.user.employeeCode,
      policyId: policy._id,
      policyName: policy.name,
      policyVersion: policy.version,
      templateVersion,
      accepted: false,
      outcome: 'alternative_requested',
      status: 'pending',
      timeline: [
        { event: 'policy_opened', timestamp: new Date() },
        { event: 'reading_completed', timestamp: new Date(), notes: `Alternative requested: ${reason || 'No reason provided'}` },
      ],
    });

    await log.save();

    // Notify HR/school contact
    await NewNotificationService.sendToAdmins({
      title: 'Consent Alternative Requested',
      body: `${req.user.name} (${req.user.employeeCode}) has requested an alternative to the ${policy.name} policy.`,
      link: `/admin/policies`,
    });

    res.status(201).json({ message: 'Alternative request recorded and HR notified', logId: log._id });
  } catch (error) {
    console.error('Failed to record alternative request:', error);
    res.status(500).json({ error: 'Failed to record alternative request', details: error.message });
  }
});

module.exports = router;
```

**Mount in `backend/server.js`**:

```js
const consentRouter = require('./routes/consent');
app.use('/api/consent', consentRouter);
```

---

## Phase 5 — Employee-Facing Consent Wizard UI

### 5.1 Frontend — ConsentWizard component

File: `frontend/src/components/onboarding/ConsentWizard.jsx`

```jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Stepper,
  Step,
  StepLabel,
  Checkbox,
  FormControlLabel,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Grid,
} from '@mui/material';
import { useOnboarding } from '../../context/OnboardingContext';
import api from '../../api/axios';

const STEPS = [
  { key: 'at_a_glance', label: 'At a glance', order: 0 },
  { key: 'what_we_collect', label: 'What we collect', order: 1 },
  { key: 'your_choices', label: 'Your choices', order: 2 },
  { key: 'full_notice', label: 'Full notice', order: 3 },
  { key: 'consent', label: 'Consent', order: 4 },
];

const ConsentWizard = () => {
  const {
    standalonePolicyModalOpen,
    currentStandalonePolicy,
    closeStandalonePolicyModal,
    policyAcceptancePending,
  } = useOnboarding();

  const [activeStep, setActiveStep] = useState(0);
  const [visitedSteps, setVisitedSteps] = useState(new Set());
  const [template, setTemplate] = useState(null);
  const [guardian, setGuardian] = useState({});
  const [checkboxStates, setCheckboxStates] = useState({});
  const [readingStartTime] = useState(Date.now());
  const [error, setError] = useState('');

  useEffect(() => {
    if (standalonePolicyModalOpen && currentStandalonePolicy) {
      loadTemplate();
      setVisitedSteps(new Set([0])); // Mark step 0 as visited on open
    }
  }, [standalonePolicyModalOpen, currentStandalonePolicy]);

  const loadTemplate = async () => {
    try {
      const { data } = await api.get(`/policy-templates/active?name=${currentStandalonePolicy.policyName}`);
      setTemplate(data.template);
      
      // Initialize checkbox states
      const initialStates = {};
      data.template.consentCheckboxes.forEach(cb => {
        if (cb.enabled) initialStates[cb.id] = false;
      });
      setCheckboxStates(initialStates);
    } catch (err) {
      console.error('Failed to load template:', err);
      setError('Failed to load consent form');
    }
  };

  const handleNext = () => {
    const nextStep = activeStep + 1;
    setActiveStep(nextStep);
    setVisitedSteps(prev => new Set([...prev, nextStep]));
  };

  const handleBack = () => {
    setActiveStep(prev => prev - 1);
  };

  const handleProvideConsent = async () => {
    const readingDurationSeconds = Math.floor((Date.now() - readingStartTime) / 1000);

    const payload = {
      policyId: currentStandalonePolicy.policyId,
      templateVersion: template.version,
      guardian,
      checkboxResponses: Object.entries(checkboxStates).map(([checkboxId, checked]) => {
        const cb = template.consentCheckboxes.find(c => c.id === checkboxId);
        return {
          checkboxId,
          label: cb.label,
          required: cb.required,
          checked,
        };
      }),
      readingDurationSeconds,
      visitedSteps: Array.from(visitedSteps).map(i => STEPS[i].key),
    };

    try {
      await api.post('/consent/submit', payload);
      closeStandalonePolicyModal();
    } catch (err) {
      console.error('Failed to submit consent:', err);
      setError(err.response?.data?.error || 'Failed to submit consent');
    }
  };

  const canSubmit = () => {
    // All 5 steps visited
    if (visitedSteps.size < 5) return false;
    
    // All required checkboxes checked
    const requiredCheckboxes = template?.consentCheckboxes?.filter(cb => cb.required && cb.enabled) || [];
    const allChecked = requiredCheckboxes.every(cb => checkboxStates[cb.id] === true);
    if (!allChecked) return false;

    // Required guardian fields filled if any guardian data provided
    if (guardian.guardianName || guardian.relationship) {
      if (!guardian.guardianName || !guardian.relationship) return false;
    }

    return true;
  };

  if (!standalonePolicyModalOpen || !template) return null;

  const currentStepData = template.steps.find(s => s.key === STEPS[activeStep].key);

  return (
    <Dialog open={standalonePolicyModalOpen} maxWidth="md" fullWidth>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Stepper Header */}
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {STEPS.map((step) => (
            <StepLabel key={step.key}>{step.label}</StepLabel>
          ))}
        </Stepper>

        {/* Step Content */}
        <Box sx={{ minHeight: 400 }}>
          {currentStepData ? (
            <Box>
              <Typography variant="h5" gutterBottom>
                {currentStepData.title}
              </Typography>
              <Typography variant="body1" color="text.secondary" gutterBottom>
                {currentStepData.intro?.subheading}
              </Typography>
              {/* TODO: Render step content based on layout */}
              <Alert severity="info" sx={{ mt: 2 }}>
                Step content rendering for {currentStepData.layout} — implement per-layout views
              </Alert>
            </Box>
          ) : (
            <Alert severity="warning">Step content not available</Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {activeStep > 0 && (
          <Button onClick={handleBack}>Back</Button>
        )}
        {activeStep < 4 && (
          <Button variant="contained" onClick={handleNext}>
            Next
          </Button>
        )}
        {activeStep === 4 && (
          <>
            <Button onClick={() => { /* continue without consent */ }}>
              Continue without consent
            </Button>
            <Button
              variant="contained"
              onClick={handleProvideConsent}
              disabled={!canSubmit() || policyAcceptancePending}
            >
              {policyAcceptancePending ? 'Submitting...' : 'Provide consent'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ConsentWizard;
```

**Design notes**:
- This is a skeleton — Phase 5 tasks will expand with per-layout renderers (card_grid, column_grid, clause_list, consent_form).
- Tracks visited steps in a Set to enable the submit button only when all 5 are visited.
- Checkbox states stored in a Map for easy validation.

### 5.2 Frontend — Conditional rendering in onboarding flow

Extend `useOnboarding` context or `PendingPolicyBanner` to check for active template:

```jsx
// In useOnboarding context or where StandalonePolicyModal is triggered:
const [hasTemplate, setHasTemplate] = useState(false);

useEffect(() => {
  if (currentStandalonePolicy) {
    api.get(`/policy-templates/active?name=${currentStandalonePolicy.policyName}`)
      .then(() => setHasTemplate(true))
      .catch(() => setHasTemplate(false));
  }
}, [currentStandalonePolicy]);

// Conditional render:
{standalonePolicyModalOpen && (
  hasTemplate ? <ConsentWizard /> : <StandalonePolicyModal />
)}
```

---

## Phase 6 — Integration and Migration

### 6.1 Backend — Migration script

File: `backend/scripts/migrate-policy-to-template.js`

```js
const mongoose = require('mongoose');
require('dotenv').config();
const Policy = require('../models/Policy');
const PolicyTemplate = require('../models/PolicyTemplate');
const { extractTextFromGridFS } = require('../services/pdfExtractionService');
const { extractConsentStructure } = require('../services/llmConsentService');
const fs = require('fs');
const path = require('path');

async function migratePolicyToTemplate(policyId, adminUserId) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const policy = await Policy.findById(policyId);
    if (!policy) {
      console.error('Policy not found:', policyId);
      return;
    }

    console.log(`Migrating policy: ${policy.name} (${policy.version})`);

    // Create draft PolicyTemplate
    const template = new PolicyTemplate({
      name: policy.name,
      version: policy.version,
      effectiveDate: policy.effectiveFrom,
      sourceType: 'pdf_import',
      sourcePdfFileId: policy.fileId,
      hero: {
        title: policy.name,
        body: `This notice explains how we handle your personal data.`,
      },
      steps: [],
      consentCheckboxes: [],
      guardianRights: [],
      createdBy: adminUserId,
      status: 'draft',
    });

    await template.save();
    console.log(`Created draft template: ${template._id}`);

    // Extract from PDF
    console.log('Extracting text from PDF...');
    const pdfText = await extractTextFromGridFS(policy.fileId);
    
    console.log('Calling LLM for structured extraction...');
    const { clauses, proposedCheckboxes } = await extractConsentStructure(pdfText);

    // Populate template
    template.steps.push({
      key: 'full_notice',
      order: 4,
      title: 'Full Privacy Notice',
      layout: 'clause_list',
      intro: {
        eyebrow: 'Complete Legal Text',
        heading: policy.name,
        subheading: 'Please review the full terms below.',
      },
      items: clauses.map((c, i) => ({
        clauseNumber: c.clauseNumber || (i + 1),
        title: c.title,
        body: c.body,
        enabled: true,
      })),
    });

    template.consentCheckboxes = proposedCheckboxes.map((cb, i) => ({
      id: `checkbox_${i + 1}`,
      order: i + 1,
      label: cb.label,
      required: true,
      category: cb.category || 'general',
      enabled: true,
    }));

    await template.save();

    // Log to file
    const logEntry = {
      timestamp: new Date().toISOString(),
      policyId: policy._id.toString(),
      policyName: policy.name,
      templateId: template._id.toString(),
      clauseCount: clauses.length,
      checkboxCount: proposedCheckboxes.length,
      status: 'draft',
    };

    const logPath = path.join(__dirname, '../logs/policy-template-migration.log');
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');

    console.log('Migration complete. Template ID:', template._id);
    console.log('HR must review and publish this template manually.');

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// CLI usage: node migrate-policy-to-template.js <policyId> <adminUserId>
const [,, policyId, adminUserId] = process.argv;
if (!policyId || !adminUserId) {
  console.error('Usage: node migrate-policy-to-template.js <policyId> <adminUserId>');
  process.exit(1);
}

migratePolicyToTemplate(policyId, adminUserId);
```

**Run example**:
```bash
node backend/scripts/migrate-policy-to-template.js 507f1f77bcf86cd799439011 507f1f77bcf86cd799439012
```

### 6.2 Frontend — getPendingPolicies extension

Extend `backend/controllers/onboardingController.js` → `getPendingPolicies`:

```js
// Add hasTemplate flag per policy
const policiesWithTemplates = await Promise.all(pendingPolicies.map(async (p) => {
  const hasTemplate = !!(await PolicyTemplate.findOne({ name: p.policyName, status: 'active' }));
  return { ...p.toObject(), hasTemplate };
}));

res.json({ policies: policiesWithTemplates });
```

---

## Frontend Component Map

All new components:

| File | Phase | Purpose |
|------|-------|---------|
| `frontend/src/components/admin/PolicyTemplateList.jsx` | 3 | List of all templates with Edit/Publish actions |
| `frontend/src/pages/admin/PolicyTemplateEditorPage.jsx` | 3 | Visual editor for hero, steps, checkboxes, rights |
| `frontend/src/components/onboarding/ConsentWizard.jsx` | 5 | 5-step employee-facing wizard |

Extended components:

| File | Phase | Changes |
|------|-------|---------|
| `frontend/src/pages/AdminPoliciesPage.jsx` | 3 | Add 6th tab: "Consent Templates" |
| `frontend/src/components/PolicyUploadForm.jsx` | 3 | Add "Import from PDF" flow |
| `frontend/src/context/OnboardingContext.jsx` | 5 | Add hasTemplate check, conditional render logic |

---

## Backend Route Map

| Method | Path | Middleware | Phase | Purpose |
|--------|------|------------|-------|---------|
| `GET` | `/api/policy-templates` | `authenticateToken, requireAdminOrHr` | 2 | List all templates |
| `GET` | `/api/policy-templates/active` | `authenticateToken` | 2 | Get active template by name |
| `POST` | `/api/policy-templates` | `authenticateToken, requireAdminOrHr` | 2 | Create new template |
| `POST` | `/api/policy-templates/:id/extract-from-pdf` | `authenticateToken, requireAdminOrHr` | 2 | Trigger LLM extraction |
| `PATCH` | `/api/policy-templates/:id` | `authenticateToken, requireAdminOrHr` | 2 | Update template (autosave) |
| `POST` | `/api/policy-templates/:id/publish` | `authenticateToken, requireAdminOrHr` | 2 | Publish template |
| `POST` | `/api/consent/submit` | `authenticateToken` | 4 | Submit consent |
| `POST` | `/api/consent/continue-without-consent` | `authenticateToken` | 4 | Record non-consent |
| `POST` | `/api/consent/request-alternative` | `authenticateToken` | 4 | Request alternative + notify HR |

---

## Dependencies

Add to `backend/package.json`:

```json
{
  "dependencies": {
    "pdf-parse": "^1.1.1"
  }
}
```

Frontend dependencies are already covered (MUI, React Router, axios).

---

## NFR Implementation Notes

### Performance

- **LLM extraction**: Add a timeout (30s) and fallback to manual editing if the LLM call fails.
- **Autosave debounce**: Use lodash `debounce` or a React hook with 1s delay.
- **Lazy-load wizard steps**: Only render currentStepData in ConsentWizard.

### Security

- **XSS sanitization**: Use DOMPurify on all user-provided HTML content (hero.body, step intro.heading, etc.).
- **Audit logging**: Extend the existing AuditLog model with `POLICY_TEMPLATE_CREATED`, `POLICY_TEMPLATE_PUBLISHED`, `CONSENT_SUBMITTED` actions if available.

### Data Integrity

- **Immutable logs**: Never `deleteOne()` on PolicyAcceptanceLog — only set `status: 'archived'` or similar.
- **GridFS referential integrity**: Add a pre-delete hook on PolicyTemplate to prevent deletion if `sourcePdfFileId` is still referenced.
