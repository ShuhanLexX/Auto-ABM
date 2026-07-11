import { expect, type Page } from '@playwright/test'

export interface E2eProposal {
  id: string
  mechanismSummary: string
  keyParams?: Record<string, unknown>
  expectedMacro?: string
  oddExcerpt?: string
}

export const SIR_PROPOSALS: E2eProposal[] = [
  {
    id: 'sir-spatial-grid',
    mechanismSummary: '空间网格 SIR（基线）',
    keyParams: { population: 1000, beta: 0.3, gamma: 0.05, steps: 50 },
    expectedMacro: '单峰疫情曲线，约 60–80 步达峰',
    oddExcerpt: '100×100 网格随机游走 + 半径感染',
  },
  {
    id: 'sir-network-heterogeneous',
    mechanismSummary: '分层接触网络 SIR（城市结构）',
    keyParams: { population: 800, beta_home: 0.4, steps: 50 },
    expectedMacro: '多波次或长尾衰减',
    oddExcerpt: '家 / 职场 / 公共交通三层接触',
  },
]

/** Wait until VITE_ABM_E2E exposes window.__ABM_E2E__ (async dynamic import). */
export async function waitForAbmE2e(page: Page) {
  await page.waitForFunction(() => window.__ABM_E2E__ != null, undefined, { timeout: 30_000 })
}

/** Open a dedicated chat tab and inject ABM proposal cards (requires VITE_ABM_E2E). */
export async function openChatWithProposals(page: Page, proposals: E2eProposal[] = SIR_PROPOSALS) {
  await waitForAbmE2e(page)
  const sessionId = `e2e-abm-${Date.now()}`
  await page.evaluate(
    ({ sid, batch }) => {
      const api = window.__ABM_E2E__
      if (!api) throw new Error('window.__ABM_E2E__ is not available — set VITE_ABM_E2E=true')
      api.openChatTab(sid)
      const ok = api.seedProposalBatch(batch)
      if (!ok) throw new Error('seedProposalBatch failed — active tab must be a chat session')
    },
    { sid: sessionId, batch: proposals },
  )
  await expect(page.getByTestId('proposal-batch')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('proposal-card').first()).toBeVisible()
}
