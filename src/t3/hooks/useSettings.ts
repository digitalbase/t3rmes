// t3rmes shim: upstream useSettings pulls in T3's settings RPC stack.
// t3rmes has no client settings, so selectors read T3's defaults.
const CLIENT_SETTINGS_DEFAULTS = {
  panelAnimationDurationMs: 0,
  sidebarWorkingShelfEnabled: true,
} as const;

type ClientSettings = typeof CLIENT_SETTINGS_DEFAULTS;

export function useClientSettings<T>(selector: (settings: ClientSettings) => T): T {
  return selector(CLIENT_SETTINGS_DEFAULTS);
}
