// T3 settings/SettingsPanels.tsx ChatSettingsPanel, reduced to what Hermes can back.
import React from 'react';
import { CheckIcon } from 'lucide-react';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '../t3/components/ui/select.tsx';
import { isMacPlatform } from '../t3/lib/utils.ts';
import {
  DEFAULT_SEND_SHORTCUT,
  DEFAULT_TIMESTAMP_FORMAT,
  DEFAULT_TOOL_CALL_VISIBILITY,
  TIMESTAMP_FORMATS,
  TIMESTAMP_FORMAT_LABELS,
  TOOL_CALL_VISIBILITIES,
  TOOL_CALL_VISIBILITY_LABELS,
  setSendShortcut,
  setTimestampFormat,
  setToolCallVisibility,
  useSendShortcut,
  useTimestampFormat,
  useToolCallVisibility,
} from './chatSettings.js';
import { SettingResetButton, SettingsPageContainer, SettingsRow, SettingsSection } from './settingsLayout.jsx';

// T3 GeneralSettingsPanel "Display" section.
export function DisplaySettingsSection() {
  const timestampFormat = useTimestampFormat();
  return (
    <SettingsSection title="Display">
      <SettingsRow
        title="Time format"
        description="System default follows your browser or OS clock preference."
        resetAction={
          timestampFormat !== DEFAULT_TIMESTAMP_FORMAT ? (
            <SettingResetButton label="time format" onClick={() => setTimestampFormat(DEFAULT_TIMESTAMP_FORMAT)} />
          ) : null
        }
        control={
          <Select value={timestampFormat} onValueChange={(value) => TIMESTAMP_FORMATS.includes(value) && setTimestampFormat(value)}>
            <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Timestamp format">
              <SelectValue>{TIMESTAMP_FORMAT_LABELS[timestampFormat]}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {TIMESTAMP_FORMATS.map((value) => (
                <SelectItem key={value} hideIndicator value={value}>
                  {TIMESTAMP_FORMAT_LABELS[value]}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
    </SettingsSection>
  );
}

export function ChatSettings() {
  const modifierLabel = isMacPlatform(navigator.platform) ? '⌘' : 'Ctrl';
  const sendShortcutOptions = [
    { value: 'enter', label: 'Enter' },
    { value: 'mod-enter-multiline', label: `${modifierLabel} + Enter for multiline prompts` },
    { value: 'mod-enter', label: `${modifierLabel} + Enter always` },
  ];
  const sendShortcut = useSendShortcut();
  const visibility = useToolCallVisibility();
  return (
    <SettingsPageContainer>
      <SettingsSection title="Composer">
        <SettingsRow
          title="Send shortcut"
          description="Choose when Enter sends a prompt or inserts a new line"
          resetAction={
            sendShortcut !== DEFAULT_SEND_SHORTCUT ? (
              <SettingResetButton label="send shortcut" onClick={() => setSendShortcut(DEFAULT_SEND_SHORTCUT)} />
            ) : null
          }
          control={
            <Select
              value={sendShortcut}
              onValueChange={(value) => {
                const option = sendShortcutOptions.find((option) => option.value === value);
                if (option) setSendShortcut(option.value);
              }}
            >
              <SelectTrigger size="sm" className="w-auto min-w-0 max-w-full" aria-label="Send shortcut">
                <SelectValue>{sendShortcutOptions.find((option) => option.value === sendShortcut)?.label}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {sendShortcutOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="flex items-center justify-between gap-4">
                      {option.label}
                      {sendShortcut === option.value && <CheckIcon aria-hidden="true" />}
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>
      <SettingsSection title="Activity">
        <SettingsRow
          title="Tool calls in chat"
          description="Hide the commands, edits, and searches agents run. Hide successful keeps failures. Zen shows only final answers. Questions and errors always show."
          resetAction={
            visibility !== DEFAULT_TOOL_CALL_VISIBILITY ? (
              <SettingResetButton label="tool calls in chat" onClick={() => setToolCallVisibility(DEFAULT_TOOL_CALL_VISIBILITY)} />
            ) : null
          }
          control={
            <Select value={visibility} onValueChange={(value) => TOOL_CALL_VISIBILITIES.includes(value) && setToolCallVisibility(value)}>
              <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Tool calls in chat">
                <SelectValue>{TOOL_CALL_VISIBILITY_LABELS[visibility]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {TOOL_CALL_VISIBILITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {TOOL_CALL_VISIBILITY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
