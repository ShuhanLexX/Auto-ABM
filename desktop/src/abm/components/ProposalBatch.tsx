import { useState } from 'react'
import { Layers } from 'lucide-react'
import type { AbmProposal } from '../../types/chat'
import { abmClient } from '../api/abmClient'
import { ensureAbmProject } from '../bootstrap/ensureAbmProject'
import { ABM_DEFAULT_SIM_KEY } from '../constants'
import { useAbmStore } from '../stores/abmStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useTabStore } from '../../stores/tabStore'
import { useAbmText } from '../i18n'
import { ProposalCard } from './ProposalCard'

type Props = {
  proposals: AbmProposal[]
}

/**
 * A batch of candidate Simulation drafts (conversation-ux.md §2). Each card can
 * be adopted (→ creates a Simulation + sets it active), adopted and run, flagged
 * for comparison, or discarded.
 */
export function ProposalBatch({ proposals }: Props) {
  const t = useAbmText()
  const activeTabId = useTabStore((s) => s.activeTabId)
  const workDir = useSessionStore((s) => {
    const session = s.sessions.find((item) => item.id === activeTabId)
    if (!session) return undefined
    if (session.workDir && session.workDirExists !== false) return session.workDir
    return session.projectPath || undefined
  })
  const setActiveProject = useAbmStore((s) => s.setActiveProject)
  const setActiveSim = useAbmStore((s) => s.setActiveSim)
  const openPanel = useAbmStore((s) => s.openPanel)
  const startRun = useAbmStore((s) => s.startRun)
  const readOnly = useAbmStore((s) => s.mode === 'dialogue')

  const [discarded, setDiscarded] = useState<Set<string>>(() => new Set())
  const [comparing, setComparing] = useState<Set<string>>(() => new Set())
  const [adoptedId, setAdoptedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const visible = proposals.filter((p) => !discarded.has(p.id))

  const adoptCore = async (proposal: AbmProposal) => {
    const projectId = await ensureAbmProject({ workDir, sessionId: activeTabId })
    const sim = await abmClient.createSimulationFromProposal(projectId, proposal)
    localStorage.setItem(`${ABM_DEFAULT_SIM_KEY}:${sim.projectId}`, sim.id)
    setActiveProject(sim.projectId)
    setActiveSim(sim.id)
    openPanel()
    setAdoptedId(proposal.id)
    return sim
  }

  const adopt = async (proposal: AbmProposal) => {
    if (readOnly) {
      setError(t('proposal.readonlyAdoptError'))
      return
    }
    setBusyId(proposal.id)
    setError(null)
    try {
      await adoptCore(proposal)
    } catch {
      setError(t('proposal.adoptFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const adoptAndRun = async (proposal: AbmProposal) => {
    if (readOnly) {
      setError(t('proposal.readonlyRunError'))
      return
    }
    setBusyId(proposal.id)
    setError(null)
    try {
      const sim = await adoptCore(proposal)
      await startRun(sim.id, {
        seed: sim.interface.seed,
        steps: sim.interface.steps,
        params: sim.interface.params,
      })
    } catch {
      setError(t('proposal.adoptRunFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const toggleCompare = (id: string) => {
    setComparing((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const discard = (id: string) => {
    setDiscarded((prev) => new Set(prev).add(id))
  }

  if (visible.length === 0) {
    return (
      <div className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[11px] text-[var(--color-text-tertiary)]">
        {t('proposal.allDiscarded')}
      </div>
    )
  }

  return (
    <div data-testid="proposal-batch" className="mb-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-[var(--color-outline)]">
        <Layers size={13} strokeWidth={2.1} aria-hidden="true" />
        {t('proposal.batchCount', { count: visible.length })}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visible.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            adopted={adoptedId === proposal.id}
            comparing={comparing.has(proposal.id)}
            busy={busyId === proposal.id}
            readOnly={readOnly}
            onAdopt={() => void adopt(proposal)}
            onAdoptAndRun={() => void adoptAndRun(proposal)}
            onCompare={() => toggleCompare(proposal.id)}
            onDiscard={() => discard(proposal.id)}
          />
        ))}
      </div>
      {error ? (
        <div className="mt-1.5 text-[11px] text-[var(--color-error)]">{error}</div>
      ) : null}
    </div>
  )
}
