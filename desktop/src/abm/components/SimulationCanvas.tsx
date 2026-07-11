import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Maximize2, Pause, Play, Plus, Radio, SlidersHorizontal, Sparkles, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTabStore } from '../../stores/tabStore'
import { useUIStore } from '../../stores/uiStore'
import { useAbmStore, type AgentSnapshotRow } from '../stores/abmStore'
import { useSelectionStore, type CanvasSelection } from '../stores/selectionStore'
import { abmSocket } from '../api/abmSocket'
import { GridRasterRenderer } from '../canvas/GridRasterRenderer'
import {
  DEFAULT_NETWORK_RENDER_STYLE,
  PointsGLRenderer,
  type NetworkRenderStyle,
} from '../canvas/PointsGLRenderer'
import {
  computeNetworkLayout,
  defaultLayoutMode,
  NETWORK_LAYOUT_MODES,
  type NetworkLayoutMode,
} from '../canvas/networkLayout'
import { FrameClock } from '../canvas/frameClock'
import { createFrameDecoder, type FrameDecoder } from '../canvas/frameDecoder'
import { buildPaletteLUT, colorHexForPaletteValue } from '../canvas/paletteLUT'
import { decodeFloat32Base64, decodeUint32Base64, EMPTY_STATE } from '../canvas/frameFormat'
import { IDENTITY_CAMERA, zoomAt, type Camera } from '../canvas/camera'
import type { AbmMeta } from '../types'
import { MiniExplainPopover, type MiniExplainAnchor } from './MiniExplainPopover'
import { useAbmText, type AbmTextKey } from '../i18n'

interface SimulationCanvasProps {
  runId: string | null
}

type ActiveRenderer =
  | { kind: 'grid'; renderer: GridRasterRenderer; width: number }
  | { kind: 'network'; renderer: PointsGLRenderer }

interface CanvasStats {
  fps: number
  tick: number
  bytes: number
  changed: number
}

const HEAVY_AGENT_HINT = 50_000
type CanvasPickEvent = { clientX: number; clientY: number }
type AbmT = ReturnType<typeof useAbmText>

export function SimulationCanvas({ runId }: SimulationCanvasProps) {
  const t = useAbmText()
  const run = useAbmStore((store) => (runId ? store.runs[runId] : undefined))
  const playbackSpeed = useAbmStore((store) => store.playbackSpeed)
  const setPlaybackTick = useAbmStore((store) => store.setPlaybackTick)
  const setAgentSnapshot = useAbmStore((store) => store.setAgentSnapshot)
  const meta = run?.meta
  const replay = useSelectionStore((store) => store.replay)
  const selection = useSelectionStore((store) => store.selection)
  const setSelection = useSelectionStore((store) => store.setSelection)
  const setEvidenceFocus = useSelectionStore((store) => store.setEvidenceFocus)
  const activeTabId = useTabStore((store) => store.activeTabId)
  const queueComposerPrefill = useChatStore((store) => store.queueComposerPrefill)
  const addToast = useUIStore((store) => store.addToast)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<ActiveRenderer | null>(null)
  const lutRef = useRef<Uint32Array>(new Uint32Array(256))
  const lastStateRef = useRef<Uint8Array | null>(null)
  const cameraRef = useRef<Camera>({ ...IDENTITY_CAMERA })
  const dprRef = useRef<number>(1)
  const networkStyleRef = useRef<NetworkRenderStyle>({ ...DEFAULT_NETWORK_RENDER_STYLE })
  const clockRef = useRef<FrameClock | null>(null)

  const frameCountRef = useRef(0)
  const lastBytesRef = useRef(0)
  const lastChangedRef = useRef(0)
  const liveTickRef = useRef(0)
  const pausedRef = useRef(false)

  const [stats, setStats] = useState<CanvasStats>({ fps: 0, tick: 0, bytes: 0, changed: 0 })
  const [stateCounts, setStateCounts] = useState<number[]>([])
  const [glUnsupported, setGlUnsupported] = useState(false)
  const [paused, setPaused] = useState(false)
  const [explainAnchor, setExplainAnchor] = useState<MiniExplainAnchor | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [stylePanelOpen, setStylePanelOpen] = useState(false)
  const [networkStyle, setNetworkStyle] = useState<NetworkRenderStyle>({ ...DEFAULT_NETWORK_RENDER_STYLE })
  const [layoutMode, setLayoutMode] = useState<NetworkLayoutMode>('default')
  const [neighborCount, setNeighborCount] = useState<number | null>(null)

  // Decode the kernel-provided network geometry once per meta so client layouts
  // (force/circle/grid) can recompute positions without a re-decode per change.
  const networkSource = useMemo(() => {
    if (meta?.space !== 'network' || !meta.network) return null
    return {
      base: decodeFloat32Base64(meta.network.layoutB64),
      edges: decodeUint32Base64(meta.network.edgesB64),
      count: meta.network.count,
    }
  }, [meta])

  const appliedLayout = useMemo(() => {
    if (!networkSource) return null
    return computeNetworkLayout(layoutMode, networkSource.base, networkSource.edges, networkSource.count)
  }, [networkSource, layoutMode])

  const count = useMemo(() => {
    if (!meta) return 0
    if (meta.space === 'grid' && meta.grid) return meta.grid.width * meta.grid.height
    if (meta.space === 'network' && meta.network) return meta.network.count
    return 0
  }, [meta])

  const paint = useCallback((state: Uint8Array) => {
    const active = rendererRef.current
    if (!active) return
    if (active.kind === 'grid') active.renderer.render(state, lutRef.current, cameraRef.current)
    else active.renderer.render(state, cameraRef.current, networkStyleRef.current)
  }, [])

  const redraw = useCallback(() => {
    const state = useSelectionStore.getState().replay?.state ?? lastStateRef.current
    if (state) paint(state)
  }, [paint])

  const onLiveState = useCallback(
    (state: Uint8Array, tick: number) => {
      const previous = lastStateRef.current
      lastChangedRef.current = previous && previous.length === state.length ? countChangedStates(previous, state) : state.length
      lastStateRef.current = state
      liveTickRef.current = tick
      if (runId) setPlaybackTick(runId, tick)
      frameCountRef.current += 1
      if (!useSelectionStore.getState().replay && !pausedRef.current) paint(state)
    },
    [paint, runId, setPlaybackTick],
  )

  useEffect(() => {
    pausedRef.current = paused
    if (paused) clockRef.current?.pause()
    else clockRef.current?.resume()
    if (!paused) redraw()
  }, [paused, redraw])

  // Decode pipeline: socket binary frames -> decoder -> frame clock -> paint.
  useEffect(() => {
    if (!runId) return
    const frameIntervalMs = Math.round(80 / Math.max(0.1, playbackSpeed))
    const clock = new FrameClock({
      onRender: (p) => onLiveState(p.state, p.tick),
      bufferFrames: playbackSpeed < 1,
      frameIntervalMs,
      maxBufferedFrames: 480,
    })
    clockRef.current = clock
    if (pausedRef.current) clock.pause()
    const decoder: FrameDecoder = createFrameDecoder((state, tick) => clock.push(state, tick))
    const unsubscribe = abmSocket.connect(runId, {
      onBinary: (buffer) => {
        lastBytesRef.current = buffer.byteLength
        decoder.push(buffer)
      },
    })
    return () => {
      unsubscribe()
      decoder.dispose()
      clock.dispose()
      if (clockRef.current === clock) clockRef.current = null
    }
  }, [runId, onLiveState, playbackSpeed])

  // Build the renderer once the canvas meta (palette + geometry) is known.
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !meta) return

    setGlUnsupported(false)
    sizeCanvas(canvas, container, dprRef)
    cameraRef.current = defaultCameraForMeta(meta, networkStyleRef.current)

    const active = buildRenderer(canvas, meta, setGlUnsupported)
    rendererRef.current = active
    if (active?.kind === 'grid') lutRef.current = buildPaletteLUT(meta.palette)
    redraw()

    const observer = new ResizeObserver(() => {
      sizeCanvas(canvas, container, dprRef)
      redraw()
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      if (active?.kind === 'network') active.renderer.dispose()
      rendererRef.current = null
    }
  }, [meta, redraw])

  // Pick the recommended layout whenever a new network loads (large graphs get
  // a client force layout instead of the kernel's random square).
  useEffect(() => {
    if (networkSource) setLayoutMode(defaultLayoutMode(networkSource.count))
  }, [networkSource])

  // Push the active layout to the renderer (runs after the renderer is built).
  useEffect(() => {
    const active = rendererRef.current
    if (!appliedLayout || active?.kind !== 'network') return
    active.renderer.updateLayout(appliedLayout)
    redraw()
  }, [appliedLayout, redraw])

  // Re-render when a trace-replay frame is set/cleared.
  useEffect(() => {
    redraw()
  }, [replay, redraw])

  useEffect(() => {
    networkStyleRef.current = networkStyle
    redraw()
  }, [networkStyle, redraw])

  // Pointer: wheel zoom, drag pan, click to pick an agent/cell.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !meta) return

    let dragging = false
    let moved = 0
    let lastX = 0
    let lastY = 0

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const dpr = dprRef.current
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1
      cameraRef.current = zoomAt(
        cameraRef.current,
        factor,
        (event.clientX - rect.left) * dpr,
        (event.clientY - rect.top) * dpr,
      )
      redraw()
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 2) setContextMenu(null)
      dragging = true
      moved = 0
      lastX = event.clientX
      lastY = event.clientY
      try {
        canvas.setPointerCapture(event.pointerId)
      } catch {
        /* pointer capture can be unavailable in embedded/webview edge cases */
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return
      const dpr = dprRef.current
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      moved += Math.abs(dx) + Math.abs(dy)
      lastX = event.clientX
      lastY = event.clientY
      cameraRef.current = {
        ...cameraRef.current,
        x: cameraRef.current.x + dx * dpr,
        y: cameraRef.current.y + dy * dpr,
      }
      redraw()
    }

    const onPointerUp = (event: PointerEvent) => {
      dragging = false
      if (canvas.hasPointerCapture(event.pointerId)) {
        try {
          canvas.releasePointerCapture(event.pointerId)
        } catch {
          /* keep click handling usable even if the browser already released it */
        }
      }
      if (moved < 4) pickAt(canvas, event, meta)
    }

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      const picked = pickAt(canvas, event, meta)
      if (picked) setContextMenu({ x: event.clientX, y: event.clientY })
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('contextmenu', onContextMenu)
    return () => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
    // pickAt reads refs; meta drives index math + listener identity.
  }, [meta]) // eslint-disable-line react-hooks/exhaustive-deps

  // HUD stats tick (fps + last frame size), decoupled from the render loop.
  useEffect(() => {
    const id = window.setInterval(() => {
      const fps = frameCountRef.current * 2 // sampled over 500ms
      frameCountRef.current = 0
      setStats({ fps, tick: liveTickRef.current, bytes: lastBytesRef.current, changed: lastChangedRef.current })
      // State histogram feeds the concentrated legend (only categories that
      // actually occur get a legend entry).
      const state = lastStateRef.current
      if (state) {
        const counts = new Array<number>(256).fill(0)
        for (let index = 0; index < state.length; index += 1) {
          counts[state[index]!] = (counts[state[index]!] ?? 0) + 1
        }
        setStateCounts(counts)
        if (runId && meta) {
          setAgentSnapshot(buildAgentSnapshot(runId, liveTickRef.current, state, meta.palette))
        }
      }
    }, 500)
    return () => window.clearInterval(id)
  }, [meta, runId, setAgentSnapshot])

  const pickAt = useCallback(
    (canvas: HTMLCanvasElement, event: CanvasPickEvent, currentMeta: AbmMeta): CanvasSelection | null => {
      const active = rendererRef.current
      if (!active) return null
      const rect = canvas.getBoundingClientRect()
      const dpr = dprRef.current
      const px = (event.clientX - rect.left) * dpr
      const py = (event.clientY - rect.top) * dpr
      const replayFrame = useSelectionStore.getState().replay
      const state = replayFrame?.state ?? lastStateRef.current
      const tick = replayFrame?.tick ?? liveTickRef.current

      if (active.kind === 'grid' && currentMeta.grid) {
        const cell = active.renderer.pickCell(px, py)
        if (!cell) return null
        const index = cell.y * currentMeta.grid.width + cell.x
        const nextSelection: CanvasSelection = {
          kind: 'cell',
          index,
          x: cell.x,
          y: cell.y,
          tick,
          state: state?.[index],
          anchor: { x: event.clientX, y: event.clientY },
        }
        setSelection(nextSelection)
        return nextSelection
      } else if (active.kind === 'network') {
        const node = active.renderer.pickPoint(px, py, cameraRef.current, networkStyleRef.current)
        if (node === null) return null
        const nextSelection: CanvasSelection = {
          kind: 'node',
          index: node,
          tick,
          state: state?.[node],
          anchor: { x: event.clientX, y: event.clientY },
        }
        setSelection(nextSelection)
        return nextSelection
      }
      return null
    },
    [setSelection],
  )

  const adjustZoom = (factor: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    cameraRef.current = zoomAt(cameraRef.current, factor, canvas.width / 2, canvas.height / 2)
    redraw()
  }

  const resetCamera = () => {
    cameraRef.current = defaultCameraForMeta(meta, networkStyleRef.current)
    redraw()
  }

  useEffect(() => {
    if (!selection) {
      setContextMenu(null)
      setExplainAnchor(null)
    }
  }, [selection])

  // Selection highlight: emphasize the picked network node and everything it
  // connects to (rings + bright incident edges). Re-applies after a renderer
  // rebuild (meta change) so the highlight survives model/version switches.
  useEffect(() => {
    const active = rendererRef.current
    if (!active || active.kind !== 'network') {
      setNeighborCount(null)
      return
    }
    if (selection?.kind === 'node') {
      active.renderer.setHighlight(selection.index)
      setNeighborCount(active.renderer.neighborsOf(selection.index).length)
    } else {
      active.renderer.setHighlight(null)
      setNeighborCount(null)
    }
    redraw()
  }, [selection, meta, redraw])

  const selectionView = selection ? describeSelection(selection, meta, t) : null
  const metricsHint = selection?.tick !== undefined ? nearestMetrics(run?.ticks ?? [], selection.tick) : undefined
  const selectionPrompt = selection && selectionView
    ? buildSelectionPrompt(selection, selectionView, t)
    : ''
  const insertSelectionPrompt = () => {
    if (!activeTabId || !selectionPrompt) return
    queueComposerPrefill(activeTabId, { text: selectionPrompt, mode: 'append' })
    addToast({ type: 'success', message: t('selection.addedToast') })
    setContextMenu(null)
  }

  const focusSelectionEvidence = () => {
    if (!runId || selection?.tick === undefined) return
    setEvidenceFocus({
      runId,
      tick: selection.tick,
      ...(selection.kind === 'node' ? { agentIds: [selection.index] } : {}),
    })
    setContextMenu(null)
  }

  const openSelectionExplain = (anchor?: MiniExplainAnchor) => {
    setExplainAnchor(anchor ?? selection?.anchor ?? null)
    setContextMenu(null)
  }

  return (
    <div
      className="relative h-full min-h-0 w-full overflow-hidden rounded-[10px] border border-[var(--color-border)]"
      style={{
        backgroundColor: '#07090d',
        backgroundImage:
          'linear-gradient(rgba(148,163,184,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.22) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }}
    >
      <div ref={containerRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block h-full w-full touch-none" />
      </div>

      {!meta && (
        <div className="absolute inset-0 grid place-items-center text-xs text-[var(--color-text-tertiary)]">
          {t('canvas.empty')}
        </div>
      )}

      {glUnsupported && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-[var(--color-text-tertiary)]">
          {t('canvas.webglUnsupported')}
        </div>
      )}

      {meta && (
        <>
          <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1 rounded-[8px] bg-[var(--color-surface)]/80 px-2.5 py-1.5 text-[11px] text-[var(--color-text-secondary)] backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="font-medium text-[var(--color-text-primary)]">{t('canvas.liveStatus')}</span>
              <span>tick {stats.tick}</span>
              <span>{playbackSpeed}x</span>
              <span>{stats.fps} fps</span>
              <span>{t('canvas.changed')} {stats.changed.toLocaleString()}</span>
              {paused ? <span className="text-[var(--color-warning)]">{t('canvas.paused')}</span> : null}
            </div>
            <div className="flex items-center gap-3 text-[var(--color-text-tertiary)]">
              <span>{t('canvas.agentCount', { count: count.toLocaleString() })}</span>
              <span>{t('canvas.colorMeansState')}</span>
              <span>{(stats.bytes / 1024).toFixed(1)} KB/frame</span>
            </div>
          </div>

          <div className="absolute right-2 top-2 flex flex-col gap-1">
            {meta.space === 'network' ? (
              <CanvasButton label={t('canvas.networkStyle')} onClick={() => setStylePanelOpen((value) => !value)}>
                <SlidersHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </CanvasButton>
            ) : null}
            <CanvasButton label={paused ? t('canvas.resume') : t('canvas.pause')} onClick={() => setPaused((value) => !value)}>
              {paused ? (
                <Play className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              ) : (
                <Pause className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              )}
            </CanvasButton>
            <CanvasButton label={t('canvas.zoomIn')} onClick={() => adjustZoom(1.2)}>
              <ZoomIn className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </CanvasButton>
            <CanvasButton label={t('canvas.zoomOut')} onClick={() => adjustZoom(1 / 1.2)}>
              <ZoomOut className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </CanvasButton>
            <CanvasButton label={t('canvas.resetView')} onClick={resetCamera}>
              <Maximize2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </CanvasButton>
          </div>

          <PaletteLegend palette={meta.palette} counts={stateCounts} />

          {meta.space === 'network' && stylePanelOpen ? (
            <NetworkStylePanel
              t={t}
              style={networkStyle}
              layoutMode={layoutMode}
              onChange={setNetworkStyle}
              onLayoutModeChange={setLayoutMode}
              onReset={() => {
                setNetworkStyle({ ...DEFAULT_NETWORK_RENDER_STYLE })
                setLayoutMode(defaultLayoutMode(networkSource?.count ?? 0))
              }}
            />
          ) : null}

          {selection && selectionView && !contextMenu ? (
            <CanvasSelectionCard
              t={t}
              selection={selection}
              view={selectionView}
              neighborCount={neighborCount}
              onExplain={(anchor) => openSelectionExplain(anchor)}
              onClose={() => setSelection(null)}
            />
          ) : null}

          {selection && selectionView && contextMenu ? (
            <CanvasContextMenu
              t={t}
              anchor={contextMenu}
              canInsert={Boolean(activeTabId && selectionPrompt)}
              canFocus={Boolean(runId && selection.tick !== undefined)}
              onExplain={() => openSelectionExplain(contextMenu)}
              onInsert={insertSelectionPrompt}
              onFocus={focusSelectionEvidence}
              onClose={() => setContextMenu(null)}
            />
          ) : null}

          <MiniExplainPopover
            open={Boolean(explainAnchor && selection && selectionView)}
            anchor={explainAnchor}
            onClose={() => setExplainAnchor(null)}
            target={selection && selectionView ? {
              title: t('canvas.localAiTitle'),
              subject: `${selectionView.tickLabel} · ${selectionView.targetLabel} #${selection.index}`,
              ...(runId ? { runId } : {}),
              ...(selection.tick !== undefined ? { tick: selection.tick } : {}),
              ...(metricsHint ? { metricsHint } : {}),
              selection: {
                label: selectionView.targetLabel,
                index: selection.index,
                ...(selectionView.location ? { location: selectionView.location } : {}),
                ...(selectionView.stateLabel ? { stateLabel: selectionView.stateLabel } : {}),
              },
            } : null}
          />

          {count > HEAVY_AGENT_HINT && (
            <div className="pointer-events-none absolute bottom-2 right-2 max-w-[220px] rounded-[8px] bg-[var(--color-surface)]/80 px-2.5 py-1.5 text-[11px] text-[var(--color-text-tertiary)] backdrop-blur">
              {t('canvas.heavyHint')}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function countChangedStates(previous: Uint8Array, next: Uint8Array): number {
  let changed = 0
  for (let index = 0; index < next.length; index += 1) {
    if (previous[index] !== next[index]) changed += 1
  }
  return changed
}

/** Common English ABM state names → Chinese, so the legend speaks one language. */
const STATE_LABEL_ZH: Record<string, string> = {
  empty: '空地',
  fuel: '燃料',
  tree: '树木',
  rock: '岩石',
  burning: '燃烧中',
  burned: '已燃尽',
  susceptible: '易感',
  exposed: '潜伏',
  infected: '感染',
  recovered: '恢复',
  removed: '移出',
  ignorant: '未知者',
  spreader: '传播者',
  stifler: '沉默者',
  believer: '相信者',
  skeptic: '怀疑者',
  adopter: '采纳者',
  potential: '潜在者',
  cooperator: '合作者',
  defector: '背叛者',
  active: '活跃',
  inactive: '沉寂',
  happy: '满意',
  unhappy: '不满意',
}

function legendLabel(raw: string, locale: string): string {
  return locale === 'zh' || locale === 'zh-TW' ? STATE_LABEL_ZH[raw.toLowerCase()] ?? raw : raw
}

const LEGEND_MAX_ENTRIES = 6
const LEGEND_MIN_SHARE = 0.005

/**
 * Concentrated legend: only categories that actually occur in the current
 * frame (top-N by share) get an entry; empty/rare states collapse into "+N".
 * Before the first frame arrives, all categories show.
 */
function PaletteLegend({ palette, counts }: { palette: string[]; counts: number[] }) {
  const t = useAbmText()
  const locale = useSettingsStore((state) => state.locale)
  if (palette.length === 0) return null
  const total = counts.reduce((sum, value) => sum + value, 0)
  const entries = palette.map((label, index) => ({ label, index, count: counts[index] ?? 0 }))

  let visible = entries
  let hidden = 0
  if (total > 0) {
    const concentrated = entries
      .filter((entry) => entry.count > 0 && entry.count / total >= LEGEND_MIN_SHARE)
      .sort((a, b) => b.count - a.count)
      .slice(0, LEGEND_MAX_ENTRIES)
    const keep = new Set(concentrated.map((entry) => entry.index))
    visible = entries.filter((entry) => keep.has(entry.index))
    hidden = palette.length - visible.length
  } else if (entries.length > LEGEND_MAX_ENTRIES) {
    visible = entries.slice(0, LEGEND_MAX_ENTRIES)
    hidden = entries.length - visible.length
  }

  return (
    <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-x-3 gap-y-1 rounded-[8px] bg-[var(--color-surface)]/80 px-2.5 py-1.5 text-[11px] text-[var(--color-text-secondary)] backdrop-blur">
      {visible.map((entry) => (
        <span key={entry.label} className="flex items-center gap-1.5" title={entry.label}>
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ backgroundColor: colorHexForPaletteValue(entry.label, entry.index) }}
          />
          {legendLabel(entry.label, locale)}
          {total > 0 ? (
            <span className="text-[10px] text-[var(--color-text-tertiary)]">
              {Math.round((entry.count / total) * 100)}%
            </span>
          ) : null}
        </span>
      ))}
      {hidden > 0 ? <span className="text-[10px] text-[var(--color-text-tertiary)]">{t('canvas.legendMore', { count: hidden })}</span> : null}
    </div>
  )
}

const LAYOUT_MODE_LABEL: Record<NetworkLayoutMode, AbmTextKey> = {
  default: 'canvasStyle.layoutDefault',
  force: 'canvasStyle.layoutForce',
  circle: 'canvasStyle.layoutCircle',
  grid: 'canvasStyle.layoutGrid',
}

const EDGE_COLOR_OPTIONS = [
  { labelKey: 'canvasStyle.colorSilver', value: [210 / 255, 218 / 255, 230 / 255] as [number, number, number] },
  { labelKey: 'canvasStyle.colorCoolGray', value: [76 / 255, 91 / 255, 112 / 255] as [number, number, number] },
  { labelKey: 'canvasStyle.colorTeal', value: [20 / 255, 148 / 255, 132 / 255] as [number, number, number] },
  { labelKey: 'canvasStyle.colorIndigo', value: [79 / 255, 70 / 255, 229 / 255] as [number, number, number] },
] as const

function NetworkStylePanel({
  t,
  style,
  layoutMode,
  onChange,
  onLayoutModeChange,
  onReset,
}: {
  t: AbmT
  style: NetworkRenderStyle
  layoutMode: NetworkLayoutMode
  onChange: (style: NetworkRenderStyle) => void
  onLayoutModeChange: (mode: NetworkLayoutMode) => void
  onReset: () => void
}) {
  const update = (patch: Partial<NetworkRenderStyle>) => onChange({ ...style, ...patch })
  const selectedColor =
    EDGE_COLOR_OPTIONS.find((option) => sameColor(option.value, style.edgeColor))?.labelKey ??
    EDGE_COLOR_OPTIONS[0].labelKey

  return (
    <div className="absolute right-12 top-2 z-[35] w-[236px] rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3 text-xs shadow-[var(--shadow-dropdown)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-semibold text-[var(--color-text-primary)]">{t('canvasStyle.title')}</div>
        <button
          type="button"
          onClick={onReset}
          className="rounded-[7px] px-2 py-1 text-[11px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
        >
          {t('canvasStyle.reset')}
        </button>
      </div>
      <div className="grid gap-2">
        <label className="grid gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
          {t('canvasStyle.layout')}
          <select
            value={layoutMode}
            onChange={(event) => onLayoutModeChange(event.target.value as NetworkLayoutMode)}
            className="h-8 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs outline-none"
          >
            {NETWORK_LAYOUT_MODES.map((mode) => (
              <option key={mode} value={mode}>{t(LAYOUT_MODE_LABEL[mode])}</option>
            ))}
          </select>
        </label>
        <StyleSlider
          label={t('canvasStyle.nodeSize')}
          value={style.nodeScale}
          min={0.6}
          max={2.2}
          step={0.05}
          onChange={(value) => update({ nodeScale: value })}
        />
        <StyleSlider
          label={t('canvasStyle.edgeOpacity')}
          value={style.edgeOpacity}
          min={0.05}
          max={0.9}
          step={0.05}
          onChange={(value) => update({ edgeOpacity: value })}
        />
        <StyleSlider
          label={t('canvasStyle.edgeWidth')}
          value={style.edgeWidth}
          min={0.5}
          max={4}
          step={0.1}
          onChange={(value) => update({ edgeWidth: value })}
        />
        <StyleSlider
          label={t('canvasStyle.layoutScale')}
          value={style.layoutScale}
          min={0.7}
          max={1.8}
          step={0.05}
          onChange={(value) => update({ layoutScale: value })}
        />
        <label className="grid gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
          {t('canvasStyle.edgeColor')}
          <select
            value={selectedColor}
            onChange={(event) => {
              const option = EDGE_COLOR_OPTIONS.find((item) => item.labelKey === event.target.value)
              if (option) update({ edgeColor: option.value })
            }}
            className="h-8 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs outline-none"
          >
            {EDGE_COLOR_OPTIONS.map((option) => (
              <option key={option.labelKey} value={option.labelKey}>{t(option.labelKey)}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}

function StyleSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="grid gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="font-mono text-[var(--color-text-tertiary)]">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 accent-[var(--color-brand)]"
      />
    </label>
  )
}

function sameColor(a: [number, number, number], b: [number, number, number]): boolean {
  return a.every((value, index) => Math.abs(value - b[index]!) < 0.001)
}

function CanvasSelectionCard({
  t,
  selection,
  view,
  neighborCount,
  onExplain,
  onClose,
}: {
  t: AbmT
  selection: CanvasSelection
  view: SelectionView
  neighborCount: number | null
  onExplain: (anchor: MiniExplainAnchor) => void
  onClose: () => void
}) {
  return (
    <div
      data-testid="abm-canvas-selection-card"
      className="fixed z-[45] w-[260px] rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3 text-xs shadow-[var(--shadow-dropdown)]"
      style={anchoredStyle(selection.anchor, 260, 178)}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {view.targetLabel} #{selection.index}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-[var(--color-text-tertiary)]">{view.tickLabel}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('selection.closeDetails')}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="grid gap-1.5">
        <SelectionRow label={t('selection.index')} value={`#${selection.index}`} />
        {view.location ? <SelectionRow label={t('selection.location')} value={view.location} /> : null}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--color-text-tertiary)]">{t('selection.state')}</span>
          <span className="flex min-w-0 items-center gap-1.5 font-medium text-[var(--color-text-primary)]">
            {view.stateColor ? (
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: view.stateColor }} />
            ) : null}
            <span className="truncate">{view.stateLabel ?? t('selection.emptyState')}</span>
          </span>
        </div>
        {selection.kind === 'node' && neighborCount !== null ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--color-text-tertiary)]">{t('selection.links')}</span>
            <span className="flex items-center gap-1.5 font-medium text-[var(--color-text-primary)]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: 'rgb(92, 217, 250)' }} />
              {t('selection.neighbors', { count: neighborCount })}
            </span>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={(event: ReactMouseEvent<HTMLButtonElement>) => onExplain({ x: event.clientX, y: event.clientY })}
        className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] bg-[var(--color-brand)] px-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        {t('selection.openLocalAi')}
      </button>
    </div>
  )
}

function CanvasContextMenu({
  t,
  anchor,
  canInsert,
  canFocus,
  onExplain,
  onInsert,
  onFocus,
  onClose,
}: {
  t: AbmT
  anchor: MiniExplainAnchor
  canInsert: boolean
  canFocus: boolean
  onExplain: () => void
  onInsert: () => void
  onFocus: () => void
  onClose: () => void
}) {
  return (
    <div
      data-testid="abm-canvas-context-menu"
      role="menu"
      className="fixed z-[55] w-[176px] overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-1 shadow-[var(--shadow-dropdown)]"
      style={anchoredStyle(anchor, 176, 144)}
    >
      <ContextMenuItem label={t('selection.menuLocalAi')} onClick={onExplain}>
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      </ContextMenuItem>
      <ContextMenuItem label={t('selection.addToChat')} onClick={onInsert} disabled={!canInsert}>
        <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      </ContextMenuItem>
      <ContextMenuItem label={t('selection.evidenceFocus')} onClick={onFocus} disabled={!canFocus}>
        <Radio className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      </ContextMenuItem>
      <ContextMenuItem label={t('selection.menuClose')} onClick={onClose}>
        <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      </ContextMenuItem>
    </div>
  )
}

function ContextMenuItem({
  children,
  label,
  onClick,
  disabled = false,
}: {
  children: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-full items-center gap-2 rounded-[7px] px-2 text-left text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-default disabled:opacity-45"
    >
      {children}
      <span className="truncate">{label}</span>
    </button>
  )
}

function SelectionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--color-text-tertiary)]">{label}</span>
      <span className="truncate font-mono text-[11px] text-[var(--color-text-secondary)]">{value}</span>
    </div>
  )
}

interface SelectionView {
  targetLabel: string
  tickLabel: string
  location?: string
  stateLabel?: string
  stateColor?: string
}

function describeSelection(selection: CanvasSelection, meta: AbmMeta | undefined, t: AbmT): SelectionView {
  const stateIndex = Number.isInteger(selection.state) ? selection.state : undefined
  const stateLabel =
    stateIndex !== undefined &&
    stateIndex !== EMPTY_STATE &&
    stateIndex >= 0 &&
    stateIndex < (meta?.palette.length ?? 0)
      ? meta?.palette[stateIndex]
      : undefined
  return {
    targetLabel: selection.kind === 'cell' ? t('selection.targetCell') : t('selection.targetAgent'),
    tickLabel: selection.tick !== undefined ? `tick ${selection.tick}` : t('selection.currentFrame'),
    ...(selection.x !== undefined && selection.y !== undefined ? { location: `(${selection.x}, ${selection.y})` } : {}),
    ...(stateLabel ? { stateLabel: legendLabel(stateLabel, useSettingsStore.getState().locale) } : {}),
    ...(stateIndex !== undefined && stateLabel ? { stateColor: colorHexForPaletteValue(stateLabel, stateIndex) } : {}),
  }
}

function buildSelectionPrompt(selection: CanvasSelection, view: SelectionView, t: AbmT): string {
  return t('selection.prompt', {
    tickLabel: view.tickLabel,
    targetLabel: view.targetLabel,
    index: selection.index,
    location: view.location ? t('selection.promptLocation', { location: view.location }) : '',
    state: view.stateLabel ? t('selection.promptState', { state: view.stateLabel }) : '',
  })
}

function nearestMetrics(points: Array<{ tick: number; metrics: Record<string, number> }>, tick: number): Record<string, number> | undefined {
  return [...points].sort((a, b) => Math.abs(a.tick - tick) - Math.abs(b.tick - tick))[0]?.metrics
}

function anchoredStyle(anchor: MiniExplainAnchor | undefined | null, width: number, height: number) {
  if (typeof window === 'undefined') return { left: 12, top: 12 }
  const baseX = anchor?.x ?? window.innerWidth / 2
  const baseY = anchor?.y ?? window.innerHeight / 2
  return {
    left: Math.max(12, Math.min(baseX + 12, window.innerWidth - width - 12)),
    top: Math.max(12, Math.min(baseY + 12, window.innerHeight - height - 12)),
  }
}

function CanvasButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)]/80 text-[var(--color-text-secondary)] backdrop-blur transition-colors hover:bg-[var(--color-surface-hover)]"
    >
      {children}
    </button>
  )
}

function buildRenderer(
  canvas: HTMLCanvasElement,
  meta: AbmMeta,
  setGlUnsupported: (value: boolean) => void,
): ActiveRenderer | null {
  if (meta.space === 'grid' && meta.grid) {
    return { kind: 'grid', renderer: new GridRasterRenderer(canvas, meta.grid.width, meta.grid.height), width: meta.grid.width }
  }
  if (meta.space === 'network' && meta.network) {
    const layout = decodeFloat32Base64(meta.network.layoutB64)
    const edges = decodeUint32Base64(meta.network.edgesB64)
    const renderer = new PointsGLRenderer(canvas, layout, edges, meta.palette)
    if (!renderer.ok) setGlUnsupported(true)
    return { kind: 'network', renderer }
  }
  return null
}

function sizeCanvas(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  dprRef: { current: number },
): void {
  const dpr = window.devicePixelRatio || 1
  dprRef.current = dpr
  const width = Math.max(1, Math.floor(container.clientWidth * dpr))
  const height = Math.max(1, Math.floor(container.clientHeight * dpr))
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
}

function buildAgentSnapshot(runId: string, tick: number, state: Uint8Array, palette: string[]) {
  const counts: Record<string, number> = {}
  const rowLimit = Math.min(1200, state.length)
  const rows: AgentSnapshotRow[] = []
  for (let index = 0; index < state.length; index += 1) {
    const stateIndex = state[index] ?? 255
    const stateLabel = palette[stateIndex] ?? (stateIndex === 255 ? 'empty' : `state-${stateIndex}`)
    counts[stateLabel] = (counts[stateLabel] ?? 0) + 1
    if (index < rowLimit) {
      rows.push({
        id: index,
        type: 'agent',
        stateIndex,
        stateLabel,
      })
    }
  }
  return { runId, tick, total: state.length, palette, rows, counts }
}

function defaultCameraForMeta(meta: AbmMeta | undefined, style: NetworkRenderStyle): Camera {
  if (!meta) return { ...IDENTITY_CAMERA }
  if (meta.space === 'network') {
    return {
      scale: Math.min(0.86, 0.86 / Math.max(0.7, style.layoutScale)),
      x: 0,
      y: 0,
    }
  }
  return { scale: 0.96, x: 0, y: 0 }
}
