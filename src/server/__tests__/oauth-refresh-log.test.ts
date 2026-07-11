import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import {
  isExpectedAuthRefreshFailure,
  logTokenRefreshFailure,
} from '../services/oauthRefreshLog.js'

describe('isExpectedAuthRefreshFailure', () => {
  test.each([
    'refresh revoked',
    '401 Unauthorized',
    'Request failed with status code 403',
    'OpenAI token refresh failed: 403: {"error":"forbidden"}',
    'invalid_grant',
    'Forbidden',
  ])('treats %p as an expected re-auth signal', (message) => {
    expect(isExpectedAuthRefreshFailure(new Error(message))).toBe(true)
  })

  test.each([
    'Failed to fetch',
    'network timeout',
    'Request failed with status code 500',
    'ECONNREFUSED',
  ])('treats %p as an unexpected failure', (message) => {
    expect(isExpectedAuthRefreshFailure(new Error(message))).toBe(false)
  })

  test('handles non-Error values without throwing', () => {
    expect(isExpectedAuthRefreshFailure('401 Unauthorized')).toBe(true)
    expect(isExpectedAuthRefreshFailure(null)).toBe(false)
    expect(isExpectedAuthRefreshFailure(undefined)).toBe(false)
  })
})

describe('logTokenRefreshFailure', () => {
  let errorSpy: ReturnType<typeof spyOn>
  let warnSpy: ReturnType<typeof spyOn>
  let debugSpy: ReturnType<typeof spyOn>

  function install() {
    errorSpy = spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
    debugSpy = spyOn(console, 'debug').mockImplementation(() => {})
  }

  afterEach(() => {
    errorSpy?.mockRestore()
    warnSpy?.mockRestore()
    debugSpy?.mockRestore()
  })

  test('never logs an expected expiry as console.error (would become a red ERROR)', () => {
    install()
    logTokenRefreshFailure('[Svc]', new Error('refresh revoked'))
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(debugSpy).toHaveBeenCalledTimes(1)
  })

  test('logs an unexpected failure as a warn, never an error', () => {
    install()
    logTokenRefreshFailure('[Svc]', new Error('Failed to fetch'))
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(debugSpy).not.toHaveBeenCalled()
  })
})
