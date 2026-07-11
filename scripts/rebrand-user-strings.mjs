import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const replacements = [
  ['Claude Code Haha', 'AutoABM'],
  ['Claude Code Companion', 'AutoABM'],
  ['cc-haha OpenAI', 'AutoABM OpenAI'],
  ['NanmiCoder/cc-haha', 'SocialAI-X/Auto-ABM'],
  ['github.com/NanmiCoder/cc-haha', 'github.com/SocialAI-X/Auto-ABM'],
]

const files = [
  'src/services/openaiAuth/index.ts',
  'src/server/api/haha-oauth.ts',
  'src/server/api/haha-openai-oauth.ts',
  'src/server/services/hahaOpenAIOAuthService.ts',
  'src/server/services/desktopCliLauncherService.ts',
  'src/components/OpenAILoginFlow.tsx',
  'src/server/index.ts',
  'src/server/services/desktopUiPreferencesService.ts',
  'src/server/services/managedSettingsService.ts',
  'src/server/config/providerPresets.json',
  'desktop/src-tauri/capabilities/default.json',
]

for (const rel of files) {
  const filePath = path.join(repoRoot, rel)
  if (!fs.existsSync(filePath)) {
    console.warn('skip missing', rel)
    continue
  }
  let content = fs.readFileSync(filePath, 'utf8')
  let changed = false
  for (const [from, to] of replacements) {
    if (content.includes(from)) {
      content = content.split(from).join(to)
      changed = true
    }
  }
  content = content.replace(/displayName: 'cc-haha'/g, "displayName: 'AutoABM'")
  content = content.replace(/displayName: "cc-haha"/g, 'displayName: "AutoABM"')
  content = content.replace(/label: 'cc-haha /g, "label: 'AutoABM ")
  content = content.replace(/为 cc-haha /g, '为 AutoABM ')
  content = content.replace(/Claude Code API server/g, 'AutoABM API server')
  content = content.replace(/Claude Code Desktop/g, 'AutoABM Desktop')
  if (changed || content !== fs.readFileSync(filePath, 'utf8')) {
    fs.writeFileSync(filePath, content, 'utf8')
    console.log('updated', rel)
  }
}
