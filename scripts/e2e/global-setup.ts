import { writeAbmE2eState } from './fixtures/abmE2eState.js'

const serverUrl = process.env.ABM_E2E_SERVER_URL
if (!serverUrl) {
  throw new Error('ABM_E2E_SERVER_URL is required for global setup')
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${serverUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    throw new Error(`POST ${path} failed: HTTP ${response.status} ${await response.text()}`)
  }
  return response.json() as Promise<T>
}

export default async function globalSetup() {
  const project = await postJson<{ id: string }>('/api/abm/projects', {
    name: 'Playwright ABM E2E project',
  })
  const simulation = await postJson<{ id: string }>('/api/abm/projects/' + encodeURIComponent(project.id) + '/simulations', {
    name: 'E2E rumor',
    template: 'rumor',
    seed: 42,
    steps: 3,
  })

  writeAbmE2eState({
    projectId: project.id,
    simId: simulation.id,
    serverUrl,
  })
}
