import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  TextField,
  IconButton,
  Card,
  Grid,
  Alert,
  CircularProgress,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Checkbox,
  FormControlLabel,
  Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import api from '../../api/axios';
import {
  consentColors,
  consentTypography,
  consentSpacing,
  consentLayout,
  CONSENT_STEPS,
  CHOICE_ACTIONS,
  toVariables,
  formatNoticeDate,
  getStepIntro,
  wizardCardSx,
  disablePillSx,
  primaryPillButtonSx,
  outlinedPillButtonSx,
  dashedAddSx,
  fieldSx,
  iconChipSx,
} from '../../theme/consentWizardTheme';
import {
  ConsentHeroCard,
  StepIntro,
  ConsentFieldsGrid,
  InlineField,
  IconPicker,
} from '../../components/onboarding/ConsentWizardChrome';
import ConsentWizard from '../../components/onboarding/ConsentWizard';

const STEPS = CONSENT_STEPS.map((s, i) => ({ ...s, order: i + 1 }));

const getDefaultLayout = (stepKey) => {
  const layoutMap = {
    at_a_glance: 'card_grid',
    what_we_collect: 'column_grid',
    your_choices: 'card_grid',
    full_notice: 'clause_list',
    consent: 'consent_form',
  };
  return layoutMap[stepKey] || 'card_grid';
};

const emptyCopy = () => ({
  preparedForLabel: '',
  optionalBanner: { title: '', body: '', cta: '', enabled: true },
  callout: { title: '', body: '', enabled: true },
  guardianRightsHeading: '',
  footerLinks: [],
});

const mergeSteps = (existing = []) =>
  STEPS.map((s) => {
    const found = existing.find((x) => x.key === s.key);
    if (found) {
      return {
        ...found,
        title: found.title || s.label,
        intro: found.intro || { eyebrow: '', heading: '', subheading: '' },
        items: found.items || [],
      };
    }
    return {
      key: s.key,
      order: s.order,
      title: s.label,
      layout: getDefaultLayout(s.key),
      intro: { eyebrow: '', heading: '', subheading: '' },
      items: [],
    };
  });

const PolicyTemplateEditorPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    console.log('=== PolicyTemplateEditorPage Debug ===');
    console.log('URL:', window.location.pathname);
    console.log('ID from useParams:', id);
    console.log('ID type:', typeof id);
    console.log('ID === undefined:', id === undefined);
    console.log('ID === "undefined":', id === 'undefined');
    console.log('=====================================');

    if (id && id !== 'create') {
      loadTemplate();
    } else {
      setTemplate({
        name: '',
        version: '1.0',
        effectiveDate: new Date().toISOString().split('T')[0],
        sourceType: 'manual',
        hero: {
          badge: '',
          title: '',
          titleHighlight: '',
          body: '',
          imageUrl: '',
        },
        steps: mergeSteps([]),
        consentCheckboxes: [],
        guardianRights: [],
        variables: { schoolName: '', productName: '', privacyEmail: '', examContact: '' },
        copy: emptyCopy(),
        status: 'draft',
      });
      setLoading(false);
    }
  }, [id]);

  const loadTemplate = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/policy-templates/${id}`);
      const loaded = data.template;
      const mergedSteps = mergeSteps(loaded.steps);
      setTemplate({
        ...loaded,
        steps: mergedSteps,
        copy: { ...emptyCopy(), ...(loaded.copy || {}) },
        hero: loaded.hero || { badge: '', title: '', titleHighlight: '', body: '', imageUrl: '' },
      });
      if ((loaded.steps || []).length !== mergedSteps.length) {
        autosave({ steps: mergedSteps });
      }
    } catch (error) {
      console.error('Failed to load template:', error);
    } finally {
      setLoading(false);
    }
  };

  const autosave = async (updates) => {
    if (!id || id === 'create' || id === 'undefined') return;

    setSaving(true);
    try {
      await api.patch(`/policy-templates/${id}`, updates);
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (error) {
      console.error('Autosave failed:', error);
      setSaveStatus('Error saving');
      setTimeout(() => setSaveStatus(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleHeroChange = (field, value) => {
    const updatedHero = { ...(template.hero || {}), [field]: value };
    setTemplate({ ...template, hero: updatedHero });
  };

  const handleHeroBlur = () => {
    if (id && id !== 'create' && id !== 'undefined') {
      autosave({ hero: template.hero });
    }
  };

  const persistHeroImage = (imageUrl) => {
    setTemplate((prev) => {
      const updatedHero = { ...(prev.hero || {}), imageUrl: imageUrl || '' };
      queueMicrotask(() => {
        if (id && id !== 'create' && id !== 'undefined') {
          autosave({ hero: updatedHero });
        }
      });
      return { ...prev, hero: updatedHero };
    });
  };

  const handleReplaceHeroImage = async (file) => {
    const formData = new FormData();
    formData.append('heroImage', file);
    if (template.hero?.imageUrl) {
      formData.append('oldImageUrl', template.hero.imageUrl);
    }
    const { data } = await api.post('/policy-templates/upload-hero-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const imageUrl = data?.imageUrl;
    if (!imageUrl) throw new Error('Upload did not return an image URL');
    persistHeroImage(imageUrl);
    return imageUrl;
  };

  const handleHeroImageSaved = (imageUrl) => {
    persistHeroImage(imageUrl);
  };

  const handleVariableChange = (key, value) => {
    const vars = { ...toVariables(template.variables), [key]: value };
    setTemplate({ ...template, variables: vars });
  };

  const handleVariableBlur = () => {
    if (id && id !== 'create' && id !== 'undefined') {
      autosave({ variables: toVariables(template.variables) });
    }
  };

  const commitCopy = (nextCopy) => {
    setTemplate({ ...template, copy: nextCopy });
    if (id && id !== 'create' && id !== 'undefined') {
      autosave({ copy: nextCopy });
    }
  };

  const handleCopyChange = (field, value) => {
    commitCopy({ ...(template.copy || emptyCopy()), [field]: value });
  };

  const handleBannerChange = (field, value) => {
    const copy = template.copy || emptyCopy();
    commitCopy({
      ...copy,
      optionalBanner: { ...(copy.optionalBanner || {}), [field]: value },
    });
  };

  const handleCalloutChange = (field, value) => {
    const copy = template.copy || emptyCopy();
    commitCopy({
      ...copy,
      callout: { ...(copy.callout || {}), [field]: value },
    });
  };

  const handleIntroChange = (field, value) => {
    if (!currentStep) return;
    updateStepContent(currentStep.key, {
      intro: { ...(currentStep.intro || {}), [field]: value },
    });
  };

  const handleStepLabelChange = (index, value) => {
    const stepKey = STEPS[index]?.key;
    if (!stepKey) return;
    updateStepContent(stepKey, { title: value });
  };

  const handleCreate = async () => {
    if (!template.name || template.name.trim() === '') {
      setSaveStatus('Template name is required');
      setTimeout(() => setSaveStatus(''), 3000);
      return;
    }

    try {
      console.log('Creating template:', template);
      const { data } = await api.post('/policy-templates', template);
      console.log('Template created:', data.template);
      console.log('Navigating to:', `/admin/policy-templates/${data.template._id}/edit`);
      navigate(`/admin/policy-templates/${data.template._id}/edit`);
    } catch (error) {
      console.error('Failed to create template:', error);
      setSaveStatus('Error creating template');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const handlePublish = async () => {
    if (!id || id === 'create' || id === 'undefined') {
      setSaveStatus('Cannot publish: Invalid template ID');
      setTimeout(() => setSaveStatus(''), 3000);
      return;
    }

    try {
      await api.post(`/policy-templates/${id}/publish`);
      navigate('/admin/policies?tab=5');
    } catch (error) {
      console.error('Failed to publish:', error);
      setSaveStatus('Error publishing template');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const handleBack = () => {
    navigate('/admin/policies?tab=5');
  };

  const currentStep = template?.steps?.find((s) => s.key === STEPS[activeStepIndex]?.key);

  const updateStepContent = (stepKey, updates) => {
    const updatedSteps = [...(template.steps || [])];
    const stepIndex = updatedSteps.findIndex((s) => s.key === stepKey);

    if (stepIndex >= 0) {
      updatedSteps[stepIndex] = { ...updatedSteps[stepIndex], ...updates };
    } else {
      updatedSteps.push({
        key: stepKey,
        order: STEPS.find((s) => s.key === stepKey)?.order || updatedSteps.length + 1,
        title: STEPS.find((s) => s.key === stepKey)?.label || 'Step',
        layout: getDefaultLayout(stepKey),
        items: [],
        ...updates,
      });
    }

    setTemplate({ ...template, steps: updatedSteps });
    if (id && id !== 'create' && id !== 'undefined') {
      autosave({ steps: updatedSteps });
    }
  };

  const updateStepItems = (stepKey, items) => {
    updateStepContent(stepKey, { items });
  };

  const updateGuardianRights = (rights) => {
    setTemplate({ ...template, guardianRights: rights });
    if (id && id !== 'create' && id !== 'undefined') {
      autosave({ guardianRights: rights });
    }
  };

  const updateConsentCheckboxes = (checkboxes) => {
    setTemplate({ ...template, consentCheckboxes: checkboxes });
    if (id && id !== 'create' && id !== 'undefined') {
      autosave({ consentCheckboxes: checkboxes });
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!template) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">Template not found</Alert>
      </Box>
    );
  }

  const variables = toVariables(template.variables);
  const visitedSteps = new Set(Array.from({ length: activeStepIndex + 1 }, (_, i) => i));
  const intro = getStepIntro(currentStep, STEPS[activeStepIndex]?.key, { useFallback: false });
  const stepperSteps = STEPS.map((s) => {
    const saved = template.steps?.find((x) => x.key === s.key);
    return { key: s.key, label: saved?.title || s.label, order: s.order };
  });

  return (
    <Box sx={{ background: consentColors.pageBg, minHeight: '100vh', width: '100%', pb: 4 }}>
      <Box
        sx={{
          px: consentLayout.editorPadX,
          py: { xs: 1.5, md: 2 },
          width: '100%',
          maxWidth: consentLayout.pageMaxWidth,
          boxSizing: 'border-box',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2.5,
            gap: 2,
            background: consentColors.cardBg,
            border: `1px solid ${consentColors.cardBorder}`,
            borderRadius: '14px',
            px: { xs: 1.5, md: 2.5 },
            py: 1.75,
            boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flex: 1, minWidth: 0 }}>
            <IconButton onClick={handleBack} sx={{ mt: 0.25 }}>
              <ArrowBackIcon />
            </IconButton>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {id === 'create' || !id || id === 'undefined' ? (
                <TextField
                  fullWidth
                  label="Template Name *"
                  value={template.name}
                  onChange={(e) => setTemplate({ ...template, name: e.target.value })}
                  placeholder="e.g., Data Privacy Notice"
                  size="small"
                  required
                  sx={{ ...fieldSx, maxWidth: 400 }}
                />
              ) : (
                <Box>
                  <Typography
                    sx={{
                      fontSize: { xs: '1.35rem', md: '1.5rem' },
                      fontWeight: 700,
                      color: consentColors.primaryText,
                      lineHeight: 1.2,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    Consent page
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: consentColors.bodyText, mt: 0.35 }}>
                    Admin · {template.name || 'Consent page'}
                  </Typography>
                  <Box sx={{ mt: 0.75 }}>
                    <Chip
                      label={template.status}
                      size="small"
                      sx={{
                        height: 22,
                        fontWeight: 700,
                        fontSize: '0.68rem',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        background:
                          template.status === 'active'
                            ? '#E8F5E9'
                            : template.status === 'draft'
                              ? consentColors.badgeBg
                              : '#F3F4F6',
                        color:
                          template.status === 'active'
                            ? '#2E7D32'
                            : template.status === 'draft'
                              ? consentColors.badgeText
                              : consentColors.bodyText,
                      }}
                    />
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {saveStatus && (
              <Typography
                variant="body2"
                color={
                  saveStatus.includes('Error') ||
                  saveStatus.includes('required') ||
                  saveStatus.includes('Invalid') ||
                  saveStatus.includes('Cannot')
                    ? 'error.main'
                    : 'success.main'
                }
              >
                {saving ? 'Saving...' : saveStatus}
              </Typography>
            )}
            {id === 'create' || !id || id === 'undefined' ? (
              <Button variant="contained" onClick={handleCreate} sx={primaryPillButtonSx}>
                Create Template
              </Button>
            ) : (
              <>
                <Button
                  variant="outlined"
                  startIcon={<VisibilityOutlinedIcon />}
                  onClick={() => setPreviewOpen(true)}
                  sx={outlinedPillButtonSx}
                >
                  Preview
                </Button>
                <Button variant="contained" onClick={handlePublish} sx={primaryPillButtonSx}>
                  Publish
                </Button>
              </>
            )}
          </Box>
        </Box>

        <ConsentHeroCard
          hero={template.hero}
          variables={variables}
          copy={template.copy}
          isAdmin
          onReplaceImage={handleReplaceHeroImage}
          onHeroChange={handleHeroChange}
          onHeroBlur={handleHeroBlur}
          onHeroImageSaved={handleHeroImageSaved}
          onVariableChange={handleVariableChange}
          onVariableBlur={handleVariableBlur}
          onCopyChange={handleCopyChange}
          steps={stepperSteps}
          activeStep={activeStepIndex}
          visitedSteps={visitedSteps}
          onStepClick={setActiveStepIndex}
          onStepLabelChange={handleStepLabelChange}
        />

        <Box sx={{ mt: 3, py: 1 }}>
          {currentStep ? (
            <Box>
              {currentStep.layout === 'card_grid' && (
                <CardGridEditor
                  items={currentStep.items || []}
                  stepKey={currentStep.key}
                  onUpdate={(items) => updateStepItems(currentStep.key, items)}
                  intro={intro}
                  variables={variables}
                  onIntroChange={handleIntroChange}
                  copy={template.copy}
                  onBannerChange={handleBannerChange}
                />
              )}

              {currentStep.layout === 'column_grid' && (
                <ColumnGridEditor
                  items={currentStep.items || []}
                  stepKey={currentStep.key}
                  onUpdate={(items) => updateStepItems(currentStep.key, items)}
                  intro={intro}
                  variables={variables}
                  onIntroChange={handleIntroChange}
                  copy={template.copy}
                  onCalloutChange={handleCalloutChange}
                />
              )}

              {currentStep.layout === 'clause_list' && (
                <ClauseListEditor
                  items={currentStep.items || []}
                  stepKey={currentStep.key}
                  onUpdate={(items) => updateStepItems(currentStep.key, items)}
                  template={template}
                  intro={intro}
                  onIntroChange={handleIntroChange}
                />
              )}

              {currentStep.layout === 'consent_form' && (
                <ConsentFormEditor
                  checkboxes={template.consentCheckboxes || []}
                  onUpdate={updateConsentCheckboxes}
                  intro={intro}
                  variables={variables}
                  onIntroChange={handleIntroChange}
                  copy={template.copy}
                  onCopyChange={handleCopyChange}
                />
              )}

              {currentStep.key === 'your_choices' && (
                <GuardianRightsEditor
                  rights={template.guardianRights || []}
                  onUpdate={updateGuardianRights}
                  heading={template.copy?.guardianRightsHeading || ''}
                  onHeadingChange={(v) => handleCopyChange('guardianRightsHeading', v)}
                />
              )}
            </Box>
          ) : (
            <Box sx={{ maxWidth: 900, mx: 'auto' }}>
              <Alert severity="warning" sx={{ mb: 2 }}>
                No content for this step yet. This step needs to be configured.
              </Alert>
              <Typography variant="body2" color="text.secondary">
                Step: {STEPS[activeStepIndex]?.label} ({STEPS[activeStepIndex]?.key})
              </Typography>
              <Button
                variant="contained"
                sx={{ mt: 2, ...primaryPillButtonSx }}
                disabled={initializing}
                onClick={() => {
                  setInitializing(true);
                  const stepKey = STEPS[activeStepIndex]?.key;
                  updateStepContent(stepKey, {});
                  setTimeout(() => setInitializing(false), 500);
                }}
              >
                {initializing ? 'Initializing...' : 'Initialize Step'}
              </Button>
            </Box>
          )}

          <Box
            sx={{
              display: 'flex',
              justifyContent: activeStepIndex === 0 ? 'flex-end' : 'space-between',
              mt: 4,
            }}
          >
            {activeStepIndex > 0 && (
              <Button
                startIcon={<ChevronLeftIcon />}
                onClick={() => setActiveStepIndex((i) => Math.max(0, i - 1))}
                sx={outlinedPillButtonSx}
              >
                Previous
              </Button>
            )}
            {activeStepIndex < STEPS.length - 1 && (
              <Button
                endIcon={<ChevronRightIcon />}
                variant="contained"
                onClick={() => setActiveStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
                sx={primaryPillButtonSx}
              >
                Next
              </Button>
            )}
          </Box>
        </Box>
      </Box>
      <ConsentWizard
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        previewTemplate={template}
      />
    </Box>
  );
};

const CardGridEditor = ({
  items,
  stepKey,
  onUpdate,
  intro,
  variables,
  onIntroChange,
  copy,
  onBannerChange,
}) => {
  const isChoices = stepKey === 'your_choices';
  const banner = copy?.optionalBanner || {};

  const handleAddCard = () => {
    onUpdate([
      ...items,
      isChoices
        ? { title: '', body: '', cta: '', caption: '', action: 'none', enabled: true }
        : { icon: 'shield', title: '', body: '', enabled: true },
    ]);
  };

  const handleUpdateCard = (index, field, value) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate(updated);
  };

  const handleToggleEnabled = (index) => {
    const updated = [...items];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    onUpdate(updated);
  };

  const handleDeleteCard = (index) => {
    onUpdate(items.filter((_, i) => i !== index));
  };

  if (isChoices) {
    return (
      <Box>
        <StepIntro intro={intro} variables={variables} editable onIntroChange={onIntroChange} />
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
                  opacity: item.enabled === false ? 0.55 : 1,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Typography
                    sx={{ fontSize: '1.35rem', fontWeight: 700, color: consentColors.primaryDark, mb: 1.5 }}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </Typography>
                  <Chip
                    label={item.enabled === false ? 'Enable' : 'Disable'}
                    size="small"
                    onClick={() => handleToggleEnabled(index)}
                    sx={disablePillSx}
                  />
                </Box>
                <InlineField
                  value={item.title || ''}
                  onChange={(v) => handleUpdateCard(index, 'title', v)}
                  placeholder="Choice title"
                  typeSx={consentTypography.cardTitle}
                  sx={{ mb: 1 }}
                />
                <InlineField
                  value={item.body || ''}
                  onChange={(v) => handleUpdateCard(index, 'body', v)}
                  placeholder="Choice description"
                  multiline
                  minRows={2}
                  typeSx={consentTypography.body}
                  sx={{ mb: 2, flex: 1 }}
                />
                <InlineField
                  value={item.cta || ''}
                  onChange={(v) => handleUpdateCard(index, 'cta', v)}
                  placeholder="Button label"
                  typeSx={{ fontWeight: 600, color: consentColors.primaryDark, textAlign: 'center' }}
                  sx={{
                    mb: 1,
                    border: `1.5px solid ${consentColors.primaryDark}`,
                    borderRadius: consentSpacing.pillRadius,
                    px: 2,
                    py: 1,
                    '& input': { textAlign: 'center' },
                  }}
                />
                <InlineField
                  value={item.caption || ''}
                  onChange={(v) => handleUpdateCard(index, 'caption', v)}
                  placeholder="Optional caption"
                  typeSx={{ ...consentTypography.caption, textAlign: 'center' }}
                  sx={{ '& input': { textAlign: 'center' }, mb: 1.5 }}
                />
                <FormControl size="small" fullWidth sx={{ mb: 1 }}>
                  <InputLabel>Action</InputLabel>
                  <Select
                    label="Action"
                    value={item.action || 'none'}
                    onChange={(e) => handleUpdateCard(index, 'action', e.target.value)}
                  >
                    {CHOICE_ACTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => handleDeleteCard(index)} color="error">
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
        <Button startIcon={<AddIcon />} onClick={handleAddCard} sx={{ ...dashedAddSx, mt: 2 }}>
          + Add new card
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <StepIntro intro={intro} variables={variables} editable onIntroChange={onIntroChange} />
      <Grid container spacing={2.5}>
        {items.map((item, index) => (
            <Grid item xs={12} sm={6} lg={3} size={{ xs: 12, sm: 6, lg: 3 }} key={index}>
              <Card
                sx={{
                  ...wizardCardSx,
                  height: '100%',
                  minHeight: 200,
                  p: 2.25,
                  opacity: item.enabled === false ? 0.55 : 1,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.75 }}>
                  <IconPicker
                    value={item.icon || 'shield'}
                    onChange={(v) => handleUpdateCard(index, 'icon', v)}
                  />
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <Chip
                      label={item.enabled === false ? 'Enable' : 'Disable'}
                      size="small"
                      onClick={() => handleToggleEnabled(index)}
                      sx={disablePillSx}
                    />
                    <IconButton size="small" onClick={() => handleDeleteCard(index)} color="error">
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                </Box>
                <InlineField
                  value={item.title || ''}
                  onChange={(v) => handleUpdateCard(index, 'title', v)}
                  placeholder="Card title"
                  typeSx={consentTypography.cardTitle}
                  sx={{ mb: 1 }}
                />
                <InlineField
                  value={item.body || ''}
                  onChange={(v) => handleUpdateCard(index, 'body', v)}
                  placeholder="Card body"
                  multiline
                  minRows={2}
                  typeSx={consentTypography.body}
                />
              </Card>
            </Grid>
        ))}
        <Grid item xs={12} sm={6} lg={3} size={{ xs: 12, sm: 6, lg: 3 }}>
          <Box
            onClick={handleAddCard}
            sx={{
              height: '100%',
              minHeight: 160,
              border: `1.5px dashed ${consentColors.cardBorder}`,
              borderRadius: consentSpacing.cardRadius,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: consentColors.bodyText,
              '&:hover': { background: 'rgba(229, 57, 53, 0.04)' },
            }}
          >
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>+ Add new card</Typography>
          </Box>
        </Grid>
      </Grid>
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
          <Box sx={{ ...iconChipSx, width: 36, height: 36, background: consentColors.badgeBg }}>
            <ShieldOutlinedIcon sx={{ fontSize: 18, color: consentColors.badgeText }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <InlineField
              value={banner.title || ''}
              onChange={(v) => onBannerChange?.('title', v)}
              placeholder="Banner title"
              typeSx={consentTypography.cardTitle}
              sx={{ mb: 0.25 }}
            />
            <InlineField
              value={banner.body || ''}
              onChange={(v) => onBannerChange?.('body', v)}
              placeholder="Banner body"
              multiline
              typeSx={{ ...consentTypography.body, fontSize: '0.8rem' }}
            />
          </Box>
        </Box>
        <InlineField
          value={banner.cta || ''}
          onChange={(v) => onBannerChange?.('cta', v)}
          placeholder="Button label"
          typeSx={{ fontWeight: 600, color: '#fff', textAlign: 'center' }}
          sx={{
            ...primaryPillButtonSx,
            minWidth: 160,
            '& input': { textAlign: 'center', color: '#fff', fontWeight: 600 },
          }}
        />
      </Card>
    </Box>
  );
};

const ColumnGridEditor = ({ items, stepKey, onUpdate, intro, variables, onIntroChange, copy, onCalloutChange }) => {
  void stepKey;
  const handleAddColumn = () => {
    onUpdate([...items, { title: '', bullets: [], enabled: true }]);
  };

  const handleUpdateColumn = (index, field, value) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate(updated);
  };

  const handleAddBullet = (columnIndex) => {
    const updated = [...items];
    const bullets = [...(updated[columnIndex].bullets || [])];
    bullets.push({ text: '', enabled: true });
    updated[columnIndex] = { ...updated[columnIndex], bullets };
    onUpdate(updated);
  };

  const handleUpdateBullet = (columnIndex, bulletIndex, field, value) => {
    const updated = [...items];
    const bullets = [...(updated[columnIndex].bullets || [])];
    bullets[bulletIndex] = { ...bullets[bulletIndex], [field]: value };
    updated[columnIndex] = { ...updated[columnIndex], bullets };
    onUpdate(updated);
  };

  const handleDeleteBullet = (columnIndex, bulletIndex) => {
    const updated = [...items];
    const bullets = (updated[columnIndex].bullets || []).filter((_, i) => i !== bulletIndex);
    updated[columnIndex] = { ...updated[columnIndex], bullets };
    onUpdate(updated);
  };

  const handleDeleteColumn = (index) => {
    onUpdate(items.filter((_, i) => i !== index));
  };

  const handleToggleEnabled = (index) => {
    const updated = [...items];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    onUpdate(updated);
  };

  return (
    <Box>
      <StepIntro intro={intro} variables={variables} editable onIntroChange={onIntroChange} />
      <Grid container spacing={2}>
        {items.map((column, columnIndex) => (
          <Grid item xs={12} md={4} size={{ xs: 12, md: 4 }} key={columnIndex}>
            <Card sx={{ ...wizardCardSx, p: 2.5, opacity: column.enabled === false ? 0.55 : 1, height: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5, alignItems: 'flex-start', gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  value={column.title || ''}
                  onChange={(e) => handleUpdateColumn(columnIndex, 'title', e.target.value)}
                  placeholder={`Column ${columnIndex + 1}`}
                  variant="standard"
                  InputProps={{ disableUnderline: true }}
                  sx={{ '& input': { ...consentTypography.cardTitle, p: 0 } }}
                />
                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                  <Chip
                    label={column.enabled === false ? 'Enable' : 'Disable'}
                    size="small"
                    onClick={() => handleToggleEnabled(columnIndex)}
                    sx={disablePillSx}
                  />
                  <IconButton size="small" onClick={() => handleDeleteColumn(columnIndex)} color="error">
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              </Box>
              <Box sx={{ m: 0, mb: 1 }}>
                {(column.bullets || []).map((bullet, bulletIndex) => (
                  <Box key={bulletIndex} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 0.75 }}>
                    <Typography sx={{ color: consentColors.primaryDark, mt: 0.7, fontSize: '0.9rem' }}>•</Typography>
                    <TextField
                      fullWidth
                      size="small"
                      value={bullet.text || ''}
                      onChange={(e) => handleUpdateBullet(columnIndex, bulletIndex, 'text', e.target.value)}
                      placeholder="Bullet text"
                      variant="standard"
                      InputProps={{ disableUnderline: true }}
                      multiline
                      sx={{ '& textarea': { ...consentTypography.body, p: 0 } }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteBullet(columnIndex, bulletIndex)}
                      sx={{ color: consentColors.disablePillText, p: 0.25, mt: 0.25 }}
                    >
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => handleAddBullet(columnIndex)}
                sx={{ ...dashedAddSx, px: 1.5, fontSize: '0.75rem', mt: 1 }}
              >
                + Add bullet
              </Button>
            </Card>
          </Grid>
        ))}
      </Grid>
      <Button startIcon={<AddIcon />} onClick={handleAddColumn} sx={{ ...dashedAddSx, mt: 2 }}>
        + Add new card
      </Button>
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
            <InlineField
              value={copy?.callout?.title || ''}
              onChange={(v) => onCalloutChange?.('title', v)}
              placeholder="Callout title"
              multiline
              typeSx={{ ...consentTypography.body, color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}
            />
          </Grid>
          <Grid item xs={12} md={7} size={{ xs: 12, md: 7 }}>
            <Box sx={{ pl: { md: 3 }, borderLeft: { xs: 'none', md: '1px solid rgba(255,255,255,0.18)' } }}>
              <InlineField
                value={copy?.callout?.body || ''}
                onChange={(v) => onCalloutChange?.('body', v)}
                placeholder="Callout body"
                multiline
                minRows={2}
                typeSx={{ ...consentTypography.body, color: 'rgba(255,255,255,0.85)' }}
              />
            </Box>
          </Grid>
        </Grid>
      </Card>
    </Box>
  );
};

const ClauseListEditor = ({ items, stepKey, onUpdate, template, intro, onIntroChange }) => {
  void stepKey;
  const [collapsed, setCollapsed] = useState({});
  const [newClauseTitle, setNewClauseTitle] = useState('');
  const [newClauseBody, setNewClauseBody] = useState('');
  const templateVersion = template?.version || '1.0';
  const effectiveDate = formatNoticeDate(template?.effectiveDate);

  const handleAddClause = () => {
    if (!newClauseTitle.trim()) return;
    onUpdate([
      ...items,
      { clauseNumber: items.length + 1, title: newClauseTitle, body: newClauseBody, enabled: true },
    ]);
    setNewClauseTitle('');
    setNewClauseBody('');
  };

  const handleUpdateClause = (index, field, value) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate(updated);
  };

  const handleToggleEnabled = (index) => {
    const updated = [...items];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    onUpdate(updated);
  };

  const handleDeleteClause = (index) => {
    const updated = items.filter((_, i) => i !== index);
    updated.forEach((clause, i) => {
      clause.clauseNumber = i + 1;
    });
    onUpdate(updated);
  };

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
        VERSION {templateVersion} • {effectiveDate}
      </Typography>
      <StepIntro intro={intro} editable onIntroChange={onIntroChange} />

      {items.map((clause, index) => {
        const isCollapsed = !!collapsed[index];
        return (
          <Card key={index} sx={{ mb: 1.5, p: 2.5, ...wizardCardSx, opacity: clause.enabled === false ? 0.55 : 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5 }}>
              <TextField
                fullWidth
                size="small"
                value={clause.title ? `${clause.clauseNumber}. ${clause.title}` : `${clause.clauseNumber}. Untitled Clause`}
                onChange={(e) => handleUpdateClause(index, 'title', e.target.value.replace(/^\d+\.\s*/, ''))}
                variant="standard"
                InputProps={{ disableUnderline: true }}
                sx={{ '& input': { ...consentTypography.cardTitle, color: consentColors.primaryDark, p: 0 } }}
              />
              <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                <Chip
                  label={clause.enabled === false ? 'Enable' : 'Disable'}
                  size="small"
                  onClick={() => handleToggleEnabled(index)}
                  sx={disablePillSx}
                />
                <IconButton
                  size="small"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [index]: !prev[index] }))}
                  sx={{
                    background: consentColors.plusGreen,
                    color: '#fff',
                    width: 28,
                    height: 28,
                    '&:hover': { background: consentColors.plusGreenHover },
                  }}
                >
                  <AddIcon
                    sx={{
                      fontSize: 18,
                      transform: isCollapsed ? 'rotate(0deg)' : 'rotate(45deg)',
                      transition: '0.2s',
                    }}
                  />
                </IconButton>
                <IconButton size="small" onClick={() => handleDeleteClause(index)} color="error">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
            {!isCollapsed && (
              <TextField
                fullWidth
                multiline
                minRows={3}
                value={clause.body || ''}
                onChange={(e) => handleUpdateClause(index, 'body', e.target.value)}
                variant="standard"
                InputProps={{ disableUnderline: true }}
                placeholder="Section body"
                sx={{ mt: 1.5, '& textarea': { ...consentTypography.body, p: 0 } }}
              />
            )}
          </Card>
        );
      })}

      <Card sx={{ ...wizardCardSx, p: 2.5, mt: 2 }}>
        <Typography sx={{ ...consentTypography.cardTitle, mb: 2 }}>Add new notice section</Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="Section title"
          value={newClauseTitle}
          onChange={(e) => setNewClauseTitle(e.target.value)}
          sx={{ mb: 2, ...fieldSx }}
        />
        <TextField
          fullWidth
          multiline
          rows={4}
          placeholder="Section body"
          value={newClauseBody}
          onChange={(e) => setNewClauseBody(e.target.value)}
          sx={{ mb: 2, ...fieldSx }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            onClick={handleAddClause}
            disabled={!newClauseTitle.trim()}
            sx={{ ...primaryPillButtonSx, borderRadius: '8px' }}
          >
            Add section
          </Button>
        </Box>
      </Card>
    </Box>
  );
};

const ConsentFormEditor = ({ checkboxes, onUpdate, intro, variables, onIntroChange, copy, onCopyChange }) => {
  const [newCheckboxLabel, setNewCheckboxLabel] = useState('');
  const previewGuardian = {
    studentFullName: '',
    studentAdmissionId: '',
    guardianName: '',
    relationship: '',
    guardianEmail: '',
    guardianMobile: { countryCode: '+966', number: '' },
    remark: '',
  };

  const handleAddCheckbox = () => {
    if (!newCheckboxLabel.trim()) return;
    onUpdate([
      ...checkboxes,
      {
        id: `checkbox_${Date.now()}`,
        order: checkboxes.length + 1,
        label: newCheckboxLabel,
        required: true,
        category: 'general',
        enabled: true,
      },
    ]);
    setNewCheckboxLabel('');
  };

  const handleUpdateCheckbox = (index, field, value) => {
    const updated = [...checkboxes];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate(updated);
  };

  const handleToggleEnabled = (index) => {
    const updated = [...checkboxes];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    onUpdate(updated);
  };

  const handleDeleteCheckbox = (index) => {
    onUpdate(checkboxes.filter((_, i) => i !== index));
  };

  return (
    <Box>
      <StepIntro intro={intro} variables={variables} editable onIntroChange={onIntroChange} />
      <Card sx={{ ...wizardCardSx, p: { xs: 2.5, md: 3.5 } }}>
        <ConsentFieldsGrid guardian={previewGuardian} readOnly />
        <Divider sx={{ my: 3, borderColor: consentColors.divider }} />
        {checkboxes.map((checkbox, index) => (
          <Box
            key={checkbox.id || index}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.25,
              py: 1.5,
              opacity: checkbox.enabled === false ? 0.55 : 1,
              borderBottom: `1px solid ${consentColors.divider}`,
            }}
          >
            <Checkbox
              checked
              disabled
              sx={{
                color: consentColors.stepDotInactiveBorder,
                '&.Mui-checked': { color: consentColors.primaryDark },
                mt: -0.5,
              }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <TextField
                fullWidth
                size="small"
                value={checkbox.label || ''}
                onChange={(e) => handleUpdateCheckbox(index, 'label', e.target.value)}
                multiline
                variant="standard"
                InputProps={{ disableUnderline: true }}
                sx={{ '& textarea': { ...consentTypography.body, p: 0 } }}
              />
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={checkbox.required || false}
                      onChange={(e) => handleUpdateCheckbox(index, 'required', e.target.checked)}
                      size="small"
                    />
                  }
                  label={<Typography sx={consentTypography.caption}>Required</Typography>}
                />
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={checkbox.category || 'general'}
                    label="Category"
                    onChange={(e) => handleUpdateCheckbox(index, 'category', e.target.value)}
                  >
                    <MenuItem value="general">General</MenuItem>
                    <MenuItem value="data_processing">Data Processing</MenuItem>
                    <MenuItem value="marketing">Marketing</MenuItem>
                    <MenuItem value="third_party">Third Party</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>
            <Chip
              label={checkbox.enabled === false ? 'Enable' : 'Disable'}
              size="small"
              onClick={() => handleToggleEnabled(index)}
              sx={disablePillSx}
            />
            <IconButton size="small" onClick={() => handleDeleteCheckbox(index)} color="error">
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        <Box sx={{ mt: 2 }}>
          {newCheckboxLabel.length > 0 && (
            <TextField
              fullWidth
              size="small"
              value={newCheckboxLabel}
              onChange={(e) => setNewCheckboxLabel(e.target.value)}
              placeholder="Checkbox label"
              sx={{ mb: 1.5, ...fieldSx }}
            />
          )}
          <Button
            onClick={() => {
              if (!newCheckboxLabel.trim()) {
                setNewCheckboxLabel(' ');
                return;
              }
              handleAddCheckbox();
            }}
            sx={dashedAddSx}
          >
            + Add new checkbox
          </Button>
        </Box>
      </Card>
      <Card sx={{ ...wizardCardSx, mt: 3, p: 3 }}>
        <Typography sx={{ ...consentTypography.cardTitle, mb: 1.5 }}>Footer links</Typography>
        <Typography sx={{ ...consentTypography.caption, mb: 2 }}>
          Shown at the bottom of the employee consent wizard. Leave empty to hide.
        </Typography>
        {(copy?.footerLinks || []).map((link, index) => (
          <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <InlineField
              value={link.label || ''}
              onChange={(v) => {
                const next = [...(copy?.footerLinks || [])];
                next[index] = { ...next[index], label: v };
                onCopyChange?.('footerLinks', next);
              }}
              placeholder="Link label"
              typeSx={consentTypography.body}
            />
            <IconButton
              size="small"
              color="error"
              onClick={() => {
                const next = (copy?.footerLinks || []).filter((_, i) => i !== index);
                onCopyChange?.('footerLinks', next);
              }}
            >
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        ))}
        <Button
          onClick={() => onCopyChange?.('footerLinks', [...(copy?.footerLinks || []), { label: '' }])}
          sx={dashedAddSx}
        >
          + Add footer link
        </Button>
      </Card>
    </Box>
  );
};

const GuardianRightsEditor = ({ rights, onUpdate, heading, onHeadingChange }) => {
  const handleAddRight = () => {
    onUpdate([...(rights || []), { label: '', enabled: true }]);
  };

  const handleUpdateRight = (index, field, value) => {
    const updated = [...rights];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate(updated);
  };

  const handleToggleEnabled = (index) => {
    handleUpdateRight(index, 'enabled', rights[index].enabled === false);
  };

  const handleDeleteRight = (index) => {
    onUpdate(rights.filter((_, i) => i !== index));
  };

  return (
    <Card sx={{ ...wizardCardSx, mt: 3, p: 3 }}>
      <InlineField
        value={heading || ''}
        onChange={onHeadingChange}
        placeholder="Rights section heading"
        typeSx={consentTypography.cardTitle}
        sx={{ mb: 2 }}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
        {(rights || []).map((right, index) => (
          <Box
            key={index}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75, opacity: right.enabled === false ? 0.55 : 1 }}
          >
            <InlineField
              value={right.label || ''}
              onChange={(v) => handleUpdateRight(index, 'label', v)}
              placeholder="Right label"
              typeSx={{ fontSize: '0.8rem', fontWeight: 500 }}
              sx={{
                minWidth: 120,
                background: consentColors.pageBg,
                border: `1px solid ${consentColors.cardBorder}`,
                borderRadius: consentSpacing.pillRadius,
                px: 1.25,
                py: 0.25,
              }}
            />
            <Chip
              label={right.enabled === false ? 'Enable' : 'Disable'}
              size="small"
              onClick={() => handleToggleEnabled(index)}
              sx={disablePillSx}
            />
            <IconButton size="small" onClick={() => handleDeleteRight(index)} sx={{ width: 24, height: 24 }} color="error">
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        ))}
      </Box>
      <Button onClick={handleAddRight} sx={dashedAddSx}>
        + Add new right
      </Button>
    </Card>
  );
};

export default PolicyTemplateEditorPage;
