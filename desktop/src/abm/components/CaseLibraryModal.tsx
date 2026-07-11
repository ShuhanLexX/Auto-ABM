import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BookOpen, CheckCircle2, Import, Layers, Search, Sparkles } from 'lucide-react'
import { abmClient } from '../api/abmClient'
import { ABM_CASE_CATEGORIES, ABM_CASE_LIBRARY, type AbmCaseCategory, type AbmCaseStudy } from '../researchAssets'
import { getCaseCategoryLabel, getCaseLibraryUi, getCaseStudyDisplay } from '../caseLibraryText'
import { useAbmStore } from '../stores/abmStore'
import type { AbmProject, AbmSimulation } from '../types'
import { Modal } from '../../components/shared/Modal'
import { useSettingsStore } from '../../stores/settingsStore'
import { useUIStore } from '../../stores/uiStore'
import { SimulationPreview } from './SimulationPreview'

interface Props {
  open: boolean
  initialCaseId?: string | null
  onClose: () => void
  onImported?: (simulation: AbmSimulation, study: AbmCaseStudy) => void
}

const TEMPLATE_ACCENTS: Record<AbmCaseStudy['template'], string> = {
  rumor: '#60a5fa',
  sir: '#f87171',
  schelling: '#34d399',
  diffusion: '#fbbf24',
  opinion: '#a78bfa',
  public_goods: '#22d3ee',
  social_influence: '#fb923c',
  wildfire: '#ef4444',
}

function formatUi(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => String(params[key] ?? match))
}

export function CaseLibraryModal({ open, initialCaseId, onClose, onImported }: Props) {
  const locale = useSettingsStore((state) => state.locale)
  const ui = useMemo(() => getCaseLibraryUi(locale), [locale])
  const addToast = useUIStore((state) => state.addToast)
  const activeProjectId = useAbmStore((state) => state.activeProjectId)
  const setActiveProject = useAbmStore((state) => state.setActiveProject)
  const setActiveSim = useAbmStore((state) => state.setActiveSim)
  const requestView = useAbmStore((state) => state.requestView)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | AbmCaseCategory>('all')
  const [selectedId, setSelectedId] = useState(initialCaseId || ABM_CASE_LIBRARY[0]?.id || '')
  const [projects, setProjects] = useState<AbmProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (initialCaseId) setSelectedId(initialCaseId)
  }, [initialCaseId, open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingProjects(true)
    abmClient
      .listProjects()
      .then(({ projects }) => {
        if (cancelled) return
        setProjects(projects)
        const preferred = activeProjectId && projects.some((project) => project.id === activeProjectId)
          ? activeProjectId
          : projects[0]?.id ?? ''
        setSelectedProjectId(preferred)
      })
      .catch(() => {
        if (!cancelled) {
          setProjects([])
          setSelectedProjectId('')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeProjectId, open])

  const categoryOptions = useMemo<Array<'all' | AbmCaseCategory>>(() => ['all', ...ABM_CASE_CATEGORIES], [])
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return ABM_CASE_LIBRARY.filter((study) => {
      if (category !== 'all' && study.category !== category) return false
      if (!normalized) return true
      const display = getCaseStudyDisplay(study, locale)
      const haystack = `${display.name} ${display.subtitle} ${display.domain} ${display.category} ${display.tags.join(' ')}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }, [category, locale, query])

  const groups = useMemo(
    () =>
      ABM_CASE_CATEGORIES.map((cat) => ({
        category: cat,
        items: filtered.filter((study) => study.category === cat),
      })).filter((group) => group.items.length > 0),
    [filtered],
  )
  const selected = filtered.find((study) => study.id === selectedId) ?? filtered[0] ?? ABM_CASE_LIBRARY[0]
  const selectedDisplay = selected ? getCaseStudyDisplay(selected, locale) : null

  const importStudy = async (study: AbmCaseStudy, targetView: 'simulations' | 'run' = 'simulations') => {
    const display = getCaseStudyDisplay(study, locale)
    setImportingId(study.id)
    try {
      let projectId = selectedProjectId
      if (!projectId) {
        const project = await abmClient.createProject(ui.defaultProjectName, `${ui.defaultProjectQuestion}: ${display.name}`)
        projectId = project.id
        setProjects((current) => [project, ...current])
        setSelectedProjectId(project.id)
      }
      const simulation = await abmClient.createSimulation(projectId, {
        name: display.name,
        template: study.template,
        seed: study.defaults?.seed ?? 42,
        steps: study.defaults?.steps ?? 120,
        params: study.defaults?.params ?? {},
      })
      setActiveProject(projectId)
      setActiveSim(simulation.id)
      requestView(targetView)
      addToast({ type: 'success', message: `${display.name} ${ui.addedSuffix}` })
      onImported?.(simulation, study)
      onClose()
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : ui.importError,
      })
    } finally {
      setImportingId(null)
    }
  }

  const renderCard = (study: AbmCaseStudy) => {
    const active = selected?.id === study.id
    const display = getCaseStudyDisplay(study, locale)
    return (
      <article
        key={study.id}
        data-testid="case-library-card"
        data-active={active ? 'true' : undefined}
        className={`flex min-h-[184px] flex-col overflow-hidden rounded-[12px] border text-left transition-colors ${
          active
            ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/6'
            : 'border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-hover)]'
        }`}
      >
        <div className="h-1" style={{ backgroundColor: TEMPLATE_ACCENTS[study.template] }} />
        <button type="button" onClick={() => setSelectedId(study.id)} className="flex min-h-0 flex-1 flex-col p-3 text-left">
          <SimulationPreview study={study} compact />
          <div className="mt-3 flex items-start justify-between gap-2">
            <span className="rounded-full bg-[var(--color-surface-container)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)]">
              {display.domain}
            </span>
            <span className="rounded-full bg-[var(--color-brand)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-brand)]">
              {display.difficulty}
            </span>
          </div>
          <div className="mt-3 text-[15px] font-semibold leading-5 text-[var(--color-text-primary)]">
            {display.name}
          </div>
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-secondary)]">
            {display.subtitle}
          </div>
          <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
            {[display.canvas, ...display.tags.slice(0, 2)].map((tag) => (
              <span key={tag} className="rounded-full bg-[var(--color-surface-container-low)] px-2 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                {tag}
              </span>
            ))}
          </div>
        </button>
        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          <button
            type="button"
            aria-label={`${ui.add}: ${display.name}`}
            disabled={importingId === study.id}
            onClick={() => void importStudy(study, 'simulations')}
            className="h-8 rounded-[8px] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:cursor-wait disabled:opacity-60"
          >
            {ui.add}
          </button>
          <button
            type="button"
            aria-label={`${ui.open}: ${display.name}`}
            disabled={importingId === study.id}
            onClick={() => void importStudy(study, 'run')}
            className="h-8 rounded-[8px] bg-[var(--color-brand)] text-xs font-semibold text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {ui.open}
          </button>
        </div>
      </article>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={ui.title} width={1320}>
      <div data-testid="case-library-modal" className="flex min-h-[640px] flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[260px] flex-1 text-sm font-medium text-[var(--color-text-secondary)]">
            {ui.intro}
          </div>
          <label className="flex h-9 min-w-[240px] items-center gap-2 rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3">
            <span className="text-xs font-medium text-[var(--color-text-tertiary)]">{ui.importTo}</span>
            <select
              value={selectedProjectId}
              disabled={loadingProjects}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-xs font-medium text-[var(--color-text-primary)] outline-none disabled:text-[var(--color-text-tertiary)]"
            >
              {projects.length === 0 ? (
                <option value="">{ui.newProject}</option>
              ) : (
                projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.researchQuestion || project.name}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] gap-4">
          <section className="flex min-h-0 flex-col rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] p-3">
              <label className="flex h-9 min-w-[260px] flex-1 items-center gap-2 rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3">
                <Search className="h-4 w-4 text-[var(--color-text-tertiary)]" strokeWidth={2} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={ui.searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
                />
              </label>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as 'all' | AbmCaseCategory)}
                className="h-9 rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3 text-xs font-medium text-[var(--color-text-primary)] outline-none"
              >
                {categoryOptions.map((item) => (
                  <option key={item} value={item}>
                    {item === 'all' ? ui.all : getCaseCategoryLabel(item, locale)}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              {groups.length === 0 ? (
                <div className="grid h-full min-h-[240px] place-items-center px-6 text-center text-sm text-[var(--color-text-tertiary)]">
                  {ui.empty}
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {groups.map((group) => (
                    <section key={group.category} data-testid={`case-category-${group.category}`}>
                      <div className="mb-2 flex items-center gap-2">
                        <h3 className="text-xs font-semibold text-[var(--color-text-secondary)]">{getCaseCategoryLabel(group.category, locale)}</h3>
                        <span className="rounded-full bg-[var(--color-surface-container)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]">
                          {group.items.length}
                        </span>
                        <span className="h-px flex-1 bg-[var(--color-border)]" />
                      </div>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                        {group.items.map((study) => renderCard(study))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
            {filtered.length > 0 ? (
              <div className="flex flex-none items-center border-t border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-tertiary)]">
                {formatUi(ui.totalCount, { total: filtered.length })}
              </div>
            ) : null}
          </section>

          {selected && selectedDisplay ? (
            <aside className="flex min-h-0 flex-col rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)]">
              <div className="border-b border-[var(--color-border)] p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-brand)]">
                  <BookOpen className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  {ui.details}
                </div>
                <div className="mt-3">
                  <SimulationPreview study={selected} />
                </div>
                <h3 className="mt-3 text-xl font-semibold leading-7 text-[var(--color-text-primary)]">
                  {selectedDisplay.name}
                </h3>
                <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
                  {selectedDisplay.summary}
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-4">
                <DetailBlock icon={<Layers className="h-4 w-4" strokeWidth={2} aria-hidden="true" />} title={ui.mechanism}>
                  {selectedDisplay.mechanism}
                </DetailBlock>
                <DetailBlock icon={<Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden="true" />} title={ui.experiments}>
                  <ul className="space-y-1">
                    {selectedDisplay.experiments.map((item) => <li key={item}>· {item}</li>)}
                  </ul>
                </DetailBlock>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <InfoPill label={ui.canvas} value={selectedDisplay.canvas} />
                  <InfoPill label={ui.scale} value={selectedDisplay.scale} />
                  <InfoPill label={ui.template} value={selected.template} />
                  <InfoPill label={ui.metrics} value={selectedDisplay.metrics.slice(0, 2).join(' / ')} />
                </div>
              </div>

              <div className="border-t border-[var(--color-border)] p-4">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={importingId === selected.id}
                    onClick={() => void importStudy(selected, 'simulations')}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-wait disabled:opacity-60"
                  >
                    {importingId === selected.id ? (
                      <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    ) : (
                      <Import className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    )}
                    {ui.addToProject}
                  </button>
                  <button
                    type="button"
                    disabled={importingId === selected.id}
                    onClick={() => void importStudy(selected, 'run')}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[var(--color-brand)] px-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
                  >
                    <Import className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    {ui.addAndOpen}
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-center gap-1 text-[11px] text-[var(--color-text-tertiary)]">
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  {ui.importedNote}
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

function DetailBlock({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)]">
        {icon}
        {title}
      </div>
      <div className="text-xs leading-5 text-[var(--color-text-secondary)]">{children}</div>
    </section>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[9px] bg-[var(--color-surface)] px-3 py-2">
      <div className="text-[10px] font-medium text-[var(--color-text-tertiary)]">{label}</div>
      <div className="mt-0.5 truncate text-xs font-semibold text-[var(--color-text-primary)]">{value}</div>
    </div>
  )
}
