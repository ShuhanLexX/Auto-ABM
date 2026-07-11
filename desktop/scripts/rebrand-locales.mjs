import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const localesDir = path.join(root, 'src/i18n/locales')

const replacements = [
  ['Claude Code Haha', 'AutoABM'],
  ['Claude Code Companion', 'AutoABM'],
  ['github.com/NanmiCoder/cc-haha', 'github.com/autoabm/autoabm'],
  ['NanmiCoder/cc-haha', 'autoabm/autoabm'],
  ['claude-haha', 'autoabm'],
  ['cc-haha', 'autoabm'],
]

for (const file of ['en.ts', 'zh.ts', 'zh-TW.ts', 'jp.ts', 'kr.ts']) {
  const filePath = path.join(localesDir, file)
  let content = fs.readFileSync(filePath, 'utf8')
  for (const [from, to] of replacements) {
    content = content.split(from).join(to)
  }
  fs.writeFileSync(filePath, content, 'utf8')
}

const enPath = path.join(localesDir, 'en.ts')
let en = fs.readFileSync(enPath, 'utf8')
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
en = en.replace(/'empty\.subtitle': '[^']+',/, `'empty.subtitle': 'Start a new AI-native session. Orchestrate agents, tools, and code in one place.',`)
fs.writeFileSync(enPath, en, 'utf8')

const zhPath = path.join(localesDir, 'zh.ts')
let zh = fs.readFileSync(zhPath, 'utf8')
if (!zh.includes('settings.group.core')) {
  zh = zh.replace(
    /('settings\.title': '设置',)/,
    `$1
  'settings.subtitle': '配置 AutoABM 工作区',
  'settings.group.core': '核心',
  'settings.group.connect': '连接',
  'settings.group.capabilities': '能力',
  'settings.group.system': '系统',`,
  )
}
zh = zh.replace(/'empty\.title': '[^']+',/, `'empty.title': '今天想构建什么？',`)
zh = zh.replace(/'empty\.subtitle': '[^']*',?/, `'empty.subtitle': '开启 AI 原生会话，在一个工作台中编排 Agent、工具与代码。',`)
fs.writeFileSync(zhPath, zh, 'utf8')

const localePatches = {
  'zh-TW.ts': {
    settingsInsert: `'settings.subtitle': '設定 AutoABM 工作區',
  'settings.group.core': '核心',
  'settings.group.connect': '連線',
  'settings.group.capabilities': '能力',
  'settings.group.system': '系統',`,
    emptyTitle: '今天想構建什麼？',
    emptySubtitle: '開啟 AI 原生會話，在一個工作台中編排 Agent、工具與程式碼。',
  },
  'jp.ts': {
    settingsInsert: `'settings.subtitle': 'AutoABM ワークスペースを設定',
  'settings.group.core': 'コア',
  'settings.group.connect': '接続',
  'settings.group.capabilities': '機能',
  'settings.group.system': 'システム',`,
    emptyTitle: '今日は何を構築しますか？',
    emptySubtitle: 'AI ネイティブなセッションを開始し、エージェント・ツール・コードを一つのワークスペースで編成します。',
  },
  'kr.ts': {
    settingsInsert: `'settings.subtitle': 'AutoABM 워크스페이스 구성',
  'settings.group.core': '핵심',
  'settings.group.connect': '연결',
  'settings.group.capabilities': '기능',
  'settings.group.system': '시스템',`,
    emptyTitle: '오늘 무엇을 만들까요?',
    emptySubtitle: 'AI 네이티브 세션을 시작하고 에이전트, 도구, 코드를 한 워크스페이스에서 조율하세요.',
  },
}

for (const [file, patch] of Object.entries(localePatches)) {
  const filePath = path.join(localesDir, file)
  let content = fs.readFileSync(filePath, 'utf8')
  if (!content.includes('settings.group.core')) {
    content = content.replace(/('settings\.title': '[^']+',)/, `$1\n  ${patch.settingsInsert}`)
  }
  content = content.replace(/'empty\.title':[^\n]+/, `'empty.title': '${patch.emptyTitle}',`)
  content = content.replace(/'empty\.subtitle':[^\n]+/, `'empty.subtitle': '${patch.emptySubtitle}',`)
  fs.writeFileSync(filePath, content, 'utf8')
}

console.log('locales done')
