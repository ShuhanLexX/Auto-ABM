import { memo, useEffect, useMemo, useRef } from 'react'
import type { AbmCaseStudy } from '../researchAssets'
import type { AbmSimulation, ModelConfig } from '../types'
import { colorHexForPaletteValue } from '../canvas/paletteLUT'
import { isRecord, readAgentCounts, readModelId, readRecords, readString } from '../modelIntrospection'

type PreviewKind = 'grid' | 'network' | 'hybrid'

interface SimulationPreviewProps {
  simulation?: AbmSimulation | null
  study?: AbmCaseStudy | null
  compact?: boolean
}

export interface PreviewSpec {
  kind: PreviewKind
  modelId: string
  palette: Array<{ label: string; color: string }>
  paletteLabels: string[]
  visualCount: number
  countLabel: string
  width: number
  height: number
  params: Record<string, unknown>
}

const SNAPSHOT_GRID_COLS = 72
const SNAPSHOT_GRID_ROWS = 42
const MAX_PREVIEW_NODES = 240

export const SimulationPreview = memo(function SimulationPreview({ simulation, study, compact = false }: SimulationPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const spec = useMemo(() => buildPreviewSpec(simulation, study), [simulation, study])
  const specKey = useMemo(() => previewSpecKey(spec), [spec])
  const specRef = useRef(spec)
  const seed = useMemo(
    () => hashString(`${spec.modelId}:${simulation?.id ?? study?.id ?? 'preview'}`),
    [simulation?.id, spec.modelId, study?.id],
  )

  useEffect(() => {
    specRef.current = spec
  }, [spec, specKey])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const render = () => drawWorkbenchSnapshot(canvas, specRef.current, seed)
    render()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(render)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [seed, specKey])

  return (
    <div
      data-testid="simulation-preview"
      data-preview-kind={spec.kind}
      aria-label="仿真画布快照"
      className={[
        'relative overflow-hidden rounded-[10px] border border-white/10 bg-[#05070b] shadow-inner',
        compact ? 'h-[96px]' : 'h-[126px]',
      ].join(' ')}
    >
      <canvas
        ref={canvasRef}
        data-testid="simulation-preview-canvas"
        className="absolute inset-0 h-full w-full"
      />
      <div className="pointer-events-none absolute left-2 top-2 rounded-[7px] border border-white/10 bg-white/80 px-2 py-1 text-[10px] font-medium text-slate-700 shadow-sm backdrop-blur">
        {spec.countLabel}
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-16px)] gap-1.5">
        {spec.palette.slice(0, 4).map((entry) => (
          <span
            key={entry.label}
            className="inline-flex min-w-0 items-center gap-1 rounded-[6px] bg-white/85 px-1.5 py-0.5 text-[9px] text-slate-700 shadow-sm backdrop-blur"
          >
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: entry.color }} />
            <span className="truncate">{entry.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
})

function drawWorkbenchSnapshot(canvas: HTMLCanvasElement, spec: PreviewSpec, seed: number): void {
  const userAgent = canvas.ownerDocument.defaultView?.navigator.userAgent ?? ''
  if (userAgent.includes('jsdom')) return
  const rect = canvas.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width || 360))
  const height = Math.max(1, Math.round(rect.height || 126))
  const dpr = typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1
  const targetWidth = Math.round(width * dpr)
  const targetHeight = Math.round(height * dpr)
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth
    canvas.height = targetHeight
  }
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = canvas.getContext('2d')
  } catch {
    return
  }
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawBlackGrid(ctx, width, height)
  // A per-case spatial motif so two cases sharing a template (e.g. two Schelling
  // or two diffusion cases) don't render the same snapshot: the motif re-shapes
  // where activity concentrates (front / corner / twin hotspots / rings, and the
  // network layout) while staying deterministic for a given case seed.
  const motif = seed % 4
  if (spec.kind === 'network') {
    drawNetworkSnapshot(ctx, spec, seed, width, height, 1, motif)
  } else if (spec.kind === 'hybrid') {
    drawGridSnapshot(ctx, spec, seed, width, height, 0.42, motif)
    drawNetworkSnapshot(ctx, spec, seed + 103, width, height, 0.7, (motif + 2) % 4)
  } else {
    drawGridSnapshot(ctx, spec, seed, width, height, 1, motif)
  }
}

function drawBlackGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#05070b'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = 'rgba(148,163,184,0.22)'
  ctx.lineWidth = 1
  for (let x = 0.5; x < width; x += 14) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = 0.5; y < height; y += 14) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
}

function drawGridSnapshot(
  ctx: CanvasRenderingContext2D,
  spec: PreviewSpec,
  seed: number,
  width: number,
  height: number,
  opacity: number,
  motif: number,
): void {
  const cols = Math.min(SNAPSHOT_GRID_COLS, Math.max(24, Math.round(Math.sqrt(spec.width * spec.height))))
  const rows = Math.min(SNAPSHOT_GRID_ROWS, Math.max(14, Math.round(cols * height / Math.max(1, width))))
  const cell = Math.max(2, Math.min(width / cols, height / rows))
  const offsetX = Math.max(0, (width - cols * cell) / 2)
  const offsetY = Math.max(0, (height - rows * cell) / 2)
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col
      const label = gridStateForIndex(spec, seed, index, cols, rows, motif)
      if (!label) continue
      ctx.globalAlpha = opacity
      ctx.fillStyle = colorForLabel(label, spec)
      ctx.fillRect(offsetX + col * cell, offsetY + row * cell, Math.ceil(cell), Math.ceil(cell))
    }
  }
  ctx.globalAlpha = 1
}

function drawNetworkSnapshot(
  ctx: CanvasRenderingContext2D,
  spec: PreviewSpec,
  seed: number,
  width: number,
  height: number,
  opacity = 1,
  motif = 0,
): void {
  const nodeCount = Math.min(MAX_PREVIEW_NODES, Math.max(36, Math.round(Math.sqrt(spec.visualCount) * 11)))
  const nodes = Array.from({ length: nodeCount }, (_, index) => {
    const { x, y } = networkNodePosition(motif, index, nodeCount, seed, width, height)
    return {
      id: index,
      x,
      y,
      label: networkStateForIndex(spec, seed, index),
      shape: (index + seed) % 5,
      size: 2.1 + seeded(seed + index * 31) * 3.4,
    }
  })

  ctx.globalAlpha = 0.5 * opacity
  ctx.strokeStyle = 'rgba(203,213,225,0.78)'
  ctx.lineWidth = 0.75
  for (const node of nodes) {
    const edgeCount = spec.kind === 'hybrid' ? 1 : 2
    for (let offset = 1; offset <= edgeCount; offset += 1) {
      const target = nodes[(node.id + offset + Math.floor(seeded(seed + node.id * offset) * 21)) % nodes.length]
      if (!target) continue
      ctx.beginPath()
      ctx.moveTo(node.x, node.y)
      ctx.lineTo(target.x, target.y)
      ctx.stroke()
    }
  }

  for (const node of nodes) {
    ctx.globalAlpha = opacity
    ctx.fillStyle = colorForLabel(node.label, spec)
    ctx.strokeStyle = 'rgba(255,255,255,0.32)'
    ctx.lineWidth = 0.7
    drawNodeShape(ctx, node.x, node.y, node.size, node.shape)
  }
  ctx.globalAlpha = 1
}

function drawNodeShape(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, shape: number): void {
  ctx.beginPath()
  if (shape === 1) {
    ctx.rect(x - size, y - size, size * 2, size * 2)
  } else if (shape === 2) {
    ctx.moveTo(x, y - size * 1.25)
    ctx.lineTo(x + size * 1.15, y + size)
    ctx.lineTo(x - size * 1.15, y + size)
    ctx.closePath()
  } else if (shape === 3) {
    ctx.moveTo(x, y - size * 1.3)
    ctx.lineTo(x + size * 1.3, y)
    ctx.lineTo(x, y + size * 1.3)
    ctx.lineTo(x - size * 1.3, y)
    ctx.closePath()
  } else {
    ctx.arc(x, y, size, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.stroke()
}

function buildPreviewSpec(simulation?: AbmSimulation | null, study?: AbmCaseStudy | null): PreviewSpec {
  const config = isRecord(simulation?.config) ? simulation?.config : undefined
  const modelId = config
    ? readModelId(config, simulation?.name)
    : study?.id ?? simulation?.name ?? 'case'
  const kind = inferPreviewKind(config, study)
  const paletteLabels = inferPaletteLabels(config, study)
  const palette = paletteLabels.map((label, index) => ({
    label,
    color: colorHexForPaletteValue(label, index),
  }))
  const { width, height } = inferGridSize(config, study)
  const visualCount = inferVisualCount(simulation, study, width * height)
  return {
    kind,
    modelId,
    palette,
    paletteLabels,
    visualCount,
    countLabel: inferPreviewCount(simulation, study, visualCount),
    width,
    height,
    params: inferPreviewParams(simulation, study),
  }
}

function inferPreviewKind(config: ModelConfig | undefined, study?: AbmCaseStudy | null): PreviewKind {
  if (config) {
    const environment = isRecord(config.environment) ? String(config.environment.type ?? '').toLowerCase() : ''
    if (environment === 'network') return 'network'
    if (environment === 'grid') return 'grid'
  }
  if (study?.canvas === '混合场景') return 'hybrid'
  if (study?.canvas === '社会网络' || study?.canvas === '移动个体') return 'network'
  if (study?.canvas === '网格斑块') return 'grid'
  const modelId = config ? readModelId(config, '').toLowerCase() : ''
  if (/rumor|opinion|public|goods|social|influence|market/.test(modelId)) return 'network'
  if (/hybrid|evacuation|mobility/.test(modelId)) return 'hybrid'
  return 'grid'
}

function inferPaletteLabels(config: ModelConfig | undefined, study?: AbmCaseStudy | null): string[] {
  const fromConfig = config ? paletteLabelsFromConfig(config) : []
  if (fromConfig.length > 0) return fromConfig
  return fallbackPaletteLabels(study?.template ?? study?.id ?? '')
}

function paletteLabelsFromConfig(config: ModelConfig): string[] {
  const values = new Set<string>()
  for (const agent of readRecords(config.agents)) {
    const variables = readRecords(agent.state_variables ?? agent.stateVariables)
    const primary = variables.find((item) => readString(item, 'dtype') === 'categorical') ?? variables[0]
    if (!primary) continue
    if (Array.isArray(primary.choices) && primary.choices.length > 0) {
      for (const choice of primary.choices) values.add(String(choice))
      continue
    }
    const dtype = readString(primary, 'dtype')
    if (dtype === 'bool') {
      values.add('False')
      values.add('True')
    } else if (dtype === 'float' || dtype === 'int') {
      const name = readString(primary, 'name') ?? 'value'
      values.add(`${name}: low`)
      values.add(`${name}: mid`)
      values.add(`${name}: high`)
    }
  }
  return [...values].sort()
}

function fallbackPaletteLabels(templateKey: string): string[] {
  const key = templateKey.toLowerCase()
  if (/wildfire|fire|山火|燃料/.test(key)) return ['fuel', 'burning', 'burned', 'barrier']
  if (/schelling|segregation|隔离|迁居/.test(key)) return ['a', 'b', 'empty']
  if (/opinion|polar|market|意见|市场/.test(key)) return ['low', 'mid', 'high']
  if (/public|goods|cooperation|合作|公共品/.test(key)) return ['cooperate', 'defect']
  if (/diffusion|adoption|cascade|social|influence|采纳|级联/.test(key)) return ['False', 'True']
  return ['susceptible', 'infected', 'recovered']
}

function inferGridSize(config: ModelConfig | undefined, study?: AbmCaseStudy | null): { width: number; height: number } {
  const environment = isRecord(config?.environment) ? config.environment : null
  const envConfig = isRecord(environment?.config) ? environment.config : {}
  const width = typeof envConfig.width === 'number' && Number.isFinite(envConfig.width) ? envConfig.width : undefined
  const height = typeof envConfig.height === 'number' && Number.isFinite(envConfig.height) ? envConfig.height : undefined
  if (width && height) return { width, height }
  if (study?.scale) {
    const match = study.scale.match(/(\d+)\s*x\s*(\d+)/i)
    if (match) return { width: Number(match[1]), height: Number(match[2]) }
  }
  return { width: SNAPSHOT_GRID_COLS, height: SNAPSHOT_GRID_ROWS }
}

function inferPreviewCount(simulation?: AbmSimulation | null, study?: AbmCaseStudy | null, fallback = 0): string {
  if (study?.scale) return study.scale
  const counts = simulation?.config ? readAgentCounts(simulation.config) : {}
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  if (total > 0) return `${total.toLocaleString()} agents`
  if (fallback > 0) return `${fallback.toLocaleString()} cells`
  return `${simulation?.interface?.steps ?? 50} ticks`
}

function inferVisualCount(simulation: AbmSimulation | null | undefined, study: AbmCaseStudy | null | undefined, fallback: number): number {
  if (simulation?.config) {
    const total = Object.values(readAgentCounts(simulation.config)).reduce((sum, value) => sum + value, 0)
    if (total > 0) return total
  }
  if (study?.scale) {
    const gridMatch = study.scale.match(/(\d+)\s*x\s*(\d+)/i)
    if (gridMatch) return Number(gridMatch[1]) * Number(gridMatch[2])
    const number = Number(study.scale.match(/(\d+(?:\.\d+)?)/)?.[1])
    if (Number.isFinite(number) && number > 0) return Math.round(number * (study.scale.includes('k') ? 1000 : 1))
  }
  return fallback
}

function inferPreviewParams(simulation?: AbmSimulation | null, study?: AbmCaseStudy | null): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  if (simulation?.config) {
    for (const parameter of readRecords(simulation.config.parameters)) {
      const id = readString(parameter, 'id') ?? readString(parameter, 'name')
      if (!id) continue
      params[id] = simulation.interface.params[id] ?? parameter.default ?? parameter.value
    }
  }
  return { ...params, ...(study?.defaults?.params ?? {}), ...(simulation?.interface.params ?? {}) }
}

function previewSpecKey(spec: PreviewSpec): string {
  return JSON.stringify({
    kind: spec.kind,
    modelId: spec.modelId,
    countLabel: spec.countLabel,
    width: spec.width,
    height: spec.height,
    visualCount: spec.visualCount,
    paletteLabels: spec.paletteLabels,
    params: spec.params,
  })
}

export function gridStateForIndex(spec: PreviewSpec, seed: number, index: number, cols: number, rows: number, motif: number): string | null {
  const labelText = spec.paletteLabels.join('|').toLowerCase()
  const x = index % cols
  const y = Math.floor(index / cols)
  const r = seeded(seed + index * 17)
  const populationRatio = Math.min(0.98, spec.visualCount / Math.max(1, spec.width * spec.height))
  // Where the "active" cells concentrate for this case (0 = calm, 1 = hot).
  const field = intensityField(motif, x, y, cols, rows, seed)

  if (labelText.includes('fuel') || labelText.includes('burning')) {
    const fuelDensity = numberParam(spec.params, 'fuel_density', 0.72)
    if (r > fuelDensity) return labelFromPalette(spec, 'empty')
    if (field > 0.7 && seeded(seed + index * 23) < 0.66) return labelFromPalette(spec, 'burning')
    if (field > 0.46 && seeded(seed + index * 29) < 0.8) return labelFromPalette(spec, 'burned')
    return labelFromPalette(spec, 'fuel')
  }

  if (labelText.includes('infected') && labelText.includes('susceptible')) {
    const initial = Math.max(1, numberParam(spec.params, 'initial_infected', 3))
    const infectedRatio = Math.min(0.4, initial / Math.max(1, spec.visualCount) * 10 + 0.14)
    if (field > 1 - infectedRatio && r < 0.86) return labelFromPalette(spec, 'infected')
    if (field > 1 - infectedRatio * 2 && r > 0.55) return labelFromPalette(spec, 'recovered')
    return labelFromPalette(spec, 'susceptible')
  }

  if (spec.paletteLabels.includes('a') && spec.paletteLabels.includes('b')) {
    if (r > populationRatio) return labelFromPalette(spec, 'empty')
    return groupForMotif(motif, x, y, cols, rows, seed) ? 'a' : 'b'
  }

  if (r > populationRatio) return null
  // Generic palettes: let the dominant (last) label pool where the field is hot,
  // so the motif still reshapes the snapshot instead of uniform noise.
  const dominant = spec.paletteLabels[spec.paletteLabels.length - 1]
  if (dominant && field > 0.62 && seeded(seed + index * 41) < 0.7) return dominant
  return spec.paletteLabels[Math.floor(seeded(seed + index * 31) * spec.paletteLabels.length)] ?? null
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/**
 * A deterministic scalar field in [0,1] whose shape depends on the case motif.
 * Families (fire / epidemic / generic) threshold it to decide which cells are
 * "active", so cases sharing a template still get visually distinct snapshots.
 */
function intensityField(motif: number, x: number, y: number, cols: number, rows: number, seed: number): number {
  const nx = x / Math.max(1, cols - 1)
  const ny = y / Math.max(1, rows - 1)
  switch (motif % 4) {
    case 0: {
      // Wavy front sweeping in from the left edge.
      const wave = Math.sin(ny * Math.PI * 2 + seed) * 0.09
      return clamp01(1 - nx + wave)
    }
    case 1: {
      // Single outbreak radiating from the top-left corner.
      return clamp01(1 - Math.hypot(nx, ny) / Math.SQRT2)
    }
    case 2: {
      // Two hotspots (twin ignitions / dual outbreaks).
      const d1 = Math.hypot(nx - 0.28, ny - 0.34)
      const d2 = Math.hypot(nx - 0.74, ny - 0.7)
      return clamp01(1 - Math.min(d1, d2) * 1.9)
    }
    default: {
      // Central radial bloom.
      return clamp01(1 - Math.hypot(nx - 0.5, ny - 0.5) / Math.SQRT1_2)
    }
  }
}

/** Group membership geometry for Schelling-style a/b palettes, varied by motif. */
function groupForMotif(motif: number, x: number, y: number, cols: number, rows: number, seed: number): boolean {
  switch (motif % 4) {
    case 0: {
      // Medium clustered blocks.
      return seeded(seed + Math.floor(x / 5) * 29 + Math.floor(y / 5) * 71) > 0.5
    }
    case 1: {
      // Vertical bands.
      return Math.floor(x / Math.max(3, Math.round(cols / 6))) % 2 === 0
    }
    case 2: {
      // Diagonal split with a jittered seam.
      return (x / Math.max(1, cols) + y / Math.max(1, rows)) / 2 + (seeded(seed + x * 3 + y * 5) - 0.5) * 0.16 > 0.5
    }
    default: {
      // Large quadrant clusters.
      const bx = Math.floor(x / Math.max(4, cols / 3))
      const by = Math.floor(y / Math.max(4, rows / 3))
      return (bx + by) % 2 === 0
    }
  }
}

/** Node layout for network snapshots, varied by motif (rings / communities / scatter / band). */
export function networkNodePosition(
  motif: number,
  index: number,
  count: number,
  seed: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const centerX = width / 2
  const centerY = height / 2
  const radius = Math.max(18, Math.min(width, height) * 0.42)
  switch (motif % 4) {
    case 0: {
      // Radial rings.
      const angle = seeded(seed + index * 11) * Math.PI * 2
      const ring = Math.sqrt(seeded(seed + index * 23 + 5))
      return {
        x: centerX + Math.cos(angle) * ring * radius + (seeded(seed + index * 7) - 0.5) * width * 0.16,
        y: centerY + Math.sin(angle) * ring * radius + (seeded(seed + index * 17) - 0.5) * height * 0.16,
      }
    }
    case 1: {
      // Three loose communities.
      const clusters = 3
      const cluster = index % clusters
      const clusterAngle = (cluster / clusters) * Math.PI * 2 + seed
      const cx = centerX + Math.cos(clusterAngle) * radius * 0.6
      const cy = centerY + Math.sin(clusterAngle) * radius * 0.6
      return {
        x: cx + (seeded(seed + index * 13) - 0.5) * width * 0.24,
        y: cy + (seeded(seed + index * 19) - 0.5) * height * 0.24,
      }
    }
    case 2: {
      // Scattered organic cloud.
      return {
        x: 8 + seeded(seed + index * 11) * (width - 16),
        y: 8 + seeded(seed + index * 29) * (height - 16),
      }
    }
    default: {
      // Horizontal lattice band.
      const perRow = Math.max(2, Math.ceil(Math.sqrt(count) * 1.6))
      const totalRows = Math.max(1, Math.ceil(count / perRow))
      const col = index % perRow
      const row = Math.floor(index / perRow)
      const gx = (col + 0.5) / perRow
      const gy = totalRows > 1 ? (row + 0.5) / totalRows : 0.5
      return {
        x: 10 + gx * (width - 20) + (seeded(seed + index * 7) - 0.5) * width * 0.05,
        y: centerY + (gy - 0.5) * height * 0.72 + (seeded(seed + index * 17) - 0.5) * height * 0.06,
      }
    }
  }
}

function networkStateForIndex(spec: PreviewSpec, seed: number, index: number): string {
  const labelText = spec.paletteLabels.join('|').toLowerCase()
  const r = seeded(seed + index * 31 + 3)
  if (labelText.includes('infected') && labelText.includes('susceptible')) {
    const initial = Math.max(1, numberParam(spec.params, 'initial_infected', 3))
    const infectedRatio = Math.min(0.22, initial / Math.max(1, spec.visualCount) * 9 + 0.03)
    if (r < infectedRatio) return labelFromPalette(spec, 'infected') ?? spec.paletteLabels[0] ?? 'state'
    if (r > 0.92) return labelFromPalette(spec, 'recovered') ?? spec.paletteLabels[0] ?? 'state'
    return labelFromPalette(spec, 'susceptible') ?? spec.paletteLabels[0] ?? 'state'
  }
  if (spec.paletteLabels.includes('False') && spec.paletteLabels.includes('True')) return r > 0.82 ? 'True' : 'False'
  return spec.paletteLabels[Math.floor(r * spec.paletteLabels.length)] ?? 'state'
}

function numberParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const value = params[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function labelFromPalette(spec: PreviewSpec, preferred: string): string | null {
  return spec.paletteLabels.find((label) => label.toLowerCase() === preferred.toLowerCase())
    ?? spec.paletteLabels.find((label) => label.toLowerCase().includes(preferred.toLowerCase()))
    ?? null
}

function colorForLabel(label: string | null, spec: PreviewSpec): string {
  if (!label) return 'rgba(15,23,42,0.25)'
  return spec.palette.find((entry) => entry.label === label)?.color ?? colorHexForPaletteValue(label, 0)
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

function seeded(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}
