// T3 settings/SettingsPanels.tsx ChatSettingsPanel, reduced to what Hermes can back.
import React from 'react';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '../t3/components/ui/select.tsx';
import {
  DEFAULT_TOOL_CALL_VISIBILITY,
  TOOL_CALL_VISIBILITIES,
  TOOL_CALL_VISIBILITY_LABELS,
  setToolCallVisibility,
  useToolCallVisibility,
} from './chatSettings.js';
import { SettingResetButton, SettingsPageContainer, SettingsRow, SettingsSection } from './settingsLayout.jsx';

export function ChatSettings() {
  const visibility = useToolCallVisibility();
  return (
    <SettingsPageContainer>
      <SettingsSection title="Timeline">
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
