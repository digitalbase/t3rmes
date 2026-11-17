// Omarchy renders a T3 Code theme (t3code.json) on every theme switch. Read it straight from
// Omarchy's state dir so t3rmes follows along without a hook; on machines without Omarchy
// the directory is missing and nothing is read or watched.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CURRENT_DIR = path.join(
  process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'),
  'omarchy',
  'current',
);
const THEME_FILE = path.join(CURRENT_DIR, 'theme', 't3code.json');
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function readOmarchyTheme() {
  let raw;
  try {
    raw = fs.readFileSync(THEME_FILE, 'utf8');
  } catch {
    return null;
  }
  // A theme without an accent or background leaves template placeholders unresolved.
  if (raw.includes('{{')) return null;
  try {
    const file = JSON.parse(raw);
    if (file?.appearance !== 'light' && file?.appearance !== 'dark') return null;
    const seeded = HEX.test(file.canvas ?? '') && HEX.test(file.accent ?? '');
    const colors = file.colors && typeof file.colors === 'object' ? file.colors : undefined;
    if (!seeded && !(colors && Object.keys(colors).length > 0)) return null;
    return {
      appearance: file.appearance,
      ...(seeded ? { canvas: file.canvas, accent: file.accent } : {}),
      ...(colors ? { colors } : {}),
    };
  } catch {
    return null;
  }
}

/** Calls `onChange(theme | null)` after Omarchy switches themes. Returns a stop function. */
function watchOmarchyTheme(onChange) {
  if (!fs.existsSync(CURRENT_DIR)) return () => {};
  let timer = null;
  let watcher;
  try {
    // omarchy-theme-set bumps theme.generation once the new theme files are in place.
    watcher = fs.watch(CURRENT_DIR, (_event, filename) => {
      if (filename && filename !== 'theme.generation' && filename !== 'theme') return;
      clearTimeout(timer);
      timer = setTimeout(() => onChange(readOmarchyTheme()), 150);
    });
  } catch {
    return () => {};
  }
  return () => {
    clearTimeout(timer);
    watcher.close();
  };
}

module.exports = { readOmarchyTheme, watchOmarchyTheme };
