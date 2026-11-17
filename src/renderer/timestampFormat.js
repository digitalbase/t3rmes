// T3 timestampFormat.ts: the clock formatters the timeline uses. Takes epoch ms or ISO strings.

const formatterCache = new Map();

function getTimestampFormatter(timestampFormat, includeSeconds) {
  const cacheKey = `${timestampFormat}:${includeSeconds ? 'seconds' : 'minutes'}`;
  const cached = formatterCache.get(cacheKey);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    ...(timestampFormat === 'locale' ? {} : { hour12: timestampFormat === '12-hour' }),
  });
  formatterCache.set(cacheKey, formatter);
  return formatter;
}

export function parseTimestampDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Deliberately English: the ordinal suffix and day-before-month order below are English.
const monthNameFormatter = new Intl.DateTimeFormat('en-US', { month: 'long' });

function ordinalSuffix(day) {
  const lastTwo = day % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

export function formatShortTimestamp(value, timestampFormat) {
  const date = parseTimestampDate(value);
  return date ? getTimestampFormatter(timestampFormat, false).format(date) : '';
}

export function formatChatTimestampTooltip(value, timestampFormat) {
  const date = parseTimestampDate(value);
  if (!date) return '';
  const day = date.getDate();
  return `${formatShortTimestamp(date, timestampFormat)}, ${day}${ordinalSuffix(day)} ${monthNameFormatter.format(date)} ${date.getFullYear()}`;
}

const numericDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric' });
const numericDateWithYearFormatter = new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' });

// Days since the epoch, so differences are whole days across DST shifts.
function calendarDay(date) {
  const year = date.getFullYear();
  return { year, index: Date.UTC(year, date.getMonth(), date.getDate()) / 86_400_000 };
}

export function formatDayAwareTimestamp(value, timestampFormat, nowMs = Date.now()) {
  const date = parseTimestampDate(value);
  if (!date) return '';
  const time = getTimestampFormatter(timestampFormat, false).format(date);
  const today = calendarDay(new Date(nowMs));
  const messageDay = calendarDay(date);
  const dayDiff = today.index - messageDay.index;
  if (dayDiff <= 0) return time;
  if (dayDiff === 1) return `yesterday at ${time}`;
  return `${(messageDay.year === today.year ? numericDateFormatter : numericDateWithYearFormatter).format(date)} ${time}`;
}
