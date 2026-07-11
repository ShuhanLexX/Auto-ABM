import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '../..')
export const ABM_SCREENSHOT_DIR = join(repoRoot, 'output', 'playwright', 'screenshots')

/** Capture a named step screenshot for manual review (output/playwright/screenshots/). */
export async function captureStep(page: Page, step: string) {
  mkdirSync(ABM_SCREENSHOT_DIR, { recursive: true })
  const safe = step.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  await page.screenshot({
    path: join(ABM_SCREENSHOT_DIR, `${safe}.png`),
    fullPage: true,
  })
}
