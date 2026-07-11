import type { Locale, TranslationKey } from '../i18n'

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export function formatMessageTimestamp(
  value: number | string | Date,
  t: Translator,
  locale: Locale,
  now = Date.now(),
): string {
  const date = coerceDate(value)
  if (!date) return ''

  const timestamp = date.getTime()
  const diff = now - timestamp

  if (diff >= 0 && diff < MINUTE_MS) return t('session.timeJustNow')
  if (diff >= MINUTE_MS && diff < HOUR_MS) {
    return t('session.timeMinutes', { n: Math.floor(diff / MINUTE_MS) })
  }
  if (diff >= HOUR_MS && diff < DAY_MS) {
    return t('session.timeHours', { n: Math.floor(diff / HOUR_MS) })
  }
  if (diff >= DAY_MS && diff < 7 * DAY_MS) {
    return formatWeekdayTime(date, locale)
  }

  return isSameLocalYear(date, new Date(now))
    ? formatMonthDayTime(date, locale)
    : formatYearMonthDayTime(date, locale)
}

export function formatExactMessageTimestamp(value: number | string | Date, locale: Locale): string {
  const date = coerceDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(localeToIntl(locale), {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function coerceDate(value: number | string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function localeToIntl(locale: Locale): string {
  switch (locale) {
    case 'zh': return 'zh-CN'
    case 'zh-TW': return 'zh-TW'
    case 'jp': return 'ja-JP'
    case 'kr': return 'ko-KR'
    default: return 'en-US'
  }
}

// Locales whose dates use the 年/月/日 Han characters: Chinese (Simplified/Traditional)
// and Japanese share identical glyphs. Korean uses 년/월/일, so it goes through Intl instead.
function usesHanYmd(locale: Locale): boolean {
  return locale === 'zh' || locale === 'zh-TW' || locale === 'jp'
}

function formatWeekdayTime(date: Date, locale: Locale): string {
  const intlLocale = localeToIntl(locale)
  const han = usesHanYmd(locale)
  const weekday = new Intl.DateTimeFormat(intlLocale, { weekday: han ? 'long' : 'short' }).format(date)
  const time = formatClockTime(date, intlLocale)
  return han ? `${weekday}${time}` : `${weekday} ${time}`
}

function formatMonthDayTime(date: Date, locale: Locale): string {
  const intlLocale = localeToIntl(locale)
  if (usesHanYmd(locale)) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${formatClockTime(date, intlLocale)}`
  }
  const day = new Intl.DateTimeFormat(intlLocale, {
    month: 'short',
    day: 'numeric',
  }).format(date)
  return `${day} ${formatClockTime(date, intlLocale)}`
}

function formatYearMonthDayTime(date: Date, locale: Locale): string {
  const intlLocale = localeToIntl(locale)
  if (usesHanYmd(locale)) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${formatClockTime(date, intlLocale)}`
  }
  const day = new Intl.DateTimeFormat(intlLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
  return `${day} ${formatClockTime(date, intlLocale)}`
}

function formatClockTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function isSameLocalYear(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
}
