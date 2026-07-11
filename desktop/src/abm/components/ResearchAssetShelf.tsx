import { useEffect, useMemo, useState } from 'react'
import { Clock3, ExternalLink, FlaskConical, LibraryBig, Network } from 'lucide-react'
import { abmClient } from '../api/abmClient'
import { getCaseStudyDisplay, isChineseCaseLocale } from '../caseLibraryText'
import { ABM_CASE_LIBRARY } from '../researchAssets'
import { useAbmStore } from '../stores/abmStore'
import type { AbmProject, AbmSimulation } from '../types'
import { useSettingsStore } from '../../stores/settingsStore'
import { useSessionStore } from '../../stores/sessionStore'
import { SimulationPreview } from './SimulationPreview'

interface Props {
  onOpenCaseLibrary: (caseId?: string) => void
}

interface RecentSimulation {
  project: AbmProject
  simulation: AbmSimulation
}

const SHELF_TEXT_EN = {
  recent: 'Recent Simulations',
  viewManagement: 'View Simulation Management',
  open: 'Open',
  recentEmpty: 'No recent simulations yet. Import a model from the case library, or generate proposals in chat.',
  featured: 'Featured Cases',
  openAll: 'Open All Cases',
}

const SHELF_TEXT_ZH = {
  recent: '最近仿真',
  viewManagement: '查看仿真管理',
  open: '打开',
  recentEmpty: '暂无最近仿真。可以先从案例库导入一个模型，或在对话中生成方案。',
  featured: '案例库精选',
  openAll: '打开全部案例',
}

export function ResearchAssetShelf({ onOpenCaseLibrary }: Props) {
  const locale = useSettingsStore((state) => state.locale)
  const text = isChineseCaseLocale(locale) ? SHELF_TEXT_ZH : SHELF_TEXT_EN
  const activeProjectId = useAbmStore((state) => state.activeProjectId)
  const setActiveProject = useAbmStore((state) => state.setActiveProject)
  const setActiveSim = useAbmStore((state) => state.setActiveSim)
  const requestView = useAbmStore((state) => state.requestView)
  const sessionCount = useSessionStore((state) => state.sessions.length)
  const sessionsLoading = useSessionStore((state) => state.isLoading)
  const [recent, setRecent] = useState<RecentSimulation[]>([])

  useEffect(() => {
    let cancelled = false
    if (!sessionsLoading && sessionCount === 0) {
      void abmClient
        .deleteAllProjects()
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setRecent([])
        })
      return () => {
        cancelled = true
      }
    }
    abmClient
      .listProjects()
      .then(async ({ projects }) => {
        const scoped = activeProjectId
          ? [
              ...projects.filter((project) => project.id === activeProjectId),
              ...projects.filter((project) => project.id !== activeProjectId),
            ]
          : projects
        const rows = await Promise.all(
          scoped.slice(0, 5).map(async (project) => {
            const { simulations } = await abmClient.listSimulations(project.id)
            return simulations.map((simulation) => ({ project, simulation }))
          }),
        )
        if (!cancelled) {
          setRecent(rows.flat().sort((a, b) => (
            new Date(b.simulation.createdAt).getTime() - new Date(a.simulation.createdAt).getTime()
          )).slice(0, 3))
        }
      })
      .catch(() => {
        if (!cancelled) setRecent([])
      })
    return () => {
      cancelled = true
    }
  }, [activeProjectId, sessionCount, sessionsLoading])

  const showcaseCases = useMemo(() => ABM_CASE_LIBRARY.slice(0, 4), [])

  const openRecent = (item: RecentSimulation) => {
    setActiveProject(item.project.id)
    setActiveSim(item.simulation.id)
    requestView('run')
  }

  return (
    <div data-testid="research-asset-shelf" className="mt-5 w-full max-w-5xl space-y-3">
      <section className="rounded-[18px] border border-[var(--color-border)]/70 bg-[var(--color-surface-container-lowest)]/78 p-3 shadow-sm backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)]">
            <Clock3 className="h-4 w-4 text-[var(--color-brand)]" strokeWidth={2} aria-hidden="true" />
            {text.recent}
          </div>
          <button
            type="button"
            onClick={() => requestView('simulations')}
            className="text-xs font-medium text-[var(--color-brand)] hover:underline"
          >
            {text.viewManagement}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {recent.length > 0 ? (
            recent.slice(0, 3).map((item) => (
              <button
                key={item.simulation.id}
                type="button"
                data-testid="recent-simulation-card"
                onClick={() => openRecent(item)}
                className="group overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-left transition-colors hover:border-[var(--color-brand)]/45 hover:bg-[var(--color-surface-hover)]"
              >
                <SimulationPreview simulation={item.simulation} compact />
                <div className="mt-2 px-1">
                  <div className="flex items-center gap-2 text-[11px] font-medium text-[var(--color-text-tertiary)]">
                    <FlaskConical className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                    <span className="truncate">{item.project.researchQuestion || item.project.name}</span>
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-[var(--color-text-primary)]">
                    {item.simulation.name}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                    <span>v{item.simulation.modelVersion}</span>
                    <span className="inline-flex items-center gap-1 text-[var(--color-brand)] opacity-0 transition-opacity group-hover:opacity-100">
                      {text.open} <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-[12px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-center text-xs text-[var(--color-text-tertiary)] sm:col-span-2 xl:col-span-3">
              {text.recentEmpty}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[18px] border border-[var(--color-border)]/70 bg-[var(--color-surface-container-lowest)]/78 p-3 shadow-sm backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)]">
            <LibraryBig className="h-4 w-4 text-[var(--color-brand)]" strokeWidth={2} aria-hidden="true" />
            {text.featured}
          </div>
          <button
            type="button"
            onClick={() => onOpenCaseLibrary()}
            className="text-xs font-medium text-[var(--color-brand)] hover:underline"
          >
            {text.openAll}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {showcaseCases.map((study) => {
            const display = getCaseStudyDisplay(study, locale)
            return (
              <button
                key={study.id}
                type="button"
                onClick={() => onOpenCaseLibrary(study.id)}
                className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-left transition-colors hover:border-[var(--color-brand)]/45 hover:bg-[var(--color-surface-hover)]"
              >
                <SimulationPreview study={study} compact />
                <div className="mt-2 px-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-[var(--color-brand)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-brand)]">
                      {display.domain}
                    </span>
                    <Network className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" strokeWidth={2} aria-hidden="true" />
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-[var(--color-text-primary)]">
                    {display.name}
                  </div>
                  <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--color-text-tertiary)]">
                    {display.subtitle}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

    </div>
  )
}
