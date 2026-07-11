/**
 * Deterministic stub kernel worker for the reproduction consistency test.
 *
 * Unlike stubWorker.ts (fixed metrics), this computes metrics_summary purely
 * from (seed, steps, params) via a stable hash, so re-running the same inputs
 * yields identical metrics and different inputs yield different metrics. That is
 * exactly the property a reproduction package must preserve (determinism, P1):
 * export → read manifest seed/params → re-run → identical metrics_summary.
 *
 * Selected via ABM_KERNEL_CMD=bun + ABM_KERNEL_ARGS=["<this file>"].
 */

function emit(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

/** FNV-1a over a string → uint32. Stable across processes (pure arithmetic). */
function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function metricsFor(seed: number, steps: number, params: unknown): Record<string, Record<string, number>> {
  const key = `${seed}|${steps}|${JSON.stringify(params)}`
  const h = hashString(key)
  const final = (h % 1000) / 1000
  const max = ((h >>> 7) % 1000) / 1000
  return { infected: { final, max } }
}

const input = await Bun.stdin.text()

for (const line of input.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed) continue
  const cmd = JSON.parse(trimmed) as Record<string, unknown>
  if (cmd.cmd === 'run') {
    const rid = String(cmd.run_id)
    const seed = Number(cmd.seed)
    const steps = Number(cmd.steps)
    const params = cmd.params ?? {}
    emit({ frame: 'run_meta', run_id: rid, seed, steps })
    emit({
      frame: 'run_done',
      run_id: rid,
      record: {
        id: rid,
        model_id: 'stub',
        model_version: '1',
        kernel_version: 'stub-repro-0',
        seed,
        parameters: params,
        steps,
        status: 'completed',
        metrics_summary: metricsFor(seed, steps, params),
        trace_path: null,
        result_path: null,
      },
    })
  } else if (cmd.cmd === 'shutdown') {
    break
  }
}
