import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

const BRAND = {
  teal: '#14b8a6',
  tealLight: '#5eead4',
  dark: '#0f172a',
  white: '#f8fafc',
  muted: '#94a3b8',
}

const FEATURES = [
  {icon: '💬', label: '自然语言建模'},
  {icon: '📊', label: '实时指标'},
  {icon: '🔬', label: '参数扫描'},
  {icon: '📦', label: '复现包导出'},
]

export const ClosingCTA: React.FC = () => {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()

  const enter = spring({frame, fps, config: {damping: 16, stiffness: 110}})
  const featuresOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 80% 60% at 50% 50%, #134e4a 0%, ${BRAND.dark} 80%)`,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          transform: `scale(${enter})`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${BRAND.teal}, ${BRAND.tealLight})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 12h4l3-9 4 18 3-9h4"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: BRAND.white,
              fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
            }}
          >
            AutoABM
          </span>
        </div>

        <div
          style={{
            fontSize: 36,
            fontWeight: 600,
            color: BRAND.tealLight,
            marginBottom: 40,
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          }}
        >
          从对话到仿真，从实验到复现
        </div>

        <div
          style={{
            display: 'flex',
            gap: 24,
            justifyContent: 'center',
            opacity: featuresOpacity,
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.label}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '16px 28px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{fontSize: 24}}>{f.icon}</span>
              <span
                style={{
                  fontSize: 20,
                  color: BRAND.white,
                  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
                }}
              >
                {f.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  )
}

type SplitSceneProps = {
  leftSrc: string
  rightSrc: string
  title: string
  leftLabel: string
  rightLabel: string
}

export const SplitCompareScene: React.FC<SplitSceneProps> = ({
  leftSrc,
  rightSrc,
  title,
  leftLabel,
  rightLabel,
}) => {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()

  const enter = spring({frame, fps, config: {damping: 18, stiffness: 120}})
  const titleOpacity = interpolate(frame, [5, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const renderPanel = (src: string, label: string, side: 'left' | 'right') => (
    <div style={{flex: 1, position: 'relative'}}>
      <div
        style={{
          position: 'absolute',
          top: -36,
          [side === 'left' ? 'left' : 'right']: 24,
          fontSize: 18,
          fontWeight: 600,
          color: BRAND.tealLight,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        {label}
      </div>
      <div
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.08)',
          transform: `scale(${interpolate(enter, [0, 1], [0.95, 1])})`,
        }}
      >
        <Img
          src={staticFile(src)}
          style={{width: '100%', height: 420, objectFit: 'cover', objectPosition: 'top'}}
        />
      </div>
    </div>
  )

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 80% 60% at 50% 40%, #1a3a35 0%, ${BRAND.dark} 70%)`,
        padding: '120px 80px 80px',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          fontSize: 44,
          fontWeight: 700,
          color: BRAND.white,
          marginBottom: 56,
          opacity: titleOpacity,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        {title}
      </div>
      <div style={{display: 'flex', gap: 40}}>
        {renderPanel(leftSrc, leftLabel, 'left')}
        {renderPanel(rightSrc, rightLabel, 'right')}
      </div>
    </AbsoluteFill>
  )
}
