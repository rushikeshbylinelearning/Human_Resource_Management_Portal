const Policy = require('../models/Policy');
const PolicyTemplate = require('../models/PolicyTemplate');
const PolicyAcceptanceLog = require('../models/PolicyAcceptanceLog');
const User = require('../models/User');
const cacheService = require('./cacheService');

function parseUA(ua = '') {
  let device = 'Desktop';
  if (/mobile/i.test(ua)) device = 'Mobile';
  else if (/tablet|ipad/i.test(ua)) device = 'Tablet';

  let browser = 'Unknown';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/opr\//i.test(ua)) browser = 'Opera';
  else if (/chrome/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua)) browser = 'Safari';
  else if (/msie|trident/i.test(ua)) browser = 'IE';

  return { device, browser };
}

function captureClientContext(req) {
  const ip = req.ip || req.connection?.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';
  const { device, browser } = parseUA(userAgent);
  return { ipAddress: ip, userAgent, deviceType: device, browser };
}

function applyDeviceContext(log, req) {
  const ctx = captureClientContext(req);
  if (!log.ipAddress) log.ipAddress = ctx.ipAddress;
  log.userAgent = ctx.userAgent;
  log.deviceType = ctx.deviceType;
  log.browser = ctx.browser;
  return ctx;
}

/**
 * Ensure a Policy document exists for a published consent template so it can
 * be assigned through the existing PolicyAcceptanceLog flow.
 * Reuses a same-name PDF policy when one exists (migration path); otherwise
 * creates a file-less stub with sourceKind=consent_template.
 */
async function ensurePolicyForTemplate(template, uploadedByUserId) {
  if (!template) throw new Error('Template is required');

  let policy = await Policy.findOne({
    templateId: template._id,
    status: 'Active',
  });

  if (!policy) {
    policy = await Policy.findOne({
      name: template.name,
      status: 'Active',
    });
  }

  if (policy) {
    const updates = {};
    if (!policy.templateId || String(policy.templateId) !== String(template._id)) {
      updates.templateId = template._id;
    }
    if (policy.sourceKind === 'consent_template' && policy.version !== template.version) {
      updates.version = template.version;
    }
    if (Object.keys(updates).length) {
      Object.assign(policy, updates);
      await policy.save();
    }
    return policy;
  }

  return Policy.create({
    name: template.name,
    version: template.version,
    effectiveFrom: template.effectiveDate || new Date(),
    status: 'Active',
    sourceKind: 'consent_template',
    templateId: template._id,
    uploadedBy: uploadedByUserId,
    wordCount: null,
  });
}

async function findActiveTemplateForPolicy(policy) {
  if (!policy) return null;
  if (policy.templateId) {
    const byId = await PolicyTemplate.findOne({
      _id: policy.templateId,
      status: 'active',
    });
    if (byId) return byId;
  }
  if (!policy.name) return null;
  return PolicyTemplate.findOne({ name: policy.name, status: 'active' });
}

async function findAssignmentLog({ userId, logId, policyId }) {
  if (logId) {
    const query = { _id: logId, userId };
    if (policyId) query.policyId = policyId;
    return PolicyAcceptanceLog.findOne(query);
  }
  if (!policyId) return null;
  return PolicyAcceptanceLog.findOne({
    userId,
    policyId,
    accepted: false,
    status: { $in: ['pending', 'in_progress', 'overdue'] },
  }).sort({ createdAt: -1 });
}

function stampTemplateOnLog(log, template) {
  if (!template) return;
  log.templateId = template._id;
  log.templateVersion = template.version;
  log.assignmentSource = log.assignmentSource || 'template';
}

function appendTimeline(log, event, notes) {
  log.timeline = log.timeline || [];
  log.timeline.push({
    event,
    timestamp: new Date(),
    notes: notes || '',
  });
}

async function markUserOnboardingPolicyAccepted({ userId, logId, policyVersion }) {
  const user = await User.findById(userId);
  if (!user) return null;
  const onboardingLogId = user.onboarding?.policyAcceptanceLogId;
  if (!onboardingLogId || String(onboardingLogId) !== String(logId)) {
    return user.onboarding || null;
  }
  if (user.onboarding.policyAccepted) return user.onboarding;

  user.onboarding = {
    ...(user.onboarding || {}),
    policyAccepted: true,
    policyAcceptedAt: new Date(),
    policyVersionAccepted: policyVersion || user.onboarding.policyVersionAccepted,
  };
  await user.save();
  cacheService.invalidateUser(user._id.toString());
  return user.onboarding;
}

module.exports = {
  parseUA,
  captureClientContext,
  applyDeviceContext,
  ensurePolicyForTemplate,
  findActiveTemplateForPolicy,
  findAssignmentLog,
  stampTemplateOnLog,
  appendTimeline,
  markUserOnboardingPolicyAccepted,
};
