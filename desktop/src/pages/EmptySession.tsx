import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { agentsApi } from '../api/agents'
import { skillsApi } from '../api/skills'
import { useTranslation } from '../i18n'
import { useSessionStore } from '../stores/sessionStore'
import { useChatStore } from '../stores/chatStore'
import { usePluginStore } from '../stores/pluginStore'
import { useSessionRuntimeStore, DRAFT_RUNTIME_SELECTION_KEY } from '../stores/sessionRuntimeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useUIStore } from '../stores/uiStore'
import { SETTINGS_TAB_ID, useTabStore } from '../stores/tabStore'
import { useWorkspacePanelStore } from '../stores/workspacePanelStore'
import { RepositoryLaunchControls } from '../components/shared/RepositoryLaunchControls'
import { ModelSelector } from '../components/controls/ModelSelector'
import { AbmModeSelector } from '../abm/components/AbmModeSelector'
import { AbmWorkbench } from '../abm/AbmWorkbench'
import { CaseLibraryModal } from '../abm/components/CaseLibraryModal'
import { ResearchAssetShelf } from '../abm/components/ResearchAssetShelf'
import { useAbmStore } from '../abm/stores/abmStore'
import type { AbmSimulation } from '../abm/types'
import { AttachmentGallery } from '../components/chat/AttachmentGallery'
import { ComposerDropOverlay } from '../components/chat/ComposerDropOverlay'
import { ContextUsageIndicator } from '../components/chat/ContextUsageIndicator'
import { FileSearchMenu, type FileSearchMenuHandle } from '../components/chat/FileSearchMenu'
import { LocalSlashCommandPanel, type LocalSlashCommandName } from '../components/chat/LocalSlashCommandPanel'
import { useMobileViewport } from '../hooks/useMobileViewport'
import { isDesktopRuntime } from '../lib/desktopRuntime'
import { BrandMark } from '../components/brand/BrandMark'
import { HeroAmbientBackground } from '../components/ui/glass-composer-shell'
import { ComposerQuickActions, MoonAttachButton, MoonComposerShell, MoonSendButton } from '../components/ui/moon-composer'
import { Textarea } from '../components/ui/textarea'
import { buildComposerQuickActions, composerQuickActionPrompt } from '../lib/composerQuickActions'
import {
  filesToComposerAttachments,
  selectNativeFileAttachments,
  type ComposerAttachment,
} from '../lib/composerAttachments'
import { useComposerFileDrop } from '../components/chat/useComposerFileDrop'
import { shouldSubmitOnEnter } from '../components/chat/sendShortcut'
import {
  appendAgentSlashCommands,
  buildAgentSlashCommands,
  getLocalizedFallbackCommands,
  filterSlashCommands,
  findSlashToken,
  insertSlashTrigger,
  mergeSlashCommands,
  replaceSlashCommand,
  resolveSlashUiAction,
} from '../components/chat/composerUtils'
import type { AttachmentRef } from '../types/chat'
import type { SlashCommandOption } from '../components/chat/composerUtils'

type Attachment = ComposerAttachment

type Translate = ReturnType<typeof useTranslation>
const EMPTY_WORKBENCH_RESIZE_STEP = 32

function insertComposerTokenAtRange(value: string, start: number, end: number, token: string) {
  const boundedStart = Math.max(0, Math.min(start, value.length))
  const boundedEnd = Math.max(boundedStart, Math.min(end, value.length))
  const before = value.slice(0, boundedStart)
  const after = value.slice(boundedEnd)
  const leadingSpace = before.length > 0 && !/\s$/.test(before) ? ' ' : ''
  const trailingSpace = after.length > 0 && !/^\s/.test(after) ? ' ' : ''
  const insertion = `${leadingSpace}${token}${trailingSpace}`

  return {
    value: `${before}${insertion}${after}`,
    cursorPos: before.length + insertion.length,
  }
}

function getApiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const body = error.body
  if (!body || typeof body !== 'object' || !('error' in body)) return null
  return typeof body.error === 'string' ? body.error : null
}

function resolveCreateSessionErrorMessage(error: unknown, t: Translate): string {
  const code = getApiErrorCode(error)
  switch (code) {
    case 'WORKDIR_MISSING':
    case 'WORKDIR_NOT_DIRECTORY':
      return t('empty.createError.workdirMissing')
    case 'REPOSITORY_NOT_GIT':
      return t('empty.createError.notGit')
    case 'REPOSITORY_BRANCH_NOT_FOUND':
      return t('empty.createError.branchNotFound')
    case 'REPOSITORY_DIRTY_WORKTREE':
      return t('empty.createError.dirtyWorktree')
    case 'REPOSITORY_BRANCH_CHECKED_OUT':
      return t('empty.createError.branchCheckedOut')
    case 'REPOSITORY_WORKTREE_CREATE_FAILED':
      return t('empty.createError.worktreeCreateFailed', {
        detail: error instanceof Error ? error.message : t('empty.failedToCreate'),
      })
    case 'REPOSITORY_SWITCH_FAILED':
      return t('empty.createError.switchFailed', {
        detail: error instanceof Error ? error.message : t('empty.failedToCreate'),
      })
    case 'REPOSITORY_CONTEXT_ERROR':
      return t('empty.createError.contextFailed')
    default:
      return error instanceof Error ? error.message : t('empty.failedToCreate')
  }
}

function EmptyWorkbenchResizeHandle() {
  const width = useWorkspacePanelStore((state) => state.width)
  const setWidth = useWorkspacePanelStore((state) => state.setWidth)
  const [dragState, setDragState] = useState<{ startX: number; startWidth: number } | null>(null)
  const dragStateRef = useRef(dragState)

  useEffect(() => {
    dragStateRef.current = dragState
  }, [dragState])

  useEffect(() => {
    if (!dragState) return

    const handlePointerMove = (event: PointerEvent) => {
      const current = dragStateRef.current
      if (!current) return
      setWidth(current.startWidth + current.startX - event.clientX)
    }

    const handlePointerUp = () => setDragState(null)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragState, setWidth])

  return (
    <button
      type="button"
      data-testid="empty-abm-workbench-resize-handle"
      aria-label="调整仿真工作台宽度"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragState({ startX: event.clientX, startWidth: width })
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          setWidth(width + EMPTY_WORKBENCH_RESIZE_STEP)
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          setWidth(width - EMPTY_WORKBENCH_RESIZE_STEP)
        }
      }}
      className="absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize border-l border-[var(--color-border)] bg-transparent transition-colors hover:bg-[var(--color-brand)]/15 focus-visible:bg-[var(--color-brand)]/20 focus-visible:outline-none"
    />
  )
}

export function EmptySession() {
  const t = useTranslation()
  const [input, setInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [workDir, setWorkDir] = useState('')
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const [useWorktree, setUseWorktree] = useState(false)
  const [repositoryLaunchReady, setRepositoryLaunchReady] = useState(true)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const [slashMenuOpen, setSlashMenuOpen] = useState(false)
  const [fileSearchOpen, setFileSearchOpen] = useState(false)
  const [localSlashPanel, setLocalSlashPanel] = useState<LocalSlashCommandName | null>(null)
  const [atFilter, setAtFilter] = useState('')
  const [atCursorPos, setAtCursorPos] = useState(-1)
  const [slashFilter, setSlashFilter] = useState('')
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0)
  const [slashCommands, setSlashCommands] = useState<SlashCommandOption[]>([])
  const [agentSlashCommands, setAgentSlashCommands] = useState<SlashCommandOption[]>([])
  const [caseLibraryOpen, setCaseLibraryOpen] = useState(false)
  const [caseLibraryInitialCaseId, setCaseLibraryInitialCaseId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const slashMenuRef = useRef<HTMLDivElement>(null)
  const fileSearchRef = useRef<FileSearchMenuHandle>(null)
  const slashItemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const createSession = useSessionStore((state) => state.createSession)
  const sendMessage = useChatStore((state) => state.sendMessage)
  const connectToSession = useChatStore((state) => state.connectToSession)
  const setActiveView = useUIStore((state) => state.setActiveView)
  const addToast = useUIStore((state) => state.addToast)
  const currentModel = useSettingsStore((state) => state.currentModel)
  const chatSendBehavior = useSettingsStore((state) => state.chatSendBehavior)
  const defaultPermissionMode = useSettingsStore((state) => state.permissionMode)
  const draftPermissionMode = defaultPermissionMode
  const lastPluginReloadSummary = usePluginStore((state) => state.lastReloadSummary)
  const draftRuntimeSelection = useSessionRuntimeStore((state) => state.selections[DRAFT_RUNTIME_SELECTION_KEY])
  const draftRuntimeSelectionKey = draftRuntimeSelection
    ? `${draftRuntimeSelection.providerId ?? 'official'}:${draftRuntimeSelection.modelId}:${draftRuntimeSelection.effortLevel ?? 'auto'}`
    : undefined
  const draftModelLabel = draftRuntimeSelection?.modelId ?? currentModel?.name ?? currentModel?.id
  const isMobileComposer = useMobileViewport() && !isDesktopRuntime()
  const abmPanelOpen = useAbmStore((state) => state.panelOpen)
  const abmMode = useAbmStore((state) => state.mode)
  const rightPanelWidth = useWorkspacePanelStore((state) => state.width)

  const quickActions = useMemo(() => buildComposerQuickActions(t, abmMode), [abmMode, t])

  const handleQuickAction = useCallback((id: string) => {
    const prompt = composerQuickActionPrompt(id, t, abmMode)
    setInput(prompt)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const length = prompt.length
      textareaRef.current?.setSelectionRange(length, length)
    })
  }, [abmMode, t])

  const composerPlaceholder =
    abmMode === 'autonomous'
      ? '把研究任务交给 AutoABM 自主拆解、建模、验证和实验…'
      : abmMode === 'dialogue'
        ? '询问机制、Trace 证据、结果区间或 ODD 细节…'
        : t('empty.placeholder')

  const openCaseLibrary = useCallback((caseId?: string) => {
    setCaseLibraryInitialCaseId(caseId ?? null)
    setCaseLibraryOpen(true)
  }, [])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!plusMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target as Node)) {
        setPlusMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [plusMenuOpen])

  useEffect(() => {
    if (!slashMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (
        slashMenuRef.current &&
        !slashMenuRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setSlashMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [slashMenuOpen])

  useEffect(() => {
    if (!localSlashPanel) return
    const handleClick = (event: MouseEvent) => {
      if (
        slashMenuRef.current &&
        !slashMenuRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setLocalSlashPanel(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [localSlashPanel])

  useEffect(() => {
    if (!fileSearchOpen) return
    const handleClick = (event: MouseEvent) => {
      const menu = document.getElementById('file-search-menu')
      if (
        menu &&
        !menu.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setFileSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [fileSearchOpen])

  useEffect(() => {
    let cancelled = false

    const cwd = workDir || undefined

    skillsApi.list(cwd)
      .then(({ skills }) => {
        if (cancelled) return
        setSlashCommands(
          skills
            .filter((skill) => skill.userInvocable)
            .map((skill) => ({
              name: skill.name,
              description: skill.description,
            })),
        )
      })
      .catch(() => {
        if (!cancelled) {
          setSlashCommands([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [workDir, lastPluginReloadSummary])

  useEffect(() => {
    let cancelled = false
    const cwd = workDir || undefined

    agentsApi.list(cwd)
      .then(({ activeAgents }) => {
        if (cancelled) return
        setAgentSlashCommands(buildAgentSlashCommands(activeAgents))
      })
      .catch(() => {
        if (!cancelled) {
          setAgentSlashCommands([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [workDir, lastPluginReloadSummary])

  const allSlashCommands = useMemo(
    () => appendAgentSlashCommands(
      mergeSlashCommands(slashCommands, getLocalizedFallbackCommands(t)),
      agentSlashCommands,
    ),
    [agentSlashCommands, slashCommands, t],
  )

  const handleWorkDirChange = (newWorkDir: string) => {
    setWorkDir(newWorkDir)
    setSelectedBranch(null)
    setUseWorktree(false)
    setRepositoryLaunchReady(!newWorkDir)
  }

  const filteredCommands = useMemo(() => {
    return filterSlashCommands(allSlashCommands, slashFilter)
  }, [allSlashCommands, slashFilter])

  const exactSlashCommand = useMemo(() => {
    const normalized = slashFilter.trim().toLowerCase()
    if (!normalized) return null
    return filteredCommands.find((command) => command.name.toLowerCase() === normalized) ?? null
  }, [filteredCommands, slashFilter])
  const canSubmit = (
    input.trim().length > 0 ||
    attachments.length > 0 ||
    !!workDir
  ) && !isSubmitting && repositoryLaunchReady

  useEffect(() => {
    setSlashSelectedIndex(0)
  }, [slashFilter])

  useEffect(() => {
    const activeItem = slashMenuOpen ? slashItemRefs.current[slashSelectedIndex] : null
    if (activeItem && typeof activeItem.scrollIntoView === 'function') {
      activeItem.scrollIntoView({ block: 'nearest' })
    }
  }, [slashMenuOpen, slashSelectedIndex])

  const handleSubmit = async () => {
    const text = input.trim()
    if (!canSubmit) return

    const slashUiAction = text.startsWith('/') ? resolveSlashUiAction(text.slice(1)) : null
    if (slashUiAction?.type === 'panel') {
      setLocalSlashPanel(slashUiAction.command as LocalSlashCommandName)
      setInput('')
      setSlashMenuOpen(false)
      setFileSearchOpen(false)
      setPlusMenuOpen(false)
      return
    }

    if (slashUiAction?.type === 'settings') {
      useUIStore.getState().setPendingSettingsTab(slashUiAction.tab)
      useTabStore.getState().openTab(SETTINGS_TAB_ID, 'Settings', 'settings')
      setInput('')
      setSlashMenuOpen(false)
      setFileSearchOpen(false)
      setPlusMenuOpen(false)
      return
    }

    setIsSubmitting(true)
    try {
      const explicitDraftSelection = useSessionRuntimeStore.getState().selections[DRAFT_RUNTIME_SELECTION_KEY]
      const sessionId = await createSession(
        workDir || undefined,
        {
          ...(selectedBranch
            ? { repository: { branch: selectedBranch, worktree: useWorktree } }
            : {}),
          permissionMode: draftPermissionMode,
        },
      )
      if (explicitDraftSelection) {
        useSessionRuntimeStore.getState().setSelection(sessionId, explicitDraftSelection)
        useSessionRuntimeStore.getState().clearSelection(DRAFT_RUNTIME_SELECTION_KEY)
      }
      setActiveView('code')
      useTabStore.getState().openTab(sessionId, 'New Session')
      connectToSession(sessionId)
      const attachmentPayload: AttachmentRef[] = attachments.map((attachment) => ({
        type: attachment.type,
        name: attachment.name,
        path: attachment.path,
        data: attachment.data,
        mimeType: attachment.mimeType,
      }))
      if (text || attachmentPayload.length > 0) {
        sendMessage(sessionId, text, attachmentPayload)
      }
      setInput('')
      setAttachments([])
    } catch (error) {
      addToast({
        type: 'error',
        message: resolveCreateSessionErrorMessage(error, t),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (value: string, cursorPos: number) => {
    setInput(value)
    const token = findSlashToken(value, cursorPos)
    if (!token) {
      setSlashMenuOpen(false)
    } else {
      setSlashFilter(token.filter)
      setSlashMenuOpen(true)
    }

    // Detect @ trigger for file search
    const textBeforeCursor = value.slice(0, cursorPos)
    let pos = -1
    for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
      const ch = textBeforeCursor[i]!
      if (ch === '@') {
        if (i === 0 || /\s/.test(textBeforeCursor[i - 1]!)) {
          pos = i
          break
        }
        break
      }
      if (/\s/.test(ch)) {
        break
      }
    }
    if (pos < 0) {
      setFileSearchOpen(false)
      setAtFilter('')
      setAtCursorPos(-1)
    } else {
      setAtFilter(textBeforeCursor.slice(pos + 1))
      setAtCursorPos(pos)
      setSlashMenuOpen(false)
      setFileSearchOpen(true)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // Ignore key events during IME composition (e.g. Chinese input method)
    if (event.nativeEvent.isComposing) return

    // Route file search navigation keys to FileSearchMenu
    if (fileSearchOpen) {
      const key = event.key
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === 'Tab' || key === 'Escape') {
        event.preventDefault()
        if (key === 'Escape') {
          setFileSearchOpen(false)
          setAtFilter('')
          setAtCursorPos(-1)
          return
        }
        fileSearchRef.current?.handleKeyDown(event.nativeEvent)
        return
      }
      return
    }

    if (slashMenuOpen && filteredCommands.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashSelectedIndex((prev) => (prev + 1) % filteredCommands.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const selected = filteredCommands[slashSelectedIndex]
        if (
          event.key === 'Enter' &&
          exactSlashCommand &&
          selected?.name.toLowerCase() === exactSlashCommand.name.toLowerCase() &&
          slashFilter.trim().toLowerCase() === exactSlashCommand.name.toLowerCase() &&
          shouldSubmitOnEnter(event, chatSendBehavior)
        ) {
          event.preventDefault()
          void handleSubmit()
          return
        }
        event.preventDefault()
        if (selected) selectSlashCommand(selected.name)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setSlashMenuOpen(false)
        return
      }
    }

    if (shouldSubmitOnEnter(event, chatSendBehavior)) {
      event.preventDefault()
      handleSubmit()
    }
  }

  const handlePaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) return

    let hasImage = false
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]
      if (!item || !item.type.startsWith('image/')) continue

      hasImage = true
      event.preventDefault()
      const file = item.getAsFile()
      if (!file) continue
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const reader = new FileReader()
      reader.onload = () => {
        setAttachments((prev) => [
          ...prev,
          {
            id,
            name: `pasted-image-${Date.now()}.png`,
            type: 'image',
            mimeType: file.type || undefined,
            previewUrl: reader.result as string,
            data: reader.result as string,
          },
        ])
      }
      reader.readAsDataURL(file)
    }

    if (!hasImage) return
  }

  const appendFiles = useCallback((files: FileList | File[]) => {
    void filesToComposerAttachments(files)
      .then((nextAttachments) => {
        if (nextAttachments.length === 0) return
        setAttachments((prev) => [...prev, ...nextAttachments])
      })
      .catch((error) => {
        console.warn('[attachments] Failed to read selected files', error)
      })
  }, [])

  const appendAttachments = useCallback((nextAttachments: Attachment[]) => {
    if (nextAttachments.length === 0) return
    setAttachments((prev) => [...prev, ...nextAttachments])
  }, [])

  const { isDragActive, dragHandlers } = useComposerFileDrop({
    panelRef,
    onAttachments: appendAttachments,
    onError: (error) => {
      console.warn('[attachments] Failed to read dropped files', error)
    },
  })

  const openAttachmentPicker = useCallback(() => {
    setPlusMenuOpen(false)
    if (!isDesktopRuntime()) {
      fileInputRef.current?.click()
      return
    }

    void selectNativeFileAttachments()
      .then((nativeAttachments) => {
        if (nativeAttachments) {
          if (nativeAttachments.length > 0) {
            setAttachments((prev) => [...prev, ...nativeAttachments])
          }
          return
        }
        fileInputRef.current?.click()
      })
  }, [])

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    appendFiles(files)
    event.target.value = ''
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
  }

  const selectSlashCommand = (command: string) => {
    const el = textareaRef.current
    if (!el) return
    const cursorPos = el.selectionStart ?? input.length
    const replacement = replaceSlashCommand(input, cursorPos, command)
    if (!replacement) return
    setInput(replacement.value)
    setSlashMenuOpen(false)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(replacement.cursorPos, replacement.cursorPos)
    })
  }

  const insertSlashCommand = () => {
    const el = textareaRef.current
    const cursorPos = el?.selectionStart ?? input.length
    const replacement = insertSlashTrigger(input, cursorPos)
    setInput(replacement.value)
    setPlusMenuOpen(false)
    setSlashFilter('')
    setSlashMenuOpen(true)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(replacement.cursorPos, replacement.cursorPos)
    })
  }

  const selectAbmSimulationReference = (simulation: AbmSimulation) => {
    if (atCursorPos < 0) return
    const tokenEnd = atCursorPos + 1 + atFilter.length
    const replacement = `@Simulation ${simulation.name} (id=${simulation.id})`
    const next = insertComposerTokenAtRange(input, atCursorPos, tokenEnd, replacement)
    setInput(next.value)
    setFileSearchOpen(false)
    setAtFilter('')
    setAtCursorPos(-1)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(next.cursorPos, next.cursorPos)
    })
  }

  return (
    <div className="lab-bg relative flex flex-1 flex-col overflow-hidden bg-[var(--color-surface)]">
      <HeroAmbientBackground />
      <div className={`relative z-10 flex min-h-0 flex-1 flex-col ${isMobileComposer ? 'px-3' : ''}`}>
        <div className={`flex flex-1 flex-col items-center justify-center ${
          isMobileComposer ? 'px-3 pt-10' : 'px-8'
        }`}>
          <div className={`flex flex-col items-center text-center ${
            isMobileComposer ? 'max-w-[340px]' : 'max-w-3xl'
          }`}>
            <BrandMark size={isMobileComposer ? 'lg' : 'xl'} className="mb-7 drop-shadow-[0_10px_28px_rgba(37,99,235,0.22)]" />
            <h1
              className={`mb-3 bg-gradient-to-r from-[var(--color-brand)] via-[var(--color-text-primary)] to-[var(--color-accent)] bg-clip-text font-semibold tracking-normal text-transparent drop-shadow-[0_8px_24px_rgba(37,99,235,0.18)] ${
                isMobileComposer ? 'text-3xl leading-10' : 'text-5xl leading-[1.08]'
              }`}
              style={{ fontFamily: 'var(--font-headline)' }}
            >
              {t('empty.title')}
            </h1>
            <p
              className={`mx-auto font-medium leading-7 text-[var(--color-text-secondary)] ${
                isMobileComposer ? 'max-w-[320px] text-base' : 'max-w-2xl text-lg'
              }`}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {t('empty.subtitle')}
            </p>
          </div>
        </div>

        <div
          data-testid="empty-session-composer-shell"
          className={`flex w-full shrink-0 justify-center ${
            isMobileComposer ? 'px-3 pb-[calc(env(safe-area-inset-bottom)+16px)]' : 'px-4 pb-[min(18vh,140px)]'
          }`}
        >
          <div className={`flex w-full flex-col ${isMobileComposer ? 'max-w-none' : 'max-w-5xl items-center'}`}>
          <MoonComposerShell
            panelRef={panelRef}
            testId="empty-session-composer-panel"
            dragHandlers={dragHandlers}
            isDragActive={isDragActive}
            className={isMobileComposer ? undefined : 'w-full max-w-3xl'}
          >
            {isDragActive && (
              <ComposerDropOverlay
                testId="empty-session-drop-overlay"
                title={t('chat.dropFilesTitle')}
                description={t('chat.dropFilesHint')}
              />
            )}

            <div className={isMobileComposer ? 'contents' : 'contents'}>
              {fileSearchOpen && (
                <FileSearchMenu
                  ref={fileSearchRef}
                  cwd={workDir || ''}
                  filter={atFilter}
                  includeAbmReferences
                  onSelectSimulation={selectAbmSimulationReference}
                  onNavigate={(relativePath) => {
                    if (atCursorPos < 0) return
                    const replacement = `@${relativePath}`
                    const tokenEnd = atCursorPos + 1 + atFilter.length
                    const newValue = `${input.slice(0, atCursorPos)}${replacement}${input.slice(tokenEnd)}`
                    const newCursorPos = atCursorPos + replacement.length
                    setInput(newValue)
                    setAtFilter(relativePath)
                    requestAnimationFrame(() => {
                      textareaRef.current?.focus()
                      textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos)
                    })
                  }}
                  onSelect={(path, name) => {
                    if (atCursorPos >= 0) {
                      const attachmentName = name.split('/').filter(Boolean).pop() ?? name
                      const tokenEnd = atCursorPos + 1 + atFilter.length
                      const beforeToken = input.slice(0, atCursorPos)
                      const afterToken = beforeToken ? input.slice(tokenEnd) : input.slice(tokenEnd).replace(/^\s+/, '')
                      const spacer = beforeToken && afterToken && !/\s$/.test(beforeToken) && !/^\s/.test(afterToken) ? ' ' : ''
                      const newValue = `${beforeToken}${spacer}${afterToken}`
                      const newCursorPos = atCursorPos + spacer.length
                      setAttachments((prev) => [
                        ...prev,
                        {
                          id: `att-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                          name: attachmentName,
                          type: 'file',
                          path,
                        },
                      ])
                      setInput(newValue)
                      setFileSearchOpen(false)
                      setAtFilter('')
                      setAtCursorPos(-1)
                      void textareaRef.current?.focus()
                      requestAnimationFrame(() => {
                        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos)
                      })
                    }
                  }}
                />
              )}

              {localSlashPanel && (
                <div ref={slashMenuRef}>
                  <LocalSlashCommandPanel
                    command={localSlashPanel}
                    cwd={workDir || undefined}
                    commands={allSlashCommands}
                    onClose={() => setLocalSlashPanel(null)}
                  />
                </div>
              )}

              {slashMenuOpen && filteredCommands.length > 0 && (
                <div
                  ref={slashMenuRef}
                  className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] shadow-[var(--shadow-dropdown)]"
                >
                  <div className="max-h-[260px] overflow-y-auto py-1">
                    {filteredCommands.map((command, index) => (
                      <button
                        key={command.name}
                        ref={(el) => { slashItemRefs.current[index] = el }}
                        onClick={() => selectSlashCommand(command.name)}
                        onMouseEnter={() => setSlashSelectedIndex(index)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          index === slashSelectedIndex ? 'bg-[var(--color-surface-hover)]' : 'hover:bg-[var(--color-surface-hover)]'
                        }`}
                      >
                        <span className="flex min-w-0 max-w-[52%] shrink-0 items-baseline gap-1.5">
                          <span className="shrink-0 text-sm font-semibold text-[var(--color-text-primary)]">/{command.name}</span>
                          {command.argumentHint ? (
                            <span className="min-w-0 truncate font-mono text-[11px] text-[var(--color-text-tertiary)]">
                              {command.argumentHint}
                            </span>
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-text-tertiary)]">{command.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {attachments.length > 0 && (
                <AttachmentGallery attachments={attachments} variant="composer" onRemove={removeAttachment} />
              )}

              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => handleInputChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={composerPlaceholder}
                rows={2}
                className="min-h-[48px] max-h-[150px] border-none bg-transparent px-4 py-3 text-sm leading-relaxed shadow-none focus-visible:ring-0"
                style={{ fontFamily: 'var(--font-body)', overflow: 'hidden' }}
              />

              <div className={`moon-composer-footer flex items-center justify-between gap-3 p-3 ${
                isMobileComposer ? 'flex-wrap' : ''
              }`}>
                <div className="flex shrink-0 items-center gap-1">
                  <MoonAttachButton
                    onClick={openAttachmentPicker}
                    ariaLabel={t('empty.addFiles')}
                    compact={isMobileComposer}
                  />
                  <div ref={plusMenuRef} className="relative">
                    <button
                      onClick={() => setPlusMenuOpen((prev) => !prev)}
                      aria-label="Open composer tools"
                      className={`text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] ${
                        isMobileComposer ? 'inline-flex h-11 w-11 items-center justify-center rounded-xl' : 'rounded-lg p-1.5'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                    </button>

                    {plusMenuOpen && (
                      <div className={`absolute bottom-full left-0 mb-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] py-1 shadow-[var(--shadow-dropdown)] ${
                        isMobileComposer ? 'w-[min(240px,calc(100vw-32px))]' : 'w-[240px]'
                      }`}>
                        <button
                          onClick={openAttachmentPicker}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)]"
                        >
                          <span className="material-symbols-outlined text-[18px] text-[var(--color-text-secondary)]">attach_file</span>
                          {t('empty.addFiles')}
                        </button>
                        <button
                          onClick={insertSlashCommand}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)]"
                        >
                          <span className="w-5 text-center text-[18px] font-bold text-[var(--color-text-secondary)]">/</span>
                          {t('empty.slashCommands')}
                        </button>
                      </div>
                    )}
                  </div>

                  <AbmModeSelector compact={isMobileComposer} />
                </div>

                <div className={`${isMobileComposer ? 'flex min-w-0 flex-1 items-center justify-end gap-2' : 'flex items-center gap-3'}`}>
                  <ContextUsageIndicator
                    chatState="idle"
                    messageCount={0}
                    runtimeSelectionKey={draftRuntimeSelectionKey}
                    fallbackModelLabel={draftModelLabel}
                    draft
                    compact={isMobileComposer}
                  />
                  <ModelSelector runtimeKey={DRAFT_RUNTIME_SELECTION_KEY} disabled={isSubmitting} compact={isMobileComposer} />
                  <MoonSendButton
                    disabled={!canSubmit}
                    onClick={handleSubmit}
                    ariaLabel={t('common.run')}
                    title={isMobileComposer ? t('common.run') : undefined}
                    compact={isMobileComposer}
                  />
                </div>
              </div>
            </div>

            {!isMobileComposer && (
              <div className="hidden" aria-hidden="true">
                <RepositoryLaunchControls
                  workDir={workDir}
                  onWorkDirChange={handleWorkDirChange}
                  branch={selectedBranch}
                  onBranchChange={setSelectedBranch}
                  useWorktree={useWorktree}
                  onUseWorktreeChange={setUseWorktree}
                  onLaunchReadyChange={setRepositoryLaunchReady}
                  disabled={isSubmitting}
                  placement="composer"
                />
              </div>
            )}
          </MoonComposerShell>

          {!isMobileComposer && (
            <ComposerQuickActions
              actions={quickActions}
              onSelect={handleQuickAction}
              className="mt-6"
            />
          )}

          {isMobileComposer && (
            <div className="hidden" aria-hidden="true">
              <RepositoryLaunchControls
                workDir={workDir}
                onWorkDirChange={handleWorkDirChange}
                branch={selectedBranch}
                onBranchChange={setSelectedBranch}
                useWorktree={useWorktree}
                onUseWorktreeChange={setUseWorktree}
                onLaunchReadyChange={setRepositoryLaunchReady}
                disabled={isSubmitting}
              />
            </div>
          )}
          <ResearchAssetShelf onOpenCaseLibrary={openCaseLibrary} />
        </div>
      </div>
      </div>

      {abmPanelOpen ? (
        <aside
          data-testid="empty-abm-workbench-panel"
          className={`absolute z-20 flex flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-dropdown)] ${
            isMobileComposer
              ? 'inset-0'
              : 'inset-y-0 right-0'
          }`}
          style={isMobileComposer ? undefined : { width: `clamp(48vw, ${rightPanelWidth}px, 52vw)`, maxWidth: '52vw', minWidth: '48vw' }}
        >
          {!isMobileComposer ? <EmptyWorkbenchResizeHandle /> : null}
          <AbmWorkbench embedded workDir={workDir || undefined} />
        </aside>
      ) : null}

      <CaseLibraryModal
        open={caseLibraryOpen}
        initialCaseId={caseLibraryInitialCaseId}
        onClose={() => setCaseLibraryOpen(false)}
      />

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
    </div>
  )
}
