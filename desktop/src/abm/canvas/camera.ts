/**
 * Shared 2D camera for the simulation canvas (zoom + pan). Both the grid raster
 * renderer and the WebGL points renderer map world space -> display pixels with
 * the same `Camera`, so pan/zoom/picking behave identically (simulation-canvas.md §6).
 */

export interface Camera {
  scale: number
  x: number
  y: number
}

export const IDENTITY_CAMERA: Camera = { scale: 1, x: 0, y: 0 }

// Wide bounds: researchers need to zoom far out for context and far in for
// single agents; panning itself is unbounded.
const MIN_SCALE = 0.02
const MAX_SCALE = 400

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/** Zoom toward a pixel anchor so the world point under the cursor stays put. */
export function zoomAt(camera: Camera, factor: number, anchorX: number, anchorY: number): Camera {
  const nextScale = clampScale(camera.scale * factor)
  const applied = nextScale / camera.scale
  return {
    scale: nextScale,
    x: anchorX - (anchorX - camera.x) * applied,
    y: anchorY - (anchorY - camera.y) * applied,
  }
}
