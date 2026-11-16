import { useCallback, useEffect, useRef, useState } from 'react';

const bridge = window.t3rmes;
const EMPTY_CONNECTIONS = { active: 'local', state: 'idle', error: null, connections: [] };
const REFRESH_INTERVAL_MS = 10_000;
const LIVE_BUSY = new Set(['working', 'starting', 'waiting']);

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
  pinned: false,
  archived: false,
  unread: false,
  isActive: false,
  lastActive: Date.now() / 1000,
  ...fields,
});

// Hermes SessionInfo row -> thread fields (see apps/desktop/src/types/hermes.ts).
function fromSessionRow(row) {
  return {
    storedId: row.id,
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

function closeAssistant(messages) {
  return messages
    .filter((m) => !(m.role === 'assistant' && m.streaming && !m.text))
    .map((m) => (m.streaming ? { ...m, streaming: false } : m));
}

function ensureAssistant(messages) {
  const last = messages[messages.length - 1];
  return last?.role === 'assistant' && last.streaming ? messages : [...messages, { role: 'assistant', text: '', streaming: true }];
}

function applyEvent(thread, type, payload = {}) {
  let messages = thread.messages;
  switch (type) {
    case 'message.start':
      return { ...thread, running: true, failed: false, runningSince: thread.runningSince ?? Date.now(), messages: ensureAssistant(messages) };
    case 'message.delta': {
      if (!payload.text) return thread;
      messages = ensureAssistant(messages);
      const last = messages[messages.length - 1];
      return { ...thread, messages: [...messages.slice(0, -1), { ...last, text: last.text + payload.text }] };
    }
    case 'tool.start':
      return {
        ...thread,
        messages: [...closeAssistant(messages), { role: 'tool', id: payload.tool_id, name: payload.name, context: payload.context, running: true }],
      };
    case 'tool.complete':
      return {
        ...thread,
        messages: messages.map((m) => (m.role === 'tool' && m.id === payload.tool_id ? { ...m, running: false, summary: payload.summary } : m)),
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
      if (payload.status === 'interrupted') messages.push({ role: 'notice', text: 'Interrupted' });
      return {
        ...thread,
        running: false,
        runningSince: null,
        liveStatus: null,
        failed,
        lastActive: Date.now() / 1000,
        messages: closeAssistant(messages).map((m) => (m.role === 'tool' ? { ...m, running: false } : m)),
      };
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

function historyToMessages(history = []) {
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'tool'))
    .map((m) => (m.role === 'tool' ? { role: 'tool', name: m.name, context: m.context } : { role: m.role, text: m.text || '' }));
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
  // False against a runtime whose REST session API is unreachable: pin/settle hide.
  const [syncSupported, setSyncSupported] = useState(false);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const updateThread = useCallback((key, update) => {
    setThreads((current) => current.map((t) => (t.key === key ? update(t) : t)));
  }, []);

  const refresh = useCallback(async () => {
    let rows = null;
    try {
      ({ sessions: rows = [] } = await bridge.sessions.list());
      setSyncSupported(true);
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
  useEffect(() => {
    if (!isReady) return;
    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isReady, connections.active, refresh]);

  const resetThreads = useCallback(() => {
    const fresh = newThread();
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
        await bridge.sessions.update(thread.storedId, patch);
      } catch {
        updateThread(key, (t) => ({ ...t, ...previous }));
      }
    },
    [updateThread],
  );

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
        const result = await bridge.request('session.resume', { session_id: thread.storedId });
        updateThread(key, (t) => ({
          ...t,
          loading: false,
          sessionId: result.session_id,
          running: Boolean(result.running),
          runningSince: result.running ? t.runningSince ?? Date.now() : t.runningSince,
          messages: historyToMessages(result.messages),
        }));
      } catch (error) {
        updateThread(key, (t) => ({ ...t, loading: false, messages: [{ role: 'error', text: error.message }] }));
      }
    },
    [updateThread],
  );

  const createThread = useCallback(() => {
    const fresh = newThread();
    setThreads((current) => [fresh, ...current]);
    setActiveKey(fresh.key);
  }, []);

  const send = useCallback(
    async (text) => {
      const thread = threadsRef.current.find((t) => t.key === activeKey);
      if (!thread || thread.running) return;
      const key = thread.key;
      updateThread(key, (t) => ({
        ...t,
        running: true,
        failed: false,
        runningSince: Date.now(),
        lastActive: Date.now() / 1000,
        archived: false,
        preview: t.preview || text.replace(/\s+/g, ' ').slice(0, 160),
        messages: [...t.messages, { role: 'user', text }, { role: 'assistant', text: '', streaming: true }],
      }));
      if (thread.archived) patchThread(key, { archived: false });
      try {
        let sessionId = thread.sessionId;
        if (!sessionId) {
          const created = await bridge.request('session.create', {});
          sessionId = created.session_id;
          updateThread(key, (t) => ({
            ...t,
            sessionId,
            storedId: created.stored_session_id || t.storedId,
            model: t.model || created.info?.model || null,
            cwd: t.cwd || created.info?.cwd || null,
            branch: t.branch || created.info?.branch || null,
          }));
        }
        const result = await bridge.request('prompt.submit', { session_id: sessionId, text });
        if (result && result.status && result.status !== 'streaming' && result.status !== 'queued') {
          updateThread(key, (t) => ({ ...t, running: false, runningSince: null, messages: closeAssistant(t.messages) }));
        }
      } catch (error) {
        updateThread(key, (t) => applyEvent(t, 'error', { message: error.message }));
      }
    },
    [activeKey, updateThread, patchThread],
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
    selectThread,
    createThread,
    send,
    stop,
    pinThread: (key, pinned) => patchThread(key, { pinned }),
    settleThread: (key, settled) => patchThread(key, { archived: settled }),
    markUnread: (key) => patchThread(key, { unread: true }),
    selectConnection: wrap((id) => bridge.connections.select(id), true),
    addConnection: wrap((input) => bridge.connections.add(input), true),
    removeConnection: wrap((id) => bridge.connections.remove(id), true),
    signIn: wrap((id) => bridge.connections.signIn(id)),
    signOut: wrap((id) => bridge.connections.signOut(id)),
  };
}
