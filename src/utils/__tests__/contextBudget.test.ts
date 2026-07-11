import { describe, expect, test } from 'bun:test'
import {
  calculateContextBudget,
  calculateContextPercentagesFromTokens,
  getProviderUsageTrust,
  getUsageTokenTotal,
  hasMediaInput,
  shouldIgnoreLowTrustUsage,
} from '../contextBudget.js'

function restoreEnvVar(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

describe('getProviderUsageTrust', () => {
  test('returns high for first-party Anthropic direct usage', () => {
    const originalUseBedrock = process.env.CLAUDE_CODE_USE_BEDROCK
    const originalUseVertex = process.env.CLAUDE_CODE_USE_VERTEX
    const originalUseFoundry = process.env.CLAUDE_CODE_USE_FOUNDRY
    const originalUseAzureOpenAI = process.env.CLAUDE_CODE_USE_AZURE_OPENAI

    try {
      delete process.env.CLAUDE_CODE_USE_BEDROCK
      delete process.env.CLAUDE_CODE_USE_VERTEX
      delete process.env.CLAUDE_CODE_USE_FOUNDRY
      delete process.env.CLAUDE_CODE_USE_AZURE_OPENAI

      expect(getProviderUsageTrust({ isFirstPartyAnthropic: true })).toBe(
        'high',
      )
    } finally {
      restoreEnvVar('CLAUDE_CODE_USE_BEDROCK', originalUseBedrock)
      restoreEnvVar('CLAUDE_CODE_USE_VERTEX', originalUseVertex)
      restoreEnvVar('CLAUDE_CODE_USE_FOUNDRY', originalUseFoundry)
      restoreEnvVar(
        'CLAUDE_CODE_USE_AZURE_OPENAI',
        originalUseAzureOpenAI,
      )
    }
  })

  test('returns low for non-first-party providers even if the Anthropic base URL looks first-party', () => {
    const originalUseBedrock = process.env.CLAUDE_CODE_USE_BEDROCK

    try {
      process.env.CLAUDE_CODE_USE_BEDROCK = '1'

      expect(getProviderUsageTrust({ isFirstPartyAnthropic: true })).toBe('low')
    } finally {
      restoreEnvVar('CLAUDE_CODE_USE_BEDROCK', originalUseBedrock)
    }
  })

  test('returns low for non-first-party Anthropic endpoints', () => {
    expect(getProviderUsageTrust({ isFirstPartyAnthropic: false })).toBe('low')
  })
})

describe('hasMediaInput', () => {
  test('returns true for image file attachments', () => {
    expect(hasMediaInput([
      {
        type: 'attachment',
        attachment: {
          type: 'file',
          content: { type: 'image', source: { type: 'base64', data: 'abc' } },
        },
      },
    ])).toBe(true)
  })

  test('returns true for pdf file attachments', () => {
    expect(hasMediaInput([
      {
        type: 'attachment',
        attachment: {
          type: 'file',
          content: { type: 'pdf', pages: [] },
        },
      },
    ])).toBe(true)
  })

  test('returns true for user content with an image block', () => {
    expect(hasMediaInput([
      {
        type: 'user',
        message: {
          content: [
            { type: 'text', text: 'look at this' },
            { type: 'image', source: { type: 'base64', data: 'abc' } },
          ],
        },
      },
    ])).toBe(true)
  })

  test('returns true for assistant content with a document block', () => {
    expect(hasMediaInput([
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'document', source: { type: 'text', data: 'report' } },
          ],
        },
      },
    ])).toBe(true)
  })

  test('returns false for plain text messages', () => {
    expect(hasMediaInput([
      { type: 'user', message: { content: 'hello' } },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hello back' }] },
      },
    ])).toBe(false)
  })

  test('returns false for text-only teammate mailbox attachments', () => {
    expect(hasMediaInput([
      {
        type: 'attachment',
        attachment: {
          type: 'teammate_mailbox',
          messages: [{ from: 'team-lead', text: 'status?', timestamp: 'now' }],
        },
      },
    ])).toBe(false)
  })

  test('returns false for text-only team context attachments', () => {
    expect(hasMediaInput([
      {
        type: 'attachment',
        attachment: {
          type: 'team_context',
          agentId: 'agent-1',
          agentName: 'worker',
          teamName: 'alpha',
          teamConfigPath: '/tmp/team.json',
          taskListPath: '/tmp/tasks.json',
        },
      },
    ])).toBe(false)
  })

  test('returns false for text-only skill discovery attachments', () => {
    expect(hasMediaInput([
      {
        type: 'attachment',
        attachment: {
          type: 'skill_discovery',
          skills: [{ name: 'foo', description: 'bar' }],
          signal: 'manual',
          source: 'native',
        },
      },
    ])).toBe(false)
  })
})

describe('getUsageTokenTotal', () => {
  test('includes input, cache, and output tokens by default', () => {
    expect(getUsageTokenTotal({
      input_tokens: 20_000,
      cache_creation_input_tokens: 1_000,
      cache_read_input_tokens: 2_000,
      output_tokens: 3_000,
    })).toBe(26_000)
  })

  test('can exclude output tokens', () => {
    expect(getUsageTokenTotal({
      input_tokens: 20_000,
      cache_creation_input_tokens: 1_000,
      cache_read_input_tokens: 2_000,
      output_tokens: 3_000,
    }, { includeOutput: false })).toBe(23_000)
  })
})

describe('shouldIgnoreLowTrustUsage', () => {
  test('ignores suspicious low-trust media usage', () => {
    expect(shouldIgnoreLowTrustUsage({
      usageTrust: 'low',
      hasMediaInput: true,
      usageTokens: 220_000,
      estimatedTokens: 30_000,
      contextWindow: 200_000,
    })).toBe(true)
  })

  test('keeps high-trust usage', () => {
    expect(shouldIgnoreLowTrustUsage({
      usageTrust: 'high',
      hasMediaInput: true,
      usageTokens: 220_000,
      estimatedTokens: 30_000,
      contextWindow: 200_000,
    })).toBe(false)
  })

  test('keeps close-to-estimate usage', () => {
    expect(shouldIgnoreLowTrustUsage({
      usageTrust: 'low',
      hasMediaInput: true,
      usageTokens: 200_000,
      estimatedTokens: 180_000,
      contextWindow: 200_000,
    })).toBe(false)
  })

  test('keeps provider usage when there is no estimate to fall back to', () => {
    expect(shouldIgnoreLowTrustUsage({
      usageTrust: 'low',
      hasMediaInput: true,
      usageTokens: 220_000,
      estimatedTokens: 0,
      contextWindow: 200_000,
    })).toBe(false)
  })
})

describe('calculateContextBudget', () => {
  test('uses larger trusted provider usage', () => {
    expect(calculateContextBudget({
      estimatedTokens: 30_000,
      contextWindow: 200_000,
      currentUsage: {
        input_tokens: 45_000,
        cache_creation_input_tokens: 1_000,
        cache_read_input_tokens: 2_000,
        output_tokens: 3_000,
      },
      usageTrust: 'high',
      hasMediaInput: false,
    })).toEqual({
      usedTokens: 51_000,
      source: 'provider_usage',
      providerUsageTokens: 51_000,
      estimatedTokens: 30_000,
    })
  })

  test('ignores suspicious low-trust media usage', () => {
    expect(calculateContextBudget({
      estimatedTokens: 30_000,
      contextWindow: 200_000,
      currentUsage: {
        input_tokens: 220_000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 1_000,
      },
      usageTrust: 'low',
      hasMediaInput: true,
    })).toEqual({
      usedTokens: 30_000,
      source: 'estimate',
      providerUsageTokens: 221_000,
      estimatedTokens: 30_000,
      ignoredUsageReason: 'low_trust_media_usage',
    })
  })

  test('does not force 100% display for low-trust media usage spikes', () => {
    const budget = calculateContextBudget({
      estimatedTokens: 42_000,
      currentUsage: {
        input_tokens: 500_000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 2_000,
      },
      contextWindow: 200_000,
      usageTrust: 'low',
      hasMediaInput: true,
    })

    expect(calculateContextPercentagesFromTokens(
      budget.usedTokens,
      200_000,
    )).toEqual({
      used: 21,
      remaining: 79,
    })
  })

  test('does not fall back to zero tokens for low-trust media usage spikes', () => {
    const budget = calculateContextBudget({
      estimatedTokens: 0,
      currentUsage: {
        input_tokens: 220_000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 1_000,
      },
      contextWindow: 200_000,
      usageTrust: 'low',
      hasMediaInput: true,
    })

    expect(budget.source).toBe('provider_usage')
    expect(budget.usedTokens).toBe(200_000)
    expect(budget.ignoredUsageReason).toBeUndefined()
  })

  test('clamps to contextWindow', () => {
    expect(calculateContextBudget({
      estimatedTokens: 990_000,
      contextWindow: 1_000_000,
      currentUsage: {
        input_tokens: 995_000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 8_000,
      },
      usageTrust: 'high',
      hasMediaInput: false,
    })).toEqual({
      usedTokens: 1_000_000,
      source: 'provider_usage',
      providerUsageTokens: 1_003_000,
      estimatedTokens: 990_000,
    })
  })
})

describe('calculateContextPercentagesFromTokens', () => {
  test('returns nulls for null usage', () => {
    expect(calculateContextPercentagesFromTokens(null, 200_000)).toEqual({
      used: null,
      remaining: null,
    })
  })

  test('returns nulls for invalid context windows', () => {
    expect(calculateContextPercentagesFromTokens(50_000, 0)).toEqual({
      used: null,
      remaining: null,
    })
    expect(calculateContextPercentagesFromTokens(50_000, -1)).toEqual({
      used: null,
      remaining: null,
    })
  })

  test('rounds and clamps percentages', () => {
    expect(calculateContextPercentagesFromTokens(50_500, 200_000)).toEqual({
      used: 25,
      remaining: 75,
    })
    expect(calculateContextPercentagesFromTokens(220_000, 200_000)).toEqual({
      used: 100,
      remaining: 0,
    })
    expect(calculateContextPercentagesFromTokens(-1_000, 200_000)).toEqual({
      used: 0,
      remaining: 100,
    })
  })
})
