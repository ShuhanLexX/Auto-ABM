/**
 * Stub kernel worker for AbmRunService + AbmExperimentService + E2E tests.
 *
 * Speaks the same stdio NDJSON contract as packages/abm-kernel worker.py but
 * emits fixed frame sequences so server/E2E tests never depend on Python.
 * Handles dump_config, run, and experiment commands.
 */

function emit(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

const delayMs = Number(Bun.env.ABM_STUB_DELAY_MS ?? 0)

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
  if (cmd.cmd === 'dump_config') {
    const name = String(cmd.name ?? 'stub')
    emit({
      frame: 'config',
      name,
      config: {
        id: name,
        name: `Stub ${name}`,
        description: 'Stub kernel config for server/E2E tests',
        version: '1',
        agents: [{ id: 'person', name: 'Person', state_variables: [], behavior_refs: [] }],
        environment: { type: 'network', config: {} },
        mechanisms: [{ id: 'spread', name: 'Spread', trigger: 'contact', effect: 'aware' }],
        parameters: [{ id: 'p', name: 'p', dtype: 'float', default: 0.3, scope: 'model' }],
        observers: [{ id: 'infected', name: 'infected', level: 'macro', dtype: 'float', description: '' }],
        initialization: { agent_counts: { person: 10 } },
      },
    })
  } else if (cmd.cmd === 'mechanism_graph') {
    const config = (cmd.config ?? {}) as { id?: string; version?: string }
    emit({
      frame: 'mechanism_graph',
      graph: {
        schema_version: '1',
        model_id: config.id ?? 'stub',
        model_version: config.version ?? '1',
        nodes: [
          { id: 'agent:person', kind: 'agent_type', label: 'Person', ref_id: 'person', description: '' },
          { id: 'mechanism:spread', kind: 'mechanism', label: 'Spread', ref_id: 'spread', description: '' },
          { id: 'param:p', kind: 'parameter', label: 'p', ref_id: 'p', description: '' },
          { id: 'observer:infected', kind: 'observer', label: 'infected', ref_id: 'infected', description: '' },
        ],
        edges: [
          { source: 'agent:person', target: 'mechanism:spread', kind: 'structural', relation: 'runs' },
          { source: 'param:p', target: 'mechanism:spread', kind: 'reference', relation: 'controls' },
        ],
        generated_at: '2026-01-01T00:00:00Z',
      },
    })
  } else if (cmd.cmd === 'run') {
    const rid = String(cmd.run_id)
    emit({ frame: 'run_meta', run_id: rid, seed: cmd.seed, steps: cmd.steps })
    for (let tick = 1; tick <= 3; tick++) {
      await delay()
      emit({ frame: 'tick', run_id: rid, tick, metrics: { infected: tick * 0.1 } })
    }
    emit({
      frame: 'run_done',
      run_id: rid,
      record: {
        id: rid,
        model_id: 'stub',
        model_version: '1',
        kernel_version: 'stub-0',
        seed: cmd.seed,
        parameters: cmd.params ?? {},
        steps: cmd.steps,
        ...(cmd.interventions ? { interventions: cmd.interventions } : {}),
        status: 'completed',
        metrics_summary: { infected: { final: 0.3 } },
        trace_path: '/tmp/stub.jsonl',
        result_path: '/tmp/stub.csv',
      },
    })
  } else if (cmd.cmd === 'experiment') {
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
