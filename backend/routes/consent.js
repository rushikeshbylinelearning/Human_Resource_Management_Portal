const express = require('express');
const router = express.Router();
const PolicyAcceptanceLog = require('../models/PolicyAcceptanceLog');
const PolicyTemplate = require('../models/PolicyTemplate');
const Policy = require('../models/Policy');
const User = require('../models/User');
const authenticateToken = require('../middleware/authenticateToken');
const NewNotificationService = require('../services/NewNotificationService');
const {
  applyDeviceContext,
  findAssignmentLog,
  appendTimeline,
  markUserOnboardingPolicyAccepted,
} = require('../services/consentAssignmentService');

async function resolveConsentContext(req, policyId) {
  const [user, policy] = await Promise.all([
    User.findById(req.user.userId).select('_id fullName employeeCode department').lean(),
    Policy.findById(policyId).select('_id name version templateId').lean(),
  ]);

  if (!user) {
    const err = new Error('Authenticated user not found');
    err.statusCode = 401;
    throw err;
  }
  if (!policy) {
    const err = new Error('Policy not found for the given policyId');
    err.statusCode = 404;
    throw err;
  }

  return {
    userId: user._id,
    userName: user.fullName,
    employeeCode: user.employeeCode,
    department: user.department || '',
    policyName: policy.name,
    policyVersion: policy.version,
    policyTemplateId: policy.templateId || null,
  };
}

function buildConsentTimeline(visitedSteps, outcomeEvent, outcomeNotes) {
  return [
    ...(visitedSteps || []).map(step => ({
      event: 'wizard_step_visited',
      timestamp: new Date(),
      notes: typeof step === 'string' ? step : (step?.stepKey || ''),
    })),
    {
      event: outcomeEvent,
      timestamp: new Date(),
      notes: outcomeNotes || '',
    },
  ];
}

function applyStepTimings(log, stepTimings) {
  if (!Array.isArray(stepTimings) || stepTimings.length === 0) return;
  log.stepTimings = stepTimings
    .filter((step) => step?.stepKey)
    .map((step) => ({
      stepKey: step.stepKey,
      durationSeconds: Number(step.durationSeconds) || 0,
      viewedAt: step.viewedAt ? new Date(step.viewedAt) : new Date(),
    }));
}

function applyReadingMetrics(log, body) {
  const wizardDuration = Number(body.wizardDurationSeconds) || 0;
  const fullNoticeDuration = Number(body.fullNoticeDurationSeconds) || 0;
  const readingDuration = Number(body.readingDurationSeconds) || fullNoticeDuration || wizardDuration || 0;

  if (wizardDuration > 0) log.wizardDurationSeconds = wizardDuration;
  if (fullNoticeDuration > 0) log.fullNoticeDurationSeconds = fullNoticeDuration;
  if (readingDuration > 0) log.readingDurationSeconds = readingDuration;

  applyStepTimings(log, body.stepTimings);
}

async function loadOrCreateAssignmentLog({ req, policyId, logId, context }) {
  let log = await findAssignmentLog({
    userId: context.userId,
    logId,
    policyId,
  });

  if (log) return log;

  log = new PolicyAcceptanceLog({
    userId: context.userId,
    userName: context.userName,
    employeeCode: context.employeeCode,
    department: context.department,
    policyId,
    policyName: context.policyName,
    policyVersion: context.policyVersion,
    templateId: context.policyTemplateId,
    assignmentSource: 'template',
    status: 'in_progress',
    timeline: [],
  });
  return log;
}

async function validateConsentCheckboxes({ policyName, templateVersion, checkboxResponses }) {
  if (!templateVersion) return;
  const template = await PolicyTemplate.findOne({
    name: policyName,
    version: templateVersion,
    status: 'active',
  });
  if (!template) return;

  const requiredCheckboxes = (template.consentCheckboxes || []).filter(
    cb => cb.required && cb.enabled
  );
  const checkedCheckboxIds = (checkboxResponses || [])
    .filter(resp => resp.checked)
    .map(resp => resp.checkboxId);
  const missingCheckboxes = requiredCheckboxes.filter(
    cb => !checkedCheckboxIds.includes(cb.id)
  );

  if (missingCheckboxes.length > 0) {
    const err = new Error('You must check all required consent checkboxes before submitting.');
    err.statusCode = 422;
    err.payload = {
      error: 'Missing required consents',
      message: err.message,
      missingCheckboxes: missingCheckboxes.map(cb => ({ id: cb.id, label: cb.label })),
    };
    throw err;
  }
}

/**
 * POST /api/consent/opened
 * Record that the employee opened the consent wizard (viewed).
 */
router.post('/opened', authenticateToken, async (req, res) => {
  try {
    const { logId, policyId } = req.body || {};
    if (!policyId && !logId) {
      return res.status(400).json({ error: 'logId or policyId is required' });
    }

    const context = await resolveConsentContext(req, policyId);
    const log = await loadOrCreateAssignmentLog({ req, policyId, logId, context });

    applyDeviceContext(log, req);
    const now = new Date();
    if (!log.viewedAt) log.viewedAt = now;
    if (!log.readingStartedAt) log.readingStartedAt = now;
    if (log.status === 'pending') log.status = 'in_progress';

    const alreadyOpened = (log.timeline || []).some(t => t.event === 'wizard_opened');
    if (!alreadyOpened) {
      appendTimeline(log, 'wizard_opened', 'Employee opened the consent wizard');
      appendTimeline(log, 'reading_started', 'Consent wizard reading started');
    }

    await log.save();
    return res.json({ message: 'Wizard view recorded', logId: log._id, viewedAt: log.viewedAt });
  } catch (error) {
    console.error('Consent opened tracking failed:', error);
    res.status(error.statusCode || 500).json({
      error: 'Failed to record wizard view',
      details: error.message,
    });
  }
});

/**
 * POST /api/consent/step-view
 * Record dwell time on a wizard step (survives abandoned sessions).
 */
router.post('/step-view', authenticateToken, async (req, res) => {
  try {
    const { logId, policyId, stepKey, durationSeconds } = req.body || {};
    if (!stepKey) {
      return res.status(400).json({ error: 'stepKey is required' });
    }

    const context = await resolveConsentContext(req, policyId);
    const log = await findAssignmentLog({
      userId: context.userId,
      logId,
      policyId,
    });
    if (!log) {
      return res.status(404).json({ error: 'Assignment record not found' });
    }

    log.stepTimings = log.stepTimings || [];
    log.stepTimings.push({
      stepKey,
      durationSeconds: Number(durationSeconds) || 0,
      viewedAt: new Date(),
    });
    appendTimeline(
      log,
      'wizard_step_visited',
      durationSeconds
        ? `${stepKey} (${Number(durationSeconds)}s)`
        : stepKey
    );
    if (log.status === 'pending') log.status = 'in_progress';
    await log.save();

    return res.json({ message: 'Step view recorded' });
  } catch (error) {
    console.error('Consent step-view tracking failed:', error);
    res.status(error.statusCode || 500).json({
      error: 'Failed to record step view',
      details: error.message,
    });
  }
});

/**
 * POST /api/consent/submit
 * Submit consent with full wizard completion. Updates the pending assignment log.
 */
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    const {
      policyId,
      logId,
      templateVersion,
      visitedSteps,
      checkboxResponses,
      guardian,
    } = req.body || {};

    const requiredSteps = ['at_a_glance', 'what_we_collect', 'your_choices', 'full_notice', 'consent'];
    const visited = visitedSteps || [];
    const missingSteps = requiredSteps.filter(step => !visited.includes(step));

    if (missingSteps.length > 0) {
      return res.status(422).json({
        error: 'Incomplete wizard flow',
        message: `You must visit all steps before submitting. Missing steps: ${missingSteps.join(', ')}`,
        missingSteps,
      });
    }

    const context = await resolveConsentContext(req, policyId);
    await validateConsentCheckboxes({
      policyName: context.policyName,
      templateVersion,
      checkboxResponses,
    });

    if (guardian && (guardian.guardianName || guardian.relationship)) {
      if (!guardian.guardianName || !guardian.relationship) {
        return res.status(422).json({
          error: 'Incomplete guardian information',
          message: 'Guardian name and relationship are required when providing guardian data.',
          missingFields: [
            !guardian.guardianName && 'guardianName',
            !guardian.relationship && 'relationship',
          ].filter(Boolean),
        });
      }

      const validRelationships = ['parent', 'legal_guardian', 'other_authorized_guardian'];
      if (!validRelationships.includes(guardian.relationship)) {
        return res.status(422).json({
          error: 'Invalid relationship',
          message: `Relationship must be one of: ${validRelationships.join(', ')}`,
        });
      }
    }

    const log = await loadOrCreateAssignmentLog({ req, policyId, logId, context });
    applyDeviceContext(log, req);
    const now = new Date();

    applyReadingMetrics(log, req.body);
    log.accepted = true;
    log.acceptedAt = now;
    log.readingCompletedAt = now;
    if (!log.viewedAt) log.viewedAt = log.readingStartedAt || now;
    if (!log.readingStartedAt) log.readingStartedAt = log.viewedAt || now;
    log.checkboxAcknowledged = true;
    log.outcome = 'consented';
    log.templateVersion = templateVersion || log.templateVersion || null;
    if (context.policyTemplateId && !log.templateId) log.templateId = context.policyTemplateId;
    log.checkboxResponses = checkboxResponses || [];
    log.guardian = guardian || undefined;
    log.status = 'completed';
    log.timeline = [
      ...(log.timeline || []),
      ...buildConsentTimeline(visitedSteps, 'consent_provided', `Consent provided via wizard (${log.readingDurationSeconds || 0}s)`),
    ];

    await log.save();

    const onboarding = await markUserOnboardingPolicyAccepted({
      userId: context.userId,
      logId: log._id,
      policyVersion: context.policyVersion,
    });

    res.json({
      message: 'Consent recorded successfully',
      logId: log._id,
      outcome: 'consented',
      onboarding: onboarding || undefined,
    });
  } catch (error) {
    console.error('Consent submission failed:', error);
    if (error.payload) {
      return res.status(error.statusCode || 422).json(error.payload);
    }
    res.status(error.statusCode || 500).json({
      error: 'Consent submission failed',
      details: error.message,
    });
  }
});

/**
 * POST /api/consent/continue-without-consent
 */
router.post('/continue-without-consent', authenticateToken, async (req, res) => {
  try {
    const { policyId, logId, templateVersion, visitedSteps, reason } = req.body || {};

    if (!policyId) {
      return res.status(400).json({ error: 'policyId is required' });
    }

    const context = await resolveConsentContext(req, policyId);
    const log = await loadOrCreateAssignmentLog({ req, policyId, logId, context });
    applyDeviceContext(log, req);
    applyReadingMetrics(log, req.body);

    log.accepted = false;
    log.outcome = 'continued_without_consent';
    log.templateVersion = templateVersion || log.templateVersion || null;
    log.status = 'completed';
    log.readingCompletedAt = new Date();
    log.timeline = [
      ...(log.timeline || []),
      ...buildConsentTimeline(
        visitedSteps,
        'continued_without_consent',
        reason || 'User chose to continue without consent'
      ),
    ];

    await log.save();

    res.json({
      message: 'Non-consent recorded',
      logId: log._id,
      outcome: 'continued_without_consent',
    });
  } catch (error) {
    console.error('Non-consent recording failed:', error);
    res.status(error.statusCode || 500).json({
      error: 'Non-consent recording failed',
      details: error.message,
    });
  }
});

/**
 * POST /api/consent/request-alternative
 */
router.post('/request-alternative', authenticateToken, async (req, res) => {
  try {
    const { policyId, logId, templateVersion, visitedSteps, requestMessage } = req.body || {};

    if (!policyId) {
      return res.status(400).json({ error: 'policyId is required' });
    }

    const context = await resolveConsentContext(req, policyId);
    const log = await loadOrCreateAssignmentLog({ req, policyId, logId, context });
    applyDeviceContext(log, req);
    applyReadingMetrics(log, req.body);

    log.accepted = false;
    log.outcome = 'alternative_requested';
    log.templateVersion = templateVersion || log.templateVersion || null;
    log.status = 'completed';
    log.readingCompletedAt = new Date();
    log.timeline = [
      ...(log.timeline || []),
      ...buildConsentTimeline(
        visitedSteps,
        'alternative_requested',
        requestMessage || 'User requested alternative consent method'
      ),
    ];

    await log.save();

    try {
      const notificationMessage = requestMessage
        ? `${context.userName} has requested an alternative consent method for "${context.policyName}": "${requestMessage}"`
        : `${context.userName} has requested an alternative consent method for "${context.policyName}".`;

      await NewNotificationService.broadcastToAdmins({
        message: notificationMessage,
        type: 'alternative_consent_request',
        category: 'admin',
        priority: 'high',
        navigationData: {
          page: 'admin/policies',
          params: { section: 'onboarding-compliance' },
        },
        metadata: {
          userId: context.userId.toString(),
          policyId,
          logId: log._id.toString(),
          type: 'ALTERNATIVE_CONSENT_REQUEST',
        },
      }, context.userId);
    } catch (notificationError) {
      console.error('Failed to send HR notification:', notificationError);
    }

    res.json({
      message: 'Alternative consent request recorded and HR notified',
      logId: log._id,
      outcome: 'alternative_requested',
    });
  } catch (error) {
    console.error('Alternative request failed:', error);
    res.status(error.statusCode || 500).json({
      error: 'Alternative request failed',
      details: error.message,
    });
  }
});

module.exports = router;
