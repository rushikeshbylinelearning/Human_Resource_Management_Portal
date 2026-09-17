import React, { useRef, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Chip,
  CircularProgress,
  Snackbar,
  Alert,
  IconButton,
} from '@mui/material';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import {
  consentColors,
  consentTypography,
  consentSpacing,
  consentShadows,
  consentLayout,
  CONSENT_STEPS,
  COUNTRY_DIAL_CODES,
  CONSENT_LABEL_HIGHLIGHTS,
  ICON_OPTIONS,
  resolveTemplateVariables,
  fieldSx,
  inlineFieldSx,
} from '../../theme/consentWizardTheme';

const STEPS = CONSENT_STEPS;

export const getIconComponent = (iconName) => {
  const iconMap = {
    camera: CameraAltOutlinedIcon,
    warning: WarningAmberOutlinedIcon,
    'warning-triangle': WarningAmberOutlinedIcon,
    shield: SecurityOutlinedIcon,
    clock: AccessTimeOutlinedIcon,
    time: AccessTimeOutlinedIcon,
  };
  return iconMap[iconName?.toLowerCase()] || SecurityOutlinedIcon;
};

export const IconPicker = ({ value, onChange }) => {
  const selected = value || 'shield';
  const SelectedIcon = getIconComponent(selected);

  return (
    <Select
      value={selected}
      onChange={(e) => onChange?.(e.target.value)}
      variant="standard"
      disableUnderline
      renderValue={() => <SelectedIcon sx={{ fontSize: 20, color: consentColors.primaryDark }} />}
      IconComponent={(props) => (
        <KeyboardArrowDownIcon {...props} sx={{ fontSize: 14, color: consentColors.primaryDark }} />
      )}
      sx={{
        width: 44,
        height: 44,
        borderRadius: '12px',
        background: consentColors.iconChipBg,
        border: `1px solid ${consentColors.disablePillBorder}`,
        '& .MuiSelect-select': {
          p: '0 !important',
          height: '44px !important',
          display: 'flex !important',
          alignItems: 'center',
          justifyContent: 'center',
        },
        '& .MuiSelect-icon': { right: 2 },
        '&:before, &:after': { display: 'none' },
      }}
      MenuProps={{
        PaperProps: {
          sx: { borderRadius: '12px', mt: 0.5, boxShadow: consentShadows.cardHover },
        },
      }}
    >
      {ICON_OPTIONS.map((opt) => {
        const OptionIcon = getIconComponent(opt.value);
        return (
          <MenuItem key={opt.value} value={opt.value} sx={{ gap: 1.25, py: 1 }}>
            <OptionIcon sx={{ fontSize: 18, color: consentColors.primaryDark }} />
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, textTransform: 'capitalize' }}>
              {opt.label}
            </Typography>
          </MenuItem>
        );
      })}
    </Select>
  );
};

export const renderRichLabel = (label, variables) => {
  const resolved = resolveTemplateVariables(label, variables);
  if (!resolved) return resolved;

  const pattern = new RegExp(
    `(${CONSENT_LABEL_HIGHLIGHTS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'g'
  );
  const parts = resolved.split(pattern);
  if (parts.length === 1) return resolved;

  return parts.map((part, i) =>
    CONSENT_LABEL_HIGHLIGHTS.includes(part) ? (
      <Box
        component="span"
        key={`${part}-${i}`}
        sx={{
          color: consentColors.primaryDark,
          fontWeight: 700,
          textDecoration: 'underline',
          textUnderlineOffset: '2px',
        }}
      >
        {part}
      </Box>
    ) : (
      part
    )
  );
};

export const InlineField = ({
  value,
  onChange,
  onBlur,
  placeholder = '',
  multiline = false,
  minRows = 1,
  sx = {},
  typeSx = {},
  fullWidth = true,
}) => (
  <TextField
    fullWidth={fullWidth}
    value={value ?? ''}
    onChange={(e) => onChange?.(e.target.value)}
    onBlur={onBlur}
    placeholder={placeholder}
    variant="standard"
    multiline={multiline}
    minRows={multiline ? minRows : undefined}
    InputProps={{ disableUnderline: true }}
    sx={{ ...inlineFieldSx(typeSx), ...sx }}
  />
);

export const StepIntro = ({
  intro,
  variables,
  maxWidth = '840px',
  editable = false,
  onIntroChange,
  onIntroBlur,
}) => {
  const eyebrow = intro?.eyebrow || '';
  const heading = intro?.heading || '';
  const subheading = intro?.subheading || '';

  if (editable) {
    return (
      <Box sx={{ mb: 3.5 }}>
        <InlineField
          value={eyebrow}
          onChange={(v) => onIntroChange?.('eyebrow', v)}
          onBlur={onIntroBlur}
          placeholder="Eyebrow (e.g. THE SHORT VERSION)"
          typeSx={consentTypography.eyebrow}
          sx={{ mb: 1, maxWidth: 480 }}
        />
        <InlineField
          value={heading}
          onChange={(v) => onIntroChange?.('heading', v)}
          onBlur={onIntroBlur}
          placeholder="Section heading"
          typeSx={consentTypography.h1}
          sx={{ mb: 1 }}
        />
        <InlineField
          value={subheading}
          onChange={(v) => onIntroChange?.('subheading', v)}
          onBlur={onIntroBlur}
          placeholder="Section subheading"
          multiline
          minRows={2}
          typeSx={{ ...consentTypography.body, maxWidth }}
        />
      </Box>
    );
  }

  if (!eyebrow && !heading && !subheading) return null;

  return (
    <Box sx={{ mb: 3.5 }}>
      {eyebrow ? (
        <Typography sx={{ ...consentTypography.eyebrow, mb: 1 }}>
          {resolveTemplateVariables(eyebrow, variables)}
        </Typography>
      ) : null}
      {heading ? (
        <Typography sx={{ ...consentTypography.h1, mb: subheading ? 1 : 0 }}>
          {resolveTemplateVariables(heading, variables)}
        </Typography>
      ) : null}
      {subheading ? (
        <Typography sx={{ ...consentTypography.body, maxWidth }}>
          {resolveTemplateVariables(subheading, variables)}
        </Typography>
      ) : null}
    </Box>
  );
};

export const ConsentStepper = ({
  steps = STEPS,
  activeStep,
  visitedSteps,
  onStepClick,
  editable = false,
  onLabelChange,
  onLabelBlur,
}) => {
  return (
    <Box
      sx={{
        background: consentColors.cardBg,
        py: { xs: 1.5, md: 1.85 },
        px: { xs: 1.5, md: 3 },
        overflowX: 'auto',
        '&::-webkit-scrollbar': { height: 0 },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          minWidth: { xs: 420, md: 0 },
          width: '100%',
          mx: 0,
        }}
      >
        {steps.map((step, index) => {
          const isActive = index === activeStep;
          const isReached = visitedSteps ? visitedSteps.has(index) : index <= activeStep;
          const nextReached = visitedSteps
            ? visitedSteps.has(index + 1)
            : index + 1 <= activeStep;
          const bothVisited = isReached && nextReached;
          const showConnector = index < steps.length - 1;

          return (
            <Box
              key={step.key}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                flex: 1,
                minWidth: 0,
              }}
            >
              <Box
                onClick={() => onStepClick?.(index)}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  cursor: onStepClick ? 'pointer' : 'default',
                  minWidth: { xs: 36, md: 64 },
                }}
              >
                <Box
                  sx={{
                    width: consentSpacing.stepperDotSize,
                    height: consentSpacing.stepperDotSize,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isReached ? consentColors.stepDotActiveBg : 'transparent',
                    border: isReached
                      ? 'none'
                      : `1.5px solid ${consentColors.stepDotInactiveBorder}`,
                    mb: 0.75,
                    flexShrink: 0,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      color: isReached
                        ? consentColors.stepDotActiveText
                        : consentColors.stepDotInactiveText,
                    }}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </Typography>
                </Box>
                {editable ? (
                  <Box
                    onClick={(e) => e.stopPropagation()}
                    sx={{ minWidth: { xs: 72, md: 96 }, maxWidth: 140 }}
                  >
                    <InlineField
                      value={step.label || ''}
                      onChange={(v) => onLabelChange?.(index, v)}
                      onBlur={onLabelBlur}
                      placeholder="Step name"
                      typeSx={{
                        fontSize: '0.75rem',
                        fontWeight: isActive || isReached ? 700 : 400,
                        color: isReached
                          ? consentColors.primaryDark
                          : consentColors.stepDotInactiveText,
                        textAlign: 'center',
                      }}
                      sx={{
                        '& input': {
                          textAlign: 'center',
                          pb: '3px',
                          borderBottom: isActive
                            ? `2.5px solid ${consentColors.primaryDark}`
                            : '2.5px solid transparent',
                        },
                      }}
                    />
                  </Box>
                ) : (
                  <Typography
                    sx={{
                      display: { xs: 'none', sm: 'block' },
                      fontSize: '0.75rem',
                      fontWeight: isActive || isReached ? 700 : 400,
                      color: isReached
                        ? consentColors.primaryDark
                        : consentColors.stepDotInactiveText,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      pb: '3px',
                      borderBottom: isActive
                        ? `2.5px solid ${consentColors.primaryDark}`
                        : '2.5px solid transparent',
                    }}
                  >
                    {step.label}
                  </Typography>
                )}
              </Box>

              {showConnector && (
                <Box
                  sx={{
                    flex: 1,
                    height: 0,
                    borderTop: bothVisited
                      ? `2px solid ${consentColors.stepConnectorActive}`
                      : `1.5px dashed ${consentColors.stepConnectorInactive}`,
                    mt: '14px',
                    mx: { xs: 0.5, md: 1.25 },
                  }}
                />
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

const HeroImageTile = ({
  imageUrl,
  isAdmin,
  uploading,
  onPickFile,
  onRemove,
  fileInputRef,
  onFileChange,
}) => {
  return (
    <Box
      sx={{
        position: 'relative',
        width: consentLayout.heroImageMaxWidth,
        aspectRatio: '1 / 1',
        maxWidth: '100%',
        flexShrink: 0,
      }}
    >
      {isAdmin && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={onFileChange}
          style={{ display: 'none' }}
          disabled={uploading}
        />
      )}

      <Box
        onClick={isAdmin && !uploading ? onPickFile : undefined}
        title={isAdmin ? (imageUrl ? 'Change hero image' : 'Upload hero image') : undefined}
        sx={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: consentShadows.card,
          cursor: isAdmin && !uploading ? 'pointer' : 'default',
          transition: 'transform 0.2s ease',
          '&:hover': isAdmin
            ? { transform: 'scale(1.03)' }
            : undefined,
          '&:hover .hero-image-overlay': isAdmin
            ? { opacity: 1 }
            : undefined,
        }}
      >
        {imageUrl ? (
          <Box
            component="img"
            src={imageUrl}
            alt=""
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : isAdmin ? (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              background: `linear-gradient(160deg, ${consentColors.heroGradientStart} 0%, ${consentColors.badgeBg} 100%)`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.75,
              border: `1.5px dashed ${consentColors.disablePillBorder}`,
              borderRadius: '16px',
              boxSizing: 'border-box',
            }}
          >
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(198,40,40,0.16)',
              }}
            >
              <CameraAltOutlinedIcon sx={{ fontSize: 22, color: consentColors.primaryDark }} />
            </Box>
            <Typography
              sx={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: consentColors.primaryDark,
                letterSpacing: '0.02em',
              }}
            >
              Upload photo
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              background: `linear-gradient(160deg, ${consentColors.heroGradientStart} 0%, ${consentColors.badgeBg} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${consentColors.cardBorder}`,
              borderRadius: '16px',
              boxSizing: 'border-box',
            }}
          >
            <CameraAltOutlinedIcon sx={{ fontSize: 36, color: consentColors.bodyText, opacity: 0.28 }} />
          </Box>
        )}

        {isAdmin && (
          <Box
            className="hero-image-overlay"
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: '16px',
              background: 'rgba(0,0,0,0.52)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.5,
              opacity: 0,
              transition: 'opacity 0.2s ease',
              pointerEvents: 'none',
            }}
          >
            <CameraAltOutlinedIcon sx={{ fontSize: 22, color: '#fff' }} />
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#fff', letterSpacing: '0.4px' }}>
              {imageUrl ? 'Change' : 'Upload'}
            </Typography>
          </Box>
        )}

        {uploading && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: '16px',
              background: 'rgba(0,0,0,0.62)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircularProgress size={26} sx={{ color: 'white' }} />
          </Box>
        )}
      </Box>

      {isAdmin && imageUrl && !uploading && (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          title="Remove image"
          sx={{
            position: 'absolute',
            bottom: 4,
            right: 4,
            width: 26,
            height: 26,
            background: '#fff',
            border: `2px solid ${consentColors.cardBorder}`,
            boxShadow: '0 1px 4px rgba(16,24,40,0.12)',
            color: consentColors.bodyText,
            zIndex: 3,
            '&:hover': {
              background: consentColors.badgeBg,
              color: consentColors.primaryDark,
              borderColor: consentColors.disablePillBorder,
            },
          }}
        >
          <Typography component="span" sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>
            ×
          </Typography>
        </IconButton>
      )}
    </Box>
  );
};

export const ConsentHeroBanner = ({
  hero,
  variables,
  copy,
  isAdmin = false,
  onReplaceImage,
  onHeroChange,
  onHeroBlur,
  onHeroImageSaved,
  onVariableChange,
  onVariableBlur,
  onCopyChange,
  onCopyBlur,
}) => {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  if (!hero && !isAdmin) return null;
  const schoolName = variables?.schoolName || '';
  const productName = variables?.productName || '';
  const preparedForLabel = copy?.preparedForLabel || '';
  const displayUrl = localPreview || hero?.imageUrl || '';

  const handlePickFile = () => {
    if (!uploading) fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSnackbar({ open: true, message: 'Please select a JPEG, PNG, GIF, or WebP image.', severity: 'error' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSnackbar({ open: true, message: 'File size exceeds 5 MB. Please choose a smaller image.', severity: 'error' });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setLocalPreview(previewUrl);
    setUploading(true);
    try {
      if (!onReplaceImage) {
        throw new Error('Image upload is not available.');
      }
      const imageUrl = await onReplaceImage(file);
      if (imageUrl) {
        setSnackbar({ open: true, message: 'Hero image updated.', severity: 'success' });
      }
    } catch (error) {
      setLocalPreview(null);
      setSnackbar({
        open: true,
        message: error.response?.data?.error || error.message || 'Upload failed. Please try again.',
        severity: 'error',
      });
    } finally {
      setUploading(false);
      URL.revokeObjectURL(previewUrl);
      setLocalPreview(null);
    }
  };

  const handleRemove = () => {
    if (uploading) return;
    onHeroImageSaved?.('');
    setLocalPreview(null);
  };

  return (
    <Box
      sx={{
        background: `linear-gradient(135deg, ${consentColors.heroGradientStart} 0%, ${consentColors.heroGradientEnd} 100%)`,
        p: { xs: 2, md: 2.75 },
        position: 'relative',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 1.25,
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
          <Box
            sx={{
              width: 22,
              height: 22,
              borderRadius: '6px',
              background: consentColors.primaryDark,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ShieldOutlinedIcon sx={{ fontSize: 14, color: '#fff' }} />
          </Box>
          {isAdmin ? (
            <InlineField
              value={productName}
              onChange={(v) => onVariableChange?.('productName', v)}
              onBlur={onVariableBlur}
              placeholder="Product / brand name"
              typeSx={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: consentColors.primaryText,
              }}
            />
          ) : productName ? (
            <Typography
              sx={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: consentColors.primaryText,
                letterSpacing: '-0.01em',
              }}
            >
              {productName}
            </Typography>
          ) : null}
        </Box>
      </Box>

      <Grid container spacing={2} alignItems="flex-start">
        <Grid item xs={12} md={8} size={{ xs: 12, md: 8 }}>
          {isAdmin ? (
            <InlineField
              value={hero?.badge || ''}
              onChange={(v) => onHeroChange?.('badge', v)}
              onBlur={onHeroBlur}
              placeholder="Badge (e.g. PRIVACY NOTICE)"
              typeSx={{
                fontSize: '0.68rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: consentColors.badgeText,
              }}
              sx={{
                mb: 1.5,
                maxWidth: 280,
                background: consentColors.badgeBg,
                borderRadius: consentSpacing.pillRadius,
                px: 1.25,
                py: 0.25,
              }}
            />
          ) : hero?.badge ? (
            <Chip
              label={resolveTemplateVariables(hero.badge, variables)}
              size="small"
              sx={{
                background: consentColors.badgeBg,
                color: consentColors.badgeText,
                fontWeight: 700,
                fontSize: '0.68rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                borderRadius: consentSpacing.pillRadius,
                height: '22px',
                mb: 1.25,
              }}
            />
          ) : null}

          <Box sx={{ mb: 1 }}>
            {isAdmin ? (
              <>
                <InlineField
                  value={hero?.title || ''}
                  onChange={(v) => onHeroChange?.('title', v)}
                  onBlur={onHeroBlur}
                  placeholder="Title"
                  typeSx={{
                    ...consentTypography.h1,
                    fontSize: { xs: '1.3rem', md: '1.5rem' },
                    lineHeight: 1.15,
                  }}
                />
                <InlineField
                  value={hero?.titleHighlight || ''}
                  onChange={(v) => onHeroChange?.('titleHighlight', v)}
                  onBlur={onHeroBlur}
                  placeholder="Title highlight"
                  typeSx={{
                    ...consentTypography.h1,
                    fontSize: { xs: '1.3rem', md: '1.5rem' },
                    lineHeight: 1.15,
                    color: consentColors.primaryDark,
                  }}
                />
              </>
            ) : (
              <>
                {hero?.title ? (
                  <Typography
                    sx={{
                      ...consentTypography.h1,
                      fontSize: { xs: '1.3rem', md: '1.5rem' },
                      lineHeight: 1.15,
                      mb: 0.25,
                    }}
                  >
                    {resolveTemplateVariables(hero.title, variables)}
                  </Typography>
                ) : null}
                {hero?.titleHighlight ? (
                  <Typography
                    sx={{
                      ...consentTypography.h1,
                      fontSize: { xs: '1.3rem', md: '1.5rem' },
                      lineHeight: 1.15,
                      color: consentColors.primaryDark,
                    }}
                  >
                    {resolveTemplateVariables(hero.titleHighlight, variables)}
                  </Typography>
                ) : null}
              </>
            )}
          </Box>

          {isAdmin ? (
            <InlineField
              value={hero?.body || ''}
              onChange={(v) => onHeroChange?.('body', v)}
              onBlur={onHeroBlur}
              placeholder="Intro body text"
              multiline
              minRows={2}
              typeSx={{ ...consentTypography.body, maxWidth: '90%' }}
            />
          ) : hero?.body ? (
            <Typography sx={{ ...consentTypography.body, maxWidth: '90%' }}>
              {resolveTemplateVariables(hero.body, variables)}
            </Typography>
          ) : null}
        </Grid>

        <Grid item xs={12} md={4} size={{ xs: 12, md: 4 }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: { xs: 'flex-start', md: 'flex-end' },
              gap: 1.25,
            }}
          >
            <Box sx={{ textAlign: { xs: 'left', md: 'right' }, width: { xs: '100%', md: consentLayout.heroImageMaxWidth.md } }}>
              {isAdmin ? (
                <>
                  <InlineField
                    value={preparedForLabel}
                    onChange={(v) => onCopyChange?.('preparedForLabel', v)}
                    onBlur={onCopyBlur}
                    placeholder="Prepared for"
                    typeSx={{ fontSize: '0.68rem', color: consentColors.bodyText, textAlign: 'right' }}
                    sx={{ '& input': { textAlign: { xs: 'left', md: 'right' } } }}
                  />
                  <InlineField
                    value={schoolName}
                    onChange={(v) => onVariableChange?.('schoolName', v)}
                    onBlur={onVariableBlur}
                    placeholder="School / organisation name"
                    typeSx={{ fontSize: '0.68rem', color: consentColors.bodyText, fontWeight: 600, textAlign: 'right' }}
                    sx={{ '& input': { textAlign: { xs: 'left', md: 'right' } } }}
                  />
                </>
              ) : (
                <>
                  {preparedForLabel ? (
                    <Typography sx={{ fontSize: '0.68rem', color: consentColors.bodyText, lineHeight: 1.3 }}>
                      {preparedForLabel}
                    </Typography>
                  ) : null}
                  {schoolName ? (
                    <Typography sx={{ fontSize: '0.68rem', color: consentColors.bodyText, fontWeight: 600 }}>
                      {schoolName}
                    </Typography>
                  ) : null}
                </>
              )}
            </Box>
            <HeroImageTile
              imageUrl={displayUrl}
              isAdmin={isAdmin}
              uploading={uploading}
              onPickFile={handlePickFile}
              onRemove={handleRemove}
              fileInputRef={fileInputRef}
              onFileChange={handleFileChange}
            />
          </Box>
        </Grid>
      </Grid>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export const ConsentHeroCard = ({
  hero,
  variables,
  copy,
  isAdmin = false,
  onReplaceImage,
  onHeroChange,
  onHeroBlur,
  onHeroImageSaved,
  onVariableChange,
  onVariableBlur,
  onCopyChange,
  onCopyBlur,
  steps,
  activeStep,
  visitedSteps,
  onStepClick,
  onStepLabelChange,
  onStepLabelBlur,
}) => (
  <Box
    sx={{
      borderRadius: consentSpacing.heroRadius,
      overflow: 'hidden',
      background: consentColors.cardBg,
      border: `1px solid ${consentColors.cardBorder}`,
      boxShadow: consentShadows.hero,
    }}
  >
    <ConsentHeroBanner
      hero={hero}
      variables={variables}
      copy={copy}
      isAdmin={isAdmin}
      onReplaceImage={onReplaceImage}
      onHeroChange={onHeroChange}
      onHeroBlur={onHeroBlur}
      onHeroImageSaved={onHeroImageSaved}
      onVariableChange={onVariableChange}
      onVariableBlur={onVariableBlur}
      onCopyChange={onCopyChange}
      onCopyBlur={onCopyBlur}
    />
    <Box sx={{ height: '1px', background: consentColors.divider }} />
    <ConsentStepper
      steps={steps}
      activeStep={activeStep}
      visitedSteps={visitedSteps}
      onStepClick={onStepClick}
      editable={isAdmin}
      onLabelChange={onStepLabelChange}
      onLabelBlur={onStepLabelBlur}
    />
  </Box>
);

const ConsentWizard = ({ open, onClose, policyId, policyName, onSuccess }) => {
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

  useEffect(() => {
    if (open && policyName) {
      loadTemplate();
    }
  }, [open, policyName]);

  useEffect(() => {
    setVisitedSteps((prev) => new Set([...prev, activeStep]));
  }, [activeStep]);

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
    setSubmitting(true);
    setError(null);

    try {
      const readingDurationSeconds = readingStartTime
        ? Math.floor((Date.now() - readingStartTime) / 1000)
        : 0;

      const payload = {
        policyId,
        templateVersion: template.version,
        visitedSteps: Array.from(visitedSteps).map((index) => STEPS[index].key),
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
        readingDurationSeconds,
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
    try {
      await api.post('/consent/continue-without-consent', {
        policyId,
        templateVersion: template?.version,
        visitedSteps: Array.from(visitedSteps).map((index) => STEPS[index].key),
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to record non-consent:', err);
    }
  };

  const handleRequestAlternative = async () => {
    try {
      await api.post('/consent/request-alternative', {
        policyId,
        templateVersion: template?.version,
        visitedSteps: Array.from(visitedSteps).map((index) => STEPS[index].key),
        requestMessage: 'Requested alternative consent method from wizard',
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to request alternative:', err);
    }
  };

  const variables = toVariables(template?.variables);
  const productName = variables.productName || 'Kodeit Ascend';

  const renderStepContent = () => {
    if (!template) return null;

    const currentStepKey = STEPS[activeStep].key;
    const currentStepData = (template.steps || []).find((s) => s.key === currentStepKey);
    const intro = getStepIntro(currentStepData, currentStepKey);

    if (currentStepKey === 'your_choices') {
      return (
        <YourChoicesLayout
          intro={intro}
          variables={variables}
          rights={template.guardianRights || []}
          onOpenConsent={() => setActiveStep(4)}
          onContinueWithoutConsent={handleContinueWithoutConsent}
          onRequestAlternative={handleRequestAlternative}
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
          />
        );
      case 'column_grid':
        return (
          <ColumnGridLayout
            intro={intro}
            items={currentStepData.items || []}
            variables={variables}
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
            onContinueWithoutConsent={handleContinueWithoutConsent}
          />
        );
      default:
        return <Alert severity="warning">Unknown layout type: {currentStepData.layout}</Alert>;
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
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
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
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
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          height: '92vh',
          maxWidth: 1100,
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
          <Box sx={{ px: { xs: 2, md: 3 }, pt: 2.5 }}>
            <ConsentHeroCard
              hero={template?.hero}
              variables={variables}
              isAdmin={false}
              steps={STEPS}
              activeStep={activeStep}
              visitedSteps={visitedSteps}
              onStepClick={handleStepClick}
            />
          </Box>

          <Box sx={{ px: { xs: 2, md: 4 }, py: 4 }}>
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

        <WizardFooter productName={productName} />
      </DialogContent>
    </Dialog>
  );
};

const WizardFooter = ({ productName }) => (
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
      <Box
        sx={{
          width: 18,
          height: 18,
          borderRadius: '4px',
          background: consentColors.footerText,
          opacity: 0.85,
        }}
      />
      <Typography sx={{ fontSize: '0.75rem', color: consentColors.footerText, fontWeight: 600 }}>
        {productName}
      </Typography>
    </Box>
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {['Privacy notice', 'Privacy contact', 'SDAIA'].map((label) => (
        <Typography
          key={label}
          sx={{ fontSize: '0.7rem', color: consentColors.footerText, cursor: 'pointer' }}
        >
          {label}
        </Typography>
      ))}
    </Box>
  </Box>
);

const CardGridLayout = ({ items, variables, onSeeChoices, intro }) => {
  const enabledItems = items.filter((item) => item.enabled !== false);

  return (
    <Box>
      <StepIntro intro={intro} variables={variables} />

      <Grid container spacing={2}>
        {enabledItems.map((item, index) => {
          const IconComponent = getIconComponent(item.icon);
          return (
            <Grid item xs={12} sm={6} lg={3} size={{ xs: 12, sm: 6, lg: 3 }} key={index}>
              <Card sx={{ ...wizardCardSx, height: '100%', p: 2.5 }}>
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
            <Typography sx={{ ...consentTypography.cardTitle, mb: 0.25 }}>
              Consent is optional
            </Typography>
            <Typography sx={{ ...consentTypography.body, fontSize: '0.8rem' }}>
              A student may continue without proctoring consent and may request an alternative
              assessment mechanism.
            </Typography>
          </Box>
        </Box>
        {onSeeChoices && (
          <Button
            endIcon={<ChevronRightIcon />}
            onClick={onSeeChoices}
            sx={{ ...primaryPillButtonSx, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            See your choices
          </Button>
        )}
      </Card>
    </Box>
  );
};

const ColumnGridLayout = ({ items, variables, intro }) => {
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
            <Typography
              sx={{
                ...consentTypography.body,
                color: consentColors.darkCardText,
                fontWeight: 700,
                fontSize: '0.95rem',
              }}
            >
              An automated flag is not proof of cheating.
            </Typography>
          </Grid>
          <Grid item xs={12} md={7} size={{ xs: 12, md: 7 }}>
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
                Relevant evidence and context should be reviewed by authorised School personnel
                before any material decision.
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Card>
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
  rights,
  onOpenConsent,
  onContinueWithoutConsent,
  onRequestAlternative,
}) => {
  const actions = [onOpenConsent, onContinueWithoutConsent, onRequestAlternative];

  return (
    <Box>
      <StepIntro intro={intro} variables={variables} />

      <Grid container spacing={2.5}>
        {CHOICE_PATHS.map((path, index) => (
          <Grid item xs={12} md={4} size={{ xs: 12, md: 4 }} key={path.numeral}>
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
                {path.numeral}
              </Typography>
              <Typography sx={{ ...consentTypography.cardTitle, mb: 1.25 }}>
                {path.title}
              </Typography>
              <Typography sx={{ ...consentTypography.body, mb: 3, flex: 1 }}>
                {path.body}
              </Typography>
              <Button
                fullWidth
                variant="contained"
                onClick={actions[index]}
                sx={primaryPillButtonSx}
              >
                {path.cta}
              </Button>
              {path.caption && (
                <Typography sx={{ ...consentTypography.caption, mt: 1, textAlign: 'center' }}>
                  {path.caption}
                </Typography>
              )}
            </Card>
          </Grid>
        ))}
      </Grid>

      {rights.filter((r) => r.enabled !== false).length > 0 && (
        <Card sx={{ ...wizardCardSx, mt: 3, p: 3 }}>
          <Typography sx={{ ...consentTypography.cardTitle, mb: 2 }}>
            Your Saudi PDPL rights
          </Typography>
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

export const SuccessBanner = () => (
  <Box
    sx={{
      mt: 2.5,
      background: consentColors.successBg,
      borderRadius: consentSpacing.cardRadius,
      p: 2.5,
    }}
  >
    <Typography
      sx={{
        fontWeight: 700,
        color: consentColors.successText,
        mb: 0.5,
        fontSize: '0.95rem',
      }}
    >
      Thank you. Your consent has been recorded.
    </Typography>
    <Typography sx={{ ...consentTypography.body, color: consentColors.successText }}>
      You may withdraw consent at any time through the School privacy contact.
    </Typography>
  </Box>
);

export const ConsentFieldsGrid = ({
  guardian,
  onGuardianChange,
  readOnly = false,
}) => (
  <Grid container spacing={2.5}>
    <Grid item xs={12} sm={6} size={{ xs: 12, sm: 6 }}>
      <TextField
        fullWidth
        label="Student full name"
        value={guardian.studentFullName}
        onChange={(e) => onGuardianChange?.('studentFullName', e.target.value)}
        size="small"
        disabled={readOnly}
        sx={fieldSx}
      />
    </Grid>
    <Grid item xs={12} sm={6} size={{ xs: 12, sm: 6 }}>
      <TextField
        fullWidth
        label="Student / Admission ID"
        value={guardian.studentAdmissionId}
        onChange={(e) => onGuardianChange?.('studentAdmissionId', e.target.value)}
        size="small"
        InputProps={{
          readOnly: true,
        }}
        sx={{
          ...fieldSx,
          '& .MuiOutlinedInput-root': {
            ...fieldSx['& .MuiOutlinedInput-root'],
            background: consentColors.readOnlyBg,
            color: consentColors.bodyText,
          },
        }}
      />
    </Grid>
    <Grid item xs={12} sm={6} size={{ xs: 12, sm: 6 }}>
      <TextField
        fullWidth
        label="Parent / Guardian name"
        value={guardian.guardianName}
        onChange={(e) => onGuardianChange?.('guardianName', e.target.value)}
        size="small"
        required
        disabled={readOnly}
        sx={fieldSx}
      />
    </Grid>
    <Grid item xs={12} sm={6} size={{ xs: 12, sm: 6 }}>
      <FormControl fullWidth size="small" required disabled={readOnly} sx={fieldSx}>
        <InputLabel>Relationship to student</InputLabel>
        <Select
          value={guardian.relationship}
          label="Relationship to student"
          onChange={(e) => onGuardianChange?.('relationship', e.target.value)}
        >
          <MenuItem value="parent">Parent</MenuItem>
          <MenuItem value="legal_guardian">Legal guardian</MenuItem>
          <MenuItem value="other_authorized_guardian">Other authorized guardian</MenuItem>
        </Select>
      </FormControl>
      <Typography sx={{ ...consentTypography.caption, mt: 0.6, ml: 0.25 }}>
        Select Â· Parent / Legal guardian / Other authorized guardian
      </Typography>
    </Grid>
    <Grid item xs={12} sm={6} size={{ xs: 12, sm: 6 }}>
      <TextField
        fullWidth
        label="Parent / Guardian email"
        type="email"
        value={guardian.guardianEmail}
        onChange={(e) => onGuardianChange?.('guardianEmail', e.target.value)}
        size="small"
        required
        disabled={readOnly}
        sx={fieldSx}
      />
    </Grid>
    <Grid item xs={12} sm={6} size={{ xs: 12, sm: 6 }}>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <FormControl size="small" sx={{ minWidth: 118, ...fieldSx }} disabled={readOnly}>
          <Select
            value={guardian.guardianMobile?.countryCode || '+966'}
            onChange={(e) => onGuardianChange?.('guardianMobile.countryCode', e.target.value)}
            displayEmpty
          >
            {COUNTRY_DIAL_CODES.map((c) => (
              <MenuItem key={c.code} value={c.code}>
                {c.flag} {c.code}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          fullWidth
          label="Mobile number"
          value={guardian.guardianMobile?.number || ''}
          onChange={(e) => onGuardianChange?.('guardianMobile.number', e.target.value)}
          size="small"
          disabled={readOnly}
          InputProps={{
            endAdornment: <PhoneOutlinedIcon sx={{ fontSize: 18, color: consentColors.bodyText }} />,
          }}
          sx={fieldSx}
        />
      </Box>
      <Typography sx={{ ...consentTypography.caption, mt: 0.6, ml: 0.25 }}>
        Country code Â· Mobile number
      </Typography>
    </Grid>
    <Grid item xs={12} size={{ xs: 12 }}>
      <TextField
        fullWidth
        multiline
        rows={3}
        value={guardian.remark}
        onChange={(e) => onGuardianChange?.('remark', e.target.value)}
        size="small"
        placeholder="Add a remark if you want (optional)."
        disabled={readOnly}
        sx={fieldSx}
      />
      <Typography sx={{ ...consentTypography.caption, mt: 0.6, ml: 0.25 }}>
        Add a remark if you want (optional).
      </Typography>
    </Grid>
  </Grid>
);
