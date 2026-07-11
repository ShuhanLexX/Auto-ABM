import { afterEach, describe, expect, test } from 'bun:test'
import { StructuredIO } from '../structuredIO.js'
import {
  clearOAuthTokenCache,
  getClaudeAIOAuthTokens,
} from '../../utils/auth.js'

describe('StructuredIO environment updates', () => {
  const originalOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN

  afterEach(() => {
    if (originalOAuthToken === undefined) {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN
    } else {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = originalOAuthToken
    }
    clearOAuthTokenCache()
  })

  test('clears OAuth token cache when CLAUDE_CODE_OAUTH_TOKEN changes at runtime', async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'stale-env-token'
    clearOAuthTokenCache()
    expect(getClaudeAIOAuthTokens()?.accessToken).toBe('stale-env-token')

    async function* input() {
      yield `${JSON.stringify({
        type: 'update_environment_variables',
        variables: { CLAUDE_CODE_OAUTH_TOKEN: 'fresh-env-token' },
      })}\n`
    }

    const io = new StructuredIO(input())
    for await (const _message of io.structuredInput) {
      // update_environment_variables messages are consumed internally.
    }

    expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('fresh-env-token')
    expect(getClaudeAIOAuthTokens()?.accessToken).toBe('fresh-env-token')
  })
})
