import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { snapshotEditableStyles, computeChange, createEditBubble, type EditableSnapshot } from './editBubble'

beforeEach(() => { document.body.innerHTML = `<h1 id="t" style="color:rgb(0,0,0)">Old</h1>` })
afterEach(() => { document.documentElement.querySelectorAll('div').forEach((d) => { if (d.shadowRoot) d.remove() }) })

const $ = (b: { host: HTMLElement }, sel: string) => b.host.shadowRoot!.querySelector(sel) as HTMLInputElement & HTMLButtonElement

describe('computeChange', () => {
  it('returns only changed fields with from/to', () => {
    const orig: EditableSnapshot = { text: 'A', color: 'c', background: 'b', opacity: '1', fontFamily: 'f' }
    const cur: EditableSnapshot = { ...orig, text: 'B' }
    expect(computeChange(orig, cur)).toEqual({ text: { from: 'A', to: 'B' } })
  })
})

describe('snapshotEditableStyles', () => {
  it('captures text + relevant computed styles', () => {
    const el = document.getElementById('t')!
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ color: 'rgb(0,0,0)', backgroundColor: 'rgba(0,0,0,0)', opacity: '1', fontFamily: 'serif' } as unknown as CSSStyleDeclaration)
    const s = snapshotEditableStyles(el)
    expect(s.text).toBe('Old')
    expect(s.color).toBe('rgb(0,0,0)')
    expect(s.fontFamily).toBe('serif')
  })
})

describe('createEditBubble', () => {
  it('prefills the text field and live-applies edits to the element', () => {
    const el = document.getElementById('t')!
    const bubble = createEditBubble(el, { onConfirm: vi.fn(), onCancel: vi.fn() })
    const textInput = $(bubble, '[data-field="text"]')
    expect(textInput.value).toBe('Old')
    textInput.value = 'New'
    textInput.dispatchEvent(new Event('input'))
    expect(el.textContent).toBe('New')
    bubble.destroy()
  })

  it('confirm bundles the diff + description', () => {
    const el = document.getElementById('t')!
    const onConfirm = vi.fn()
    const bubble = createEditBubble(el, { onConfirm, onCancel: vi.fn() })
    const textInput = $(bubble, '[data-field="text"]'); textInput.value = 'New'; textInput.dispatchEvent(new Event('input'))
    const descInput = $(bubble, '[data-field="description"]'); descInput.value = '改积极点'; descInput.dispatchEvent(new Event('input'))
    $(bubble, '[data-action="confirm"]').click()
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ text: { from: 'Old', to: 'New' }, description: '改积极点' }))
    bubble.destroy()
  })

  it('cancel reverts live edits and fires onCancel', () => {
    const el = document.getElementById('t')!
    const onCancel = vi.fn(); const onConfirm = vi.fn()
    const bubble = createEditBubble(el, { onConfirm, onCancel })
    const textInput = $(bubble, '[data-field="text"]'); textInput.value = 'New'; textInput.dispatchEvent(new Event('input'))
    expect(el.textContent).toBe('New')
    $(bubble, '[data-action="cancel"]').click()
    expect(el.textContent).toBe('Old')   // reverted
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
    bubble.destroy()
  })
})
