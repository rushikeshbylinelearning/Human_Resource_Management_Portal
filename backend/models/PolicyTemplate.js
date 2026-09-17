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
    _id: false,
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
      ['schoolName', ''],
      ['productName', ''],
      ['privacyEmail', ''],
      ['examContact', ''],
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
    id: { type: String, required: true, trim: true },
    order: { type: Number, required: true },
    label: { type: String, trim: true, maxlength: 500, default: '' },
    required: { type: Boolean, default: true },
    category: { type: String, trim: true },
    enabled: { type: Boolean, default: true },
    _id: false,
  }],
  
  guardianRights: [{
    label: { type: String, trim: true, maxlength: 200, default: '' },
    enabled: { type: Boolean, default: true },
    _id: false,
  }],

  copy: {
    preparedForLabel: { type: String, trim: true, default: '' },
    optionalBanner: {
      title: { type: String, trim: true, default: '' },
      body: { type: String, trim: true, default: '' },
      cta: { type: String, trim: true, default: '' },
      enabled: { type: Boolean, default: true },
    },
    callout: {
      title: { type: String, trim: true, default: '' },
      body: { type: String, trim: true, default: '' },
      enabled: { type: Boolean, default: true },
    },
    guardianRightsHeading: { type: String, trim: true, default: '' },
    footerLinks: [{
      label: { type: String, trim: true },
      _id: false,
    }],
  },
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

// Only one active template per name at any time. publishTemplate() already
// archives the previous active template before saving the new one, but that's
// a race-prone application-level guarantee (two concurrent publish requests
// could both pass the "archive existing" step before either saves) — the DB
// constraint is the actual backstop. NOTE: the original index was defined on
// {name, version, status}, which only rejects a duplicate (name + version)
// pair among actives; it did nothing to stop two different versions of the
// same template both being active simultaneously, which was the entire point.
policyTemplateSchema.index(
  { name: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
    name: 'unique_active_template_per_name',
  }
);

const PolicyTemplate = mongoose.model('PolicyTemplate', policyTemplateSchema);
module.exports = PolicyTemplate;
