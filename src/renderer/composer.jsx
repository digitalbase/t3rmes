import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CheckIcon, FileIcon, PaperclipIcon, StarIcon, XIcon, ZapIcon } from 'lucide-react';
import { Popover, PopoverPopup, PopoverTrigger } from '../t3/components/ui/popover.tsx';
import { Combobox, ComboboxEmpty, ComboboxItem, ComboboxList, ComboboxSearchInput } from '../t3/components/ui/combobox.tsx';
import { Button } from '../t3/components/ui/button.tsx';
import { Kbd } from '../t3/components/ui/kbd.tsx';
import { Tooltip, TooltipPopup, TooltipTrigger } from '../t3/components/ui/tooltip.tsx';
import { cn } from '../t3/lib/utils.ts';
import nousLogo from './icons/nousresearch.svg?url';
import openaiLogo from './icons/openai.svg?url';
import openrouterLogo from './icons/openrouter.svg?url';
import cliproxyLogo from './icons/cliproxy.png';

// Hermes' levels (hermes_constants.VALID_REASONING_EFFORTS); `none` is thinking off.
const REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const DEFAULT_EFFORT = 'medium';
const EFFORT_LABELS = { none: 'Off', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'XHigh', max: 'Max', ultra: 'Ultra' };

// Extensions Hermes stages as images (tui_gateway image.attach_bytes); the rest go through file.attach.
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'svg', 'ico']);
const IMAGE_MAX_BYTES = 25 * 1024 * 1024;

let nextAttachmentId = 1;
export function toAttachment(file) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const kind = IMAGE_EXTENSIONS.has(ext) && file.size <= IMAGE_MAX_BYTES ? 'image' : 'file';
  return {
    id: `att-${nextAttachmentId++}`,
    name: file.name || (kind === 'image' ? 'pasted-image.png' : 'file'),
    kind,
    file,
    size: file.size,
    previewUrl: kind === 'image' ? URL.createObjectURL(file) : null,
  };
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Hermes Desktop lib/model-status-label.ts: vendor prefix off, date pin off, friendly casing.
const VARIANT_TAGS = [/-fast$/i, /-thinking$/i, /-preview$/i, /-latest$/i];
const titleCase = (text) => text.replace(/\b\w/g, (c) => c.toUpperCase()).trim();
export function modelDisplayName(model) {
  if (!model) return 'Default model';
  let base = model.trim().slice(model.trim().lastIndexOf('/') + 1);
  const variant = VARIANT_TAGS.find((pattern) => pattern.test(base));
  const tag = variant ? titleCase(base.match(variant)[0].slice(1)) : '';
  if (variant) base = base.replace(variant, '');
  base = base.replace(/-\d{8}$/, '');
  let name;
  if (/^claude-/i.test(base)) name = titleCase(base.replace(/^claude-/i, '').replace(/-/g, ' ')).replace(/(\d+) (\d+)$/, '$1.$2');
  else if (/^gpt-/i.test(base)) name = base.replace(/^gpt-/i, 'GPT-');
  else if (/^gemini-/i.test(base)) name = base.replace(/^gemini-/i, 'Gemini ').replace(/-/g, ' ');
  else name = titleCase(base.replace(/-/g, ' '));
  return [name || model, tag].filter(Boolean).join(' ');
}

// T3 ComposerControl.tsx, size "sm".
const COMPOSER_CONTROL =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-(--control-radius) border border-transparent text-base outline-none hover:bg-accent data-pressed:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 data-disabled:pointer-events-none data-disabled:opacity-64 [&:active:not([aria-haspopup])]:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:shrink-0 h-7 gap-1.5 px-2 font-medium text-foreground/80 [&_svg:not([class*='text-'])]:text-muted-foreground hover:text-foreground sm:text-sm [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 aria-pressed:bg-accent aria-pressed:text-accent-foreground data-popup-open:bg-accent";

function ComposerControl({ className, ...props }) {
  return <button type="button" className={cn(COMPOSER_CONTROL, className)} {...props} />;
}

const PROVIDER_TINTS = ['bg-violet-500/15 text-violet-600 dark:text-violet-300', 'bg-sky-500/15 text-sky-600 dark:text-sky-300', 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300', 'bg-amber-500/15 text-amber-700 dark:text-amber-300', 'bg-rose-500/15 text-rose-600 dark:text-rose-300'];
// Brand marks: Nous Research and OpenAI from LobeHub Icons (MIT), OpenRouter from Simple Icons (CC0),
// CLIProxyAPI from the router-for-me GitHub avatar (the project ships no logo of its own).
const PROVIDER_LOGOS = { nous: nousLogo, openrouter: openrouterLogo, openai: openaiLogo, 'openai-codex': openaiLogo };

// A custom endpoint is CLIProxyAPI when its root answers {"message":"CLI Proxy API Server"} (no key needed).
// Probed once per origin; unreachable endpoints just keep the initial.
const cliProxyProbes = new Map();
const cliProxyListeners = new Set();
function probeCliProxy(apiUrl) {
  let origin;
  try {
    origin = new URL(apiUrl).origin;
  } catch {
    return false;
  }
  if (!cliProxyProbes.has(origin)) {
    cliProxyProbes.set(origin, false);
    fetch(`${origin}/`, { signal: AbortSignal.timeout(5000) })
      .then((response) => response.json())
      .then((body) => {
        if (body?.message !== 'CLI Proxy API Server') return;
        cliProxyProbes.set(origin, true);
        cliProxyListeners.forEach((listener) => listener());
      })
      .catch(() => {});
  }
  return cliProxyProbes.get(origin);
}
function useIsCliProxy(provider) {
  const apiUrl = provider?.is_user_defined ? provider.api_url : null;
  return useSyncExternalStore(
    (listener) => {
      cliProxyListeners.add(listener);
      return () => cliProxyListeners.delete(listener);
    },
    () => (apiUrl ? probeCliProxy(apiUrl) : false),
  );
}

function SidebarProviderIcon({ provider }) {
  const isCliProxy = useIsCliProxy(provider);
  const className = isCliProxy ? 'size-6 rounded-md' : PROVIDER_LOGOS[provider.slug] ? 'size-5 text-foreground/80' : 'size-6 rounded-md text-xs';
  return <ProviderIcon provider={provider} isCliProxy={isCliProxy} className={className} />;
}

function ProviderIcon({ provider, isCliProxy, className }) {
  if (isCliProxy) return <img src={cliproxyLogo} alt="" aria-hidden="true" className={cn('size-4 shrink-0 rounded-[5px] object-cover grayscale', className)} />;
  const logo = PROVIDER_LOGOS[provider?.slug];
  if (logo) {
    return (
      <span
        aria-hidden="true"
        className={cn('size-4 shrink-0 bg-current', className)}
        style={{ mask: `url("${logo}") center / contain no-repeat`, WebkitMask: `url("${logo}") center / contain no-repeat` }}
      />
    );
  }
  const name = provider?.name || provider?.slug || '?';
  const tint = PROVIDER_TINTS[[...(provider?.slug || name)].reduce((sum, c) => sum + c.charCodeAt(0), 0) % PROVIDER_TINTS.length];
  return (
    <span aria-hidden="true" className={cn('flex size-4 shrink-0 items-center justify-center rounded-[5px] font-semibold text-[10px] leading-none', tint, className)}>
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}

// The provider this pick runs on. model.options reports `custom` for a `custom:<host>` slug, so is_current breaks the tie.
function findProvider(providers, slug) {
  return providers.find((p) => p.slug === slug) || providers.find((p) => slug && p.slug.split(':')[0] === slug && p.is_current) || null;
}

// A Hermes provider slug's logo, as the model picker draws it; `providers` is model.options' catalog.
export function ProviderLogo({ providers, slug, model, className }) {
  const provider =
    (slug && findProvider(providers, slug)) ||
    providers.find((p) => model && p.models?.includes(model)) ||
    (slug ? { slug, name: slug } : null);
  const isCliProxy = useIsCliProxy(provider);
  return <ProviderIcon provider={provider} isCliProxy={isCliProxy} className={className} />;
}

export function useComposerSelection(thread, modelOptions, defaults) {
  const providers = modelOptions.providers;
  const pick = { ...thread.runtime, ...thread.pending };
  const model = pick.model || thread.model || defaults.model || '';
  const providerSlug = pick.provider || (model === defaults.model ? defaults.provider : null) || defaults.provider;
  const provider = findProvider(providers, providerSlug) || providers.find((p) => p.is_current) || null;
  const caps = provider?.capabilities?.[model] ?? null;
  const effort = pick.effort || defaults.effort || DEFAULT_EFFORT;
  const fast = typeof pick.fast === 'boolean' ? pick.fast : Boolean(defaults.fast);
  return { providers, provider, model, caps, effort, fast };
}

const modelKey = (slug, model) => `${slug}\u0000${model}`;

// Favorite models, as provider\0model keys. Local to this app: Hermes keeps no favorites.
const FAVORITES_KEY = 't3rmes:model-favorites';
const favoriteListeners = new Set();
const readFavorites = () => localStorage.getItem(FAVORITES_KEY) ?? '[]';
function useFavorites() {
  const raw = useSyncExternalStore((listener) => {
    favoriteListeners.add(listener);
    return () => favoriteListeners.delete(listener);
  }, readFavorites);
  const favorites = useMemo(() => {
    try {
      return new Set(JSON.parse(raw));
    } catch {
      return new Set();
    }
  }, [raw]);
  const toggle = (key) => {
    const next = new Set(favorites);
    next.has(key) ? next.delete(key) : next.add(key);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
    favoriteListeners.forEach((listener) => listener());
  };
  return [favorites, toggle];
}

const IS_MAC = /mac/i.test(navigator.platform);
// Fired by the modelPicker.toggle shortcut (main.jsx AppShortcuts).
export const MODEL_PICKER_TOGGLE_EVENT = 't3rmes:model-picker-toggle';
const jumpLabel = (index) => (index < 9 ? (IS_MAC ? `⌘${index + 1}` : `Ctrl+${index + 1}`) : null);

// T3 ProviderModelPicker + ModelPickerContent + ComposerEffortColumn + ComposerPickerFooter, simplified for Hermes.
export function ProviderModelPicker({ selection, loading, disabled, onOpen, onSelectModel, onEffort, onFast }) {
  const { providers, provider, model, caps, effort, fast } = selection;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(null);
  const [query, setQuery] = useState('');
  const [favorites, toggleFavorite] = useFavorites();
  const searchInputRef = useRef(null);
  const folded = query.trim().toLowerCase();
  const toggleRef = useRef(null);
  toggleRef.current = () => {
    if (open) return setOpen(false);
    if (disabled) return;
    setTab(null);
    setQuery('');
    setOpen(true);
    onOpen?.();
  };
  useEffect(() => {
    const onToggle = () => toggleRef.current();
    window.addEventListener(MODEL_PICKER_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(MODEL_PICKER_TOGGLE_EVENT, onToggle);
  }, []);

  // Favorites that this runtime still offers, in provider order.
  const favoriteRows = useMemo(() => {
    const entries = [];
    for (const p of providers) for (const slug of p.models || []) if (favorites.has(modelKey(p.slug, slug))) entries.push({ provider: p, model: slug });
    return entries;
  }, [providers, favorites]);
  const tabs = [...(favoriteRows.length ? ['favorites'] : []), ...providers.filter((p) => p.authenticated !== false).map((p) => p.slug)];
  // T3 opens on Favorites when there are any, else on the provider the session runs on.
  const activeTab = tabs.includes(tab) ? tab : favoriteRows.length ? 'favorites' : provider?.slug || providers[0]?.slug || null;
  const tabProvider = providers.find((p) => p.slug === activeTab) || null;

  const rows = useMemo(() => {
    const entries = [];
    const add = (p, slug) => entries.push({ key: modelKey(p.slug, slug), provider: p, model: slug, name: modelDisplayName(slug) });
    if (folded) {
      for (const p of providers) for (const slug of p.models || []) if (`${slug} ${modelDisplayName(slug)} ${p.name}`.toLowerCase().includes(folded)) add(p, slug);
    } else if (activeTab === 'favorites') {
      for (const { provider: p, model: slug } of favoriteRows) add(p, slug);
    } else if (tabProvider) {
      const featured = tabProvider.featured_models || [];
      const ordered = [...featured, ...(tabProvider.models || []).filter((slug) => !featured.includes(slug))];
      // Favorites lead their provider's list, as in T3.
      for (const slug of ordered) if (favorites.has(modelKey(tabProvider.slug, slug))) add(tabProvider, slug);
      for (const slug of ordered) if (!favorites.has(modelKey(tabProvider.slug, slug))) add(tabProvider, slug);
    }
    return entries;
  }, [providers, activeTab, tabProvider, favoriteRows, favorites, folded]);
  const keys = rows.map((row) => row.key);
  const activeKey = provider && model ? modelKey(provider.slug, model) : null;
  const showProviderName = Boolean(folded) || activeTab === 'favorites';

  // T3 model picker shortcuts: mod+1..9 picks a visible model, mod+shift+up/down changes provider.
  const shortcutsRef = useRef(null);
  shortcutsRef.current = { rows, tabs, activeTab, onSelectModel };
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (!(IS_MAC ? event.metaKey : event.ctrlKey) || event.altKey || event.repeat || event.isComposing) return;
      const { rows, tabs, activeTab, onSelectModel } = shortcutsRef.current;
      if (event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        event.stopPropagation();
        const index = tabs.indexOf(activeTab);
        setTab(tabs[(index + (event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length]);
        setQuery('');
        return;
      }
      if (event.shiftKey || !/^[1-9]$/.test(event.key)) return;
      const row = rows[Number(event.key) - 1];
      if (!row) return;
      event.preventDefault();
      event.stopPropagation();
      onSelectModel(row.provider.slug, row.model);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  const levels = caps?.reasoning === false ? [] : [...(caps?.can_disable_reasoning ? ['none'] : []), ...REASONING_EFFORTS];
  const name = modelDisplayName(model);
  const label = caps?.reasoning === false ? name : `${name} ${EFFORT_LABELS[effort] ?? effort}`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (disabled) return setOpen(false);
        setOpen(next);
        if (next) {
          setTab(null);
          setQuery('');
          onOpen?.();
        }
      }}
    >
      <PopoverTrigger
        render={<ComposerControl aria-label={`Model: ${label}`} disabled={disabled} className="min-w-0 shrink justify-between" data-chat-provider-model-picker="true" />}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="min-w-0 max-w-56 flex-1 truncate" data-chat-provider-model-picker-label="true">
            {label}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverPopup initialFocus={searchInputRef} align="start" side="top" className="before:hidden" padding="none">
        <div className="flex max-h-(--available-height) flex-col">
          <div className="flex h-86.5 min-h-0">
            <div className="relative flex w-screen max-w-90 flex-row overflow-hidden" data-model-picker-content="true">
              <ProviderSidebar providers={providers} showFavorites={favoriteRows.length > 0} selected={folded ? null : activeTab} current={provider?.slug} onSelect={(slug) => { setTab(slug); setQuery(''); searchInputRef.current?.focus(); }} />
              <Combobox
                inline
                open
                autoHighlight
                filter={null}
                items={keys}
                filteredItems={keys}
                value={activeKey}
                onValueChange={(key) => {
                  const row = rows.find((r) => r.key === key);
                  if (row) onSelectModel(row.provider.slug, row.model);
                }}
              >
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-l border-border/70 bg-muted/40">
                  <ComboboxSearchInput
                    ref={searchInputRef}
                    placeholder="Search models..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpen(false);
                      }
                    }}
                  />
                  <ComboboxEmpty className="empty:h-0">{loading && !providers.length ? 'Loading models…' : 'No models found'}</ComboboxEmpty>
                  <ComboboxList>
                    {rows.map((row, index) => (
                      <ComboboxItem key={row.key} index={index} value={row.key} hideIndicator selectedFill={false} className="group relative w-full !min-w-0 max-w-full cursor-pointer">
                        <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                          <div className="min-w-0 max-w-full shrink-0 truncate text-sm font-normal leading-snug" title={row.model}>
                            {row.name}
                            {showProviderName ? null : <span className="sr-only">, {row.provider.name}</span>}
                          </div>
                          {row.key === activeKey ? <CheckIcon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                          {showProviderName ? <span className="min-w-0 shrink truncate text-xs text-muted-foreground/70">{row.provider.name}</span> : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <FavoriteButton
                            isFavorite={favorites.has(row.key)}
                            onHover={activeTab === 'favorites' && !folded}
                            onToggle={() => toggleFavorite(row.key)}
                          />
                          {jumpLabel(index) ? <Kbd>{jumpLabel(index)}</Kbd> : null}
                        </div>
                      </ComboboxItem>
                    ))}
                  </ComboboxList>
                </div>
              </Combobox>
            </div>
            <div data-model-picker-effort className="flex min-h-0 w-48 shrink-0 flex-col border-l border-border/70 bg-muted/40">
              <div className="shrink-0 px-3 pt-2.5">
                <div className="flex h-8.25 -translate-y-px items-center gap-2 border-b border-border/70 pb-1.5 text-sm">
                  <span className="text-muted-foreground">Effort</span>
                  <span className="ms-auto min-w-0 truncate text-muted-foreground text-xs">{name}</span>
                </div>
              </div>
              <div role="radiogroup" aria-label="Effort" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-2 pt-2.5 pb-1.5">
                {levels.length === 0 ? (
                  <div className="flex h-8 items-center px-2 text-muted-foreground text-sm">No effort levels</div>
                ) : (
                  levels.map((level) => (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={level === effort}
                      onClick={() => level !== effort && onEffort(level)}
                      className="flex h-8 w-full shrink-0 cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm text-foreground outline-none hover:bg-foreground/[0.09] focus-visible:bg-foreground/[0.09]"
                    >
                      <span className="min-w-0 flex-1 truncate">{EFFORT_LABELS[level]}</span>
                      {level === effort ? (
                        <CheckIcon aria-hidden="true" className="size-3.5" />
                      ) : level === DEFAULT_EFFORT ? (
                        <span className="text-muted-foreground/70 text-xs">Default</span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
          {caps?.fast ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/70 bg-muted/40 px-3 py-2">
              <div role="radiogroup" aria-label="Speed" className="flex rounded-lg bg-input/40 p-0.5">
                {[false, true].map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    role="radio"
                    aria-checked={fast === value}
                    data-checked={fast === value || undefined}
                    onClick={() => fast !== value && onFast(value)}
                    className="flex h-6 cursor-pointer items-center justify-center gap-1 px-2 text-muted-foreground text-xs outline-none first:rounded-l-md last:rounded-r-md hover:text-foreground data-checked:bg-input/72 data-checked:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    {value ? <ZapIcon aria-hidden="true" className="size-3 fill-current" /> : null}
                    {value ? 'Fast' : 'Standard'}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

// T3 ModelListRow's star: shown on hover, or always once the model is a favorite.
function FavoriteButton({ isFavorite, onHover, onToggle }) {
  const label = isFavorite ? 'Remove from favorites' : 'Add to favorites';
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost-muted"
            aria-label={label}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              onToggle();
            }}
            onKeyDown={(event) => event.stopPropagation()}
          />
        }
      >
        <StarIcon
          className={cn(
            'size-3.5 sm:size-3',
            isFavorite && 'fill-current text-warning',
            (!isFavorite || onHover) && 'opacity-0 group-hover:opacity-100 group-data-highlighted:opacity-100',
          )}
        />
      </TooltipTrigger>
      <TooltipPopup side="top" align="center">
        {label}
      </TooltipPopup>
    </Tooltip>
  );
}

const SIDEBAR_BUTTON =
  'relative isolate flex aspect-square w-full cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-foreground/10 focus-visible:bg-foreground/10 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';
const SelectedBar = () => <div className="pointer-events-none absolute top-1/2 right-0 z-10 h-5 w-0.75 -translate-y-1/2 rounded-full bg-primary" />;

// T3 ModelPickerSidebar: Favorites, then a column of provider buttons with a primary bar beside the selected one.
function ProviderSidebar({ providers, showFavorites, selected, current, onSelect }) {
  return (
    <div className="w-11 shrink-0 overflow-hidden bg-muted/30" data-model-picker-sidebar="true" role="toolbar" aria-orientation="vertical" aria-label="Providers">
      <div className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="relative flex min-h-full flex-col gap-1 p-1">
          {showFavorites && (
            <>
              <div className="relative w-full" data-model-picker-provider="favorites">
                {selected === 'favorites' ? <SelectedBar /> : null}
                <Tooltip>
                  <TooltipTrigger
                    render={<button type="button" aria-pressed={selected === 'favorites'} aria-label="Favorites" onClick={() => onSelect('favorites')} className={SIDEBAR_BUTTON} />}
                  >
                    <StarIcon className="size-5 shrink-0 fill-current" aria-hidden />
                  </TooltipTrigger>
                  <TooltipPopup side="left" align="center">
                    Favorites
                  </TooltipPopup>
                </Tooltip>
              </div>
              <div className="border-b border-border/70" aria-hidden="true" />
            </>
          )}
          {providers.map((p) => (
            <div key={p.slug} className="relative w-full" data-model-picker-provider={p.slug}>
              {p.slug === selected ? <SelectedBar /> : null}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-pressed={p.slug === selected}
                      aria-label={p.name}
                      disabled={p.authenticated === false}
                      onClick={() => onSelect(p.slug)}
                      className={SIDEBAR_BUTTON}
                    />
                  }
                >
                  <SidebarProviderIcon provider={p} />
                  {p.slug === current ? <span className="absolute right-1.5 bottom-1.5 size-1.5 rounded-full bg-success ring-2 ring-muted" /> : null}
                </TooltipTrigger>
                <TooltipPopup side="left" align="center">
                  {p.name}
                  {p.authenticated === false ? ' · not signed in' : ''}
                </TooltipPopup>
              </Tooltip>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// T3 ComposerAttachButton.
export function ComposerAttachButton({ onFiles, disabled }) {
  const inputRef = useRef(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length) onFiles(files);
        }}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => inputRef.current?.click()}
              aria-label="Attach files"
            />
          }
        >
          <PaperclipIcon className="translate-y-px" />
        </TooltipTrigger>
        <TooltipPopup side="top">Attach files</TooltipPopup>
      </Tooltip>
    </>
  );
}

// T3 ComposerAttachmentStrip: image tiles, then file rows.
export function ComposerAttachmentStrip({ attachments, onRemove }) {
  const images = attachments.filter((a) => a.kind === 'image');
  const files = attachments.filter((a) => a.kind !== 'image');
  return (
    <div className="px-3 pt-3 sm:px-4">
      {images.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {images.map((attachment) => (
            <div key={attachment.id} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border/80 bg-background">
              <img src={attachment.previewUrl} alt={attachment.name} className="h-full w-full object-cover" />
              <Button type="button" variant="media-close" size="icon-xs" className="absolute right-1 top-1" onClick={() => onRemove(attachment.id)} aria-label={`Remove ${attachment.name}`}>
                <XIcon />
              </Button>
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="mb-1 flex flex-col gap-1">
          {files.map((attachment) => (
            <div key={attachment.id} className="flex min-w-0 items-center gap-2 py-1 text-sm text-foreground">
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
              <span className="shrink-0 text-xs text-secondary-label">{formatSize(attachment.size)}</span>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => onRemove(attachment.id)} aria-label={`Remove ${attachment.name}`}>
                <XIcon />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Images from history live on the runtime (`@image:/opt/data/...`); fetch each once.
const runtimeImageCache = new Map();

function loadRuntimeImage(path) {
  if (!runtimeImageCache.has(path)) {
    const pending = (window.t3rmes?.readFileDataUrl?.(path) ?? Promise.resolve('')).catch(() => '');
    runtimeImageCache.set(path, pending);
  }
  return runtimeImageCache.get(path);
}

function useAttachmentSrc(attachment) {
  const [loaded, setLoaded] = useState(() => ({ path: null, src: '' }));
  const path = attachment.kind === 'image' && !attachment.previewUrl ? attachment.path : null;
  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;
    loadRuntimeImage(path).then((src) => !cancelled && setLoaded({ path, src }));
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (attachment.previewUrl) return { src: attachment.previewUrl, pending: false };
  if (!path) return { src: '', pending: false };
  return loaded.path === path ? { src: loaded.src, pending: false } : { src: '', pending: true };
}

function MessageAttachment({ attachment }) {
  const { src, pending } = useAttachmentSrc(attachment);
  if (attachment.kind === 'image' && pending) {
    return <div aria-label={attachment.name} className="h-24 w-32 animate-pulse rounded-lg border border-border/80 bg-muted" />;
  }
  if (attachment.kind === 'image' && src) {
    return <img src={src} alt={attachment.name} className="h-24 max-w-48 rounded-lg border border-border/80 object-cover" />;
  }
  return (
    <span className="inline-flex h-7 max-w-64 items-center gap-1.5 rounded-lg border border-border/80 bg-card px-2 text-xs text-foreground">
      <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{attachment.name}</span>
    </span>
  );
}

// Sent attachments on a user message: thumbnails and file chips.
export function MessageAttachments({ attachments }) {
  if (!attachments?.length) return null;
  return (
    <div className="flex max-w-[80%] flex-wrap justify-end gap-2">
      {attachments.map((attachment) => <MessageAttachment key={attachment.id} attachment={attachment} />)}
    </div>
  );
}
