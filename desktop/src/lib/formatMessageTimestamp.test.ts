import { describe, expect, it } from 'vitest'
import { translate, type Locale } from '../i18n'
import { formatMessageTimestamp } from './formatMessageTimestamp'

const t = (locale: Locale) => (
  key: Parameters<typeof translate>[1],
  params?: Parameters<typeof translate>[2],
) => translate(locale, key, params)

describe('formatMessageTimestamp', () => {
  const now = new Date(2026, 4, 29, 16, 0).getTime()

  it('uses relative labels for recent messages', () => {
    expect(formatMessageTimestamp(now - 5 * 60_000, t('zh'), 'zh', now)).toBe('5分钟前')
    expect(formatMessageTimestamp(now - 2 * 60 * 60_000, t('en'), 'en', now)).toBe('2h ago')
  })

  it('uses weekday and clock time for recent history', () => {
    const value = new Date(2026, 4, 24, 15, 50).getTime()

    expect(formatMessageTimestamp(value, t('zh'), 'zh', now)).toBe('星期日15:50')
  })

  it('includes the calendar date for older messages', () => {
    const value = new Date(2026, 3, 20, 9, 30).getTime()

    expect(formatMessageTimestamp(value, t('zh'), 'zh', now)).toBe('4月20日 09:30')
  })

  it('formats Japanese history with Han year/month/day characters', () => {
    const weekday = new Date(2026, 4, 24, 15, 50).getTime()
    expect(formatMessageTimestamp(weekday, t('jp'), 'jp', now)).toContain('15:50')

    const monthDay = new Date(2026, 3, 20, 9, 30).getTime()
    expect(formatMessageTimestamp(monthDay, t('jp'), 'jp', now)).toBe('4月20日 09:30')

    const yearMonthDay = new Date(2025, 11, 15, 9, 30).getTime()
    expect(formatMessageTimestamp(yearMonthDay, t('jp'), 'jp', now)).toBe('2025年12月15日 09:30')

    expect(formatMessageTimestamp(now - 5 * 60_000, t('jp'), 'jp', now)).toBe('5 分前')
  })

  it('formats Traditional Chinese history with Han year/month/day characters', () => {
    const monthDay = new Date(2026, 3, 20, 9, 30).getTime()
    expect(formatMessageTimestamp(monthDay, t('zh-TW'), 'zh-TW', now)).toBe('4月20日 09:30')

    const yearMonthDay = new Date(2025, 11, 15, 9, 30).getTime()
    expect(formatMessageTimestamp(yearMonthDay, t('zh-TW'), 'zh-TW', now)).toBe('2025年12月15日 09:30')
  })

  it('formats Korean history via Intl (ko-KR) without Han characters', () => {
    const monthDay = new Date(2026, 3, 20, 9, 30).getTime()
    const out = formatMessageTimestamp(monthDay, t('kr'), 'kr', now)
    expect(out).toContain('09:30')
    expect(out).not.toContain('月') // Korean uses 월, never the Han 月

    expect(formatMessageTimestamp(now - 5 * 60_000, t('kr'), 'kr', now)).toBe('5분 전')
  })
})
