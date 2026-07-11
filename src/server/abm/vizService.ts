/**
 * VizSpec data resolution — P3 Task 3 (docs/ai/impl/plans/P3-experiment-repro.md).
 *
 * Generative UI with a truthfulness guarantee (constitution P2): the AI emits a
 * declarative VizSpec (chart type + data_ref + encodings) and NEVER the data
 * itself. This module resolves the real tabular data the spec points at —
 * RunRecord.metrics_summary (run), the experiment's RunRecords (experiment), or
 * a trace tick-metrics slice (trace) — and validates that every encoding binds
 * to a column that actually exists. A spec that binds to a non-existent column
 * is rejected (we never fabricate a column to satisfy the chart).
 *
 * Pure table builders are split out so resolution logic is unit-testable without
 * disk IO (mirrors explainService's assemble/build split).
 */

import { getExperimentById, getRunRecordById, resolveRunLocation } from './abmStore.fs.js'
import { readTraceRecords, type TraceRecord } from './traceRead.js'
import { traceFile } from './storagePaths.js'
import type { AbmExperiment, RunRecord, VizSpec, VizTable } from './types.js'

export class VizValidationError extends Error {
  constructor(
    message: string,
    readonly missingFields: string[],
  ) {
    super(message)
    this.name = 'VizValidationError'
  }
}

export class VizNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VizNotFoundError'
  }
}

/** Encoding fields absent from the resolved columns (mirror of viz.py::missing_fields). */
export function missingFields(spec: VizSpec, columns: string[]): string[] {
  const known = new Set(columns)
  const missing: string[] = []
  for (const enc of spec.encodings) {
    if (!known.has(enc.field) && !missing.includes(enc.field)) missing.push(enc.field)
  }
  return missing
}

function orderedUnion(into: string[], keys: Iterable<string>): void {
  for (const key of keys) if (!into.includes(key)) into.push(key)
}

/**
 * One row per observed metric, columns = ['metric', ...stat names]. Lets a bar
 * chart show e.g. the final value per metric for a single run.
 */
export function runMetricsTable(record: RunRecord): VizTable {
  const columns: string[] = ['metric']
  const rows: Array<Record<string, unknown>> = []
  for (const [metric, stats] of Object.entries(record.metrics_summary)) {
    orderedUnion(columns, Object.keys(stats))
    rows.push({ metric, ...stats })
  }
  return { columns, rows }
}

/**
 * One row per completed run, columns = [...sweep parameter ids, 'seed',
 * '<metric>.<stat>'...]. This is the sweep comparison table: x = a parameter, y
 * = a metric stat (e.g. infected.final). Failed runs carry no metrics and are
 * omitted so the chart never plots a fabricated point.
 */
export function experimentTable(experiment: AbmExperiment, runs: RunRecord[]): VizTable {
  const paramIds = experiment.config.design.sweep.map((axis) => axis.parameter_id)
  const columns: string[] = [...paramIds, 'seed']
  const rows: Array<Record<string, unknown>> = []

  for (const run of runs) {
    if (run.status !== 'completed') continue
    const row: Record<string, unknown> = { seed: run.seed }
    for (const paramId of paramIds) row[paramId] = run.parameters[paramId]
    for (const [metric, stats] of Object.entries(run.metrics_summary)) {
      for (const [stat, value] of Object.entries(stats)) {
        const col = `${metric}.${stat}`
        orderedUnion(columns, [col])
        row[col] = value
      }
    }
    rows.push(row)
  }
  return { columns, rows }
}

/**
 * One row per tick, columns = ['tick', ...metric keys]. Built from the trace's
 * tick_metrics records over the optional [from,to] slice.
 */
export function traceMetricsTable(records: TraceRecord[]): VizTable {
  const columns: string[] = ['tick']
  const rows: Array<Record<string, unknown>> = []
  for (const record of records) {
    if (record.kind !== 'tick_metrics' || typeof record.tick !== 'number') continue
    const metrics =
      record.metrics && typeof record.metrics === 'object' && !Array.isArray(record.metrics)
        ? (record.metrics as Record<string, unknown>)
        : {}
    orderedUnion(columns, Object.keys(metrics))
    rows.push({ tick: record.tick, ...metrics })
  }
  return { columns, rows }
}

async function resolveTable(spec: VizSpec): Promise<VizTable> {
  const { source, id } = spec.data_ref
  switch (source) {
    case 'run': {
      const record = await getRunRecordById(id)
      if (!record) throw new VizNotFoundError(`Run not found: ${id}`)
      return runMetricsTable(record)
    }
    case 'experiment': {
      const experiment = await getExperimentById(id)
      if (!experiment) throw new VizNotFoundError(`Experiment not found: ${id}`)
      const runs = await Promise.all(
        experiment.runIds.map((runId) => getRunRecordById(runId)),
      )
      return experimentTable(experiment, runs.filter((r): r is RunRecord => r !== null))
    }
    case 'trace': {
      const location = await resolveRunLocation(id)
      if (!location) throw new VizNotFoundError(`Run not found: ${id}`)
      const slice = spec.data_ref.slice ?? {}
      const { records } = await readTraceRecords(
        traceFile(location.projectId, location.simId, id),
        {
          kinds: new Set(['tick_metrics']),
          ...(typeof slice.from === 'number' ? { from: slice.from } : {}),
          ...(typeof slice.to === 'number' ? { to: slice.to } : {}),
        },
      )
      return traceMetricsTable(records)
    }
  }
}

export interface VizResolution {
  spec: VizSpec
  data: VizTable
}

/**
 * Resolve a VizSpec to its real data, rejecting any spec whose encodings bind to
 * a non-existent column. Throws VizNotFoundError for an unknown data_ref id and
 * VizValidationError when fields are missing (the caller maps these to 4xx).
 */
export async function resolveViz(spec: VizSpec): Promise<VizResolution> {
  const data = await resolveTable(spec)
  const missing = missingFields(spec, data.columns)
  if (missing.length > 0) {
    throw new VizValidationError(
      `VizSpec binds to columns that do not exist in the resolved data: ${missing.join(', ')}`,
      missing,
    )
  }
  return { spec, data }
}
