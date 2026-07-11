import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Play, RotateCcw, Square } from 'lucide-react'
import { useAbmStore } from '../stores/abmStore'
import type { ParameterSpec } from '../modelIntrospection'
import { useAbmText } from '../i18n'

interface RunPanelProps {
  simId: string | null
  defaults: { seed: number; steps: number; params?: Record<string, unknown> }
  parameters?: ParameterSpec[]
  agentCounts?: Record<string, number>
  /** Persist edited initialization agent counts into the model config before a run. */
  onCommitAgentCounts?: (counts: Record<string, number>) => Promise<void>
}

interface NumericRange {
  min: number
  max: number
  step: number
}

const EMPTY_PARAMETERS: ParameterSpec[] = []
const EMPTY_AGENT_COUNTS: Record<string, number> = {}

export function RunPanel({
  simId,
  defaults,
  parameters = EMPTY_PARAMETERS,
  agentCounts = EMPTY_AGENT_COUNTS,
  onCommitAgentCounts,
}: RunPanelProps) {
  const t = useAbmText()
  const [seed, setSeed] = useState(defaults.seed)
  const [steps, setSteps] = useState(defaults.steps)
  const [paramDraft, setParamDraft] = useState<Record<string, string>>({})
  const [agentCountDraft, setAgentCountDraft] = useState<Record<string, string>>({})
  const [sampleEvery, setSampleEvery] = useState(1)
  const [agentCap, setAgentCap] = useState('')
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeRunId = useAbmStore((store) => store.activeRunId)
  const readOnly = useAbmStore((store) => store.mode === 'dialogue')
  const run = useAbmStore((store) => (activeRunId ? store.runs[activeRunId] : undefined))
  const startRun = useAbmStore((store) => store.startRun)
  const stopRun = useAbmStore((store) => store.stopRun)
  const reset = useAbmStore((store) => store.reset)
  const playbackSpeed = useAbmStore((store) => store.playbackSpeed)
  const setPlaybackSpeed = useAbmStore((store) => store.setPlaybackSpeed)
  const setPlaybackTick = useAbmStore((store) => store.setPlaybackTick)
  const playbackTick = useAbmStore((store) => (activeRunId ? store.playbackTicks[activeRunId] : undefined))

  // Only declared model parameters get controls: they carry a proper (Chinese)
  // name, dtype and range. Ad-hoc interface leftovers are still sent with the
  // run but hidden here to avoid a mixed-language wall of unknown knobs.
  const visibleParameters = useMemo(() => {
    const declared = parameters.filter((parameter) => parameter.declared !== false)
    return declared.length > 0 ? declared : parameters
  }, [parameters])

  useEffect(() => {
    setSeed(defaults.seed)
    setSteps(defaults.steps)
    setParamDraft(
      Object.fromEntries(
        visibleParameters.map((parameter) => [parameter.id, String(parameter.value ?? '')]),
      ),
    )
    setAgentCountDraft(Object.fromEntries(Object.entries(agentCounts).map(([key, value]) => [key, String(value)])))
  }, [agentCounts, defaults.seed, defaults.steps, visibleParameters])

  const populationParameter = useMemo(() => findPopulationParameter(parameters), [parameters])
  const totalAgents = useMemo(() => sumDraftCounts(agentCountDraft), [agentCountDraft])

  const runParams = useMemo(() => {
    const params: Record<string, unknown> = { ...(defaults.params ?? {}) }
    for (const parameter of visibleParameters) {
      const raw = paramDraft[parameter.id]
      if (raw === undefined || raw.trim() === '') continue
      const asNumber = Number(raw)
      params[parameter.id] = Number.isFinite(asNumber) && /^-?\d+(?:\.\d+)?$/.test(raw.trim())
        ? asNumber
        : raw
    }
    if (populationParameter && totalAgents > 0) params[populationParameter.id] = totalAgents
    return params
  }, [defaults.params, paramDraft, visibleParameters, populationParameter, totalAgents])

  const handleRun = async () => {
    if (!simId || starting) return
    if (readOnly) {
      setError(t('run.readonlyError'))
      return
    }
    setStarting(true)
    setError(null)
    try {
      // Structural initialization sizes live in the model config, not run
      // params — persist them first so the kernel initializes with them.
      if (onCommitAgentCounts && !populationParameter) {
        const edited: Record<string, number> = {}
        let changed = false
        for (const [type, fallback] of Object.entries(agentCounts)) {
          const parsed = Number(agentCountDraft[type])
          const next = Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback
          edited[type] = next
          if (next !== fallback) changed = true
        }
        if (changed) await onCommitAgentCounts(edited)
      }
      const cap = Number(agentCap)
      await startRun(simId, {
        seed,
        steps,
        params: runParams,
        spaceSampleRate: Math.max(1, Math.round(sampleEvery)),
        ...(agentCap.trim() !== '' && Number.isFinite(cap) && cap > 0 ? { spaceAgentCap: cap } : {}),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  const handleStop = async () => {
    if (!activeRunId || stopping) return
    const currentRun = useAbmStore.getState().runs[activeRunId]
    const rawTick = currentRun?.ticks.at(-1)?.tick ?? 0
    const renderedTick = useAbmStore.getState().playbackTicks[activeRunId]
    const replaying = currentRun?.state === 'completed' && renderedTick !== undefined && renderedTick < rawTick
    if (replaying) {
      setPlaybackTick(activeRunId, rawTick)
      return
    }
    if (currentRun?.state !== 'running') return
    setStopping(true)
    setError(null)
    try {
      await stopRun(activeRunId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStopping(false)
    }
  }

  const rawLastTick = run?.ticks.at(-1)?.tick ?? 0
  const lastTick = playbackTick ?? rawLastTick
  const replayingBufferedFrames = run?.state === 'completed' && playbackTick !== undefined && playbackTick < rawLastTick
  const visualRunActive = run?.state === 'running' || replayingBufferedFrames
  const progressPercent = run
    ? Math.max(0, Math.min(100, (lastTick / Math.max(1, run.totalSteps ?? steps)) * 100))
    : 0
  const statusLabel = run
    ? visualRunActive
      ? t('run.status.running', { tick: lastTick, total: run.totalSteps ? ` / ${run.totalSteps}` : '' })
      : run.state === 'completed'
        ? t('run.status.completed')
        : t('run.status.failed')
    : t('run.status.pending')

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{t('run.title')}</h2>
        </div>
      </div>

      <PanelSection title={t('run.section.control')}>
        <div className="grid gap-2">
          <CompactNumberInput label={t('run.seed')} value={seed} min={0} step={1} onChange={setSeed} />
          <NumericControl
            label={t('run.steps')}
            value={String(steps)}
            range={{ min: 10, max: Math.max(1000, steps * 2), step: 10 }}
            onChange={(value) => setSteps(Math.max(1, Math.round(Number(value) || 1)))}
          />
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <label className="grid min-w-0 gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
              {t('run.sampleEvery')}
              <input
                type="number"
                min={1}
                value={sampleEvery}
                onChange={(event) => setSampleEvery(Math.max(1, Number(event.target.value) || 1))}
                title={t('run.sampleEveryTitle')}
                className="h-8 w-full min-w-0 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-right font-mono text-[12px] text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-border-focus)]"
              />
            </label>

            <label className="grid min-w-0 gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
              {t('run.playbackSpeed')}
              <select
                value={playbackSpeed}
                onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
                title={t('run.playbackSpeedTitle')}
                className="h-8 w-full min-w-0 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-right font-mono text-[12px] text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-border-focus)]"
              >
                <option value={0.1}>0.1x</option>
                <option value={0.25}>0.25x</option>
                <option value={0.5}>0.5x</option>
                <option value={0.75}>0.75x</option>
                <option value={1}>1x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
            {t('run.renderCap')}
            <input
              type="number"
              min={0}
              value={agentCap}
              placeholder={t('run.renderCapPlaceholder')}
              onChange={(event) => setAgentCap(event.target.value)}
              title={t('run.renderCapTitle')}
              className="h-8 w-full min-w-0 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-right font-mono text-[12px] text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-border-focus)]"
            />
          </label>
        </div>
      </PanelSection>

      {Object.keys(agentCounts).length > 0 ? (
        <PanelSection
          title={t('run.agentScale')}
          badge={totalAgents.toLocaleString()}
        >
          <div className="grid gap-2">
            {Object.entries(agentCounts).slice(0, 6).map(([type, fallback]) => {
              const current = agentCountDraft[type] ?? String(fallback)
              const range = inferAgentCountRange(current)
              return (
                <NumericControl
                  key={type}
                  label={type}
                  value={current}
                  range={range}
                  disabled={!populationParameter && !onCommitAgentCounts}
                  onChange={(value) => setAgentCountDraft((draft) => ({ ...draft, [type]: value }))}
                />
              )
            })}
          </div>
          <div className="mt-2 rounded-[7px] bg-[var(--color-brand)]/8 px-2 py-1 text-[10px] text-[var(--color-brand)]">
            {populationParameter ? t('run.agentScaleLinked', { id: populationParameter.id }) : t('run.agentScalePersisted')}
          </div>
        </PanelSection>
      ) : null}

      {visibleParameters.length > 0 ? (
        <PanelSection title={t('run.modelParameters')}>
          <div className="grid gap-2">
            {visibleParameters.slice(0, 12).map((parameter) => {
              const value = paramDraft[parameter.id] ?? ''
              const range = inferParameterRange(parameter, value)
              return (
                <NumericControl
                  key={parameter.id}
                  label={parameter.label}
                  description={parameter.description}
                  value={value}
                  range={range}
                  onChange={(next) => setParamDraft((draft) => ({ ...draft, [parameter.id]: next }))}
                />
              )
            })}
          </div>
          {visibleParameters.length > 12 ? (
            <div className="mt-2 text-[10px] text-[var(--color-text-tertiary)]">{t('run.moreParameters', { count: visibleParameters.length - 12 })}</div>
          ) : null}
        </PanelSection>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-3 -mb-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 p-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="abm-run-button"
            onClick={() => void handleRun()}
            disabled={!simId || starting || readOnly || visualRunActive}
            title={readOnly ? t('run.readonlyError') : undefined}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-[var(--color-brand)] px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
          >
            <Play className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {starting ? t('run.starting') : t('run.run')}
          </button>
          <button
            type="button"
            data-testid="abm-stop-button"
            onClick={() => void handleStop()}
            disabled={!activeRunId || !visualRunActive || stopping}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-default disabled:opacity-50"
            aria-label={t('run.stopAria')}
          >
            <Square className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {stopping ? t('run.stopping') : t('run.stop')}
          </button>
          <button
            type="button"
            onClick={() => activeRunId && reset(activeRunId)}
            disabled={!activeRunId}
            className="grid h-9 w-9 place-items-center rounded-[8px] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-default disabled:opacity-50"
            aria-label={t('run.clearAria')}
          >
            <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-2 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--color-text-tertiary)]">{t('run.status')}</span>
            <span className="truncate font-medium text-[var(--color-text-primary)]">{statusLabel}</span>
          </div>
          {run ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-container)]">
              <div
                data-testid="abm-run-progress"
                className="h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-150"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          ) : null}
          {run?.record && (
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-[var(--color-text-tertiary)]">{t('run.record')}</span>
              <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">{run.record.id.slice(0, 12)}</span>
            </div>
          )}
        </div>

        {(error || run?.error) && (
          <div className="mt-2 rounded-[8px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-xs text-[var(--color-error)]">
            {error || run?.error}
          </div>
        )}
      </div>
    </div>
  )
}

function PanelSection({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string
  subtitle?: string
  badge?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-2.5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[var(--color-text-primary)]">{title}</div>
          {subtitle ? <div className="mt-0.5 truncate text-[10px] text-[var(--color-text-tertiary)]">{subtitle}</div> : null}
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full bg-[var(--color-surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]">
            {badge}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function NumericControl({
  label,
  description,
  value,
  range,
  disabled = false,
  onChange,
}: {
  label: string
  description?: string
  value: string
  range: NumericRange | null
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const numericValue = parseNumeric(value)
  const sliderValue = range && numericValue !== null
    ? clampNumber(numericValue, range.min, range.max)
    : range?.min ?? 0

  return (
    <label className="grid gap-1.5 rounded-[7px] bg-[var(--color-surface)]/72 px-2 py-1.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
      <span className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate" title={label}>{label}</span>
          {description ? (
            <span className="block truncate text-[10px] font-normal text-[var(--color-text-tertiary)]" title={description}>
              {description}
            </span>
          ) : null}
        </span>
        <input
          value={value}
          disabled={disabled}
          inputMode="decimal"
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-[78px] shrink-0 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2 text-right font-mono text-[12px] text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-border-focus)] disabled:opacity-55"
        />
      </span>
      {range ? (
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={sliderValue}
          disabled={disabled}
          onChange={(event) => onChange(formatNumber(Number(event.target.value), range.step))}
          className="h-2 accent-[var(--color-brand)] disabled:opacity-55"
        />
      ) : null}
    </label>
  )
}

function CompactNumberInput({
  label,
  value,
  min,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="grid min-w-0 gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
      {label}
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-8 w-full min-w-0 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-right font-mono text-[12px] text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-border-focus)]"
      />
    </label>
  )
}

function findPopulationParameter(parameters: ParameterSpec[]): ParameterSpec | null {
  const populationIds = new Set(['population', 'n', 'agent_count', 'agentCount', 'agents', 'num_agents'])
  return parameters.find((parameter) => populationIds.has(parameter.id)) ?? null
}

function inferAgentCountRange(_value: string): NumericRange | null {
  return null
}

/**
 * A slider only appears where the model config declares a trustworthy bounded
 * range. Unbounded parameters get a plain numeric input so the UI does not
 * invent fake limits.
 */
function inferParameterRange(parameter: ParameterSpec, draftValue: string): NumericRange | null {
  const current = parseNumeric(draftValue)
  if (current === null) return null

  let min = parameter.min
  let max = parameter.max
  let step = parameter.step

  if (min === undefined || max === undefined) return null

  min = Math.min(min, current)
  max = Math.max(max, current)
  step ??= Number.isInteger(current) ? 1 : 0.01
  if (max <= min) max = min + step

  return { min, max, step }
}

function sumDraftCounts(counts: Record<string, string>): number {
  return Object.values(counts).reduce((sum, value) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? sum + Math.max(0, Math.round(parsed)) : sum
  }, 0)
}

function parseNumeric(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatNumber(value: number, step: number): string {
  if (Number.isInteger(step)) return String(Math.round(value))
  const decimals = Math.min(4, Math.max(0, String(step).split('.')[1]?.length ?? 0))
  return value.toFixed(decimals).replace(/\.?0+$/, '')
}
