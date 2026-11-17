<img src="assets/icon.svg" width="64" height="64" alt="">

# t3rmes

An intentionally small, fast desktop client for Hermes Agent.

t3rmes combines the parts we want from T3 Code and Hermes Desktop:

- T3's fast desktop shell, startup discipline, native integration, and focused client runtime.
- Hermes's agent, tools, skills, memory, and gateway protocol.

The product goal is a responsive chat client that gets out of the way. Hermes Desktop is the feature reference, not the feature list.

## Product constraints

Speed is a product feature. Every new capability must justify its startup cost, memory cost, and persistent UI complexity.

- Open directly into chat.
- Keep the initial window useful before optional data finishes loading.
- Prefer one obvious default over setup screens and preference sprawl.
- Keep the renderer small; keep agent complexity in Hermes.
- Avoid background work until the user asks for it.
- Treat keyboard input, streaming, reconnects, and cancellation as first-class paths.

## Initial scope

The first usable version contains only:

1. One local Hermes connection.
2. One chat transcript with streaming responses.
3. A composer with send, stop, retry, and multiline input.
4. Compact tool activity shown inline in the transcript.
5. A small connection/status surface.
6. Minimal settings for model, working directory, and connection.

Explicitly deferred: projects, profiles, cloud accounts, voice, cron, messaging, pets, starmap, skill management, visual page previews, multi-pane workspaces, plugin catalogs, onboarding tours, and feature-specific dashboards.

## Architecture

```text
Electron shell
  -> preload bridge
  -> Hermes adapter (HTTP/WebSocket or local gateway)
  -> normalized client events
  -> small React renderer
```

The Electron shell owns windows, lifecycle, secure storage, process startup, and native capabilities. The Hermes adapter owns gateway discovery, authentication, reconnects, request cancellation, and translating Hermes events into a small client contract. React owns chat state and presentation only.

The client should depend on Hermes's gateway contract rather than importing broad Hermes Desktop UI modules. This keeps the integration replaceable and lets us upgrade Hermes independently.

## Sensible defaults

- Local Hermes runtime when available; otherwise show a single connection action.
- The current working directory as the initial workspace.
- The Hermes default model unless the user chooses one.
- Dark/light appearance follows the operating system.
- No automatic pane opening, navigation, focus stealing, telemetry prompts, or background indexing.
- Reconnect quietly with a visible status indicator; never discard a draft or transcript.

## Source references

The local reference checkouts are kept outside this repository:

- T3 Code: `/home/gijs/Work/digitalbase/t3code`
- Hermes Agent: `/home/gijs/Work/hermes/hermes-agent`

Use T3's `apps/desktop` and `packages/client-runtime` for shell/runtime patterns. Use Hermes's `apps/desktop/electron`, `apps/desktop/src`, `apps/shared`, and gateway implementation for the backend contract.

## Development sequence

1. Establish the Electron/Vite shell and a fast empty chat window.
2. Add a Hermes adapter (main process) for local and remote gateways.
3. Connect to a real local gateway and render one streaming turn.
4. Add cancellation, reconnect, persistence, and compact tool rows.
5. Measure cold start, first paint, idle memory, and time-to-first-token before adding features.

## Local verification

Run the renderer and Electron shell with:

```bash
npm run dev
```

For a non-interactive startup check, use:

```bash
npm run build
npm run smoke-test
```

The smoke test launches the packaged Electron entry point for a bounded period and fails on renderer or main-process module/runtime errors. Use the running window for visual and interaction checks; the left sidebar, settings route, composer, streaming response, and stop action are the first paths to exercise.

## Releases

Versions follow T3 Code: `X.Y.Z` in `package.json`, tagged as `vX.Y.Z`. Versions with a suffix (for example `0.1.0-beta.1`) are published as prereleases.

To cut a release:

```bash
npm version patch   # or minor / major / 0.1.0-beta.1; bumps package.json, commits, and tags vX.Y.Z
git push github main --follow-tags
```

Pushing the tag runs `.github/workflows/release.yml`, which checks that the tag matches `package.json`, builds the Linux AppImage, `.deb` and `.pacman` and the macOS `.dmg` (arm64 and x64, unsigned), and publishes them to a GitHub Release named `T3rmes vX.Y.Z`.

To build packages locally, run `npm run dist:linux` or `npm run dist:mac`. Output goes to `release/`.

The macOS builds are not signed. On first launch, right-click the app and choose Open, or run `xattr -dr com.apple.quarantine /Applications/T3rmes.app`.
