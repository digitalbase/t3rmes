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

const listeners = new Set();

function read() {
  const value = localStorage.getItem(TOOL_CALL_VISIBILITY_KEY);
  return TOOL_CALL_VISIBILITIES.includes(value) ? value : DEFAULT_TOOL_CALL_VISIBILITY;
}

function subscribe(listener) {
  listeners.add(listener);
  const onStorage = (event) => event.key === TOOL_CALL_VISIBILITY_KEY && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useToolCallVisibility() {
  return useSyncExternalStore(subscribe, read);
}

export function setToolCallVisibility(value) {
  if (value === DEFAULT_TOOL_CALL_VISIBILITY) localStorage.removeItem(TOOL_CALL_VISIBILITY_KEY);
  else localStorage.setItem(TOOL_CALL_VISIBILITY_KEY, value);
  for (const listener of listeners) listener();
}
