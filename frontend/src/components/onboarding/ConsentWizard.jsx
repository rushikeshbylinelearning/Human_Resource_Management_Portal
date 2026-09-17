import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  Button,
  Checkbox,
  Card,
  Grid,
  Chip,
  Alert,
  CircularProgress,
  Divider,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import api from '../../api/axios';
import {
  consentColors,
  consentTypography,
  consentSpacing,
  CONSENT_STEPS,
  toVariables,
  resolveTemplateVariables,
  formatNoticeDate,
  getStepIntro,
  wizardCardSx,
  primaryPillButtonSx,
  outlinedPillButtonSx,
  iconChipSx,
} from '../../theme/consentWizardTheme';
import {
  ConsentHeroCard,
  StepIntro,
  ConsentFieldsGrid,
  renderRichLabel,
  SuccessBanner,
  getIconComponent,
} from './ConsentWizardChrome';

const STEPS = CONSENT_STEPS;

const MINIMUM_READING_TIME_SECONDS = 30; // Minimum time on "Full notice" step
void MINIMUM_READING_TIME_SECONDS;

const ConsentWizard = ({
  open,
  onClose,
  policyId,
  policyName,
  logId = null,
  requireConsent = false,
  onSuccess,
  previewTemplate = null,
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [visitedSteps, setVisitedSteps] = useState(new Set([0]));
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [guardian, setGuardian] = useState({
    studentFullName: '',
    studentAdmissionId: '',
    guardianName: '',
    relationship: '',
    guardianEmail: '',
    guardianMobile: { countryCode: '+966', number: '' },
    remark: '',
  });

  const [checkboxStates, setCheckboxStates] = useState({});

  const [readingStartTime, setReadingStartTime] = useState(null);
  const [, setFullNoticeReadingTime] = useState(0);
  const readingTimerIntervalRef = useRef(null);
  const wizardOpenedAtRef = useRef(null);
  const lastStepRef = useRef({ key: null, enteredAt: null });
  const stepTimingsRef = useRef([]);

  useEffect(() => {
    if (!open) {
      setActiveStep(0);
      setVisitedSteps(new Set([0]));
      setSubmitted(false);
      setError(null);
      setTemplate(null);
      setReadingStartTime(null);
      wizardOpenedAtRef.current = null;
      lastStepRef.current = { key: null, enteredAt: null };
      stepTimingsRef.current = [];
      return;
    }
    wizardOpenedAtRef.current = Date.now();
    lastStepRef.current = { key: STEPS[0].key, enteredAt: Date.now() };
    if (previewTemplate) {
      setLoading(false);
      setError(null);
      setTemplate(previewTemplate);
      const initialCheckboxStates = {};
      (previewTemplate.consentCheckboxes || []).forEach((cb) => {
        initialCheckboxStates[cb.id] = false;
      });
      setCheckboxStates(initialCheckboxStates);
      return;
    }
    if (policyName) {
      loadTemplate();
    }
    if (policyId) {
      api.post('/consent/opened', { logId, policyId }).catch((err) => {
        console.error('Failed to record wizard open:', err);
      });
    }
  }, [open, policyName, previewTemplate, policyId, logId]);

  useEffect(() => {
    setVisitedSteps((prev) => new Set([...prev, activeStep]));
  }, [activeStep]);

  const flushCurrentStep = (stepIndex = activeStep) => {
    const prev = lastStepRef.current;
    if (!prev?.key || !prev.enteredAt) {
      lastStepRef.current = { key: STEPS[stepIndex]?.key, enteredAt: Date.now() };
      return null;
    }
    const durationSeconds = Math.max(0, Math.floor((Date.now() - prev.enteredAt) / 1000));
    const entry = {
      stepKey: prev.key,
      durationSeconds,
      viewedAt: new Date(prev.enteredAt).toISOString(),
    };
    stepTimingsRef.current.push(entry);
    if (!previewTemplate && policyId) {
      api.post('/consent/step-view', {
        logId,
        policyId,
        stepKey: prev.key,
        durationSeconds,
      }).catch(() => {});
    }
    lastStepRef.current = { key: STEPS[stepIndex]?.key, enteredAt: Date.now() };
    return entry;
  };

  useEffect(() => {
    if (!open || previewTemplate) return undefined;
    if (!lastStepRef.current.key) {
      lastStepRef.current = { key: STEPS[activeStep].key, enteredAt: Date.now() };
      return undefined;
    }
    if (lastStepRef.current.key === STEPS[activeStep].key) return undefined;
    flushCurrentStep(activeStep);
    return undefined;
  }, [activeStep, open, previewTemplate]);

  const buildTrackingPayload = () => {
    flushCurrentStep(activeStep);
    const stepTimings = [...stepTimingsRef.current];
    const wizardDurationSeconds = wizardOpenedAtRef.current
      ? Math.floor((Date.now() - wizardOpenedAtRef.current) / 1000)
      : 0;
    const fullNoticeDurationSeconds = stepTimings
      .filter((s) => s.stepKey === 'full_notice')
      .reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
    const readingDurationSeconds = readingStartTime
      ? Math.floor((Date.now() - readingStartTime) / 1000)
      : fullNoticeDurationSeconds;

    return {
      policyId,
      logId,
      templateVersion: template?.version,
      visitedSteps: Array.from(visitedSteps).map((index) => STEPS[index]?.key).filter(Boolean),
      stepTimings,
      wizardDurationSeconds,
      fullNoticeDurationSeconds,
      readingDurationSeconds,
    };
  };

  useEffect(() => {
    if (activeStep === 3 && !readingStartTime) {
      const startedAt = Date.now();
      setReadingStartTime(startedAt);
      readingTimerIntervalRef.current = setInterval(() => {
        setFullNoticeReadingTime(Math.floor((Date.now() - startedAt) / 1000));
      }, 1000);
    }

    return () => {
      if (readingTimerIntervalRef.current) {
        clearInterval(readingTimerIntervalRef.current);
        readingTimerIntervalRef.current = null;
      }
    };
  }, [activeStep]);

  const loadTemplate = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(
        `/policy-templates/active?name=${encodeURIComponent(policyName)}`
      );
      setTemplate(data.template);

      const initialCheckboxStates = {};
      (data.template.consentCheckboxes || []).forEach((cb) => {
        initialCheckboxStates[cb.id] = false;
      });
      setCheckboxStates(initialCheckboxStates);
    } catch (err) {
      console.error('Failed to load template:', err);
      setError('Failed to load consent wizard. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (activeStep < STEPS.length - 1) {
      setActiveStep(activeStep + 1);
    }
  };

  const handleBack = () => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
    }
  };

  const handleStepClick = (stepIndex) => {
    setActiveStep(stepIndex);
  };

  const handleGuardianChange = (field, value) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setGuardian((prev) => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value,
        },
      }));
    } else {
      setGuardian((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleCheckboxChange = (checkboxId, checked) => {
    setCheckboxStates((prev) => ({ ...prev, [checkboxId]: checked }));
  };

  const canSubmit = () => {
    if (visitedSteps.size < 5) return false;

    const requiredCheckboxes = (template?.consentCheckboxes || []).filter(
      (cb) => cb.required && cb.enabled
    );
    const allRequiredChecked = requiredCheckboxes.every(
      (cb) => checkboxStates[cb.id] === true
    );
    if (!allRequiredChecked) return false;

    if (guardian.guardianName || guardian.relationship) {
      if (!guardian.guardianName || !guardian.relationship) return false;
    }

    return true;
  };

  const handleProvideConsent = async () => {
    if (previewTemplate) {
      setSubmitted(true);
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        ...buildTrackingPayload(),
        checkboxResponses: Object.entries(checkboxStates).map(([checkboxId, checked]) => {
          const checkbox = template.consentCheckboxes.find((cb) => cb.id === checkboxId);
          return {
            checkboxId,
            label: checkbox?.label || '',
            required: checkbox?.required || false,
            checked,
          };
        }),
        guardian: guardian.guardianName || guardian.relationship ? guardian : undefined,
      };

      await api.post('/consent/submit', payload);

      setSubmitted(true);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Consent submission failed:', err);
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'Failed to submit consent. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinueWithoutConsent = async () => {
    if (previewTemplate) {
      onClose();
      return;
    }
    try {
      await api.post('/consent/continue-without-consent', {
        ...buildTrackingPayload(),
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to record non-consent:', err);
    }
  };

  const handleRequestAlternative = async () => {
    if (previewTemplate) {
      onClose();
      return;
    }
    try {
      await api.post('/consent/request-alternative', {
        ...buildTrackingPayload(),
        requestMessage: 'Requested alternative consent method from wizard',
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to request alternative:', err);
    }
  };

  const variables = toVariables(template?.variables);
  const productName = variables.productName || '';
  const copy = template?.copy || {};

  const wizardSteps = STEPS.map((s) => {
    const saved = template?.steps?.find((x) => x.key === s.key);
    return { key: s.key, label: saved?.title || s.label, order: s.order };
  });

  const renderStepContent = () => {
    if (!template) return null;

    const currentStepKey = STEPS[activeStep].key;
    const currentStepData = (template.steps || []).find((s) => s.key === currentStepKey);
    const intro = getStepIntro(currentStepData, currentStepKey, { useFallback: false });

    if (currentStepKey === 'your_choices') {
      return (
        <YourChoicesLayout
          intro={intro}
          variables={variables}
          items={(currentStepData?.items || []).filter((item) => item.enabled !== false)}
          rights={template.guardianRights || []}
          rightsHeading={copy.guardianRightsHeading}
          onOpenConsent={() => setActiveStep(4)}
          onContinueWithoutConsent={requireConsent ? undefined : handleContinueWithoutConsent}
          onRequestAlternative={requireConsent ? undefined : handleRequestAlternative}
        />
      );
    }

    if (!currentStepData) {
      return (
        <Alert severity="info">
          This step has not been configured yet. Please skip to the next step.
        </Alert>
      );
    }

    switch (currentStepData.layout) {
      case 'card_grid':
        return (
          <CardGridLayout
            intro={intro}
            items={currentStepData.items || []}
            variables={variables}
            onSeeChoices={() => setActiveStep(2)}
            banner={copy.optionalBanner}
          />
        );
      case 'column_grid':
        return (
          <ColumnGridLayout
            intro={intro}
            items={currentStepData.items || []}
            variables={variables}
            callout={copy.callout}
          />
        );
      case 'clause_list':
        return (
          <ClauseListLayout
            intro={intro}
            items={currentStepData.items || []}
            variables={variables}
            version={template.version}
            effectiveDate={template.effectiveDate}
          />
        );
      case 'consent_form':
        return (
          <ConsentFormLayout
            intro={intro}
            checkboxes={template.consentCheckboxes || []}
            checkboxStates={checkboxStates}
            onCheckboxChange={handleCheckboxChange}
            guardian={guardian}
            onGuardianChange={handleGuardianChange}
            variables={variables}
            submitted={submitted}
            canSubmit={canSubmit()}
            submitting={submitting}
            onProvideConsent={handleProvideConsent}
            onContinueWithoutConsent={requireConsent ? undefined : handleContinueWithoutConsent}
          />
        );
      default:
        return <Alert severity="warning">Unknown layout type: {currentStepData.layout}</Alert>;
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onClose={requireConsent ? undefined : onClose} maxWidth="md" fullWidth disableEscapeKeyDown={requireConsent}>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
            <CircularProgress />
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  if (error && !template) {
    return (
      <Dialog open={open} onClose={requireConsent ? undefined : onClose} maxWidth="md" fullWidth disableEscapeKeyDown={requireConsent}>
        <DialogContent>
          <Alert severity="error">{error}</Alert>
          <Button onClick={onClose} sx={{ mt: 2 }}>
            Close
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={requireConsent ? undefined : onClose}
      disableEscapeKeyDown={requireConsent}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          height: '92vh',
          maxWidth: 1320,
          background: consentColors.pageBg,
          borderRadius: '16px',
          overflow: 'hidden',
        },
      }}
    >
      <DialogContent
        sx={{
          p: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: consentColors.pageBg,
        }}
      >
        <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {previewTemplate ? (
            <Box
              sx={{
                mx: { xs: 2, md: 3 },
                mt: 2,
                mb: 0,
                px: 2,
                py: 1,
                borderRadius: '10px',
                background: consentColors.badgeBg,
                border: `1px solid ${consentColors.disablePillBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: consentColors.badgeText }}>
                Preview mode — submissions are not recorded
              </Typography>
              <Button onClick={onClose} sx={{ ...outlinedPillButtonSx, py: 0.5, px: 2, fontSize: '0.75rem' }}>
                Close
              </Button>
            </Box>
          ) : null}
          <Box sx={{ px: { xs: 2, md: 3 }, pt: 2 }}>
            <ConsentHeroCard
              hero={template?.hero}
              variables={variables}
              copy={copy}
              isAdmin={false}
              steps={wizardSteps}
              activeStep={activeStep}
              visitedSteps={visitedSteps}
              onStepClick={handleStepClick}
            />
          </Box>

          <Box sx={{ px: { xs: 2, md: 4 }, py: { xs: 3, md: 3.25 } }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {renderStepContent()}

            <Box
              sx={{
                display: 'flex',
                justifyContent: activeStep === 0 ? 'flex-end' : 'space-between',
                mt: 4,
              }}
            >
              {activeStep > 0 && (
                <Button
                  startIcon={<ChevronLeftIcon />}
                  onClick={handleBack}
                  sx={outlinedPillButtonSx}
                >
                  Previous
                </Button>
              )}
              {activeStep < STEPS.length - 1 && (
                <Button
                  endIcon={<ChevronRightIcon />}
                  variant="contained"
                  onClick={handleNext}
                  sx={primaryPillButtonSx}
                >
                  Next
                </Button>
              )}
            </Box>
          </Box>
        </Box>

        <WizardFooter productName={productName} links={copy.footerLinks} />
      </DialogContent>
    </Dialog>
  );
};

const WizardFooter = ({ productName, links = [] }) => {
  const visibleLinks = (links || []).filter((l) => l?.label);
  if (!productName && visibleLinks.length === 0) return null;
  return (
  <Box
    sx={{
      background: consentColors.footerBg,
      py: 1.75,
      px: { xs: 2, md: 4 },
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 2,
      flexShrink: 0,
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {productName ? (
        <Typography sx={{ fontSize: '0.75rem', color: consentColors.footerText, fontWeight: 600 }}>
          {productName}
        </Typography>
      ) : null}
    </Box>
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {visibleLinks.map((link) => (
        <Typography
          key={link.label}
          sx={{ fontSize: '0.7rem', color: consentColors.footerText }}
        >
          {link.label}
        </Typography>
      ))}
    </Box>
  </Box>
  );
};

const CardGridLayout = ({ items, variables, onSeeChoices, intro, banner }) => {
  const enabledItems = items.filter((item) => item.enabled !== false);

  return (
    <Box>
      <StepIntro intro={intro} variables={variables} />

      <Grid container spacing={2}>
        {enabledItems.map((item, index) => {
          const IconComponent = getIconComponent(item.icon);
          return (
            <Grid item xs={12} sm={6} lg={3} size={{ xs: 12, sm: 6, lg: 3 }} key={index}>
              <Card sx={{ ...wizardCardSx, height: '100%', p: 3, minHeight: 200 }}>
                <Box sx={{ ...iconChipSx, mb: 2 }}>
                  <IconComponent sx={{ fontSize: 20, color: consentColors.primaryDark }} />
                </Box>
                <Typography sx={{ ...consentTypography.cardTitle, mb: 1 }}>
                  {resolveTemplateVariables(item.title, variables)}
                </Typography>
                <Typography sx={consentTypography.body}>
                  {resolveTemplateVariables(item.body, variables)}
                </Typography>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {(banner?.title || banner?.body || banner?.cta) && banner?.enabled !== false ? (
      <Card
        sx={{
          ...wizardCardSx,
          mt: 3,
          p: 2.25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: { xs: 'wrap', md: 'nowrap' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              ...iconChipSx,
              width: 36,
              height: 36,
              background: consentColors.badgeBg,
            }}
          >
            <ShieldOutlinedIcon sx={{ fontSize: 18, color: consentColors.badgeText }} />
          </Box>
          <Box>
            {banner.title ? (
              <Typography sx={{ ...consentTypography.cardTitle, mb: 0.25 }}>
                {resolveTemplateVariables(banner.title, variables)}
              </Typography>
            ) : null}
            {banner.body ? (
              <Typography sx={{ ...consentTypography.body, fontSize: '0.8rem' }}>
                {resolveTemplateVariables(banner.body, variables)}
              </Typography>
            ) : null}
          </Box>
        </Box>
        {onSeeChoices && banner.cta ? (
          <Button
            endIcon={<ChevronRightIcon />}
            onClick={onSeeChoices}
            sx={{ ...primaryPillButtonSx, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {banner.cta}
          </Button>
        ) : null}
      </Card>
      ) : null}
    </Box>
  );
};

const ColumnGridLayout = ({ items, variables, intro, callout }) => {
  const enabledItems = items.filter((item) => item.enabled !== false);

  return (
    <Box>
      <StepIntro intro={intro} variables={variables} />

      <Grid container spacing={2}>
        {enabledItems.map((column, index) => (
          <Grid item xs={12} md={4} size={{ xs: 12, md: 4 }} key={index}>
            <Card sx={{ ...wizardCardSx, p: 2.5, height: '100%' }}>
              <Typography sx={{ ...consentTypography.cardTitle, mb: 2 }}>
                {resolveTemplateVariables(column.title, variables)}
              </Typography>
              <Box component="ul" sx={{ pl: 2.25, m: 0 }}>
                {(column.bullets || [])
                  .filter((bullet) => bullet.enabled !== false)
                  .map((bullet, bulletIndex) => (
                    <Box
                      component="li"
                      key={bulletIndex}
                      sx={{
                        ...consentTypography.body,
                        mb: 1.25,
                        '&::marker': { color: consentColors.primaryDark },
                      }}
                    >
                      {resolveTemplateVariables(bullet.text, variables)}
                    </Box>
                  ))}
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>

      {(callout?.title || callout?.body) && callout?.enabled !== false ? (
      <Card
        sx={{
          mt: 3,
          background: consentColors.darkCardBg,
          borderRadius: consentSpacing.cardRadius,
          p: { xs: 2.5, md: 3 },
        }}
      >
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={5} size={{ xs: 12, md: 5 }}>
            {callout.title ? (
              <Typography
                sx={{
                  ...consentTypography.body,
                  color: consentColors.darkCardText,
                  fontWeight: 700,
                  fontSize: '0.95rem',
                }}
              >
                {resolveTemplateVariables(callout.title, variables)}
              </Typography>
            ) : null}
          </Grid>
          <Grid item xs={12} md={7} size={{ xs: 12, md: 7 }}>
            {callout.body ? (
              <Box
                sx={{
                  pl: { md: 3 },
                  borderLeft: {
                    xs: 'none',
                    md: `1px solid rgba(255,255,255,0.18)`,
                  },
                }}
              >
                <Typography sx={{ ...consentTypography.body, color: 'rgba(255,255,255,0.85)' }}>
                  {resolveTemplateVariables(callout.body, variables)}
                </Typography>
              </Box>
            ) : null}
          </Grid>
        </Grid>
      </Card>
      ) : null}
    </Box>
  );
};

const ClauseListLayout = ({ items, variables, intro, version, effectiveDate }) => {
  const enabledItems = items.filter((item) => item.enabled !== false);
  const dateLabel = formatNoticeDate(effectiveDate);

  return (
    <Box>
      <Typography
        sx={{
          ...consentTypography.caption,
          mb: 1.5,
          color: consentColors.stepDotInactiveText,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        VERSION {version || '1.0'} â€¢ {dateLabel}
      </Typography>
      <Typography sx={{ ...consentTypography.h1, mb: 3 }}>
        {resolveTemplateVariables(intro?.heading, variables)}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {enabledItems.map((clause, index) => (
          <Card key={index} sx={{ ...wizardCardSx, p: 2.5 }}>
            <Typography
              sx={{ ...consentTypography.cardTitle, color: consentColors.primaryDark, mb: 1.25 }}
            >
              {clause.clauseNumber}. {resolveTemplateVariables(clause.title, variables)}
            </Typography>
            <Typography sx={consentTypography.body}>
              {resolveTemplateVariables(clause.body, variables)}
            </Typography>
          </Card>
        ))}
      </Box>
    </Box>
  );
};

const YourChoicesLayout = ({
  intro,
  variables,
  items = [],
  rights = [],
  rightsHeading,
  onOpenConsent,
  onContinueWithoutConsent,
  onRequestAlternative,
}) => {
  const actionMap = {
    open_consent: onOpenConsent,
    continue_without: onContinueWithoutConsent,
    request_alternative: onRequestAlternative,
  };

  return (
    <Box>
      <StepIntro intro={intro} variables={variables} />

      <Grid container spacing={2.5}>
        {items.map((item, index) => (
          <Grid item xs={12} md={4} size={{ xs: 12, md: 4 }} key={index}>
            <Card
              sx={{
                ...wizardCardSx,
                p: 3,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Typography
                sx={{
                  fontSize: '1.35rem',
                  fontWeight: 700,
                  color: consentColors.primaryDark,
                  mb: 1.5,
                }}
              >
                {String(index + 1).padStart(2, '0')}
              </Typography>
              {item.title ? (
                <Typography sx={{ ...consentTypography.cardTitle, mb: 1.25 }}>
                  {resolveTemplateVariables(item.title, variables)}
                </Typography>
              ) : null}
              {item.body ? (
                <Typography sx={{ ...consentTypography.body, mb: 3, flex: 1 }}>
                  {resolveTemplateVariables(item.body, variables)}
                </Typography>
              ) : null}
              {item.cta ? (
                <Button
                  fullWidth
                  variant="contained"
                  onClick={actionMap[item.action] || undefined}
                  disabled={!actionMap[item.action]}
                  sx={primaryPillButtonSx}
                >
                  {item.cta}
                </Button>
              ) : null}
              {item.caption ? (
                <Typography sx={{ ...consentTypography.caption, mt: 1, textAlign: 'center' }}>
                  {resolveTemplateVariables(item.caption, variables)}
                </Typography>
              ) : null}
            </Card>
          </Grid>
        ))}
      </Grid>

      {rights.filter((r) => r.enabled !== false && r.label).length > 0 && (
        <Card sx={{ ...wizardCardSx, mt: 3, p: 3 }}>
          {rightsHeading ? (
            <Typography sx={{ ...consentTypography.cardTitle, mb: 2 }}>
              {resolveTemplateVariables(rightsHeading, variables)}
            </Typography>
          ) : null}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
            {rights
              .filter((right) => right.enabled !== false)
              .map((right, index) => (
                <Chip
                  key={index}
                  label={right.label}
                  size="small"
                  sx={{
                    background: consentColors.pageBg,
                    color: consentColors.bodyText,
                    border: `1px solid ${consentColors.cardBorder}`,
                    borderRadius: consentSpacing.pillRadius,
                    fontWeight: 500,
                  }}
                />
              ))}
          </Box>
        </Card>
      )}
    </Box>
  );
};

const ConsentFormLayout = ({
  intro,
  checkboxes,
  checkboxStates,
  onCheckboxChange,
  guardian,
  onGuardianChange,
  variables,
  submitted,
  canSubmit,
  submitting,
  onProvideConsent,
  onContinueWithoutConsent,
}) => {
  const enabledCheckboxes = checkboxes.filter((cb) => cb.enabled !== false);

  return (
    <Box>
      <StepIntro intro={intro} variables={variables} />

      <Card sx={{ ...wizardCardSx, p: { xs: 2.5, md: 3.5 } }}>
        <ConsentFieldsGrid guardian={guardian} onGuardianChange={onGuardianChange} />

        <Divider sx={{ my: 3, borderColor: consentColors.divider }} />

        <Box>
          {enabledCheckboxes.map((checkbox) => (
            <Box
              key={checkbox.id}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.25,
                py: 1.5,
                borderBottom: `1px solid ${consentColors.divider}`,
                '&:last-of-type': { borderBottom: 'none' },
              }}
            >
              <Checkbox
                checked={checkboxStates[checkbox.id] || false}
                onChange={(e) => onCheckboxChange(checkbox.id, e.target.checked)}
                required={checkbox.required}
                sx={{
                  color: consentColors.stepDotInactiveBorder,
                  '&.Mui-checked': { color: consentColors.primaryDark },
                  mt: -0.5,
                }}
              />
              <Typography sx={{ ...consentTypography.body, pt: 0.6 }}>
                {renderRichLabel(checkbox.label, variables)}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1.5,
            mt: 3,
          }}
        >
          <Button
            variant="contained"
            onClick={onProvideConsent}
            disabled={!canSubmit || submitting}
            sx={{ ...primaryPillButtonSx, minWidth: 180 }}
          >
            {submitting ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Provide consent'}
          </Button>
          {onContinueWithoutConsent && (
          <Button
            variant="outlined"
            onClick={onContinueWithoutConsent}
            disabled={submitting}
            sx={{
              ...outlinedPillButtonSx,
              border: `1.5px solid ${consentColors.cardBorder}`,
              color: consentColors.primaryText,
            }}
          >
            Continue without consent
          </Button>
          )}
        </Box>
      </Card>

      {submitted && <SuccessBanner />}
    </Box>
  );
};

export default ConsentWizard;
