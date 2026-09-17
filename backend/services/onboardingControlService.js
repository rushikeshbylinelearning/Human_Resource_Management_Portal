const mongoose = require('mongoose');
const Setting = require('../models/Setting');
const Policy = require('../models/Policy');
const PolicyTemplate = require('../models/PolicyTemplate');
const User = require('../models/User');
const { ensurePolicyForTemplate } = require('./consentAssignmentService');

const CONTROL_KEY = 'onboarding_control';
const MAX_SELECTED_USERS = 500;
const MAX_DEADLINE_DAYS = 90;

const DEFAULTS = {
  requirePolicyOnFirstLogin: true,
  requireTourOnFirstLogin: true,
  requireProfileOnFirstLogin: true,
  firstLoginSource: 'policy',
  mandatoryPolicyId: null,
  mandatoryTemplateId: null,
  deadlineDays: 7,
};

function clampDeadlineDays(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return DEFAULTS.deadlineDays;
  return Math.min(MAX_DEADLINE_DAYS, Math.max(1, n));
}

function isValidId(id) {
  return Boolean(id) && mongoose.Types.ObjectId.isValid(String(id));
}

async function getOnboardingControl() {
  const doc = await Setting.findOne({ key: CONTROL_KEY }).lean();
  const value = { ...DEFAULTS, ...(doc?.value || {}) };

  const mandatory = await Policy.findOne({
    isMandatoryOnboarding: true,
    status: 'Active',
  }).select('_id name version sourceKind templateId').lean();

  if (mandatory) {
    value.mandatoryPolicyId = String(mandatory._id);
    if (mandatory.templateId) value.mandatoryTemplateId = String(mandatory.templateId);
    if (!doc?.value?.firstLoginSource) {
      value.firstLoginSource = (mandatory.sourceKind === 'consent_template' || mandatory.templateId)
        ? 'template'
        : 'policy';
    }
  }

  let mandatoryPolicy = null;
  let mandatoryTemplate = null;
  if (isValidId(value.mandatoryPolicyId)) {
    mandatoryPolicy = await Policy.findById(value.mandatoryPolicyId)
      .select('_id name version status sourceKind templateId isMandatoryOnboarding')
      .lean();
  }
  if (isValidId(value.mandatoryTemplateId)) {
    mandatoryTemplate = await PolicyTemplate.findById(value.mandatoryTemplateId)
      .select('_id name version status')
      .lean();
  }

  return {
    ...value,
    deadlineDays: clampDeadlineDays(value.deadlineDays),
    mandatoryPolicy,
    mandatoryTemplate,
    updatedAt: doc?.updatedAt || null,
  };
}

async function syncMandatoryPolicy({ firstLoginSource, policyId, templateId, actorUserId }) {
  await Policy.updateMany(
    { isMandatoryOnboarding: true },
    { $set: { isMandatoryOnboarding: false } }
  );

  if (firstLoginSource === 'none') {
    return { policyId: null, templateId: null };
  }

  if (firstLoginSource === 'template') {
    if (!isValidId(templateId)) {
      const err = new Error('Select a published consent template for first login.');
      err.statusCode = 400;
      throw err;
    }
    const template = await PolicyTemplate.findOne({ _id: templateId, status: 'active' });
    if (!template) {
      const err = new Error('Published consent template not found.');
      err.statusCode = 404;
      throw err;
    }
    const policy = await ensurePolicyForTemplate(template, actorUserId);
    policy.isMandatoryOnboarding = true;
    await policy.save();
    return { policyId: String(policy._id), templateId: String(template._id) };
  }

  if (!isValidId(policyId)) {
    const err = new Error('Select an active policy for first login.');
    err.statusCode = 400;
    throw err;
  }
  const policy = await Policy.findOne({ _id: policyId, status: 'Active' });
  if (!policy) {
    const err = new Error('Active policy not found.');
    err.statusCode = 404;
    throw err;
  }
  if (policy.sourceKind === 'consent_template') {
    const err = new Error('Select a PDF policy, or switch first-login source to consent template.');
    err.statusCode = 400;
    throw err;
  }
  policy.isMandatoryOnboarding = true;
  await policy.save();
  return {
    policyId: String(policy._id),
    templateId: policy.templateId ? String(policy.templateId) : null,
  };
}

async function saveOnboardingControl(input, actorUserId) {
  const current = await getOnboardingControl();
  const next = {
    requirePolicyOnFirstLogin: input.requirePolicyOnFirstLogin !== false,
    requireTourOnFirstLogin: input.requireTourOnFirstLogin !== false,
    requireProfileOnFirstLogin: input.requireProfileOnFirstLogin !== false,
    firstLoginSource: ['policy', 'template', 'none'].includes(input.firstLoginSource)
      ? input.firstLoginSource
      : current.firstLoginSource,
    deadlineDays: clampDeadlineDays(input.deadlineDays ?? current.deadlineDays),
    mandatoryPolicyId: current.mandatoryPolicyId,
    mandatoryTemplateId: current.mandatoryTemplateId,
    updatedBy: actorUserId,
  };

  if (!next.requirePolicyOnFirstLogin) {
    next.firstLoginSource = 'none';
  }

  const linked = await syncMandatoryPolicy({
    firstLoginSource: next.firstLoginSource,
    policyId: input.mandatoryPolicyId,
    templateId: input.mandatoryTemplateId,
    actorUserId,
  });
  next.mandatoryPolicyId = linked.policyId;
  next.mandatoryTemplateId = linked.templateId;
  if (next.firstLoginSource === 'none') {
    next.requirePolicyOnFirstLogin = false;
  }

  await Setting.findOneAndUpdate(
    { key: CONTROL_KEY },
    { $set: { value: next } },
    { upsert: true, new: true }
  );

  return getOnboardingControl();
}

function assertAdminOrHr(req) {
  if (!['Admin', 'HR'].includes(req.user?.role)) {
    const err = new Error('Access denied.');
    err.statusCode = 403;
    throw err;
  }
}

async function resolveAssignableUserIds({ userIds, assignToAll, confirmAssignAll }) {
  if (assignToAll) {
    if (confirmAssignAll !== true) {
      const err = new Error('Confirm bulk assignment to all employees.');
      err.statusCode = 400;
      throw err;
    }
    const users = await User.find({
      isActive: true,
      role: { $in: ['Employee', 'Intern'] },
    }).select('_id').lean();
    return users.map((u) => String(u._id));
  }

  if (!Array.isArray(userIds) || userIds.length === 0) {
    const err = new Error('Select at least one employee.');
    err.statusCode = 400;
    throw err;
  }
  if (userIds.length > MAX_SELECTED_USERS) {
    const err = new Error(`You can select at most ${MAX_SELECTED_USERS} employees at once.`);
    err.statusCode = 400;
    throw err;
  }

  const uniqueIds = [...new Set(userIds.map(String).filter(isValidId))];
  const users = await User.find({
    _id: { $in: uniqueIds },
    isActive: true,
    role: { $in: ['Employee', 'Intern'] },
  }).select('_id').lean();

  if (!users.length) {
    const err = new Error('No assignable employees found. Admin and HR accounts cannot be assigned.');
    err.statusCode = 400;
    throw err;
  }
  return users.map((u) => String(u._id));
}

module.exports = {
  CONTROL_KEY,
  DEFAULTS,
  clampDeadlineDays,
  getOnboardingControl,
  saveOnboardingControl,
  assertAdminOrHr,
  resolveAssignableUserIds,
  isValidId,
};
