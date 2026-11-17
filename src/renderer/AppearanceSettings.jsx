// T3 settings/AppearanceSettingsPanel.tsx, ThemeSettings.tsx, ThemePreviewCircles.tsx and
// ThemeWireframe.tsx for the built-in themes. Custom theme import and the editor are left out.
import React from 'react';
import { MoonIcon, SunIcon } from 'lucide-react';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '../t3/components/ui/select.tsx';
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from '../t3/components/ui/tooltip.tsx';
import { cn } from '../t3/lib/utils.ts';
import { BUILT_IN_THEMES, getThemeColorsForAppearance } from '../t3/themePalettes.ts';
import {
  DEFAULT_INTERFACE_SETTINGS,
  MAX_APPEARANCE_CONTRAST,
  MAX_GLASS_OPACITY,
  MAX_INTERFACE_FONT_SIZE,
  MIN_APPEARANCE_CONTRAST,
  MIN_GLASS_OPACITY,
  MIN_INTERFACE_FONT_SIZE,
  applyThemeEverywhere,
  getThemeDefinition,
  setAppearanceMode,
  setThemeHalf,
  updateInterfaceSettings,
  useAppearance,
} from './appearance.js';
import { SettingResetButton, SettingsPageContainer, SettingsRow, SettingsSection } from './settingsLayout.jsx';

const STANDARD_THEME_PREVIEW_COLORS = {
  light: {
    sidebar: '#fafafa',
    surface: '#ffffff',
    accentSurface: '#f4f4f5',
    messageSurface: '#e4e4e7',
    canvas: '#fcfcfc',
    accent: '#f4f4f5',
    messageAction: '#4f46e5',
  },
  dark: {
    sidebar: '#0f0f10',
    surface: '#121212',
    accentSurface: '#27272a',
    messageSurface: '#27272a',
    canvas: '#0a0a0a',
    accent: '#1c1c1f',
    messageAction: '#8b9cff',
  },
};

const STANDARD_THEME_CARD = {
  id: null,
  label: 'T3 Code',
  previews: ['light', 'dark'].map((mode) => ({ mode, colors: STANDARD_THEME_PREVIEW_COLORS[mode] })),
};

const THEME_PREVIEW_RENDER_SPECS = {
  light: {
    baseTarget: '#ffffff',
    baseWeight: 0.8,
    accent: { center: [0.72, 0.22], middleOffset: 0.28, middleOpacity: 0.72, endOffset: 0.58 },
    action: { center: [0.18, 0.82], startOpacity: 0.45, endOffset: 0.55 },
    scale: 1.1,
    blurAt56Px: 3,
  },
  dark: {
    baseTarget: '#09090b',
    baseWeight: 0.8,
    accent: { center: [0.28, 0.78], middleOffset: 0.28, middleOpacity: 0.62, endOffset: 0.58 },
    action: { center: [0.82, 0.18], startOpacity: 0.45, endOffset: 0.55 },
    scale: 1.1,
    blurAt56Px: 3,
  },
};

const CHAT_WIDTH_LABELS = { comfortable: 'Comfortable', wide: 'Wide', full: 'Full' };

function themeCard(theme) {
  return {
    id: theme.id,
    label: theme.label,
    previews: ['light', 'dark'].flatMap((mode) => {
      const colors = getThemeColorsForAppearance(theme, mode);
      if (!colors) return [];
      const { sidebar, canvas, surface, accentSurface, accent, messageSurface, messageAction } = colors;
      return [{ mode, colors: { sidebar, canvas, surface, accentSurface, accent, messageSurface, messageAction } }];
    }),
  };
}

function previewColors(themeId, mode) {
  const theme = getThemeDefinition(themeId);
  return (theme && themeCard(theme).previews.find((preview) => preview.mode === mode)?.colors) ?? STANDARD_THEME_PREVIEW_COLORS[mode];
}

function previewStyle(colors, mode) {
  const spec = THEME_PREVIEW_RENDER_SPECS[mode];
  const accentPosition = `${spec.accent.center[0] * 100}% ${spec.accent.center[1] * 100}%`;
  const actionPosition = `${spec.action.center[0] * 100}% ${spec.action.center[1] * 100}%`;
  return {
    backgroundColor: `color-mix(in oklab, ${colors.canvas} ${spec.baseWeight * 100}%, ${spec.baseTarget})`,
    backgroundImage: [
      `radial-gradient(circle at ${accentPosition} in oklab, ${colors.accent} 0%, color-mix(in oklab, ${colors.accent} ${spec.accent.middleOpacity * 100}%, transparent) ${spec.accent.middleOffset * 100}%, transparent ${spec.accent.endOffset * 100}%)`,
      `radial-gradient(circle at ${actionPosition} in oklab, color-mix(in oklab, ${colors.messageAction} ${spec.action.startOpacity * 100}%, transparent) 0%, transparent ${spec.action.endOffset * 100}%)`,
    ].join(', '),
    filter: `blur(${spec.blurAt56Px}px)`,
    transform: `scale(${spec.scale})`,
  };
}

function ThemePreviewCircle({ colors, mode }) {
  return (
    <span
      aria-hidden
      className="relative block size-14 shrink-0 overflow-hidden rounded-full border-2 border-background"
      style={{
        boxShadow:
          mode === 'dark'
            ? 'inset 0 0 0 1px rgb(255 255 255 / 0.14), 0 1px 2px rgb(0 0 0 / 0.18)'
            : 'inset 0 0 0 1px rgb(0 0 0 / 0.10), 0 1px 2px rgb(0 0 0 / 0.08)',
      }}
    >
      <span className="absolute inset-0 rounded-full" style={previewStyle(colors, mode)} />
    </span>
  );
}

function ThemePreviewCircles({ label, activeModes, onSelectMode, previews }) {
  return (
    <div className="flex min-h-16 items-center justify-center gap-2.5 px-3 pt-3">
      {previews.map(({ mode, colors }) => {
        const isPicked = activeModes.includes(mode);
        return (
          <Tooltip key={mode}>
            <TooltipTrigger
              render={
                <button
                  aria-label={`Use ${label} ${mode} mode`}
                  aria-pressed={isPicked}
                  className={cn(
                    'relative flex size-[68px] shrink-0 transform-gpu cursor-pointer items-center justify-center rounded-full p-1.5 outline-none transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-5 focus-visible:outline-foreground/60',
                    isPicked && 'hover:scale-100',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectMode(mode);
                  }}
                  type="button"
                >
                  <ThemePreviewCircle colors={colors} mode={mode} />
                  {isPicked ? (
                    <>
                      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: 'inset 0 0 0 2px var(--ring)' }} />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute right-0.5 bottom-0.5 flex size-5 items-center justify-center rounded-full border border-border/70 bg-background text-foreground shadow-sm"
                      >
                        {mode === 'light' ? <SunIcon className="size-3" /> : <MoonIcon className="size-3" />}
                      </span>
                    </>
                  ) : null}
                </button>
              }
            />
            <TooltipPopup>{mode === 'light' ? 'Use for light mode only' : 'Use for dark mode only'}</TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
}

function ThemeLibraryCard({ card, activeModes, onUse, onUseMode }) {
  const cardModes = card.previews.map((preview) => preview.mode);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className="cursor-pointer overflow-hidden rounded-xl border border-border/70 bg-card/60 transition-colors hover:bg-accent/10"
            onClick={onUse}
          >
            <ThemePreviewCircles label={card.label} activeModes={activeModes} onSelectMode={onUseMode} previews={card.previews} />
            <div className="flex items-center gap-2 px-3 pt-2 pb-3">
              <button
                aria-label={`Use ${card.label} theme`}
                className="min-w-0 cursor-pointer truncate rounded-sm text-left text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:ring-inset"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUse();
                }}
              >
                {card.label}
              </button>
            </div>
          </div>
        }
      />
      <TooltipPopup>{cardModes.length > 1 ? 'Use for both light and dark' : `Use for ${cardModes[0]} mode only`}</TooltipPopup>
    </Tooltip>
  );
}

function ThemeWireframePane({ colors, clip }) {
  const line = 'rgb(127 127 127 / 0.25)';
  return (
    <span
      className="absolute inset-0"
      style={
        clip === undefined
          ? undefined
          : {
              clipPath:
                clip === 'left'
                  ? 'polygon(0 0, calc(50% - 1px) 0, calc(50% - 1px) 100%, 0 100%)'
                  : 'polygon(calc(50% + 1px) 0, 100% 0, 100% 100%, calc(50% + 1px) 100%)',
            }
      }
    >
      <span className="absolute inset-0" style={{ backgroundColor: colors.canvas }} />
      <span className="absolute inset-y-0 left-0 w-[22%]" style={{ backgroundColor: colors.sidebar, boxShadow: `inset -1px 0 0 ${line}` }} />
      <span className="absolute top-[8%] left-[3%] h-[8%] w-[16%] rounded-md" style={{ backgroundColor: colors.surface, boxShadow: `inset 0 0 0 1px ${line}` }} />
      <span className="absolute top-[22%] left-[3%] h-[7%] w-[16%] rounded-md" style={{ backgroundColor: colors.accentSurface }} />
      <span className="absolute top-[32%] left-[3%] h-[7%] w-[16%] rounded-md" style={{ backgroundColor: colors.messageSurface, opacity: 0.7 }} />
      <span className="absolute top-[42%] left-[3%] h-[7%] w-[16%] rounded-md" style={{ backgroundColor: colors.messageSurface, opacity: 0.5 }} />
      <span className="absolute top-[11%] right-[28%] h-[9%] w-[24%] rounded-lg" style={{ backgroundColor: colors.messageSurface }} />
      <span className="absolute top-[28%] left-[27%] h-[5%] w-[34%] rounded-sm" style={{ backgroundColor: line }} />
      <span className="absolute top-[38%] left-[27%] h-[5%] w-[26%] rounded-sm" style={{ backgroundColor: line }} />
      <span
        className="absolute right-[6%] bottom-[8%] left-[26%] flex h-[15%] items-center justify-between rounded-md px-1"
        style={{ backgroundColor: colors.surface, boxShadow: `inset 0 0 0 1px ${line}` }}
      >
        <span className="block h-[26%] w-[34%] rounded-full" style={{ backgroundColor: line, opacity: 0.7 }} />
        <span className="block aspect-square h-[58%] rounded-full" style={{ backgroundColor: colors.messageAction }} />
      </span>
      <span
        className="absolute top-[8%] right-[5%] h-[46%] w-[20%] rounded-lg"
        style={{ backgroundColor: colors.surface, boxShadow: `inset 0 0 0 1px ${line}, 0 2px 5px rgb(0 0 0 / 0.14)` }}
      >
        {[0, 1, 2].map((row) => (
          <span key={row} className="absolute right-[11%] left-[11%] flex items-center gap-1" style={{ top: `${10 + row * 30}%`, height: '20%' }}>
            <span
              className="block aspect-square h-[26%] rounded-full"
              style={{ backgroundColor: row === 0 ? '#34d399' : row === 1 ? colors.messageAction : '#fbbf24', opacity: 0.55 }}
            />
            <span className="block h-[30%] w-[52%] rounded-sm" style={{ backgroundColor: line }} />
          </span>
        ))}
      </span>
    </span>
  );
}

function ThemeWireframe({ panes }) {
  return (
    <span aria-hidden className="relative block h-[8.75rem] w-full overflow-hidden rounded-lg border border-border/60">
      {panes.map((pane) => (
        <ThemeWireframePane key={pane.clip ?? 'pane'} clip={pane.clip} colors={pane.colors} />
      ))}
    </span>
  );
}

function ThemeLibrary({ mode, halves }) {
  const lightOwner = halves.light ?? null;
  const darkOwner = halves.dark ?? null;
  const pickedModesFor = (id) => [...(lightOwner === id ? ['light'] : []), ...(darkOwner === id ? ['dark'] : [])];
  const wireframe = (tileMode) =>
    tileMode === 'system'
      ? [
          { clip: 'left', colors: previewColors(lightOwner, 'light') },
          { clip: 'right', colors: previewColors(darkOwner, 'dark') },
        ]
      : [{ colors: previewColors(tileMode === 'dark' ? darkOwner : lightOwner, tileMode) }];
  const cards = [STANDARD_THEME_CARD, ...BUILT_IN_THEMES.map(themeCard)];

  return (
    <div className="space-y-3">
      <h3 className="flex min-h-7 items-center px-3 text-base font-semibold text-foreground sm:px-4">Color scheme</h3>
      <div aria-label="Appearance mode" className="grid w-full grid-cols-3 gap-3" role="group">
        {['system', 'light', 'dark'].map((tileMode) => {
          const isActive = mode === tileMode;
          return (
            <button
              key={tileMode}
              type="button"
              aria-label={tileMode === 'system' ? 'Follow the system appearance' : `Use ${tileMode} mode`}
              aria-pressed={isActive}
              className={cn(
                'flex cursor-pointer flex-col items-stretch gap-1.5 rounded-xl border p-2 outline-none transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-7 focus-visible:outline-foreground/60',
                isActive ? 'border-transparent bg-accent/30 ring-2 ring-ring ring-inset' : 'border-border/70 bg-card/60 hover:bg-accent/10',
              )}
              onClick={() => setAppearanceMode(tileMode)}
            >
              <ThemeWireframe panes={wireframe(tileMode)} />
              <span className={cn('flex items-center justify-center text-xs font-medium', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                {tileMode === 'system' ? 'System' : tileMode === 'light' ? 'Light' : 'Dark'}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3 px-3 pt-5 sm:px-4">
        <h3 className="text-base font-semibold text-foreground">Themes</h3>
      </div>
      <TooltipProvider>
        <div className="grid w-full gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))' }}>
          {cards.map((card) => (
            <ThemeLibraryCard
              key={card.id ?? 'default'}
              card={card}
              activeModes={pickedModesFor(card.id)}
              onUse={() => applyThemeEverywhere(card.id)}
              onUseMode={(cardMode) => setThemeHalf(cardMode, card.id)}
            />
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}

function SliderRow({ title, description, label, id, min, max, value, defaultValue, onChange }) {
  const ratio = (value - min) / (max - min);
  return (
    <SettingsRow
      title={title}
      description={description}
      resetAction={value !== defaultValue ? <SettingResetButton label={label} onClick={() => onChange(defaultValue)} /> : null}
      control={
        <div className="flex w-full items-center gap-3 sm:w-52">
          <output
            className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium text-foreground tabular-nums"
            htmlFor={id}
          >
            {value}%
          </output>
          <input
            aria-label={title}
            className="settings-slider min-w-0 flex-1"
            id={id}
            min={min}
            max={max}
            step={5}
            type="range"
            value={value}
            style={{ '--settings-slider-progress': `${ratio * 100}%`, '--settings-slider-fill-offset': `${0.5 - ratio}rem` }}
            onChange={(event) => onChange(Number(event.currentTarget.value))}
          />
        </div>
      }
    />
  );
}

export function AppearanceSettings() {
  const { mode, halves, interface: settings } = useAppearance();
  const defaults = DEFAULT_INTERFACE_SETTINGS;
  return (
    <SettingsPageContainer>
      <SettingsSection title="Colors & themes" variant="plain" hideTitle>
        <ThemeLibrary mode={mode} halves={halves} />
      </SettingsSection>

      <SettingsSection title="Interface">
        <SliderRow
          title="Contrast"
          description="Adjust the contrast of colors and borders across the interface."
          label="contrast"
          id="appearance-contrast"
          min={MIN_APPEARANCE_CONTRAST}
          max={MAX_APPEARANCE_CONTRAST}
          value={settings.appearanceContrast}
          defaultValue={defaults.appearanceContrast}
          onChange={(appearanceContrast) => updateInterfaceSettings({ appearanceContrast })}
        />
        <SliderRow
          title="Glass opacity"
          description="Higher values make menus, dialogs, and the composer more solid."
          label="glass opacity"
          id="glass-opacity"
          min={MIN_GLASS_OPACITY}
          max={MAX_GLASS_OPACITY}
          value={settings.glassOpacity}
          defaultValue={defaults.glassOpacity}
          onChange={(glassOpacity) => updateInterfaceSettings({ glassOpacity })}
        />
        <SettingsRow
          title="Chat width"
          description="Set how wide messages and the composer can grow on large screens."
          resetAction={
            settings.chatWidth !== defaults.chatWidth ? (
              <SettingResetButton label="chat width" onClick={() => updateInterfaceSettings({ chatWidth: defaults.chatWidth })} />
            ) : null
          }
          control={
            <div className="w-full sm:w-40">
              <Select value={settings.chatWidth} onValueChange={(chatWidth) => updateInterfaceSettings({ chatWidth })}>
                <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Chat width">
                  <SelectValue>{CHAT_WIDTH_LABELS[settings.chatWidth]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="comfortable">Comfortable (default)</SelectItem>
                  <SelectItem value="wide">Wide</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectPopup>
              </Select>
            </div>
          }
        />
      </SettingsSection>

      <SettingsSection title="Typography">
        <SettingsRow
          title="Interface font size"
          description="Everything outside code blocks and the terminal."
          resetAction={
            settings.fontSizeInterface !== defaults.fontSizeInterface ? (
              <SettingResetButton
                label="interface font size"
                onClick={() => updateInterfaceSettings({ fontSizeInterface: defaults.fontSizeInterface })}
              />
            ) : null
          }
          control={
            <Select value={String(settings.fontSizeInterface)} onValueChange={(next) => updateInterfaceSettings({ fontSizeInterface: Number(next) })}>
              <SelectTrigger size="sm" className="w-22 shrink-0" aria-label="Interface font size">
                <SelectValue>{settings.fontSizeInterface} px</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {Array.from({ length: MAX_INTERFACE_FONT_SIZE - MIN_INTERFACE_FONT_SIZE + 1 }, (_, i) => MIN_INTERFACE_FONT_SIZE + i).map((px) => (
                  <SelectItem hideIndicator key={px} value={String(px)}>
                    {px} px
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
