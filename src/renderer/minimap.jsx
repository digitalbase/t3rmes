import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { Button } from '../t3/components/ui/button.tsx';
import { Tooltip, TooltipPopup, TooltipTrigger } from '../t3/components/ui/tooltip.tsx';
import { cn } from '../t3/lib/utils.ts';
import { splitTurns } from './timeline.jsx';

// Ported from T3 Code's TimelineMinimap + timelineMinimapItems. T3 reads row positions from its
// virtualized list; this timeline is plain DOM, so turns are found by their data-timeline-turn anchor.

const ITEM_SPACING = 8;
const MIN_ITEMS = 2;
const MAX_HEIGHT_CSS = 'max(4rem, calc(100% - 14.75rem))';
const PERSISTENT_GUTTER = 48;
const HIT_STRIP_LEFT = 12;
const HIT_STRIP_MAX_WIDTH = 40;
const NAVIGATION_REACH = 14;

const heightStyle = (count) => `min(${Math.max(1, (count - 1) * ITEM_SPACING)}px, ${MAX_HEIGHT_CSS})`;
const topPercent = (index, count) => (count <= 1 ? 0 : (Math.max(0, Math.min(index, count - 1)) / (count - 1)) * 100);

function indexFromPointer(count, rect, pointerY) {
  if (count <= 0 || rect.height <= 0) return null;
  if (count === 1) return 0;
  const progress = Math.max(0, Math.min(1, (pointerY - rect.top) / rect.height));
  return Math.round(progress * (count - 1));
}

const compact = (text) => {
  const value = text?.replace(/\s+/g, ' ').trim() ?? '';
  return value || null;
};

// One item per user message: its text, and the last assistant reply of that turn.
function deriveMinimapItems(turns) {
  const items = [];
  turns.forEach((turn, turnIndex) => {
    if (!turn.user) return;
    const reply = turn.items.findLast((m) => m.role === 'assistant' && m.text);
    items.push({ id: String(turnIndex), turnIndex, userText: turn.user.text, assistantText: reply?.text?.slice(0, 1_500) ?? null });
  });
  return items;
}

// A release outside the window can skip `mouseup`, so the next button-free `mousemove` also counts.
function onMouseButtonsReleased(onRelease) {
  const check = (event) => {
    if (event.buttons !== 0) return;
    stop();
    onRelease();
  };
  const stop = () => {
    window.removeEventListener('mouseup', check);
    window.removeEventListener('mousemove', check);
  };
  window.addEventListener('mouseup', check);
  window.addEventListener('mousemove', check);
  return stop;
}

// Scroll position -> which turns are on screen, the turn being read, and gutter width.
function useMinimapTracking(scrollRef, items, stripMap) {
  const [currentIndex, setCurrentIndex] = useState(null);
  const [atEnd, setAtEnd] = useState(true);
  const [gutter, setGutter] = useState({ persistent: false, hitStripWidth: 0 });
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return undefined;
    const refresh = () => {
      const box = viewport.getBoundingClientRect();
      let current = null;
      let preceding = null;
      for (const [index, item] of itemsRef.current.entries()) {
        const turn = viewport.querySelector(`[data-timeline-turn="${item.turnIndex}"]`);
        const rect = turn?.getBoundingClientRect();
        const inView = Boolean(rect && rect.bottom > box.top && rect.top < box.bottom);
        const strip = stripMap.get(item.id);
        const next = inView ? 'true' : 'false';
        if (strip && strip.dataset.inView !== next) strip.dataset.inView = next;
        // Prefer the first user message on screen, otherwise the turn being read.
        if (current === null && rect) {
          if (rect.top >= box.top) current = rect.top < box.bottom ? index : preceding;
          else preceding = index;
        }
      }
      setCurrentIndex(current ?? preceding);
      setAtEnd(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 1);

      const viewportWidth = box.width;
      const content = viewport.querySelector('[data-timeline-root]');
      const contentWidth = content?.getBoundingClientRect().width ?? viewportWidth;
      const side = Math.max(0, (viewportWidth - Math.min(viewportWidth, contentWidth)) / 2);
      const hitStripWidth = Math.max(0, Math.min(HIT_STRIP_MAX_WIDTH, Math.floor(side) - HIT_STRIP_LEFT));
      const persistent = side >= PERSISTENT_GUTTER;
      setGutter((g) => (g.persistent === persistent && g.hitStripWidth === hitStripWidth ? g : { persistent, hitStripWidth }));
    };
    // Synchronous on purpose: a few rects per event is cheap, and animation frames stall while
    // the Electron window is unfocused, which would leave the rail stale.
    refresh();
    viewport.addEventListener('scroll', refresh, { passive: true });
    const resize = new ResizeObserver(refresh);
    resize.observe(viewport);
    const content = viewport.querySelector('[data-timeline-root]');
    if (content) resize.observe(content);
    return () => {
      viewport.removeEventListener('scroll', refresh);
      resize.disconnect();
    };
  }, [scrollRef, stripMap, items]);

  return { currentIndex, atEnd, ...gutter };
}

export function TimelineMinimap({ scrollRef, messages }) {
  const items = useMemo(() => deriveMinimapItems(splitTurns(messages)), [messages]);
  const stripMapRef = useRef(new Map());
  const stripMap = stripMapRef.current;
  const { currentIndex, atEnd, persistent, hitStripWidth } = useMinimapTracking(scrollRef, items, stripMap);
  const [activeIndex, setActiveIndex] = useState(null);
  const pressedOnStripRef = useRef(false);
  const [passThrough, setPassThrough] = useState(false);

  // Wheeling over the rail scrolls the chat underneath it.
  const wheelTargetRef = (node) => {
    if (!node) return undefined;
    const forward = (event) => {
      const viewport = scrollRef.current;
      if (!viewport) return;
      event.preventDefault();
      viewport.scrollBy({ top: event.deltaY, left: 0 });
    };
    node.addEventListener('wheel', forward, { passive: false });
    return () => node.removeEventListener('wheel', forward);
  };

  if (items.length < MIN_ITEMS) return null;

  const select = (item) => {
    const viewport = scrollRef.current;
    const turn = viewport?.querySelector(`[data-timeline-turn="${item.turnIndex}"]`);
    if (!viewport || !turn) return;
    const top = turn.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop - 24;
    viewport.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  const resolvedActive = activeIndex !== null && activeIndex < items.length ? activeIndex : null;
  const activeItem = resolvedActive === null ? null : items[resolvedActive];
  const activeUserText = activeItem ? compact(activeItem.userText) : null;
  const activeAssistantText = activeItem ? compact(activeItem.assistantText) : null;
  const navigationInteractive = hitStripWidth >= NAVIGATION_REACH && !passThrough;
  const resolvedCurrent = currentIndex !== null && currentIndex >= 0 && currentIndex < items.length ? currentIndex : null;
  const previousItem = resolvedCurrent === null ? null : (items[resolvedCurrent - 1] ?? null);
  const nextItem = resolvedCurrent === null || atEnd ? null : (items[resolvedCurrent + 1] ?? null);
  const moveActive = (delta) => setActiveIndex((current) => Math.max(0, Math.min(items.length - 1, (current ?? 0) + delta)));

  return (
    <div
      className={cn(
        'group/minimap pointer-events-none absolute inset-y-0 left-0 z-40 w-18',
        persistent ? 'opacity-100' : 'hidden opacity-0 transition-opacity duration-150 hover:opacity-100 focus-within:opacity-100 [@media(pointer:fine)]:block',
      )}
      data-testid="timeline-minimap"
      ref={wheelTargetRef}
    >
      <div className="relative h-full w-full select-none">
        <div
          className={cn('absolute top-1/2 left-3 -translate-y-1/2', hitStripWidth > 0 && !passThrough ? 'pointer-events-auto' : 'pointer-events-none')}
          onMouseDown={() => {
            if (pressedOnStripRef.current) return;
            pressedOnStripRef.current = true;
            onMouseButtonsReleased(() => {
              pressedOnStripRef.current = false;
            });
          }}
          onMouseMove={(event) => {
            if (event.buttons === 0 || pressedOnStripRef.current || passThrough) return;
            setPassThrough(true);
            onMouseButtonsReleased(() => setPassThrough(false));
          }}
          style={{ height: heightStyle(items.length), width: hitStripWidth }}
        >
          <NavigationButton direction="previous" disabled={!previousItem} interactive={navigationInteractive} onClick={() => previousItem && select(previousItem)} />
          <button
            aria-label={`Jump to message: ${activeUserText ?? 'User message'}`}
            className="absolute inset-y-0 left-0 w-full cursor-pointer bg-transparent before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
            onBlur={() => setActiveIndex(null)}
            onClick={(event) => {
              const index = indexFromPointer(items.length, event.currentTarget.getBoundingClientRect(), event.clientY);
              if (index !== null && items[index]) select(items[index]);
              event.currentTarget.blur();
            }}
            onFocus={() => setActiveIndex((current) => current ?? resolvedCurrent ?? 0)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') moveActive(1);
              else if (event.key === 'ArrowUp') moveActive(-1);
              else if (event.key === 'Home') setActiveIndex(0);
              else if (event.key === 'End') setActiveIndex(items.length - 1);
              else if ((event.key === 'Enter' || event.key === ' ') && activeItem) select(activeItem);
              else return;
              event.preventDefault();
            }}
            onMouseLeave={() => setActiveIndex(null)}
            onMouseMove={(event) => {
              if (event.buttons !== 0 && !pressedOnStripRef.current) return;
              setActiveIndex(indexFromPointer(items.length, event.currentTarget.getBoundingClientRect(), event.clientY));
            }}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            <div className="absolute top-0 left-3 h-full w-px bg-border/15" />
            {items.map((item, index) => {
              const distance = resolvedActive === null ? null : Math.abs(index - resolvedActive);
              return (
                <span
                  aria-hidden="true"
                  key={item.id}
                  data-in-view="false"
                  data-minimap-strip
                  className={cn(
                    'pointer-events-none absolute left-0 h-0.5 w-6 origin-left -translate-y-1/2 rounded-full transition-transform duration-150 after:absolute after:inset-0 after:rounded-full after:bg-foreground/55 after:opacity-0 after:transition-opacity after:duration-150 data-[in-view=true]:after:opacity-100',
                    distance === 0 ? 'bg-muted-foreground/60' : 'bg-muted-foreground/25',
                    distance === 0 ? 'scale-x-100' : distance === 1 ? 'scale-x-[0.667]' : distance === 2 ? 'scale-x-[0.417]' : 'scale-x-[0.333]',
                  )}
                  ref={(node) => {
                    if (node) stripMap.set(item.id, node);
                    else stripMap.delete(item.id);
                  }}
                  style={{ top: `${topPercent(index, items.length)}%` }}
                />
              );
            })}
            {activeItem ? (
              <span className="pointer-events-none absolute left-8 w-80 -translate-y-1/2" style={{ top: `${topPercent(resolvedActive, items.length)}%` }}>
                <span className="dropdown-glass block rounded-xl p-3 text-left text-popover-foreground shadow-xl shadow-black/25">
                  <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium leading-5">{activeUserText ?? 'User message'}</span>
                  {activeAssistantText ? (
                    <span
                      className="mt-1 max-h-[3.75rem] overflow-hidden text-muted-foreground text-sm leading-5"
                      style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3 }}
                    >
                      {activeAssistantText}
                    </span>
                  ) : null}
                </span>
              </span>
            ) : null}
          </button>
          <NavigationButton direction="next" disabled={!nextItem} interactive={navigationInteractive} onClick={() => nextItem && select(nextItem)} />
        </div>
      </div>
    </div>
  );
}

function NavigationButton({ direction, disabled, interactive, onClick }) {
  const previous = direction === 'previous';
  const label = previous ? 'Previous turn' : 'Next turn';
  const Icon = previous ? ChevronUpIcon : ChevronDownIcon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              'absolute left-1 z-10 inline-flex -translate-x-1/2 opacity-0 transition-opacity duration-150 hover:opacity-100 focus-within:opacity-100',
              interactive ? 'pointer-events-auto' : 'pointer-events-none',
              previous ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]',
            )}
          />
        }
      >
        <Button aria-label={label} disabled={disabled} onClick={onClick} size="icon-micro" type="button" variant="ghost-muted">
          <Icon className="size-4 text-foreground/90" />
        </Button>
      </TooltipTrigger>
      <TooltipPopup side={previous ? 'top' : 'bottom'}>{label}</TooltipPopup>
    </Tooltip>
  );
}
