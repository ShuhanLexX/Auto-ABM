/**
 * Desktop mirror of the server ABM contracts.
 * - RunRecord / config / simulation: mirror of src/server/abm/types.ts
 * - AbmServerMessage: mirror of src/server/abm/wsEvents.ts
 *
 * The server is authoritative (which in turn mirrors the Python kernel). Keep
 * these shapes in sync; do not fork the contract here.
 */

export interface Intervention {
  /** Tick (>=1) at which the parameter change takes effect. */
  at_tick: number
  /** Parameter values applied from `at_tick` onward. */
  params: Record<string, unknown>
  /** Optional human-readable label (e.g. "start debunking"). */
  note?: string | null
}

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
  lineageId?: string
  parentSimId?: string | null
  createdFrom?: 'manual' | 'proposal' | 'model_edit' | 'duplicate'
  config: ModelConfig
  interface: {
    seed: number
    steps: number
    params: Record<string, unknown>
  }
  createdAt: string
  schemaVersion: number
}

// Canvas metadata sent once before binary snapshot frames (mirror of
// src/server/abm/wsEvents.ts). layoutB64/edgesB64 are base64 little-endian
// typed-array buffers the desktop decodes once (frameFormat.ts).
export interface AbmGridMeta {
  width: number
  height: number
}

export interface AbmNetworkMeta {
  count: number
  edgeCount: number
  layoutB64: string
  edgesB64: string
}

export interface AbmMeta {
  space: 'grid' | 'network'
  palette: string[]
  grid?: AbmGridMeta
  network?: AbmNetworkMeta
}

// ODD (Overview, Design concepts, Details) mirror of src/server/abm/oddService.ts.
// Seven sections per the Grimm et al. protocol; the server derives them from the
// ModelConfig and is authoritative — do not fork the shape here.
export type OddSectionKey =
  | 'purpose'
  | 'entities'
  | 'process'
  | 'designConcepts'
  | 'initialization'
  | 'input'
  | 'submodels'

export const ODD_SECTION_KEYS: readonly OddSectionKey[] = [
  'purpose',
  'entities',
  'process',
  'designConcepts',
  'initialization',
  'input',
  'submodels',
]

export const ODD_SECTION_TITLES: Record<OddSectionKey, string> = {
  purpose: 'Purpose',
  entities: 'Entities, state variables and scales',
  process: 'Process overview and scheduling',
  designConcepts: 'Design concepts',
  initialization: 'Initialization',
  input: 'Input data',
  submodels: 'Submodels',
}

export interface OddSection {
  text: string
  /** true = auto-derived from the ModelConfig; false = user hand-written. */
  derived: boolean
  /** Set when a hand-written section may be stale vs the current model. */
  needsReview?: boolean
}

export interface Odd {
  schemaVersion: number
  modelId: string
  modelVersion: string
  generatedAt: string
  sections: Record<OddSectionKey, OddSection>
}

export type AbmServerMessage =
  | {
      type: 'abm_run_status'
      runId: string
      state: 'running' | 'completed' | 'failed'
      tick?: number
      totalSteps?: number
    }
  | { type: 'abm_tick'; runId: string; tick: number; metrics: Record<string, number> }
  | ({ type: 'abm_meta'; runId: string } & AbmMeta)
  | { type: 'abm_run_done'; runId: string; record: RunRecord }
  | { type: 'abm_error'; runId: string; message: string }
  | {
      type: 'abm_experiment_status'
      experimentId: string
      status: 'running' | 'completed' | 'failed' | 'stopped'
      total: number
    }
  | {
      type: 'abm_experiment_progress'
      experimentId: string
      index: number
      total: number
      runId: string
      state: 'completed' | 'failed'
    }

// mirror of abm_kernel/schemas/experiment.py (server src/server/abm/types.ts).
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

// mirror of abm_kernel/schemas/viz.py (server src/server/abm/types.ts).
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

export interface VizTable {
  columns: string[]
  rows: Array<Record<string, unknown>>
}

export interface VizResolution {
  spec: VizSpec
  data: VizTable
}

export interface ExperimentSummary {
  experiment: AbmExperiment
  runs: RunRecord[]
}

// mirror of src/server/abm/exportService.ts — reproduction package manifest.
export interface ReproRunEntry {
  id: string
  seed: number
  steps: number
  params: Record<string, unknown>
  model_id: string
  model_version: string
}

export interface ReproManifest {
  schema_version: string
  project_id: string
  sim_id: string
  auto_abm_version: string
  kernel_version: string
  created_at: string
  includes: string[]
  checksums: Record<string, string>
  runs: ReproRunEntry[]
}

export interface ExportResult {
  exportId: string
  packageDir: string
  manifest: ReproManifest
}

// mirror of abm_kernel/schemas/mechanism_graph.py (server
// src/server/abm/mechanismGraphService.ts). Every edge corresponds to a real
// reference in the ModelConfig — the kernel never invents causal links.
export type GraphNodeKind =
  | 'agent_type'
  | 'state_variable'
  | 'mechanism'
  | 'parameter'
  | 'observer'
export type GraphEdgeKind = 'structural' | 'reference'
export type GraphEdgeRelation = 'has_state' | 'runs' | 'controls' | 'writes' | 'observed'

export interface MechanismGraphNode {
  id: string
  kind: GraphNodeKind
  label: string
  ref_id: string
  description: string
}

export interface MechanismGraphEdge {
  source: string
  target: string
  kind: GraphEdgeKind
  relation: GraphEdgeRelation
}

export interface MechanismGraph {
  schema_version: string
  model_id: string
  model_version: string
  nodes: MechanismGraphNode[]
  edges: MechanismGraphEdge[]
  generated_at: string
}

// mirror of src/server/abm/attributionService.ts — grounded run insights.
export interface MechanismActivity {
  mechanism_id: string
  total: number
  agents: number
  firstTick: number | null
  lastTick: number | null
  series: Array<{ tick: number; count: number }>
}

export interface MechanismActivityResult {
  runId: string
  from: number
  to: number
  bucketSize: number
  mechanisms: MechanismActivity[]
}

export interface MechanismContribution {
  mechanism_id: string
  gains: number
  losses: number
  net: number
  agents: number
}

export interface AttributionResult {
  runId: string
  metric: string
  from: number
  to: number
  supported: boolean
  reason?: string
  metricStart: number | null
  metricEnd: number | null
  actualDelta: number | null
  attributedNet: number
  residual: number | null
  coverage: number | null
  contributions: MechanismContribution[]
}

export interface Changepoint {
  metric: string
  tick: number
  score: number
  beforeSlope: number
  afterSlope: number
  direction: 'accelerate' | 'decelerate' | 'reversal'
}

export interface ChangepointResult {
  runId: string
  changepoints: Changepoint[]
}

// mirror of src/server/abm/counterfactualService.ts.
export interface MetricComparison {
  metric: string
  baseFinal: number | null
  otherFinal: number | null
  finalDelta: number | null
  maxAbsDelta: number
  maxAbsDeltaTick: number | null
}

export interface RunComparison {
  baseRunId: string
  otherRunId: string
  divergenceTick: number | null
  ticksCompared: number
  metrics: MetricComparison[]
}
