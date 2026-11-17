// T3 ChatMarkdown.tsx, chat/MarkdownCodeBlock.tsx (+ .logic.ts), chat/MarkdownTable.tsx and
// lib/syntaxHighlighting.ts. Left out: file-link chips, thread links, citations, skills, math,
// mermaid, images, task-list editing and "Run in terminal", which Hermes has no backing for.
import React, { Children, Component, Suspense, isValidElement, memo, use, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getSharedHighlighter } from '@pierre/diffs';
import { CheckIcon, CopyIcon, WrapTextIcon } from 'lucide-react';
import { Button } from '../t3/components/ui/button.tsx';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '../t3/components/ui/menu.tsx';
import { ScrollArea } from '../t3/components/ui/scroll-area.tsx';
import { Tooltip, TooltipPopup, TooltipTrigger } from '../t3/components/ui/tooltip.tsx';
import { READABLE_LIGHT_THEME_NAME } from '../t3/lib/readableSyntaxTheme.ts';
import { cn } from '../t3/lib/utils.ts';
import { useAppearance } from './appearance.js';

// ─── Highlighting ───

const THEME_NAMES = { light: READABLE_LIGHT_THEME_NAME, dark: 'pierre-dark' };
const highlighterPromises = new Map();

function getHighlighterPromise(language) {
  const cached = highlighterPromises.get(language);
  if (cached) return cached;
  const promise = getSharedHighlighter({
    // Both palettes, so switching appearance never needs a new highlighter.
    themes: Object.values(THEME_NAMES),
    langs: [language],
    preferredHighlighter: 'highlights',
  }).catch((error) => {
    if (language === 'text') {
      highlighterPromises.delete(language);
      throw error;
    }
    return getHighlighterPromise('text');
  });
  highlighterPromises.set(language, promise);
  return promise;
}

const MAX_HIGHLIGHT_CACHE_ENTRIES = 500;
const highlightedCodeCache = new Map();

function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function extractFenceLanguage(className) {
  const raw = className?.match(/(?:^|\s)language-([^\s]+)/)?.[1] ?? 'text';
  // Shiki doesn't bundle a gitignore grammar; ini is a close match.
  return raw === 'gitignore' ? 'ini' : raw;
}

function nodeToPlainText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToPlainText).join('');
  if (isValidElement(node)) return nodeToPlainText(node.props.children);
  return '';
}

function extractCodeBlock(children) {
  const childNodes = Children.toArray(children);
  if (childNodes.length !== 1) return null;
  const onlyChild = childNodes[0];
  if (!isValidElement(onlyChild)) return null;
  if (onlyChild.type !== 'code' && onlyChild.props.node?.tagName !== 'code') return null;
  return { className: onlyChild.props.className, code: nodeToPlainText(onlyChild.props.children) };
}

function ShikiCodeBlock({ className, code, themeName }) {
  const language = extractFenceLanguage(className);
  const cacheKey = `${fnv1a32(code).toString(36)}:${code.length}:${language}:${themeName}`;
  let html = highlightedCodeCache.get(cacheKey);
  if (html == null) {
    const highlighter = use(getHighlighterPromise(language));
    try {
      html = highlighter.codeToHtml(code, { lang: language, theme: themeName });
    } catch (error) {
      console.warn(`Code highlighting failed for language "${language}", falling back to plain text.`, error?.message ?? error);
      html = highlighter.codeToHtml(code, { lang: 'text', theme: themeName });
    }
    if (highlightedCodeCache.size >= MAX_HIGHLIGHT_CACHE_ENTRIES) highlightedCodeCache.delete(highlightedCodeCache.keys().next().value);
    highlightedCodeCache.set(cacheKey, html);
  }
  return <div className="chat-markdown-shiki" dangerouslySetInnerHTML={{ __html: html }} />;
}

class RenderErrorBoundary extends Component {
  state = { error: null, keys: this.props.resetKeys };
  static getDerivedStateFromError(error) {
    return { error };
  }
  static getDerivedStateFromProps(props, state) {
    const changed = props.resetKeys.some((key, index) => key !== state.keys[index]);
    return changed ? { error: null, keys: props.resetKeys } : null;
  }
  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}

// ─── Copy ───

function useCopyToClipboard(timeout = 1200) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const copy = (text) =>
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), timeout);
      },
      () => {},
    );
  return { copy, copied };
}

// ─── Code block ───

function MarkdownCodeBlock({ code, language, children }) {
  const { copy, copied } = useCopyToClipboard();
  const [wrapped, setWrapped] = useState(true);
  const wrapLabel = wrapped ? 'Disable line wrap' : 'Wrap lines';
  const copyLabel = copied ? 'Copied' : 'Copy code';
  return (
    <div
      dir="ltr"
      className="chat-markdown-codeblock my-[0.65rem] text-start overflow-hidden rounded-lg border border-border/70 bg-secondary leading-snug dark:border-transparent dark:bg-input/32"
      data-language={language}
      data-wrap={wrapped ? 'true' : 'false'}
    >
      <div className="chat-markdown-codeblock-header flex items-center justify-between gap-2 pt-1.5 pr-1.5 pb-0 pl-3 select-none">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-2xs">
          <span className="truncate">{language}</span>
        </span>
        <span className="flex items-center gap-0.5" role="toolbar" aria-label="Code block actions">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant={wrapped ? 'secondary' : 'ghost-muted'}
                  size="icon-xs"
                  aria-pressed={wrapped}
                  onClick={() => setWrapped((value) => !value)}
                  aria-label={wrapLabel}
                />
              }
            >
              <WrapTextIcon className="size-3" />
            </TooltipTrigger>
            <TooltipPopup side="top">{wrapLabel}</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button type="button" variant="ghost-muted" size="icon-xs" onClick={() => copy(code)} aria-label={copyLabel} />}>
              {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
            </TooltipTrigger>
            <TooltipPopup side="top">{copyLabel}</TooltipPopup>
          </Tooltip>
        </span>
      </div>
      {children}
    </div>
  );
}

// ─── Table ───

const tableRows = (table) => [...table.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr')];
const tableCells = (row) => [...row.children].filter((cell) => cell.tagName === 'TH' || cell.tagName === 'TD');

function serializeTableToMarkdown(table) {
  const lines = [];
  for (const row of tableRows(table)) {
    const cells = tableCells(row);
    if (cells.length === 0) continue;
    lines.push(`| ${cells.map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim().replaceAll('|', '\\|')).join(' | ')} |`);
    if (lines.length === 1) lines.push(`| ${cells.map(() => '---').join(' | ')} |`);
  }
  return lines.join('\n');
}

function serializeTableToCsv(table) {
  const csvCell = (value) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return /[",\n]/.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
  };
  return tableRows(table)
    .map(tableCells)
    .filter((cells) => cells.length > 0)
    .map((cells) => cells.map((cell) => csvCell(cell.textContent ?? '')).join(','))
    .join('\n');
}

function MarkdownTable({ children, ...props }) {
  const containerRef = useRef(null);
  const { copy, copied } = useCopyToClipboard();
  const copyLabel = copied ? 'Copied' : 'Copy table';
  const handleCopy = (format) => {
    const table = containerRef.current?.querySelector('table');
    if (table) copy(format === 'markdown' ? serializeTableToMarkdown(table) : serializeTableToCsv(table));
  };
  return (
    <div ref={containerRef} className="chat-markdown-table-container">
      <ScrollArea radius="none" chainVerticalScroll scrollFade className="w-full max-w-full">
        <table {...props}>{children}</table>
      </ScrollArea>
      <div className="mt-0.5 -mx-1 flex items-center justify-end select-none">
        <Menu>
          <Tooltip>
            <TooltipTrigger render={<MenuTrigger render={<Button type="button" variant="ghost-muted" size="icon-xs" aria-label={copyLabel} />} />}>
              {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
            </TooltipTrigger>
            <TooltipPopup side="top">{copyLabel}</TooltipPopup>
          </Tooltip>
          <MenuPopup align="end">
            <MenuItem onClick={() => handleCopy('markdown')}>Copy as Markdown</MenuItem>
            <MenuItem onClick={() => handleCopy('csv')}>Copy as CSV</MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </div>
  );
}

// ─── Markdown ───

// markdownPipeline remarkNormalizeLinksAndTagInlineCode: marks inline code so `code` can tell it from fences.
function remarkTagInlineCode() {
  const visit = (node) => {
    if (node.type === 'inlineCode') node.data = { ...node.data, hProperties: { ...node.data?.hProperties, dataInlineCode: '' } };
    node.children?.forEach(visit);
  };
  return visit;
}

const REMARK_PLUGINS = [remarkGfm, remarkTagInlineCode];

// Native word selection stops at hyphens and dots, so a double-click takes the whole span.
function selectInlineCode(event) {
  window.getSelection()?.selectAllChildren(event.currentTarget);
}

const ThemeContext = React.createContext('dark');

const COMPONENTS = {
  a: function MarkdownAnchor({ node: _node, href, children, ...props }) {
    return (
      <a {...props} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
  code: function MarkdownCode({ node, children, className, ...props }) {
    if (node?.properties?.dataInlineCode != null) {
      return (
        <code {...props} className={className} onDoubleClick={selectInlineCode}>
          {children}
        </code>
      );
    }
    return (
      <code {...props} className={className}>
        {children}
      </code>
    );
  },
  table: function MarkdownTableRenderer({ node: _node, ...props }) {
    return <MarkdownTable {...props} />;
  },
  pre: function MarkdownPre({ node: _node, children, ...props }) {
    const theme = use(ThemeContext);
    const codeBlock = extractCodeBlock(children);
    if (!codeBlock) return <pre {...props}>{children}</pre>;
    const language = extractFenceLanguage(codeBlock.className);
    const themeName = THEME_NAMES[theme];
    return (
      <MarkdownCodeBlock code={codeBlock.code} language={language}>
        <RenderErrorBoundary resetKeys={[codeBlock.code, language, themeName]} fallback={<pre {...props}>{children}</pre>}>
          <Suspense
            fallback={
              <pre {...props} className="invisible" aria-hidden>
                {children}
              </pre>
            }
          >
            <ShikiCodeBlock className={codeBlock.className} code={codeBlock.code} themeName={themeName} />
          </Suspense>
        </RenderErrorBoundary>
      </MarkdownCodeBlock>
    );
  },
};

const MarkdownBody = memo(function MarkdownBody({ text }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
});

export function ChatMarkdown({ text, className, isStreaming = false }) {
  const { appearance } = useAppearance();
  return (
    <ThemeContext value={appearance === 'dark' ? 'dark' : 'light'}>
      <div
        className={cn(
          'chat-markdown w-full min-w-0 [overflow-wrap:anywhere] [word-break:break-word] text-sm leading-relaxed text-foreground/[calc(90%+var(--appearance-contrast-boost)/10)]',
          className,
        )}
        data-streaming={isStreaming ? '' : undefined}
      >
        <MarkdownBody text={text} />
      </div>
    </ThemeContext>
  );
}
