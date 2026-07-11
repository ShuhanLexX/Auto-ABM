import { expect, type Page } from '@playwright/test'
import { readAbmE2eState } from './abmE2eState.js'

/** Open the Simulation workbench via the sidebar and bind the pre-seeded simulation. */
export async function openAbmWorkbench(page: Page) {
  const { simId, projectId, serverUrl } = readAbmE2eState()

  const simRes = await page.request.get(`${serverUrl}/api/abm/simulations/${encodeURIComponent(simId)}`)
  expect(simRes.ok()).toBeTruthy()

  await page.goto('/')
  await page.evaluate(
    ({ id, pid }) => {
      localStorage.setItem('autoabm-abm-default-sim', id)
      localStorage.setItem(`autoabm-abm-default-sim:${pid}`, id)
      localStorage.setItem('autoabm-default-project', pid)
    },
    { id: simId, pid: projectId },
  )
  await page.getByTestId('sidebar-shell').getByRole('button', { name: '仿真工作台', exact: true }).click()
  await expect(page.getByRole('heading', { name: '仿真工作台' })).toBeVisible()
}

/** Wait until the bound simulation is loaded and the Run control is ready. */
export async function waitForWorkbenchReady(page: Page) {
  await expect(page.getByText('正在准备仿真…')).toBeHidden({ timeout: 60_000 })
  await expect(page.getByTestId('abm-run-button')).toBeEnabled({ timeout: 60_000 })
}

export function abmRunButton(page: Page) {
  return page.getByTestId('abm-run-button')
}

export function experimentRunButton(page: Page) {
  return page.getByTestId('experiment-canvas-run')
}

/** Switch workbench interaction mode (research | dialogue). */
export async function setWorkbenchMode(page: Page, mode: 'research' | 'dialogue') {
  const label = mode === 'research' ? '研究模式' : '对话模式'
  const closeWorkbench = page.getByRole('button', { name: '关闭仿真工作台' })
  if (await closeWorkbench.isVisible().catch(() => false)) {
    await closeWorkbench.click()
  }
  await page.getByTestId('abm-mode-selector').click()
  await page.getByRole('menuitemradio', { name: new RegExp(label) }).click()
  const workbenchOpen = await page.getByRole('heading', { name: '仿真工作台' }).isVisible().catch(() => false)
  if (!workbenchOpen) {
    await page.getByTestId('sidebar-shell').getByRole('button', { name: '仿真工作台', exact: true }).click()
  }
  await expect(page.getByRole('heading', { name: '仿真工作台' })).toBeVisible()
  await expect(page.getByTestId('abm-mode-badge')).toHaveText(mode === 'research' ? '研究模式' : '对话模式')
}

/** Open the refactored results / experiment canvas tab. */
export async function openResultsCanvas(page: Page) {
  await page.getByTestId('abm-workbench-view-results').click()
  await expect(page.getByTestId('experiment-canvas-run')).toBeVisible({ timeout: 30_000 })
}
