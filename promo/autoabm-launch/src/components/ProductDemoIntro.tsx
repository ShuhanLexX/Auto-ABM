import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

const BRAND = {
  acid: '#b6ff3b',
  ink: '#08100c',
  mint: '#52e2c2',
  muted: 'rgba(235, 246, 239, 0.58)',
}

const workflow = ['Question', 'Simulation', 'Run', 'Trace', 'Experiment', 'Reproduce']

const fade = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, start + 16, end - 16, end], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

const FeatureCard: React.FC<{
  index: number
  label: string
  title: string
  detail: string
}> = ({index, label, title, detail}) => {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()
  const enter = spring({
    frame: Math.max(0, frame - 492 - index * 11),
    fps,
    config: {damping: 15, stiffness: 110},
  })

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.055)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 20,
        minHeight: 256,
        opacity: enter,
        padding: '29px 30px',
        transform: 'translateY(' + interpolate(enter, [0, 1], [32, 0]) + 'px)',
      }}
    >
      <div
        style={{
          color: BRAND.acid,
          fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
          fontSize: 17,
          letterSpacing: 2.4,
        }}
      >
        {label}
      </div>
      <div style={{fontSize: 34, fontWeight: 700, letterSpacing: -1.3, marginTop: 62}}>
        {title}
      </div>
      <div style={{color: BRAND.muted, fontSize: 19, lineHeight: 1.45, marginTop: 14}}>
        {detail}
      </div>
    </div>
  )
}

export const ProductDemoIntro: React.FC = () => {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()
  const heroOpacity = fade(frame, 0, 234)
  const loopOpacity = fade(frame, 224, 480)
  const evidenceOpacity = fade(frame, 470, 720)
  const heroEnter = spring({frame, fps, config: {damping: 18, stiffness: 100}})

  return (
    <AbsoluteFill
      style={{
        background: BRAND.ink,
        color: '#f8fffb',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: 'radial-gradient(circle, rgba(82, 226, 194, 0.23), transparent 64%)',
          borderRadius: '50%',
          filter: 'blur(14px)',
          height: 900,
          left: -300,
          opacity: 0.9,
          position: 'absolute',
          top: -360,
          width: 900,
        }}
      />
      <div
        style={{
          border: '1px solid rgba(182, 255, 59, 0.24)',
          borderRadius: '50%',
          height: 760,
          position: 'absolute',
          right: -180,
          top: 160,
          transform: 'rotate(' + frame * 0.12 + 'deg)',
          width: 760,
        }}
      />
      <div
        style={{
          color: 'rgba(248, 255, 251, 0.46)',
          fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
          fontSize: 17,
          left: 92,
          letterSpacing: 3,
          position: 'absolute',
          top: 70,
        }}
      >
        AUTO-ABM · PRODUCT WALKTHROUGH
      </div>

      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          inset: 0,
          justifyContent: 'center',
          padding: '0 150px',
          position: 'absolute',
        }}
      >
        <div style={{opacity: heroOpacity, textAlign: 'center'}}>
          <div
            style={{
              color: BRAND.acid,
              fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
              fontSize: 20,
              letterSpacing: 3.2,
              marginBottom: 34,
              opacity: heroEnter,
            }}
          >
            AI-NATIVE AGENT-BASED MODELING
          </div>
          <div
            style={{
              fontSize: 130,
              fontWeight: 780,
              letterSpacing: -6,
              lineHeight: 0.95,
              transform: 'translateY(' + interpolate(heroEnter, [0, 1], [42, 0]) + 'px)',
            }}
          >
            Auto-ABM
          </div>
          <div
            style={{
              fontSize: 43,
              fontWeight: 530,
              letterSpacing: -1.4,
              lineHeight: 1.24,
              margin: '38px auto 0',
              maxWidth: 1050,
              opacity: heroEnter,
            }}
          >
            A simulation-first workbench for agent-based modeling.
          </div>
          <div style={{color: BRAND.muted, fontSize: 25, marginTop: 24}}>
            From a research question to a reproducible study.
          </div>
        </div>

        <div style={{opacity: loopOpacity, position: 'absolute', width: 1450}}>
          <div
            style={{
              color: BRAND.acid,
              fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
              fontSize: 19,
              letterSpacing: 3,
              textAlign: 'center',
            }}
          >
            ONE CONNECTED RESEARCH LOOP
          </div>
          <div
            style={{
              fontSize: 60,
              fontWeight: 680,
              letterSpacing: -2.7,
              marginTop: 24,
              textAlign: 'center',
            }}
          >
            Make models runnable. Keep conclusions linked to evidence.
          </div>
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 78,
              position: 'relative',
            }}
          >
            <div
              style={{
                background: 'linear-gradient(90deg, rgba(82, 226, 194, 0.06), rgba(182, 255, 59, 0.78), rgba(82, 226, 194, 0.06))',
                height: 2,
                left: 65,
                position: 'absolute',
                right: 65,
                top: 34,
              }}
            />
            {workflow.map((step, index) => {
              const enter = spring({
                frame: Math.max(0, frame - 258 - index * 18),
                fps,
                config: {damping: 14, stiffness: 130},
              })
              return (
                <div key={step} style={{position: 'relative', textAlign: 'center', width: 180}}>
                  <div
                    style={{
                      alignItems: 'center',
                      background: index === 3 ? BRAND.acid : BRAND.ink,
                      border: '2px solid ' + (index === 3 ? BRAND.acid : 'rgba(82, 226, 194, 0.82)'),
                      borderRadius: '50%',
                      color: index === 3 ? BRAND.ink : BRAND.mint,
                      display: 'flex',
                      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                      fontSize: 19,
                      height: 68,
                      justifyContent: 'center',
                      margin: '0 auto',
                      opacity: enter,
                      transform: 'scale(' + interpolate(enter, [0, 1], [0.5, 1]) + ')',
                      width: 68,
                    }}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div style={{fontSize: 22, fontWeight: 650, marginTop: 23, opacity: enter}}>
                    {step}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{opacity: evidenceOpacity, position: 'absolute', width: 1450}}>
          <div
            style={{
              color: BRAND.acid,
              fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
              fontSize: 19,
              letterSpacing: 3,
            }}
          >
            BUILT FOR RESEARCH YOU CAN INSPECT
          </div>
          <div
            style={{
              fontSize: 66,
              fontWeight: 680,
              letterSpacing: -3,
              lineHeight: 1.04,
              marginTop: 25,
              maxWidth: 900,
            }}
          >
            The workflow stays connected from model to result.
          </div>
          <div style={{display: 'grid', gap: 18, gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 60}}>
            <FeatureCard
              index={0}
              label="SIMULATION"
              title="A versioned world"
              detail="Structure, agents, parameters, and ODD evolve together."
            />
            <FeatureCard
              index={1}
              label="RUN + TRACE"
              title="Evidence by default"
              detail="Metrics, events, and state changes remain tied to every run."
            />
            <FeatureCard
              index={2}
              label="EXPERIMENT"
              title="Compare with context"
              detail="Sweep, intervene, repeat seeds, and inspect results in one place."
            />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
