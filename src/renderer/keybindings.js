// T3 packages/shared/src/keybindings.ts + apps/web/src/keybindings.ts + shortcutModifierState.ts,
// reduced to the commands t3rmes runs. T3 keeps overrides in the server's keybindings.json;
// here they live in localStorage, per command, on top of the defaults.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const STORAGE_KEY = 't3rmes:keybindings:v1';
export const IS_MAC = /mac/i.test(navigator.platform);

export const THREAD_JUMP_COMMANDS = Array.from({ length: 9 }, (_, index) => `thread.jump.${index + 1}`);

// T3 DEFAULT_KEYBINDINGS, minus terminal, preview, diff, palette, editor and project commands.
const DEFAULT_KEYBINDINGS = [
  { key: 'mod+b', command: 'sidebar.toggle' },
  { key: 'mod+n', command: 'chat.new' },
  { key: 'mod+shift+o', command: 'chat.new' },
  { key: 'mod+shift+m', command: 'modelPicker.toggle' },
  { key: 'mod+alt+shift+a', command: 'appearance.cycle' },
  { key: 'mod+shift+[', command: 'thread.previous' },
  { key: 'mod+shift+]', command: 'thread.next' },
  { key: 'mod+shift+c', command: 'thread.copyReference' },
  { key: 'mod+shift+s', command: 'thread.settle' },
  { key: 'mod+shift+p', command: 'thread.pin' },
  ...THREAD_JUMP_COMMANDS.map((command, index) => ({ key: `mod+${index + 1}`, command })),
];

export const KEYBINDING_COMMANDS = [...new Set(DEFAULT_KEYBINDINGS.map((binding) => binding.command))];

const COMMAND_LABELS = {
  'thread.copyReference': 'Thread: Copy Session ID',
};

// T3 KeybindingsSettings.logic.ts commandLabel.
export function commandLabel(command) {
  if (COMMAND_LABELS[command]) return COMMAND_LABELS[command];
  const titleCase = (segment) =>
    segment
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
      .join(' ');
  return command.split('.').map(titleCase).join(': ');
}

export function defaultKeysForCommand(command) {
  return DEFAULT_KEYBINDINGS.filter((binding) => binding.command === command).map((binding) => binding.key);
}

function normalizeKeyToken(token) {
  if (token === 'space') return ' ';
  if (token === 'esc') return 'escape';
  return token;
}

export function parseKeybindingShortcut(value) {
  const tokens = value
    .toLowerCase()
    .split('+')
    .map((token) => token.trim());
  let trailingEmptyCount = 0;
  while (tokens[tokens.length - 1] === '') {
    trailingEmptyCount += 1;
    tokens.pop();
  }
  if (trailingEmptyCount > 0) tokens.push('+');
  if (tokens.length === 0 || tokens.some((token) => token.length === 0)) return null;

  const shortcut = { key: null, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: false };
  for (const token of tokens) {
    if (token === 'cmd' || token === 'meta') shortcut.metaKey = true;
    else if (token === 'ctrl' || token === 'control') shortcut.ctrlKey = true;
    else if (token === 'shift') shortcut.shiftKey = true;
    else if (token === 'alt' || token === 'option') shortcut.altKey = true;
    else if (token === 'mod') shortcut.modKey = true;
    else {
      if (shortcut.key !== null) return null;
      shortcut.key = normalizeKeyToken(token);
    }
  }
  return shortcut.key === null ? null : shortcut;
}

const EVENT_CODE_SHORTCUT_KEYS = {
  Backquote: '`',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Digit0: '0',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit6: '6',
  Digit7: '7',
  Digit8: '8',
  Digit9: '9',
  Equal: '=',
  Minus: '-',
  Period: '.',
  Quote: "'",
  Semicolon: ';',
  Slash: '/',
};

function normalizeEventKey(key) {
  const normalized = key.toLowerCase();
  return normalized === 'esc' ? 'escape' : normalized;
}

// Shift turns "[" into "{" and "1" into "!", so the physical key decides for symbols and digits.
export function shortcutKeyFromEvent(event) {
  const layoutKey = normalizeEventKey(event.key);
  if (/^[a-z]$/.test(layoutKey)) return layoutKey;
  return (event.code && EVENT_CODE_SHORTCUT_KEYS[event.code]) ?? layoutKey;
}

function resolveEventKeys(event) {
  const layoutKey = normalizeEventKey(event.key);
  const keys = new Set([layoutKey]);
  const letterCode = event.code?.match(/^Key([A-Z])$/)?.[1];
  if (letterCode && !/^[a-z]$/.test(layoutKey)) keys.add(letterCode.toLowerCase());
  keys.add(shortcutKeyFromEvent(event));
  return keys;
}

function matchesShortcutModifiers(event, shortcut) {
  const expectedMeta = shortcut.metaKey || (shortcut.modKey && IS_MAC);
  const expectedCtrl = shortcut.ctrlKey || (shortcut.modKey && !IS_MAC);
  return (
    event.metaKey === expectedMeta &&
    event.ctrlKey === expectedCtrl &&
    event.shiftKey === shortcut.shiftKey &&
    event.altKey === shortcut.altKey
  );
}

function matchesShortcut(event, shortcut) {
  if (!IS_MAC && event.getModifierState?.('AltGraph') && !/^[a-z0-9]$/i.test(event.key)) return false;
  if (!matchesShortcutModifiers(event, shortcut)) return false;
  return resolveEventKeys(event).has(shortcut.key);
}

function shortcutConflictKey(shortcut) {
  const metaKey = shortcut.metaKey || (shortcut.modKey && IS_MAC);
  const ctrlKey = shortcut.ctrlKey || (shortcut.modKey && !IS_MAC);
  return [shortcut.key, metaKey ? 'meta' : '', ctrlKey ? 'ctrl' : '', shortcut.shiftKey ? 'shift' : '', shortcut.altKey ? 'alt' : ''].join('|');
}

export function keyConflictKey(key) {
  const shortcut = parseKeybindingShortcut(key);
  return shortcut ? shortcutConflictKey(shortcut) : null;
}

// ---------- user overrides ----------

function readOverrides() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!value || typeof value !== 'object') return {};
    const overrides = {};
    for (const command of KEYBINDING_COMMANDS) {
      const keys = value[command];
      if (Array.isArray(keys)) overrides[command] = keys.filter((key) => typeof key === 'string' && parseKeybindingShortcut(key));
    }
    return overrides;
  } catch {
    return {};
  }
}

/** Defaults first, overrides after: like T3, later bindings win a shared shortcut. */
function compileKeybindings(overrides) {
  const rules = [
    ...DEFAULT_KEYBINDINGS.filter((binding) => !(binding.command in overrides)),
    ...Object.entries(overrides).flatMap(([command, keys]) => keys.map((key) => ({ key, command }))),
  ];
  return rules.map((rule) => ({ ...rule, shortcut: parseKeybindingShortcut(rule.key) })).filter((rule) => rule.shortcut);
}

let overrides = readOverrides();
let snapshot = { overrides, bindings: compileKeybindings(overrides) };
const listeners = new Set();

function commit(next) {
  overrides = next;
  if (Object.keys(next).length === 0) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  snapshot = { overrides, bindings: compileKeybindings(overrides) };
  listeners.forEach((listener) => listener());
}

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  overrides = readOverrides();
  snapshot = { overrides, bindings: compileKeybindings(overrides) };
  listeners.forEach((listener) => listener());
});

export function useKeybindings() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}

/** Keys bound to `command` right now (its override, else its defaults). */
export function keysForCommand(command, state = snapshot) {
  return state.overrides[command] ?? defaultKeysForCommand(command);
}

export function setCommandKeys(command, keys) {
  commit({ ...overrides, [command]: keys });
}

export function resetCommandKeys(command) {
  const next = { ...overrides };
  delete next[command];
  commit(next);
}

// ---------- matching ----------

export function resolveShortcutCommand(event, bindings) {
  for (let index = bindings.length - 1; index >= 0; index -= 1) {
    const binding = bindings[index];
    if (matchesShortcut(event, binding.shortcut)) return binding.command;
  }
  return null;
}

function findEffectiveShortcutForCommand(bindings, command) {
  const claimed = new Set();
  for (let index = bindings.length - 1; index >= 0; index -= 1) {
    const binding = bindings[index];
    const conflictKey = shortcutConflictKey(binding.shortcut);
    if (claimed.has(conflictKey)) continue;
    claimed.add(conflictKey);
    if (binding.command === command) return binding.shortcut;
  }
  return null;
}

/** Commands whose shortcut a binding for `key` would take over. */
export function commandsShadowedByKey(bindings, key, ownCommand) {
  const conflictKey = keyConflictKey(key);
  if (!conflictKey) return [];
  return [
    ...new Set(
      bindings.filter((binding) => binding.command !== ownCommand && shortcutConflictKey(binding.shortcut) === conflictKey).map((binding) => binding.command),
    ),
  ];
}

export function formatShortcutKeyLabel(key) {
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  if (key === 'escape') return 'Esc';
  if (key === 'arrowup') return 'Up';
  if (key === 'arrowdown') return 'Down';
  if (key === 'arrowleft') return 'Left';
  if (key === 'arrowright') return 'Right';
  return key.slice(0, 1).toUpperCase() + key.slice(1);
}

export function formatShortcutLabel(shortcut) {
  const keyLabel = formatShortcutKeyLabel(shortcut.key);
  const showMeta = shortcut.metaKey || (shortcut.modKey && IS_MAC);
  const showCtrl = shortcut.ctrlKey || (shortcut.modKey && !IS_MAC);
  if (IS_MAC) {
    return `${showCtrl ? '\u2303' : ''}${shortcut.altKey ? '\u2325' : ''}${shortcut.shiftKey ? '\u21e7' : ''}${showMeta ? '\u2318' : ''}${keyLabel}`;
  }
  const parts = [];
  if (showCtrl) parts.push('Ctrl');
  if (shortcut.altKey) parts.push('Alt');
  if (shortcut.shiftKey) parts.push('Shift');
  if (showMeta) parts.push('Meta');
  parts.push(keyLabel);
  return parts.join('+');
}

export function shortcutLabelForCommand(bindings, command) {
  const shortcut = findEffectiveShortcutForCommand(bindings, command);
  return shortcut ? formatShortcutLabel(shortcut) : null;
}

export function threadJumpIndexFromCommand(command) {
  const index = THREAD_JUMP_COMMANDS.indexOf(command);
  return index === -1 ? null : index;
}

export function shouldShowThreadJumpHintsForModifiers(modifiers, bindings) {
  for (const command of THREAD_JUMP_COMMANDS) {
    const shortcut = findEffectiveShortcutForCommand(bindings, command);
    if (shortcut && matchesShortcutModifiers(modifiers, shortcut)) return true;
  }
  return false;
}

// T3 KeybindingsSettings.logic.ts keybindingFromKeyboardEvent.
function normalizeRecordedKeyToken(key) {
  const normalized = key.toLowerCase();
  if (['meta', 'control', 'ctrl', 'shift', 'alt', 'option', 'altgraph', 'os'].includes(normalized)) return null;
  if (normalized === ' ') return 'space';
  if (normalized === 'escape') return 'esc';
  if (normalized.length === 1) return normalized;
  if (/^(arrow(up|down|left|right)|f\d{1,2}|enter|tab|backspace|delete|home|end|pageup|pagedown)$/.test(normalized)) return normalized;
  return null;
}

export function keybindingFromKeyboardEvent(event) {
  const keyToken = normalizeRecordedKeyToken(shortcutKeyFromEvent(event));
  if (!keyToken) return null;
  const parts = [];
  if (IS_MAC) {
    if (event.metaKey) parts.push('mod');
    if (event.ctrlKey) parts.push('ctrl');
  } else {
    if (event.ctrlKey) parts.push('mod');
    if (event.metaKey) parts.push('meta');
  }
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  if (parts.length === 0) return null;
  parts.push(keyToken);
  return parts.join('+');
}

/** App-level shortcuts stay quiet while a modal (settings) is open over the app. */
export function isAppModalOpen() {
  return Boolean(document.querySelector('[data-app-modal]'));
}

export function isModelPickerOpen() {
  return Boolean(document.querySelector('[data-model-picker-content]'));
}

// ---------- held modifiers (T3 shortcutModifierState.ts) ----------

const EMPTY_MODIFIERS = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };

const sameModifiers = (a, b) => a.metaKey === b.metaKey && a.ctrlKey === b.ctrlKey && a.altKey === b.altKey && a.shiftKey === b.shiftKey;

function modifierName(key) {
  if (key === 'Meta' || key === 'OS' || key === 'Command') return 'metaKey';
  if (key === 'Control') return 'ctrlKey';
  if (key === 'Alt' || key === 'Option') return 'altKey';
  if (key === 'Shift') return 'shiftKey';
  return null;
}

function modifiersAfterKeyboardEvent(current, event) {
  const name = modifierName(event.key);
  // Flags on other keys may only clear a bit: a dictation tool's synthetic paste can leave
  // a modifier flag set on later events, which would pin the jump hints on screen.
  const next = name
    ? { ...current, [name]: event.type === 'keydown' }
    : {
        metaKey: current.metaKey && event.metaKey,
        ctrlKey: current.ctrlKey && event.ctrlKey,
        altKey: current.altKey && event.altKey,
        shiftKey: current.shiftKey && event.shiftKey,
      };
  return sameModifiers(current, next) ? current : next;
}

export function useShortcutModifierState() {
  const [state, setState] = useState(EMPTY_MODIFIERS);
  useEffect(() => {
    const onKeyboardEvent = (event) => setState((current) => modifiersAfterKeyboardEvent(current, event));
    const onReset = () => setState((current) => (sameModifiers(current, EMPTY_MODIFIERS) ? current : EMPTY_MODIFIERS));
    window.addEventListener('keydown', onKeyboardEvent, true);
    window.addEventListener('keyup', onKeyboardEvent, true);
    window.addEventListener('paste', onReset, true);
    window.addEventListener('blur', onReset);
    return () => {
      window.removeEventListener('keydown', onKeyboardEvent, true);
      window.removeEventListener('keyup', onKeyboardEvent, true);
      window.removeEventListener('paste', onReset, true);
      window.removeEventListener('blur', onReset);
    };
  }, []);
  return state;
}

const THREAD_JUMP_HINT_SHOW_DELAY_MS = 200;

/** T3 useThreadJumpHintVisibility: hints appear after a short hold and hide at once. */
export function useThreadJumpHintVisibility(shouldShow) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef(null);
  useEffect(() => {
    window.clearTimeout(timeoutRef.current);
    if (!shouldShow) {
      setVisible(false);
      return undefined;
    }
    timeoutRef.current = window.setTimeout(() => setVisible(true), THREAD_JUMP_HINT_SHOW_DELAY_MS);
    return () => window.clearTimeout(timeoutRef.current);
  }, [shouldShow]);
  return visible;
}
