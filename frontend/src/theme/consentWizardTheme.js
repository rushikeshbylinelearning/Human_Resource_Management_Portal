// Consent Wizard design tokens — app red/white brand (not the mockup teal/cream).
// Matches adminEmployeeTheme / ProfilePage: #E53935, #C62828, white, #F8F9FB.
// Import from ConsentWizard.jsx and PolicyTemplateEditorPage.jsx; do not inline hex twice.

export const consentColors = {
  pageBg: '#F8F9FB',
  cardBg: '#FFFFFF',
  cardBorder: '#E5E7EB',
  primaryDark: '#C62828',
  primaryHover: '#B71C1C',
  primaryText: '#1A1A1A',
  bodyText: '#6B7280',
  badgeBg: '#FDECEC',
  badgeText: '#C62828',
  disablePillBg: '#FDECEC',
  disablePillText: '#C62828',
  disablePillBorder: '#F5C6C6',
  footerBg: '#1A1A1A',
  footerText: '#F5F5F5',
  heroGradientStart: '#FFF5F5',
  heroGradientEnd: '#FFFFFF',
  stepDotActiveBg: '#E53935',
  stepDotActiveText: '#FFFFFF',
  stepDotInactiveBorder: '#E5E7EB',
  stepDotInactiveText: '#9CA3AF',
  stepConnectorActive: '#E53935',
  stepConnectorInactive: '#E5E7EB',
  successBg: '#E8F5E9',
  successText: '#2E7D32',
  successBorder: '#C8E6C9',
  darkCardBg: '#1A1A1A',
  darkCardText: '#FFFFFF',
  inputBorder: '#E5E7EB',
  readOnlyBg: '#F8F9FB',
  iconChipBg: '#FFF5F5',
  plusGreen: '#E53935',
  plusGreenHover: '#C62828',
  disabledButtonBg: '#E5E7EB',
  disabledButtonText: '#9CA3AF',
  divider: '#F3F4F6',
};

export const consentTypography = {
  eyebrow: {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: consentColors.primaryText,
  },
  h1: {
    fontSize: '1.75rem',
    fontWeight: 700,
    lineHeight: 1.25,
    color: consentColors.primaryText,
  },
  h2: {
    fontSize: '1.4rem',
    fontWeight: 700,
    lineHeight: 1.3,
    color: consentColors.primaryText,
  },
  cardTitle: {
    fontSize: '0.95rem',
    fontWeight: 700,
    lineHeight: 1.4,
    color: consentColors.primaryText,
  },
  body: {
    fontSize: '0.875rem',
    lineHeight: 1.65,
    color: consentColors.bodyText,
  },
  caption: {
    fontSize: '0.75rem',
    lineHeight: 1.5,
    color: consentColors.bodyText,
  },
};

export const consentSpacing = {
  heroRadius: '20px',
  cardRadius: '14px',
  pillRadius: '999px',
  stepperDotSize: '30px',
  stepperConnectorWidth: '2px',
  fieldRadius: '8px',
};

export const consentShadows = {
  card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 16px rgba(16, 24, 40, 0.05)',
  cardHover: '0 8px 24px rgba(198, 40, 40, 0.10), 0 2px 8px rgba(16, 24, 40, 0.06)',
  hero: '0 8px 32px rgba(198, 40, 40, 0.08), 0 2px 8px rgba(16, 24, 40, 0.04)',
};

export const consentLayout = {
  pageMaxWidth: '100%',
  editorPadX: { xs: 1, md: 1.5 },
  heroImageMinHeight: { xs: 148, md: 176 },
  heroImageMaxWidth: { xs: 176, md: 196 },
  heroImageHeight: { xs: 148, md: 176 },
};

export const CONSENT_STEPS = [
  { key: 'at_a_glance', label: 'At a glance', order: 0 },
  { key: 'what_we_collect', label: 'What we collect', order: 1 },
  { key: 'your_choices', label: 'Your choices', order: 2 },
  { key: 'full_notice', label: 'Full notice', order: 3 },
  { key: 'consent', label: 'Consent', order: 4 },
];

export const STEP_INTRO_FALLBACKS = {
  at_a_glance: {
    eyebrow: 'THE SHORT VERSION',
    heading: 'What actually happens during the exam',
    subheading: 'Limited monitoring, only when something unusual is detected.',
  },
  what_we_collect: {
    eyebrow: 'DATA MAP',
    heading: 'Purpose-limited information',
    subheading: 'Only the information needed to administer and protect the assessment is used.',
  },
  your_choices: {
    eyebrow: 'CONTROL STAYS WITH YOU',
    heading: 'Three clear paths',
    subheading: '',
  },
  full_notice: {
    eyebrow: '',
    heading: 'Online Examination Proctoring Privacy Notice',
    subheading: 'This notice should be made available in Arabic and English and reviewed by qualified Saudi counsel before production use.',
  },
  consent: {
    eyebrow: 'LEGAL GUARDIAN CONSENT',
    heading: 'Review and confirm your consent',
    subheading:
      'Most Grade 1–12 students are minors. A legal guardian should complete this form in the student’s best interests. This consent applies to assessments taken on the {{productName}} platform.',
  },
};

export const ICON_OPTIONS = [
  { value: 'shield', label: 'Shield' },
  { value: 'camera', label: 'Camera' },
  { value: 'warning', label: 'Warning' },
  { value: 'clock', label: 'Clock' },
];

export const CHOICE_ACTIONS = [
  { value: 'open_consent', label: 'Open consent form' },
  { value: 'continue_without', label: 'Record non-consent' },
  { value: 'request_alternative', label: 'Request alternative' },
  { value: 'none', label: 'No action' },
];

export const COUNTRY_DIAL_CODES = [
  { code: '+966', flag: '🇸🇦', label: 'Saudi Arabia' },
  { code: '+971', flag: '🇦🇪', label: 'UAE' },
  { code: '+91', flag: '🇮🇳', label: 'India' },
  { code: '+1', flag: '🇺🇸', label: 'USA / Canada' },
  { code: '+44', flag: '🇬🇧', label: 'UK' },
  { code: '+20', flag: '🇪🇬', label: 'Egypt' },
];

export const CONSENT_LABEL_HIGHLIGHTS = [
  'Privacy Notice',
  '14-day maximum evidence-retention period',
  'School privacy contact',
];

export const toVariables = (vars) => {
  if (!vars) return {};
  if (vars instanceof Map) return Object.fromEntries(vars);
  if (typeof vars === 'object') return { ...vars };
  return {};
};

export const resolveTemplateVariables = (text, variables) => {
  if (text == null) return '';
  const vars = toVariables(variables);
  return String(text).replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, rawKey) => {
    const key = String(rawKey).trim();
    const value = vars[key];
    return value != null && value !== '' ? String(value) : match;
  });
};

export const formatNoticeDate = (date) => {
  const d = date ? new Date(date) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    .toUpperCase();
};

export const getStepIntro = (stepData, stepKey, options = {}) => {
  const useFallback = options.useFallback === true;
  const fallback = useFallback ? (STEP_INTRO_FALLBACKS[stepKey] || {}) : {};
  const intro = stepData?.intro || {};
  return {
    eyebrow: intro.eyebrow || fallback.eyebrow || '',
    heading: intro.heading || fallback.heading || '',
    subheading: intro.subheading || fallback.subheading || '',
  };
};

export const inlineFieldSx = (typeSx = {}) => ({
  '& input, & textarea': {
    ...typeSx,
    p: 0,
  },
});

export const wizardCardSx = {
  background: consentColors.cardBg,
  border: `1px solid ${consentColors.cardBorder}`,
  borderRadius: consentSpacing.cardRadius,
  boxShadow: consentShadows.card,
  transition: 'box-shadow 0.2s ease, transform 0.2s ease',
  '&:hover': {
    boxShadow: consentShadows.cardHover,
  },
};

export const disablePillSx = {
  height: '22px',
  fontSize: '0.65rem',
  fontWeight: 600,
  letterSpacing: '0.01em',
  borderRadius: consentSpacing.pillRadius,
  background: consentColors.disablePillBg,
  color: consentColors.disablePillText,
  border: `1px solid ${consentColors.disablePillBorder}`,
  cursor: 'pointer',
  '& .MuiChip-label': { px: 1.1 },
};

export const primaryPillButtonSx = {
  borderRadius: consentSpacing.pillRadius,
  textTransform: 'none',
  fontWeight: 600,
  px: 3,
  py: 1,
  background: `linear-gradient(135deg, #E53935 0%, ${consentColors.primaryDark} 100%)`,
  color: '#fff',
  boxShadow: 'none',
  '&:hover': {
    background: `linear-gradient(135deg, ${consentColors.primaryDark} 0%, ${consentColors.primaryHover} 100%)`,
    boxShadow: 'none',
  },
  '&.Mui-disabled': {
    background: consentColors.disabledButtonBg,
    color: consentColors.disabledButtonText,
  },
};

export const outlinedPillButtonSx = {
  borderRadius: consentSpacing.pillRadius,
  textTransform: 'none',
  fontWeight: 600,
  px: 3,
  py: 1,
  background: consentColors.cardBg,
  color: consentColors.primaryDark,
  border: `1.5px solid ${consentColors.primaryDark}`,
  boxShadow: 'none',
  '&:hover': {
    background: consentColors.pageBg,
    border: `1.5px solid ${consentColors.primaryDark}`,
  },
};

export const dashedAddSx = {
  border: `1.5px dashed ${consentColors.cardBorder}`,
  borderRadius: consentSpacing.pillRadius,
  textTransform: 'none',
  color: consentColors.primaryText,
  fontWeight: 600,
  background: 'transparent',
  '&:hover': {
    background: 'rgba(229, 57, 53, 0.06)',
    border: `1.5px dashed ${consentColors.stepDotInactiveBorder}`,
  },
};

export const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: consentSpacing.fieldRadius,
    background: consentColors.cardBg,
    fontSize: '0.875rem',
    '& fieldset': { borderColor: consentColors.inputBorder },
    '&:hover fieldset': { borderColor: consentColors.stepDotInactiveBorder },
    '&.Mui-focused fieldset': { borderColor: consentColors.primaryDark },
  },
  '& .MuiInputLabel-root': {
    fontSize: '0.875rem',
  },
  '& .MuiInputLabel-asterisk': {
    color: consentColors.disablePillText,
  },
};

export const iconChipSx = {
  width: 44,
  height: 44,
  borderRadius: '12px',
  background: consentColors.iconChipBg,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  border: `1px solid ${consentColors.disablePillBorder}`,
};
