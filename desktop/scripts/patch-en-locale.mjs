import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/i18n/locales')
const enPath = path.join(localesDir, 'en.ts')

let en = execSync('git show main~1:desktop/src/i18n/locales/en.ts', {
  encoding: 'utf8',
  cwd: path.join(localesDir, '../..'),
})

const replacements = [
  ['Claude Code Haha', 'AutoABM'],
  ['Claude Code Companion', 'AutoABM'],
  ['github.com/NanmiCoder/cc-haha', 'github.com/autoabm/autoabm'],
  ['NanmiCoder/cc-haha', 'autoabm/autoabm'],
  ['claude-haha', 'autoabm'],
  ['cc-haha', 'autoabm'],
]

for (const [from, to] of replacements) {
  en = en.split(from).join(to)
}

if (!en.includes('settings.group.core')) {
  en = en.replace(
    "'settings.title': 'Settings',",
    `'settings.title': 'Settings',
  'settings.subtitle': 'Configure your AutoABM workspace',
  'settings.group.core': 'Core',
  'settings.group.connect': 'Connect',
  'settings.group.capabilities': 'Capabilities',
  'settings.group.system': 'System',`,
  )
}

en = en.replace(/'empty\.title': '[^']+',/, `'empty.title': 'What can I help you build?',`)
en = en.replace(
  /'empty\.subtitle': '[^']+',/,
  `'empty.subtitle': 'Start a new AI-native session. Orchestrate agents, tools, and code in one place.',`,
)

const quickBlock = `  'empty.quick.code': 'Generate Code',
  'empty.quick.app': 'Launch App',
  'empty.quick.components': 'UI Components',
  'empty.quick.theme': 'Theme Ideas',
  'empty.quick.landing': 'Landing Page',
  'empty.quick.docs': 'Upload Docs',
  'empty.quick.assets': 'Image Assets',
  'empty.quick.codePrompt': 'Help me generate production-ready code for ',
  'empty.quick.appPrompt': 'Help me scaffold and launch a new application for ',
  'empty.quick.componentsPrompt': 'Design reusable UI components for ',
  'empty.quick.themePrompt': 'Suggest a modern visual theme and palette for ',
  'empty.quick.landingPrompt': 'Create a landing page concept for ',
  'empty.quick.docsPrompt': 'Analyze these requirements and propose an implementation plan for ',
  'empty.quick.assetsPrompt': 'Help me prepare image and icon assets for ',`

if (!en.includes('empty.quick.code')) {
  en = en.replace(
    "  'empty.slashCommands': 'Slash commands',",
    `  'empty.slashCommands': 'Slash commands',\n${quickBlock}`,
  )
}

fs.writeFileSync(enPath, en, 'utf8')
console.log('patched en.ts', en.length)
