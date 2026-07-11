import { useEffect, useMemo, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { abmClient } from '../api/abmClient'
import { useAbmStore } from '../stores/abmStore'
import type { ExperimentSummary, VizResolution, VizSpec } from '../types'
import { ResultsChart } from './ResultsChart'
import { useAbmText } from '../i18n'

interface Props {
  simId: string | null
}

/** Parse a comma list into numbers where possible, else keep the trimmed string. */
function parseValues(text: string): unknown[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => (part !== '' && Number.isFinite(Number(part)) ? Number(part) : part))
}

/**
 * @Simulation single-param sweep (P3 Task 5). Configure a parameter + value list
 * + replications, run the batch, watch per-run progress stream in, then compare
 * a chosen metric across the swept values with the whitelist ResultsChart. The
 * chart data comes only from real RunRecords resolved server-side.
 */
export function ExperimentPanel({ simId }: Props) {
  const t = useAbmText()
  const [parameter, setParameter] = useState('')
  const [valuesText, setValuesText] = useState('')
  const [replications, setReplications] = useState(1)
  const [steps, setSteps] = useState(50)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [metric, setMetric] = useState<string | null>(null)
  const [summary, setSummary] = useState<ExperimentSummary | null>(null)
  const [resolution, setResolution] = useState<VizResolution | null>(null)
  const [vizError, setVizError] = useState<string | null>(null)

  const readOnly = useAbmStore((s) => s.mode === 'dialogue')
  const startExperiment = useAbmStore((s) => s.startExperiment)
  const activeExperimentId = useAbmStore((s) => s.activeExperimentId)
  const experiment = useAbmStore((s) =>
    activeExperimentId ? s.experiments[activeExperimentId] : undefined,
  )

  const completedCount = experiment?.progress.filter((p) => p.state === 'completed').length ?? 0
  const failedCount = experiment?.progress.filter((p) => p.state === 'failed').length ?? 0
  const isComplete = experiment?.status === 'completed'

  const handleRun = async () => {
    if (!simId || starting || readOnly) {
      if (readOnly) setError(t('experiment.readonlyError'))
      return
    }
    const values = parseValues(valuesText)
    if (!parameter.trim()) {
      setError(t('experiment.missingParameterError'))
      return
    }
    if (values.length === 0) {
      setError(t('experiment.missingValuesError'))
      return
    }
    setStarting(true)
    setError(null)
    setSummary(null)
    setResolution(null)
    setVizError(null)
    try {
      await startExperiment(simId, {
        name: `${parameter.trim()} parameter sweep`,
        parameter: parameter.trim(),
        values,
        replications: Math.max(1, replications),
        steps: Math.max(1, steps),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  // On completion, load the experiment summary and default the compared metric.
  useEffect(() => {
    if (!isComplete || !activeExperimentId || summary) return
    let cancelled = false
    void abmClient
      .getExperiment(activeExperimentId)
      .then((result) => {
        if (cancelled) return
        setSummary(result)
        setMetric((current) => current ?? result.experiment.config.collect_metrics[0] ?? null)
      })
      .catch((err) => {
        if (!cancelled) setVizError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [isComplete, activeExperimentId, summary])

  // Resolve the comparison chart (param vs <metric>.final) from real run data.
  useEffect(() => {
    if (!summary || !metric || !activeExperimentId) return
    const spec: VizSpec = {
      chart: 'bar',
      title: t('experiment.finalVsParameter', { metric, parameter }),
      data_ref: { source: 'experiment', id: activeExperimentId },
      encodings: [
        { field: parameter, role: 'x' },
        { field: `${metric}.final`, role: 'y' },
      ],
    }
    let cancelled = false
    setVizError(null)
    void abmClient
      .resolveViz(spec)
      .then((result) => {
        if (!cancelled) setResolution(result)
      })
      .catch((err) => {
        if (!cancelled) {
          setResolution(null)
          setVizError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [summary, metric, activeExperimentId, parameter, t])

  const metricOptions = useMemo(
    () => summary?.experiment.config.collect_metrics ?? [],
    [summary],
  )

  const inputClass =
    'h-9 w-full min-w-0 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-border-focus)]'
  const labelClass = 'flex min-w-0 flex-col gap-1 text-xs font-medium text-[var(--color-text-secondary)]'
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
    <div data-testid="experiment-panel" className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-primary)]">
          <FlaskConical className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          {t('experiment.searchTitle')}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
          {t('experiment.searchSubtitle')}
        </p>
      </div>

      <label className={labelClass}>
        {t('experiment.parameter')}
        <input
          value={parameter}
          onChange={(event) => setParameter(event.target.value)}
          placeholder={t('experiment.parameterPlaceholder')}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        {t('experiment.valuesLabel')}
        <input
          value={valuesText}
          onChange={(event) => setValuesText(event.target.value)}
          placeholder="0.05, 0.1, 0.2"
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <label className={labelClass}>
          {t('experiment.replications')}
          <input
            type="number"
            min={1}
            value={replications}
            onChange={(event) => setReplications(Number(event.target.value))}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          {t('experiment.steps')}
          <input
            type="number"
            min={1}
            value={steps}
            onChange={(event) => setSteps(Number(event.target.value))}
            className={inputClass}
          />
        </label>
      </div>

      <button
        type="button"
        data-testid="experiment-run-button"
        onClick={() => void handleRun()}
        disabled={!simId || starting || readOnly}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-[var(--color-brand)] px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
      >
        <FlaskConical className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        {starting ? t('experiment.starting') : t('experiment.runSweep')}
      </button>

      {error ? (
        <div className="rounded-[10px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-xs text-[var(--color-error)]">
          {error}
        </div>
      ) : null}

      {experiment ? (
        <div
          data-testid="experiment-progress"
          className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3 py-2 text-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-tertiary)]">{t('experiment.progress')}</span>
            <span className="font-medium text-[var(--color-text-primary)]">
              {completedCount + failedCount} / {experiment.total || '...'}
            </span>
          </div>
          {failedCount > 0 ? (
            <div data-testid="experiment-failed" className="mt-1 text-[var(--color-error)]">
              {t('experiment.failedRuns', { count: failedCount })}
            </div>
          ) : null}
          <div className="mt-1 text-[var(--color-text-tertiary)]">{t('experiment.status')}: {statusLabel}</div>
        </div>
      ) : null}

      {isComplete ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {metricOptions.length > 0 ? (
            <label className={labelClass}>
              {t('experiment.compareMetric')}
              <select
                data-testid="experiment-metric"
                value={metric ?? ''}
                onChange={(event) => setMetric(event.target.value)}
                className={inputClass}
              >
                {metricOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="min-h-[160px] flex-1">
            {resolution ? (
              <ResultsChart spec={resolution.spec} data={resolution.data} />
            ) : vizError ? (
              <div className="rounded-[10px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-xs text-[var(--color-error)]">
                {vizError}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-[var(--color-text-tertiary)]">
                {t('experiment.generatingResults')}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
