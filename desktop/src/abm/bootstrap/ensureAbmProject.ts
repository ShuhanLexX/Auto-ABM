import { abmClient } from '../api/abmClient'
import { useAbmStore } from '../stores/abmStore'

const DEFAULT_PROJECT_KEY = 'autoabm-default-project'

export interface EnsureAbmProjectOptions {
  workDir?: string | null
  sessionId?: string | null
}

function normalizeWorkDir(workDir: string | null | undefined): string {
  return (workDir ?? '').trim().replace(/[\\/]+$/, '')
}

function projectNameFromWorkDir(workDir: string): string {
  const parts = workDir.split(/[\\/]+/).filter(Boolean)
  return parts.at(-1) || '默认研究课题'
}

export function projectStorageKey(workDir?: string | null): string {
  const normalized = normalizeWorkDir(workDir)
  if (!normalized) return DEFAULT_PROJECT_KEY
  return `${DEFAULT_PROJECT_KEY}:${encodeURIComponent(normalized.toLowerCase())}`
}

/**
 * Ensure the conversation/workbench has a bound Project. Chat-only flows never
 * open the workbench bootstrap, so proposal adoption must not fail on a missing
 * activeProjectId (core-requirements.md §2).
 */
export async function ensureAbmProject(options: EnsureAbmProjectOptions = {}): Promise<string> {
  const store = useAbmStore.getState()
  const normalizedWorkDir = normalizeWorkDir(options.workDir)
  const storageKey = projectStorageKey(normalizedWorkDir)

  if (!normalizedWorkDir && store.activeProjectId) return store.activeProjectId

  const { projects } = await abmClient.listProjects()
  const stored = localStorage.getItem(storageKey)
  if (stored && projects.some((project) => project.id === stored)) {
    store.setActiveProject(stored)
    return stored
  }
  if (stored) localStorage.removeItem(storageKey)

  if (!normalizedWorkDir && projects.length > 0) {
    const id = projects[0]!.id
    localStorage.setItem(storageKey, id)
    store.setActiveProject(id)
    return id
  }

  const projectName = normalizedWorkDir ? projectNameFromWorkDir(normalizedWorkDir) : '默认研究课题'
  const researchQuestion = normalizedWorkDir ? `研究问题：${projectName}` : undefined
  const project = options.sessionId
    ? await abmClient.createProject(projectName, researchQuestion, {
        sessionId: options.sessionId,
        workDir: normalizedWorkDir || undefined,
      })
    : await abmClient.createProject(projectName, researchQuestion)
  localStorage.setItem(storageKey, project.id)
  store.setActiveProject(project.id)
  return project.id
}
