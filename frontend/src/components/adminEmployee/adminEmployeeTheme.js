export const RED = '#E53935';
export const RED_DARK = '#C62828';
export const RED_BG = '#FDECEC';
export const RED_LIGHT = '#FFF5F5';
export const TEXT = '#1A1A1A';
export const MUTED = '#6B7280';
export const BORDER = '#E5E7EB';
export const SURFACE = '#F8F9FB';

export const cardSx = {
    background: '#fff',
    borderRadius: '12px',
    padding: '20px',
    border: `1px solid ${BORDER}`,
};

export const sectionTitleSx = {
    fontWeight: 600,
    color: TEXT,
    fontSize: '0.875rem',
    mb: 2,
    display: 'flex',
    alignItems: 'center',
    gap: 0.75,
};

export const primaryBtnSx = {
    background: `linear-gradient(135deg, ${RED} 0%, ${RED_DARK} 100%)`,
    textTransform: 'none',
    fontWeight: 600,
    borderRadius: '8px',
    boxShadow: 'none',
    px: 3,
    '&:hover': {
        background: `linear-gradient(135deg, ${RED_DARK} 0%, #B71C1C 100%)`,
        boxShadow: 'none',
    },
};

export const tabSx = {
    minHeight: 42,
    '& .MuiTab-root': {
        textTransform: 'none',
        fontWeight: 600,
        fontSize: '0.8125rem',
        minHeight: 42,
        color: MUTED,
        py: 1,
    },
    '& .Mui-selected': { color: RED },
    '& .MuiTabs-indicator': { backgroundColor: RED, height: 2 },
};

/** Profile dialog only — do not reuse on full pages. */
export const profileCardSx = {
    background: '#fff',
    borderRadius: '16px',
    padding: '22px',
    border: '1px solid #E7E9EE',
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04), 0 10px 28px rgba(16, 24, 40, 0.04)',
};

export const profileTabSx = {
    minHeight: 46,
    '& .MuiTabs-flexContainer': { gap: 0.25 },
    '& .MuiTab-root': {
        textTransform: 'none',
        fontWeight: 600,
        fontSize: '0.84rem',
        minHeight: 46,
        color: '#667085',
        px: 1.75,
        letterSpacing: '-0.01em',
    },
    '& .Mui-selected': { color: RED },
    '& .MuiTabs-indicator': {
        backgroundColor: RED,
        height: 2.5,
        borderRadius: 2,
    },
};

export const iconWellSx = (background = RED_BG, color = RED) => ({
    width: 34,
    height: 34,
    borderRadius: '10px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background,
    color,
    flexShrink: 0,
});
