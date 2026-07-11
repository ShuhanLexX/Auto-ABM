import { ArrowRight, GitCompare, Minus, Pencil, Plus } from 'lucide-react'

/**
 * Structural-change diff carried by an `abm_edit_model` permission request
 * (conversation-ux.md §3). The tool computes old -> new and the version bump
 * (modelVersioning) on the server; the desktop only renders it for approval.
 */
export interface ModelDiffChange {
  path: string
  op: 'added' | 'removed' | 'modified'
  before?: unknown
  after?: unknown
}

export interface ModelDiff {
  modelId?: string
  fromVersion?: string
  toVersion?: string
  structural: boolean
  changes: ModelDiffChange[]
  oddImpact: string[]
}

function normalizeOp(value: unknown): ModelDiffChange['op'] {
  if (value === 'added' || value === 'add') return 'added'
  if (value === 'removed' || value === 'remove' || value === 'deleted') return 'removed'
  return 'modified'
}

function readChange(raw: unknown): ModelDiffChange | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const path = typeof obj.path === 'string' ? obj.path : typeof obj.field === 'string' ? obj.field : null
  if (!path) return null
  return {
    path,
    op: normalizeOp(obj.op ?? obj.kind),
    before: obj.before,
    after: obj.after,
  }
}

/**
 * Defensively coerce an `abm_edit_model` permission input into a ModelDiff.
 * Accepts either the diff at the top level or nested under `diff`.
 */
export function parseModelDiff(input: unknown): ModelDiff | null {
  if (!input || typeof input !== 'object') return null
  const root = input as Record<string, unknown>
  const src = (root.diff && typeof root.diff === 'object' ? root.diff : root) as Record<string, unknown>
  const changes = Array.isArray(src.changes)
    ? src.changes.map(readChange).filter((c): c is ModelDiffChange => c !== null)
    : []
  if (changes.length === 0) return null
  const oddImpact = Array.isArray(src.oddImpact)
    ? src.oddImpact.filter((s): s is string => typeof s === 'string')
    : []
  return {
    modelId: typeof src.modelId === 'string' ? src.modelId : undefined,
    fromVersion: typeof src.fromVersion === 'string' ? src.fromVersion : undefined,
    toVersion: typeof src.toVersion === 'string' ? src.toVersion : undefined,
    structural: src.structural === true,
    changes,
    oddImpact,
  }
}

function renderValue(value: unknown): string {
  if (value === undefined) return '∅'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

const OP_META: Record<ModelDiffChange['op'], { Icon: typeof Plus; color: string; label: string }> = {
  added: { Icon: Plus, color: 'var(--color-success)', label: 'added' },
  removed: { Icon: Minus, color: 'var(--color-danger)', label: 'removed' },
  modified: { Icon: Pencil, color: 'var(--color-brand)', label: 'changed' },
}

export function ModelDiffPreview({ diff }: { diff: ModelDiff }) {
  return (
    <div data-testid="model-diff-preview" className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)]/65 px-3 py-2">
        <GitCompare size={14} strokeWidth={2.1} className="shrink-0 text-[var(--color-brand)]" aria-hidden="true" />
        <span className="text-[12px] font-semibold text-[var(--color-text-primary)]">
          {diff.modelId ? `Model "${diff.modelId}"` : 'Model'} structural change
        </span>
        {diff.fromVersion || diff.toVersion ? (
          <span
            data-testid="model-diff-version"
            className="ml-auto flex items-center gap-1 font-[var(--font-mono)] text-[11px] text-[var(--color-text-secondary)]"
          >
            v{diff.fromVersion ?? '?'}
            <ArrowRight size={11} strokeWidth={2.4} aria-hidden="true" />
            <span className="font-semibold text-[var(--color-text-primary)]">v{diff.toVersion ?? '?'}</span>
          </span>
        ) : null}
      </div>

      <ul className="divide-y divide-[var(--color-border)]/40">
        {diff.changes.map((change, index) => {
          const meta = OP_META[change.op]
          const Icon = meta.Icon
          return (
            <li key={`${change.path}-${index}`} data-testid="model-diff-change" className="flex items-start gap-2 px-3 py-2">
              <Icon size={13} strokeWidth={2.3} style={{ color: meta.color }} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="font-[var(--font-mono)] text-[11px] font-medium text-[var(--color-text-primary)]">{change.path}</div>
                {change.op === 'modified' ? (
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 font-[var(--font-mono)] text-[10px] text-[var(--color-text-tertiary)]">
                    <span className="line-through">{renderValue(change.before)}</span>
                    <ArrowRight size={10} strokeWidth={2.4} aria-hidden="true" />
                    <span className="text-[var(--color-text-secondary)]">{renderValue(change.after)}</span>
                  </div>
                ) : (
                  <div className="mt-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-text-tertiary)]">
                    {renderValue(change.op === 'removed' ? change.before : change.after)}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {diff.oddImpact.length > 0 ? (
        <div className="border-t border-[var(--color-border)]/65 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-outline)]">
            ODD impact
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {diff.oddImpact.map((section) => (
              <span
                key={section}
                className="rounded-full border border-[var(--color-border)]/70 bg-[var(--color-surface-container-low)] px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)]"
              >
                {section}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
