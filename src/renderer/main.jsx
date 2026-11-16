import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeftIcon,
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
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
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
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
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '../t3/components/ui/select.tsx';
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
import { cn } from '../t3/lib/utils.ts';
import { threadStatus, threadTitle, useHermes } from './hermes.js';
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
  const [screen, setScreen] = useState(() => (window.location.hash === '#settings' ? 'settings' : 'chat'));
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
    setScreen('settings');
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
        {screen === 'settings' ? (
          <SettingsNav section={section} onSelect={setSection} />
        ) : (
          <ThreadNav
            hermes={hermes}
            activeKey={activeThread.key}
            onSelect={hermes.selectThread}
            onNew={() => {
              hermes.createThread();
              setScreen('chat');
            }}
          />
        )}
        <SidebarFooter className="px-[var(--sidebar-content-inset)] py-1">
          <SidebarMenu>
            {screen === 'chat' && (
              <SidebarMenuItem>
                <ConnectionSwitcher hermes={hermes} onManage={openConnections} />
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              {screen === 'settings' ? (
                <SidebarMenuButton onClick={() => setScreen('chat')}>
                  <ArrowLeftIcon />
                  <span>Back</span>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton onClick={() => setScreen('settings')}>
                  <SettingsIcon />
                  <span>Settings</span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail onDoubleClick={resetSidebarWidth} />
      </Sidebar>
      <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground isolate">
        {screen === 'settings' ? (
          <SettingsPage section={section} hermes={hermes} />
        ) : (
          <ChatView
            thread={activeThread}
            connection={activeConnection}
            connectionState={connections.state}
            connectionError={connections.error}
            onSignIn={() => hermes.signIn(connections.active).catch(() => {})}
            onSend={hermes.send}
            onStop={hermes.stop}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

function ConnectionSwitcher({ hermes, onManage }) {
  const { connections } = hermes;
  const active = connections.connections.find((c) => c.id === connections.active);
  return (
    <Menu>
      <MenuTrigger render={<SidebarMenuButton />}>
        {active?.kind === 'local' ? <MonitorIcon /> : <GlobeIcon />}
        <span className="min-w-0 flex-1 truncate">{active?.label ?? 'Hermes'}</span>
        <span className={cn('size-1.5 shrink-0 rounded-full', stateTone(connections.state))} />
        <ChevronsUpDownIcon className="text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup side="top" align="start" className="w-(--anchor-width) min-w-56">
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

function ThreadNav({ hermes, activeKey, onSelect, onNew }) {
  const { threads, syncSupported } = hermes;
  const [settledExpanded, setSettledExpanded] = useState(() => localStorage.getItem(SETTLED_SHELF_STORAGE_KEY) === '1');
  const [, setClock] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setClock((tick) => tick + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Unsent new threads only show while they are open, like T3 drafts.
  const visible = threads.filter((t) => t.storedId || t.messages.length > 0 || t.key === activeKey);
  const byRecent = (a, b) => (a.storedId ? 0 : 1) - (b.storedId ? 0 : 1) || b.lastActive - a.lastActive;
  const pinned = visible.filter((t) => t.pinned && !t.archived).sort(byRecent);
  const active = visible.filter((t) => !t.pinned && !t.archived).sort(byRecent);
  const settled = visible.filter((t) => t.archived).sort((a, b) => b.lastActive - a.lastActive);

  function toggleSettled() {
    setSettledExpanded((expanded) => {
      localStorage.setItem(SETTLED_SHELF_STORAGE_KEY, expanded ? '0' : '1');
      return !expanded;
    });
  }

  async function openContextMenu(event, thread) {
    if (!syncSupported || !thread.storedId || !window.t3rmes?.showContextMenu) return;
    event.preventDefault();
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
      syncSupported={syncSupported && Boolean(thread.storedId)}
      onSelect={() => onSelect(thread.key)}
      onContextMenu={(event) => openContextMenu(event, thread)}
      onPin={(value) => hermes.pinThread(thread.key, value)}
      onSettle={(value) => hermes.settleThread(thread.key, value)}
    />
  );

  return (
    <SidebarContent className="overflow-x-hidden">
      <SidebarGroup className="gap-1 px-[var(--sidebar-content-inset)] pt-0 pb-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onNew}>
              <SquarePenIcon />
              <span>New thread</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
      <SidebarGroup className="flex-1 ps-[calc(var(--sidebar-content-inset)+1px)] pe-[var(--sidebar-content-inset)] pt-0 pb-1">
        <TooltipProvider delay={150} closeDelay={0} timeout={400}>
        <ul role="list" className="relative flex flex-1 flex-col gap-px">
          {pinned.map((thread) => row(thread, 'card'))}
          {active.map((thread) => row(thread, 'card'))}
          {settled.length > 0 && (
            <li className="mx-0.5 mt-auto h-8 list-none">
              <button
                type="button"
                onClick={toggleSettled}
                aria-expanded={settledExpanded}
                className="flex h-full w-full cursor-pointer items-center gap-2 px-2 text-left text-xs font-medium text-sidebar-muted-foreground/60"
              >
                <span className="shrink-0">{settledExpanded ? 'Settled' : `Settled (${settled.length})`}</span>
                <span aria-hidden className="h-px min-w-2 flex-1 bg-sidebar-border/60" />
                <ChevronDownIcon aria-hidden className={cn('size-3 shrink-0 transition-transform', settledExpanded && 'rotate-180')} />
              </button>
            </li>
          )}
          {settledExpanded && settled.map((thread) => row(thread, 'slim'))}
        </ul>
        </TooltipProvider>
      </SidebarGroup>
    </SidebarContent>
  );
}

function SidebarThreadRow({ thread, variant, isActive, syncSupported, onSelect, onContextMenu, onPin, onSettle }) {
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
    'group/sidebar-row relative w-full cursor-pointer overflow-hidden rounded-md text-left outline-none select-none',
    variant === 'slim' && '[&:not(:hover):not(:focus-within)_*]:text-secondary-label/70',
    isActive
      ? 'bg-sidebar-row-active text-sidebar-foreground'
      : shouldRecede
        ? 'text-sidebar-muted-foreground/75 hover:bg-sidebar-row-hover hover:text-sidebar-foreground'
        : 'bg-transparent text-sidebar-foreground hover:bg-sidebar-row-hover',
  );
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
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

function ChatView({ thread, connection, connectionState, connectionError, onSignIn, onSend, onStop }) {
  const [draft, setDraft] = useState('');
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
    if (!prompt || running || !connected) return;
    setDraft('');
    onSend(prompt);
  }

  const composer = (
    <Composer draft={draft} setDraft={setDraft} running={running} disabled={!connected} onSubmit={submit} onStop={onStop} />
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
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pt-6 pb-8">
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
    <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-2.5 text-[13px] text-muted-foreground">
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
        <div className="relative max-w-[80%] whitespace-pre-wrap rounded-2xl bg-message p-3 text-sm leading-relaxed text-message-foreground">
          {message.text}
        </div>
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

function Composer({ draft, setDraft, running, disabled, onSubmit, onStop }) {
  return (
    <form
      onSubmit={onSubmit}
      className="relative isolate mx-auto w-full max-w-3xl [--composer-outline:color-mix(in_srgb,var(--color-white)_5%,transparent)]"
    >
      <div className="relative z-10 w-full rounded-[22px] bg-surface-raised after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-(--composer-outline) after:shadow-[inset_0_1px_rgb(255_255_255/3%)]">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) onSubmit(event);
          }}
          placeholder="Ask Hermes anything…"
          rows={2}
          className="block max-h-60 min-h-16 w-full resize-none bg-transparent px-4 pt-4 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-placeholder sm:text-sm"
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-3 sm:px-4">
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
            <BotIcon />
            Default model
          </Button>
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
              disabled={disabled || !draft.trim()}
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
    </form>
  );
}

function SettingsNav({ section, onSelect }) {
  return (
    <SidebarContent className="overflow-x-hidden">
      <SidebarGroup className="gap-2 p-[var(--sidebar-content-inset)]">
        <div className="flex h-8 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover">
          <SearchIcon className="size-4 shrink-0 text-sidebar-muted-foreground/80" />
          <input
            type="search"
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-sidebar-foreground outline-none placeholder:text-sidebar-muted-foreground"
          />
          <Kbd className="h-4 min-w-0 rounded-sm px-1.5 text-[10px]">/</Kbd>
        </div>
        <SidebarMenu className="ps-px">
          {SETTINGS_SECTIONS.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton isActive={section === item.id} onClick={() => onSelect(item.id)}>
                <item.icon />
                <span className="truncate">{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  );
}

function SettingsSection({ title, children }) {
  return (
    <section className="space-y-2.5">
      <div className="flex min-h-7 items-start justify-between gap-4 px-3 sm:px-4">
        <h2 className="flex min-h-7 items-center gap-2 text-sm font-normal tracking-[-0.005em] text-foreground/70">{title}</h2>
      </div>
      <div className="relative overflow-visible rounded-xl border border-border/60 bg-card/40 text-foreground shadow-xs/5 [&>*+*]:border-t [&>*+*]:border-border/50">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({ title, description, control }) {
  return (
    <div className="@container/settings-row px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-3 @min-[32rem]/settings-row:grid @min-[32rem]/settings-row:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)] @min-[32rem]/settings-row:items-center @min-[32rem]/settings-row:gap-8">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-h-5 items-center gap-1.5">
            <h3 className="text-sm font-medium tracking-[-0.005em] text-foreground">{title}</h3>
          </div>
          {description ? <p className="max-w-xl text-[13px] leading-[1.45] text-muted-foreground/80">{description}</p> : null}
        </div>
        {control ? (
          <div className="flex w-full min-w-0 shrink-0 items-center gap-2 @min-[32rem]/settings-row:w-auto @min-[32rem]/settings-row:justify-end">
            {control}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SettingsSelect({ value, options, label }) {
  const [current, setCurrent] = useState(value);
  return (
    <Select value={current} onValueChange={setCurrent}>
      <SelectTrigger size="sm" className="w-full sm:w-40" aria-label={label}>
        <SelectValue>{options.find((o) => o.value === current)?.label}</SelectValue>
      </SelectTrigger>
      <SelectPopup align="end" alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

function SettingsPage({ section, hermes }) {
  const label = SETTINGS_SECTIONS.find((item) => item.id === section)?.label;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader>
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Settings</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="font-medium text-foreground">{label}</span>
        </nav>
      </PageHeader>
      <div className="topbar-scroll-fade flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 pt-6 pb-12 sm:px-6">
          {section === 'general' && (
            <>
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
            </>
          )}
          {section === 'appearance' && (
            <SettingsSection title="Theme">
              <SettingsRow
                title="Appearance"
                description="Follow the operating system or pick a mode."
                control={<SettingsSelect label="Appearance" value="dark" options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />}
              />
            </SettingsSection>
          )}
          {section === 'connections' && <ConnectionsSettings hermes={hermes} />}
        </div>
      </div>
    </div>
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
