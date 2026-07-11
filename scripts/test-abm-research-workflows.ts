#!/usr/bin/env bun
/**
 * End-to-end ABM research workflow smoke (real kernel via local server).
 * Usage: SERVER_URL=http://127.0.0.1:3456 bun run scripts/test-abm-research-workflows.ts
 */

const SERVER = process.env.SERVER_URL ?? 'http://127.0.0.1:3456'

type Json = Record<string, unknown>

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${SERVER}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  return data as T
}

async function waitForRun(runId: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const record = await api<{ status?: string }>('GET', `/api/abm/runs/${encodeURIComponent(runId)}`)
    if (record.status === 'completed' || record.status === 'failed') return record
    await Bun.sleep(300)
  }
  throw new Error(`Timed out waiting for run ${runId}`)
}

async function waitForExperiment(experimentId: string, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const summary = await api<{ experiment: { status?: string; total?: number } }>(
      'GET',
      `/api/abm/experiments/${encodeURIComponent(experimentId)}`,
    )
    const status = summary.experiment.status
    if (status === 'completed' || status === 'failed') return summary
    await Bun.sleep(400)
  }
  throw new Error(`Timed out waiting for experiment ${experimentId}`)
}

async function runWorkflow(label: string, template: string, sweep: { parameter: string; values: number[] }) {
  console.log(`\n=== ${label} (${template}) ===`)
  const started = Date.now()

  const project = await api<{ id: string }>('POST', '/api/abm/projects', {
    name: `Workflow ${label} ${new Date().toISOString()}`,
  })

  const simulation = await api<{ id: string }>('POST', `/api/abm/projects/${project.id}/simulations`, {
    name: `${label} 仿真`,
    template,
    seed: 42,
    steps: 20,
  })
  const simId = simulation.id
  console.log(`  simulation: ${simId}`)

  const odd = await api<{ odd: { sections?: unknown[] } }>('GET', `/api/abm/simulations/${simId}/odd`)
  const sectionCount = Array.isArray(odd.odd?.sections) ? odd.odd.sections.length : Object.keys(odd.odd ?? {}).length
  console.log(`  odd sections: ${sectionCount}`)

  const runStart = await api<{ runId: string }>('POST', `/api/abm/simulations/${simId}/runs`, {
    seed: 7,
    steps: 15,
  })
  const runRecord = await waitForRun(runStart.runId)
  if (runRecord.status !== 'completed') throw new Error(`${label} run failed: ${JSON.stringify(runRecord)}`)
  console.log(`  run completed: ${runStart.runId}`)

  const trace = await api<{ ticks?: unknown[] }>(
    'GET',
    `/api/abm/runs/${encodeURIComponent(runStart.runId)}/trace?from=0&to=20`,
  )
  const tickCount = Array.isArray(trace.ticks) ? trace.ticks.length : 0
  console.log(`  trace ticks: ${tickCount}`)

  const explain = await api<{ runId: string; oddRefs: unknown[] }>(
    'GET',
    `/api/abm/runs/${encodeURIComponent(runStart.runId)}/explain?from=0&to=15`,
  )
  console.log(`  explain oddRefs: ${explain.oddRefs.length}`)

  const experimentStart = await api<{ experimentId: string }>(
    'POST',
    `/api/abm/simulations/${simId}/experiments`,
    {
      name: `${label} 单参扫描`,
      parameter: sweep.parameter,
      values: sweep.values,
      replications: 1,
      steps: 10,
    },
  )
  const experimentSummary = await waitForExperiment(experimentStart.experimentId)
  if (experimentSummary.experiment.status !== 'completed') {
    throw new Error(`${label} experiment failed: ${JSON.stringify(experimentSummary.experiment)}`)
  }
  console.log(`  experiment completed: ${experimentStart.experimentId}`)

  const exported = await api<{ packageDir: string; manifest: { runs: unknown[]; includes: unknown[] } }>(
    'POST',
    `/api/abm/simulations/${simId}/export`,
    { includeTraces: false },
  )
  console.log(`  export: ${exported.manifest.includes.length} files, ${exported.manifest.runs.length} runs`)
  console.log(`  OK in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  return { simId, runId: runStart.runId, experimentId: experimentStart.experimentId }
}

const templates = await api<{ templates: string[] }>('GET', '/api/abm/templates')
if (!templates.templates.includes('wildfire') || !templates.templates.includes('rumor')) {
  throw new Error(`Missing templates. Got: ${templates.templates.join(', ')}`)
}

const rumor = await runWorkflow('舆情谣言传播', 'rumor', {
  parameter: 'beta',
  values: [0.05, 0.1, 0.15],
})

const wildfire = await runWorkflow('森林火灾蔓延', 'wildfire', {
  parameter: 'spread_probability',
  values: [0.2, 0.34, 0.5],
})

console.log('\n=== ALL WORKFLOWS PASSED ===')
console.log(JSON.stringify({ rumor, wildfire }, null, 2))
