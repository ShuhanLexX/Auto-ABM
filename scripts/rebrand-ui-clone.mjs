import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const uiCloneRoot = path.join(repoRoot, 'docs/ui-clone')

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.html')) {
      let content = fs.readFileSync(full, 'utf8')
      const next = content
        .split('Claude Code Companion').join('AutoABM')
        .split('Claude Code Haha').join('AutoABM')
      if (next !== content) {
        fs.writeFileSync(full, next, 'utf8')
        console.log('fixed', path.relative(repoRoot, full))
      }
    }
  }
}

walk(uiCloneRoot)
