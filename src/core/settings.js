// Persistent user settings
const KEY = 'bw69.settings.v1';
export const DEFAULTS = {
  sensitivity: 3.0,      // CoD-like scale (0.022°/count * sens)
  adsSens: 0.85,         // ADS multiplier (also scaled by zoom)
  fov: 100,              // horizontal FOV
  volume: 0.8,
  quality: 'auto',       // 'auto' looks at the graphics chip, see engine.js
  autoDown: null,        // Auto ran too slow here once: start no higher than this
  dynamicRes: true,
  autoSprint: false,
  showFps: true,
  invertY: false,
  loadout: { primary: 'ar', primaryOptic: 'reflex', secondary: 'pistol', secondaryOptic: 'iron' },
  match: { map: 'drydock', mode: 'tdm', bots: 5, difficulty: 'regular' },
  skins: {},             // weapon id -> skin; what isn't in here is Standard
};

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    // up to 0.5.0 everybody got 'medium' saved without choosing it: that becomes Auto (a chosen Niedrig or Hoch stays)
    if (s.quality === 'medium' && !s.qualityPicked) s.quality = 'auto';
    return { ...DEFAULTS, ...s, loadout: { ...DEFAULTS.loadout, ...(s.loadout || {}) }, match: { ...DEFAULTS.match, ...(s.match || {}) }, skins: { ...(s.skins || {}) } };
  } catch (e) { return structuredClone(DEFAULTS); }
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ }
}
