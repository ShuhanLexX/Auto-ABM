/**
 * ABM conversation references (P2 Task 7, conversation-ux.md §3).
 *
 * The composer can attach `@Simulation / @Run / @Experiment` and a brushed
 * "Trace interval" as *structured* context on the outgoing user message (not
 * free text), so the agent tools resolve real ids instead of guessing. When the
 * user adds no explicit reference, the conversation is bound to the currently
 * active Simulation by default; an explicit `@` reference overrides that.
 *
 * Also defines the dialogue-mode tool gate: in dialogue (read-only) mode the
 * agent may only run query/explain tools — every mutating ABM tool is removed.
 */

export type AbmReferenceKind = 'simulation' | 'run' | 'experiment' | 'trace-interval'

/** A reference to an ABM object, or a brushed trace interval, on the message. */
export type AbmReference =
  | { kind: 'simulation' | 'run' | 'experiment'; id: string; label?: string }
  | { kind: 'trace-interval'; runId: string; from: number; to: number; label?: string }

export interface AbmMessageContext {
  /** Resolved references that travel with the user message (structured). */
  references: AbmReference[]
  /** True when the active Simulation was used as the implicit default. */
  boundByDefault: boolean
  /** The current research question (project) the conversation is scoped to. */
  activeProjectId?: string | null
}

/**
 * Build the structured context for an outgoing message. Explicit references win;
 * when none are supplied we bind the active Simulation so the agent always has a
 * target. The active project id is always carried (when known) so the agent
 * scopes its inspection to the current research question and does not pull in
 * simulations that belong to other research questions.
 */
export function buildAbmContext(params: {
  activeSimId: string | null
  activeProjectId?: string | null
  references?: AbmReference[]
}): AbmMessageContext {
  const activeProjectId = params.activeProjectId ?? null
  const explicit = params.references ?? []
  if (explicit.length > 0) {
    return { references: dedupeReferences(explicit), boundByDefault: false, activeProjectId }
  }
  if (params.activeSimId) {
    return {
      references: [{ kind: 'simulation', id: params.activeSimId }],
      boundByDefault: true,
      activeProjectId,
    }
  }
  return { references: [], boundByDefault: false, activeProjectId }
}

function referenceKey(ref: AbmReference): string {
  return ref.kind === 'trace-interval'
    ? `trace-interval:${ref.runId}:${ref.from}:${ref.to}`
    : `${ref.kind}:${ref.id}`
}

function dedupeReferences(references: AbmReference[]): AbmReference[] {
  const seen = new Set<string>()
  const out: AbmReference[] = []
  for (const ref of references) {
    const key = referenceKey(ref)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}

function describeReference(ref: AbmReference): string {
  switch (ref.kind) {
    case 'simulation':
      return `@Simulation ${ref.label ?? ref.id} (id=${ref.id})`
    case 'run':
      return `@Run ${ref.label ?? ref.id} (id=${ref.id})`
    case 'experiment':
      return `@Experiment ${ref.label ?? ref.id} (id=${ref.id})`
    case 'trace-interval':
      return `@Trace interval (run=${ref.runId}, ticks ${ref.from}–${ref.to})`
  }
}

/**
 * Render the structured context as a compact prompt block prepended to the user
 * message. Returns '' when there is nothing to attach.
 */
export function formatAbmReferencePrompt(context: AbmMessageContext): string {
  const hasProject = Boolean(context.activeProjectId)
  if (context.references.length === 0 && !hasProject) return ''
  const lines = ['ABM context:']
  if (hasProject) {
    lines.push(`- Current research question (project id=${context.activeProjectId}).`)
    lines.push(
      '- Scope every inspection, adoption, edit, run, and citation to this project only. Simulations under other research questions are separate studies; do not inspect, list, cite, or reuse them unless the user explicitly asks. When this project has no simulation yet, start from the user\'s request rather than importing an unrelated existing simulation.',
    )
  }
  for (const ref of context.references) lines.push(`- ${describeReference(ref)}`)
  if (context.boundByDefault) {
    lines.push('(bound to the active Simulation by default; @-reference to override)')
  }
  return lines.join('\n')
}

function preferredLanguageForLocale(locale: string): string {
  if (locale === 'zh' || locale === 'zh-TW') return 'chinese'
  if (locale === 'jp') return 'japanese'
  if (locale === 'kr') return 'korean'
  return 'english'
}

/** Desktop ABM composer: instruct the agent to match UI / response language. */
export function getAbmLanguageInstruction(locale: string, _responseLanguage: string): string {
  const preferred =
    preferredLanguageForLocale(locale)
  return [
    'Language:',
    `Preferred response language: ${preferred}.`,
    'If the latest user message is clearly English, reply in English for this turn. If the latest user message is clearly Chinese, reply in Chinese for this turn. Only fall back to the preferred response language when the latest user message language is ambiguous.',
    'Do not let an older turn, a previous assistant reply, or a stale saved response-language preference override the latest clearly-English or clearly-Chinese user message.',
    'In English UI, use English by default. In Chinese UI, use Chinese by default. Never mix Chinese and English for user-facing prose unless the user mixed them or a technical term requires it.',
    'All user-facing text — including AskUserQuestion questions, tab headers, option labels/descriptions, proposal summaries, and explanations — must follow that language choice.',
    'For a clearly English latest user message or English UI, every AskUserQuestion string must be English: question text, headers, option labels, option descriptions, placeholders, and custom-response prompts. Do not emit Chinese characters in those fields.',
    'Before calling AskUserQuestion, check the tool input for the chosen language. If any generated UI string is in the wrong language, rewrite it before making the tool call.',
    'When using AskUserQuestion, the tool input must include the required top-level questions array.',
    'Keep code identifiers and technical parameter ids in their original form.',
  ].join(' ')
}

/** Mutating ABM tools — blocked in dialogue mode (only explain/query survive). */
export const ABM_MUTATING_TOOLS: readonly string[] = [
  'abm_propose_simulations',
  'abm_adopt_simulation',
  'abm_edit_model',
  'abm_run',
  'abm_update_odd',
  'abm_stop_run',
]

export function isAbmMutatingTool(toolName: string): boolean {
  return ABM_MUTATING_TOOLS.includes(toolName)
}

/**
 * Filter a tool list for the given mode. Research mode keeps every tool (writes
 * still go through approval); dialogue mode strips mutating ABM tools so the
 * conversation is read-only.
 */
export function allowedAbmTools(mode: AbmConversationMode, toolNames: string[]): string[] {
  if (mode === 'research' || mode === 'autonomous') return toolNames
  return toolNames.filter((name) => !isAbmMutatingTool(name))
}

export type AbmConversationMode = 'research' | 'dialogue' | 'autonomous'

export function getAbmModeInstruction(mode: AbmConversationMode): string {
  if (mode === 'dialogue') {
    return [
      'ABM mode: Dialogue.',
      'Explain, compare, summarize evidence, and answer research questions only.',
      'Do not create simulations, edit models, start runs, stop runs, or update ODD unless the user switches to research/autonomous mode.',
    ].join(' ')
  }
  if (mode === 'autonomous') {
    return [
      'ABM mode: Autonomous exploration.',
      'Treat the user message as a research objective, not a single Q&A prompt.',
      'Case-library examples are display-only examples for users. Do not inspect, cite, import, or reuse a case/template/current simulation as the starting point for a new model unless the user explicitly selected that case or asked to modify the active simulation.',
      'Do not call internal model families "templates" in user-facing prose; say model family, baseline model, or runnable simulation instead.',
      'Avoid routine AskUserQuestion interruptions. Ask only when the objective is genuinely ambiguous, authority is missing, or the next action would be destructive/outside ABM research. Once the objective is actionable, continue autonomously through a deep-search style workflow.',
      'Run visible stages and label interim updates as stage progress in the active response language rather than final answers: 1) problem framing, 2) model family search/design, 3) adoption/editing, 4) validation-agent review, 5) baseline run, 6) experiment UI/charts, 7) evidence-backed interpretation, 8) final research synthesis.',
      'Use ABM research agents and skills as an explicit work plan, and use available ABM tools to open/focus the workbench, inspect simulations, adopt or edit models, validate every adopted/edited model, run simulations, configure experiment views/charts, inspect agents, and explain real evidence intervals.',
      'Call the validation agent/tool after model creation and after structural edits; do not run experiments on an invalid model unless you first report the blocker.',
      'Prefer mechanism-diverse ABM models and real metric/Trace evidence; never invent run ids, charts, agent states, or numeric results.',
      'In autonomous sessions, apply ABM model edits and experiment setup without extra confirmation when session permissions allow it, then continue the workflow until a final synthesis is ready.',
    ].join(' ')
  }
  return [
    'ABM mode: Research.',
    'Case-library examples are display-only examples for users. Do not inspect, cite, import, or reuse a case/template/current simulation as the starting point for a new model unless the user explicitly selected that case or asked to modify the active simulation.',
    'Do not call internal model families "templates" in user-facing prose; say model family, baseline model, or runnable simulation instead.',
    'Clarify rough modeling needs before generating proposals, then use ABM tools for adoption, validation, runs, result views, ODD, and evidence-backed explanations.',
  ].join(' ')
}
