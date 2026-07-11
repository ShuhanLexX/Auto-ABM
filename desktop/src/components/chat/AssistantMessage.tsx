import { memo, useCallback, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { MarkdownRenderer } from '../markdown/MarkdownRenderer'
import { MessageActionBar, type MessageBranchAction } from './MessageActionBar'
import { InlineImageGallery } from './InlineImageGallery'
import { InlineVideoGallery } from './InlineVideoGallery'
import { AssistantOutputTargetCard } from './AssistantOutputTargetCard'
import { handlePreviewLink } from '../../lib/handlePreviewLink'
import { getServerBaseUrl } from '../../lib/desktopRuntime'
import { getDesktopHost } from '../../lib/desktopHost'
import { extractAssistantOutputTargets } from '../../lib/assistantOutputTargets'
import { useBrowserPanelStore } from '../../stores/browserPanelStore'
import { useWorkspacePanelStore } from '../../stores/workspacePanelStore'
import { useChatStore } from '../../stores/chatStore'
import { useAbmStore } from '../../abm/stores/abmStore'
import { useTranslation } from '../../i18n'
import { classifyOverflow, type Overflow } from './longContentGuard'

type Props = {
  content: string
  isStreaming?: boolean
  branchAction?: MessageBranchAction
  sessionId?: string
  timestamp?: number
  /** This turn's real changed files (absolute), used to anchor output chips onto
   *  files that were actually written instead of guessing from the prose. */
  turnChangedFiles?: string[]
}

const MAX_CARDS = 3

export const AssistantMessage = memo(function AssistantMessage({ content, isStreaming, branchAction, sessionId, timestamp, turnChangedFiles }: Props) {
  const t = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const workDir = useWorkspacePanelStore((s) => (sessionId ? s.statusBySession[sessionId]?.workDir : undefined))
  const abmMode = useAbmStore((s) => s.mode)
  const chatState = useChatStore((s) => (sessionId ? s.sessions[sessionId]?.chatState ?? 'idle' : 'idle'))
  const hideFinalActions = abmMode === 'autonomous' && chatState !== 'idle'
  // Never collapse while streaming — the text is still growing and the user is
  // watching it arrive. Only guard finalized messages.
  const overflow = useMemo(() => (isStreaming ? null : classifyOverflow(content)), [content, isStreaming])
  const collapsed = overflow !== null && !expanded

  const handleLinkClick = useCallback(
    (href: string, event: ReactMouseEvent<HTMLDivElement>): boolean => {
      if (!sessionId) return false
      const handled = handlePreviewLink(href, {
        sessionId,
        serverBaseUrl: getServerBaseUrl(),
        openBrowser: (id, url) => useBrowserPanelStore.getState().open(id, url),
        openFilePreview: (id, path) => {
          void useWorkspacePanelStore.getState().openPreview(id, path, 'file')
        },
        openExternal: (url) => {
          void getDesktopHost().shell.open(url)
            .catch(() => window.open(url, '_blank'))
        },
      })
      if (handled) event.preventDefault()
      return handled
    },
    [sessionId],
  )

  const outputTargets = useMemo(
    () =>
      isStreaming || !sessionId || collapsed
        ? []
        : // Image/video targets render inline (InlineImageGallery/InlineVideoGallery); never also as a card.
          extractAssistantOutputTargets(content, { workDir, changedFiles: turnChangedFiles }).filter(
            (target) => target.kind !== 'image' && target.kind !== 'video',
          ),
    [content, isStreaming, sessionId, workDir, turnChangedFiles, collapsed],
  )

  if (!content.trim()) return null

  const documentLayout = shouldUseDocumentLayout(content)

  return (
    <div className="mb-5 flex justify-start">
      <div
        data-message-shell="assistant"
        data-layout={documentLayout ? 'document' : 'bubble'}
        className={`group flex min-w-0 flex-col items-start ${
          documentLayout
            ? 'w-full max-w-full'
            : 'max-w-[88%] sm:max-w-[80%] lg:max-w-[72%]'
        }`}
      >
        <div className={`rounded-[20px] rounded-tl-[8px] border border-[var(--color-border)]/60 bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text-primary)] shadow-sm ${
          documentLayout ? 'w-full' : 'max-w-full'
        }`}>
          {collapsed && overflow ? (
            <CollapsedContent content={content} overflow={overflow} onExpand={() => setExpanded(true)} />
          ) : (
            <>
              <MarkdownRenderer
                content={content}
                variant={documentLayout ? 'document' : 'default'}
                streaming={isStreaming}
                onLinkClick={sessionId ? handleLinkClick : undefined}
              />
              {!isStreaming && <InlineImageGallery text={content} sessionId={sessionId} workDir={workDir} />}
              {!isStreaming && <InlineVideoGallery text={content} sessionId={sessionId} workDir={workDir} />}
              {isStreaming && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-shimmer bg-[var(--color-brand)] align-text-bottom" />
              )}
              {overflow && expanded && (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="mt-3 rounded-[8px] border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)]"
                >
                  收起长内容
                </button>
              )}
            </>
          )}
        </div>

        {!isStreaming && sessionId && outputTargets.length > 0 && (
          <div className="mt-1 flex w-full flex-col gap-2">
            {outputTargets.slice(0, MAX_CARDS).map((target) => (
              <AssistantOutputTargetCard key={target.id} target={target} sessionId={sessionId} workDir={workDir} />
            ))}
            {outputTargets.length > MAX_CARDS && (
              <div className="px-1 text-xs text-[var(--color-text-tertiary)]">
                {t('assistantOutputs.moreOutputs', { count: String(outputTargets.length - MAX_CARDS) })}
              </div>
            )}
          </div>
        )}

        <MessageActionBar
          copyText={isStreaming || hideFinalActions ? undefined : content}
          copyLabel="Copy reply"
          branchAction={hideFinalActions ? undefined : branchAction}
          align="start"
          timestamp={hideFinalActions ? undefined : timestamp}
        />
      </div>
    </div>
  )
})

function CollapsedContent({
  content,
  overflow,
  onExpand,
}: {
  content: string
  overflow: Overflow
  onExpand: () => void
}) {
  const preview = content.slice(0, 600)
  const isToolDump = overflow.reason === 'tool-dump'
  return (
    <div className="flex flex-col gap-2">
      <div
        className={`flex items-start gap-2 rounded-[10px] border px-3 py-2 text-xs leading-5 ${
          isToolDump
            ? 'border-[var(--color-warning)]/40 bg-[var(--color-warning)]/8 text-[var(--color-text-secondary)]'
            : 'border-[var(--color-border)] bg-[var(--color-surface-container-low)] text-[var(--color-text-secondary)]'
        }`}
      >
        <span className="mt-0.5 material-symbols-outlined text-[16px] text-[var(--color-text-tertiary)]">
          {isToolDump ? 'build_circle' : 'unfold_more'}
        </span>
        <span className="min-w-0">
          {isToolDump
            ? '检测到模型把工具调用当成普通文本输出了（通常是所选模型不支持稳定的函数调用）。为避免卡顿，已折叠这段原始文本，方案卡片也不会从这类文本生成——建议改用支持函数调用的模型重试。'
            : `这条消息较长（约 ${overflow.chars.toLocaleString()} 字符），已折叠以保持界面流畅。`}
        </span>
      </div>
      <pre className="max-h-40 overflow-hidden whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--color-text-tertiary)] [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
        {preview}
      </pre>
      <button
        type="button"
        onClick={onExpand}
        className="self-start rounded-[8px] border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)]"
      >
        仍要展开全部内容
      </button>
    </div>
  )
}

function shouldUseDocumentLayout(content: string) {
  const normalized = content.trim()
  if (!normalized) return false

  if (/```/.test(normalized)) return true
  if (/^\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\|.+\|)/m.test(normalized)) return true

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  return paragraphs.length >= 2 || normalized.split('\n').filter((line) => line.trim()).length >= 8
}
