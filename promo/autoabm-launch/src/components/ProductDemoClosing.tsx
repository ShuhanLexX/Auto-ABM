import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

const BRAND = {
  teal: '#14b8a6',
  tealLight: '#5eead4',
  ink: '#0f172a',
  muted: '#64748b',
}

export const ProductDemoClosing: React.FC = () => {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()

  const enter = spring({frame, fps, config: {damping: 16, stiffness: 110}})
  const detailOpacity = interpolate(frame, [24, 44], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        background: '#ffffff',
        color: BRAND.ink,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        justifyContent: 'center',
      }}
    >
      <div style={{textAlign: 'center', transform: `scale(${enter})`}}>
        <div
          style={{
            alignItems: 'center',
            background: `linear-gradient(135deg, ${BRAND.teal}, ${BRAND.tealLight})`,
            borderRadius: 28,
            boxShadow: '0 16px 42px rgba(20, 184, 166, 0.24)',
            display: 'flex',
            height: 112,
            justifyContent: 'center',
            margin: '0 auto 34px',
            width: 112,
          }}
        >
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 12h4l3-9 4 18 3-9h4"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </div>
        <div style={{fontSize: 112, fontWeight: 800, letterSpacing: -4, lineHeight: 1}}>
          Auto-ABM
        </div>
        <div
          style={{
            color: BRAND.teal,
            fontSize: 34,
            fontWeight: 650,
            letterSpacing: -0.7,
            marginTop: 30,
          }}
        >
          From question to simulation. From evidence to discovery.
        </div>
        <div
          style={{
            color: BRAND.muted,
            fontSize: 26,
            marginTop: 50,
            opacity: detailOpacity,
          }}
        >
          github.com/ShuhanLexX/Auto-ABM
        </div>
      </div>
    </AbsoluteFill>
  )
}
