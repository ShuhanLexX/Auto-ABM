import { describe, expect, it } from 'vitest'
import {
  allowedAbmTools,
  buildAbmContext,
  formatAbmReferencePrompt,
  getAbmLanguageInstruction,
  getAbmModeInstruction,
  isAbmMutatingTool,
  type AbmReference,
} from './abmReferences'

describe('buildAbmContext', () => {
  it('binds the active simulation by default when no references are given', () => {
    const ctx = buildAbmContext({ activeSimId: 'sim-1' })
    expect(ctx.boundByDefault).toBe(true)
    expect(ctx.references).toEqual([{ kind: 'simulation', id: 'sim-1' }])
  })

  it('lets explicit references override the default binding', () => {
    const refs: AbmReference[] = [
      { kind: 'run', id: 'run-9' },
      { kind: 'trace-interval', runId: 'run-9', from: 0, to: 20 },
    ]
    const ctx = buildAbmContext({ activeSimId: 'sim-1', references: refs })
    expect(ctx.boundByDefault).toBe(false)
    expect(ctx.references).toEqual(refs)
  })

  it('produces no references when nothing is active or referenced', () => {
    const ctx = buildAbmContext({ activeSimId: null })
    expect(ctx.references).toEqual([])
    expect(ctx.boundByDefault).toBe(false)
  })

  it('dedupes identical references', () => {
    const ctx = buildAbmContext({
      activeSimId: null,
      references: [
        { kind: 'simulation', id: 'a' },
        { kind: 'simulation', id: 'a' },
      ],
    })
    expect(ctx.references).toHaveLength(1)
  })
})

describe('formatAbmReferencePrompt', () => {
  it('renders a structured block including ids and the default-binding note', () => {
    const prompt = formatAbmReferencePrompt(buildAbmContext({ activeSimId: 'sim-1' }))
    expect(prompt).toContain('ABM context:')
    expect(prompt).toContain('id=sim-1')
    expect(prompt).toContain('bound to the active Simulation by default')
  })

  it('renders a trace interval with its tick bounds', () => {
    const prompt = formatAbmReferencePrompt(
      buildAbmContext({ activeSimId: null, references: [{ kind: 'trace-interval', runId: 'run-9', from: 3, to: 8 }] }),
    )
    expect(prompt).toContain('run=run-9')
    expect(prompt).toContain('3')
    expect(prompt).toContain('8')
  })

  it('scopes the conversation to the active research question even without a simulation', () => {
    const prompt = formatAbmReferencePrompt(buildAbmContext({ activeSimId: null, activeProjectId: 'project-1' }))
    expect(prompt).toContain('ABM context:')
    expect(prompt).toContain('project id=project-1')
    expect(prompt).toContain('separate studies')
  })

  it('returns an empty string when there is nothing to attach', () => {
    expect(formatAbmReferencePrompt(buildAbmContext({ activeSimId: null }))).toBe('')
  })
})

describe('getAbmLanguageInstruction', () => {
  it('defaults zh locale to chinese when response language is unset', () => {
    expect(getAbmLanguageInstruction('zh', '')).toContain('Preferred response language: chinese')
    expect(getAbmLanguageInstruction('zh', '')).toContain('AskUserQuestion')
  })

  it('defaults English UI to English while matching the latest user language', () => {
    const text = getAbmLanguageInstruction('en', '')
    expect(text).toContain('Preferred response language: english')
    expect(text).toContain('If the latest user message is clearly English')
    expect(text).toContain('Do not emit Chinese characters')
  })

  it('uses the UI locale instead of stale global response-language overrides', () => {
    expect(getAbmLanguageInstruction('en', 'chinese')).toContain('Preferred response language: english')
    expect(getAbmLanguageInstruction('zh', 'english')).toContain('Preferred response language: chinese')
  })
})

describe('dialogue-mode tool gate', () => {
  const tools = ['abm_explain_interval', 'abm_run', 'abm_stop_run', 'abm_edit_model', 'abm_propose_simulations', 'abm_update_odd', 'Read']

  it('flags the mutating ABM tools', () => {
    expect(isAbmMutatingTool('abm_run')).toBe(true)
    expect(isAbmMutatingTool('abm_adopt_simulation')).toBe(true)
    expect(isAbmMutatingTool('abm_edit_model')).toBe(true)
    expect(isAbmMutatingTool('abm_explain_interval')).toBe(false)
  })

  it('research mode keeps every tool', () => {
    expect(allowedAbmTools('research', tools)).toEqual(tools)
  })

  it('dialogue mode strips all mutating ABM tools but keeps explain/query', () => {
    const allowed = allowedAbmTools('dialogue', tools)
    expect(allowed).toContain('abm_explain_interval')
    expect(allowed).toContain('Read')
    expect(allowed).not.toContain('abm_run')
    expect(allowed).not.toContain('abm_stop_run')
    expect(allowed).not.toContain('abm_edit_model')
    expect(allowed).not.toContain('abm_propose_simulations')
    expect(allowed).not.toContain('abm_adopt_simulation')
    expect(allowed).not.toContain('abm_update_odd')
  })

  it('autonomous mode keeps ABM tools available', () => {
    expect(allowedAbmTools('autonomous', tools)).toEqual(tools)
  })
})

describe('getAbmModeInstruction', () => {
  it('explains the autonomous workflow to the model', () => {
    const text = getAbmModeInstruction('autonomous')
    expect(text).toContain('Autonomous exploration')
    expect(text).toContain('Avoid routine AskUserQuestion interruptions')
    expect(text).toContain('validate')
    expect(text).toContain('experiment')
  })
})
