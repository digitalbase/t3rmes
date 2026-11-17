# t3rmes

A small, fast Electron + React desktop client for Hermes that looks exactly like T3 Code.

## Goals

- Match T3 Code. When a screen differs from T3, T3 is right. Port from upstream T3 sources before inventing UI.
- Stay lean and fast, unlike Hermes Desktop. Keep the renderer small. Prefer good defaults to new settings.
- Follow Hermes semantics. Don't invent features Hermes lacks; for example, there is no snooze.

## Workflow

- Make one small, focused commit for each completed change. Leave unrelated working-tree changes out.
- Keep `npm run dev` running so the user can test. Restart it after editing `electron/` (main or preload):
  ```
  pkill -f "concurrently -k"; pkill -f "electron \."; pkill -f "vite --host 127.0.0.1 --port 5175"
  npm run dev > /tmp/opencode/t3rmes-dev.log 2>&1   # background, repo root
  ```
- After edits, run `NO_COLOR=1 npx vite build` to check the build.
- This repo (`/home/gijs/Work/digitalbase/t3rmes`) is the canonical one. The `~/.t3/projects/t3rmes` and `~/.t3-stable/projects/t3rmes` dirs only forward here.

## Testing the UI

Drive the dev window over the Chrome DevTools Protocol. In dev, `electron/main.cjs` opens port 9333 on 127.0.0.1. OS mouse control isn't available because `ydotool`/`dotool` aren't installed.

```
node scripts/cdp.mjs shot /tmp/opencode/x.png       # screenshot, then read the PNG
node scripts/cdp.mjs click '[aria-label="Settings"]'
node scripts/cdp.mjs clickxy 100 200
node scripts/cdp.mjs type 'hello'
node scripts/cdp.mjs key Escape
node scripts/cdp.mjs eval 'document.documentElement.className'
```

Verify visual changes with a screenshot, in both light and dark mode when colours are involved. Testing changes the user's stored appearance settings, so restore them afterwards or tell the user.

## T3 sources

- The vendored T3 UI lives in `src/t3`, synced from upstream T3 at `/home/gijs/Work/digitalbase/t3code`. Read upstream with `git show origin/main:apps/web/src/...`.
- Shims replace T3's settings and contracts stack. Keep them tiny:
  - `src/t3/hooks/useSettings.ts` only provides `useClientSettings`.
  - `src/t3/lib/utils.ts` only exports `cn`, `isMacPlatform` and `isWindowsPlatform`.
- Don't import T3's `ui/spinner.tsx` in renderer code. Use the local `Spinner` in `main.jsx`.

## Hermes

- Never spawn plain `hermes`. Use `resolveHermesCommand()`, which resolves to `~/.local/bin/hermes`.
- Session edits are revision-fenced. Take a mutation snapshot, then PATCH with `request_id` and `expected_revision`. Retry once on 409.
- Bulk edits go through `hermes.patchThreads`.

## Sidebar

- Map thread status from Hermes only:
  - pinned → `pinned`
  - settled → `archived`
  - Working → `running`, or live `working`/`starting`
  - Input → `waiting`
  - Done → `unread`
  - Failed → errored last turn
  - recede → `!is_active`
- Order: Pinned and Active cards first, then the "Working" shelf (`mt-auto`), then "Settled" as slim rows. Shelf headers use `-ms-px` to line up with the footer cog.
- Cards keep the turns (tool calls) and chat (message) counters.
- Multi-select: Ctrl/Cmd toggles, Shift selects a range, Escape clears. Right-click opens a native bulk context menu.
- Search shows local title matches first, then server content matches from `GET /api/sessions/search`. The project filter persists in localStorage `t3rmes_project_scope`.

## Appearance and settings

- Built-in themes only. No custom theme import, theme editor or font family picker.
- localStorage keys:
  - `t3rmes:theme-appearance-mode` holds light or dark. System is the default, stored as no key.
  - `t3rmes:theme-halves:v1` holds the per-mode theme.
  - `t3rmes:appearance:v1` holds `appearanceContrast`, `glassOpacity`, `chatWidth` and `fontSizeInterface`.
- `src/renderer/appearance.js` owns the runtime. `index.html` has a boot script that applies the mode before React loads, so don't hard-code `dark`. The Electron window `backgroundColor` follows `nativeTheme`.
- Theme variables map role camelCase to `--app-theme-kebab`. The exception is `terminalSelection`, which maps to `--app-theme-terminal-selection-background`.
- Use theme tokens for colours, never white-only values; those vanish in light mode. The composer copies T3's `ComposerSurface` variables.
- The chat column uses `max-w-(--chat-content-max-width)`, driven by `html[data-chat-width]`.
- Settings opens as a T3 `AppRouteModal`-style overlay (`SettingsModal` in `main.jsx`). There is no inline settings screen.

## Layout

- `src/renderer/main.jsx` holds most of the UI: App, ThreadNav, ChatView, Composer, SettingsNav, SettingsModal and ConnectionsSettings.
- `src/renderer/AppearanceSettings.jsx` is the ported Appearance page. `src/renderer/settingsLayout.jsx` has the settings section and row primitives.
- `src/t3/index.css` holds theme variables and the `html[data-theme-id]` mapping.
