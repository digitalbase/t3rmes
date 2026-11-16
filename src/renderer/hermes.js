import { useCallback, useEffect, useRef, useState } from 'react';

const bridge = window.t3rmes;
const EMPTY_CONNECTIONS = { active: 'local', state: 'idle', error: null, connections: [] };

let nextKey = 1;
const newThread = (fields = {}) => ({ key: nextKey++, sessionId: null, storedId: null, title: 'New thread', messages: [], running: false, ...fields });

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
      return { ...thread, running: true, messages: ensureAssistant(messages) };
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
      return { ...thread, running: false, messages: closeAssistant(messages).map((m) => (m.role === 'tool' ? { ...m, running: false } : m)) };
    }
    case 'error':
      return { ...thread, running: false, messages: [...closeAssistant(messages), { role: 'error', text: payload.message || 'Hermes reported an error.' }] };
    default:
      return thread;
  }
}

function historyToMessages(history = []) {
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'tool'))
    .map((m) => (m.role === 'tool' ? { role: 'tool', name: m.name, context: m.context } : { role: m.role, text: m.text || '' }));
}

export function useHermes() {
  const [connections, setConnections] = useState(EMPTY_CONNECTIONS);
  const [threads, setThreads] = useState(() => [newThread()]);
  const [activeKey, setActiveKey] = useState(threads[0].key);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const updateThread = useCallback((key, update) => {
    setThreads((current) => current.map((t) => (t.key === key ? update(t) : t)));
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const { sessions = [] } = await bridge.request('session.list', { limit: 50 });
      setThreads((current) => {
        const known = new Set(current.map((t) => t.storedId).filter(Boolean));
        const remote = sessions
          .filter((s) => !known.has(s.id))
          .map((s) => newThread({ storedId: s.id, title: s.title || s.preview || 'Untitled', loaded: false }));
        return [...current, ...remote];
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (!bridge) return;
    bridge.connections.list().then(setConnections);
    const offState = bridge.onState(({ connectionId, state, error }) => {
      setConnections((current) => ({ ...current, active: connectionId, state, error }));
    });
    const offEvent = bridge.onEvent(({ session_id: sessionId, type, payload }) => {
      if (!sessionId) return;
      setThreads((current) => current.map((t) => (t.sessionId === sessionId ? applyEvent(t, type, payload) : t)));
    });
    return () => {
      offState();
      offEvent();
    };
  }, []);

  // Session.list dedupes by stored id, so refreshing on every (re)connect is safe.
  const isReady = connections.state === 'ready';
  useEffect(() => {
    if (isReady) loadSessions();
  }, [isReady, connections.active, loadSessions]);

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
        title: t.messages.length === 0 ? text.slice(0, 48) : t.title,
        messages: [...t.messages, { role: 'user', text }, { role: 'assistant', text: '', streaming: true }],
      }));
      try {
        let sessionId = thread.sessionId;
        if (!sessionId) {
          const created = await bridge.request('session.create', {});
          sessionId = created.session_id;
          updateThread(key, (t) => ({ ...t, sessionId, storedId: created.stored_session_id || t.storedId }));
        }
        const result = await bridge.request('prompt.submit', { session_id: sessionId, text });
        if (result && result.status && result.status !== 'streaming' && result.status !== 'queued') {
          updateThread(key, (t) => ({ ...t, running: false, messages: closeAssistant(t.messages) }));
        }
      } catch (error) {
        updateThread(key, (t) => applyEvent(t, 'error', { message: error.message }));
      }
    },
    [activeKey, updateThread],
  );

  const stop = useCallback(async () => {
    const thread = threadsRef.current.find((t) => t.key === activeKey);
    if (!thread?.sessionId) return;
    try {
      await bridge.request('session.interrupt', { session_id: thread.sessionId });
    } catch {
      updateThread(thread.key, (t) => ({ ...t, running: false, messages: closeAssistant(t.messages) }));
    }
  }, [activeKey, updateThread]);

  return {
    available: Boolean(bridge),
    connections,
    threads,
    activeThread: threads.find((t) => t.key === activeKey) ?? threads[0],
    selectThread,
    createThread,
    send,
    stop,
    selectConnection: wrap((id) => bridge.connections.select(id), true),
    addConnection: wrap((input) => bridge.connections.add(input), true),
    removeConnection: wrap((id) => bridge.connections.remove(id), true),
    signIn: wrap((id) => bridge.connections.signIn(id)),
    signOut: wrap((id) => bridge.connections.signOut(id)),
  };
}
