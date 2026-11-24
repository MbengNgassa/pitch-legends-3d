const SETTINGS_KEY = 'pitch_legends_3d_settings_v1';

export const QUALITY_PRESETS = {
  low: {
    id: 'low',
    label: 'Cool / Battery Saver',
    shortLabel: 'Cool',
    tagline: 'Best for older/weaker phones & zero overheating',
    fpsCap: 30,
    pixelRatioCap: 0.85,
    shadows: false,
    shadowSize: 512,
    crowdScale: 0.3,
    particlesMul: 0.4,
    volumetricLights: false,
    cssBlur: false,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced (Recommended)',
    shortLabel: 'Balanced',
    tagline: 'Crisp 3D graphics while keeping phones cool (S21 Ultra, etc.)',
    fpsCap: 45,
    pixelRatioCap: 1.05,
    shadows: true,
    shadowSize: 512,
    crowdScale: 0.55,
    particlesMul: 0.7,
    volumetricLights: false,
    cssBlur: false,
  },
  high: {
    id: 'high',
    label: 'High / Ultra',
    shortLabel: 'Ultra',
    tagline: 'Full shadows, dense cheering crowds & fireworks (Desktop / Plugged-in)',
    fpsCap: 60,
    pixelRatioCap: 1.5,
    shadows: true,
    shadowSize: 1024,
    crowdScale: 1.0,
    particlesMul: 1.0,
    volumetricLights: true,
    cssBlur: true,
  },
};

export function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
  const minSide = Math.min(window.innerWidth || 800, window.innerHeight || 600);
  return hasTouch || minSide < 720;
}

export function getDefaultSettings() {
  const mobile = isMobileDevice();
  const presetKey = mobile ? 'balanced' : 'high';
  const preset = QUALITY_PRESETS[presetKey];
  return {
    quality: presetKey,
    fpsCap: preset.fpsCap,
    shadows: preset.shadows,
    pixelRatioCap: mobile ? preset.pixelRatioCap : 1.75,
  };
}

export function loadGraphicsSettings() {
  const defaults = getDefaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const quality = QUALITY_PRESETS[parsed.quality] ? parsed.quality : defaults.quality;
    const preset = QUALITY_PRESETS[quality];
    return {
      quality,
      fpsCap: [30, 45, 60].includes(Number(parsed.fpsCap)) ? Number(parsed.fpsCap) : preset.fpsCap,
      shadows: typeof parsed.shadows === 'boolean' ? parsed.shadows : preset.shadows,
      pixelRatioCap:
        typeof parsed.pixelRatioCap === 'number' && parsed.pixelRatioCap >= 0.6 && parsed.pixelRatioCap <= 2.0
          ? parsed.pixelRatioCap
          : preset.pixelRatioCap,
    };
  } catch {
    return defaults;
  }
}

export function saveGraphicsSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function applyPresetToSettings(presetId) {
  const preset = QUALITY_PRESETS[presetId] || QUALITY_PRESETS.balanced;
  const mobile = isMobileDevice();
  return {
    quality: preset.id,
    fpsCap: preset.fpsCap,
    shadows: preset.shadows,
    pixelRatioCap: !mobile && preset.id === 'high' ? 1.75 : preset.pixelRatioCap,
  };
}

export function resolveEffectiveGraphics(settings) {
  const preset = QUALITY_PRESETS[settings?.quality] || QUALITY_PRESETS.balanced;
  const mobile = isMobileDevice();
  return {
    ...preset,
    quality: preset.id,
    fpsCap: [30, 45, 60].includes(Number(settings?.fpsCap)) ? Number(settings.fpsCap) : preset.fpsCap,
    shadows: typeof settings?.shadows === 'boolean' ? settings.shadows : preset.shadows,
    pixelRatioCap:
      typeof settings?.pixelRatioCap === 'number'
        ? settings.pixelRatioCap
        : !mobile && preset.id === 'high'
          ? 1.75
          : preset.pixelRatioCap,
    shadowSize: !mobile && preset.id === 'high' ? 2048 : preset.shadowSize,
  };
}
