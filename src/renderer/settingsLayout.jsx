// T3 settings/settingsLayout.tsx and SettingsGroup.tsx without the scope machinery.
import React from 'react';
import { Undo2Icon } from 'lucide-react';
import { Button } from '../t3/components/ui/button.tsx';
import { Tooltip, TooltipPopup, TooltipTrigger } from '../t3/components/ui/tooltip.tsx';
import { cn } from '../t3/lib/utils.ts';

export function SettingsPageContainer({ children }) {
  return (
    <div className="topbar-scroll-fade min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 pt-6 pb-12 sm:px-6">{children}</div>
    </div>
  );
}

export function SettingsSection({ title, hideTitle = false, variant = 'grouped', children }) {
  return (
    <section className={cn(!hideTitle && 'space-y-2.5')}>
      {hideTitle ? (
        <h2 className="sr-only">{title}</h2>
      ) : (
        <div className="flex min-h-7 flex-wrap items-start justify-between gap-x-4 gap-y-1 px-3 sm:px-4">
          <h2 className="flex min-h-7 items-center gap-2 text-base font-semibold text-foreground">{title}</h2>
        </div>
      )}
      <div
        data-slot="settings-group"
        className={cn(
          'relative overflow-visible text-foreground',
          variant === 'grouped'
            ? 'rounded-xl border border-border/60 bg-card/40 shadow-xs/5 *:not-first:border-t *:not-first:border-border/50 [&>[data-slot=settings-row]]:rounded-none'
            : 'space-y-1',
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({ title, description, resetAction, control, children }) {
  return (
    <div
      data-slot="settings-row"
      className={cn('group/settings-row @container/settings-row rounded-xl px-3 sm:px-4', children ? 'pt-3 pb-1' : 'py-3')}
    >
      <div className="flex flex-col gap-3 @min-[32rem]/settings-row:grid @min-[32rem]/settings-row:grid-cols-[minmax(0,1fr)_auto] @min-[32rem]/settings-row:items-center @min-[32rem]/settings-row:gap-8">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-h-5 items-center gap-1.5">
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">{resetAction}</span>
          </div>
          {description ? <p className="max-w-2xl text-pretty text-xs leading-normal text-muted-foreground">{description}</p> : null}
        </div>
        {control ? (
          <div className="flex w-full min-w-0 shrink-0 items-center gap-2 @min-[32rem]/settings-row:w-auto @min-[32rem]/settings-row:justify-end @min-[32rem]/settings-row:[&_[data-slot=select-trigger]]:min-w-40">
            {control}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function SettingResetButton({ label, tooltip = 'Reset to default', onClick }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-micro"
            variant="ghost-muted"
            aria-label={`Reset ${label} to default`}
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
          >
            <Undo2Icon className="size-3" />
          </Button>
        }
      />
      <TooltipPopup side="top">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
