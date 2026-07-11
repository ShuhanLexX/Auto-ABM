import type { AbmProposal } from '../types/chat'
import { useChatStore } from '../stores/chatStore'
import type { PerSessionState } from '../stores/chatStore'
import { useAbmStore } from '../abm/stores/abmStore'
import { useTabStore } from '../stores/tabStore'

declare global {
  interface Window {
    __ABM_E2E__?: {
      openChatTab: (sessionId: string) => void
      seedProposalBatch: (proposals: AbmProposal[]) => boolean
      getActiveSimId: () => string | null
      getActiveProjectId: () => string | null
    }
  }
}

window.__ABM_E2E__ = {
  openChatTab(sessionId) {
    useTabStore.getState().openTab(sessionId, 'E2E Chat', 'session')
    useChatStore.setState((state) => {
      if (state.sessions[sessionId]) return state
      const session: PerSessionState = {
        messages: [],
        chatState: 'idle',
        connectionState: 'disconnected',
        historyStatus: 'idle',
        historyError: null,
        streamingText: '',
        streamingToolInput: '',
        activeToolUseId: null,
        activeToolName: null,
        activeThinkingId: null,
        pendingPermission: null,
        pendingComputerUsePermission: null,
        tokenUsage: { input_tokens: 0, output_tokens: 0 },
        compactCount: 0,
        streamingResponseChars: 0,
        elapsedSeconds: 0,
        statusVerb: '',
        apiRetry: null,
        streamingFallback: null,
        slashCommands: [],
        agentTaskNotifications: {},
        backgroundAgentTasks: {},
        activeGoal: null,
        elapsedTimer: null,
        composerPrefill: null,
        composerInsertion: null,
        composerDraft: null,
        queuedUserMessages: [],
      }
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: session,
        },
      }
    })
  },
  seedProposalBatch(proposals) {
    const tabId = useTabStore.getState().activeTabId
    if (!tabId || tabId.startsWith('__')) return false
    useChatStore.setState((state) => {
      const session = state.sessions[tabId]
      if (!session) return state
      return {
        sessions: {
          ...state.sessions,
          [tabId]: {
            ...session,
            messages: [
              ...session.messages,
              {
                id: `e2e-proposal-${Date.now()}`,
                type: 'abm_proposal_batch',
                proposals,
                timestamp: Date.now(),
              },
            ],
          },
        },
      }
    })
    return true
  },
  getActiveSimId: () => useAbmStore.getState().activeSimId,
  getActiveProjectId: () => useAbmStore.getState().activeProjectId,
}

export {}

