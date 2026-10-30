// Persistent user settings
const KEY = 'bw69.settings.v1';
export const DEFAULTS = {
  sensitivity: 3.0,      // CoD-like scale (0.022°/count * sens)
  adsSens: 0.85,         // ADS multiplier (also scaled by zoom)
  fov: 100,              // horizontal FOV
  volume: 0.8,
  quality: 'medium',
  dynamicRes: true,
  autoSprint: false,
  showFps: true,
  invertY: false,
  loadout: { primary: 'ar', primaryOptic: 'reflex', secondary: 'pistol' },
  match: { map: 'drydock', mode: 'tdm', bots: 5, difficulty: 'regular' },
};

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...s, loadout: { ...DEFAULTS.loadout, ...(s.loadout || {}) }, match: { ...DEFAULTS.match, ...(s.match || {}) } };
  } catch (e) { return structuredClone(DEFAULTS); }
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ }
}
