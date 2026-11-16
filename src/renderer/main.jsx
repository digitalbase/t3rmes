import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeftIcon,
  BotIcon,
  ChevronsUpDownIcon,
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
} from '../t3/components/ui/sidebar.tsx';
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
import { useHermes } from './hermes.js';
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

function App() {
  const hermes = useHermes();
  const [screen, setScreen] = useState(() => (window.location.hash === '#settings' ? 'settings' : 'chat'));
  const [section, setSection] = useState('general');
  const { connections, threads, activeThread } = hermes;
  const activeConnection = connections.connections.find((c) => c.id === connections.active);

  function openConnections() {
    setSection('connections');
    setScreen('settings');
  }

  return (
    <SidebarProvider className="h-dvh! min-h-0!" defaultOpen>
      <Sidebar side="left" collapsible="none" className="h-dvh border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
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
            threads={threads}
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

function ThreadNav({ threads, activeKey, onSelect, onNew }) {
  return (
    <SidebarContent className="overflow-x-hidden">
      <SidebarGroup className="gap-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onNew}>
              <SquarePenIcon />
              <span>New thread</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex h-8 items-center px-[var(--sidebar-row-content-inset)] pt-3 text-xs font-medium text-sidebar-muted-foreground/70">
          Threads
        </div>
        <SidebarMenu>
          {threads.map((thread) => (
            <SidebarMenuItem key={thread.key}>
              <SidebarMenuButton isActive={thread.key === activeKey} onClick={() => onSelect(thread.key)}>
                <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                {thread.running && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-info" />}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
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
        <h2 className="min-w-0 truncate text-sm font-medium text-foreground">{thread.title}</h2>
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
