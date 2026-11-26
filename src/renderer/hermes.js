import { useCallback, useEffect, useRef, useState } from 'react';

const bridge = window.t3rmes;
const EMPTY_CONNECTIONS = { active: null, state: 'idle', error: null, connections: [], importable: [] };
const REFRESH_INTERVAL_MS = 10_000;
// Newest sessions refetched on every refresh; older pages load on request.
const SESSION_PAGE_SIZE = 100;
// Cron runs are the newest rows on busy gateways and would bury conversations, as in Hermes Desktop's recents.
const SESSION_LIST_FILTER = { excludeSources: ['cron'] };
const PROFILE_SCOPE_KEY = (connectionId) => `t3rmes:profile-scope:${connectionId}`;
const LAST_PROFILE_KEY = (connectionId) => `t3rmes:last-profile:${connectionId}`;
const LIVE_BUSY = new Set(['working', 'starting', 'waiting']);

function isSessionNotFound(error) {
  const message = (error instanceof Error ? error.message : String(error ?? ''))
    .trim()
    .replace(/^Error invoking remote method '[^']+':\s*Error:\s*/i, '')
    .replace(/^Error:\s*/i, '');
  return /^(?:4001\s*[:,-]?\s*)?session not found[.!]?$/i.test(message);
}

const profileParam = (profile) => (profile ? { profile } : {});

let nextKey = 1;
const newThread = (fields = {}) => ({
  key: nextKey++,
  sessionId: null,
  storedId: null,
  title: null,
  preview: null,
  messages: [],
  running: false,
  runningSince: null,
  failed: false,
  liveStatus: null,
  // The Hermes profile that owns the session; every call for this thread is scoped to it.
  profile: null,
  pinned: false,
  archived: false,
  unread: false,
  isActive: false,
  lastActive: Date.now() / 1000,
  // What the session runs on, from Hermes session info: { model, provider, effort, fast }.
  runtime: {},
  // Picks made before the session exists; session.create receives them.
  pending: {},
  ...fields,
});

// Hermes SessionInfo row -> thread fields (see apps/desktop/src/types/hermes.ts).
function fromSessionRow(row) {
  return {
    storedId: row.id,
    profile: row.profile || null,
    title: row.title?.trim() || null,
    preview: row.preview?.replace(/\s+/g, ' ').trim() || null,
    source: row.source || null,
    model: row.model || null,
    cwd: row.cwd || null,
    branch: row.git_branch?.trim() || null,
    repoRoot: row.git_repo_root || null,
    messageCount: row.message_count || 0,
    toolCallCount: row.tool_call_count || 0,
    startedAt: row.started_at || null,
    lastActive: row.last_active || row.started_at || 0,
    endedAt: row.ended_at || null,
    isActive: Boolean(row.is_active),
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    unread: Boolean(row.unread),
  };
}

// Hermes session info -> the live runtime pick (model, provider, effort, fast) plus cwd/branch.
function infoFields(thread, info = {}) {
  const runtime = { ...thread.runtime };
  if (info.model) runtime.model = info.model;
  if (info.provider) runtime.provider = info.provider;
  // "" is the profile default; picks fall back to the runtime-wide default then.
  if (typeof info.reasoning_effort === 'string') runtime.effort = info.reasoning_effort || null;
  if (typeof info.fast === 'boolean') runtime.fast = info.fast;
  return {
    runtime,
    cwd: info.cwd || thread.cwd,
    branch: info.branch || thread.branch,
  };
}

const readDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

// Stage one composer attachment on a live session. Bytes, not paths, so remote runtimes work.
async function uploadAttachment(sessionId, attachment) {
  const dataUrl = await readDataUrl(attachment.file);
  if (attachment.kind === 'image') {
    const result = await bridge.request('image.attach_bytes', {
      session_id: sessionId,
      content_base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
      filename: attachment.name,
    });
    if (!result?.attached) throw new Error(result?.message || `Could not attach ${attachment.name}`);
    return null;
  }
  const result = await bridge.request('file.attach', { session_id: sessionId, name: attachment.name, data_url: dataUrl });
  if (!result?.attached || !result.ref_text) throw new Error(result?.message || `Could not attach ${attachment.name}`);
  return result.ref_text;
}

function closeAssistant(messages) {
  return messages
    .filter((m) => !(m.role === 'assistant' && m.streaming && !m.text))
    .map((m) => (m.streaming ? { ...m, streaming: false } : m));
}

function ensureAssistant(messages) {
  const last = messages[messages.length - 1];
  return last?.role === 'assistant' && last.streaming ? messages : [...messages, { role: 'assistant', text: '', streaming: true }];
}

// Reasoning streams before the reply: it lands ahead of an empty streaming placeholder.
function appendReasoning(messages, text) {
  const last = messages[messages.length - 1];
  const placeholder = last?.role === 'assistant' && last.streaming && !last.text;
  const head = placeholder ? messages.slice(0, -1) : messages;
  const prev = head[head.length - 1];
  const next =
    prev?.role === 'reasoning' && prev.streaming
      ? [...head.slice(0, -1), { ...prev, text: prev.text + text }]
      : [...closeAssistant(head), { role: 'reasoning', text, streaming: true }];
  return placeholder ? [...next, last] : next;
}

const closeReasoning = (messages) => messages.map((m) => (m.role === 'reasoning' && m.streaming ? { ...m, streaming: false } : m));

function toolFailed(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.success === false) return true;
  if (typeof result.exit_code === 'number' && result.exit_code !== 0) return true;
  return Boolean(result.error);
}

function applyEvent(thread, type, payload = {}) {
  let messages = thread.messages;
  switch (type) {
    case 'message.start':
      return { ...thread, running: true, failed: false, runningSince: thread.runningSince ?? Date.now(), messages: ensureAssistant(messages) };
    case 'message.delta': {
      if (!payload.text) return thread;
      messages = ensureAssistant(closeReasoning(messages));
      const last = messages[messages.length - 1];
      return { ...thread, messages: [...messages.slice(0, -1), { ...last, text: last.text + payload.text }] };
    }
    case 'reasoning.delta':
      if (!payload.text) return thread;
      return { ...thread, messages: appendReasoning(messages, payload.text) };
    case 'tool.start':
      return {
        ...thread,
        messages: [
          ...closeAssistant(messages),
          { role: 'tool', id: payload.tool_id, name: payload.name, context: payload.context, args: payload.args, running: true, at: Date.now() },
        ],
      };
    case 'tool.complete':
      return {
        ...thread,
        messages: messages.map((m) =>
          m.role === 'tool' && m.id === payload.tool_id
            ? {
                ...m,
                running: false,
                args: payload.args ?? m.args,
                summary: payload.summary,
                durationMs: typeof payload.duration_s === 'number' ? payload.duration_s * 1000 : null,
                failed: toolFailed(payload.result),
                result: payload.result,
                inlineDiff: payload.inline_diff,
              }
            : m,
        ),
      };
    case 'message.complete': {
      const failed = payload.status === 'error';
      if (!failed) {
        messages = ensureAssistant(messages);
        const last = messages[messages.length - 1];
        const text = payload.text && payload.text.length >= last.text.length ? payload.text : last.text;
        messages = [...messages.slice(0, -1), { ...last, text }];
      }
      if (failed && messages[messages.length - 1]?.role !== 'error') {
        messages = [...closeAssistant(messages), { role: 'error', text: payload.error || 'Hermes reported an error.' }];
      }
      messages = closeAssistant(messages).map((m) => (m.role === 'tool' ? { ...m, running: false } : m));
      // The turn's span, for the "Worked for" fold; stamped on the reply that ends it.
      const lastIndex = messages.findLastIndex((m) => m.role === 'assistant');
      const turnStart = messages.findLastIndex((m) => m.role === 'user');
      if (lastIndex > turnStart) {
        messages[lastIndex] = {
          ...messages[lastIndex],
          at: Date.now(),
          workedMs: thread.runningSince ? Date.now() - thread.runningSince : null,
          interrupted: payload.status === 'interrupted',
        };
      } else if (payload.status === 'interrupted') {
        messages.push({ role: 'notice', text: 'Interrupted' });
      }
      return {
        ...thread,
        running: false,
        runningSince: null,
        liveStatus: null,
        failed,
        lastActive: Date.now() / 1000,
        messages,
      };
    }
    case 'session.info': {
      const next = { ...thread, ...infoFields(thread, payload) };
      // A switch the user asked for lands once Hermes reports the new model (now, or at the next turn
      // start when it was queued mid-turn). Other model changes, like a lazy resume's default, are not handoffs.
      const requested = thread.requestedSwitch;
      if (requested && payload.model && payload.model !== requested.from.model) {
        next.requestedSwitch = null;
        const to = { model: payload.model, provider: payload.provider || requested.to.provider };
        if (messages.length) next.messages = insertHandoff(messages, { role: 'handoff', from: requested.from, to, at: Date.now() }, thread.running);
      }
      return next;
    }
    case 'error':
      return {
        ...thread,
        running: false,
        runningSince: null,
        failed: true,
        messages: [...closeAssistant(messages), { role: 'error', text: payload.message || 'Hermes reported an error.' }],
      };
    default:
      return thread;
  }
}

// Hermes Desktop chat-messages/hydration.ts displayContentForMessage + embedded-images extractImageRefs:
// drop the expanded "--- Attached Context ---" block and lift `@image:` lines out as attachments.
const ATTACHED_CONTEXT_MARKER_RE = /(?:^|\n)--- Attached Context ---\s*\n/;
const CONTEXT_WARNINGS_MARKER_RE = /(?:^|\n)--- Context Warnings ---[\s\S]*$/;
const CONTEXT_REF_RE = /@(file|folder|url|image|tool|terminal):(?:"[^"\n]+"|'[^'\n]+'|`[^`\n]+`|\S+)/g;
const IMAGE_REF_LINE_RE = /^@image:[^\n]*\n?/gm;
const SCREENSHOT_PLACEHOLDER_LINE_RE = /^\[screenshot\]\n?/gm;

function userDisplayText(text) {
  const marker = text.match(ATTACHED_CONTEXT_MARKER_RE);
  if (!marker || marker.index === undefined) return text.replace(CONTEXT_WARNINGS_MARKER_RE, '').trim();
  const visible = text.slice(0, marker.index).replace(CONTEXT_WARNINGS_MARKER_RE, '').trim();
  const refs = [...new Set(Array.from(text.slice(marker.index + marker[0].length).matchAll(CONTEXT_REF_RE), (m) => m[0]))];
  // Keep refs the prose already names in place; hoist only the missing ones.
  const missing = refs.filter((ref) => !visible.includes(ref));
  return [missing.join('\n'), visible].filter(Boolean).join('\n\n') || visible;
}

function unquoteRef(value) {
  const quoted = value.match(/^(["'`])(.*)\1$/);
  return quoted ? quoted[2] : value;
}

export function parseUserMessage(raw) {
  const refs = [];
  let text = userDisplayText(raw).replace(IMAGE_REF_LINE_RE, (line) => {
    refs.push(line.trim());
    return '';
  });
  if (refs.length) text = text.replace(SCREENSHOT_PLACEHOLDER_LINE_RE, '');
  const files = [];
  text = text.replace(/^@file:\S+[ \t]*\n?/gm, (line) => {
    files.push(line.trim());
    return '';
  });
  const attachment = (ref, kind) => {
    const path = unquoteRef(ref.slice(ref.indexOf(':') + 1).trim());
    return { id: ref, kind, name: path.split('/').pop() || path, path };
  };
  return { text: text.trim(), attachments: [...refs.map((r) => attachment(r, 'image')), ...files.map((r) => attachment(r, 'file'))] };
}

// A switch queued during a turn lands when the next turn starts, so it goes before that turn's prompt.
function insertHandoff(messages, handoff, running) {
  const index = running ? messages.findLastIndex((m) => m.role === 'user') : -1;
  return index < 0 ? [...messages, handoff] : [...messages.slice(0, index), handoff, ...messages.slice(index)];
}

// tui_gateway/server.py _append_model_switch_marker.
const MODEL_SWITCH_RE = /^\[System: The active model for this chat has changed to (.+?)(?: via provider (\S+))?\. From this point/;

// session.resume drops Hermes' model-switch markers; the stored rows keep them, so place them by time.
// Hermes retires all but the newest marker, so older switches may be missing and the first has no "from".
function withHandoffs(messages, rows = []) {
  const switches = rows
    .map((row) => {
      const match = row?.display_kind === 'model_switch' && typeof row.content === 'string' ? row.content.match(MODEL_SWITCH_RE) : null;
      return match && typeof row.timestamp === 'number' ? { to: { model: match[1], provider: match[2] || null }, at: row.timestamp * 1000 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at);
  const out = [...messages];
  let from = null;
  for (const { to, at } of switches) {
    const index = out.findIndex((m) => m.role === 'user' && m.at && m.at >= at);
    const handoff = { role: 'handoff', from, to, at };
    if (index < 0) out.push(handoff);
    else out.splice(index, 0, handoff);
    from = to;
  }
  return out;
}

function historyToMessages(history = []) {
  const messages = [];
  let turnStartedAt = null;
  for (const m of history) {
    if (!m) continue;
    const at = typeof m.timestamp === 'number' ? m.timestamp * 1000 : null;
    if (m.role === 'tool') {
      messages.push({ role: 'tool', name: m.name, context: m.context, args: m.args });
    } else if (m.role === 'user') {
      turnStartedAt = at;
      messages.push({ role: 'user', ...parseUserMessage(m.text || ''), at });
    } else if (m.role === 'assistant') {
      const reasoning = typeof m.reasoning === 'string' ? m.reasoning : typeof m.reasoning_content === 'string' ? m.reasoning_content : '';
      if (reasoning.trim()) messages.push({ role: 'reasoning', text: reasoning });
      if (m.text) messages.push({ role: 'assistant', text: m.text, at, workedMs: at && turnStartedAt ? at - turnStartedAt : null });
    }
  }
  return messages;
}

// The thread's Hermes-derived status: working | waiting | failed | unread | null.
export function threadStatus(thread) {
  if (thread.running || thread.liveStatus === 'working' || thread.liveStatus === 'starting') return 'working';
  if (thread.liveStatus === 'waiting') return 'waiting';
  if (thread.failed) return 'failed';
  if (thread.unread) return 'unread';
  return null;
}

export function threadTitle(thread) {
  return thread.title || thread.preview || 'New thread';
}

export function useHermes() {
  const [connections, setConnections] = useState(EMPTY_CONNECTIONS);
  const [threads, setThreads] = useState(() => [newThread()]);
  const [activeKey, setActiveKey] = useState(threads[0].key);
  // profiles.list rows for the active gateway, plus avatar data URLs by profile name.
  const [profiles, setProfiles] = useState([]);
  const [avatars, setAvatars] = useState({});
  // null shows every profile; a name narrows the sidebar (and new threads) to that profile.
  const [profileScope, setProfileScopeState] = useState(null);
  const profileScopeRef = useRef(profileScope);
  profileScopeRef.current = profileScope;
  // How far down the session list has been paged, and how many rows the gateway has.
  const [sessionPage, setSessionPage] = useState({ loaded: 0, total: null, loading: false });
  const sessionPageRef = useRef(sessionPage);
  sessionPageRef.current = sessionPage;
  // False against a runtime whose REST session API is unreachable: pin/settle hide.
  const [syncSupported, setSyncSupported] = useState(false);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const activeKeyRef = useRef(activeKey);
  activeKeyRef.current = activeKey;
  const markUnreadRef = useRef(null);

  const updateThread = useCallback((key, update) => {
    setThreads((current) => current.map((t) => (t.key === key ? update(t) : t)));
  }, []);

  const mergeRows = useCallback((rows, live) => {
    setThreads((current) => {
      const byStored = new Map((rows || []).map((row) => [row.id, row]));
      const merged = current.map((t) => {
        const row = t.storedId && byStored.get(t.storedId);
        let next = row ? { ...t, ...fromSessionRow(row) } : t;
        byStored.delete(t.storedId);
        if (live && next.storedId) {
          const liveStatus = LIVE_BUSY.has(live.get(next.storedId)) ? live.get(next.storedId) : null;
          if (liveStatus !== next.liveStatus) {
            next = { ...next, liveStatus, runningSince: liveStatus ? next.runningSince ?? Date.now() : next.running ? next.runningSince : null };
          }
        }
        return next;
      });
      const added = [...byStored.values()].map((row) => {
        const liveStatus = live && LIVE_BUSY.has(live.get(row.id)) ? live.get(row.id) : null;
        return newThread({ ...fromSessionRow(row), liveStatus, runningSince: liveStatus ? Date.now() : null });
      });
      return added.length || merged.some((t, i) => t !== current[i]) ? [...merged, ...added] : current;
    });
  }, []);

  const listSessions = (offset) =>
    bridge.sessions.list({ limit: SESSION_PAGE_SIZE, offset, profile: profileScopeRef.current, ...SESSION_LIST_FILTER });

  const refresh = useCallback(async () => {
    let rows = null;
    try {
      const result = await listSessions(0);
      rows = result.sessions || [];
      setSyncSupported(true);
      setSessionPage((current) => ({
        ...current,
        loaded: Math.max(current.loaded, rows.length),
        total: typeof result.total === 'number' ? result.total : current.total,
      }));
    } catch {
      setSyncSupported(false);
      try {
        const { sessions = [] } = await bridge.request('session.list', { limit: 50 });
        rows = sessions;
      } catch {}
    }
    let live = null;
    try {
      const { sessions = [] } = await bridge.request('session.active_list', {});
      live = new Map(sessions.map((s) => [s.session_key, s.status]));
    } catch {}
    mergeRows(rows, live);
  }, [mergeRows]);

  // The next page of older sessions, behind the ones already loaded.
  const loadMoreThreads = useCallback(async () => {
    const page = sessionPageRef.current;
    if (page.loading || (page.total !== null && page.loaded >= page.total)) return;
    setSessionPage((current) => ({ ...current, loading: true }));
    try {
      const result = await listSessions(page.loaded);
      const rows = result.sessions || [];
      mergeRows(rows, null);
      setSessionPage((current) => ({
        loading: false,
        loaded: current.loaded + rows.length,
        total: rows.length < SESSION_PAGE_SIZE ? current.loaded + rows.length : result.total ?? current.total,
      }));
    } catch {
      setSessionPage((current) => ({ ...current, loading: false }));
    }
  }, [mergeRows]);

  useEffect(() => {
    if (!bridge) return;
    bridge.connections.list().then(setConnections);
    const offState = bridge.onState(({ connectionId, state, error }) => {
      setConnections((current) => ({ ...current, active: connectionId, state, error }));
    });
    let refreshTimer = null;
    const offEvent = bridge.onEvent(({ session_id: sessionId, type, payload }) => {
      if (!sessionId) return;
      setThreads((current) => current.map((t) => (t.sessionId === sessionId ? applyEvent(t, type, payload) : t)));
      // Pick up the server-side title, counts and read state once a turn lands.
      if (type === 'message.complete') {
        // A turn that lands while another thread is open shows T3's green "Done" until visited.
        const finished = threadsRef.current.find((t) => t.sessionId === sessionId);
        if (finished && finished.key !== activeKeyRef.current && payload?.status !== 'error' && payload?.status !== 'interrupted') {
          markUnreadRef.current?.(finished.key);
        }
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, 800);
      }
    });
    return () => {
      clearTimeout(refreshTimer);
      offState();
      offEvent();
    };
  }, [refresh]);

  const isReady = connections.state === 'ready';
  const connectionId = connections.active;

  // Each gateway remembers its own profile filter.
  useEffect(() => {
    setProfiles([]);
    setAvatars({});
    setProfileScopeState(connectionId ? localStorage.getItem(PROFILE_SCOPE_KEY(connectionId)) || null : null);
  }, [connectionId]);

  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;
    bridge
      .request('profiles.list', {})
      .then(async ({ profiles: rows = [] }) => {
        if (cancelled) return;
        setProfiles(rows);
        // A filter on a profile the gateway no longer has would hide everything.
        setProfileScopeState((scope) => (scope && !rows.some((p) => p.name === scope) ? null : scope));
        const entries = await Promise.all(
          rows
            .filter((p) => p.has_avatar)
            .map((p) =>
              bridge
                .request('profiles.get_asset', { name: p.name, asset: 'avatar' })
                .then((asset) => [p.name, asset?.found ? asset.data : null])
                .catch(() => [p.name, null]),
            ),
        );
        if (!cancelled) setAvatars(Object.fromEntries(entries.filter(([, data]) => data)));
      })
      .catch(() => {
        if (!cancelled) setProfiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isReady, connectionId]);

  useEffect(() => {
    if (!isReady) return;
    setSessionPage({ loaded: 0, total: null, loading: false });
    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isReady, connectionId, profileScope, refresh]);

  const defaultProfile = profiles.find((p) => p.is_default)?.name ?? profiles[0]?.name ?? null;
  const profileNames = profiles.map((p) => p.name);
  // Where a new thread starts: the filtered profile, else the last one used on this gateway.
  const newThreadProfile = () => {
    if (profileScopeRef.current) return profileScopeRef.current;
    const last = connectionId ? localStorage.getItem(LAST_PROFILE_KEY(connectionId)) : null;
    return last && profileNames.includes(last) ? last : defaultProfile;
  };
  const newThreadProfileRef = useRef(newThreadProfile);
  newThreadProfileRef.current = newThreadProfile;

  const setProfileScope = useCallback(
    (name) => {
      const scope = name || null;
      if (connectionId) {
        if (scope) localStorage.setItem(PROFILE_SCOPE_KEY(connectionId), scope);
        else localStorage.removeItem(PROFILE_SCOPE_KEY(connectionId));
      }
      setProfileScopeState(scope);
      // An empty draft follows the filter, so New lands in the profile being looked at.
      if (scope) {
        setThreads((current) =>
          current.map((t) => (t.key === activeKeyRef.current && !t.storedId && t.messages.length === 0 ? { ...t, profile: scope } : t)),
        );
      }
    },
    [connectionId],
  );

  const resetThreads = useCallback(() => {
    const fresh = newThread({ profile: null });
    setThreads([fresh]);
    setActiveKey(fresh.key);
  }, []);

  const wrap = useCallback(
    (fn, reset = false) =>
      async (...args) => {
        const next = await fn(...args);
        setConnections(next);
        if (reset) resetThreads();
        return next;
      },
    [resetThreads],
  );

  // Optimistic PATCH /api/sessions/{id}; reverts on failure.
  const patchThread = useCallback(
    async (key, patch) => {
      const thread = threadsRef.current.find((t) => t.key === key);
      if (!thread?.storedId) return;
      const previous = Object.fromEntries(Object.keys(patch).map((field) => [field, thread[field]]));
      updateThread(key, (t) => ({ ...t, ...patch }));
      try {
        await bridge.sessions.update(thread.storedId, patch, thread.profile);
      } catch {
        updateThread(key, (t) => ({ ...t, ...previous }));
      }
    },
    [updateThread],
  );

  markUnreadRef.current = (key) => {
    const thread = threadsRef.current.find((t) => t.key === key);
    if (thread?.storedId && syncSupported) patchThread(key, { unread: true });
    else updateThread(key, (t) => ({ ...t, unread: true }));
  };

  const activeThread = threads.find((t) => t.key === activeKey) ?? threads[0];

  // Opening a thread reads it, like Hermes Desktop.
  useEffect(() => {
    if (syncSupported && activeThread.unread && !activeThread.running) patchThread(activeThread.key, { unread: false });
  }, [syncSupported, activeThread.key, activeThread.unread, activeThread.running, patchThread]);

  const selectThread = useCallback(
    async (key) => {
      setActiveKey(key);
      const thread = threadsRef.current.find((t) => t.key === key);
      if (!thread || thread.sessionId || !thread.storedId || thread.loading) return;
      updateThread(key, (t) => ({ ...t, loading: true }));
      try {
        const [result, stored] = await Promise.all([
          bridge.request('session.resume', { session_id: thread.storedId, ...profileParam(thread.profile) }),
          bridge.sessions.messages(thread.storedId, thread.profile).catch(() => null),
        ]);
        updateThread(key, (t) => ({
          ...t,
          loading: false,
          sessionId: result.session_id,
          ...infoFields(t, result.info),
          running: Boolean(result.running),
          runningSince: result.running ? t.runningSince ?? Date.now() : t.runningSince,
          messages: withHandoffs(historyToMessages(result.messages), stored?.messages ?? stored?.data),
        }));
      } catch (error) {
        updateThread(key, (t) => ({ ...t, loading: false, messages: [{ role: 'error', text: error.message }] }));
      }
    },
    [updateThread],
  );

  const createThread = useCallback(() => {
    const fresh = newThread({ profile: newThreadProfileRef.current() });
    setThreads((current) => [fresh, ...current]);
    setActiveKey(fresh.key);
  }, []);

  // A draft can still move to another profile; a session cannot.
  const setThreadProfile = useCallback(
    (name) => {
      const thread = threadsRef.current.find((t) => t.key === activeKeyRef.current);
      if (!thread || thread.sessionId || thread.storedId) return;
      if (connectionId) localStorage.setItem(LAST_PROFILE_KEY(connectionId), name);
      updateThread(thread.key, (t) => ({ ...t, profile: name, pending: {} }));
    },
    [connectionId, updateThread],
  );

  // The runtime-wide model catalog and defaults; a session's own pick overrides them.
  const [modelOptions, setModelOptions] = useState({ providers: [], loading: false });
  const [defaults, setDefaults] = useState({});
  const refreshModels = useCallback(async () => {
    const thread = threadsRef.current.find((t) => t.key === activeKeyRef.current);
    setModelOptions((current) => ({ ...current, loading: true }));
    try {
      const result = await bridge.request(
        'model.options',
        thread?.sessionId ? { session_id: thread.sessionId } : profileParam(thread?.profile),
      );
      setModelOptions({ providers: result?.providers || [], loading: false });
      setDefaults((current) => ({ ...current, model: result?.model || current.model, provider: result?.provider || current.provider }));
    } catch {
      setModelOptions((current) => ({ ...current, loading: false }));
    }
  }, []);
  // Model catalogs and defaults are per profile, so they reload when the open thread's profile changes.
  const activeProfile = (threads.find((t) => t.key === activeKey) ?? threads[0])?.profile ?? null;
  useEffect(() => {
    if (!isReady) return;
    setModelOptions({ providers: [], loading: false });
    setDefaults({});
    refreshModels();
    const scoped = profileParam(activeProfile);
    Promise.allSettled([
      bridge.request('config.get', { key: 'reasoning', ...scoped }),
      bridge.request('config.get', { key: 'fast', ...scoped }),
    ]).then(
      ([reasoning, fast]) =>
        setDefaults((current) => ({
          ...current,
          effort: reasoning.value?.value || null,
          fast: fast.value?.value === 'fast',
        })),
    );
  }, [isReady, connectionId, activeProfile, refreshModels]);

  const pushError = useCallback(
    (key, message) => updateThread(key, (t) => ({ ...t, messages: [...t.messages, { role: 'error', text: message }] })),
    [updateThread],
  );

  const resumeThread = useCallback(
    async (key, storedId) => {
      const profile = threadsRef.current.find((t) => t.key === key)?.profile;
      const result = await bridge.request('session.resume', { session_id: storedId, ...profileParam(profile) });
      if (!result?.session_id) throw new Error('Hermes did not return a runtime session ID.');
      updateThread(key, (t) => ({
        ...t,
        sessionId: result.session_id,
        ...infoFields(t, result.info),
        running: Boolean(result.running),
        runningSince: result.running ? t.runningSince ?? Date.now() : t.runningSince,
      }));
      return result.session_id;
    },
    [updateThread],
  );

  // A live session switches through config.set; a draft keeps the pick for session.create.
  const configure = useCallback(
    async (field, value, request) => {
      const thread = threadsRef.current.find((t) => t.key === activeKeyRef.current);
      if (!thread) return null;
      const key = thread.key;
      if (!thread.sessionId) {
        updateThread(key, (t) => ({ ...t, pending: { ...t.pending, ...value } }));
        return null;
      }
      const previous = thread.runtime;
      updateThread(key, (t) => ({ ...t, runtime: { ...t.runtime, ...value } }));
      try {
        const result = await bridge.request('config.set', { session_id: thread.sessionId, ...request });
        if (result?.confirm_required) {
          updateThread(key, (t) => ({ ...t, runtime: previous }));
          return result;
        }
        return null;
      } catch (error) {
        updateThread(key, (t) => ({ ...t, runtime: previous }));
        pushError(key, error.message);
        return null;
      }
    },
    [updateThread, pushError],
  );

  // Resolves to { confirm_message } when Hermes wants the switch confirmed (expensive model).
  // `from` is the pick the composer showed; the timeline marks the handoff once Hermes confirms the switch.
  const selectModel = useCallback(
    async (provider, model, { confirmed = false, from = null } = {}) => {
      const key = activeKeyRef.current;
      const live = threadsRef.current.find((t) => t.key === key)?.sessionId;
      if (live && from?.model) updateThread(key, (t) => ({ ...t, requestedSwitch: { from, to: { model, provider } } }));
      const result = await configure('model', { provider, model }, {
        key: 'model',
        value: `${model} --provider ${provider}`,
        ...(confirmed ? { confirm_expensive_model: true } : {}),
      });
      if (result?.confirm_required) updateThread(key, (t) => ({ ...t, requestedSwitch: null }));
      return result;
    },
    [configure, updateThread],
  );
  const setEffort = useCallback((effort) => configure('effort', { effort }, { key: 'reasoning', value: effort }), [configure]);
  const setFast = useCallback((fast) => configure('fast', { fast }, { key: 'fast', value: fast ? 'fast' : 'normal' }), [configure]);

  const send = useCallback(
    async (text, attachments = []) => {
      const thread = threadsRef.current.find((t) => t.key === activeKey);
      if (!thread || thread.running) return;
      const key = thread.key;
      const shown = attachments.map(({ id, name, kind, previewUrl }) => ({ id, name, kind, previewUrl }));
      updateThread(key, (t) => ({
        ...t,
        running: true,
        failed: false,
        runningSince: Date.now(),
        lastActive: Date.now() / 1000,
        archived: false,
        preview: t.preview || (text || attachments[0]?.name || '').replace(/\s+/g, ' ').slice(0, 160),
        messages: [...t.messages, { role: 'user', text, attachments: shown }, { role: 'assistant', text: '', streaming: true }],
      }));
      if (thread.archived) patchThread(key, { archived: false });
      try {
        let sessionId = thread.sessionId;
        if (!sessionId) {
          const { model, provider, effort, fast } = thread.pending;
          const profile = thread.profile || newThreadProfileRef.current();
          if (profile && connectionId) localStorage.setItem(LAST_PROFILE_KEY(connectionId), profile);
          const created = await bridge.request('session.create', {
            ...profileParam(profile),
            ...(model ? { model, provider } : {}),
            ...(effort ? { reasoning_effort: effort } : {}),
            ...(typeof fast === 'boolean' ? { fast } : {}),
          });
          sessionId = created.session_id;
          updateThread(key, (t) => {
            const info = infoFields(t, created.info);
            return {
              ...t,
              ...info,
              runtime: { ...info.runtime, ...t.pending },
              pending: {},
              profile,
              sessionId,
              storedId: created.stored_session_id || t.storedId,
              model: t.model || created.info?.model || null,
            };
          });
        }
        const submit = async (liveSessionId) => {
          const refs = [];
          for (const attachment of attachments) {
            const ref = await uploadAttachment(liveSessionId, attachment);
            if (ref) refs.push(ref);
          }
          const prompt =
            [refs.join('\n'), text].filter(Boolean).join('\n\n') ||
            (attachments.some((a) => a.kind === 'image') ? 'What do you see in this image?' : '');
          return bridge.request('prompt.submit', { session_id: liveSessionId, text: prompt });
        };
        let result;
        try {
          result = await submit(sessionId);
        } catch (error) {
          const storedId = threadsRef.current.find((candidate) => candidate.key === key)?.storedId;
          if (!storedId || !isSessionNotFound(error)) throw error;
          sessionId = await resumeThread(key, storedId);
          result = await submit(sessionId);
        }
        if (result && result.status && result.status !== 'streaming' && result.status !== 'queued') {
          updateThread(key, (t) => ({ ...t, running: false, runningSince: null, messages: closeAssistant(t.messages) }));
        }
      } catch (error) {
        updateThread(key, (t) => applyEvent(t, 'error', { message: error.message }));
      }
    },
    [activeKey, connectionId, updateThread, patchThread, resumeThread],
  );

  const stop = useCallback(async () => {
    const thread = threadsRef.current.find((t) => t.key === activeKey);
    if (!thread?.sessionId) return;
    try {
      await bridge.request('session.interrupt', { session_id: thread.sessionId });
    } catch {
      updateThread(thread.key, (t) => ({ ...t, running: false, runningSince: null, messages: closeAssistant(t.messages) }));
    }
  }, [activeKey, updateThread]);

  return {
    available: Boolean(bridge),
    connections,
    threads,
    activeThread,
    syncSupported,
    profiles,
    avatars,
    defaultProfile,
    profileScope,
    setProfileScope,
    setThreadProfile,
    // The profile a draft without its own pick will start in.
    nextProfile: newThreadProfile(),
    sessionPage,
    loadMoreThreads,
    selectThread,
    createThread,
    send,
    stop,
    modelOptions,
    defaults,
    refreshModels,
    selectModel,
    setEffort,
    setFast,
    pinThread: (key, pinned) => patchThread(key, { pinned }),
    settleThread: (key, settled) => patchThread(key, { archived: settled }),
    markUnread: (key) => patchThread(key, { unread: true }),
    // Each session carries its own revision fence, so bulk edits run in parallel.
    patchThreads: (keys, patch) => Promise.all(keys.map((key) => patchThread(key, patch))),
    selectConnection: wrap((id) => bridge.connections.select(id), true),
    addConnection: wrap((input) => bridge.connections.add(input), true),
    updateConnection: wrap((id, input) => bridge.connections.update(id, input)),
    importConnections: wrap(() => bridge.connections.importFromHermesDesktop()),
    removeConnection: wrap((id) => bridge.connections.remove(id), true),
    signIn: wrap((id) => bridge.connections.signIn(id)),
    signOut: wrap((id) => bridge.connections.signOut(id)),
  };
}
