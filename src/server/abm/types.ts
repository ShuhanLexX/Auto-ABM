/**
 * TS mirror of the kernel Python schemas — see packages/abm-kernel/src/abm_kernel/schemas/*.
 *
 * Single source of truth is the Python side; TS only mirrors, never forks
 * (docs/ai/impl/architecture.md §2). When the kernel contract changes, bump
 * the Python `version` first and re-sync these shapes.
 */

// mirror of abm_kernel/schemas/run.py::Intervention
export interface Intervention {
  /** Tick (>=1) at which the parameter change takes effect. */
  at_tick: number
  /** Parameter values applied from `at_tick` onward. */
  params: Record<string, unknown>
  /** Optional human-readable label (e.g. "start debunking"). */
  note?: string | null
}

// mirror of abm_kernel/schemas/run.py::RunRecord
export interface RunRecord {
  id: string
  experiment_id?: string | null
  model_id: string
  model_version: string
  kernel_version: string
  seed: number
  parameters: Record<string, unknown>
  steps: number
  interventions?: Intervention[] | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  started_at?: string | null
  finished_at?: string | null
  result_path?: string | null
  trace_path?: string | null
  metrics_summary: Record<string, Record<string, number>>
  error?: { type: string; message: string } | null
}

/**
 * ModelConfig is kept loose on the server (Record) in P0: the server does only
 * basic shape checks and forwards it to the kernel, which validates deeply via
 * Pydantic and surfaces errors back through the NDJSON `error` frame.
 * mirror of abm_kernel/schemas/model_config.py::ModelConfig
 */
export type ModelConfig = Record<string, unknown>

export interface AbmProject {
  id: string
  name: string
  researchQuestion?: string
  sourceSessionId?: string
  sourceWorkDir?: string
  createdAt: string
  schemaVersion: number
}

export interface AbmSimulation {
  id: string
  projectId: string
  name: string
  modelVersion: string
  /** Stable version family id. New proposals get their own lineage; model edits inherit it. */
  lineageId?: string
  /** Previous simulation id when this record is a model-edit version. */
  parentSimId?: string | null
  createdFrom?: 'manual' | 'proposal' | 'model_edit' | 'duplicate'
  // The fixed ModelConfig this simulation runs (P0: kernel built-in config).
  config: ModelConfig
  // Interface = the editable run inputs the workbench exposes.
  interface: {
    seed: number
    steps: number
    params: Record<string, unknown>
  }
  createdAt: string
  schemaVersion: number
}

// mirror of abm_kernel/schemas/experiment.py — single source of truth is Python.
export interface SweepAxis {
  parameter_id: string
  values: unknown[]
}

export interface ExperimentDesign {
  type: 'fixed' | 'single_sweep' | 'grid'
  sweep: SweepAxis[]
  fixed_parameters?: Record<string, unknown>
}

export interface ExperimentConfig {
  schema_version?: string
  id: string
  name: string
  description?: string
  model_id: string
  model_version: string
  design: ExperimentDesign
  replications: number
  base_seed: number
  steps: number
  collect_metrics: string[]
  trace_level?: 'off' | 'key' | 'full'
}

/**
 * Persisted experiment record (P3). Wraps the kernel ExperimentConfig with the
 * server's run bookkeeping: the expanded `total`, the RunRecord ids produced so
 * far, and a coarse status. Results live in the per-run RunRecords (real data).
 */
export interface AbmExperiment {
  id: string
  projectId: string
  simId: string
  name: string
  config: ExperimentConfig
  status: 'running' | 'completed' | 'failed' | 'stopped'
  total: number
  runIds: string[]
  createdAt: string
  finishedAt?: string
  error?: { type: string; message: string } | null
  schemaVersion: number
}

// mirror of abm_kernel/schemas/viz.py — declarative chart spec (no data, no code).
export type VizChart =
  | 'line'
  | 'bar'
  | 'scatter'
  | 'box'
  | 'histogram'
  | 'heatmap'
  | 'area'
  | 'pie'
export type VizRole = 'x' | 'y' | 'series' | 'color' | 'size' | 'facet'
export type VizAgg = 'none' | 'mean' | 'sum' | 'count' | 'min' | 'max'
export type VizSource = 'run' | 'experiment' | 'trace'

export interface VizEncoding {
  field: string
  role: VizRole
  agg?: VizAgg
}

export interface VizDataRef {
  source: VizSource
  id: string
  slice?: { from?: number; to?: number } | null
}

export interface VizSpec {
  schema_version?: string
  id?: string
  chart: VizChart
  title?: string
  caption?: string
  data_ref: VizDataRef
  encodings: VizEncoding[]
  options?: Record<string, unknown>
  rationale?: string
}

/** Real tabular data the server resolves for a VizSpec (AI never emits data). */
export interface VizTable {
  columns: string[]
  rows: Array<Record<string, unknown>>
}

export const ABM_STORAGE_VERSION = 1
