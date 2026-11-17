import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CheckIcon,
  ChevronsUpDownIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  GitBranchIcon,
  MessageCircleQuestionIcon,
  MessageSquareIcon,
  PinIcon,
  Undo2Icon,
  LoaderCircleIcon,
  GlobeIcon,
  MonitorIcon,
  PlusIcon,
  Trash2Icon,
  WrenchIcon,
  PaletteIcon,
  SearchIcon,
  Settings2Icon,
  SettingsIcon,
  SquarePenIcon,
  SquareIcon,
  FolderIcon,
  ListFilterIcon,
  XIcon,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from '../t3/components/ui/sidebar.tsx';
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from '../t3/components/ui/tooltip.tsx';
import { Button } from '../t3/components/ui/button.tsx';
import { Kbd } from '../t3/components/ui/kbd.tsx';
import { Switch } from '../t3/components/ui/switch.tsx';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { DialogBackdrop } from '../t3/components/ui/dialog.tsx';
import { Input } from '../t3/components/ui/input.tsx';
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '../t3/components/ui/menu.tsx';
import {
  Combobox,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxSearchInput,
  ComboboxTrigger,
} from '../t3/components/ui/combobox.tsx';
import { CollapsibleSectionHeader } from '../t3/components/ui/collapsible-section-header.tsx';
import { cn } from '../t3/lib/utils.ts';
import { threadStatus, threadTitle, useHermes } from './hermes.js';
import {
  ComposerAttachButton,
  ComposerAttachmentStrip,
  MessageAttachments,
  ProviderModelPicker,
  toAttachment,
  useComposerSelection,
} from './composer.jsx';
import { AppearanceSettings } from './AppearanceSettings.jsx';
import { SettingsPageContainer, SettingsRow, SettingsSection } from './settingsLayout.jsx';
import '@fontsource-variable/inter';
import './styles.css';

const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', icon: Settings2Icon },
  { id: 'appearance', label: 'Appearance', icon: PaletteIcon },
  { id: 'connections', label: 'Connections', icon: GlobeIcon },
];

const STATE_LABELS = {
  idle: 'Disconnected',
  starting: 'Starting Hermes…',
  connecting: 'Connecting…',
  ready: 'Connected',
  'signed-out': 'Signed out',
  error: 'Disconnected',
};

function stateTone(state) {
  if (state === 'ready') return 'bg-success';
  if (state === 'connecting' || state === 'starting') return 'bg-warning animate-pulse';
  return 'bg-destructive';
}

// T3 threadSidebarWidth.ts
const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = 'chat_thread_sidebar_width';
const THREAD_SIDEBAR_DEFAULT_WIDTH = 16 * 16;
const THREAD_SIDEBAR_MIN_WIDTH = 13 * 16;
const THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16;

function resolveThreadSidebarMaximumWidth(viewportWidth) {
  return Math.max(THREAD_SIDEBAR_MIN_WIDTH, Math.floor(viewportWidth) - THREAD_MAIN_CONTENT_MIN_WIDTH);
}

function resolveInitialThreadSidebarWidth(storedWidth, viewportWidth) {
  const preferred = storedWidth === null ? THREAD_SIDEBAR_DEFAULT_WIDTH : Math.max(THREAD_SIDEBAR_MIN_WIDTH, storedWidth);
  return Math.min(preferred, resolveThreadSidebarMaximumWidth(viewportWidth));
}

function readStoredSidebarWidth() {
  try {
    const value = JSON.parse(localStorage.getItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY) ?? 'null');
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function subscribeToViewportWidth(onChange) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

function App() {
  const hermes = useHermes();
  const [settingsOpen, setSettingsOpen] = useState(() => window.location.hash === '#settings');
  const [section, setSection] = useState('general');
  const { connections, activeThread } = hermes;
  const activeConnection = connections.connections.find((c) => c.id === connections.active);
  const viewportWidth = useSyncExternalStore(subscribeToViewportWidth, () => window.innerWidth);
  const [sidebarWidth, setSidebarWidth] = useState(() => resolveInitialThreadSidebarWidth(readStoredSidebarWidth(), window.innerWidth));
  const sidebarMaximumWidth = resolveThreadSidebarMaximumWidth(viewportWidth);
  const resetSidebarWidth = () => {
    localStorage.removeItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY);
    setSidebarWidth(resolveInitialThreadSidebarWidth(null, viewportWidth));
  };

  function openConnections() {
    setSection('connections');
    setSettingsOpen(true);
  }

  return (
    <SidebarProvider className="h-dvh! min-h-0!" defaultOpen style={{ '--sidebar-width': `${sidebarWidth}px` }}>
      <Sidebar
        side="left"
        collapsible="offcanvas"
        className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
        resizable={{
          maxWidth: sidebarMaximumWidth,
          minWidth: THREAD_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: ({ currentWidth, nextWidth, wrapper }) =>
            nextWidth <= currentWidth || wrapper.clientWidth - nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH,
          storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
          onResize: setSidebarWidth,
        }}
      >
        <SidebarHeader className="drag-region relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-4 py-0">
          <span className="inline-flex min-w-0 items-baseline gap-1 text-sm font-medium tracking-tight text-foreground">
            <span className="font-semibold">T3</span>
            <span className="truncate text-muted-foreground">rmes</span>
          </span>
        </SidebarHeader>
        <ThreadNav
          hermes={hermes}
          activeKey={activeThread.key}
          onSelect={hermes.selectThread}
          onNew={hermes.createThread}
          onManageConnections={openConnections}
        />
        <SidebarFooter>
          <SidebarMenu className="flex-row items-center">
            <SidebarMenuItem className="shrink-0">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <SidebarMenuButton aria-label="Settings" size="icon" onClick={() => setSettingsOpen(true)}>
                      <SettingsIcon />
                    </SidebarMenuButton>
                  }
                />
                <TooltipPopup side="top">Settings</TooltipPopup>
              </Tooltip>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail onDoubleClick={resetSidebarWidth} />
      </Sidebar>
      <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground isolate">
        <ChatView
          thread={activeThread}
          connection={activeConnection}
          connectionState={connections.state}
          connectionError={connections.error}
          onSignIn={() => hermes.signIn(connections.active).catch(() => {})}
          onSend={hermes.send}
          onStop={hermes.stop}
          picker={hermes}
        />
      </SidebarInset>
      <SettingsModal open={settingsOpen} section={section} onSectionChange={setSection} onClose={() => setSettingsOpen(false)} hermes={hermes} />
    </SidebarProvider>
  );
}

function ConnectionSwitcher({ hermes, onManage }) {
  const { connections } = hermes;
  const active = connections.connections.find((c) => c.id === connections.active);
  return (
    <Menu>
      <MenuTrigger
        render={
          <SidebarMenuButton className="h-8 min-w-0 flex-1 text-sidebar-muted-foreground hover:text-sidebar-foreground data-[popup-open]:text-sidebar-foreground" />
        }
      >
        {active?.kind === 'local' ? <MonitorIcon /> : <GlobeIcon />}
        <span className="min-w-0 flex-1 truncate">{active?.label ?? 'Hermes'}</span>
        <span className={cn('size-1.5 shrink-0 rounded-full', stateTone(connections.state))} />
        <ChevronsUpDownIcon className="text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup side="bottom" align="start" className="w-(--anchor-width) min-w-56">
        <MenuGroup>
          <MenuGroupLabel>Hermes runtime</MenuGroupLabel>
          <MenuRadioGroup value={connections.active} onValueChange={(id) => hermes.selectConnection(id)}>
            {connections.connections.map((connection) => (
              <MenuRadioItem key={connection.id} value={connection.id}>
                <span className="flex min-w-0 items-center gap-2">
                  {connection.kind === 'local' ? <MonitorIcon className="size-3.5 text-muted-foreground" /> : <GlobeIcon className="size-3.5 text-muted-foreground" />}
                  <span className="truncate">{connection.label}</span>
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem onClick={onManage}>
          <PlusIcon />
          Add or manage runtimes…
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

// ---------- thread list (T3 Sidebar.tsx SidebarThreadRow, fed by Hermes sessions) ----------

const SETTLED_SHELF_STORAGE_KEY = 't3rmes_settled_shelf_expanded';
const WORKING_SHELF_STORAGE_KEY = 't3rmes_working_shelf_expanded';

function compactTimeLabel(epochSeconds) {
  if (!epochSeconds) return '';
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - epochSeconds));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatWorkingDurationLabel(elapsedMs) {
  const seconds = Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs / 1000)) : 0;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// Self-ticking so only this span re-renders each second, not the whole row.
function WorkingDuration({ startedAt }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setTick((tick) => tick + 1), 1_000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return null;
  return <span className="tabular-nums">{formatWorkingDurationLabel(Date.now() - startedAt)}</span>;
}

const basename = (value) => value?.replace(/\/+$/, '').split('/').pop() || null;
const modelLabel = (model) => model?.split('/').pop()?.trim() || null;

function projectLabel(thread) {
  return basename(thread.repoRoot) || basename(thread.cwd) || thread.source || null;
}

const STATUS_PRESENTATION = {
  working: { label: 'Working', Icon: CircleDashedIcon, className: 'text-sky-600 dark:text-sky-400' },
  waiting: { label: 'Input', Icon: MessageCircleQuestionIcon, className: 'text-indigo-600 dark:text-indigo-300' },
  failed: { label: 'Failed', Icon: CircleAlertIcon, className: 'text-red-700 dark:text-red-300' },
  unread: { label: 'Done', Icon: CircleCheckIcon, className: 'text-emerald-700 dark:text-emerald-300' },
};

function useShelfExpanded(storageKey) {
  const [expanded, setExpanded] = useState(() => localStorage.getItem(storageKey) === '1');
  const toggle = () =>
    setExpanded((value) => {
      localStorage.setItem(storageKey, value ? '0' : '1');
      return !value;
    });
  return [expanded, toggle];
}

// A collapsed shelf still shows the open thread, like T3's routeThreadOnly.
const shelfRows = (list, expanded, activeKey) => (expanded ? list : list.filter((t) => t.key === activeKey));

const EMPTY_SELECTION = { keys: new Set(), anchor: null };

const PROJECT_SCOPE_STORAGE_KEY = 't3rmes_project_scope';

function readStoredProjectScope() {
  try {
    const value = JSON.parse(localStorage.getItem(PROJECT_SCOPE_STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((key) => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

// Hermes FTS snippets wrap hits in >>> <<< markers.
const cleanSearchSnippet = (snippet) => (snippet || '').replace(/>>>|<<</g, '').replace(/\s+/g, ' ').trim();

function ThreadNav({ hermes, activeKey, onSelect, onNew, onManageConnections }) {
  const { threads, syncSupported } = hermes;
  const [settledExpanded, toggleSettled] = useShelfExpanded(SETTLED_SHELF_STORAGE_KEY);
  const [workingExpanded, toggleWorking] = useShelfExpanded(WORKING_SHELF_STORAGE_KEY);
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const [, setClock] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setClock((tick) => tick + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const clearSelection = () => setSelection((current) => (current.keys.size === 0 && current.anchor === null ? current : EMPTY_SELECTION));
  useEffect(() => {
    if (selection.keys.size === 0) return;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setSelection(EMPTY_SELECTION);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selection.keys.size]);

  const [projectScope, setProjectScopeState] = useState(readStoredProjectScope);
  const setProjectScope = (keys) => {
    localStorage.setItem(PROJECT_SCOPE_STORAGE_KEY, JSON.stringify(keys));
    setProjectScopeState(keys);
    clearSelection();
  };
  const searchInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHighlight, setSearchHighlight] = useState(0);
  const [serverSearch, setServerSearch] = useState({ query: '', results: [] });
  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length > 0;
  useEffect(() => {
    if (!isSearching || !window.t3rmes?.sessions?.search) return;
    let cancelled = false;
    const id = window.setTimeout(async () => {
      try {
        const { results = [] } = await window.t3rmes.sessions.search(trimmedQuery);
        if (!cancelled) setServerSearch({ query: trimmedQuery, results });
      } catch {
        if (!cancelled) setServerSearch({ query: trimmedQuery, results: [] });
      }
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [isSearching, trimmedQuery]);

  // Unsent new threads only show while they are open, like T3 drafts.
  const allVisible = threads.filter((t) => t.storedId || t.messages.length > 0 || t.key === activeKey);
  const projects = [...new Set(allVisible.map(projectLabel).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const scope = projectScope.filter((key) => projects.includes(key));
  const visible = scope.length === 0 ? allVisible : allVisible.filter((t) => scope.includes(projectLabel(t)) || t.key === activeKey);
  const byRecent = (a, b) => (a.storedId ? 0 : 1) - (b.storedId ? 0 : 1) || b.lastActive - a.lastActive;
  const isWorking = (t) => threadStatus(t) === 'working';
  const pinned = visible.filter((t) => t.pinned && !t.archived).sort(byRecent);
  const inbox = visible.filter((t) => !t.pinned && !t.archived);
  const active = inbox.filter((t) => !isWorking(t)).sort(byRecent);
  const working = inbox.filter(isWorking).sort((a, b) => (b.runningSince ?? 0) - (a.runningSince ?? 0));
  const settled = visible.filter((t) => t.archived).sort((a, b) => b.lastActive - a.lastActive);
  const renderedWorking = shelfRows(working, workingExpanded, activeKey);
  const renderedSettled = shelfRows(settled, settledExpanded, activeKey);
  const orderedKeys = [...pinned, ...active, ...renderedWorking, ...renderedSettled].map((t) => t.key);
  const threadByKey = new Map(visible.map((t) => [t.key, t]));

  // T3 lists title matches first, then threads that matched on message content.
  const foldedQuery = trimmedQuery.toLowerCase();
  const titleResults = isSearching
    ? visible.filter((t) => threadTitle(t).toLowerCase().includes(foldedQuery)).sort((a, b) => b.lastActive - a.lastActive)
    : [];
  const titleResultKeys = new Set(titleResults.map((t) => t.key));
  const threadByStoredId = new Map(visible.filter((t) => t.storedId).map((t) => [t.storedId, t]));
  const searchMatchByKey = new Map();
  const contentResults = [];
  if (isSearching && serverSearch.query) {
    for (const hit of serverSearch.results) {
      const thread = threadByStoredId.get(hit.session_id) ?? threadByStoredId.get(hit.id);
      if (!thread || searchMatchByKey.has(thread.key)) continue;
      if (hit.role === 'user' || hit.role === 'assistant') {
        searchMatchByKey.set(thread.key, { source: hit.role, snippet: cleanSearchSnippet(hit.snippet), query: serverSearch.query });
      }
      if (!titleResultKeys.has(thread.key)) contentResults.push(thread);
    }
  }
  const searchResults = [...titleResults, ...contentResults];
  const activeSearchIndex = Math.min(searchHighlight, Math.max(0, searchResults.length - 1));
  const searchPending = isSearching && serverSearch.query !== trimmedQuery;

  function changeSearchQuery(value) {
    setSearchQuery(value);
    setSearchHighlight(0);
  }

  function selectSearchResult(thread) {
    changeSearchQuery('');
    onSelect(thread.key);
  }

  function handleSearchKeyDown(event) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape' && isSearching) {
      event.preventDefault();
      event.stopPropagation();
      changeSearchQuery('');
      return;
    }
    if (searchResults.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setSearchHighlight((activeSearchIndex + step + searchResults.length) % searchResults.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const result = searchResults[activeSearchIndex];
      if (result) selectSearchResult(result);
    }
  }

  function handleRowClick(event, thread) {
    const isMac = /mac/i.test(navigator.platform);
    if (isMac ? event.metaKey : event.ctrlKey) {
      event.preventDefault();
      setSelection((current) => {
        const keys = new Set(current.keys);
        if (keys.has(thread.key)) keys.delete(thread.key);
        else keys.add(thread.key);
        return { keys, anchor: keys.has(thread.key) ? thread.key : current.anchor };
      });
      return;
    }
    if (event.shiftKey) {
      event.preventDefault();
      setSelection((current) => {
        const keys = new Set(current.keys);
        const anchor = current.anchor ?? activeKey;
        const from = orderedKeys.indexOf(anchor);
        const to = orderedKeys.indexOf(thread.key);
        if (from === -1 || to === -1) {
          keys.add(thread.key);
          return { keys, anchor: thread.key };
        }
        for (let i = Math.min(from, to); i <= Math.max(from, to); i++) keys.add(orderedKeys[i]);
        return { keys, anchor };
      });
      return;
    }
    setSelection({ keys: new Set(), anchor: thread.key });
    onSelect(thread.key);
  }

  async function openBulkContextMenu() {
    const selected = [...selection.keys].map((key) => threadByKey.get(key)).filter((t) => t?.storedId);
    if (selected.length === 0) return;
    const keysOf = (list) => list.map((t) => t.key);
    const pinnedSelected = selected.filter((t) => t.pinned);
    const unpinnedSelected = selected.filter((t) => !t.pinned);
    const settling = selected.filter((t) => !t.archived);
    const unsettling = selected.filter((t) => t.archived);
    const clicked = await window.t3rmes.showContextMenu([
      ...(unpinnedSelected.length ? [{ id: 'pin', label: `Pin (${unpinnedSelected.length})` }] : []),
      ...(pinnedSelected.length ? [{ id: 'unpin', label: `Unpin (${pinnedSelected.length})` }] : []),
      ...(settling.length ? [{ id: 'settle', label: `Settle (${settling.length})` }] : []),
      ...(unsettling.length ? [{ id: 'unsettle', label: `Un-settle (${unsettling.length})` }] : []),
      { id: 'mark-unread', label: `Mark unread (${selected.length})` },
    ]);
    if (!clicked) return;
    clearSelection();
    if (clicked === 'pin') hermes.patchThreads(keysOf(unpinnedSelected), { pinned: true });
    else if (clicked === 'unpin') hermes.patchThreads(keysOf(pinnedSelected), { pinned: false });
    else if (clicked === 'settle') hermes.patchThreads(keysOf(settling), { archived: true });
    else if (clicked === 'unsettle') hermes.patchThreads(keysOf(unsettling), { archived: false });
    else if (clicked === 'mark-unread') hermes.patchThreads(keysOf(selected), { unread: true });
  }

  async function openContextMenu(event, thread) {
    if (!syncSupported || !thread.storedId || !window.t3rmes?.showContextMenu) return;
    event.preventDefault();
    if (selection.keys.size > 0 && selection.keys.has(thread.key)) {
      await openBulkContextMenu();
      return;
    }
    const clicked = await window.t3rmes.showContextMenu([
      { id: 'pin', label: thread.pinned ? 'Unpin' : 'Pin' },
      { id: 'settle', label: thread.archived ? 'Un-settle' : 'Settle' },
      { id: 'unread', label: 'Mark unread' },
      { id: 'copy', label: 'Copy session ID', separatorBefore: true },
    ]);
    if (clicked === 'pin') hermes.pinThread(thread.key, !thread.pinned);
    else if (clicked === 'settle') hermes.settleThread(thread.key, !thread.archived);
    else if (clicked === 'unread') hermes.markUnread(thread.key);
    else if (clicked === 'copy') navigator.clipboard.writeText(thread.storedId);
  }

  const row = (thread, variant) => (
    <SidebarThreadRow
      key={`${thread.key}:${variant}`}
      thread={thread}
      variant={variant}
      isActive={thread.key === activeKey}
      isSelected={selection.keys.has(thread.key)}
      syncSupported={syncSupported && Boolean(thread.storedId)}
      onSelect={(event) => handleRowClick(event, thread)}
      onContextMenu={(event) => openContextMenu(event, thread)}
      onPin={(value) => hermes.pinThread(thread.key, value)}
      onSettle={(value) => hermes.settleThread(thread.key, value)}
    />
  );

  return (
    <SidebarContent
      className="min-h-full overflow-x-hidden"
      fixedHeader={
        <SidebarGroup className="z-[1] gap-1 pt-0">
          <div className="flex items-center">
            <ConnectionSwitcher hermes={hermes} onManage={onManageConnections} />
          </div>
          <SidebarThreadHeader
            searchInputRef={searchInputRef}
            searchQuery={searchQuery}
            onSearchQueryChange={changeSearchQuery}
            onSearchKeyDown={handleSearchKeyDown}
            isSearching={isSearching}
            searchResultCount={searchResults.length}
            activeSearchResultIndex={activeSearchIndex}
            onClearSearch={() => changeSearchQuery('')}
            projectScope={
              projects.length > 0 ? <ProjectScopeFilter projects={projects} scope={scope} onScopeChange={setProjectScope} /> : null
            }
            onNewThread={onNew}
          />
        </SidebarGroup>
      }
    >
      {isSearching ? (
        <SidebarGroup className="flex-1 pt-0">
          {searchResults.length > 0 ? (
            <TooltipProvider delay={150} closeDelay={0} timeout={400}>
              <ul id="sidebar-thread-search-results" role="listbox" aria-label="Thread search results" className="flex flex-col gap-px">
                {searchResults.map((thread, index) => (
                  <SidebarSearchResultRow
                    key={thread.key}
                    thread={thread}
                    resultId={`sidebar-thread-search-result-${index}`}
                    isSettled={thread.archived}
                    isHighlighted={index === activeSearchIndex}
                    isRouteActive={thread.key === activeKey}
                    searchMatch={searchMatchByKey.get(thread.key) ?? null}
                    onHighlight={() => setSearchHighlight(index)}
                    onSelect={() => selectSearchResult(thread)}
                  />
                ))}
              </ul>
            </TooltipProvider>
          ) : (
            <p role="status" className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground">
              {searchPending ? 'Searching thread messages…' : 'No threads found'}
            </p>
          )}
        </SidebarGroup>
      ) : (
      <SidebarGroup className="flex-1 ps-[calc(var(--sidebar-content-inset)+1px)] pe-[var(--sidebar-content-inset)] pt-0 pb-1">
        <TooltipProvider delay={150} closeDelay={0} timeout={400}>
        <ul role="list" className="relative flex flex-1 flex-col gap-px">
          {pinned.map((thread) => row(thread, 'card'))}
          {active.map((thread) => row(thread, 'card'))}
          {working.length > 0 && (
            <SidebarShelfHeader className="mt-auto" label="Working" count={working.length} expanded={workingExpanded} onToggle={toggleWorking} />
          )}
          {renderedWorking.map((thread) => row(thread, 'card'))}
          {settled.length > 0 && (
            <SidebarShelfHeader
              className={cn(working.length === 0 && 'mt-auto')}
              label="Settled"
              count={settled.length}
              expanded={settledExpanded}
              onToggle={toggleSettled}
            />
          )}
          {renderedSettled.map((thread) => row(thread, 'slim'))}
        </ul>
        </TooltipProvider>
      </SidebarGroup>
      )}
    </SidebarContent>
  );
}

// T3 SidebarThreadHeader.tsx SidebarHeaderIconButton.
function SidebarHeaderIconButton({ label, className, children, ...rest }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<SidebarMenuButton size="icon" type="button" aria-label={label} {...rest} className={cn('relative size-7 shrink-0', className)} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

// T3 SidebarThreadHeader.tsx: search pill, project filter, new thread.
function SidebarThreadHeader({
  searchInputRef,
  searchQuery,
  onSearchQueryChange,
  onSearchKeyDown,
  isSearching,
  searchResultCount,
  activeSearchResultIndex,
  onClearSearch,
  projectScope,
  onNewThread,
}) {
  const resultsVisible = isSearching && searchResultCount > 0;
  const activeResultExists = resultsVisible && activeSearchResultIndex < searchResultCount;
  return (
    <div className="flex items-center gap-1">
      <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-within:bg-sidebar-row-hover focus-within:text-sidebar-foreground focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring/70">
        <SearchIcon className="size-4 shrink-0 text-(--sidebar-icon-color)" />
        <SidebarInput
          ref={searchInputRef}
          nativeInput
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Search"
          aria-label="Search threads"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={resultsVisible}
          aria-controls={resultsVisible ? 'sidebar-thread-search-results' : undefined}
          aria-activedescendant={activeResultExists ? `sidebar-thread-search-result-${activeSearchResultIndex}` : undefined}
          className="min-w-0 flex-1"
        />
        {isSearching ? (
          <Button
            type="button"
            size="icon-micro"
            variant="ghost-muted"
            className="shrink-0"
            aria-label="Clear thread search"
            onClick={() => {
              onClearSearch();
              searchInputRef.current?.focus();
            }}
          >
            <XIcon className="size-3" />
          </Button>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        {projectScope}
        <SidebarHeaderIconButton label="New thread" onClick={onNewThread}>
          <SquarePenIcon />
        </SidebarHeaderIconButton>
      </div>
    </div>
  );
}

// T3 Sidebar.tsx ProjectScopeRowIcon.
function ProjectScopeRowIcon({ isSelected, children }) {
  return (
    <span className="relative flex shrink-0">
      {children}
      {isSelected ? (
        <span className="pointer-events-none absolute -right-1 -bottom-1 grid size-3 place-items-center rounded-full bg-primary ring-2 ring-popover">
          <CheckIcon className="size-2 text-primary-foreground" strokeWidth={4} aria-hidden />
        </span>
      ) : null}
    </span>
  );
}

// T3's project-scope Combobox; Hermes projects are repo/cwd basenames. Shift+click toggles several.
function ProjectScopeFilter({ projects, scope, onScopeChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const items = [{ value: 'all', label: 'All projects' }, ...projects.map((p) => ({ value: p, label: p }))];
  const folded = query.trim().toLowerCase();
  const filteredItems = folded ? items.filter((item) => item.label.toLowerCase().includes(folded)) : items;
  const selectedItem = scope.length === 1 ? items.find((item) => item.value === scope[0]) ?? items[0] : items[0];
  const label = scope.length > 0 ? `Filter threads by project: ${scope.join(', ')}` : 'Filter threads by project';
  return (
    <Combobox
      items={items}
      filteredItems={filteredItems}
      autoHighlight
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
      value={selectedItem}
      onValueChange={(item, eventDetails) => {
        if (!item) return;
        if (item.value === 'all') onScopeChange([]);
        else if (eventDetails.event instanceof MouseEvent && eventDetails.event.shiftKey) {
          eventDetails.cancel();
          onScopeChange(scope.includes(item.value) ? scope.filter((key) => key !== item.value) : [...scope, item.value]);
        } else onScopeChange([item.value]);
      }}
    >
      <ComboboxTrigger render={<SidebarHeaderIconButton label={label} className={cn(scope.length > 0 && 'text-sidebar-foreground')} />}>
        {scope.length > 0 ? <FolderIcon className="size-4" /> : <ListFilterIcon className="size-4" />}
      </ComboboxTrigger>
      <ComboboxPopup
        align="start"
        collisionAvoidance={{ side: 'flip', align: 'shift' }}
        className="w-[min(18rem,var(--available-width))] overflow-hidden"
        finalFocus={(closeType) => closeType === 'keyboard'}
      >
        <ComboboxSearchInput
          aria-label="Search projects"
          placeholder="Search projects..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ComboboxEmpty>No matching projects.</ComboboxEmpty>
        <ComboboxList aria-multiselectable>
          {(item) => {
            const isSelected = item.value === 'all' ? scope.length === 0 : scope.includes(item.value);
            return (
              <ComboboxItem key={item.value} hideIndicator value={item} aria-selected={isSelected} data-selected={undefined}>
                <ProjectScopeRowIcon isSelected={isSelected}>
                  <FolderIcon className="size-4 shrink-0" />
                </ProjectScopeRowIcon>
                <span className="min-w-0 truncate text-sm">{item.label}</span>
                <span className="ml-auto size-7 shrink-0 sm:size-6" />
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}

const scrollHighlightedResultIntoView = (node) => node?.scrollIntoView({ block: 'nearest' });

// T3 ThreadSearchMatch.tsx ThreadSearchMatchExcerpt, query terms in semibold.
function ThreadSearchMatchExcerpt({ match }) {
  const isUser = match.source === 'user';
  const terms = match.query.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = terms.length ? match.snippet.split(new RegExp(`(${terms.join('|')})`, 'gi')) : [match.snippet];
  return (
    <span className="truncate text-xs text-muted-foreground/85">
      <span className={isUser ? 'text-info-foreground' : 'text-success-foreground'}>{isUser ? 'You:' : 'Agent:'}</span>{' '}
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="bg-transparent font-semibold text-foreground">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </span>
  );
}

// T3 SidebarThreadRow.tsx SidebarSearchResultRow.
function SidebarSearchResultRow({ thread, resultId, isSettled, isHighlighted, isRouteActive, searchMatch, onHighlight, onSelect }) {
  const project = projectLabel(thread);
  return (
    <li ref={isHighlighted ? scrollHighlightedResultIntoView : undefined} role="presentation" className="list-none">
      <button
        id={resultId}
        type="button"
        role="option"
        tabIndex={-1}
        aria-selected={isHighlighted}
        aria-current={isRouteActive ? 'page' : undefined}
        onMouseMove={onHighlight}
        onPointerDown={(event) => event.preventDefault()}
        onClick={onSelect}
        className={cn(
          'group/sidebar-row flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1 text-left text-sm outline-none',
          isHighlighted || isRouteActive
            ? 'bg-sidebar-row-active text-sidebar-foreground'
            : 'text-sidebar-muted-foreground/75 hover:bg-sidebar-row-hover hover:text-sidebar-foreground',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                'min-w-0 flex-1 truncate',
                isSettled ? 'font-normal text-secondary-label/70 group-hover/sidebar-row:text-foreground' : 'font-medium text-foreground',
                (isHighlighted || isRouteActive) && 'text-foreground',
              )}
            >
              {threadTitle(thread)}
            </span>
            <span className="w-8 shrink-0 text-right text-xs text-muted-foreground/55 tabular-nums">{compactTimeLabel(thread.lastActive)}</span>
          </span>
          {searchMatch ? (
            <ThreadSearchMatchExcerpt match={searchMatch} />
          ) : project ? (
            <span className="truncate text-xs text-muted-foreground/70">{project}</span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function SidebarShelfHeader({ label, count, expanded, onToggle, className }) {
  return (
    // -ms-px cancels the list's +1px card inset: the header's edge meets the footer buttons' and its label the cog.
    <li className={cn('relative -ms-px h-8 list-none', className)}>
      <CollapsibleSectionHeader
        onClick={onToggle}
        expanded={expanded}
        accessory={<span className="font-normal tabular-nums">{count}</span>}
      >
        {label}
      </CollapsibleSectionHeader>
    </li>
  );
}

function SidebarThreadRow({ thread, variant, isActive, isSelected, syncSupported, onSelect, onContextMenu, onPin, onSettle }) {
  const status = threadStatus(thread);
  const topStatus = status ? STATUS_PRESENTATION[status] : null;
  const isUnread = status === 'unread';
  // Hermes' is_active (open, touched within 5 min) keeps a card at full
  // strength; stale history recedes the way T3 dims background rows.
  const shouldRecede = !isActive && !status && !thread.isActive && Boolean(thread.storedId);
  const project = projectLabel(thread);
  const model = modelLabel(thread.model);
  const stop = (fn) => (event) => {
    event.stopPropagation();
    fn();
  };

  const rowSurfaceClassName = cn(
    'group/sidebar-row relative w-full cursor-pointer overflow-hidden rounded-md text-left outline-none select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
    variant === 'slim' && !isActive && '[&:not(:hover):not(:focus-within)_*]:text-secondary-label',
    isActive
      ? 'bg-sidebar-row-active text-sidebar-foreground light:ring-1 light:ring-inset light:ring-sidebar-border/70'
      : isSelected
        ? 'bg-sidebar-row-selected text-sidebar-foreground light:ring-1 light:ring-inset light:ring-sidebar-border/70'
        : shouldRecede
        ? 'text-sidebar-muted-foreground/75 hover:bg-sidebar-row-hover hover:text-sidebar-foreground'
        : 'bg-transparent text-sidebar-foreground hover:bg-sidebar-row-hover',
  );
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(event);
    }
  };

  const title = (
    <span
      className={cn(
        'min-w-0 flex-1 truncate text-sm',
        shouldRecede ? 'font-normal' : 'font-medium',
        variant === 'card'
          ? shouldRecede
            ? 'text-secondary-label'
            : isUnread || status === 'waiting'
              ? 'text-foreground'
              : status === 'failed'
                ? 'text-foreground/95'
                : 'text-foreground/90'
          : cn(
              'group-focus-within/sidebar-row:text-foreground group-hover/sidebar-row:text-foreground',
              isActive ? 'text-foreground' : isUnread ? 'text-muted-foreground' : 'text-secondary-label/70',
            ),
      )}
    >
      {threadTitle(thread)}
    </span>
  );

  const pinIndicator = thread.pinned ? (
    syncSupported ? (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="Unpin thread"
              onClick={stop(() => onPin(false))}
              className="inline-flex cursor-pointer items-center rounded-sm text-muted-foreground/65 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          }
        >
          <PinIcon aria-hidden className="size-3 shrink-0" />
        </TooltipTrigger>
        <TooltipPopup>Unpin thread</TooltipPopup>
      </Tooltip>
    ) : (
      <PinIcon aria-label="Pinned" role="img" className="size-3 shrink-0 text-muted-foreground/65" />
    )
  ) : null;

  if (variant === 'slim') {
    return (
      <li className="list-none [content-visibility:auto] [contain-intrinsic-size:auto_36px]">
        <div
          role="button"
          tabIndex={0}
          className={cn(rowSurfaceClassName, 'flex h-9 items-center gap-2.5 px-2.5')}
          onClick={onSelect}
          onKeyDown={handleKeyDown}
          onContextMenu={onContextMenu}
        >
          {title}
          {pinIndicator}
          <span className="relative ml-auto flex h-6 min-w-8 shrink-0 items-center justify-end">
            <span className={cn('inline-flex justify-end tabular-nums text-secondary-label transition-opacity', syncSupported && 'group-hover/sidebar-row:opacity-0')}>
              <span className="text-xs">{compactTimeLabel(thread.lastActive)}</span>
            </span>
            {syncSupported && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Un-settle thread"
                      onClick={stop(() => onSettle(false))}
                      className="pointer-events-none absolute inset-y-0 right-0 -mr-1 inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-1.5 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/sidebar-row:pointer-events-auto group-hover/sidebar-row:opacity-100"
                    />
                  }
                >
                  <Undo2Icon className="mb-px size-3.5" />
                </TooltipTrigger>
                <TooltipPopup side="top">Un-settle thread</TooltipPopup>
              </Tooltip>
            )}
          </span>
        </div>
      </li>
    );
  }

  return (
    <li className="list-none py-0.5 [content-visibility:auto] [contain-intrinsic-size:auto_78px]">
      <div
        role="button"
        tabIndex={0}
        className={rowSurfaceClassName}
        onClick={onSelect}
        onKeyDown={handleKeyDown}
        onContextMenu={onContextMenu}
      >
        <div className="relative z-10 h-[4.875rem] px-[var(--sidebar-row-content-inset)] py-[var(--sidebar-content-inset)]">
          <div className="flex h-5 min-w-0 items-center gap-1.5">
            {project ? (
              <span className={cn('min-w-0 flex-1 truncate text-secondary-label text-xs', shouldRecede ? 'font-normal' : 'font-medium')}>{project}</span>
            ) : (
              <span className="flex-1" />
            )}
            {pinIndicator}
            <span className="group/sidebar-status-slot relative ml-auto flex h-5 min-w-8 shrink-0 items-stretch justify-end text-xs">
              <span
                className={cn(
                  'flex items-center self-center justify-self-end tabular-nums text-secondary-label transition-opacity',
                  syncSupported &&
                    'pointer-events-none group-has-[:focus-visible]/sidebar-status-slot:absolute group-has-[:focus-visible]/sidebar-status-slot:right-0 group-has-[:focus-visible]/sidebar-status-slot:opacity-0 group-hover/sidebar-row:absolute group-hover/sidebar-row:right-0 group-hover/sidebar-row:opacity-0',
                )}
              >
                {topStatus ? (
                  <span className={cn('inline-flex items-center gap-1 font-medium', topStatus.className)}>
                    <topStatus.Icon aria-hidden className="size-4 shrink-0" />
                    <span role="status">{topStatus.label}</span>
                    {status === 'working' && (
                      <span aria-hidden>
                        <WorkingDuration startedAt={thread.runningSince} />
                      </span>
                    )}
                  </span>
                ) : (
                  compactTimeLabel(thread.lastActive)
                )}
              </span>
              {syncSupported && (
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-stretch opacity-0 transition-opacity has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:static has-[:focus-visible]:opacity-100 group-hover/sidebar-row:pointer-events-auto group-hover/sidebar-row:static group-hover/sidebar-row:opacity-100">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label="Settle thread"
                          onClick={stop(() => onSettle(true))}
                          className="-mr-1 inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-1.5 text-xs text-muted-foreground hover:text-foreground"
                        />
                      }
                    >
                      <CheckIcon className="size-3.5" />
                      Settle
                    </TooltipTrigger>
                    <TooltipPopup>Settle thread</TooltipPopup>
                  </Tooltip>
                </span>
              )}
            </span>
          </div>
          <div className="mt-1 flex min-w-0">{title}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-secondary-label text-xs">
            {thread.branch ? (
              <>
                <GitBranchIcon aria-hidden className="size-3 shrink-0 text-muted-foreground/40" />
                <span className="min-w-0 flex-1 truncate whitespace-nowrap text-muted-foreground/40">{thread.branch}</span>
              </>
            ) : model ? (
              <span className="min-w-0 flex-1 truncate whitespace-nowrap text-muted-foreground/40">{model}</span>
            ) : (
              <span className="flex-1" />
            )}
            <span aria-hidden className="pointer-events-none ml-auto inline-flex shrink-0 items-center gap-2 text-sidebar-muted-foreground/70">
              {thread.toolCallCount > 0 && (
                <span className="inline-flex items-center gap-0.5 tabular-nums">
                  <WrenchIcon className="size-3 opacity-60" />
                  {thread.toolCallCount}
                </span>
              )}
              {thread.messageCount > 0 && (
                <span className="inline-flex items-center gap-0.5 tabular-nums">
                  <MessageSquareIcon className="size-3 opacity-60" />
                  {thread.messageCount}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

function PageHeader({ children }) {
  return (
    <header className="drag-region flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center gap-3 px-5">
      {children}
    </header>
  );
}

function ChatView({ thread, connection, connectionState, connectionError, onSignIn, onSend, onStop, picker }) {
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const scrollRef = useRef(null);
  const isEmpty = thread.messages.length === 0 && !thread.loading;
  const running = thread.running;
  const connected = connectionState === 'ready';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread.messages]);

  function submit(event) {
    event?.preventDefault();
    const prompt = draft.trim();
    if ((!prompt && !attachments.length) || running || !connected) return;
    setDraft('');
    setAttachments([]);
    onSend(prompt, attachments);
  }

  const selection = useComposerSelection(thread, picker.modelOptions, picker.defaults);
  async function selectModel(provider, model) {
    const result = await picker.selectModel(provider, model);
    if (result?.confirm_required && window.confirm(result.confirm_message || `Switch to ${model}?`)) {
      await picker.selectModel(provider, model, { confirmed: true });
    }
  }

  const composer = (
    <Composer
      draft={draft}
      setDraft={setDraft}
      attachments={attachments}
      onAddFiles={(files) => setAttachments((current) => [...current, ...files.map(toAttachment)])}
      onRemoveAttachment={(id) =>
        setAttachments((current) => {
          const removed = current.find((a) => a.id === id);
          if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
          return current.filter((a) => a.id !== id);
        })
      }
      running={running}
      disabled={!connected}
      onSubmit={submit}
      onStop={onStop}
      modelPicker={
        <ProviderModelPicker
          selection={selection}
          loading={picker.modelOptions.loading}
          disabled={!connected}
          onOpen={picker.refreshModels}
          onSelectModel={selectModel}
          onEffort={picker.setEffort}
          onFast={picker.setFast}
        />
      }
      context={thread.branch ? <ComposerContext branch={thread.branch} /> : null}
    />
  );
  const banner =
    connectionState === 'signed-out' ? (
      <ConnectionBanner text={`Sign in to ${connection?.label ?? 'this runtime'} to start chatting.`} action={<Button size="xs" onClick={onSignIn}>Sign in</Button>} />
    ) : connectionState === 'error' && connectionError ? (
      <ConnectionBanner text={connectionError} />
    ) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader>
        <h2 className="min-w-0 truncate text-sm font-medium text-foreground">{threadTitle(thread)}</h2>
        <span className="inline-flex h-5 items-center gap-1.5 rounded-full border border-border px-2 text-[11px] text-muted-foreground">
          <span className={cn('size-1.5 rounded-full', stateTone(connectionState))} />
          {connection?.label ?? 'Hermes'}
          {connectionState !== 'ready' && <span className="text-muted-foreground/70">· {STATE_LABELS[connectionState]}</span>}
        </span>
      </PageHeader>
      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-5 pb-[12vh]">
          <h1 className="mx-auto w-full max-w-5xl text-center font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
            What should we build?
          </h1>
          <div className="flex w-full flex-col gap-3">
            {banner}
            {composer}
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="topbar-scroll-fade min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-(--chat-content-max-width) flex-col gap-6 px-5 pt-6 pb-8">
              {thread.loading && <Spinner className="mx-auto size-4 text-muted-foreground" />}
              {thread.messages.map((message, index) => (
                <MessageRow key={index} message={message} />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 px-5 pb-5">
            {banner}
            {composer}
          </div>
        </>
      )}
    </div>
  );
}

function ConnectionBanner({ text, action }) {
  return (
    <div className="mx-auto flex w-full max-w-(--chat-content-max-width) items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-2.5 text-[13px] text-muted-foreground">
      <span className="min-w-0">{text}</span>
      {action}
    </div>
  );
}

function Spinner({ className }) {
  return <LoaderCircleIcon aria-label="Loading" role="status" className={cn('animate-spin', className)} />;
}

function MessageRow({ message }) {
  if (message.role === 'user') {
    return (
      <div className="group flex flex-col items-end gap-1">
        <MessageAttachments attachments={message.attachments} />
        {message.text && (
          <div className="relative max-w-[80%] whitespace-pre-wrap rounded-2xl bg-message p-3 text-sm leading-relaxed text-message-foreground">
            {message.text}
          </div>
        )}
      </div>
    );
  }
  if (message.role === 'tool') {
    return (
      <div className="flex min-w-0 items-center gap-2 px-1 text-xs text-muted-foreground">
        {message.running ? <Spinner className="size-3" /> : <WrenchIcon className="size-3 shrink-0" />}
        <span className="shrink-0 font-medium text-foreground/80">{message.name}</span>
        {message.context && <span className="min-w-0 truncate font-mono">{message.context}</span>}
      </div>
    );
  }
  if (message.role === 'error') {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-[13px] text-destructive-foreground">{message.text}</div>;
  }
  if (message.role === 'notice') {
    return <div className="px-1 text-xs text-muted-foreground">{message.text}</div>;
  }
  return (
    <div className="relative min-w-0 px-1 py-0.5">
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {message.text}
        {message.streaming && <span className="t3rmes-cursor text-muted-foreground" />}
      </div>
    </div>
  );
}

// Read-only: Hermes reports the session's branch but has no checkout or branch switching.
function ComposerContext({ branch }) {
  if (!branch) return null;
  return (
    <div className="mx-auto flex w-full max-w-(--chat-content-max-width) items-center gap-3 px-2 text-xs text-muted-foreground">
      {branch && (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <GitBranchIcon className="size-3.5 shrink-0" />
          <span className="truncate">{branch}</span>
        </span>
      )}
    </div>
  );
}

function Composer({ draft, setDraft, attachments, onAddFiles, onRemoveAttachment, running, disabled, onSubmit, onStop, modelPicker, context }) {
  const [dragging, setDragging] = useState(false);
  const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
  return (
    <div className="flex flex-col gap-2">
    <form
      onSubmit={onSubmit}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length) onAddFiles(files);
      }}
      className={cn(
        'relative isolate mx-auto w-full max-w-(--chat-content-max-width)',
        '[--chat-composer-glass-surface:var(--card)] [--chat-composer-outline:rgb(0_0_0/8%)]',
        'dark:[--chat-composer-glass-surface:var(--surface-raised)] dark:[--chat-composer-highlight:rgb(255_255_255/3%)] dark:[--chat-composer-outline:color-mix(in_srgb,var(--color-white)_5%,transparent)]',
        '[html[data-theme-id]_&]:[--chat-composer-glass-surface:var(--app-theme-surface-raised)] [html[data-theme-id]_&]:[--chat-composer-outline:var(--app-theme-toolbar-border)]',
        'dark:[html[data-theme-id]:not([data-theme-id=t3-chat])_&]:[--chat-composer-highlight:color-mix(in_srgb,var(--app-theme-input)_12%,transparent)] dark:[html[data-theme-id]:not([data-theme-id=t3-chat])_&]:[--chat-composer-outline:color-mix(in_srgb,var(--app-theme-input)_30%,var(--background))]',
        'dark:[html[data-theme-id=t3-chat]_&]:[--chat-composer-highlight:color-mix(in_srgb,#432d48_12%,transparent)] dark:[html[data-theme-id=t3-chat]_&]:[--chat-composer-outline:#241e28]',
        'before:pointer-events-none before:absolute before:inset-0 before:z-0 before:rounded-2xl before:bg-(--chat-composer-glass-surface)/(--glass-opacity) before:backdrop-blur-(--glass-blur) before:backdrop-saturate-(--glass-saturation)',
      )}
    >
      <div className="relative z-10 w-full rounded-2xl shadow-composer after:pointer-events-none after:absolute after:inset-0 after:z-1 after:rounded-[inherit] after:border after:border-(--chat-composer-outline) dark:shadow-none dark:after:inset-shadow-2xs dark:after:inset-shadow-(color:--chat-composer-highlight)">
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/60 bg-primary/[0.035] text-sm font-medium text-foreground">
            Drop files to attach
          </div>
        )}
        {attachments.length > 0 && <ComposerAttachmentStrip attachments={attachments} onRemove={onRemoveAttachment} />}
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData?.files ?? []);
            if (!files.length) return;
            event.preventDefault();
            onAddFiles(files);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) onSubmit(event);
          }}
          placeholder="Ask Hermes anything…"
          rows={2}
          className="block max-h-60 min-h-16 w-full resize-none bg-transparent px-4 pt-4 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-placeholder sm:text-sm"
        />
        <div data-chat-composer-footer="true" className="flex min-w-0 flex-nowrap items-center overflow-visible px-2 pb-2">
          <div className="me-2">
            <ComposerAttachButton onFiles={onAddFiles} disabled={disabled} />
          </div>
          <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-2">
          <div className="relative flex min-w-0 flex-1 items-center justify-end gap-0.5">{modelPicker}</div>
          {running ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop"
              className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
            >
              <SquareIcon className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled || (!draft.trim() && !attachments.length)}
              aria-label="Send message"
              className="relative flex size-8 items-center justify-center rounded-full bg-message-action text-message-action-foreground shadow-xs transition-all duration-150 enabled:cursor-pointer enabled:inset-shadow-[0_1px_--theme(--color-white/16%)] hover:scale-105 hover:bg-message-action-hover disabled:pointer-events-none disabled:opacity-30"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          </div>
        </div>
      </div>
    </form>
    {context}
    </div>
  );
}

const SETTINGS_SEARCH_ITEMS = [
  { id: 'send-on-enter', title: 'Send on Enter', section: 'general' },
  { id: 'confirm-delete', title: 'Confirm before deleting threads', section: 'general' },
  { id: 'working-directory', title: 'Working directory', section: 'general' },
  { id: 'color-scheme', title: 'Color scheme', section: 'appearance' },
  { id: 'theme', title: 'Themes', section: 'appearance' },
  { id: 'contrast', title: 'Contrast', section: 'appearance' },
  { id: 'glass-opacity', title: 'Glass opacity', section: 'appearance' },
  { id: 'chat-width', title: 'Chat width', section: 'appearance' },
  { id: 'interface-font-size', title: 'Interface font size', section: 'appearance' },
  { id: 'runtimes', title: 'Runtimes', section: 'connections' },
  { id: 'add-remote-runtime', title: 'Add remote runtime', section: 'connections' },
];

// T3 SettingsSidebarNav.tsx: search, then the section list.
function SettingsNav({ section, onSelect }) {
  const searchInputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const folded = query.trim().toLowerCase();
  const isSearching = folded.length > 0;
  const sectionById = Object.fromEntries(SETTINGS_SECTIONS.map((item) => [item.id, item]));
  const results = isSearching
    ? SETTINGS_SEARCH_ITEMS.filter((item) => item.title.toLowerCase().includes(folded) || sectionById[item.section].label.toLowerCase().includes(folded))
    : [];
  const choose = (item) => {
    onSelect(item.section);
    setQuery('');
  };
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== '/' || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <nav role="navigation" aria-label="Settings sections" className="flex w-60 shrink-0 flex-col border-e bg-sidebar text-sidebar-foreground max-md:w-14">
      <SidebarContent className="overflow-x-hidden">
        <SidebarGroup>
          <div className="flex flex-col gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground max-md:hidden">
              <SearchIcon className="size-4 shrink-0 text-sidebar-muted-foreground/80" />
              <SidebarInput
                ref={searchInputRef}
                nativeInput
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setActiveResultIndex(0);
                }}
                onKeyDown={(event) => {
                  if (!isSearching) return;
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    const step = event.key === 'ArrowDown' ? 1 : -1;
                    setActiveResultIndex((index) => (index + step + results.length) % Math.max(results.length, 1));
                  } else if (event.key === 'Enter' && results[activeResultIndex]) {
                    event.preventDefault();
                    choose(results[activeResultIndex]);
                  } else if (event.key === 'Escape') {
                    // Clear the search instead of closing Settings.
                    event.preventDefault();
                    event.stopPropagation();
                    setQuery('');
                  }
                }}
                placeholder="Search"
                aria-label="Search settings"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isSearching && results.length > 0}
                aria-controls={isSearching && results.length > 0 ? 'settings-search-results' : undefined}
                aria-activedescendant={isSearching && results[activeResultIndex] ? `settings-search-result-${results[activeResultIndex].id}` : undefined}
                className="min-w-0 flex-1"
              />
              {isSearching ? (
                <Button
                  type="button"
                  size="icon-micro"
                  variant="ghost-muted"
                  className="shrink-0"
                  aria-label="Clear settings search"
                  onClick={() => {
                    setQuery('');
                    searchInputRef.current?.focus();
                  }}
                >
                  <XIcon className="size-3" />
                </Button>
              ) : (
                <Kbd>/</Kbd>
              )}
            </div>
            {isSearching && results.length === 0 ? (
              <p role="status" className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground">
                No settings found
              </p>
            ) : null}
            {isSearching ? (
              <SidebarMenu id="settings-search-results" role="listbox" aria-label="Settings search results">
                {results.map((item, index) => {
                  const Icon = sectionById[item.section].icon;
                  return (
                    <SidebarMenuItem key={item.id} role="presentation">
                      <SidebarMenuButton
                        id={`settings-search-result-${item.id}`}
                        role="option"
                        aria-selected={index === activeResultIndex}
                        tabIndex={-1}
                        size="sm"
                        isActive={index === activeResultIndex}
                        className="h-auto min-h-10 items-start"
                        onMouseMove={() => setActiveResultIndex(index)}
                        onClick={() => choose(item)}
                      >
                        <Icon className="size-4 shrink-0 text-(--sidebar-icon-color)" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-sidebar-foreground">{item.title}</span>
                          <span className="block truncate text-2xs text-sidebar-muted-foreground/75">{sectionById[item.section].label}</span>
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            ) : (
              <SidebarMenu>
                {SETTINGS_SECTIONS.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton aria-current={section === item.id ? 'page' : undefined} isActive={section === item.id} onClick={() => onSelect(item.id)}>
                      <item.icon />
                      <span className="truncate max-md:sr-only">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </div>
        </SidebarGroup>
      </SidebarContent>
    </nav>
  );
}

// T3 AppRouteModal.tsx: the large Settings modal. Esc, the close button or a backdrop press closes it.
function SettingsModal({ open, section, onSectionChange, onClose, hermes }) {
  const backdropPressRef = useRef(false);
  const popupRef = useRef(null);
  const label = SETTINGS_SECTIONS.find((item) => item.id === section)?.label;
  return (
    <DialogPrimitive.Root
      open={open}
      disablePointerDismissal
      onOpenChange={(nextOpen) => {
        if (nextOpen) return;
        // Commit-on-blur fields lose typed text if the popup unmounts while focused.
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && popupRef.current?.contains(focused)) focused.blur();
        onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogBackdrop />
        <DialogPrimitive.Viewport
          // Electron hit-tests drag regions under the backdrop regardless of z-index.
          className="fixed inset-0 z-50 flex items-center justify-center [-webkit-app-region:no-drag] sm:p-6 lg:p-10"
          onPointerDown={(event) => {
            backdropPressRef.current = event.target === event.currentTarget;
          }}
          onClick={(event) => {
            if (backdropPressRef.current && event.target === event.currentTarget) onClose();
            backdropPressRef.current = false;
          }}
        >
          <DialogPrimitive.Popup
            ref={popupRef}
            initialFocus={popupRef}
            finalFocus={false}
            aria-label="Settings"
            data-slot="dialog-popup"
            data-app-modal=""
            className="relative flex size-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground outline-none transition-[opacity,scale] duration-150 ease-out [-webkit-app-region:no-drag] data-ending-style:scale-[0.985] data-ending-style:opacity-0 data-starting-style:scale-[0.985] data-starting-style:opacity-0 sm:max-h-[60rem] sm:max-w-[80rem] sm:rounded-2xl sm:border sm:shadow-2xl/40"
          >
            <div className="relative flex min-h-0 flex-1">
              <SettingsNav section={section} onSelect={onSectionChange} />
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <header className="flex h-12 shrink-0 items-center gap-3 border-b ps-5 pe-2">
                  <nav aria-label="Settings breadcrumb" className="min-w-0">
                    <ol className="m-0 flex min-w-0 list-none items-center gap-2 p-0 text-sm sm:gap-3">
                      <li className="flex min-w-0 shrink-0 items-center font-medium text-muted-foreground">Settings</li>
                      <li aria-hidden="true" className="flex shrink-0 items-center text-icon-muted">
                        /
                      </li>
                      <li aria-current="page" className="flex min-w-0 items-center truncate font-medium text-foreground">
                        {label}
                      </li>
                    </ol>
                  </nav>
                  <div className="ms-auto flex shrink-0 items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger render={<DialogPrimitive.Close aria-label="Close" render={<Button size="icon-sm" variant="ghost" />} />}>
                        <XIcon />
                      </TooltipTrigger>
                      <TooltipPopup side="bottom">Close (Esc)</TooltipPopup>
                    </Tooltip>
                  </div>
                </header>
                <div className="flex min-h-0 flex-1 flex-col">
                  {section === 'general' && (
                    <SettingsPageContainer>
                      <SettingsSection title="Behavior">
                        <SettingsRow title="Send on Enter" description="Press Shift+Enter to insert a new line instead." control={<Switch defaultChecked />} />
                        <SettingsRow title="Confirm before deleting threads" description="Ask before a thread is removed." control={<Switch defaultChecked />} />
                      </SettingsSection>
                      <SettingsSection title="Workspace">
                        <SettingsRow
                          title="Working directory"
                          description="The folder Hermes uses for files and commands."
                          control={<code className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">~/Work</code>}
                        />
                      </SettingsSection>
                    </SettingsPageContainer>
                  )}
                  {section === 'appearance' && <AppearanceSettings />}
                  {section === 'connections' && (
                    <SettingsPageContainer>
                      <ConnectionsSettings hermes={hermes} />
                    </SettingsPageContainer>
                  )}
                </div>
              </div>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Viewport>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ConnectionsSettings({ hermes }) {
  const { connections } = hermes;
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function add(event) {
    event.preventDefault();
    if (!url.trim() || adding) return;
    setAdding(true);
    setError(null);
    try {
      await hermes.addConnection({ url });
      setUrl('');
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setAdding(false);
    }
  }

  async function run(id, action) {
    setBusyId(id);
    setError(null);
    try {
      await action(id);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <SettingsSection title="Runtimes">
        {connections.connections.map((connection) => {
          const isActive = connection.id === connections.active;
          const state = isActive ? connections.state : null;
          return (
            <SettingsRow
              key={connection.id}
              title={
                <span className="inline-flex items-center gap-2">
                  {connection.label}
                  {isActive && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                      <span className={cn('size-1.5 rounded-full', stateTone(state))} />
                      {STATE_LABELS[state]}
                    </span>
                  )}
                </span>
              }
              description={
                connection.kind === 'local'
                  ? 'Starts hermes serve on this computer.'
                  : (isActive && connections.error && state !== 'ready' ? connections.error : connection.url)
              }
              control={
                <>
                  {connection.kind === 'remote' && isActive && state === 'signed-out' && (
                    <Button size="sm" disabled={busyId === connection.id} onClick={() => run(connection.id, hermes.signIn)}>
                      Sign in
                    </Button>
                  )}
                  {connection.kind === 'remote' && isActive && state === 'ready' && (
                    <Button size="sm" variant="ghost" onClick={() => run(connection.id, hermes.signOut)}>
                      Sign out
                    </Button>
                  )}
                  {!isActive && (
                    <Button size="sm" variant="outline" onClick={() => run(connection.id, hermes.selectConnection)}>
                      Use
                    </Button>
                  )}
                  {connection.kind === 'remote' && (
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${connection.label}`} onClick={() => run(connection.id, hermes.removeConnection)}>
                      <Trash2Icon />
                    </Button>
                  )}
                </>
              }
            />
          );
        })}
      </SettingsSection>
      <SettingsSection title="Add remote runtime">
        <form onSubmit={add} className="flex flex-col gap-2 px-3 py-3 sm:px-4">
          <p className="text-[13px] leading-[1.45] text-muted-foreground/80">
            Paste the URL of a Hermes gateway. You’ll be asked to sign in if it requires it.
          </p>
          <div className="flex gap-2">
            <Input nativeInput value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://hermes.example.com" className="flex-1" />
            <Button type="submit" size="sm" disabled={adding || !url.trim()}>
              {adding ? <Spinner className="size-3.5" /> : <PlusIcon />}
              Add
            </Button>
          </div>
          {error && <p className="text-[13px] text-destructive-foreground">{error}</p>}
        </form>
      </SettingsSection>
    </>
  );
}

function cleanError(error) {
  return String(error?.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

createRoot(document.getElementById('root')).render(<App />);
