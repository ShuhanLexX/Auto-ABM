/**
 * Stub kernel worker for AbmExperimentService tests.
 *
 * Speaks the same stdio NDJSON contract as packages/abm-kernel worker.py's
 * `experiment` command but emits a fixed, deterministic frame sequence
 * (experiment_meta -> run_done× -> experiment_done) so server tests never depend
 * on a real Python runtime. The run count is derived from the ExperimentConfig
 * (sweep combinations × replications). Selected via ABM_KERNEL_CMD=bun +
 * ABM_KERNEL_ARGS=["<this file>"].
 */

function emit(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

const delayMs = Number(Bun.env.ABM_STUB_EXPERIMENT_DELAY_MS ?? 0)

function delay(): Promise<void> {
  return delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve()
}

interface StubAxis {
  parameter_id: string
  values: unknown[]
}

const input = await Bun.stdin.text()

for (const line of input.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed) continue
  const cmd = JSON.parse(trimmed) as Record<string, unknown>
  if (cmd.cmd === 'experiment') {
    const eid = String(cmd.experiment_id)
    const exp = (cmd.experiment ?? {}) as {
      design?: { sweep?: StubAxis[] }
      replications?: number
      base_seed?: number
      steps?: number
    }
    const axes = exp.design?.sweep ?? []
    const combos = axes.length ? axes.reduce((acc, ax) => acc * ax.values.length, 1) : 1
    const replications = exp.replications ?? 1
    const total = combos * replications

    emit({ frame: 'experiment_meta', experiment_id: eid, total })
    for (let i = 0; i < total; i++) {
      await delay()
      // One synthetic failed run when a sweep value is the string 'BAD', to
      // exercise the failed-run-does-not-abort path.
      const failed = axes.some((ax) => ax.values.includes('BAD')) && i === 0
      emit({
        frame: 'run_done',
        experiment_id: eid,
        index: i,
        total,
        record: {
          id: `${eid}-run-${i}`,
          experiment_id: eid,
          model_id: 'stub',
          model_version: '1',
          kernel_version: 'stub-0',
          seed: (exp.base_seed ?? 0) + (i % replications),
          parameters: { idx: i },
          steps: exp.steps ?? 1,
          status: failed ? 'failed' : 'completed',
          metrics_summary: failed ? {} : { infected: { final: 0.1 * i, max: 0.2, min: 0, mean: 0.1 } },
          ...(failed ? { error: { type: 'StubError', message: 'bad run' } } : {}),
          trace_path: '/tmp/stub.jsonl',
          result_path: '/tmp/stub.csv',
        },
      })
    }
    emit({ frame: 'experiment_done', experiment_id: eid })
  } else if (cmd.cmd === 'shutdown') {
    break
  }
}
