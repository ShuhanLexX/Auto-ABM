/**
 * ODD (Overview, Design concepts, Details) derivation + incremental merge.
 *
 * Implements P2 Task 1 (docs/ai/impl/plans/P2-conversation-explain.md):
 *   - deriveOdd(config): map ModelConfig fields → the seven ODD sections (real,
 *     no invention — every line traces back to a config field).
 *   - mergeOdd(prev, derived): refresh auto-derived sections, but NEVER overwrite
 *     a user hand-written section; when the underlying model drifts, flag the
 *     hand-written section `needsReview` and report it as a conflict.
 *
 * The seven sections follow Grimm et al. ODD protocol, grouped as the kernel docs
 * reference them (Purpose / Entities / Process / DesignConcepts / Initialization /
 * Input / Submodels).
 */

import { readModelConfig, type ModelConfigShape } from './modelConfigShape.js'
import type { ModelConfig } from './types.js'

export const ODD_SCHEMA_VERSION = 1

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

export const ODD_SECTION_TITLES_ZH: Record<OddSectionKey, string> = {
  purpose: '目的',
  entities: '实体、状态变量与尺度',
  process: '过程概览与调度',
  designConcepts: '设计概念',
  initialization: '初始化',
  input: '输入数据',
  submodels: '子模型',
}

export function oddSectionTitle(key: OddSectionKey, locale?: string): string {
  return isChineseOddLocale(locale) ? ODD_SECTION_TITLES_ZH[key] : ODD_SECTION_TITLES[key]
}

export interface OddSection {
  /** Rendered text for the section. */
  text: string
  /**
   * true  → auto-derived from the ModelConfig (safe to refresh on re-derive).
   * false → user hand-written (protected; merge keeps it, never overwrites).
   */
  derived: boolean
  /** Set on a hand-written section when the model drifted and it may be stale. */
  needsReview?: boolean
}

export interface Odd {
  schemaVersion: number
  modelId: string
  modelVersion: string
  generatedAt: string
  sections: Record<OddSectionKey, OddSection>
}

function joinLines(lines: string[]): string {
  return lines.filter((l) => l.trim().length > 0).join('\n')
}

function isChineseOddLocale(locale: string | undefined): boolean {
  return /^zh(?:-|$)/i.test(locale ?? '')
}

function derivePurpose(c: ModelConfigShape, locale?: string): string {
  if (isChineseOddLocale(locale)) return derivePurposeZh(c)
  const lines = [
    `- Model: ${c.name || c.id || '(unnamed)'}`,
    `- Model ID: ${c.id || '(missing)'}`,
    `- Version: v${c.version || '(missing)'}`,
  ]
  if (c.description) lines.push(`- Research purpose / phenomenon: ${c.description}`)
  else lines.push('- Research purpose / phenomenon: the config has no description yet; add the research question, theoretical assumptions, and scope after adopting a design.')
  lines.push('- Usage: this ODD is auto-derived from the current ModelConfig to record how the model initializes, how its mechanisms are scheduled, and which metrics are observed.')
  return joinLines(lines)
}

function derivePurposeZh(c: ModelConfigShape): string {
  const lines = [
    `- 模型：${c.name || c.id || '(unnamed)'}`,
    `- 模型 ID：${c.id || '(missing)'}`,
    `- 版本：v${c.version || '(missing)'}`,
  ]
  if (c.description) lines.push(`- 研究目的/现象：${c.description}`)
  else lines.push('- 研究目的/现象：模型配置尚未提供 description，建议在采纳方案后补充研究问题、理论假设和适用边界。')
  lines.push('- 使用方式：本 ODD 文档从当前 ModelConfig 自动派生，用于记录模型如何初始化、如何调度机制、观察哪些指标。')
  return joinLines(lines)
}

function deriveEntities(c: ModelConfigShape, locale?: string): string {
  if (isChineseOddLocale(locale)) return deriveEntitiesZh(c)
  const lines: string[] = ['### Agents and state variables']
  if (c.agents.length === 0) {
    lines.push('- No agent types defined.')
  } else {
    for (const agent of c.agents) {
      const vars = agent.stateVariables
        .map((v) => `${v.name}:${v.dtype}${v.default !== undefined ? `=${JSON.stringify(v.default)}` : ''}`)
        .join(', ')
      const label = agent.name || agent.id
      lines.push(`- ${label} (${agent.id})`)
      lines.push(`  - State variables: ${vars || 'none'}`)
      if (agent.behaviorRefs.length > 0) lines.push(`  - Related behaviors/mechanisms: ${agent.behaviorRefs.join(', ')}`)
      if (agent.description) lines.push(`  - Notes: ${agent.description}`)
    }
  }
  const env = c.environment
  const envConfig = Object.keys(env.config).length
    ? ` ${JSON.stringify(env.config)}`
    : ''
  lines.push('### Environment and scale')
  lines.push(`- Environment type: ${env.type}${envConfig}`)
  lines.push('- Scale: determined jointly by the environment config and initialization size; each run binds seed, parameters, and model version.')
  return joinLines(lines)
}

function deriveEntitiesZh(c: ModelConfigShape): string {
  const lines: string[] = ['### 智能体与状态变量']
  if (c.agents.length === 0) lines.push('- 未定义智能体类型。')
  else {
    for (const agent of c.agents) {
      const vars = agent.stateVariables
        .map((v) => `${v.name}:${v.dtype}${v.default !== undefined ? `=${JSON.stringify(v.default)}` : ''}`)
        .join(', ')
      const label = agent.name || agent.id
      lines.push(`- ${label} (${agent.id})`)
      lines.push(`  - 状态变量：${vars || 'none'}`)
      if (agent.behaviorRefs.length > 0) lines.push(`  - 关联行为/机制：${agent.behaviorRefs.join(', ')}`)
      if (agent.description) lines.push(`  - 说明：${agent.description}`)
    }
  }
  const env = c.environment
  const envConfig = Object.keys(env.config).length ? ` ${JSON.stringify(env.config)}` : ''
  lines.push('### 环境与尺度')
  lines.push(`- 环境类型：${env.type}${envConfig}`)
  lines.push('- 尺度说明：由环境配置和初始化规模共同决定；运行记录会绑定 seed、参数和模型版本。')
  return joinLines(lines)
}

function deriveProcess(c: ModelConfigShape, locale?: string): string {
  if (isChineseOddLocale(locale)) return deriveProcessZh(c)
  const lines: string[] = ['### Scheduling and process overview']
  if (c.mechanisms.length === 0) {
    lines.push('- No mechanisms defined.')
  } else {
    lines.push('- Each tick triggers the following mechanisms per the model schedule; the exact execution order follows the kernel template.')
    for (const m of c.mechanisms) {
      const trigger = m.trigger ? `when ${m.trigger}` : 'each step'
      const effect = m.effect ? ` → ${m.effect}` : ''
      lines.push(`- ${m.name || m.id} (${trigger})${effect}`)
      if (m.description) lines.push(`  - Notes: ${m.description}`)
    }
  }
  if (c.observers.length > 0) {
    lines.push('### Observed metrics')
    for (const o of c.observers) {
      lines.push(`- ${o.name || o.id} (${o.id}, ${o.level}, ${o.dtype})${o.description ? `: ${o.description}` : ''}`)
    }
  }
  return joinLines(lines)
}

function deriveProcessZh(c: ModelConfigShape): string {
  const lines: string[] = ['### 调度与过程概览']
  if (c.mechanisms.length === 0) lines.push('- 未定义机制。')
  else {
    lines.push('- 每个 tick 按模型调度触发以下机制；具体执行顺序以 kernel 模板为准。')
    for (const m of c.mechanisms) {
      const trigger = m.trigger ? `when ${m.trigger}` : 'each step'
      const effect = m.effect ? ` → ${m.effect}` : ''
      lines.push(`- ${m.name || m.id} (${trigger})${effect}`)
      if (m.description) lines.push(`  - 说明：${m.description}`)
    }
  }
  if (c.observers.length > 0) {
    lines.push('### 观测指标')
    for (const o of c.observers) lines.push(`- ${o.name || o.id} (${o.id}, ${o.level}, ${o.dtype})${o.description ? `：${o.description}` : ''}`)
  }
  return joinLines(lines)
}

function deriveDesignConcepts(c: ModelConfigShape, locale?: string): string {
  if (isChineseOddLocale(locale)) return deriveDesignConceptsZh(c)
  const lines: string[] = []
  const macro = c.observers.filter((o) => o.level === 'macro').map((o) => o.name || o.id)
  if (macro.length) lines.push(`- Emergence: macro observers [${macro.join(', ')}] track the aggregate patterns produced by individual interactions.`)
  if (c.environment.type !== 'none') {
    lines.push(`- Interaction: agents make contact, influence neighbors, or compete for resources through the ${c.environment.type} topology/space.`)
  }
  lines.push('- Stochasticity: each run binds a random seed; results are reproducible given the seed, parameters, and model version.')
  if (c.observers.some((o) => o.level === 'micro')) {
    lines.push('- Observation: micro observers expose agent state for Trace evidence and local explanation.')
  }
  if (c.mechanisms.length > 0) {
    lines.push(`- Adaptation / Decision: the core decision process comes from ${c.mechanisms.map((m) => m.name || m.id).join(', ')}.`)
  }
  return joinLines(lines)
}

function deriveDesignConceptsZh(c: ModelConfigShape): string {
  const lines: string[] = []
  const macro = c.observers.filter((o) => o.level === 'macro').map((o) => o.name || o.id)
  if (macro.length) lines.push(`- Emergence：通过宏观观测指标 [${macro.join(', ')}] 追踪个体互动导致的总体模式。`)
  if (c.environment.type !== 'none') lines.push(`- Interaction：智能体通过 ${c.environment.type} 拓扑/空间发生接触、邻域影响或资源竞争。`)
  lines.push('- Stochasticity：每次运行绑定随机种子；给定 seed、参数和模型版本后结果可复现。')
  if (c.observers.some((o) => o.level === 'micro')) lines.push('- Observation：微观观测器暴露智能体状态，可用于 Trace 证据定位和局部解释。')
  if (c.mechanisms.length > 0) lines.push(`- Adaptation / Decision：核心决策过程来自 ${c.mechanisms.map((m) => m.name || m.id).join('、')}。`)
  return joinLines(lines)
}

function deriveInitialization(c: ModelConfigShape, locale?: string): string {
  if (isChineseOddLocale(locale)) return deriveInitializationZh(c)
  const lines: string[] = ['### Initial state']
  const counts = Object.entries(c.initialization.agentCounts)
  if (counts.length === 0) {
    lines.push('- No initial agent counts declared.')
  } else {
    for (const [typeId, count] of counts) {
      lines.push(`- ${typeId}: ${count}`)
    }
  }
  if (c.initialization.notes) lines.push(`- Initialization notes: ${c.initialization.notes}`)
  lines.push('- Reproducibility: initialization must be recorded together with the seed, parameter defaults, and model version.')
  return joinLines(lines)
}

function deriveInitializationZh(c: ModelConfigShape): string {
  const lines: string[] = ['### 初始状态']
  const counts = Object.entries(c.initialization.agentCounts)
  if (counts.length === 0) lines.push('- 未声明初始智能体数量。')
  else for (const [typeId, count] of counts) lines.push(`- ${typeId}: ${count}`)
  if (c.initialization.notes) lines.push(`- 初始化说明：${c.initialization.notes}`)
  lines.push('- 可复现要求：初始化必须与 seed、参数默认值和模型版本一起记录。')
  return joinLines(lines)
}

function deriveInput(c: ModelConfigShape, locale?: string): string {
  if (isChineseOddLocale(locale)) return deriveInputZh(c)
  if (c.parameters.length === 0) return 'No external input parameters declared; the model is driven mainly by initialization and internal mechanisms.'
  const lines = ['### Parameter inputs']
  for (const p of c.parameters) {
    const range =
      p.min !== null || p.max !== null
        ? ` [${p.min ?? '-∞'}, ${p.max ?? '∞'}]`
        : ''
    const def = p.default !== undefined ? `; default=${JSON.stringify(p.default)}` : ''
    const step = p.step !== null ? `; step=${p.step}` : ''
    lines.push(`- ${p.name || p.id} (${p.id}): type=${p.dtype || 'unknown'}; scope=${p.scope}${def}${range}${step}`)
  }
  lines.push('- Parameter experiments: bounded parameters suit sensitivity/uncertainty analysis; unbounded parameters are recorded as exact inputs.')
  return joinLines(lines)
}

function deriveInputZh(c: ModelConfigShape): string {
  if (c.parameters.length === 0) return '未声明外部输入参数；模型主要由初始化和内部机制驱动。'
  const lines = ['### 参数输入']
  for (const p of c.parameters) {
    const range = p.min !== null || p.max !== null ? ` [${p.min ?? '-∞'}, ${p.max ?? '∞'}]` : ''
    const def = p.default !== undefined ? `；默认值=${JSON.stringify(p.default)}` : ''
    const step = p.step !== null ? `；步长=${p.step}` : ''
    lines.push(`- ${p.name || p.id} (${p.id})：类型=${p.dtype || 'unknown'}；作用域=${p.scope}${def}${range}${step}`)
  }
  lines.push('- 参数实验：有范围的参数适合敏感性/不确定性分析；无范围参数默认以精确输入记录。')
  return joinLines(lines)
}

function deriveSubmodels(c: ModelConfigShape, locale?: string): string {
  if (isChineseOddLocale(locale)) return deriveSubmodelsZh(c)
  if (c.mechanisms.length === 0) return 'No submodels declared.'
  const lines: string[] = []
  for (const m of c.mechanisms) {
    lines.push(`### ${m.name || m.id} (${m.id})`)
    if (m.description) lines.push(`- Mechanism notes: ${m.description}`)
    if (m.trigger) lines.push(`- Trigger: ${m.trigger}`)
    if (m.effect) lines.push(`- State/environment effect: ${m.effect}`)
    if (m.codeRef) lines.push(`- Decision code reference: ${m.codeRef}`)
    lines.push('- Explanation entry: click this node in the mechanism graph to explain its contribution with Trace and parameters.')
  }
  return joinLines(lines)
}

function deriveSubmodelsZh(c: ModelConfigShape): string {
  if (c.mechanisms.length === 0) return '未声明子模型。'
  const lines: string[] = []
  for (const m of c.mechanisms) {
    lines.push(`### ${m.name || m.id} (${m.id})`)
    if (m.description) lines.push(`- 机制说明：${m.description}`)
    if (m.trigger) lines.push(`- 触发条件：${m.trigger}`)
    if (m.effect) lines.push(`- 状态/环境影响：${m.effect}`)
    if (m.codeRef) lines.push(`- 决策代码引用：${m.codeRef}`)
    lines.push('- 解释入口：机制图中点击该节点可结合 Trace 与参数解释其贡献。')
  }
  return joinLines(lines)
}

const SECTION_DERIVERS: Record<OddSectionKey, (c: ModelConfigShape, locale?: string) => string> = {
  purpose: derivePurpose,
  entities: deriveEntities,
  process: deriveProcess,
  designConcepts: deriveDesignConcepts,
  initialization: deriveInitialization,
  input: deriveInput,
  submodels: deriveSubmodels,
}

/** Derive the seven ODD sections purely from a ModelConfig (no LLM, no invention). */
export function deriveOdd(config: ModelConfig, locale?: string): Odd {
  const c = readModelConfig(config)
  const sections = {} as Record<OddSectionKey, OddSection>
  for (const key of ODD_SECTION_KEYS) {
    sections[key] = { text: SECTION_DERIVERS[key](c, locale), derived: true }
  }
  return {
    schemaVersion: ODD_SCHEMA_VERSION,
    modelId: c.id,
    modelVersion: c.version,
    generatedAt: new Date().toISOString(),
    sections,
  }
}

/**
 * Render an ODD to a Markdown document for the reproduction package (P3 Task 6).
 * Hand-written sections are flagged so a reader can tell derived text from
 * author intent, and stale (needsReview) sections carry a warning.
 */
export function renderOddMarkdown(odd: Odd, locale?: string): string {
  const lines: string[] = [
    `# ODD Protocol — ${odd.modelId} (v${odd.modelVersion})`,
    '',
    `_Generated ${odd.generatedAt}_`,
    '',
  ]
  for (const key of ODD_SECTION_KEYS) {
    const section = odd.sections[key]
    if (!section) continue
    lines.push(`## ${oddSectionTitle(key, locale)}`)
    if (!section.derived) lines.push('_(hand-written)_')
    if (section.needsReview) lines.push('> ⚠️ May be stale relative to the current model.')
    lines.push('')
    lines.push(section.text)
    lines.push('')
  }
  return lines.join('\n')
}

export interface OddMergeResult {
  odd: Odd
  /** Section keys whose hand-written text may now be stale vs the model. */
  conflicts: OddSectionKey[]
}

/**
 * Merge a freshly-derived ODD into a previous one:
 *   - auto-derived sections: refreshed with the new derivation.
 *   - hand-written sections: preserved verbatim; if the freshly-derived text
 *     differs from the previous derivation baseline, mark `needsReview` and
 *     surface it as a conflict (never silently overwritten).
 */
export function mergeOdd(prev: Odd | null, derived: Odd): OddMergeResult {
  if (!prev) return { odd: derived, conflicts: [] }

  const conflicts: OddSectionKey[] = []
  const sections = {} as Record<OddSectionKey, OddSection>

  for (const key of ODD_SECTION_KEYS) {
    const prevSection = prev.sections[key]
    const derivedSection = derived.sections[key]

    if (prevSection && prevSection.derived === false) {
      // User hand-wrote this section: keep their text, flag drift for review.
      const drifted = prevSection.text.trim() !== derivedSection.text.trim()
      sections[key] = {
        text: prevSection.text,
        derived: false,
        ...(drifted ? { needsReview: true } : {}),
      }
      if (drifted) conflicts.push(key)
    } else {
      // Auto-derived (or missing): adopt the fresh derivation.
      sections[key] = derivedSection
    }
  }

  return {
    odd: {
      schemaVersion: ODD_SCHEMA_VERSION,
      modelId: derived.modelId,
      modelVersion: derived.modelVersion,
      generatedAt: derived.generatedAt,
      sections,
    },
    conflicts,
  }
}
