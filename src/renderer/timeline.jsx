import React, { useEffect, useState } from 'react';
import {
  BotIcon,
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  EyeIcon,
  GlobeIcon,
  ListTodoIcon,
  MessageCircleIcon,
  SearchIcon,
  SquarePenIcon,
  TerminalIcon,
  WrenchIcon,
  XIcon,
} from 'lucide-react';
import { Button } from '../t3/components/ui/button.tsx';
import { Tooltip, TooltipPopup, TooltipTrigger } from '../t3/components/ui/tooltip.tsx';
import { observeVisibleAnimation } from '../t3/lib/visibleAnimation.ts';
import { cn } from '../t3/lib/utils.ts';
import { MessageAttachments } from './composer.jsx';

// Ported from T3 Code's timeline (MessagesTimeline, TimelineWorkGroupRows, WorkLog), reduced to what
// Hermes reports: tool start/complete with args, results and diffs, streamed reasoning, turn timing.

// orchestrationTiming.formatDuration
export function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '0ms';
  if (durationMs < 1_000) return `${Math.max(1, Math.round(durationMs))}ms`;
  if (durationMs < 10_000) return `${Math.round(durationMs / 100) / 10}s`;
  const totalSeconds = Math.round(durationMs / 1_000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || minutes > 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function formatWorkingTimer(elapsedMs) {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  return seconds < 60 ? `${seconds}s` : formatDuration(seconds * 1000);
}

const formatClock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const stripAnsi = (text) => String(text ?? '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

// ─── Tool classification (presentation.toolGroupAction) ───

const COMMAND_TOOLS = new Set(['terminal', 'execute_code', 'process_manage', 'shell']);
const EDIT_TOOLS = new Set(['write_file', 'patch']);
const WEB_SEARCH_TOOLS = new Set(['web_search', 'x_search', 'web_extract']);

function toolAction(tool) {
  const name = tool.name || '';
  if (name === 'clarify') return 'question';
  if (COMMAND_TOOLS.has(name)) return 'command';
  if (name === 'read_file' || name === 'vision_analyze') return 'read';
  if (EDIT_TOOLS.has(name)) return 'edit';
  if (name === 'search_files') return 'code-search';
  if (WEB_SEARCH_TOOLS.has(name)) return 'search';
  if (name.startsWith('browser')) return 'browser';
  if (name === 'delegate_task') return 'delegate';
  if (name === 'todo' || name === 'todo_list') return 'todo';
  return 'other';
}

const ACTION_ICONS = {
  command: TerminalIcon,
  read: EyeIcon,
  edit: SquarePenIcon,
  'code-search': SearchIcon,
  search: GlobeIcon,
  browser: GlobeIcon,
  delegate: BotIcon,
  todo: ListTodoIcon,
  question: MessageCircleIcon,
  other: WrenchIcon,
};

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function groupLabel(action, tools) {
  const count = tools.length;
  switch (action) {
    case 'read':
      return `Read ${plural(count, 'file', 'files')}`;
    case 'edit': {
      const paths = new Set(tools.map((t) => t.args?.path).filter(Boolean));
      const unknown = tools.filter((t) => !t.args?.path).length;
      return `Changed ${plural(paths.size + unknown, 'file', 'files')}`;
    }
    case 'command':
      return `Ran ${plural(count, 'command', 'commands')}`;
    case 'search':
      return `Searched the web ${plural(count, 'time', 'times')}`;
    case 'code-search':
      return `Searched code ${plural(count, 'time', 'times')}`;
    case 'browser':
      return `Used browser ${plural(count, 'time', 'times')}`;
    case 'delegate':
      return `Delegated ${plural(count, 'task', 'tasks')}`;
    case 'todo':
      return `Updated todos ${plural(count, 'time', 'times')}`;
    default:
      return `Used ${plural(count, 'tool', 'tools')}`;
  }
}

function relativePath(path, cwd) {
  if (!path) return '';
  if (cwd && path.startsWith(`${cwd.replace(/\/+$/, '')}/`)) return path.slice(cwd.replace(/\/+$/, '').length + 1);
  return path;
}

function toolLabel(tool, cwd) {
  const args = tool.args || {};
  switch (toolAction(tool)) {
    case 'command':
      return (args.command || args.code || tool.context || tool.name).trim();
    case 'read':
      if (tool.name === 'vision_analyze') return args.image_url ? `Viewed ${relativePath(args.image_url, cwd)}` : 'Viewed image';
      return args.path ? `Read ${relativePath(args.path, cwd)}` : 'Read file';
    case 'edit':
      return args.path ? relativePath(args.path, cwd) : tool.context || 'Edited file';
    case 'code-search': {
      const target = args.path && args.path !== '.' ? ` in ${relativePath(args.path, cwd)}` : '';
      return args.pattern ? `Searched ${args.pattern}${target}` : 'Searched code';
    }
    case 'search':
      return args.query ? `Searched ${args.query}` : args.urls ? `Read ${[].concat(args.urls)[0]}` : tool.context || 'Searched the web';
    case 'question':
      return args.question || tool.context || 'Asked a question';
    default:
      return tool.context ? `${tool.name} ${tool.context}` : tool.name;
  }
}

function toolDetail(tool) {
  if (tool.inlineDiff) return stripAnsi(tool.inlineDiff);
  const result = tool.result;
  if (result && typeof result === 'object') {
    if (typeof result.output === 'string' && result.output.trim()) return result.output;
    if (typeof result.error === 'string' && result.error.trim()) return result.error;
  } else if (typeof result === 'string' && result.trim()) {
    return result;
  }
  return null;
}

function questionAnswer(tool) {
  const result = tool.result;
  if (!result || typeof result !== 'object') return null;
  if (typeof result.user_response === 'string') return result.user_response || null;
  const responses = Array.isArray(result.responses) ? result.responses.map((r) => r.user_response).filter(Boolean) : [];
  return responses.join(' · ') || null;
}

// ─── Rows (WorkLog.tsx) ───

function WorkLogLine({ icon, label, trailing }) {
  return (
    <div className="flex min-h-6 min-w-0 items-center gap-1.5 text-sm leading-relaxed select-none">
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        {icon ? (
          <span className="relative w-6 shrink-0 leading-0">
            <span className="inline-block size-6 overflow-hidden align-[calc(0.5cap_-_0.75rem)]">
              <span className="flex size-full items-center justify-center">{icon}</span>
            </span>
          </span>
        ) : null}
        <div className="min-w-0 flex-1 truncate text-secondary-label [&_*]:whitespace-nowrap">{label}</div>
      </div>
      {trailing}
    </div>
  );
}

const ROW_CLASS = 'group/timeline-row relative w-full min-w-0 rounded-md px-0.5 py-0 text-left transition-colors';
const ROW_INTERACTIVE = 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70';

function WorkLogRow({ icon, label, trailing, onToggle, expanded, children, live }) {
  const interactive = Boolean(onToggle);
  return (
    <div
      ref={live ? observeVisibleAnimation : undefined}
      className={cn(ROW_CLASS, interactive && ROW_INTERACTIVE)}
      {...(interactive
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-expanded': expanded,
            onClick: onToggle,
            onKeyDown: (event) => {
              if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                onToggle();
              }
            },
          }
        : {})}
    >
      <WorkLogLine icon={icon} label={label} trailing={trailing} />
      {children}
    </div>
  );
}

function WorkLogDetails({ children, mono }) {
  return (
    <div
      className={cn('ms-7 flex max-h-96 cursor-auto flex-col gap-3 overflow-auto px-0.5 py-1 select-text', mono && 'font-mono text-xs')}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

function RowIcon({ Icon, failed, highlighted }) {
  return (
    <span
      className={cn('flex size-4 items-center justify-center', failed ? 'text-tool-error-icon/40' : highlighted ? 'text-foreground' : 'text-icon-muted')}
      role={failed ? 'img' : undefined}
      aria-label={failed ? 'Tool call failed' : undefined}
    >
      <Icon className="block size-4 shrink-0 stroke-2" />
    </span>
  );
}

function RowTimestamp({ at }) {
  if (!at) return null;
  return (
    <span className="pointer-events-none absolute me-1 shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums opacity-0 group-hover/timeline-row:static group-hover/timeline-row:opacity-100">
      {formatClock(at)}
    </span>
  );
}

function ToolRow({ tool, cwd }) {
  const [expanded, setExpanded] = useState(false);
  const action = toolAction(tool);
  const detail = toolDetail(tool);
  const answer = action === 'question' ? questionAnswer(tool) : null;
  const label = toolLabel(tool, cwd);
  return (
    <WorkLogRow
      live={tool.running}
      onToggle={detail ? () => setExpanded((value) => !value) : undefined}
      expanded={expanded}
      icon={<RowIcon Icon={ACTION_ICONS[action]} failed={tool.failed} />}
      label={
        <p className="flex w-full min-w-0 items-baseline gap-1.5">
          <span className={cn('truncate', answer ? 'min-w-0' : 'min-w-0 flex-1', tool.running && 'live-tool-shine')}>{label}</span>
          {answer ? <span className="min-w-0 truncate text-foreground">{answer}</span> : null}
        </p>
      }
      trailing={
        <>
          {tool.failed ? <XIcon aria-hidden className="size-3 shrink-0 text-tool-error-icon/40" /> : null}
          <RowTimestamp at={tool.at} />
        </>
      }
    >
      {expanded && detail ? (
        <WorkLogDetails mono>
          <pre className="whitespace-pre-wrap break-words text-muted-foreground">{detail}</pre>
        </WorkLogDetails>
      ) : null}
    </WorkLogRow>
  );
}

function ToolGroup({ action, tools, cwd }) {
  const [expanded, setExpanded] = useState(false);
  const label = groupLabel(action, tools);
  const failed = tools.some((t) => t.failed);
  return (
    <div className="flex min-w-0 flex-col">
      <button
        type="button"
        aria-label={failed ? `${label}, tool call failed` : label}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className={cn(ROW_CLASS, ROW_INTERACTIVE)}
      >
        <WorkLogLine
          icon={<RowIcon Icon={ACTION_ICONS[action]} />}
          label={<span className="block truncate">{label}</span>}
          trailing={<RowTimestamp at={tools[0].at} />}
        />
      </button>
      {expanded ? (
        <div className="flex min-w-0 flex-col pb-1">
          {tools.map((tool, index) => (
            <ToolRow key={tool.id ?? index} tool={tool} cwd={cwd} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReasoningRow({ message, live }) {
  const [expanded, setExpanded] = useState(false);
  const preview = message.text.trim().replace(/\s+/g, ' ');
  const label = live ? (expanded ? 'Thinking' : preview || 'Thinking') : expanded ? 'Thought' : preview || 'Thought';
  return (
    <WorkLogRow
      live={live}
      onToggle={message.text.trim() ? () => setExpanded((value) => !value) : undefined}
      expanded={expanded}
      icon={<RowIcon Icon={BrainIcon} />}
      label={<span className={cn('block truncate', live && 'live-tool-shine')}>{label}</span>}
    >
      {expanded ? (
        <WorkLogDetails>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{message.text.trim()}</p>
        </WorkLogDetails>
      ) : null}
    </WorkLogRow>
  );
}

function ThinkingRow() {
  return <WorkLogRow live icon={<RowIcon Icon={BrainIcon} />} label={<span className="block truncate live-tool-shine">Thinking</span>} />;
}

// Consecutive tools of one kind fold under a "Ran 3 commands" header; a still-running tool stays out.
function WorkItems({ items, cwd, live }) {
  const out = [];
  let index = 0;
  while (index < items.length) {
    const item = items[index];
    if (item.role === 'tool' && toolAction(item) !== 'question') {
      const action = toolAction(item);
      let end = index;
      while (end + 1 < items.length && items[end + 1].role === 'tool' && toolAction(items[end + 1]) === action) end += 1;
      const run = items.slice(index, end + 1);
      const settled = run.filter((t) => !t.running);
      const running = run.filter((t) => t.running);
      if (settled.length > 1) out.push(<ToolGroup key={`g${index}`} action={action} tools={settled} cwd={cwd} />);
      else settled.forEach((tool, i) => out.push(<ToolRow key={`t${index}:${i}`} tool={tool} cwd={cwd} />));
      running.forEach((tool, i) => out.push(<ToolRow key={`r${index}:${i}`} tool={tool} cwd={cwd} />));
      index = end + 1;
      continue;
    }
    if (item.role === 'tool') out.push(<ToolRow key={`t${index}`} tool={item} cwd={cwd} />);
    else if (item.role === 'reasoning') out.push(<ReasoningRow key={`r${index}`} message={item} live={live && item.streaming} />);
    else out.push(<MessageBlock key={`m${index}`} message={item} />);
    index += 1;
  }
  return out;
}

// ─── Turn chrome ───

function WorkingRow({ startedAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="border-b border-border/60 pb-2 pt-1">
      <div className="flex h-6 min-w-0 items-baseline gap-2 px-1 text-sm leading-relaxed text-muted-foreground tabular-nums">
        <span className="relative shrink-0 overflow-hidden whitespace-nowrap">
          {startedAt ? <>Working for {formatWorkingTimer(now - startedAt)}</> : 'Working...'}
        </span>
      </div>
    </div>
  );
}

function TurnFoldRow({ label, expanded, onToggle, at }) {
  return (
    <div className="group/timeline-row border-b border-border/60 pb-2 pe-0.5 pt-1">
      <div className="relative flex items-center gap-1">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex cursor-pointer select-none items-center gap-1 rounded-md px-1 text-sm leading-relaxed text-muted-foreground tabular-nums transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
        >
          <span>{label}</span>
          {expanded ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
        </button>
        {at ? (
          <span className="ms-auto pointer-events-none shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums opacity-0 group-hover/timeline-row:opacity-100">
            {formatClock(at)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1_500);
    return () => window.clearTimeout(id);
  }, [copied]);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label="Copy message"
            disabled={copied}
            size="icon-xs"
            variant="ghost-muted"
            onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true), () => {})}
          />
        }
      >
        {copied ? <CheckIcon className="size-3 text-primary" /> : <CopyIcon className="size-3" />}
      </TooltipTrigger>
      <TooltipPopup>
        <p>Copy message</p>
      </TooltipPopup>
    </Tooltip>
  );
}

function AssistantMeta({ message, alwaysVisible }) {
  return (
    <div
      className={cn(
        'mt-1 flex items-center gap-2 text-xs tabular-nums transition-opacity duration-200',
        alwaysVisible ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover/assistant:opacity-100',
      )}
    >
      <CopyButton text={message.text.trim()} />
      {message.at ? <p className="text-muted-foreground text-xs tabular-nums">{formatClock(message.at)}</p> : null}
    </div>
  );
}

function MessageBlock({ message, meta, metaVisible }) {
  if (message.role === 'user') {
    return (
      <div className="group flex flex-col items-end gap-1 py-2">
        <MessageAttachments attachments={message.attachments} />
        {message.text && (
          <div className="relative max-w-[80%] whitespace-pre-wrap rounded-2xl bg-message p-3 text-sm leading-relaxed text-message-foreground">
            {message.text}
          </div>
        )}
      </div>
    );
  }
  if (message.role === 'error') {
    return <div className="my-1 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-[13px] text-destructive-foreground">{message.text}</div>;
  }
  if (message.role === 'notice') {
    return <div className="px-1 py-1 text-xs text-muted-foreground">{message.text}</div>;
  }
  const text = message.role === 'assistant' ? message.text?.trim() : '';
  if (!text) return null;
  return (
    <div className="group/assistant relative min-w-0 px-1 py-1">
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</div>
      {meta && !message.streaming ? <AssistantMeta message={message} alwaysVisible={metaVisible} /> : null}
    </div>
  );
}

// ─── Timeline ───

function splitTurns(messages) {
  const turns = [];
  let current = { user: null, items: [] };
  for (const message of messages) {
    if (message.role === 'user') {
      if (current.user || current.items.length) turns.push(current);
      current = { user: message, items: [] };
    } else {
      current.items.push(message);
    }
  }
  if (current.user || current.items.length) turns.push(current);
  return turns;
}

const isWork = (m) => m.role === 'tool' || m.role === 'reasoning';

function Turn({ turn, live, isLast, startedAt, cwd, expanded, onToggle }) {
  const { items } = turn;
  const terminalIndex = live ? -1 : items.findLastIndex((m) => m.role === 'assistant' && m.text);
  const terminal = items[terminalIndex];
  const before = terminalIndex >= 0 ? items.slice(0, terminalIndex) : items;
  const after = terminalIndex >= 0 ? items.slice(terminalIndex + 1) : [];
  const foldable = terminal && before.some(isWork);

  if (live) {
    const last = items[items.length - 1];
    const waiting = !items.some((m) => m.streaming && (m.role === 'reasoning' || m.text)) && !items.some((m) => m.role === 'tool' && m.running);
    return (
      <>
        {turn.user ? <MessageBlock message={turn.user} /> : null}
        <WorkingRow startedAt={startedAt} />
        <div className="flex min-w-0 flex-col pt-1">
          <WorkItems items={items} cwd={cwd} live />
          {waiting && !(last?.role === 'assistant' && last.text) ? <ThinkingRow /> : null}
        </div>
      </>
    );
  }

  const label = terminal?.interrupted
    ? terminal.workedMs != null
      ? `You stopped after ${formatDuration(terminal.workedMs)}`
      : 'You stopped this response'
    : terminal?.workedMs != null
      ? `Worked for ${formatDuration(terminal.workedMs)}`
      : 'Worked';

  return (
    <>
      {turn.user ? <MessageBlock message={turn.user} /> : null}
      {foldable ? (
        <>
          <TurnFoldRow label={label} expanded={expanded} onToggle={onToggle} at={turn.user?.at} />
          {expanded ? (
            <div className="flex min-w-0 flex-col pt-1">
              <WorkItems items={before} cwd={cwd} />
            </div>
          ) : null}
        </>
      ) : before.length ? (
        <div className="flex min-w-0 flex-col">
          <WorkItems items={before} cwd={cwd} />
        </div>
      ) : null}
      {terminal ? <MessageBlock message={terminal} meta metaVisible={isLast} /> : null}
      {after.length ? (
        <div className="flex min-w-0 flex-col">
          <WorkItems items={after} cwd={cwd} />
        </div>
      ) : null}
    </>
  );
}

export function Timeline({ thread }) {
  const [unfolded, setUnfolded] = useState(() => new Set());
  const turns = splitTurns(thread.messages);
  return turns.map((turn, index) => {
    const isLast = index === turns.length - 1;
    return (
      <div key={index} className="flex min-w-0 flex-col gap-1" data-timeline-turn={index}>
        <Turn
          turn={turn}
          live={isLast && thread.running}
          isLast={isLast}
          startedAt={thread.runningSince}
          cwd={thread.cwd}
          expanded={unfolded.has(index)}
          onToggle={() =>
            setUnfolded((current) => {
              const next = new Set(current);
              if (next.has(index)) next.delete(index);
              else next.add(index);
              return next;
            })
          }
        />
      </div>
    );
  });
}
