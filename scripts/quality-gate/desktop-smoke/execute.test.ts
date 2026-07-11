import { describe, expect, test } from 'bun:test'
import { buildDesktopSmokeBrowserEnv, resolveDesktopSmokeRuntimeSelection } from './execute'

describe('desktop smoke runtime selection', () => {
  test('lets current-runtime use the desktop default active provider', () => {
    expect(resolveDesktopSmokeRuntimeSelection({
      providerId: null,
      modelId: 'current',
      label: 'current-runtime',
    })).toBeNull()
  })

  test('keeps explicit official and saved provider selections scoped to the session', () => {
    expect(resolveDesktopSmokeRuntimeSelection({
      providerId: null,
      modelId: 'claude-sonnet-4-6',
      label: 'official-sonnet',
    })).toEqual({
      providerId: null,
      modelId: 'claude-sonnet-4-6',
    })

    expect(resolveDesktopSmokeRuntimeSelection({
      providerId: 'provider-a',
      modelId: 'model-a',
      label: 'provider-a-main',
    })).toEqual({
      providerId: 'provider-a',
      modelId: 'model-a',
    })
  })
})

describe('desktop smoke browser environment', () => {
  test('scopes agent-browser to a temporary session and bypasses loopback proxy traffic', () => {
    expect(buildDesktopSmokeBrowserEnv('session-a', '/tmp/profile-a', {
      NO_PROXY: 'internal.example.com',
    })).toEqual({
      AGENT_BROWSER_SESSION: 'session-a',
      AGENT_BROWSER_PROFILE: '/tmp/profile-a',
      NO_PROXY: 'internal.example.com,127.0.0.1,localhost,::1,[::1]',
      no_proxy: 'internal.example.com,127.0.0.1,localhost,::1,[::1]',
    })
  })

  test('deduplicates existing lowercase no_proxy loopback entries', () => {
    expect(buildDesktopSmokeBrowserEnv('session-b', '/tmp/profile-b', {
      no_proxy: 'localhost,127.0.0.1',
    })).toEqual({
      AGENT_BROWSER_SESSION: 'session-b',
      AGENT_BROWSER_PROFILE: '/tmp/profile-b',
      NO_PROXY: 'localhost,127.0.0.1,::1,[::1]',
      no_proxy: 'localhost,127.0.0.1,::1,[::1]',
    })
  })
})
