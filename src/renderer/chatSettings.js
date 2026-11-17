import { useSyncExternalStore } from 'react';

// T3 settings: ChatSettingsPanel. Only the options Hermes can back.

const TOOL_CALL_VISIBILITY_KEY = 't3rmes:tool-call-visibility';
export const TOOL_CALL_VISIBILITIES = ['showAll', 'hideSuccessful', 'hideAll', 'zen'];
export const DEFAULT_TOOL_CALL_VISIBILITY = 'showAll';
export const TOOL_CALL_VISIBILITY_LABELS = {
  showAll: 'Show all',
  hideSuccessful: 'Hide successful',
  hideAll: 'Hide all',
  zen: 'Zen',
};

const SEND_SHORTCUT_KEY = 't3rmes:send-shortcut';
export const SEND_SHORTCUTS = ['enter', 'mod-enter-multiline', 'mod-enter'];
export const DEFAULT_SEND_SHORTCUT = 'enter';

const listeners = new Set();

function readSetting(key, values, fallback) {
  const value = localStorage.getItem(key);
  return values.includes(value) ? value : fallback;
}

function writeSetting(key, value, fallback) {
  if (value === fallback) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  const onStorage = (event) => (event.key === TOOL_CALL_VISIBILITY_KEY || event.key === SEND_SHORTCUT_KEY) && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const readToolCallVisibility = () => readSetting(TOOL_CALL_VISIBILITY_KEY, TOOL_CALL_VISIBILITIES, DEFAULT_TOOL_CALL_VISIBILITY);
const readSendShortcut = () => readSetting(SEND_SHORTCUT_KEY, SEND_SHORTCUTS, DEFAULT_SEND_SHORTCUT);

export function useToolCallVisibility() {
  return useSyncExternalStore(subscribe, readToolCallVisibility);
}

export function setToolCallVisibility(value) {
  writeSetting(TOOL_CALL_VISIBILITY_KEY, value, DEFAULT_TOOL_CALL_VISIBILITY);
}

export function useSendShortcut() {
  return useSyncExternalStore(subscribe, readSendShortcut);
}

export function setSendShortcut(value) {
  writeSetting(SEND_SHORTCUT_KEY, value, DEFAULT_SEND_SHORTCUT);
}

// T3 composer-logic.ts composerRequiresModifier.
export function composerRequiresModifier(sendShortcut, prompt) {
  return sendShortcut === 'mod-enter' || (sendShortcut === 'mod-enter-multiline' && /[\r\n]/.test(prompt));
}
