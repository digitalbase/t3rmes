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
2. Add a Hermes adapter with a fake transport for renderer development.
3. Connect to a real local gateway and render one streaming turn.
4. Add cancellation, reconnect, persistence, and compact tool rows.
5. Measure cold start, first paint, idle memory, and time-to-first-token before adding features.
