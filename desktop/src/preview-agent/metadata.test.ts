import { describe, expect, it, beforeEach, vi } from 'vitest'
import { buildElementMetadata } from './metadata'

beforeEach(() => { document.body.innerHTML = `<h1 id="t" class="a b">Hello World</h1>` })

describe('buildElementMetadata', () => {
  it('captures tag/id/classes/text/selector and styles', () => {
    const el = document.getElementById('t')!
    el.getBoundingClientRect = () => ({ x: 1, y: 2, width: 3, height: 4, top: 2, left: 1, right: 4, bottom: 6, toJSON: () => ({}) }) as DOMRect
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ color: 'rgb(0,0,0)', backgroundColor: 'rgba(0,0,0,0)', opacity: '1', fontFamily: 'serif', fontSize: '40px' } as unknown as CSSStyleDeclaration)
    const m = buildElementMetadata(el)
    expect(m.tag).toBe('h1')
    expect(m.id).toBe('t')
    expect(m.classes).toEqual(['a', 'b'])
    expect(m.text).toBe('Hello World')
    expect(m.boundingBox).toEqual({ x: 1, y: 2, w: 3, h: 4 })
    expect(m.computedStyles.color).toBe('rgb(0,0,0)')
    expect(m.selector).toBe('#t')
  })
})
