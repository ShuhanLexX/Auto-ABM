import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import type { Command } from '../commands.js'
import { AGENT_TOOL_NAME } from '../tools/AgentTool/constants.js'
import { MalformedCommandError } from '../utils/errors.js'

export type ParsedAgentCommandArgs = {
  agentType: string
  prompt: string
}

export function parseAgentCommandArgs(args: string): ParsedAgentCommandArgs | null {
  const trimmed = args.trim()
  if (!trimmed) return null

  const match = /^(\S+)(?:\s+([\s\S]+))?$/.exec(trimmed)
  const agentType = match?.[1]?.trim()
  const prompt = match?.[2]?.trim()
  if (!agentType || !prompt) return null

  return { agentType, prompt }
}

const agentCommand: Command = {
  type: 'prompt',
  name: 'agent',
  description: 'Run a prompt with a selected Agent',
  argumentHint: '<agent> <prompt>',
  progressMessage: 'running agent',
  contentLength: 0,
  source: 'builtin',
  allowedTools: [AGENT_TOOL_NAME],
  async getPromptForCommand(args): Promise<ContentBlockParam[]> {
    const parsed = parseAgentCommandArgs(args)
    if (!parsed) {
      throw new MalformedCommandError('Usage: /agent <agent> <prompt>')
    }

    return [
      {
        type: 'text',
        text: [
          `Use the ${AGENT_TOOL_NAME} tool with subagent_type "${parsed.agentType}" to handle this request.`,
          'Pass this exact prompt to that agent:',
          '',
          parsed.prompt,
        ].join('\n'),
      },
    ]
  },
}

export default agentCommand
