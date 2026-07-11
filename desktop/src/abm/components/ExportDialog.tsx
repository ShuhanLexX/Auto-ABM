import { useState } from 'react'
import { Package, Check, FolderOpen } from 'lucide-react'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { abmClient } from '../api/abmClient'
import { useAbmStore } from '../stores/abmStore'
import type { ExportResult } from '../types'
import { useAbmText } from '../i18n'
import { getDesktopHost } from '../../lib/desktopHost'

interface Props {
  simId: string | null
}

/**
 * Reproduction package export (P3 Task 6). Assembling the package is a research
 * action (it materialises files on disk), so it is gated behind an explicit
 * confirmation and disabled in dialogue (read-only) mode — conversation-ux.md §3
 * approval boundary. The package is self-contained (model + ODD + experiments +
 * runs + manifest) and re-runnable to identical metrics from its manifest.
 */
export function ExportDialog({ simId }: Props) {
  const t = useAbmText()
  const [open, setOpen] = useState(false)
  const [includeTraces, setIncludeTraces] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const readOnly = useAbmStore((s) => s.mode === 'dialogue')

  const handleConfirm = async () => {
    if (!simId) return
    setExporting(true)
    setError(null)
    try {
      const res = await abmClient.exportSimulation(simId, { includeTraces })
      setResult(res)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  const handleOpenPackageDir = async () => {
    if (!result?.packageDir) return
    setError(null)
    try {
      await getDesktopHost().shell.openPath(result.packageDir)
    } catch {
      setError(t('export.openDirectoryFailed'))
    }
  }

  return (
    <div data-testid="export-dialog" className="flex flex-col gap-2 p-4">
      <button
        type="button"
        onClick={() => {
          setResult(null)
          setError(null)
          setOpen(true)
        }}
        disabled={!simId || readOnly}
        title={readOnly ? t('export.readonlyTitle') : undefined}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-default disabled:opacity-50"
      >
        <Package className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        {t('export.trigger')}
      </button>

      {result ? (
        <div
          data-testid="export-result"
          className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3 py-2 text-xs"
        >
          <div className="flex items-center gap-1.5 font-medium text-[var(--color-text-primary)]">
            <Check className="h-3.5 w-3.5 text-[var(--color-success,#16a34a)]" strokeWidth={2.5} aria-hidden="true" />
            {t('export.done')}
          </div>
          <div className="mt-1 text-[var(--color-text-tertiary)]">
            {t('export.summary', {
              files: result.manifest.includes.length,
              runs: result.manifest.runs.length,
              kernel: result.manifest.kernel_version,
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="min-w-0 text-[var(--color-text-tertiary)]">
              {t('export.locationHidden')}
            </span>
            <button
              type="button"
              onClick={() => void handleOpenPackageDir()}
              className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
            >
              <FolderOpen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              {t('export.viewDirectory')}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[10px] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-xs text-[var(--color-error)]">
          {error}
        </div>
      ) : null}

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => void handleConfirm()}
        loading={exporting}
        title={t('export.title')}
        confirmLabel={exporting ? t('export.confirming') : t('export.confirm')}
        cancelLabel={t('export.cancel')}
        confirmVariant="primary"
        body={
          <div className="flex flex-col gap-3 text-sm text-[var(--color-text-secondary)]">
            <p>{t('export.body')}</p>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={includeTraces}
                onChange={(event) => setIncludeTraces(event.target.checked)}
              />
              {t('export.includeTraces')}
            </label>
          </div>
        }
      />
    </div>
  )
}
