import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

const BRAND = {
  ink: '#10221a',
  line: '#c9ddd3',
  mint: '#159b78',
  paper: '#fbfdfb',
  teal: '#0f766e',
}

const workflow = ['Question', 'Simulation', 'Run', 'Trace', 'Experiment', 'Reproduce']

const fade = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, start + 12, end - 12, end], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

export const ProductDemoIntro: React.FC = () => {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()
  const introOpacity = interpolate(frame, [0, 130, 143], [1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const workflowOpacity = fade(frame, 135, 330)
  const introEnter = spring({frame, fps, config: {damping: 18, stiffness: 100}})
  const firstCaptionOpacity = interpolate(frame, [0, 130, 143], [1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const secondCaptionOpacity = interpolate(frame, [135, 148, 318, 330], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill
      style={{
        background: BRAND.paper,
        color: BRAND.ink,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: 'radial-gradient(circle, rgba(82, 226, 194, 0.24), transparent 66%)',
          borderRadius: '50%',
          height: 880,
          left: -290,
          position: 'absolute',
          top: -380,
          width: 880,
        }}
      />
      <div
        style={{
          border: '1px solid rgba(15, 118, 110, 0.17)',
          borderRadius: '50%',
          height: 760,
          position: 'absolute',
          right: -180,
          top: 160,
          transform: 'rotate(' + frame * 0.1 + 'deg)',
          width: 760,
        }}
      />
      <div
        style={{
          color: BRAND.teal,
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
        <div style={{opacity: introOpacity, textAlign: 'center'}}>
          <div
            style={{
              color: BRAND.mint,
              fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
              fontSize: 20,
              letterSpacing: 3.2,
              marginBottom: 34,
              opacity: introEnter,
            }}
          >
            AI-NATIVE AGENT-BASED MODELING
          </div>
          <div
            style={{
              fontSize: 132,
              fontWeight: 780,
              letterSpacing: -6,
              lineHeight: 0.95,
              transform: 'translateY(' + interpolate(introEnter, [0, 1], [42, 0]) + 'px)',
            }}
          >
            Auto-ABM
          </div>
          <div
            style={{
              color: '#365248',
              fontSize: 41,
              fontWeight: 530,
              letterSpacing: -1.2,
              marginTop: 38,
              opacity: introEnter,
            }}
          >
            From question to reproducible research.
          </div>
        </div>

        <div style={{opacity: workflowOpacity, position: 'absolute', width: 1450}}>
          <div
            style={{
              color: BRAND.teal,
              fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
              fontSize: 19,
              letterSpacing: 3,
              textAlign: 'center',
            }}
          >
            ONE CONNECTED RESEARCH WORKFLOW
          </div>
          <div
            style={{
              fontSize: 58,
              fontWeight: 680,
              letterSpacing: -2.7,
              marginTop: 24,
              textAlign: 'center',
            }}
          >
            Keep the research loop in one place.
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
                background: 'linear-gradient(90deg, rgba(21, 155, 120, 0.08), rgba(21, 155, 120, 0.78), rgba(21, 155, 120, 0.08))',
                height: 2,
                left: 65,
                position: 'absolute',
                right: 65,
                top: 34,
              }}
            />
            {workflow.map((step, index) => {
              const enter = spring({
                frame: Math.max(0, frame - 156 - index * 13),
                fps,
                config: {damping: 14, stiffness: 130},
              })
              return (
                <div key={step} style={{position: 'relative', textAlign: 'center', width: 180}}>
                  <div
                    style={{
                      alignItems: 'center',
                      background: index === 3 ? BRAND.mint : BRAND.paper,
                      border: '2px solid ' + (index === 3 ? BRAND.mint : BRAND.teal),
                      borderRadius: '50%',
                      color: index === 3 ? BRAND.paper : BRAND.teal,
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
      </div>

      <div
        style={{
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.92)',
          borderTop: '1px solid ' + BRAND.line,
          bottom: 0,
          display: 'flex',
          justifyContent: 'center',
          minHeight: 152,
          padding: '24px 110px',
          position: 'absolute',
          textAlign: 'center',
          width: '100%',
        }}
      >
        <div
          style={{
            color: BRAND.ink,
            fontSize: 32,
            fontWeight: 620,
            letterSpacing: -0.65,
            lineHeight: 1.3,
            maxWidth: 1350,
            opacity: firstCaptionOpacity,
            position: 'absolute',
          }}
        >
          Auto-ABM is an AI-native workbench for agent-based modeling.
        </div>
        <div
          style={{
            color: BRAND.ink,
            fontSize: 32,
            fontWeight: 620,
            letterSpacing: -0.65,
            lineHeight: 1.3,
            maxWidth: 1350,
            opacity: secondCaptionOpacity,
            position: 'absolute',
          }}
        >
          It keeps questions, simulations, evidence, and experiments in one connected workflow.
        </div>
      </div>
    </AbsoluteFill>
  )
}
