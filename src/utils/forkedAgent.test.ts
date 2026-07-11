import { describe, expect, test } from 'bun:test'
import type { PromptCommand } from '../commands.js'
import type { ToolUseContext } from '../Tool.js'
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import { prepareForkedCommandContext } from './forkedAgent.js'

const makeAgent = (agentType: string): AgentDefinition => ({
  agentType,
  whenToUse: `Use ${agentType}`,
  source: 'built-in',
  baseDir: 'built-in',
  getSystemPrompt: () => `${agentType} prompt`,
})

function makeContext(activeAgents: AgentDefinition[]): ToolUseContext {
  return {
    getAppState: () => ({
      toolPermissionContext: {
        alwaysAllowRules: { command: [] },
      },
    }),
    options: {
      agentDefinitions: { activeAgents },
    },
  } as unknown as ToolUseContext
}

describe('prepareForkedCommandContext', () => {
  const command: PromptCommand = {
    type: 'prompt',
    progressMessage: 'running',
    contentLength: 0,
    source: 'builtin',
    getPromptForCommand: async (args) => [{ type: 'text', text: args }],
  }

  test('uses explicit agent and prompt overrides for dynamic forked commands', async () => {
    const prepared = await prepareForkedCommandContext(
      command,
      'debugger fix tests',
      makeContext([makeAgent('general-purpose'), makeAgent('debugger')]),
      {
        agentType: 'debugger',
        promptArgs: 'fix tests',
        requireAgentType: true,
      },
    )

    expect(prepared.baseAgent.agentType).toBe('debugger')
    expect(prepared.skillContent).toBe('fix tests')
  })

  test('throws when a required explicit agent is unavailable', async () => {
    await expect(
      prepareForkedCommandContext(
        command,
        'debugger fix tests',
        makeContext([makeAgent('general-purpose')]),
        {
          agentType: 'debugger',
          promptArgs: 'fix tests',
          requireAgentType: true,
        },
      ),
    ).rejects.toThrow('Agent not available: debugger')
  })
})
