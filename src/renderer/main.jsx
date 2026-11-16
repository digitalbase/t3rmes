import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeftIcon,
  BotIcon,
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
import { cn } from '../t3/lib/utils.ts';
import './styles.css';

const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', icon: Settings2Icon },
  { id: 'appearance', label: 'Appearance', icon: PaletteIcon },
  { id: 'hermes', label: 'Hermes', icon: BotIcon },
];

function fakeReply(prompt, onToken, onDone) {
  const answer = `I received “${prompt}”. The local Hermes transport is connected and ready for the next integration step.`;
  let index = 0;
  const timer = setInterval(() => {
    onToken(answer.slice(index, index + 3));
    index += 3;
    if (index >= answer.length) {
      clearInterval(timer);
      onDone();
    }
  }, 24);
  return () => clearInterval(timer);
}

function App() {
  const [threads, setThreads] = useState([{ id: 1, title: 'New thread', messages: [] }]);
  const [activeId, setActiveId] = useState(1);
  const [screen, setScreen] = useState(() => (window.location.hash === '#settings' ? 'settings' : 'chat'));
  const [section, setSection] = useState('general');
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(null);

  useEffect(() => () => cancelRef.current?.(), []);

  const active = threads.find((thread) => thread.id === activeId) ?? threads[0];

  function updateActive(update) {
    setThreads((current) => current.map((thread) => (thread.id === activeId ? update(thread) : thread)));
  }

  function newThread() {
    const id = Date.now();
    setThreads((current) => [{ id, title: 'New thread', messages: [] }, ...current]);
    setActiveId(id);
    setScreen('chat');
  }

  function send(prompt) {
    if (running) return;
    updateActive((thread) => ({
      ...thread,
      title: thread.messages.length === 0 ? prompt.slice(0, 48) : thread.title,
      messages: [...thread.messages, { role: 'user', text: prompt }, { role: 'assistant', text: '', streaming: true }],
    }));
    setRunning(true);
    const finish = () => {
      setRunning(false);
      cancelRef.current = null;
      updateActive((thread) => ({ ...thread, messages: thread.messages.map((m) => ({ ...m, streaming: false })) }));
    };
    cancelRef.current = fakeReply(
      prompt,
      (token) =>
        updateActive((thread) => ({
          ...thread,
          messages: thread.messages.map((m, i) => (i === thread.messages.length - 1 ? { ...m, text: m.text + token } : m)),
        })),
      finish,
    );
  }

  function stop() {
    cancelRef.current?.();
    cancelRef.current = null;
    setRunning(false);
    updateActive((thread) => ({ ...thread, messages: thread.messages.map((m) => ({ ...m, streaming: false })) }));
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
          <ThreadNav threads={threads} activeId={activeId} onSelect={setActiveId} onNew={newThread} />
        )}
        <SidebarFooter className="px-[var(--sidebar-content-inset)] py-1">
          <SidebarMenu>
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
          <SettingsPage section={section} />
        ) : (
          <ChatView thread={active} running={running} onSend={send} onStop={stop} />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

function ThreadNav({ threads, activeId, onSelect, onNew }) {
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
            <SidebarMenuItem key={thread.id}>
              <SidebarMenuButton isActive={thread.id === activeId} onClick={() => onSelect(thread.id)}>
                <span className="truncate">{thread.title}</span>
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

function ChatView({ thread, running, onSend, onStop }) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef(null);
  const isEmpty = thread.messages.length === 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread.messages]);

  function submit(event) {
    event?.preventDefault();
    const prompt = draft.trim();
    if (!prompt || running) return;
    setDraft('');
    onSend(prompt);
  }

  const composer = <Composer draft={draft} setDraft={setDraft} running={running} onSubmit={submit} onStop={onStop} />;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader>
        <h2 className="min-w-0 truncate text-sm font-medium text-foreground">{thread.title}</h2>
        <span className="inline-flex h-5 items-center gap-1.5 rounded-full border border-border px-2 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" />
          Local Hermes
        </span>
      </PageHeader>
      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-5 pb-[12vh]">
          <h1 className="mx-auto w-full max-w-5xl text-center font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
            What should we build?
          </h1>
          <div className="w-full">{composer}</div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="topbar-scroll-fade min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pt-6 pb-8">
              {thread.messages.map((message, index) =>
                message.role === 'user' ? (
                  <div key={index} className="group flex flex-col items-end gap-1">
                    <div className="relative max-w-[80%] whitespace-pre-wrap rounded-2xl bg-message p-3 text-sm leading-relaxed text-message-foreground">
                      {message.text}
                    </div>
                  </div>
                ) : (
                  <div key={index} className="relative min-w-0 px-1 py-0.5">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {message.text}
                      {message.streaming && <span className="t3rmes-cursor text-muted-foreground" />}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="px-5 pb-5">{composer}</div>
        </>
      )}
    </div>
  );
}

function Composer({ draft, setDraft, running, onSubmit, onStop }) {
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
              disabled={!draft.trim()}
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

function SettingsPage({ section }) {
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
          {section === 'hermes' && (
            <SettingsSection title="Connection">
              <SettingsRow
                title="Runtime"
                description="Use the local Hermes runtime on this computer."
                control={
                  <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground')}>
                    <span className="size-1.5 rounded-full bg-success" /> Connected
                  </span>
                }
              />
              <SettingsRow
                title="Model"
                description="Default model for new threads."
                control={<SettingsSelect label="Model" value="default" options={[{ value: 'default', label: 'Hermes default' }]} />}
              />
            </SettingsSection>
          )}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
