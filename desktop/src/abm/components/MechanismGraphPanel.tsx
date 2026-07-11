import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import {
  Activity,
  BookOpenText,
  Code2,
  Database,
  Eye,
  Flame,
  GitBranch,
  Network,
  RefreshCw,
  Scale,
  SlidersHorizontal,
  Sparkles,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { abmClient } from '../api/abmClient'
import { useAbmStore } from '../stores/abmStore'
import { useSelectionStore } from '../stores/selectionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { Locale } from '../../i18n'
import type {
  AbmSimulation,
  GraphEdgeRelation,
  GraphNodeKind,
  MechanismActivity,
  MechanismGraph,
  MechanismContribution,
} from '../types'
import {
  edgePath,
  layoutMechanismGraph,
  collectCausalNeighborhood,
  NODE_HEIGHT,
  NODE_WIDTH,
  type GraphLayout,
  type PositionedNode,
} from '../graph/mechanismGraphLayout'
import {
  isRecord,
  readMechanismNodes,
  readModelId,
  readModelVersion,
  readParameterSpecs,
  readRecords,
  readString,
} from '../modelIntrospection'
import {
  localizeAgentTypeText,
  localizeMechanismText,
  localizeObserverText,
  localizeParameterText,
} from '../modelDisplayText'
import { MiniExplainPopover, type MiniExplainAnchor } from './MiniExplainPopover'

interface Props {
  simulation: AbmSimulation | null
}

const RELATION_STYLE: Record<GraphEdgeRelation, { color: string; label: string; dash?: string }> = {
  controls: { color: '#f59e0b', label: '参数控制' },
  runs: { color: '#94a3b8', label: '执行机制', dash: '5 4' },
  has_state: { color: '#94a3b8', label: '拥有状态', dash: '2 4' },
  writes: { color: '#60a5fa', label: '改写状态' },
  observed: { color: '#34d399', label: '被观测' },
}

const KIND_STYLE: Record<GraphNodeKind, { accent: string; label: string }> = {
  parameter: { accent: '#f59e0b', label: '参数' },
  agent_type: { accent: '#a78bfa', label: '智能体' },
  mechanism: { accent: '#60a5fa', label: '机制' },
  state_variable: { accent: '#22d3ee', label: '状态变量' },
  observer: { accent: '#34d399', label: '观测指标' },
}

const GRAPH_TEXT_EN = {
  relations: {
    controls: 'parameter control',
    runs: 'runs mechanism',
    has_state: 'has state',
    writes: 'writes state',
    observed: 'observed',
  },
  kinds: {
    parameter: 'Parameter',
    agent_type: 'Agent',
    mechanism: 'Mechanism',
    state_variable: 'State Variable',
    observer: 'Metric',
  },
  adoptHint: 'Adopt a simulation proposal to show the model as a causal-path graph.',
  title: 'Mechanism Graph',
  modelVersion: 'model version',
  attributionOverlay: 'attribution overlay',
  coverage: 'coverage',
  heatWindow: 'firing heat',
  heatLatest: 'latest run firing heat',
  heat: 'Heat',
  attribution: 'Attribution',
  zoomOut: 'Zoom out graph',
  zoomIn: 'Zoom in graph',
  explainNode: 'Explain Node',
  heatLegend: 'Firing heat from real Trace',
  attributionLegend: 'Mechanism net contribution (green up, red down)',
  loading: 'Deriving mechanism graph from the kernel...',
  graphAria: 'Model causal path graph',
  noGraph: 'This model has no derivable structure yet. Ask AI to complete mechanisms from ODD and model config.',
  nodeDetails: 'Node Details',
  description: 'Description',
  intervalAttribution: 'Interval attribution',
  net: 'Net',
  gains: 'Inflow',
  losses: 'Outflow',
  trigger: 'Trigger',
  effect: 'Effect',
  undeclared: 'Not declared',
  activityTitle: 'Firing in this run',
  firingCount: 'Firings',
  agents: 'Agents',
  activeInterval: 'Active',
  code: 'Decision code',
  aiExplain: 'AI Explain',
  odd: 'View in ODD',
  detailHint: 'Click a node to inspect details, firing heat, and evidence links.',
  miniExplainTitle: 'AI node explanation',
  netContributionTitle: 'Net contribution',
  heatTitle: 'Triggered in this run',
  sparklineAria: 'Mechanism firings over time',
  currentValue: 'Current value',
  range: 'Range',
  rangeTo: 'to',
  type: 'Type',
  choices: 'Choices',
  defaultValue: 'Default',
  fallback: 'Kernel graph is unavailable. Showing a simplified mechanism chain.',
  retry: 'Retry',
  triggerPrefix: 'Trigger',
  effectPrefix: 'Effect',
  noMechanisms: 'This model has no explicit mechanism nodes.',
} as const

const GRAPH_TEXT_ZH = {
  relations: {
    controls: '参数控制',
    runs: '执行机制',
    has_state: '拥有状态',
    writes: '改写状态',
    observed: '被观测',
  },
  kinds: {
    parameter: '参数',
    agent_type: '智能体',
    mechanism: '机制',
    state_variable: '状态变量',
    observer: '观测指标',
  },
  adoptHint: '采纳仿真方案后，这里会以因果通路图展示模型结构。',
  title: '机制图谱',
  modelVersion: '模型版本',
  attributionOverlay: '归因叠加',
  coverage: '覆盖',
  heatWindow: '触发热度',
  heatLatest: '已叠加最近一次运行的触发热度',
  heat: '触发',
  attribution: '归因',
  zoomOut: '缩小图谱',
  zoomIn: '放大图谱',
  explainNode: '解释节点',
  heatLegend: '触发热度（来自真实 Trace）',
  attributionLegend: '机制净贡献（绿增红减）',
  loading: '正在从内核推导机制图…',
  graphAria: '模型因果通路图',
  noGraph: '当前模型还没有可推导的结构；可以让 AI 从 ODD 和模型配置中补全机制。',
  nodeDetails: '节点详情',
  description: '说明',
  intervalAttribution: '区间机制归因',
  net: '净贡献',
  gains: '流入',
  losses: '流出',
  trigger: '触发条件',
  effect: '影响结果',
  undeclared: '未声明',
  activityTitle: '本次运行触发情况',
  firingCount: '触发次数',
  agents: '涉及智能体',
  activeInterval: '活跃区间',
  code: '核心决策代码',
  aiExplain: 'AI 解释',
  odd: '在 ODD 中查看',
  detailHint: '点击图中的节点查看详情、触发热度和证据定位。',
  miniExplainTitle: 'AI 节点解释',
  netContributionTitle: '净贡献',
  heatTitle: '本次运行触发',
  sparklineAria: '机制触发次数随时间的分布',
  currentValue: '当前值',
  range: '取值范围',
  rangeTo: '到',
  type: '类型',
  choices: '取值集合',
  defaultValue: '默认值',
  fallback: '内核图谱暂不可用，已退回简化机制视图',
  retry: '重试',
  triggerPrefix: '触发',
  effectPrefix: '影响',
  noMechanisms: '当前模型没有显式机制节点。',
}

function useGraphText() {
  const locale = useSettingsStore((state) => state.locale)
  return locale === 'zh' || locale === 'zh-TW' ? GRAPH_TEXT_ZH : GRAPH_TEXT_EN
}

const VALID_NODE_KINDS = new Set<GraphNodeKind>([
  'agent_type',
  'state_variable',
  'mechanism',
  'parameter',
  'observer',
])

const VALID_EDGE_RELATIONS = new Set<GraphEdgeRelation>([
  'has_state',
  'runs',
  'controls',
  'writes',
  'observed',
])

function normalizeMechanismGraph(value: unknown, locale: Locale): MechanismGraph | null {
  const source = isRecord(value) && isRecord(value.graph) ? value.graph : value
  if (!isRecord(source) || !Array.isArray(source.nodes)) return null
  const nodes = source.nodes
    .filter((node): node is Record<string, unknown> => isRecord(node))
    .filter((node) => (
      typeof node.id === 'string' &&
      typeof node.kind === 'string' &&
      VALID_NODE_KINDS.has(node.kind as GraphNodeKind)
    ))
    .map((node) => {
      const id = node.id as string
      const kind = node.kind as GraphNodeKind
      const refId = typeof node.ref_id === 'string' && node.ref_id.trim() ? node.ref_id : id
      const refKey = refId.includes(':') ? refId.split(':').at(-1) ?? refId : refId
      const label = typeof node.label === 'string' && node.label.trim() ? node.label : id
      const description = typeof node.description === 'string' ? node.description : ''
      const display = kind === 'parameter'
        ? localizeParameterText(refKey, label, description, locale)
        : kind === 'mechanism'
          ? { label: localizeMechanismText(refKey, label, locale), description }
          : kind === 'observer'
            ? { label: localizeObserverText(refKey, label, locale), description }
            : kind === 'agent_type'
              ? localizeAgentTypeText(refKey, label, description, locale)
              : { label, description }
      return {
        id,
        kind,
        label: display.label,
        ref_id: refId,
        description: display.description ?? '',
      }
    })
  if (nodes.length === 0) return null

  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = Array.isArray(source.edges)
    ? source.edges
      .filter((edge): edge is Record<string, unknown> => isRecord(edge))
      .filter((edge) => (
        typeof edge.source === 'string' &&
        typeof edge.target === 'string' &&
        typeof edge.relation === 'string' &&
        nodeIds.has(edge.source) &&
        nodeIds.has(edge.target) &&
        VALID_EDGE_RELATIONS.has(edge.relation as GraphEdgeRelation)
      ))
      .map((edge) => ({
        source: edge.source as string,
        target: edge.target as string,
        kind: edge.kind === 'structural' ? 'structural' as const : 'reference' as const,
        relation: edge.relation as GraphEdgeRelation,
      }))
    : []

  return {
    schema_version: typeof source.schema_version === 'string' ? source.schema_version : '1',
    model_id: typeof source.model_id === 'string' ? source.model_id : '',
    model_version: typeof source.model_version === 'string' ? source.model_version : '',
    generated_at: typeof source.generated_at === 'string' ? source.generated_at : new Date(0).toISOString(),
    nodes,
    edges,
  }
}

function KindIcon({ kind, className }: { kind: GraphNodeKind; className?: string }) {
  const props = { className, strokeWidth: 2, 'aria-hidden': true as const }
  switch (kind) {
    case 'parameter':
      return <SlidersHorizontal {...props} />
    case 'agent_type':
      return <Users {...props} />
    case 'mechanism':
      return <GitBranch {...props} />
    case 'state_variable':
      return <Database {...props} />
    case 'observer':
      return <Eye {...props} />
  }
}

interface StateVariableDetail {
  dtype: string
  choices: string[]
  defaultValue: unknown
}

/** ref_id is "agentId.stateName"; read dtype/choices/default from the config. */
function readStateVariableDetail(config: Record<string, unknown>, refId: string): StateVariableDetail | null {
  const dot = refId.indexOf('.')
  if (dot < 0) return null
  const agentId = refId.slice(0, dot)
  const stateName = refId.slice(dot + 1)
  for (const agent of readRecords(config.agents)) {
    if ((readString(agent, 'id') ?? readString(agent, 'name')) !== agentId) continue
    for (const sv of readRecords(agent.state_variables ?? agent.stateVariables)) {
      if (readString(sv, 'name') !== stateName) continue
      return {
        dtype: readString(sv, 'dtype') ?? 'unknown',
        choices: Array.isArray(sv.choices) ? sv.choices.filter((c): c is string => typeof c === 'string') : [],
        defaultValue: sv.default,
      }
    }
  }
  return null
}

export function MechanismGraphPanel({ simulation }: Props) {
  const locale = useSettingsStore((state) => state.locale)
  const text = useGraphText()
  const activeRunId = useAbmStore((store) => store.activeRunId)
  const activeRun = useAbmStore((store) => (store.activeRunId ? store.runs[store.activeRunId] : undefined))
  const explainFocus = useAbmStore((store) => store.explainFocus)
  const requestView = useAbmStore((store) => store.requestView)
  const setEvidenceFocus = useSelectionStore((store) => store.setEvidenceFocus)

  const [graph, setGraph] = useState<MechanismGraph | null>(null)
  const [graphError, setGraphError] = useState<string | null>(null)
  const [loadingGraph, setLoadingGraph] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [activity, setActivity] = useState<Map<string, MechanismActivity> | null>(null)
  const [attributionByMechanism, setAttributionByMechanism] = useState<Map<string, MechanismContribution> | null>(null)
  const [attributionSummary, setAttributionSummary] = useState<{ metric: string; coverage: number | null; actualDelta: number | null } | null>(null)
  const [overlayMode, setOverlayMode] = useState<'heat' | 'attribution'>('heat')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [explainAnchor, setExplainAnchor] = useState<MiniExplainAnchor | null>(null)

  const simId = simulation?.id ?? null
  const modelVersion = simulation?.modelVersion ?? null
  const runState = activeRun?.state
  const activityWindow = useMemo(() => {
    if (explainFocus && activeRunId && explainFocus.runId === activeRunId) {
      return { from: explainFocus.from, to: explainFocus.to }
    }
    return null
  }, [explainFocus, activeRunId])

  // Kernel-derived graph, refetched when the model version changes.
  useEffect(() => {
    if (!simId) {
      setGraph(null)
      return
    }
    let cancelled = false
    setLoadingGraph(true)
    setGraphError(null)
    abmClient
      .getMechanismGraph(simId)
      .then((result) => {
        if (cancelled) return
        const next = normalizeMechanismGraph(result, locale)
        setGraph(next)
        setSelectedId((current) => (
          current && next?.nodes.some((node) => node.id === current)
            ? current
            : null
        ))
      })
      .catch((error) => {
        if (!cancelled) setGraphError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setLoadingGraph(false)
      })
    return () => {
      cancelled = true
    }
  }, [simId, modelVersion, reloadNonce, locale])

  // Firing heat from the real trace — scoped to the explain window when set.
  useEffect(() => {
    if (!activeRunId || runState !== 'completed') {
      setActivity(null)
      return
    }
    let cancelled = false
    abmClient
      .getMechanismActivity(
        activeRunId,
        activityWindow ? { from: activityWindow.from, to: activityWindow.to } : undefined,
      )
      .then((result) => {
        if (cancelled) return
        setActivity(new Map(result.mechanisms.map((m) => [m.mechanism_id, m])))
      })
      .catch(() => {
        if (!cancelled) setActivity(null)
      })
    return () => {
      cancelled = true
    }
  }, [activeRunId, runState, activityWindow?.from, activityWindow?.to])

  // Attribution overlay: decompose the focused metric interval per mechanism.
  useEffect(() => {
    if (!explainFocus || !activeRunId || explainFocus.runId !== activeRunId || runState !== 'completed') {
      setAttributionByMechanism(null)
      setAttributionSummary(null)
      return
    }
    let cancelled = false
    abmClient
      .getAttribution(explainFocus.runId, explainFocus.metric, {
        from: explainFocus.from,
        to: explainFocus.to,
      })
      .then((result) => {
        if (cancelled) return
        if (!result.supported) {
          setAttributionByMechanism(null)
          setAttributionSummary({ metric: explainFocus.metric, coverage: null, actualDelta: null })
          setOverlayMode('heat')
          return
        }
        setAttributionByMechanism(new Map(result.contributions.map((c) => [c.mechanism_id, c])))
        setAttributionSummary({
          metric: explainFocus.metric,
          coverage: result.coverage,
          actualDelta: result.actualDelta,
        })
        setOverlayMode('attribution')
      })
      .catch(() => {
        if (!cancelled) {
          setAttributionByMechanism(null)
          setAttributionSummary(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [explainFocus, activeRunId, runState])

  const layout: GraphLayout | null = useMemo(
    () => (graph && graph.nodes.length > 0 ? layoutMechanismGraph(graph) : null),
    [graph],
  )
  const maxFirings = useMemo(() => {
    if (!activity) return 0
    let max = 0
    for (const m of activity.values()) max = Math.max(max, m.total)
    return max
  }, [activity])
  const maxAttributionNet = useMemo(() => {
    if (!attributionByMechanism) return 0
    let max = 0
    for (const c of attributionByMechanism.values()) max = Math.max(max, Math.abs(c.net))
    return max
  }, [attributionByMechanism])

  const mechanismInfo = useMemo(() => {
    const nodes = readMechanismNodes(simulation?.config ?? {}, locale)
    return new Map(nodes.map((node) => [node.id, node]))
  }, [locale, simulation?.config])
  const parameters = useMemo(() => readParameterSpecs(simulation, locale), [locale, simulation])

  const selectedNode = graph?.nodes.find((n) => n.id === selectedId) ?? null
  const fallbackSelectedId = selectedNode?.kind === 'mechanism'
    ? selectedNode.ref_id
    : selectedId?.startsWith('mechanism:')
      ? selectedId.slice('mechanism:'.length)
      : null
  const focusId = hoverId ?? selectedId

  // Causal chain highlight: upstream from observers, downstream from parameters.
  const causalPathSet = useMemo(() => {
    if (!selectedNode || !graph) return null
    if (selectedNode.kind === 'observer') {
      return collectCausalNeighborhood(graph, selectedNode.id, 'upstream')
    }
    if (selectedNode.kind === 'parameter') {
      return collectCausalNeighborhood(graph, selectedNode.id, 'downstream')
    }
    if (selectedNode.kind === 'mechanism' || selectedNode.kind === 'state_variable') {
      return collectCausalNeighborhood(graph, selectedNode.id, 'both')
    }
    return null
  }, [selectedNode, graph])

  // Node/edge emphasis set for the hovered-or-selected node.
  const focusSet = useMemo(() => {
    if (causalPathSet) return causalPathSet
    if (!focusId || !graph) return null
    const ids = new Set<string>([focusId])
    for (const edge of graph.edges) {
      if (edge.source === focusId) ids.add(edge.target)
      if (edge.target === focusId) ids.add(edge.source)
    }
    return ids
  }, [causalPathSet, focusId, graph])

  const latestTick = activeRun?.ticks.at(-1)?.tick
  const selectedMechanismDetail = selectedNode?.kind === 'mechanism' ? mechanismInfo.get(selectedNode.ref_id) : undefined
  const selectedActivity = selectedNode?.kind === 'mechanism' ? activity?.get(selectedNode.ref_id) : undefined

  const openExplain = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    setExplainAnchor({ x: event.clientX, y: event.clientY })
  }, [])

  const jumpToOdd = useCallback(() => {
    if (selectedNode?.kind === 'mechanism' && activeRunId) {
      setEvidenceFocus({
        runId: activeRunId,
        tick: selectedActivity?.lastTick ?? latestTick ?? 0,
        mechanism_id: selectedNode.ref_id,
      })
    }
    requestView('odd')
  }, [selectedNode, activeRunId, selectedActivity, latestTick, requestView, setEvidenceFocus])

  if (!simulation) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--color-text-tertiary)]">
        {text.adoptHint}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-none items-start justify-between gap-3 px-4 pt-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
              <Network className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {text.title}
            </h2>
            <p className="mt-1 truncate text-xs text-[var(--color-text-tertiary)]">
              {readModelId(simulation.config, simulation.name)} · {text.modelVersion} v{readModelVersion(simulation)}
              {overlayMode === 'attribution' && attributionSummary
                ? ` · ${text.attributionOverlay} ${attributionSummary.metric} (${attributionSummary.coverage !== null ? `${Math.round(attributionSummary.coverage * 100)}% ${text.coverage}` : '-'})`
                : activity
                  ? activityWindow
                    ? ` · ${text.heatWindow} t${activityWindow.from}-${activityWindow.to}`
                    : ` · ${text.heatLatest}`
                  : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {attributionByMechanism && attributionByMechanism.size > 0 ? (
              <div className="flex rounded-[8px] border border-[var(--color-border)] p-0.5 text-[10px]">
                <button
                  type="button"
                  data-testid="overlay-mode-heat"
                  data-active={overlayMode === 'heat' ? 'true' : undefined}
                  onClick={() => setOverlayMode('heat')}
                  className="rounded-[6px] px-2 py-1 font-medium transition-colors data-[active=true]:bg-[var(--color-brand)] data-[active=true]:text-white text-[var(--color-text-tertiary)]"
                >
                  {text.heat}
                </button>
                <button
                  type="button"
                  data-testid="overlay-mode-attribution"
                  data-active={overlayMode === 'attribution' ? 'true' : undefined}
                  onClick={() => setOverlayMode('attribution')}
                  className="rounded-[6px] px-2 py-1 font-medium transition-colors data-[active=true]:bg-[var(--color-brand)] data-[active=true]:text-white text-[var(--color-text-tertiary)]"
                >
                  {text.attribution}
                </button>
              </div>
            ) : null}
            <button
              type="button"
              aria-label={text.zoomOut}
              onClick={() => setScale((s) => Math.max(0.55, s / 1.15))}
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
            >
              <ZoomOut className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={text.zoomIn}
              onClick={() => setScale((s) => Math.min(1.6, s * 1.15))}
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
            >
              <ZoomIn className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={openExplain}
              disabled={!selectedNode}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] bg-[var(--color-brand)] px-2.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              {text.explainNode}
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-none flex-wrap items-center gap-x-3 gap-y-1 px-4 text-[10px] text-[var(--color-text-tertiary)]">
          {(Object.entries(RELATION_STYLE) as Array<[GraphEdgeRelation, (typeof RELATION_STYLE)[GraphEdgeRelation]]>).map(
            ([relation, style]) => (
              <span key={relation} className="inline-flex items-center gap-1.5">
                <svg width="18" height="6" aria-hidden="true">
                  <line x1="0" y1="3" x2="18" y2="3" stroke={style.color} strokeWidth="2" strokeDasharray={style.dash} />
                </svg>
                {text.relations[relation]}
              </span>
            ),
          )}
          {maxFirings > 0 && overlayMode === 'heat' ? (
            <span className="inline-flex items-center gap-1">
              <Flame className="h-3 w-3 text-[#fb923c]" strokeWidth={2} aria-hidden="true" />
              {text.heatLegend}
            </span>
          ) : null}
          {overlayMode === 'attribution' && maxAttributionNet > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Scale className="h-3 w-3 text-[var(--color-brand)]" strokeWidth={2} aria-hidden="true" />
              {text.attributionLegend}
            </span>
          ) : null}
        </div>

        <div className="relative mx-4 mb-4 mt-3 min-h-0 flex-1 overflow-auto rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)]">
          {loadingGraph ? (
            <div className="grid h-full min-h-[280px] place-items-center text-sm text-[var(--color-text-tertiary)]">
              {text.loading}
            </div>
          ) : layout ? (
            <div
              data-testid="mechanism-graph"
              className="relative"
              style={{
                width: layout.width * scale,
                height: layout.height * scale,
              }}
            >
              <div
                className="absolute left-0 top-0"
                style={{ width: layout.width, height: layout.height, transform: `scale(${scale})`, transformOrigin: '0 0' }}
              >
                <svg
                  width={layout.width}
                  height={layout.height}
                  className="absolute left-0 top-0"
                  role="img"
                  aria-label={text.graphAria}
                >
                  <defs>
                    {Object.entries(RELATION_STYLE).map(([relation, style]) => (
                      <marker
                        key={relation}
                        id={`abm-arrow-${relation}`}
                        viewBox="0 0 8 8"
                        refX="7"
                        refY="4"
                        markerWidth="7"
                        markerHeight="7"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 0.6 L 7.5 4 L 0 7.4 z" fill={style.color} />
                      </marker>
                    ))}
                  </defs>
                  {layout.columns.map((column) => (
                    <text
                      key={column.kind}
                      x={column.x}
                      y={column.y}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="600"
                      fill="var(--color-text-tertiary)"
                    >
                      {text.kinds[column.kind]} · {column.count}
                    </text>
                  ))}
                  {layout.edges.map((positioned, index) => {
                    const style = RELATION_STYLE[positioned.edge.relation]
                    const inFocus =
                      !focusId ||
                      positioned.edge.source === focusId ||
                      positioned.edge.target === focusId
                    return (
                      <path
                        key={`${positioned.edge.source}->${positioned.edge.target}-${index}`}
                        data-testid="graph-edge"
                        data-relation={positioned.edge.relation}
                        d={edgePath(positioned)}
                        fill="none"
                        stroke={style.color}
                        strokeWidth={inFocus && focusId ? 2.2 : 1.5}
                        strokeDasharray={style.dash}
                        opacity={inFocus ? (focusId ? 0.95 : 0.7) : 0.12}
                        markerEnd={`url(#abm-arrow-${positioned.edge.relation})`}
                      />
                    )
                  })}
                </svg>
                {layout.nodes.map((positioned) => (
                  <GraphNodeCard
                    key={positioned.node.id}
                    positioned={positioned}
                    selected={selectedId === positioned.node.id}
                    dimmed={Boolean(focusSet) && !focusSet!.has(positioned.node.id)}
                    onCausalPath={Boolean(causalPathSet?.has(positioned.node.id))}
                    activity={positioned.node.kind === 'mechanism' ? activity?.get(positioned.node.ref_id) : undefined}
                    contribution={positioned.node.kind === 'mechanism' ? attributionByMechanism?.get(positioned.node.ref_id) : undefined}
                    overlayMode={overlayMode}
                    maxFirings={maxFirings}
                    maxAttributionNet={maxAttributionNet}
                    onSelect={() => setSelectedId(positioned.node.id)}
                    onHover={(hovering) => setHoverId(hovering ? positioned.node.id : null)}
                  />
                ))}
              </div>
            </div>
          ) : graphError ? (
            <FallbackGraph
              simulation={simulation}
              error={graphError}
              onRetry={() => setReloadNonce((n) => n + 1)}
              selectedId={fallbackSelectedId}
              onSelect={(mechanismId) => setSelectedId(`mechanism:${mechanismId}`)}
            />
          ) : (
            <FallbackGraph
              simulation={simulation}
              error={text.noGraph}
              onRetry={() => setReloadNonce((n) => n + 1)}
              selectedId={fallbackSelectedId}
              onSelect={(mechanismId) => setSelectedId(`mechanism:${mechanismId}`)}
              emptyGraph
            />
          )}

          {selectedNode ? (
            <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex max-w-[340px] justify-end">
              <aside
                data-testid="graph-node-detail"
                className="pointer-events-auto max-h-[min(420px,calc(100%-32px))] w-full overflow-auto rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)]/96 p-4 shadow-[var(--shadow-dropdown)] backdrop-blur"
              >
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{text.nodeDetails}</h3>
                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px]"
                      style={{ backgroundColor: `${KIND_STYLE[selectedNode.kind].accent}22`, color: KIND_STYLE[selectedNode.kind].accent }}
                    >
                      <KindIcon kind={selectedNode.kind} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{selectedNode.label}</div>
                      <div className="text-[10px] text-[var(--color-text-tertiary)]">
                        {text.kinds[selectedNode.kind]} · <span className="font-mono">{selectedNode.ref_id}</span>
                      </div>
                    </div>
                  </div>

                  {selectedNode.description ? (
                    <Detail label={text.description} value={selectedNode.description} />
                  ) : null}

                  {selectedNode.kind === 'mechanism' && overlayMode === 'attribution' ? (
                    (() => {
                      const contribution = attributionByMechanism?.get(selectedNode.ref_id)
                      if (!contribution) return null
                      return (
                        <div data-testid="mechanism-attribution-stats" className="rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-2.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-text-secondary)]">
                            <Scale className="h-3.5 w-3.5 text-[var(--color-brand)]" strokeWidth={2} aria-hidden="true" />
                            {text.intervalAttribution}
                            {explainFocus ? ` · t${explainFocus.from}-${explainFocus.to}` : ''}
                          </div>
                          <div className="mt-1.5 grid grid-cols-3 gap-2 text-center">
                            <ActivityStat label={text.net} value={formatSignedContribution(contribution.net)} />
                            <ActivityStat label={text.gains} value={formatNumber(contribution.gains)} />
                            <ActivityStat label={text.losses} value={formatNumber(contribution.losses)} />
                          </div>
                        </div>
                      )
                    })()
                  ) : null}

                  {selectedNode.kind === 'mechanism' ? (
                    <>
                      <Detail label={text.trigger} value={selectedMechanismDetail?.trigger ?? text.undeclared} />
                      <Detail label={text.effect} value={selectedMechanismDetail?.effect ?? text.undeclared} />
                      {selectedActivity ? (
                        <div data-testid="mechanism-activity-stats" className="rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-2.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-text-secondary)]">
                            <Activity className="h-3.5 w-3.5 text-[#fb923c]" strokeWidth={2} aria-hidden="true" />
                            {text.activityTitle}
                          </div>
                          <div className="mt-1.5 grid grid-cols-3 gap-2 text-center">
                            <ActivityStat label={text.firingCount} value={selectedActivity.total.toLocaleString()} />
                            <ActivityStat label={text.agents} value={selectedActivity.agents.toLocaleString()} />
                            <ActivityStat
                              label={text.activeInterval}
                              value={
                                selectedActivity.firstTick !== null && selectedActivity.lastTick !== null
                                  ? `t${selectedActivity.firstTick}-${selectedActivity.lastTick}`
                                  : '-'
                              }
                            />
                          </div>
                          {selectedActivity.series.length > 1 ? (
                            <ActivitySparkline series={selectedActivity.series} />
                          ) : null}
                        </div>
                      ) : null}
                      {selectedMechanismDetail?.code ? (
                        <div>
                          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
                            <Code2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                            {text.code}
                          </div>
                          <pre className="max-h-[240px] overflow-auto rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-2 font-mono text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                            {selectedMechanismDetail.code}
                          </pre>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {selectedNode.kind === 'parameter' ? (
                    <ParameterDetail refId={selectedNode.ref_id} parameters={parameters} />
                  ) : null}

                  {selectedNode.kind === 'state_variable' ? (
                    <StateVariableDetailView config={simulation.config} refId={selectedNode.ref_id} />
                  ) : null}

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={openExplain}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--color-border)] px-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
                    >
                      <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      {text.aiExplain}
                    </button>
                    <button
                      type="button"
                      data-testid="graph-jump-odd"
                      onClick={jumpToOdd}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--color-border)] px-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
                    >
                      <BookOpenText className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      {text.odd}
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          ) : null}
        </div>
      </div>

      <MiniExplainPopover
        open={Boolean(explainAnchor)}
        anchor={explainAnchor}
        onClose={() => setExplainAnchor(null)}
        target={selectedNode ? {
          title: text.miniExplainTitle,
          subject: `${simulation.name} · ${selectedNode.label}`,
          ...(activeRunId ? { runId: activeRunId } : {}),
          ...(latestTick !== undefined ? { tick: latestTick } : {}),
          ...(activeRun?.ticks.at(-1)?.metrics ? { metricsHint: activeRun.ticks.at(-1)!.metrics } : {}),
          mechanism: {
            id: selectedNode.ref_id,
            label: selectedNode.label,
            ...(selectedMechanismDetail?.trigger ? { trigger: selectedMechanismDetail.trigger } : {}),
            ...(selectedMechanismDetail?.effect ? { effect: selectedMechanismDetail.effect } : {}),
            ...(selectedMechanismDetail?.code ? { code: selectedMechanismDetail.code } : {}),
          },
        } : null}
      />
    </div>
  )
}

function GraphNodeCard({
  positioned,
  selected,
  dimmed,
  onCausalPath,
  activity,
  contribution,
  overlayMode,
  maxFirings,
  maxAttributionNet,
  onSelect,
  onHover,
}: {
  positioned: PositionedNode
  selected: boolean
  dimmed: boolean
  onCausalPath: boolean
  activity: MechanismActivity | undefined
  contribution: MechanismContribution | undefined
  overlayMode: 'heat' | 'attribution'
  maxFirings: number
  maxAttributionNet: number
  onSelect: () => void
  onHover: (hovering: boolean) => void
}) {
  const text = useGraphText()
  const { node } = positioned
  const style = KIND_STYLE[node.kind]
  const heat = activity && maxFirings > 0 && overlayMode === 'heat' ? activity.total / maxFirings : 0
  const attrScale = contribution && maxAttributionNet > 0 && overlayMode === 'attribution'
    ? Math.abs(contribution.net) / maxAttributionNet
    : 0
  const attrPositive = (contribution?.net ?? 0) >= 0
  return (
    <button
      type="button"
      data-testid="graph-node"
      data-kind={node.kind}
      data-node-id={node.id}
      data-selected={selected ? 'true' : undefined}
      data-causal-path={onCausalPath ? 'true' : undefined}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={`absolute rounded-[10px] border text-left transition-all ${
        selected
          ? 'border-[var(--color-brand)] shadow-[0_0_0_2px_var(--color-brand)]'
          : onCausalPath
            ? 'border-[var(--color-brand)]/60'
            : 'border-[var(--color-border)] hover:border-[var(--color-brand)]/50'
      }`}
      style={{
        left: positioned.x,
        top: positioned.y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        opacity: dimmed ? 0.3 : 1,
        backgroundColor:
          overlayMode === 'attribution' && attrScale > 0
            ? attrPositive
              ? `rgba(52,211,153,${0.1 + attrScale * 0.28})`
              : `rgba(248,113,113,${0.1 + attrScale * 0.28})`
            : heat > 0
              ? `rgba(251,146,60,${0.08 + heat * 0.22})`
              : 'var(--color-surface)',
      }}
    >
      <div className="flex h-full items-center gap-2 px-2.5">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px]"
          style={{ backgroundColor: `${style.accent}22`, color: style.accent }}
        >
          <KindIcon kind={node.kind} className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-[var(--color-text-primary)]">{node.label}</span>
          <span className="block truncate font-mono text-[9px] text-[var(--color-text-tertiary)]">{node.ref_id}</span>
        </span>
        {overlayMode === 'attribution' && contribution ? (
          <span
            data-testid="graph-node-attribution"
            className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
              contribution.net >= 0 ? 'bg-[#34d399]/15 text-[#0f9d6c]' : 'bg-[#f87171]/15 text-[#dc2626]'
            }`}
            title={`${text.netContributionTitle} ${formatSignedContribution(contribution.net)}`}
          >
            {formatSignedContribution(contribution.net)}
          </span>
        ) : activity && overlayMode === 'heat' ? (
          <span
            data-testid="graph-node-heat"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#fb923c]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#ea7c2f]"
            title={`${text.heatTitle} ${activity.total}`}
          >
            <Flame className="h-2.5 w-2.5" strokeWidth={2.4} aria-hidden="true" />
            {activity.total}
          </span>
        ) : null}
      </div>
    </button>
  )
}

function ActivityStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-xs font-semibold text-[var(--color-text-primary)]">{value}</div>
      <div className="mt-0.5 text-[9px] text-[var(--color-text-tertiary)]">{label}</div>
    </div>
  )
}

function ActivitySparkline({ series }: { series: Array<{ tick: number; count: number }> }) {
  const text = useGraphText()
  const width = 260
  const height = 36
  const maxCount = Math.max(1, ...series.map((p) => p.count))
  const minTick = series[0]!.tick
  const maxTick = Math.max(minTick + 1, series.at(-1)!.tick)
  const points = series
    .map((p) => {
      const x = ((p.tick - minTick) / (maxTick - minTick)) * (width - 4) + 2
      const y = height - 3 - (p.count / maxCount) * (height - 8)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-2 w-full"
      role="img"
      aria-label={text.sparklineAria}
    >
      <polyline fill="none" stroke="#fb923c" strokeWidth="1.8" strokeLinejoin="round" points={points} />
    </svg>
  )
}

function ParameterDetail({ refId, parameters }: { refId: string; parameters: ReturnType<typeof readParameterSpecs> }) {
  const text = useGraphText()
  const spec = parameters.find((p) => p.id === refId)
  if (!spec) return null
  return (
    <>
      <Detail label={text.currentValue} value={String(spec.value ?? '-')} mono />
      {spec.min !== undefined || spec.max !== undefined ? (
        <Detail label={text.range} value={`${spec.min ?? '-'} ${text.rangeTo} ${spec.max ?? '-'}`} mono />
      ) : null}
    </>
  )
}

function StateVariableDetailView({ config, refId }: { config: Record<string, unknown>; refId: string }) {
  const text = useGraphText()
  const detail = useMemo(() => (isRecord(config) ? readStateVariableDetail(config, refId) : null), [config, refId])
  if (!detail) return null
  return (
    <>
      <Detail label={text.type} value={detail.dtype} mono />
      {detail.choices.length > 0 ? <Detail label={text.choices} value={detail.choices.join(' / ')} mono /> : null}
      <Detail label={text.defaultValue} value={String(detail.defaultValue ?? '-')} mono />
    </>
  )
}

/**
 * Kernel-unavailable fallback: a linear mechanism chain read directly from the
 * config (the pre-DAG rendering), so the panel stays useful without Python.
 */
function FallbackGraph({
  simulation,
  error,
  onRetry,
  selectedId,
  onSelect,
  emptyGraph = false,
}: {
  simulation: AbmSimulation
  error: string
  onRetry: () => void
  selectedId: string | null
  onSelect: (mechanismId: string) => void
  emptyGraph?: boolean
}) {
  const text = useGraphText()
  const mechanisms = readMechanismNodes(simulation.config)
  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-center justify-between gap-2 rounded-[9px] border border-[var(--color-warning)]/40 bg-[var(--color-warning-container)]/20 px-3 py-2 text-xs text-[var(--color-text-secondary)]">
        <span className="min-w-0 truncate" title={error}>
          {emptyGraph ? error : text.fallback}
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[7px] border border-[var(--color-border)] px-2 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)]"
        >
          <RefreshCw className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          {text.retry}
        </button>
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto">
        {mechanisms.map((mechanism, index) => (
          <div key={mechanism.id} className="flex w-full max-w-[360px] shrink-0 flex-col items-center gap-2">
            <button
              type="button"
              data-testid="mechanism-node"
              data-selected={selectedId === mechanism.id ? 'true' : undefined}
              onClick={() => onSelect(mechanism.id)}
              className={`w-full rounded-[10px] border px-3 py-3 text-left transition-colors ${
                selectedId === mechanism.id
                  ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/8'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-primary)]">
                <GitBranch className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                <span className="truncate">{mechanism.label}</span>
              </div>
              <div className="mt-2 space-y-1 text-[10px] text-[var(--color-text-tertiary)]">
                <div className="truncate">{text.triggerPrefix}: {mechanism.trigger ?? '-'}</div>
                <div className="truncate">{text.effectPrefix}: {mechanism.effect ?? '-'}</div>
              </div>
            </button>
            {index < mechanisms.length - 1 ? (
              <span className="text-xs text-[var(--color-text-tertiary)]" aria-hidden="true">↓</span>
            ) : null}
          </div>
        ))}
        {mechanisms.length === 0 ? (
          <div className="w-full text-center text-sm text-[var(--color-text-tertiary)]">{text.noMechanisms}</div>
        ) : null}
      </div>
    </div>
  )
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-[var(--color-text-tertiary)]">{label}</div>
      <div className={`mt-1 break-words text-xs text-[var(--color-text-primary)] ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}

function formatSignedContribution(value: number): string {
  const text = formatNumber(Math.abs(value))
  return value > 0 ? `+${text}` : value < 0 ? `-${text}` : text
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return Math.abs(value) >= 1 ? value.toFixed(2) : value.toFixed(3)
}
