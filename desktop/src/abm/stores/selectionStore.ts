import { create } from 'zustand'

/** A picked agent/cell on the canvas, surfaced to the inspector (P1). */
export interface CanvasSelection {
  kind: 'cell' | 'node'
  /** Linear index into the state buffer (grid: y*width+x, network: node index). */
  index: number
  /** Tick represented by the picked frame. */
  tick?: number
  x?: number
  y?: number
  state?: number
  /** Last pointer location in viewport coordinates, used for local explain popovers. */
  anchor?: { x: number; y: number }
}

/** A trace-replay frame the canvas should render instead of the live stream. */
export interface ReplayFrame {
  tick: number
  state: Uint8Array
}

/**
 * A piece of explanation evidence the user clicked (P2, conversation-ux.md §4).
 * Drives the three-way linkage: Trace timeline seek + canvas agent highlight +
 * ODD panel scroll. Always carries a real runId/tick from validated Trace.
 */
export interface EvidenceFocus {
  runId: string
  tick: number
  metric?: string
  mechanism_id?: string
  agentIds?: number[]
}

interface SelectionStore {
  selection: CanvasSelection | null
  /** Non-null while scrubbing the trace timeline; null means follow live. */
  replay: ReplayFrame | null
  /** Set when an explanation evidence chip is clicked; consumers seek/highlight. */
  evidenceFocus: EvidenceFocus | null
  setSelection: (selection: CanvasSelection | null) => void
  setReplay: (replay: ReplayFrame | null) => void
  setEvidenceFocus: (focus: EvidenceFocus | null) => void
  clear: () => void
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selection: null,
  replay: null,
  evidenceFocus: null,
  setSelection: (selection) => set({ selection }),
  setReplay: (replay) => set({ replay }),
  setEvidenceFocus: (evidenceFocus) => set({ evidenceFocus }),
  clear: () => set({ selection: null, replay: null, evidenceFocus: null }),
}))
