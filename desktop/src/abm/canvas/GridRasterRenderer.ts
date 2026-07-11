/**
 * Grid raster renderer — the NetLogo patch approach (simulation-canvas.md §2).
 *
 * State -> palette -> RGBA is written into an ImageData sized to the grid, blitted
 * to a detached offscreen canvas once, then `drawImage`-scaled to the display with
 * smoothing off (crisp cells). A single putImageData keeps even ~1e6 cells cheap.
 */

import { IDENTITY_CAMERA, type Camera } from './camera'

export interface GridCell {
  x: number
  y: number
}

export class GridRasterRenderer {
  private readonly offscreen: HTMLCanvasElement
  private readonly offCtx: CanvasRenderingContext2D | null
  private readonly image: ImageData | null
  private readonly pixels: Uint32Array | null
  // Last applied placement (display px), reused for pixel -> cell picking.
  private placement = { scale: 1, originX: 0, originY: 0 }

  constructor(
    private readonly display: HTMLCanvasElement,
    private readonly width: number,
    private readonly height: number,
  ) {
    this.offscreen = document.createElement('canvas')
    this.offscreen.width = Math.max(1, width)
    this.offscreen.height = Math.max(1, height)
    this.offCtx = this.offscreen.getContext('2d')
    if (this.offCtx) {
      this.image = this.offCtx.createImageData(this.offscreen.width, this.offscreen.height)
      this.pixels = new Uint32Array(this.image.data.buffer)
    } else {
      this.image = null
      this.pixels = null
    }
  }

  render(state: Uint8Array, lut: Uint32Array, camera: Camera = IDENTITY_CAMERA): void {
    const ctx = this.display.getContext('2d')
    if (!ctx || !this.offCtx || !this.image || !this.pixels) return

    const limit = Math.min(state.length, this.pixels.length)
    for (let i = 0; i < limit; i++) this.pixels[i] = lut[state[i]!]!
    this.offCtx.putImageData(this.image, 0, 0)

    const dw = this.display.width
    const dh = this.display.height
    ctx.clearRect(0, 0, dw, dh)
    ctx.imageSmoothingEnabled = false

    const fit = Math.min(dw / this.width, dh / this.height)
    const scale = fit * camera.scale
    const drawW = this.width * scale
    const drawH = this.height * scale
    const originX = (dw - drawW) / 2 + camera.x
    const originY = (dh - drawH) / 2 + camera.y
    this.placement = { scale, originX, originY }

    ctx.drawImage(this.offscreen, 0, 0, this.width, this.height, originX, originY, drawW, drawH)
  }

  /** Map a display-space pixel back to a grid cell (null if outside the grid). */
  pickCell(px: number, py: number): GridCell | null {
    const { scale, originX, originY } = this.placement
    if (scale <= 0) return null
    const x = Math.floor((px - originX) / scale)
    const y = Math.floor((py - originY) / scale)
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null
    return { x, y }
  }
}
