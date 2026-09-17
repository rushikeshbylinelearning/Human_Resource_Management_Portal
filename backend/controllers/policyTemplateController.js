const PolicyTemplate = require('../models/PolicyTemplate');
const { extractTextFromGridFS } = require('../services/pdfExtractionService');
const { extractConsentStructure } = require('../services/llmConsentService');
const { ensurePolicyForTemplate } = require('../services/consentAssignmentService');

/**
 * POST /policy-templates
 * Create a new blank draft or pdf_import draft
 */async function createTemplate(req, res) {
  try {
    const {
      name,
      version,
      effectiveDate,
      sourceType,
      sourcePdfFileId,
      variables,
      hero,
      steps,
      consentCheckboxes,
      guardianRights,
      copy,
    } = req.body;

    const template = new PolicyTemplate({
      name,
      version: version || '1.0',
      effectiveDate: effectiveDate || new Date(),
      sourceType: sourceType || 'manual',
      sourcePdfFileId: sourcePdfFileId || null,
      variables: variables || undefined,
      hero: hero || {
        title: name || 'Privacy Notice',
        body: '',
      },
      steps: Array.isArray(steps) ? steps : [],
      consentCheckboxes: Array.isArray(consentCheckboxes) ? consentCheckboxes : [],
      guardianRights: Array.isArray(guardianRights) ? guardianRights : [],
      copy: copy || undefined,
      createdBy: req.user.userId,
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
 * GET /policy-templates/:id
 * Get a single template by ID
 */
async function getTemplateById(req, res) {
  try {
    // Validate ID parameter
    if (!req.params.id || req.params.id === 'undefined') {
      return res.status(400).json({ 
        error: 'Invalid template ID', 
        details: 'Template ID is required and cannot be undefined' 
      });
    }

    const template = await PolicyTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    
    res.json({ template });
  } catch (error) {
    console.error('Failed to fetch template:', error);
    res.status(500).json({ error: 'Failed to fetch template', details: error.message });
  }
}

/**
 * POST /policy-templates/:id/extract-from-pdf
 * Trigger LLM extraction from the template's sourcePdfFileId
 */
async function extractFromPdf(req, res) {
  try {
    // Validate ID parameter
    if (!req.params.id || req.params.id === 'undefined') {
      return res.status(400).json({ 
        error: 'Invalid template ID', 
        details: 'Template ID is required and cannot be undefined' 
      });
    }

    const template = await PolicyTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    
    if (!template.sourcePdfFileId) {
      return res.status(400).json({ error: 'No source PDF linked to this template' });
    }
    
    // Step 1: Extract text from GridFS PDF
    console.log('Extracting text from PDF...');
    const pdfText = await extractTextFromGridFS(template.sourcePdfFileId);
    
    // Step 2: Send to LLM for structured extraction
    console.log('Sending to LLM for structured extraction...');
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
    
    template.updatedBy = req.user.userId;
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
// Fields HR is allowed to edit directly. `status` is deliberately excluded —
// it must only change via publishTemplate() so the "archive previous active"
// side effect always runs; a raw PATCH{status:'active'} would otherwise let a
// draft go live without archiving the template it's replacing, and could also
// be used to silently overwrite createdBy/sourcePdfFileId/_id if the whole
// body were Object.assign'd onto the document (the original mass-assignment
// bug this replaces).
const UPDATABLE_TEMPLATE_FIELDS = [
  'name', 'effectiveDate', 'variables', 'hero',
  'steps', 'consentCheckboxes', 'guardianRights', 'copy',
];

async function updateTemplate(req, res) {
  try {
    // Validate ID parameter
    if (!req.params.id || req.params.id === 'undefined') {
      return res.status(400).json({ 
        error: 'Invalid template ID', 
        details: 'Template ID is required and cannot be undefined' 
      });
    }

    const template = await PolicyTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    for (const field of UPDATABLE_TEMPLATE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        template[field] = req.body[field];
      }
    }
    template.updatedBy = req.user.userId;
    
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
    // Validate ID parameter
    if (!req.params.id || req.params.id === 'undefined') {
      return res.status(400).json({ 
        error: 'Invalid template ID', 
        details: 'Template ID is required and cannot be undefined' 
      });
    }

    const template = await PolicyTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    
    // Archive any existing active template with the same name
    await PolicyTemplate.updateMany(
      { name: template.name, status: 'active' },
      { $set: { status: 'archived' } }
    );
    
    // Publish this template
    template.status = 'active';
    template.updatedBy = req.user.userId;
    
    // Auto-increment version on publish if not manually set.
    // Publish is often posted with no body (frontend sends none), so req.body
    // may be undefined when express.json() has nothing to parse.
    const currentVersion = parseFloat(template.version) || 1.0;
    if (req.body?.version) {
      template.version = req.body.version;
    } else {
      template.version = (currentVersion + 0.1).toFixed(1);
    }
    
    await template.save();

    // Make the published template assignable through onboarding compliance.
    try {
      await ensurePolicyForTemplate(template, req.user.userId);
    } catch (linkError) {
      console.error('Published template but failed to link assignment policy:', linkError);
    }
    
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

/**
 * POST /policy-templates/upload-source-pdf
 * Upload a PDF to GridFS to use as a template's sourcePdfFileId, without
 * creating a Policy document. This is the missing entry point that makes
 * "extract-from-pdf" reachable from the UI: previously nothing in the
 * frontend ever uploaded a file and set sourcePdfFileId, so the extraction
 * endpoint existed but could never be called.
 */
async function uploadSourcePdf(req, res) {
  try {
    if (!req.policyUpload) {
      return res.status(400).json({ error: 'File upload failed' });
    }

    res.status(201).json({
      fileId: req.policyUpload.fileId,
      fileName: req.policyUpload.originalFilename || req.policyUpload.filename,
    });
  } catch (error) {
    console.error('Failed to upload source PDF:', error);
    res.status(500).json({ error: 'Failed to upload source PDF', details: error.message });
  }
}

/**
 * POST /policy-templates/upload-hero-image
 * Multipart field `heroImage`. Returns a public URL for <img src>.
 */
async function uploadHeroImage(req, res) {
  try {
    if (!req.templateImageUpload) {
      return res.status(400).json({ error: 'File upload failed' });
    }

    const fileId = req.templateImageUpload.fileId;
    res.status(201).json({
      fileId,
      imageUrl: `/api/policy-templates/hero-image/${fileId}`,
    });
  } catch (error) {
    console.error('Failed to upload hero image:', error);
    res.status(500).json({ error: 'Failed to upload hero image', details: error.message });
  }
}

/**
 * GET /policy-templates/hero-image/:fileId
 * Public (no auth) so <img src> works the same way as user avatars.
 * Only streams files stored as template hero images, not policy PDFs.
 */
async function streamHeroImage(req, res) {
  try {
    const mongoose = require('mongoose');
    let fileId = req.params.fileId || '';
    if (fileId.includes('.')) fileId = fileId.split('.')[0];

    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({ error: 'Invalid image ID' });
    }

    const { getPolicyBucket } = require('../db');
    const bucket = getPolicyBucket();
    const objectId = new mongoose.Types.ObjectId(fileId);
    const files = await bucket.find({ _id: objectId }).toArray();

    if (!files || files.length === 0) {
      return res.status(404).json({ error: 'Hero image not found' });
    }

    const file = files[0];
    const isHero =
      file.metadata?.kind === 'heroImage' ||
      (typeof file.filename === 'string' && file.filename.startsWith('template-hero-'));
    const contentType = file.contentType || '';
    if (!isHero || !contentType.startsWith('image/')) {
      return res.status(404).json({ error: 'Hero image not found' });
    }

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('X-Content-Type-Options', 'nosniff');
    if (file.length) res.set('Content-Length', file.length);

    const downloadStream = bucket.openDownloadStream(objectId);
    downloadStream.on('error', (error) => {
      console.error('[Hero Image GET] GridFS stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream hero image' });
      }
    });
    downloadStream.pipe(res);
  } catch (error) {
    console.error('[Hero Image GET] Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to serve hero image' });
    }
  }
}

module.exports = {
  createTemplate,
  getTemplateById,
  extractFromPdf,
  updateTemplate,
  publishTemplate,
  getActiveTemplate,
  listTemplates,
  uploadSourcePdf,
  uploadHeroImage,
  streamHeroImage,
};
