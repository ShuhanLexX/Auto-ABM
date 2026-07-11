import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.join(root, '..')
const settingsPath = path.join(root, 'src/pages/Settings.tsx')

let content = execSync('git show main~1:desktop/src/pages/Settings.tsx', {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 30 * 1024 * 1024,
})

if (!content.includes("import { ClaudeOfficialLogin }")) {
  throw new Error('unexpected Settings.tsx baseline')
}

content = content.replace(
  "import { ClaudeOfficialLogin } from '../components/settings/ClaudeOfficialLogin'",
  "import { ClaudeOfficialLogin } from '../components/settings/ClaudeOfficialLogin'\nimport { BrandMark } from '../components/brand/BrandMark'",
)

const navGroups = `const SETTINGS_NAV_GROUPS: Array<{
  id: string
  labelKey: string
  tabs: Array<{ id: SettingsTab; icon: string; labelKey: string }>
}> = [
  {
    id: 'core',
    labelKey: 'settings.group.core',
    tabs: [
      { id: 'providers', icon: 'dns', labelKey: 'settings.tab.providers' },
      { id: 'general', icon: 'tune', labelKey: 'settings.tab.general' },
      { id: 'activity', icon: 'monitoring', labelKey: 'settings.tab.activity' },
    ],
  },
  {
    id: 'connect',
    labelKey: 'settings.group.connect',
    tabs: [
      { id: 'h5Access', icon: 'qr_code_2', labelKey: 'settings.tab.h5Access' },
      { id: 'adapters', icon: 'chat', labelKey: 'settings.tab.adapters' },
      { id: 'terminal', icon: 'terminal', labelKey: 'settings.tab.terminal' },
      { id: 'mcp', icon: 'hub', labelKey: 'settings.tab.mcp' },
    ],
  },
  {
    id: 'capabilities',
    labelKey: 'settings.group.capabilities',
    tabs: [
      { id: 'agents', icon: 'smart_toy', labelKey: 'settings.tab.agents' },
      { id: 'skills', icon: 'auto_awesome', labelKey: 'settings.tab.skills' },
      { id: 'memory', icon: 'history_edu', labelKey: 'settings.tab.memory' },
      { id: 'plugins', icon: 'extension', labelKey: 'settings.tab.plugins' },
      { id: 'computerUse', icon: 'mouse', labelKey: 'settings.tab.computerUse' },
    ],
  },
  {
    id: 'system',
    labelKey: 'settings.group.system',
    tabs: [
      { id: 'trace', icon: 'account_tree', labelKey: 'settings.tab.trace' },
      { id: 'diagnostics', icon: 'monitor_heart', labelKey: 'settings.tab.diagnostics' },
      { id: 'about', icon: 'info', labelKey: 'settings.tab.about' },
    ],
  },
]

`

content = content.replace('export function Settings() {', navGroups + 'export function Settings() {')

const oldReturn = `  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-surface)]">
      <div className="flex-1 flex overflow-hidden">
        {/* Tab navigation */}
        <div className="w-[180px] border-r border-[var(--color-border)] py-3 flex-shrink-0 flex flex-col">`

const newReturn = `  const activeLabel = SETTINGS_NAV_GROUPS
    .flatMap((group) => group.tabs)
    .find((tab) => tab.id === activeTab)

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--color-surface)]">
      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--color-border)]/60 bg-[var(--color-surface-sidebar)]/80 py-4 backdrop-blur-xl">`

if (!content.includes(oldReturn)) throw new Error('Settings return block not found')
content = content.replace(oldReturn, newReturn)

// Replace flat tab list with grouped nav - use regex for the big middle block
content = content.replace(
  /        <div className="w-\[180px\][\s\S]*?        <\/div>\n\n        \{\/\* Tab content[\s\S]*?        <\/div>\n      <\/div>\n    <\/div>\n  \)\n}\n\nfunction TabButton/,
  `        <div className="px-4 pb-4">
            <h2 className="text-sm font-semibold tracking-tight text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-headline)' }}>
              {t('settings.title')}
            </h2>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{t('settings.subtitle')}</p>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-2">
            {SETTINGS_NAV_GROUPS.map((group) => (
              <div key={group.id}>
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
                  {t(group.labelKey as never)}
                </p>
                <div className="space-y-0.5">
                  {group.tabs.map((tab) => (
                    <TabButton
                      key={tab.id}
                      icon={tab.icon}
                      label={t(tab.labelKey as never)}
                      active={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {activeTab !== 'trace' && (
            <header className="shrink-0 border-b border-[var(--color-border)]/50 px-8 py-5 backdrop-blur-sm">
              <h1 className="text-lg font-semibold text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-headline)' }}>
                {activeLabel ? t(activeLabel.labelKey as never) : ''}
              </h1>
            </header>
          )}
          <div className={activeTab === 'trace'
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
            : 'flex-1 overflow-y-auto px-8 py-6'}>
            <div className={activeTab === 'trace' ? 'flex min-h-0 flex-1 flex-col' : 'glass-card min-h-full p-6'}>
              {activeTab === 'providers' && <ProviderSettings />}
              {activeTab === 'activity' && <ActivitySettings />}
              {activeTab === 'general' && <GeneralSettings />}
              {activeTab === 'h5Access' && <H5AccessSettings />}
              {activeTab === 'adapters' && <AdapterSettings />}
              {activeTab === 'terminal' && <TerminalSettings showPreferences />}
              {activeTab === 'mcp' && <McpSettings />}
              {activeTab === 'agents' && <AgentsSettings />}
              {activeTab === 'skills' && <SkillSettings />}
              {activeTab === 'memory' && <MemorySettings />}
              {activeTab === 'plugins' && <PluginSettings />}
              {activeTab === 'computerUse' && <ComputerUseSettings />}
              {activeTab === 'trace' && <TraceList />}
              {activeTab === 'diagnostics' && <DiagnosticsSettings />}
              {activeTab === 'about' && <AboutSettings />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TabButton`,
)

content = content.replace(
  `function TabButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={\`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors \${
        active
          ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)] font-medium'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
      }\`}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
      {label}
    </button>
  )
}`,
  `function TabButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={\`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-all \${
        active
          ? 'border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 font-medium text-[var(--color-text-primary)] shadow-[0_0_20px_rgba(20,184,166,0.08)]'
          : 'border border-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-border)]/40 hover:bg-[var(--color-surface-hover)]/60'
      }\`}
    >
      <span className={\`material-symbols-outlined text-[18px] \${active ? 'text-[var(--color-primary)]' : ''}\`}>{icon}</span>
      {label}
    </button>
  )
}`,
)

content = content.replace(
  "const GITHUB_REPO = 'https://github.com/NanmiCoder/cc-haha'",
  "const GITHUB_REPO = 'https://github.com/SocialAI-X/Auto-ABM'",
)
content = content.replace(
  /const AUTHOR_GITHUB[\s\S]*?\] as const\n\n/,
  '\n',
)
content = content.replace(
  `<img src={publicAssetPath('app-icon.png')} alt="Claude Code Haha" className="w-20 h-20 mb-4" />
      <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Claude Code Haha</h1>`,
  `<BrandMark size="lg" className="mb-4" />
      <h1 className="text-xl font-bold text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-headline)' }}>AutoABM</h1>`,
)
content = content.replace(
  'NanmiCoder/cc-haha',
  'SocialAI-X/Auto-ABM',
)
content = content.replace(
  /      \{\/\* Divider \*\/\}[\s\S]*?      <div className="mt-6 w-full">\n        <button\n          onClick=\{\(\) => openUrl\(GITHUB_ISSUES\)\}/,
  `      <div className="mt-6 w-full">
        <button
          onClick={() => openUrl(GITHUB_ISSUES)}`,
)

fs.writeFileSync(settingsPath, content, 'utf8')
console.log('patched Settings.tsx', content.length, 'fffd', (content.match(/\ufffd/g) || []).length)
