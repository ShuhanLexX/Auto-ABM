import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Download, FlaskConical, ImageDown, Play, Sparkles, Square } from 'lucide-react'
import { abmClient } from '../api/abmClient'
import { useAbmStore } from '../stores/abmStore'
import type { AbmExperimentChartSpec, AbmExperimentControlSpec, AbmExperimentViewSpec } from '../chat/abmCard'
import type { ParameterSpec } from '../modelIntrospection'
import type { VizResolution, VizSpec, VizTable } from '../types'
import { ResultsChart } from './ResultsChart'
import { ExportDialog } from './ExportDialog'
import { useAbmText, type AbmTextKey } from '../i18n'

interface Props {
  simId: string | null
  parameters: ParameterSpec[]
}

/** AI-generated deep experiment view: result visualizations + parameter UI. */
export function ExperimentCanvas({ simId, parameters }: Props) {
  const t = useAbmText()
  const activeRunId = useAbmStore((s) => s.activeRunId)
  const run = useAbmStore((s) => (s.activeRunId ? s.runs[s.activeRunId] : undefined))
  const activeExperimentId = useAbmStore((s) => s.activeExperimentId)
  const experiment = useAbmStore((s) => (s.activeExperimentId ? s.experiments[s.activeExperimentId] : undefined))
  const startExperiment = useAbmStore((s) => s.startExperiment)
  const stopExperiment = useAbmStore((s) => s.stopExperiment)
  const runInterventionExperiment = useAbmStore((s) => s.runInterventionExperiment)
  const interventionRun = useAbmStore((s) => s.interventionRun)
  const runsMap = useAbmStore((s) => s.runs)
  const readOnly = useAbmStore((s) => s.mode === 'dialogue')
  const viewEntry = useAbmStore((s) => (simId ? s.experimentViews[simId] ?? s.experimentViews[''] : s.experimentViews['']))

  const spec = viewEntry?.view ?? null
  const availableMetrics = useMemo(() => {
    const keys = new Set<string>()
    for (const point of run?.ticks ?? []) for (const key of Object.keys(point.metrics)) keys.add(key)
    return [...keys]
  }, [run?.ticks])

  const effectiveView = useMemo<AbmExperimentViewSpec>(
    () => spec ?? defaultView(parameters, availableMetrics, t),
    [spec, parameters, availableMetrics, t],
  )

  const [controlDraft, setControlDraft] = useState<Record<string, string>>({})
  const [sweepParameter, setSweepParameter] = useState('')
  const [sweepValuesText, setSweepValuesText] = useState('')
  const [replications, setReplications] = useState(1)
  const [steps, setSteps] = useState(50)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolutions, setResolutions] = useState<Record<string, VizResolution | null>>({})
  const [vizError, setVizError] = useState<string | null>(null)

  // Intervention experiment: base vs a single scheduled parameter change.
  const [intervParam, setIntervParam] = useState('')
  const [intervTick, setIntervTick] = useState(20)
  const [intervValue, setIntervValue] = useState('')
  const [intervSeed, setIntervSeed] = useState(42)
  const [intervMetric, setIntervMetric] = useState('')
  const [intervRunning, setIntervRunning] = useState(false)
  const [intervError, setIntervError] = useState<string | null>(null)

  // Re-seed the drafts whenever the AI installs a new view spec.
  useEffect(() => {
    const nextDraft = Object.fromEntries(
      effectiveView.controls.map((control) => [control.id, control.value !== undefined ? String(control.value) : '']),
    )
    setControlDraft((current) => sameStringRecord(current, nextDraft) ? current : nextDraft)
    const sweep = effectiveView.controls.find((control) => control.role === 'sweep')
    const design = effectiveView.experiment
    setSweepParameter(design?.parameter ?? sweep?.id ?? '')
    setSweepValuesText((design?.values ?? sweep?.values ?? []).join(', '))
    if (design?.replications) setReplications(design.replications)
    if (design?.steps) setSteps(design.steps)
    setResolutions((current) => Object.keys(current).length === 0 ? current : {})
    setVizError((current) => current === null ? current : null)
  }, [viewEntry?.nonce, effectiveView])

  const completedCount = experiment?.progress.filter((p) => p.state === 'completed').length ?? 0
  const failedCount = experiment?.progress.filter((p) => p.state === 'failed').length ?? 0
  const isComplete = experiment?.status === 'completed'
  const isRunning = experiment?.status === 'running'

  const handleRunExperiment = async () => {
    if (!simId || starting) return
    if (readOnly) {
      setError(t('experiment.readonlyError'))
      return
    }
    const values = sweepValuesText
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (Number.isFinite(Number(part)) ? Number(part) : part))
    if (!sweepParameter.trim() || values.length === 0) {
      setError(t('experiment.missingSweepError'))
      return
    }
    const fixedParameters: Record<string, unknown> = {}
    for (const control of effectiveView.controls) {
      if (control.role === 'sweep' || control.id === sweepParameter) continue
      const raw = controlDraft[control.id]
      if (raw === undefined || raw.trim() === '') continue
      const asNumber = Number(raw)
      fixedParameters[control.id] = Number.isFinite(asNumber) && /^-?\d+(?:\.\d+)?$/.test(raw.trim()) ? asNumber : raw
    }
    setStarting(true)
    setError(null)
    setResolutions({})
    setVizError(null)
    try {
      await startExperiment(simId, {
        name: effectiveView.title || `${sweepParameter} parameter experiment`,
        parameter: sweepParameter.trim(),
        values,
        replications: Math.max(1, replications),
        steps: Math.max(1, steps),
        ...(Object.keys(fixedParameters).length > 0 ? { fixedParameters } : {}),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  const handleStopExperiment = async () => {
    if (!activeExperimentId || !isRunning || stopping) return
    setStopping(true)
    setError(null)
    try {
      await stopExperiment(activeExperimentId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStopping(false)
    }
  }

  // Resolve parameter-axis charts against real experiment data on completion.
  useEffect(() => {
    if (!isComplete || !activeExperimentId) return
    const parameterCharts = effectiveView.charts.filter((chart) => chart.xAxis === 'parameter')
    if (parameterCharts.length === 0 || !sweepParameter) return
    let cancelled = false
    setVizError(null)
    void Promise.all(
      parameterCharts.map(async (chart) => {
        const vizSpec: VizSpec = {
          chart: chart.type === 'scatter' ? 'scatter' : chart.type === 'bar' ? 'bar' : 'line',
          title: chart.title,
          data_ref: { source: 'experiment', id: activeExperimentId },
          encodings: [
            { field: sweepParameter, role: 'x' },
            ...chart.metrics.map((metric) => ({ field: `${metric}.final`, role: 'y' as const })),
          ],
        }
        try {
          const resolution = await abmClient.resolveViz(vizSpec)
          return [chart.id, resolution] as const
        } catch (err) {
          if (!cancelled) setVizError(err instanceof Error ? err.message : String(err))
          return [chart.id, null] as const
        }
      }),
    ).then((entries) => {
      if (!cancelled) setResolutions(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [isComplete, activeExperimentId, effectiveView.charts, sweepParameter])

  // Default the intervention parameter/metric once the model surfaces them.
  useEffect(() => {
    if (parameters.length === 0) return
    setIntervParam((current) => current || parameters[0]!.id)
  }, [parameters])

  useEffect(() => {
    const parameter = parameters.find((item) => item.id === intervParam)
    if (!parameter) return
    const preset = parameter.max !== undefined ? parameter.max : parameter.value
    setIntervValue(preset !== undefined && preset !== '' ? String(preset) : '')
  }, [intervParam, parameters])

  useEffect(() => {
    if (availableMetrics.length === 0) return
    setIntervMetric((current) => current || preferExperimentMetrics(availableMetrics)[0] || availableMetrics[0]!)
  }, [availableMetrics])

  const handleRunIntervention = async () => {
    if (!simId || intervRunning) return
    if (readOnly) {
      setIntervError(t('experiment.readonlyError'))
      return
    }
    if (!intervParam) {
      setIntervError(t('experiment.interventionMissingParam'))
      return
    }
    const numericValue = Number(intervValue)
    const value =
      intervValue.trim() !== '' && Number.isFinite(numericValue) ? numericValue : intervValue.trim()
    if (value === '') {
      setIntervError(t('experiment.interventionMissingValue'))
      return
    }
    const atTick = Math.max(1, Math.min(Math.max(2, steps) - 1, Math.trunc(intervTick)))
    const baseParams: Record<string, unknown> = {}
    for (const control of effectiveView.controls) {
      const raw = controlDraft[control.id]
      if (raw === undefined || raw.trim() === '') continue
      const asNumber = Number(raw)
      baseParams[control.id] =
        Number.isFinite(asNumber) && /^-?\d+(?:\.\d+)?$/.test(raw.trim()) ? asNumber : raw
    }
    setIntervRunning(true)
    setIntervError(null)
    try {
      await runInterventionExperiment(simId, {
        parameter: intervParam,
        atTick,
        value,
        seed: intervSeed,
        steps: Math.max(2, steps),
        ...(Object.keys(baseParams).length > 0 ? { params: baseParams } : {}),
      })
    } catch (err) {
      setIntervError(err instanceof Error ? err.message : String(err))
    } finally {
      setIntervRunning(false)
    }
  }

  const interventionTable = useMemo<VizTable | null>(() => {
    if (!interventionRun?.baseRunId || !interventionRun.treatedRunId || !intervMetric) return null
    const baseTicks = runsMap[interventionRun.baseRunId]?.ticks ?? []
    const treatedTicks = runsMap[interventionRun.treatedRunId]?.ticks ?? []
    if (baseTicks.length === 0 && treatedTicks.length === 0) return null
    const baseByTick = new Map(baseTicks.map((point) => [point.tick, point.metrics[intervMetric]]))
    const treatedByTick = new Map(treatedTicks.map((point) => [point.tick, point.metrics[intervMetric]]))
    const baseCol = t('experiment.interventionBaseSeries')
    const treatedCol = t('experiment.interventionTreatedSeries')
    const ticks = [...new Set([...baseByTick.keys(), ...treatedByTick.keys()])].sort((a, b) => a - b)
    return {
      columns: ['tick', baseCol, treatedCol],
      rows: ticks.map((tick) => ({
        tick,
        [baseCol]: baseByTick.get(tick),
        [treatedCol]: treatedByTick.get(tick),
      })),
    }
  }, [interventionRun, runsMap, intervMetric, t])

  const interventionSpec = useMemo<VizSpec | null>(() => {
    if (!interventionRun || !interventionTable) return null
    const baseCol = t('experiment.interventionBaseSeries')
    const treatedCol = t('experiment.interventionTreatedSeries')
    return {
      chart: 'line',
      title: t('experiment.interventionChartTitle', { metric: intervMetric }),
      data_ref: { source: 'run', id: interventionRun.treatedRunId ?? '' },
      encodings: [
        { field: 'tick', role: 'x' },
        { field: baseCol, role: 'y' },
        { field: treatedCol, role: 'y' },
      ],
      options: {
        referenceX: interventionRun.atTick,
        referenceLabel: t('experiment.interventionMarker', { tick: interventionRun.atTick }),
      },
    }
  }, [interventionRun, interventionTable, intervMetric, t])

  const statusLabel = experiment?.status === 'running'
    ? t('experiment.status.running', { count: completedCount + failedCount, total: experiment.total || '...' })
    : experiment?.status === 'completed'
      ? t('experiment.status.completed')
      : experiment?.status === 'stopped'
        ? t('experiment.status.stopped')
        : experiment?.status === 'failed'
          ? t('experiment.status.failed')
          : t('experiment.status.pending')

  return (
    <div className="grid h-full min-h-0 grid-cols-[360px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-r border-[var(--color-border)] p-4">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-primary)]">
            <FlaskConical className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {effectiveView.title}
          </h2>
          {effectiveView.intent ? (
            <span className="mt-1 inline-block rounded-full bg-[var(--color-brand)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--color-brand)]">
              {effectiveView.intent}
            </span>
          ) : null}
        </div>

        {effectiveView.controls.length > 0 ? (
          <Section title={t('experiment.section.params')}>
            <div className="grid gap-2">
              {effectiveView.controls.map((control) => (
                <ExperimentControl
                  key={control.id}
                  control={control}
                  value={controlDraft[control.id] ?? ''}
                  sweeping={control.role === 'sweep' || control.id === sweepParameter}
                  onChange={(next) => setControlDraft((draft) => ({ ...draft, [control.id]: next }))}
                />
              ))}
            </div>
          </Section>
        ) : null}

        <Section title={t('experiment.section.batch')}>
          <div className="grid gap-2">
            <label className="grid gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
              {t('experiment.sweepParameter')}
              <select
                value={sweepParameter}
                onChange={(event) => setSweepParameter(event.target.value)}
                className="h-8 w-full min-w-0 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs outline-none"
              >
                <option value="">{t('experiment.chooseParameter')}</option>
                {parameters.map((parameter) => (
                  <option key={parameter.id} value={parameter.id}>
                    {parameter.label === parameter.id ? parameter.id : `${parameter.label} (${parameter.id})`}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
              {t('experiment.valuesLabel')}
              <input
                value={sweepValuesText}
                onChange={(event) => setSweepValuesText(event.target.value)}
                placeholder="0.2, 0.4, 0.6"
                className="h-8 w-full min-w-0 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 font-mono text-[12px] outline-none focus-visible:border-[var(--color-border-focus)]"
              />
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <label className="grid min-w-0 gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
                {t('experiment.replications')}
                <input
                  type="number"
                  min={1}
                  value={replications}
                  onChange={(event) => setReplications(Math.max(1, Number(event.target.value) || 1))}
                  title={t('experiment.replicationsTitle')}
                  className="h-8 w-full min-w-0 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-right font-mono text-[12px] outline-none"
                />
              </label>
              <label className="grid min-w-0 gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
                {t('experiment.steps')}
                <input
                  type="number"
                  min={1}
                  value={steps}
                  onChange={(event) => setSteps(Math.max(1, Number(event.target.value) || 1))}
                  className="h-8 w-full min-w-0 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-right font-mono text-[12px] outline-none"
                />
              </label>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <button
              type="button"
              data-testid="experiment-canvas-run"
              onClick={() => void handleRunExperiment()}
              disabled={!simId || starting || readOnly || isRunning}
              title={readOnly ? t('experiment.readonlyTitle') : undefined}
              className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-[8px] bg-[var(--color-brand)] px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
            >
              <Play className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {starting ? t('experiment.starting') : t('experiment.run')}
            </button>
            <button
              type="button"
              data-testid="experiment-canvas-stop"
              onClick={() => void handleStopExperiment()}
              disabled={!activeExperimentId || !isRunning || stopping}
              aria-label={t('experiment.stopAria')}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-default disabled:opacity-50"
            >
              <Square className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {stopping ? t('experiment.stopping') : t('experiment.stop')}
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3 py-2 text-xs">
            <span className="text-[var(--color-text-tertiary)]">{t('experiment.status')}</span>
            <span className="font-medium text-[var(--color-text-primary)]">{statusLabel}</span>
          </div>
          {failedCount > 0 ? (
            <div className="mt-1 text-[11px] text-[var(--color-error)]">{t('experiment.failedRuns', { count: failedCount })}</div>
          ) : null}
          {error ? (
            <div className="mt-2 rounded-[8px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-xs text-[var(--color-error)]">
              {error}
            </div>
          ) : null}
        </Section>

        <Section title={t('experiment.section.intervention')}>
          <p className="mb-2 text-[11px] leading-4 text-[var(--color-text-tertiary)]">
            {t('experiment.interventionHint')}
          </p>
          <div className="grid gap-2">
            <label className="grid gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
              {t('experiment.interventionParameter')}
              <select
                value={intervParam}
                onChange={(event) => setIntervParam(event.target.value)}
                className="h-8 w-full min-w-0 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs outline-none"
              >
                <option value="">{t('experiment.chooseParameter')}</option>
                {parameters.map((parameter) => (
                  <option key={parameter.id} value={parameter.id}>
                    {parameter.label === parameter.id ? parameter.id : `${parameter.label} (${parameter.id})`}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <label className="grid min-w-0 gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
                {t('experiment.interventionTick')}
                <input
                  type="number"
                  min={1}
                  max={Math.max(2, steps) - 1}
                  value={intervTick}
                  onChange={(event) => setIntervTick(Math.max(1, Number(event.target.value) || 1))}
                  className="h-8 w-full min-w-0 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-right font-mono text-[12px] outline-none"
                />
              </label>
              <label className="grid min-w-0 gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
                {t('experiment.interventionValue')}
                <input
                  value={intervValue}
                  inputMode="decimal"
                  onChange={(event) => setIntervValue(event.target.value)}
                  className="h-8 w-full min-w-0 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-right font-mono text-[12px] outline-none focus-visible:border-[var(--color-border-focus)]"
                />
              </label>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <label className="grid min-w-0 gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
                {t('experiment.interventionSeed')}
                <input
                  type="number"
                  value={intervSeed}
                  onChange={(event) => setIntervSeed(Number(event.target.value) || 0)}
                  className="h-8 w-full min-w-0 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-right font-mono text-[12px] outline-none"
                />
              </label>
              <label className="grid min-w-0 gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
                {t('experiment.interventionMetric')}
                <select
                  value={intervMetric}
                  onChange={(event) => setIntervMetric(event.target.value)}
                  className="h-8 w-full min-w-0 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs outline-none"
                >
                  {availableMetrics.length === 0 ? (
                    <option value="">{t('experiment.interventionMetricPending')}</option>
                  ) : null}
                  {availableMetrics.map((metric) => (
                    <option key={metric} value={metric}>{metric}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <button
            type="button"
            data-testid="experiment-intervention-run"
            onClick={() => void handleRunIntervention()}
            disabled={!simId || intervRunning || readOnly || !intervParam}
            title={readOnly ? t('experiment.readonlyTitle') : undefined}
            className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] bg-[var(--color-brand)] px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
          >
            <Play className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {intervRunning ? t('experiment.interventionRunning') : t('experiment.interventionRun')}
          </button>

          <div className="mt-2 flex items-center justify-between rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3 py-2 text-xs">
            <span className="text-[var(--color-text-tertiary)]">{t('experiment.status')}</span>
            <span className="font-medium text-[var(--color-text-primary)]">
              {interventionRun?.status === 'running'
                ? t('experiment.interventionStatusRunning')
                : interventionRun?.status === 'completed'
                  ? t('experiment.interventionStatusDone')
                  : interventionRun?.status === 'failed'
                    ? t('experiment.interventionStatusFailed')
                    : t('experiment.status.pending')}
            </span>
          </div>
          {intervError ? (
            <div className="mt-2 rounded-[8px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-xs text-[var(--color-error)]">
              {intervError}
            </div>
          ) : null}
        </Section>

        <div className="mt-auto border-t border-[var(--color-border)] pt-2">
          <ExportDialog simId={simId} />
        </div>
      </aside>

      <main className="min-h-0 overflow-y-auto p-3">
        {!spec ? (
          <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[11px] text-[var(--color-text-tertiary)]">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand)]" strokeWidth={2} aria-hidden="true" />
            {t('experiment.defaultHint')}
          </div>
        ) : null}
        {vizError ? (
          <div className="mb-3 rounded-[10px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-xs text-[var(--color-error)]">
            {vizError}
          </div>
        ) : null}
        {interventionRun && interventionSpec && interventionTable ? (
          <div
            data-testid="experiment-intervention-chart"
            className="mb-3 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="truncate text-xs font-semibold text-[var(--color-text-primary)]">
                {t('experiment.interventionChartTitle', { metric: intervMetric })}
              </h3>
              <span className="text-[10px] text-[var(--color-text-tertiary)]">
                {t('experiment.interventionCompareTag')}
              </span>
            </div>
            <div className="min-h-[240px]">
              <ResultsChart spec={interventionSpec} data={interventionTable} showTitle={false} />
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              {t('experiment.interventionCaption', {
                parameter: intervParam,
                value: String(interventionRun.value ?? ''),
                tick: interventionRun.atTick,
              })}
            </p>
          </div>
        ) : null}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
          {effectiveView.charts.map((chart) => (
            <ChartCard
              key={chart.id}
              chart={chart}
              runTicks={run?.ticks ?? []}
              runId={activeRunId}
              resolution={resolutions[chart.id] ?? null}
              experimentDone={Boolean(isComplete)}
              t={t}
            />
          ))}
          {effectiveView.charts.length === 0 ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-[10px] border border-dashed border-[var(--color-border)] text-sm text-[var(--color-text-tertiary)]">
              {t('experiment.emptyCharts')}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-3">
      <div className="mb-2 text-xs font-semibold text-[var(--color-text-primary)]">{title}</div>
      {children}
    </section>
  )
}

function sameStringRecord(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a).sort()
  const bKeys = Object.keys(b).sort()
  return aKeys.length === bKeys.length &&
    aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key])
}

function ExperimentControl({
  control,
  value,
  sweeping,
  onChange,
}: {
  control: AbmExperimentControlSpec
  value: string
  sweeping: boolean
  onChange: (value: string) => void
}) {
  const numeric = Number(value)
  const hasRange = control.kind === 'slider' && control.min !== undefined && control.max !== undefined
  return (
    <label className="grid gap-1.5 rounded-[7px] bg-[var(--color-surface)]/72 px-2.5 py-2 text-[11px] font-medium text-[var(--color-text-secondary)]">
      <span className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate" title={control.label}>
          {control.label}
            {sweeping ? <span className="ml-1 rounded-full bg-[var(--color-brand)]/10 px-1.5 text-[9px] text-[var(--color-brand)]">sweep</span> : null}
          </span>
          {control.description ? (
            <span className="block truncate text-[10px] font-normal text-[var(--color-text-tertiary)]" title={control.description}>
              {control.description}
            </span>
          ) : null}
        </span>
      </span>
      {control.kind === 'select' && control.options ? (
        <select
          value={value}
          disabled={sweeping}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2 text-[12px] outline-none disabled:opacity-55"
        >
          {control.options.map((option) => (
            <option key={String(option)} value={String(option)}>{String(option)}</option>
          ))}
        </select>
      ) : (
        <input
          value={sweeping ? (control.values ?? []).join(', ') || value : value}
          disabled={sweeping}
          inputMode="decimal"
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2 text-right font-mono text-[12px] text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-border-focus)] disabled:opacity-55"
        />
      )}
      {hasRange && !sweeping ? (
        <input
          type="range"
          min={control.min}
          max={control.max}
          step={control.step ?? (control.max! - control.min!) / 100}
          value={Number.isFinite(numeric) ? numeric : control.min}
          onChange={(event) => onChange(event.target.value)}
          className="h-2 accent-[var(--color-brand)]"
        />
      ) : null}
    </label>
  )
}

function ChartCard({
  chart,
  runTicks,
  runId,
  resolution,
  experimentDone,
  t,
}: {
  chart: AbmExperimentChartSpec
  runTicks: Array<{ tick: number; metrics: Record<string, number> }>
  runId: string | null
  resolution: VizResolution | null
  experimentDone: boolean
  t: (key: AbmTextKey, params?: Record<string, string | number>) => string
}) {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const isParameterChart = chart.xAxis === 'parameter'
  let exportSpec: VizSpec | null = null
  let exportData: VizTable | null = null

  let body: ReactNode
  if (isParameterChart) {
    if (resolution) {
      exportSpec = resolution.spec
      exportData = resolution.data
      body = <ResultsChart spec={resolution.spec} data={resolution.data} showTitle={false} />
    } else {
      body = (
        <div className="flex h-full min-h-[180px] items-center justify-center text-xs text-[var(--color-text-tertiary)]">
          {experimentDone ? t('experiment.generatingChart') : t('experiment.parameterChartEmpty')}
        </div>
      )
    }
  } else {
    const table = tickTable(runTicks, chart.metrics)
    if (table.rows.length === 0 || !runId) {
      body = (
        <div className="flex h-full min-h-[180px] items-center justify-center text-xs text-[var(--color-text-tertiary)]">
          {t('experiment.runChartEmpty', { metrics: chart.metrics.join(' / ') })}
        </div>
      )
    } else {
      const spec: VizSpec = {
        chart: 'line',
        data_ref: { source: 'run', id: runId },
        encodings: [
          { field: 'tick', role: 'x' },
          ...chart.metrics.map((metric) => ({ field: metric, role: 'y' as const })),
        ],
      }
      exportSpec = spec
      exportData = table
      body = <ResultsChart spec={spec} data={table} showTitle={false} />
    }
  }
  const canExport = Boolean(exportSpec && exportData && exportData.rows.length > 0)

  return (
    <div className="flex min-h-[260px] flex-col rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{chart.title}</h3>
        <div className="flex shrink-0 items-center gap-1">
          <span className="mr-1 text-[10px] text-[var(--color-text-tertiary)]">
            {isParameterChart ? t('experiment.parameterCompare') : t('experiment.tickEvolution')}
          </span>
          <button
            type="button"
            disabled={!canExport}
            title={t('experiment.exportData')}
            onClick={() => exportSpec && exportData && downloadChartData(chart.title, exportSpec, exportData)}
            className="inline-flex h-7 items-center gap-1 rounded-[7px] border border-[var(--color-border)] px-2 text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:cursor-default disabled:opacity-45"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {t('experiment.exportData')}
          </button>
          <button
            type="button"
            disabled={!canExport}
            title={t('experiment.exportImage')}
            onClick={() => void downloadChartImage(chartRef.current, chart.title)}
            className="inline-flex h-7 items-center gap-1 rounded-[7px] border border-[var(--color-border)] px-2 text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:cursor-default disabled:opacity-45"
          >
            <ImageDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {t('experiment.exportImage')}
          </button>
        </div>
      </div>
      {chart.note ? <div className="mb-1 truncate text-[10px] text-[var(--color-text-tertiary)]">{chart.note}</div> : null}
      <div ref={chartRef} className="min-h-0 flex-1">{body}</div>
    </div>
  )
}

function downloadChartData(title: string, spec: VizSpec, data: VizTable): void {
  const metadata = [`# ${title}`, `# chart=${spec.chart}`, `# x=${spec.encodings.find((encoding) => encoding.role === 'x')?.field ?? ''}`]
  const csv = [...metadata, toCsv(data)].join('\n')
  downloadBlob(`${csv}\n`, 'text/csv;charset=utf-8', `${safeFilename(title)}.csv`)
}

async function downloadChartImage(container: HTMLDivElement | null, title: string): Promise<void> {
  const svg = container?.querySelector('svg')
  if (!svg) return
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const xml = new XMLSerializer().serializeToString(clone)
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  try {
    const image = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = image.width || 1280
    canvas.height = image.height || 600
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (png) downloadBlob(png, 'image/png', `${safeFilename(title)}.png`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to export chart image'))
    image.src = url
  })
}

function toCsv(data: VizTable): string {
  const columns = data.columns
  const rows = data.rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))
  return [columns.map(csvCell).join(','), ...rows].join('\n')
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadBlob(content: BlobPart | Blob, type: string, filename: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function safeFilename(value: string): string {
  return (value || 'chart')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80)
}

/** Build a real-data table from the live run's tick metrics (no fabrication). */
function tickTable(ticks: Array<{ tick: number; metrics: Record<string, number> }>, metrics: string[]): VizTable {
  return {
    columns: ['tick', ...metrics],
    rows: ticks.map((point) => ({
      tick: point.tick,
      ...Object.fromEntries(metrics.map((metric) => [metric, point.metrics[metric]])),
    })),
  }
}

/** Fallback view before the AI generates one: preferred metrics + sweep design. */
function defaultView(
  parameters: ParameterSpec[],
  metrics: string[],
  t: (key: AbmTextKey, params?: Record<string, string | number>) => string,
): AbmExperimentViewSpec {
  const shown = preferExperimentMetrics(metrics).slice(0, 4)
  const charts: AbmExperimentChartSpec[] = []
  if (shown.length > 0) {
    charts.push({ id: 'default-ticks', title: t('experiment.defaultTickChart'), type: 'line', metrics: shown, xAxis: 'tick' })
    charts.push({
      id: 'default-final',
      title: t('experiment.defaultFinalChart'),
      type: 'bar',
      metrics: shown.slice(0, 2),
      xAxis: 'parameter',
    })
  }
  const controls: AbmExperimentControlSpec[] = parameters.slice(0, 8).map((parameter) => ({
    id: parameter.id,
    label: parameter.label,
    kind: parameter.min !== undefined && parameter.max !== undefined ? 'slider' : 'input',
    ...(parameter.min !== undefined ? { min: parameter.min } : {}),
    ...(parameter.max !== undefined ? { max: parameter.max } : {}),
    ...(parameter.step !== undefined ? { step: parameter.step } : {}),
    ...(parameter.value !== undefined && parameter.value !== '' ? { value: parameter.value } : {}),
    ...(parameter.description ? { description: parameter.description } : {}),
    role: 'fixed',
  }))
  return {
    title: t('experiment.title'),
    charts,
    controls,
  }
}

function preferExperimentMetrics(metrics: string[]): string[] {
  const priority = [
    'infected',
    'burning',
    'burned_rate',
    'adoption_rate',
    'cooperation_rate',
    'opinion_variance',
    'clusters',
    'opinion_mean',
  ]
  return [
    ...priority.filter((key) => metrics.includes(key)),
    ...metrics,
  ].filter((key, index, all) => all.indexOf(key) === index)
}
