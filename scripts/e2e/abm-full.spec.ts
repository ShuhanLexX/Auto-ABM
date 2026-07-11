import { test, expect, type APIRequestContext } from '@playwright/test'
import { readAbmE2eState } from './fixtures/abmE2eState.js'
import {
  abmRunButton,
  experimentRunButton,
  openAbmWorkbench,
  openResultsCanvas,
  setWorkbenchMode,
  waitForWorkbenchReady,
} from './fixtures/abmWorkbench.js'

async function waitForRunCompleted(
  request: APIRequestContext,
  runId: string,
  serverUrl: string,
  timeoutMs = 45_000,
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const response = await request.get(`${serverUrl}/api/abm/runs/${encodeURIComponent(runId)}`)
    expect(response.ok()).toBeTruthy()
    const record = (await response.json()) as { status?: string }
    if (record.status === 'completed' || record.status === 'failed') return record
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for run ${runId} to finish`)
}

test.describe('ABM REST API', () => {
  test('templates, run, trace, explain, and ODD on the seeded simulation', async ({ request }) => {
    const { serverUrl, simId } = readAbmE2eState()

    const templates = await request.get(`${serverUrl}/api/abm/templates`)
    expect(templates.ok()).toBeTruthy()
    const templateBody = (await templates.json()) as { templates: string[] }
    expect(templateBody.templates).toContain('rumor')

    const simRes = await request.get(`${serverUrl}/api/abm/simulations/${encodeURIComponent(simId)}`)
    expect(simRes.ok()).toBeTruthy()

    const oddRes = await request.get(`${serverUrl}/api/abm/simulations/${encodeURIComponent(simId)}/odd`)
    expect(oddRes.ok()).toBeTruthy()

    const runRes = await request.post(`${serverUrl}/api/abm/simulations/${encodeURIComponent(simId)}/runs`, {
      data: { seed: 11, steps: 3 },
    })
    expect(runRes.status()).toBe(202)
    const { runId } = (await runRes.json()) as { runId: string }
    expect(runId).toBeTruthy()

    const record = await waitForRunCompleted(request, runId, serverUrl)
    expect(record.status).toBe('completed')

    const traceRes = await request.get(
      `${serverUrl}/api/abm/runs/${encodeURIComponent(runId)}/trace?from=0&to=10`,
    )
    expect(traceRes.ok()).toBeTruthy()

    const explainRes = await request.get(
      `${serverUrl}/api/abm/runs/${encodeURIComponent(runId)}/explain?from=0&to=10`,
    )
    expect(explainRes.ok()).toBeTruthy()
    const explain = (await explainRes.json()) as { runId: string; oddRefs: unknown[] }
    expect(explain.runId).toBe(runId)
    expect(explain.oddRefs.length).toBeGreaterThan(0)
  })
})

test.describe('ABM workbench UI', () => {
  test.beforeEach(async ({ page }) => {
    await openAbmWorkbench(page)
    await waitForWorkbenchReady(page)
  })

  test('shows run panel, results canvas, and export', async ({ page }) => {
    await expect(page.getByText('参数与运行')).toBeVisible()
    await openResultsCanvas(page)
    await expect(page.getByText('实验画布')).toBeVisible()
    await expect(page.getByTestId('export-dialog')).toBeVisible()
    await expect(page.getByRole('button', { name: '导出可复现实验包' })).toBeVisible()
  })

  test('runs a simulation to completion and renders live metrics', async ({ page }) => {
    await abmRunButton(page).click()
    await expect(page.getByText('已完成')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('main svg, main canvas').first()).toBeVisible()
  })

  test('runs a parameter sweep from the results canvas', async ({ page }) => {
    await abmRunButton(page).click()
    await expect(page.getByText('已完成')).toBeVisible({ timeout: 60_000 })

    await openResultsCanvas(page)
    await page.getByLabel('扫描参数').selectOption({ index: 1 })
    await page.getByPlaceholder('0.2, 0.4, 0.6').fill('0.1, 0.2')
    await page.locator('input[type="number"]').last().fill('3')
    await experimentRunButton(page).click()
    await expect(page.getByText('已完成')).toBeVisible({ timeout: 90_000 })
  })

  test('exports a reproduction package after a completed run', async ({ page }) => {
    await abmRunButton(page).click()
    await expect(page.getByText('已完成')).toBeVisible({ timeout: 60_000 })

    await openResultsCanvas(page)
    await page.getByRole('button', { name: '导出可复现实验包' }).click()
    await expect(page.getByText('导出可复现实验包', { exact: true }).nth(1)).toBeVisible()
    await page.getByRole('button', { name: /^导出$/ }).click()
    await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('实验包已导出')).toBeVisible()
  })

  test('loads ODD protocol tab', async ({ page }) => {
    await page.getByTestId('abm-workbench-view-odd').click()
    await expect(page.getByTestId('odd-panel-empty').or(page.getByTestId('odd-panel'))).toBeVisible({
      timeout: 30_000,
    })
  })
})

test.describe('ABM sidebar navigation', () => {
  test('opens the simulation workbench from the sidebar', async ({ page }) => {
    await openAbmWorkbench(page)
    await waitForWorkbenchReady(page)
    await expect(page.getByText('参数与运行')).toBeVisible()
  })
})

test.describe('ABM workbench modes', () => {
  test.beforeEach(async ({ page }) => {
    await openAbmWorkbench(page)
    await waitForWorkbenchReady(page)
  })

  test('dialogue mode disables run and experiment controls', async ({ page }) => {
    await setWorkbenchMode(page, 'dialogue')
    await expect(abmRunButton(page)).toBeDisabled()
    await openResultsCanvas(page)
    await expect(experimentRunButton(page)).toBeDisabled()
  })
})
