import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createPicker } from './picker'

beforeEach(() => { document.body.innerHTML = `<main><section><h1 id="t">A</h1></section></main>` })

describe('createPicker', () => {
  it('selects an element and exposes current selection', () => {
    const onSelect = vi.fn()
    const picker = createPicker({ onSelect })
    picker.enter()
    picker.hover(document.getElementById('t')!)
    picker.select()
    expect(picker.current()?.id).toBe('t')
    expect(onSelect).toHaveBeenCalledWith(document.getElementById('t'))
  })
  it('climb/descend move the current selection', () => {
    const picker = createPicker({ onSelect: vi.fn() })
    picker.enter(); picker.hover(document.getElementById('t')!); picker.select()
    picker.climb()
    expect(picker.current()?.tagName.toLowerCase()).toBe('section')
    picker.descend()
    expect(picker.current()?.id).toBe('t')
  })
  it('exit clears overlay and selection', () => {
    const picker = createPicker({ onSelect: vi.fn() })
    picker.enter(); picker.hover(document.getElementById('t')!); picker.select(); picker.exit()
    expect(picker.current()).toBeNull()
  })
})
