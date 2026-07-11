import { describe, expect, it, beforeEach } from 'vitest'
import { applyEdit } from './popover'

beforeEach(() => { document.body.innerHTML = `<h1 id="t" style="color:rgb(0,0,0)">Old</h1>` })

describe('applyEdit', () => {
  it('applies text + color to the live DOM and returns a diff', () => {
    const el = document.getElementById('t')!
    const diff = applyEdit(el, { text: 'New', color: 'rgb(255,0,0)' })
    expect(el.textContent).toBe('New')
    expect(el.style.color).toBe('rgb(255, 0, 0)')
    expect(diff.text).toEqual({ from: 'Old', to: 'New' })
    expect(diff.color?.to).toBe('rgb(255,0,0)')
  })
})
