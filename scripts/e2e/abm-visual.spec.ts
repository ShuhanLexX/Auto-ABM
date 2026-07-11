import { test, expect } from '@playwright/test'
import { readAbmE2eState } from './fixtures/abmE2eState.js'
import {
  abmRunButton,
  experimentRunButton,
  openAbmWorkbench,
  openResultsCanvas,
  setWorkbenchMode,
  waitForWorkbenchReady,
} from './fixtures/abmWorkbench.js'
import { openChatWithProposals, SIR_PROPOSALS } from './fixtures/abmChat.js'
import { screenshotStep } from './fixtures/screenshotStep.js'

test.describe('ABM visual verification journey', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('home → proposals → adopt & run → workbench → experiment → export → modes', async ({
    page,
  }, testInfo) => {
    const { serverUrl } = readAbmE2eState()

    await page.goto('/')
    await expect(page.getByTestId('empty-session-composer-shell')).toBeVisible({ timeout: 30_000 })
    await screenshotStep(page, testInfo, '01-home-abm-composer')

    await openChatWithProposals(page, SIR_PROPOSALS)
    await screenshotStep(page, testInfo, '02-proposal-batch-cards')

    await page.getByTestId('proposal-adopt-and-run').first().click()
    await expect(page.getByRole('heading', { name: '仿真工作台' })).toBeVisible({
      timeout: 60_000,
    })
    await waitForWorkbenchReady(page)
    await screenshotStep(page, testInfo, '03-workbench-after-adopt-and-run')

    const activeSimId = await page.evaluate(() => window.__ABM_E2E__?.getActiveSimId() ?? null)
    expect(activeSimId).toBeTruthy()
    expect(activeSimId).not.toBe(SIR_PROPOSALS[0]!.id)

    const simRes = await page.request.get(
      `${serverUrl}/api/abm/simulations/${encodeURIComponent(activeSimId!)}`,
    )
    expect(simRes.ok()).toBeTruthy()

    await abmRunButton(page).click()
    await expect(page.getByText('已完成')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('main svg, main canvas').first()).toBeVisible()
    await screenshotStep(page, testInfo, '04-run-completed-metrics-canvas')

    await openResultsCanvas(page)
    await page.getByLabel('扫描参数').selectOption({ index: 1 })
    await page.getByPlaceholder('0.2, 0.4, 0.6').fill('0.1, 0.2, 0.3')
    await page.locator('input[type="number"]').last().fill('3')
    await experimentRunButton(page).click()
    await expect(page.getByText(/运行中 \d+ \/ \d+|已完成/).first()).toBeVisible({ timeout: 30_000 })
    await screenshotStep(page, testInfo, '05-experiment-running')

    await expect(page.getByTestId('results-chart').first()).toBeVisible({ timeout: 90_000 })
    await screenshotStep(page, testInfo, '06-experiment-results-chart')

    await page.getByRole('button', { name: '导出可复现实验包' }).click()
    await expect(page.getByRole('button', { name: /^导出$/ })).toBeVisible()
    await screenshotStep(page, testInfo, '07-export-dialog')
    await page.getByRole('button', { name: /^导出$/ }).click()
    await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('实验包已导出')).toBeVisible()
    await screenshotStep(page, testInfo, '08-export-success')

    await setWorkbenchMode(page, 'dialogue')
    await expect(abmRunButton(page)).toBeDisabled()
    await openResultsCanvas(page)
    await expect(experimentRunButton(page)).toBeDisabled()
    await screenshotStep(page, testInfo, '09-dialogue-mode-readonly')

    await setWorkbenchMode(page, 'research')
    await expect(abmRunButton(page)).toBeEnabled()
    await screenshotStep(page, testInfo, '10-research-mode-enabled')
  })

  test('sidebar opens workbench with interface panels', async ({ page }, testInfo) => {
    await openAbmWorkbench(page)
    await waitForWorkbenchReady(page)
    await screenshotStep(page, testInfo, 'workbench-panels')
    await expect(page.getByText('参数与运行')).toBeVisible()
    await openResultsCanvas(page)
    await expect(page.getByText('实验画布')).toBeVisible()
    await expect(page.getByTestId('export-dialog')).toBeVisible()
  })

  test('proposal adopt only binds simulation without auto-run', async ({ page }, testInfo) => {
    await page.goto('/')
    await expect(page.getByTestId('empty-session-composer-shell')).toBeVisible({ timeout: 30_000 })
    await openChatWithProposals(page, [SIR_PROPOSALS[1]!])
    await page.getByRole('button', { name: '采纳', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.__ABM_E2E__?.getActiveSimId() ?? null)).not.toBeNull()
    await screenshotStep(page, testInfo, 'proposal-adopted-chat')
    await page.getByTestId('sidebar-shell').getByRole('button', { name: '仿真工作台', exact: true }).click()
    await waitForWorkbenchReady(page)
    await screenshotStep(page, testInfo, 'workbench-after-adopt-only')
  })
})
