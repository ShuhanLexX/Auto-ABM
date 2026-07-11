import { describe, expect, it } from 'vitest'
import { classifyOverflow } from './longContentGuard'

describe('classifyOverflow', () => {
  it('leaves short, normal content untouched', () => {
    expect(classifyOverflow('好的，我来帮你分析这个模型。')).toBeNull()
  })

  it('flags a DSML tool-call-as-text dump regardless of length', () => {
    const dump = '好的\n[ DSML | tool_calls ]\n< [ DSML | invoke name="abm_propose_simulations">'
    expect(classifyOverflow(dump)?.reason).toBe('tool-dump')
  })

  it('flags a leaked proposals parameter blob', () => {
    const dump = 'parameter name="proposals" string="false">[{"id":"wind-fire"}]'
    expect(classifyOverflow(dump)?.reason).toBe('tool-dump')
  })

  it('flags a generic leaked invoke call', () => {
    expect(classifyOverflow('< [ invoke name="some_tool">')?.reason).toBe('tool-dump')
  })

  it('flags very long content as long (not tool-dump)', () => {
    const long = 'a'.repeat(7000)
    expect(classifyOverflow(long)).toEqual({ reason: 'long', chars: 7000 })
  })
})
