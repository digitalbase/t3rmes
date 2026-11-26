// Hermes adapter for the main process: remote gateway registry, OAuth cookie
// sign-in and the JSON-RPC gateway socket. Mirrors Hermes Desktop
// (apps/desktop/electron) but keeps only what a remote chat client needs.
// REST and the socket live here because the gateway's CORS and WS Origin
// checks reject renderer origins for remote hosts.
const { app, BrowserWindow, net, session } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AT_COOKIES = ['__Host-hermes_session_at', '__Secure-hermes_session_at', 'hermes_session_at'];
const RT_COOKIES = ['__Host-hermes_session_rt', '__Secure-hermes_session_rt', 'hermes_session_rt'];
const CONNECT_TIMEOUT_MS = 15_000;
const PING_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 30_000;
const LONG_METHODS = { 'prompt.submit': 1_800_000, 'session.resume': 120_000, 'session.create': 120_000, 'file.attach': 120_000, 'image.attach_bytes': 120_000 };

// ---------- registry ----------

function registryPath() {
  return path.join(app.getPath('userData'), 'connections.json');
}

function writeRegistry(registry) {
  fs.mkdirSync(path.dirname(registryPath()), { recursive: true });
  fs.writeFileSync(registryPath(), JSON.stringify(registry, null, 2), { mode: 0o600 });
}

// Token connections are skipped: Hermes Desktop encrypts their tokens with its own key.
function importHermesDesktopRegistry() {
  try {
    const file = path.join(os.homedir(), '.config', 'Hermes', 'connections.json');
    const source = JSON.parse(fs.readFileSync(file, 'utf8'));
    const connections = (source.connections || [])
      .filter((c) => c && c.kind === 'remote' && c.url && c.authMode !== 'token')
      .map((c) => ({ id: c.id, kind: 'remote', label: c.label || c.url, url: normalizeBaseUrl(c.url), authMode: 'oauth' }));
    const ids = new Set(connections.map((c) => c.id));
    const active = [source.lastUsed, source.primary].find((id) => ids.has(id)) || connections[0]?.id || null;
    return { connections, active };
  } catch {
    return { connections: [], active: null };
  }
}

function labelKey(label) {
  return String(label || '').trim().toLowerCase();
}

function uniqueLabel(candidate, connections, exceptId) {
  const taken = new Set(connections.filter((c) => c.id !== exceptId).map((c) => labelKey(c.label)));
  const base = String(candidate || '').trim().slice(0, 64) || 'Remote';
  if (!taken.has(labelKey(base))) return base;
  for (let n = 2; ; n++) if (!taken.has(labelKey(`${base} ${n}`))) return `${base} ${n}`;
}

function uniqueId(candidate, connections) {
  const base = slug(candidate);
  let id = base;
  for (let n = 2; connections.some((c) => c.id === id); n++) id = `${base}-${n}`;
  return id;
}

// t3rmes is remote-only; older registries carried a "This device" entry.
function readRegistry() {
  try {
    const stored = JSON.parse(fs.readFileSync(registryPath(), 'utf8'));
    if (stored && stored.version === 1 && Array.isArray(stored.connections)) {
      const connections = stored.connections.filter((c) => c && c.kind === 'remote' && c.url);
      const active = connections.some((c) => c.id === stored.active) ? stored.active : connections[0]?.id || null;
      const registry = { version: 1, active, connections };
      if (connections.length !== stored.connections.length || active !== stored.active) writeRegistry(registry);
      return registry;
    }
  } catch {}
  const imported = importHermesDesktopRegistry();
  const registry = { version: 1, active: imported.active, connections: imported.connections };
  writeRegistry(registry);
  return registry;
}

function normalizeBaseUrl(raw) {
  let value = String(raw || '').trim();
  if (!value) throw new Error('Enter a URL.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `http://${value}`;
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Use an http or https URL.');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'remote';
}

// ---------- http helpers ----------

function requestJson(url, { method = 'GET', body, headers = {}, sess, timeoutMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    const request = net.request({ method, url, redirect: 'follow', ...(sess ? { session: sess, useSessionCookies: true } : {}) });
    request.setHeader('Accept', 'application/json');
    for (const [key, value] of Object.entries(headers)) request.setHeader(key, value);
    const timer = setTimeout(() => {
      request.abort();
      reject(new Error(`Request to ${new URL(url).host} timed out.`));
    }, timeoutMs);
    request.on('response', (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        clearTimeout(timer);
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {}
        if (response.statusCode >= 400) {
          const error = new Error(json?.detail || json?.error || `HTTP ${response.statusCode}`);
          error.status = response.statusCode;
          reject(error);
        } else resolve(json);
      });
    });
    request.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    if (body !== undefined) {
      request.setHeader('Content-Type', 'application/json');
      request.write(JSON.stringify(body));
    }
    request.end();
  });
}

// ---------- OAuth (cookie flow, like Hermes Desktop's embedded login) ----------

function oauthSession(connection) {
  return session.fromPartition(`persist:t3rmes-oauth:${connection.id}`);
}

async function hasSessionCookie(connection) {
  const cookies = await oauthSession(connection).cookies.get({ url: connection.url });
  return cookies.some((c) => c.value && (AT_COOKIES.includes(c.name) || RT_COOKIES.includes(c.name)));
}

function openLoginWindow(connection, parent) {
  return new Promise((resolve, reject) => {
    const sess = oauthSession(connection);
    let settled = false;
    const win = new BrowserWindow({
      width: 520,
      height: 720,
      parent,
      modal: false,
      title: `Sign in to ${connection.label}`,
      autoHideMenuBar: true,
      backgroundColor: '#111214',
      webPreferences: { session: sess, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      if (!win.isDestroyed()) win.destroy();
      error ? reject(error) : resolve();
    };
    // Only the access-token cookie proves a completed login; a leftover
    // refresh cookie from an expired session must not close the window.
    const check = async () => {
      const cookies = await sess.cookies.get({ url: connection.url }).catch(() => []);
      if (cookies.some((c) => c.value && AT_COOKIES.includes(c.name))) finish();
    };
    const poll = setInterval(check, 750);
    win.webContents.on('did-navigate', check);
    win.webContents.on('did-redirect-navigation', check);
    win.on('closed', () => finish(new Error('Sign-in window closed.')));
    win.loadURL(`${connection.url}/login`).catch((error) => finish(error));
  });
}

async function mintTicket(connection) {
  const body = await requestJson(`${connection.url}/api/auth/ws-ticket`, {
    method: 'POST',
    sess: oauthSession(connection),
    timeoutMs: 8_000,
  });
  if (!body?.ticket) throw new Error('Gateway did not return a WebSocket ticket.');
  return body.ticket;
}

// ---------- gateway socket ----------

class Gateway {
  constructor(connection, emit) {
    this.connection = connection;
    this.emit = emit;
    this.ws = null;
    this.pending = new Map();
    this.nextId = 1;
    this.state = 'idle';
    this.error = null;
    this.closed = false;
    this.retry = 0;
  }

  setState(state, error = null) {
    this.state = state;
    this.error = error;
    this.emit('state', { connectionId: this.connection.id, state, error });
  }

  async wsUrl() {
    const { connection } = this;
    const base = connection.url.replace(/^http/, 'ws');
    if (connection.authMode === 'token') return `${base}/api/ws?token=${encodeURIComponent(connection.token || '')}`;
    if (!(await hasSessionCookie(connection))) {
      const error = new Error('Sign in to connect.');
      error.signedOut = true;
      throw error;
    }
    try {
      return `${base}/api/ws?ticket=${encodeURIComponent(await mintTicket(connection))}`;
    } catch (error) {
      if (error.status === 401) error.signedOut = true;
      throw error;
    }
  }

  async connect() {
    if (this.closed || this.state === 'connecting' || this.state === 'starting' || this.state === 'ready') return;
    clearTimeout(this.retryTimer);
    try {
      this.setState('connecting');
      const url = await this.wsUrl();
      if (this.closed) return;
      this.setState('connecting');
      await this.open(url);
      this.retry = 0;
      this.setState('ready');
    } catch (error) {
      if (this.closed) return;
      if (error.signedOut) return this.setState('signed-out', error.message);
      this.setState('error', error.message);
      this.scheduleReconnect();
    }
  }

  open(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let ready = false;
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('Timed out connecting to Hermes.'));
      }, CONNECT_TIMEOUT_MS);
      ws.onmessage = (message) => {
        let frame;
        try {
          frame = JSON.parse(message.data);
        } catch {
          return;
        }
        if (frame.method === 'event' && frame.params) {
          if (frame.params.type === 'gateway.ready' && !ready) {
            ready = true;
            clearTimeout(timer);
            this.ping = setInterval(() => this.request('gateway.ping', {}, 45_000).catch(() => ws.close()), PING_INTERVAL_MS);
            resolve();
          }
          this.emit('event', { connectionId: this.connection.id, ...frame.params });
          return;
        }
        const pending = this.pending.get(frame.id);
        if (!pending) return;
        this.pending.delete(frame.id);
        clearTimeout(pending.timer);
        frame.error ? pending.reject(new Error(frame.error.message || 'Hermes request failed.')) : pending.resolve(frame.result);
      };
      ws.onclose = (event) => {
        clearTimeout(timer);
        clearInterval(this.ping);
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timer);
          pending.reject(new Error('Connection to Hermes closed.'));
        }
        this.pending.clear();
        if (this.ws === ws) this.ws = null;
        if (!ready) {
          const error = new Error(event.reason || `Hermes closed the connection (${event.code}).`);
          if (event.code === 4401) error.signedOut = this.connection.authMode === 'oauth';
          return reject(error);
        }
        if (this.closed) return;
        this.setState('error', 'Connection lost. Reconnecting…');
        this.scheduleReconnect();
      };
    });
  }

  scheduleReconnect() {
    const delay = [1_000, 2_000, 5_000, 10_000, 30_000][Math.min(this.retry++, 4)];
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (this.state !== 'ready') this.state = 'idle';
      this.connect();
    }, delay);
  }

  request(method, params = {}, timeoutMs = LONG_METHODS[method] || REQUEST_TIMEOUT_MS) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Not connected to Hermes.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  close() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.ping);
    this.ws?.close();
  }
}

// ---------- service ----------

function createHermesService({ getWindow }) {
  let registry = readRegistry();
  let gateway = null;

  const emit = (channel, payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(`hermes:${channel}`, payload);
  };

  const findConnection = (id) => registry.connections.find((c) => c.id === id);

  // The same gateway reached over http and https is still one gateway.
  const sameGateway = (a, b) => a.replace(/^https?:/, '') === b.replace(/^https?:/, '');
  const findByUrl = (url, exceptId) =>
    registry.connections.find((c) => c.kind === 'remote' && c.id !== exceptId && sameGateway(c.url, url));

  // Hermes Desktop gateways that are not in this registry yet.
  function importable() {
    return importHermesDesktopRegistry().connections.filter((c) => !findByUrl(c.url));
  }

  function snapshot() {
    return {
      active: registry.active,
      state: gateway?.state || 'idle',
      error: gateway?.error || null,
      connections: registry.connections.map(({ token, ...c }) => c),
      importable: importable().map(({ label, url }) => ({ label, url })),
    };
  }

  async function probe(baseUrl) {
    const status = await requestJson(`${baseUrl}/api/status`, { timeoutMs: 8_000 }).catch((error) => {
      throw new Error(`Could not reach ${new URL(baseUrl).host}: ${error.message}`);
    });
    if (!status || typeof status !== 'object') throw new Error('That URL is not a Hermes gateway.');
  }

  // With no gateways saved there is nothing to connect to; the renderer asks for one.
  function activate(id) {
    const connection = findConnection(id) || registry.connections[0];
    if (!connection) {
      gateway?.close();
      gateway = null;
      registry.active = null;
      writeRegistry(registry);
      emit('state', { connectionId: null, state: 'idle', error: null });
      return;
    }
    if (gateway && gateway.connection.id === connection.id && !gateway.closed) {
      if (gateway.state !== 'ready') {
        gateway.state = 'idle';
        gateway.connect();
      }
      return;
    }
    gateway?.close();
    registry.active = connection.id;
    writeRegistry(registry);
    gateway = new Gateway(connection, emit);
    gateway.connect();
  }

  return {
    start() {
      activate(registry.active);
    },
    stop() {
      gateway?.close();
    },
    list: () => snapshot(),
    select(id) {
      activate(id);
      return snapshot();
    },
    async add({ url, label }) {
      const baseUrl = normalizeBaseUrl(url);
      const existing = findByUrl(baseUrl);
      if (existing) throw new Error(`${new URL(baseUrl).host} is already added as “${existing.label}”.`);
      await probe(baseUrl);
      const host = new URL(baseUrl).host;
      const id = uniqueId(host, registry.connections);
      registry.connections.push({ id, kind: 'remote', label: uniqueLabel(label || host, registry.connections), url: baseUrl, authMode: 'oauth' });
      writeRegistry(registry);
      activate(id);
      return snapshot();
    },
    // Rename, or point at a new URL. A new URL drops the old sign-in.
    async update(id, { label, url }) {
      const connection = findConnection(id);
      if (!connection) throw new Error('Unknown connection.');
      let urlChanged = false;
      if (url !== undefined && connection.kind === 'remote') {
        const baseUrl = normalizeBaseUrl(url);
        if (baseUrl !== connection.url) {
          const existing = findByUrl(baseUrl, id);
          if (existing) throw new Error(`${new URL(baseUrl).host} is already added as “${existing.label}”.`);
          await probe(baseUrl);
          await oauthSession(connection).clearStorageData().catch(() => {});
          connection.url = baseUrl;
          urlChanged = true;
        }
      }
      if (label !== undefined && String(label).trim()) connection.label = uniqueLabel(label, registry.connections, id);
      writeRegistry(registry);
      if (urlChanged && gateway?.connection.id === id) {
        gateway.close();
        gateway = null;
        activate(id);
      } else if (gateway?.connection.id === id) {
        gateway.connection = connection;
      }
      return snapshot();
    },
    importFromHermesDesktop() {
      for (const c of importable()) {
        registry.connections.push({
          ...c,
          id: uniqueId(c.id, registry.connections),
          label: uniqueLabel(c.label, registry.connections),
        });
      }
      writeRegistry(registry);
      return snapshot();
    },
    remove(id) {
      const connection = findConnection(id);
      registry.connections = registry.connections.filter((c) => c.id !== id);
      if (connection) oauthSession(connection).clearStorageData().catch(() => {});
      if (registry.active === id) activate(registry.connections[0]?.id);
      else writeRegistry(registry);
      return snapshot();
    },
    async signIn(id) {
      const connection = findConnection(id);
      if (!connection || connection.kind !== 'remote') throw new Error('Unknown connection.');
      await openLoginWindow(connection, getWindow());
      activate(id);
      return snapshot();
    },
    async signOut(id) {
      const connection = findConnection(id);
      if (!connection) return snapshot();
      await oauthSession(connection).clearStorageData();
      if (gateway?.connection.id === id) {
        gateway.close();
        gateway = new Gateway(connection, emit);
        gateway.setState('signed-out', 'Signed out.');
      }
      return snapshot();
    },
    request(method, params) {
      if (!gateway) return Promise.reject(new Error('Not connected to Hermes.'));
      return gateway.request(method, params);
    },
    // REST calls against the active runtime, authenticated the same way as the socket.
    async rest(method, pathname, body) {
      const connection = gateway?.connection;
      if (!connection) throw new Error('Not connected to Hermes.');
      if (connection.authMode === 'token') {
        return requestJson(`${connection.url}${pathname}`, { method, body, headers: { Authorization: `Bearer ${connection.token || ''}` } });
      }
      return requestJson(`${connection.url}${pathname}`, { method, body, sess: oauthSession(connection) });
    },
    // Session edits are revision-fenced: send the row's runtime_revision with a
    // fresh request id, and retry once against the current revision if it moved.
    async updateSession(id, patch) {
      const pathname = `/api/sessions/${encodeURIComponent(id)}`;
      for (let attempt = 0; ; attempt++) {
        const snapshot = await this.rest('GET', `${pathname}/mutation-snapshot`).catch((error) => {
          // Older runtimes have no fence and no snapshot route; a plain PATCH works there.
          if (error.status === 404 || error.status === 405) return null;
          throw error;
        });
        const body = snapshot
          ? { ...patch, request_id: crypto.randomUUID(), expected_revision: snapshot.runtime_revision ?? 0 }
          : patch;
        try {
          return await this.rest('PATCH', pathname, body);
        } catch (error) {
          if (attempt > 0 || error.status !== 409 || !/revision/i.test(error.message)) throw error;
        }
      }
    },
  };
}

module.exports = { createHermesService };
