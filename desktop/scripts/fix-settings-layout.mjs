import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const settingsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/pages/Settings.tsx')
let content = fs.readFileSync(settingsPath, 'utf8')

const start = content.indexOf('        <aside className="flex w-[240px]')
const end = content.indexOf('function TabButton({ icon, label, active, onClick }')
if (start < 0 || end < 0) throw new Error('markers not found')

const replacement = `        <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--color-border)]/60 bg-[var(--color-surface-sidebar)]/80 py-4 backdrop-blur-xl">
          <div className="px-4 pb-4">
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

`

content = content.slice(0, start) + replacement + content.slice(end)
fs.writeFileSync(settingsPath, content, 'utf8')
console.log('fixed settings layout')
