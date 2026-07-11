import { describe, expect, it } from 'vitest'
import { planResize } from './imageCompress'

describe('planResize', () => {
  it('keeps size when within max edge', () => {
    expect(planResize(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
  it('scales down preserving aspect ratio when over max edge', () => {
    expect(planResize(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 })
  })
})
