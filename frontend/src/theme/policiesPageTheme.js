// Shared premium tokens for Policies & Compliance tabs.
// Matches adminEmployeeTheme / consentWizardTheme (red/white, Inter).

export {
  RED,
  RED_DARK,
  RED_BG,
  RED_LIGHT,
  TEXT,
  MUTED,
  BORDER,
  SURFACE,
} from '../components/adminEmployee/adminEmployeeTheme';

import {
  RED,
  RED_DARK,
  RED_BG,
  RED_LIGHT,
  TEXT,
  MUTED,
  BORDER,
  SURFACE,
} from '../components/adminEmployee/adminEmployeeTheme';

export const FONT = "'Inter', 'Roboto', system-ui, sans-serif";

export const SUCCESS_BG = '#E8F5E9';
export const SUCCESS_TEXT = '#2E7D32';
export const SUCCESS_BORDER = '#C8E6C9';
export const WARN_BG = '#FFF7ED';
export const WARN_TEXT = '#B45309';
export const INFO_BG = '#EFF6FF';
export const INFO_TEXT = '#1D4ED8';

export const cardSx = {
  background: '#fff',
  borderRadius: '16px',
  padding: { xs: '18px', md: '22px' },
  border: `1px solid ${BORDER}`,
  boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04), 0 8px 24px rgba(16, 24, 40, 0.05)',
};

export const sectionTitleSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  fontWeight: 700,
  fontSize: '0.95rem',
  letterSpacing: '-0.015em',
  color: TEXT,
  fontFamily: FONT,
  mb: 0.4,
};

export const sectionDescSx = {
  color: MUTED,
  fontSize: '0.8rem',
  lineHeight: 1.55,
  fontFamily: FONT,
  mb: 0,
};

export const pageTitleSx = {
  fontFamily: FONT,
  fontWeight: 700,
  fontSize: '1.15rem',
  letterSpacing: '-0.02em',
  color: TEXT,
  lineHeight: 1.3,
};

export const pageDescSx = {
  fontFamily: FONT,
  fontSize: '0.8125rem',
  color: MUTED,
  lineHeight: 1.5,
};

export const primaryBtnSx = {
  background: `linear-gradient(135deg, ${RED} 0%, ${RED_DARK} 100%)`,
  textTransform: 'none',
  fontWeight: 600,
  fontFamily: FONT,
  borderRadius: '10px',
  boxShadow: 'none',
  px: 2.5,
  '&:hover': {
    background: `linear-gradient(135deg, ${RED_DARK} 0%, #B71C1C 100%)`,
    boxShadow: 'none',
  },
};

export const outlineBtnSx = {
  textTransform: 'none',
  fontWeight: 600,
  fontFamily: FONT,
  borderRadius: '10px',
  color: RED_DARK,
  borderColor: 'rgba(198, 40, 40, 0.28)',
  background: '#fff',
  '&:hover': {
    borderColor: RED,
    background: RED_BG,
  },
};

export const ghostBtnSx = {
  textTransform: 'none',
  fontWeight: 600,
  fontFamily: FONT,
  borderRadius: '10px',
  color: MUTED,
  borderColor: BORDER,
  background: '#fff',
  '&:hover': {
    borderColor: '#D1D5DB',
    background: SURFACE,
    color: TEXT,
  },
};

export const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '10px',
    background: '#fff',
    fontSize: '0.875rem',
    fontFamily: FONT,
    '& fieldset': { borderColor: BORDER },
    '&:hover fieldset': { borderColor: '#D1D5DB' },
    '&.Mui-focused fieldset': { borderColor: RED_DARK },
  },
  '& .MuiInputLabel-root': {
    fontSize: '0.875rem',
    fontFamily: FONT,
    '&.Mui-focused': { color: RED_DARK },
  },
};

export const tableHeadCellSx = {
  fontFamily: FONT,
  fontWeight: 700,
  fontSize: '0.7rem',
  color: MUTED,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  py: 1.35,
  borderBottom: `1px solid ${BORDER}`,
  background: SURFACE,
  whiteSpace: 'nowrap',
};

export const iconBoxSx = {
  width: 36,
  height: 36,
  borderRadius: '10px',
  background: RED_LIGHT,
  color: RED_DARK,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  border: `1px solid rgba(198, 40, 40, 0.12)`,
};

export const tabBarSx = {
  minHeight: 52,
  '& .MuiTabs-flexContainer': {
    gap: 0.25,
  },
  '& .MuiTab-root': {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.8125rem',
    fontFamily: FONT,
    minHeight: 40,
    minWidth: 0,
    px: 1.75,
    py: 1,
    gap: 0.75,
    color: MUTED,
    borderRadius: '10px',
    margin: '6px 2px',
    transition: 'background 0.15s ease, color 0.15s ease',
    '&:hover': {
      color: TEXT,
      background: SURFACE,
    },
  },
  '& .Mui-selected': {
    color: `${RED_DARK} !important`,
    background: RED_BG,
  },
  '& .MuiTab-iconWrapper': { marginRight: 0 },
  '& .MuiTabs-indicator': { display: 'none' },
  '& .MuiTabs-scrollButtons': {
    color: MUTED,
    '&.Mui-disabled': { opacity: 0.25 },
  },
};
