// T3's appearance runtime (hooks/useTheme.ts, themePalette.ts, appInit.tsx), reduced to
// built-in themes: a light/dark/system mode, a theme per mode ("halves"), and interface knobs.
import { useSyncExternalStore } from 'react';
import { BUILT_IN_THEMES, THEME_COLOR_ROLES, getThemeColorsForAppearance } from '../t3/themePalettes.ts';

// Keep these keys in sync with the boot script in index.html.
const MODE_KEY = 't3rmes:theme-appearance-mode';
const HALVES_KEY = 't3rmes:theme-halves:v1';
const INTERFACE_KEY = 't3rmes:appearance:v1';

export const MIN_APPEARANCE_CONTRAST = 50;
export const MAX_APPEARANCE_CONTRAST = 200;
export const MIN_GLASS_OPACITY = 40;
export const MAX_GLASS_OPACITY = 100;
export const MIN_INTERFACE_FONT_SIZE = 12;
export const MAX_INTERFACE_FONT_SIZE = 20;

export const DEFAULT_INTERFACE_SETTINGS = {
  appearanceContrast: 100,
  glassOpacity: 80,
  chatWidth: 'comfortable',
  fontSizeInterface: 16,
};

const themeVariable = (role) =>
  role === 'terminalSelection'
    ? '--app-theme-terminal-selection-background'
    : `--app-theme-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

export function getThemeDefinition(id) {
  return (id && BUILT_IN_THEMES.find((theme) => theme.id === id)) || null;
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
}

function readHalves() {
  const raw = readJson(HALVES_KEY, {});
  const halves = {};
  for (const appearance of ['light', 'dark']) {
    const theme = getThemeDefinition(raw[appearance]);
    if (theme && getThemeColorsForAppearance(theme, appearance)) halves[appearance] = theme.id;
  }
  return halves;
}

function readMode() {
  const mode = localStorage.getItem(MODE_KEY);
  return mode === 'light' || mode === 'dark' ? mode : 'system';
}

const clamp = (value, min, max, fallback) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

function readInterface() {
  const raw = readJson(INTERFACE_KEY, {});
  const d = DEFAULT_INTERFACE_SETTINGS;
  return {
    appearanceContrast: clamp(raw.appearanceContrast, MIN_APPEARANCE_CONTRAST, MAX_APPEARANCE_CONTRAST, d.appearanceContrast),
    glassOpacity: clamp(raw.glassOpacity, MIN_GLASS_OPACITY, MAX_GLASS_OPACITY, d.glassOpacity),
    chatWidth: ['comfortable', 'wide', 'full'].includes(raw.chatWidth) ? raw.chatWidth : d.chatWidth,
    fontSizeInterface: clamp(raw.fontSizeInterface, MIN_INTERFACE_FONT_SIZE, MAX_INTERFACE_FONT_SIZE, d.fontSizeInterface),
  };
}

const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();
let snapshot = null;

function compute() {
  const mode = readMode();
  const appearance = mode === 'system' ? (systemDarkQuery.matches ? 'dark' : 'light') : mode;
  return { mode, appearance, halves: readHalves(), interface: readInterface() };
}

function apply(next) {
  const root = document.documentElement;
  root.classList.toggle('dark', next.appearance === 'dark');
  root.style.colorScheme = next.appearance;
  root.style.removeProperty('background-color');
  const theme = getThemeDefinition(next.halves[next.appearance]);
  const colors = theme && getThemeColorsForAppearance(theme, next.appearance);
  if (colors) {
    root.dataset.themeId = theme.id;
    for (const role of THEME_COLOR_ROLES) root.style.setProperty(themeVariable(role), colors[role]);
  } else {
    delete root.dataset.themeId;
    for (const role of THEME_COLOR_ROLES) root.style.removeProperty(themeVariable(role));
  }

  const { appearanceContrast: contrast, glassOpacity, chatWidth, fontSizeInterface } = next.interface;
  root.style.setProperty('--appearance-contrast-base', `${Math.min(contrast, 100)}%`);
  root.style.setProperty('--appearance-contrast-boost', `${Math.max(contrast - 100, 0)}%`);
  root.style.setProperty('--appearance-contrast-border-boost', `${Math.max(contrast - 100, 0) / 4}%`);
  root.style.setProperty('--glass-opacity', `${glassOpacity}%`);
  if (glassOpacity === 100) root.style.setProperty('--glass-blur', '0px');
  else root.style.removeProperty('--glass-blur');
  root.dataset.chatWidth = chatWidth;
  root.style.fontSize = `${fontSizeInterface}px`;
}

function refresh() {
  snapshot = compute();
  apply(snapshot);
  for (const listener of listeners) listener();
}

refresh();
systemDarkQuery.addEventListener('change', refresh);
window.addEventListener('storage', (event) => {
  if (event.key?.startsWith('t3rmes:')) refresh();
});

export function useAppearance() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}

export function setAppearanceMode(mode) {
  if (mode === 'system') localStorage.removeItem(MODE_KEY);
  else localStorage.setItem(MODE_KEY, mode);
  refresh();
}

/** `themeId` null restores the standard T3 Code palette for that mode. */
export function setThemeHalf(appearance, themeId) {
  const halves = { ...readHalves() };
  if (themeId) halves[appearance] = themeId;
  else delete halves[appearance];
  localStorage.setItem(HALVES_KEY, JSON.stringify(halves));
  refresh();
}

/** Uses a theme for every mode it ships; null is the standard T3 Code theme. */
export function applyThemeEverywhere(themeId) {
  const theme = getThemeDefinition(themeId);
  const halves = {};
  if (theme) for (const appearance of ['light', 'dark']) if (getThemeColorsForAppearance(theme, appearance)) halves[appearance] = theme.id;
  localStorage.setItem(HALVES_KEY, JSON.stringify(halves));
  refresh();
}

export function updateInterfaceSettings(patch) {
  localStorage.setItem(INTERFACE_KEY, JSON.stringify({ ...readInterface(), ...patch }));
  refresh();
}
