import { describe, expect, test } from 'bun:test'
import agentCommand, { parseAgentCommandArgs } from './agent.js'

describe('/agent command', () => {
  test('parses an agent type and prompt', () => {
    expect(parseAgentCommandArgs('debugger fix the failing tests')).toEqual({
      agentType: 'debugger',
      prompt: 'fix the failing tests',
    })
  })

  test('requires both an agent type and prompt', () => {
    expect(parseAgentCommandArgs('')).toBeNull()
    expect(parseAgentCommandArgs('debugger')).toBeNull()
  })

  test('instructs the normal chat loop to use the selected agent', async () => {
    await expect(agentCommand.getPromptForCommand('debugger inspect auth', {} as never)).resolves.toEqual([
      {
        type: 'text',
        text: [
          'Use the Agent tool with subagent_type "debugger" to handle this request.',
          'Pass this exact prompt to that agent:',
          '',
          'inspect auth',
        ].join('\n'),
      },
    ])
  })

  test('shows usage when building a prompt without an agent prompt', async () => {
    await expect(agentCommand.getPromptForCommand('debugger', {} as never)).rejects.toThrow(
      'Usage: /agent <agent> <prompt>',
    )
  })
})
