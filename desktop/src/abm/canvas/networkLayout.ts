/**
 * Client-side network layouts for the simulation canvas.
 *
 * The kernel emits a spring layout for small graphs (<=400 nodes) and a random
 * layout above that threshold — the random one reads as a filled square once a
 * few hundred nodes fill the unit box. To keep large networks readable we can
 * recompute positions on the client without touching the deterministic Run: the
 * layout is purely presentational (it never feeds back into simulation state).
 *
 * Every layout returns node positions packed as [x0, y0, x1, y1, ...] inside the
 * unit square [0,1]^2, matching what PointsGLRenderer expects. Positions are
 * derived deterministically from the (deterministic) kernel `base` layout, so a
 * given Run always renders the same way.
 */

export type NetworkLayoutMode = 'default' | 'force' | 'circle' | 'grid'

export const NETWORK_LAYOUT_MODES: NetworkLayoutMode[] = ['default', 'force', 'circle', 'grid']

// Above this node count a client force pass is too heavy for the main thread;
// fall back to the circle layout, which still beats the random square.
const FORCE_MAX_NODES = 2500

// Fraction of the unit box kept as an empty margin so nodes never touch the edge.
const MARGIN = 0.06

/**
 * Pick a sensible default layout for a freshly loaded network. Small graphs keep
 * the kernel spring layout (already tidy); mid-size graphs — where the kernel
 * would have fallen back to a random square — get a client force layout.
 */
export function defaultLayoutMode(nodeCount: number): NetworkLayoutMode {
  if (nodeCount > 400 && nodeCount <= FORCE_MAX_NODES) return 'force'
  return 'default'
}

export function computeNetworkLayout(
  mode: NetworkLayoutMode,
  base: Float32Array,
  edges: Uint32Array,
  nodeCount: number,
): Float32Array {
  if (nodeCount <= 0) return base
  switch (mode) {
    case 'circle':
      return circleLayout(nodeCount)
    case 'grid':
      return gridLayout(nodeCount)
    case 'force':
      return forceLayout(base, edges, nodeCount)
    case 'default':
    default:
      return base
  }
}

function circleLayout(nodeCount: number): Float32Array {
  const positions = new Float32Array(nodeCount * 2)
  const radius = 0.5 - MARGIN
  for (let i = 0; i < nodeCount; i += 1) {
    const angle = (i / nodeCount) * Math.PI * 2 - Math.PI / 2
    positions[i * 2] = 0.5 + radius * Math.cos(angle)
    positions[i * 2 + 1] = 0.5 + radius * Math.sin(angle)
  }
  return positions
}

function gridLayout(nodeCount: number): Float32Array {
  const positions = new Float32Array(nodeCount * 2)
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodeCount)))
  const rows = Math.max(1, Math.ceil(nodeCount / cols))
  const span = 1 - MARGIN * 2
  const stepX = cols > 1 ? span / (cols - 1) : 0
  const stepY = rows > 1 ? span / (rows - 1) : 0
  for (let i = 0; i < nodeCount; i += 1) {
    const col = i % cols
    const row = Math.floor(i / cols)
    positions[i * 2] = cols > 1 ? MARGIN + col * stepX : 0.5
    positions[i * 2 + 1] = rows > 1 ? MARGIN + row * stepY : 0.5
  }
  return positions
}

/**
 * Fruchterman–Reingold force-directed layout, seeded from the kernel `base`
 * positions (or a circle when the base is missing) so it stays deterministic and
 * settles quickly. Iteration budget scales down as the graph grows to keep the
 * one-time cost bounded.
 */
function forceLayout(base: Float32Array, edges: Uint32Array, nodeCount: number): Float32Array {
  if (nodeCount > FORCE_MAX_NODES) return circleLayout(nodeCount)

  const xs = new Float64Array(nodeCount)
  const ys = new Float64Array(nodeCount)
  const seed = base.length >= nodeCount * 2 ? base : circleLayout(nodeCount)
  for (let i = 0; i < nodeCount; i += 1) {
    // Nudge off any exact overlaps so repulsion has a direction to push along.
    xs[i] = (seed[i * 2] ?? 0.5) + jitter(i, 1) * 1e-3
    ys[i] = (seed[i * 2 + 1] ?? 0.5) + jitter(i, 2) * 1e-3
  }

  const k = Math.sqrt(1 / nodeCount)
  const iterations = nodeCount <= 200 ? 300 : nodeCount <= 800 ? 160 : 90
  const dispX = new Float64Array(nodeCount)
  const dispY = new Float64Array(nodeCount)
  let temperature = 0.1

  for (let iter = 0; iter < iterations; iter += 1) {
    dispX.fill(0)
    dispY.fill(0)

    for (let a = 0; a < nodeCount; a += 1) {
      for (let b = a + 1; b < nodeCount; b += 1) {
        let dx = xs[a]! - xs[b]!
        let dy = ys[a]! - ys[b]!
        let distSq = dx * dx + dy * dy
        if (distSq < 1e-9) {
          dx = jitter(a * 31 + b, 1) * 1e-4
          dy = jitter(a * 31 + b, 2) * 1e-4
          distSq = dx * dx + dy * dy + 1e-9
        }
        const dist = Math.sqrt(distSq)
        const repulse = (k * k) / dist
        const fx = (dx / dist) * repulse
        const fy = (dy / dist) * repulse
        dispX[a]! += fx
        dispY[a]! += fy
        dispX[b]! -= fx
        dispY[b]! -= fy
      }
    }

    for (let e = 0; e + 1 < edges.length; e += 2) {
      const a = edges[e]!
      const b = edges[e + 1]!
      if (a >= nodeCount || b >= nodeCount || a === b) continue
      const dx = xs[a]! - xs[b]!
      const dy = ys[a]! - ys[b]!
      const dist = Math.sqrt(dx * dx + dy * dy) || 1e-6
      const attract = (dist * dist) / k
      const fx = (dx / dist) * attract
      const fy = (dy / dist) * attract
      dispX[a]! -= fx
      dispY[a]! -= fy
      dispX[b]! += fx
      dispY[b]! += fy
    }

    for (let i = 0; i < nodeCount; i += 1) {
      const len = Math.sqrt(dispX[i]! * dispX[i]! + dispY[i]! * dispY[i]!) || 1e-9
      const capped = Math.min(len, temperature)
      xs[i]! += (dispX[i]! / len) * capped
      ys[i]! += (dispY[i]! / len) * capped
    }
    temperature = Math.max(0.002, temperature * 0.965)
  }

  return normalize(xs, ys, nodeCount)
}

/** Fit the computed coordinates into the unit box with a fixed margin. */
function normalize(xs: Float64Array, ys: Float64Array, nodeCount: number): Float32Array {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < nodeCount; i += 1) {
    if (xs[i]! < minX) minX = xs[i]!
    if (xs[i]! > maxX) maxX = xs[i]!
    if (ys[i]! < minY) minY = ys[i]!
    if (ys[i]! > maxY) maxY = ys[i]!
  }
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1
  const span = Math.max(spanX, spanY)
  const usable = 1 - MARGIN * 2
  const offsetX = MARGIN + (usable - (spanX / span) * usable) / 2
  const offsetY = MARGIN + (usable - (spanY / span) * usable) / 2

  const positions = new Float32Array(nodeCount * 2)
  for (let i = 0; i < nodeCount; i += 1) {
    positions[i * 2] = offsetX + ((xs[i]! - minX) / span) * usable
    positions[i * 2 + 1] = offsetY + ((ys[i]! - minY) / span) * usable
  }
  return positions
}

/** Deterministic pseudo-random offset in [-0.5, 0.5] used to break symmetry. */
function jitter(index: number, salt: number): number {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453
  return (x - Math.floor(x)) - 0.5
}
