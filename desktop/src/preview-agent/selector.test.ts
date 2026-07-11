import { describe, expect, it, beforeEach } from 'vitest'
import { buildSelector, buildNthPath } from './selector'

beforeEach(() => { document.body.innerHTML = `
  <main><section><h1 id="title">A</h1><p>x</p><p>y</p></section></main>` })

describe('buildSelector', () => {
  it('uses id when present', () => {
    expect(buildSelector(document.getElementById('title')!)).toBe('#title')
  })
  it('uses nth-of-type for ambiguous siblings, stopping at nearest id', () => {
    const secondP = document.querySelectorAll('p')[1]!
    expect(buildSelector(secondP)).toBe('main > section > p:nth-of-type(2)')
  })
})

describe('buildNthPath', () => {
  it('builds a child-index path from root', () => {
    const secondP = document.querySelectorAll('p')[1]!
    expect(buildNthPath(secondP)).toMatch(/p:nth-child\(3\)$/)
  })
})
