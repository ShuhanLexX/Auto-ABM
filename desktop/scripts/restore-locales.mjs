import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const localesDir = path.join(root, 'src/i18n/locales')
const repoRoot = path.join(root, '..')

const files = ['en.ts', 'zh.ts', 'zh-TW.ts', 'jp.ts', 'kr.ts']

for (const file of files) {
  const gitPath = `desktop/src/i18n/locales/${file}`
  const content = execSync(`git show main~1:${gitPath}`, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  fs.writeFileSync(path.join(localesDir, file), content, 'utf8')
  console.log('restored', file)
}
