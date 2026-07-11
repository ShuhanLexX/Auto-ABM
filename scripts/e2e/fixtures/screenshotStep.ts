import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page, TestInfo } from '@playwright/test'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const SCREENSHOT_ROOT = join(REPO_ROOT, 'output', 'playwright', 'screenshots')

function slug(text: string): string {
  return text.replace(/[^\w\u4e00-\u9fff-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

/** Save a named full-page screenshot under output/playwright/screenshots/{test}/{step}.png */
export async function screenshotStep(page: Page, testInfo: TestInfo, step: string) {
  const dir = join(SCREENSHOT_ROOT, slug(testInfo.title))
  mkdirSync(dir, { recursive: true })
  const index = String(testInfo.annotations.filter((a) => a.type === 'screenshot').length + 1).padStart(2, '0')
  const file = join(dir, `${index}-${slug(step)}.png`)
  await page.screenshot({ path: file, fullPage: true })
  testInfo.annotations.push({ type: 'screenshot', description: file })
}
