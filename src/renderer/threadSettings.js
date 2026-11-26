import { useSyncExternalStore } from 'react';

// Which Hermes session sources the sidebar lists, by category. Defaults follow Hermes Desktop's
// recents (no automation, messaging lives elsewhere) and also leave out terminal sessions.
export const SOURCE_CATEGORIES = [
  { id: 'chats', label: 'Chats', description: 't3rmes, Hermes Desktop and the TUI', sources: ['tui', 'desktop', 'local', 'unknown'] },
  { id: 'terminal', label: 'Terminal', description: 'hermes chat in a shell', sources: ['cli'] },
  {
    id: 'messaging',
    label: 'Messaging',
    description: 'Slack, Telegram, webhooks and other platforms',
    sources: [
      'telegram', 'discord', 'slack', 'mattermost', 'matrix', 'signal', 'whatsapp', 'bluebubbles', 'photon',
      'homeassistant', 'email', 'sms', 'webhook', 'api_server', 'weixin', 'wecom', 'qqbot', 'yuanbao', 'dingtalk', 'feishu',
    ],
  },
  { id: 'automation', label: 'Automation', description: 'Cron jobs, tools, one-shots and subagents', sources: ['cron', 'tool', 'oneshot', 'subagent', 'acp', 'kanban'] },
  { id: 'other', label: 'Other', description: 'Agent integrations and anything else' },
];
export const DEFAULT_SOURCE_CATEGORIES = ['chats', 'other'];

const CATEGORY_BY_SOURCE = new Map(SOURCE_CATEGORIES.flatMap((c) => (c.sources || []).map((source) => [source, c.id])));
// Threads started here have no source until the list reports one; they count as chats.
export const sourceCategory = (source) => (source ? CATEGORY_BY_SOURCE.get(source) ?? 'other' : 'chats');

// The session-list query for a set of shown categories: an allow-list when "Other" is hidden
// (unknown sources stay out), otherwise a deny-list of the hidden categories.
export function sourceQuery(shown) {
  if (!shown.includes('other')) {
    return { sources: SOURCE_CATEGORIES.filter((c) => c.sources && shown.includes(c.id)).flatMap((c) => c.sources) };
  }
  return { excludeSources: SOURCE_CATEGORIES.filter((c) => c.sources && !shown.includes(c.id)).flatMap((c) => c.sources) };
}

// T3 Settings › Threads › auto-settle: threads idle this many days count as settled. null is off.
export const MIN_AUTO_SETTLE_DAYS = 1;
export const MAX_AUTO_SETTLE_DAYS = 90;
export const DEFAULT_AUTO_SETTLE_DAYS = 7;

const SOURCES_KEY = 't3rmes:thread-sources';
const AUTO_SETTLE_KEY = 't3rmes:auto-settle-days';
// Session id -> when it was un-settled by hand; the idle clock restarts from there.
const KEPT_KEY = 't3rmes:auto-settle-kept';
const KEYS = new Set([SOURCES_KEY, AUTO_SETTLE_KEY, KEPT_KEY]);
const listeners = new Set();
const cache = new Map();

function readJson(key, fallback) {
  const raw = localStorage.getItem(key);
  if (cache.has(key) && cache.get(key).raw === raw) return cache.get(key).value;
  let value = fallback;
  try {
    if (raw !== null) value = JSON.parse(raw);
  } catch {}
  cache.set(key, { raw, value });
  return value;
}

function writeJson(key, value, fallback) {
  if (JSON.stringify(value) === JSON.stringify(fallback)) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  const onStorage = (event) => KEYS.has(event.key) && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const readSources = () => {
  const value = readJson(SOURCES_KEY, DEFAULT_SOURCE_CATEGORIES);
  return Array.isArray(value) ? value : DEFAULT_SOURCE_CATEGORIES;
};
const readAutoSettle = () => {
  const value = readJson(AUTO_SETTLE_KEY, DEFAULT_AUTO_SETTLE_DAYS);
  return value === null || (Number.isInteger(value) && value >= MIN_AUTO_SETTLE_DAYS && value <= MAX_AUTO_SETTLE_DAYS) ? value : DEFAULT_AUTO_SETTLE_DAYS;
};

export const useSourceCategories = () => useSyncExternalStore(subscribe, readSources);
export const setSourceCategories = (ids) => writeJson(SOURCES_KEY, ids, DEFAULT_SOURCE_CATEGORIES);
export const useAutoSettleDays = () => useSyncExternalStore(subscribe, readAutoSettle);
export const setAutoSettleDays = (days) => writeJson(AUTO_SETTLE_KEY, days, DEFAULT_AUTO_SETTLE_DAYS);

const readKept = () => {
  const value = readJson(KEPT_KEY, {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
};
export const useAutoSettleKept = () => useSyncExternalStore(subscribe, readKept);
export function setAutoSettleKept(ids, kept) {
  const next = { ...readKept() };
  const now = Date.now() / 1000;
  for (const id of ids) {
    if (kept) next[id] = now;
    else delete next[id];
  }
  writeJson(KEPT_KEY, next, {});
}

// T3 auto-settle: unpinned, idle threads count as settled until something happens in them.
export function isAutoSettled(thread, days, kept, now = Date.now() / 1000) {
  if (days === null || !thread.storedId || thread.pinned || thread.running || thread.liveStatus) return false;
  return now - Math.max(thread.lastActive || 0, kept[thread.storedId] || 0) > days * 86400;
}
