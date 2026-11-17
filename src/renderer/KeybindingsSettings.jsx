// T3 settings/KeybindingsSettings.tsx, reduced: one row per command t3rmes runs, with
// record, remove and reset. No `when` editor; every t3rmes binding applies app-wide.
import React, { useState } from 'react';
import { PlusIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { Button } from '../t3/components/ui/button.tsx';
import { Input } from '../t3/components/ui/input.tsx';
import { Kbd, KbdGroup } from '../t3/components/ui/kbd.tsx';
import { Tooltip, TooltipPopup, TooltipTrigger } from '../t3/components/ui/tooltip.tsx';
import { cn } from '../t3/lib/utils.ts';
import { SettingResetButton, SettingsPageContainer, SettingsRow, SettingsSection } from './settingsLayout.jsx';
import {
  IS_MAC,
  KEYBINDING_COMMANDS,
  THREAD_JUMP_COMMANDS,
  commandLabel,
  commandsShadowedByKey,
  defaultKeysForCommand,
  keyConflictKey,
  keybindingFromKeyboardEvent,
  keysForCommand,
  resetCommandKeys,
  setCommandKeys,
  useKeybindings,
} from './keybindings.js';

const GROUPS = [
  { title: 'General', commands: ['sidebar.toggle', 'chat.new', 'modelPicker.toggle', 'appearance.cycle'] },
  { title: 'Threads', commands: ['thread.previous', 'thread.next', 'thread.pin', 'thread.settle', 'thread.copyReference'] },
  { title: 'Thread jump', commands: THREAD_JUMP_COMMANDS },
];

const DESCRIPTIONS = {
  'sidebar.toggle': 'Show or hide the thread list.',
  'chat.new': 'Start a new thread.',
  'modelPicker.toggle': 'Open the model picker in the composer.',
  'appearance.cycle': 'Switch between system, light and dark.',
  'thread.previous': 'Open the thread above the current one in the list.',
  'thread.next': 'Open the thread below the current one in the list.',
  'thread.pin': 'Pin or unpin the open thread.',
  'thread.settle': 'Settle or un-settle the open thread.',
  'thread.copyReference': "Copy the open thread's Hermes session ID.",
};

const sameKeys = (a, b) => a.length === b.length && a.every((key, index) => key === b[index]);

// T3 KeybindingPill.
function KeybindingPill({ value }) {
  const seen = new Map();
  const parts = value.split('+').map((part) => {
    const count = seen.get(part) ?? 0;
    seen.set(part, count + 1);
    return { part, key: count === 0 ? part : `${part}-${count}` };
  });
  return (
    <KbdGroup className="bg-transparent p-0 shadow-none">
      {parts.map(({ part, key }) => (
        <Kbd key={key} className="min-w-6 justify-center px-1.5">
          {part === 'mod'
            ? IS_MAC
              ? '⌘'
              : 'Ctrl'
            : part === 'shift'
              ? IS_MAC
                ? '⇧'
                : 'Shift'
              : part === 'alt'
                ? IS_MAC
                  ? '⌥'
                  : 'Alt'
                : part === 'meta'
                  ? 'Meta'
                  : part === 'ctrl'
                    ? IS_MAC
                      ? '⌃'
                      : 'Ctrl'
                    : part.length === 1
                      ? part.toUpperCase()
                      : part.slice(0, 1).toUpperCase() + part.slice(1)}
        </Kbd>
      ))}
    </KbdGroup>
  );
}

function KeybindingRow({ command, state }) {
  const keys = keysForCommand(command, state);
  const defaults = defaultKeysForCommand(command);
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(null);
  const label = commandLabel(command);
  const shadowed = pending ? commandsShadowedByKey(state.bindings, pending, command) : [];

  const save = (key) => {
    setRecording(false);
    setPending(null);
    if (!keys.some((existing) => keyConflictKey(existing) === keyConflictKey(key))) setCommandKeys(command, [...keys, key]);
  };

  const capture = (event) => {
    if (event.key === 'Tab') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setRecording(false);
      setPending(null);
      return;
    }
    if (event.key === 'Enter' && pending) {
      save(pending);
      return;
    }
    const next = keybindingFromKeyboardEvent(event.nativeEvent);
    if (next) setPending(next);
  };

  return (
    <SettingsRow
      title={label}
      description={DESCRIPTIONS[command]}
      resetAction={sameKeys(keys, defaults) ? null : <SettingResetButton label={label} onClick={() => resetCommandKeys(command)} />}
      control={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {keys.length === 0 && !recording ? <span className="text-xs text-muted-foreground">Unassigned</span> : null}
          {keys.map((key) => (
            <span key={key} className="group/pill inline-flex items-center gap-0.5 rounded-md">
              <KeybindingPill value={key} />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-micro"
                      variant="ghost-muted"
                      aria-label={`Remove ${key} from ${label}`}
                      onClick={() => setCommandKeys(command, keys.filter((k) => k !== key))}
                    />
                  }
                >
                  <XIcon className="size-3" />
                </TooltipTrigger>
                <TooltipPopup side="top">Remove</TooltipPopup>
              </Tooltip>
            </span>
          ))}
          {recording ? (
            <span className="inline-flex items-center gap-1.5">
              {shadowed.length > 0 ? (
                <Tooltip>
                  <TooltipTrigger render={<span className="inline-flex text-warning-foreground" aria-label="Shortcut conflict" />}>
                    <TriangleAlertIcon className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipPopup side="top">Also bound to {shadowed.map(commandLabel).join(', ')}; this binding takes over.</TooltipPopup>
                </Tooltip>
              ) : null}
              <Input
                autoFocus
                readOnly
                size="sm"
                aria-label={`Record a shortcut for ${label}`}
                value={pending ?? ''}
                placeholder="Press shortcut"
                className={cn('w-40 font-mono', 'border-primary/70 bg-primary/5')}
                onKeyDown={capture}
                onBlur={() => {
                  setRecording(false);
                  setPending(null);
                }}
              />
              <Button size="sm" disabled={!pending} onMouseDown={(event) => event.preventDefault()} onClick={() => pending && save(pending)}>
                Save
              </Button>
            </span>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={<Button size="icon-sm" variant="ghost" aria-label={`Add a shortcut for ${label}`} onClick={() => setRecording(true)} />}
              >
                <PlusIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipPopup side="top">Add shortcut</TooltipPopup>
            </Tooltip>
          )}
        </div>
      }
    />
  );
}

export function KeybindingsSettings() {
  const state = useKeybindings();
  const customized = KEYBINDING_COMMANDS.some((command) => command in state.overrides);
  return (
    <SettingsPageContainer>
      {GROUPS.map((group) => (
        <SettingsSection key={group.title} title={group.title}>
          {group.commands.map((command) => (
            <KeybindingRow key={command} command={command} state={state} />
          ))}
        </SettingsSection>
      ))}
      {customized ? (
        <div className="flex justify-end px-3 sm:px-4">
          <Button size="sm" variant="outline" onClick={() => KEYBINDING_COMMANDS.forEach(resetCommandKeys)}>
            Restore all defaults
          </Button>
        </div>
      ) : null}
    </SettingsPageContainer>
  );
}
