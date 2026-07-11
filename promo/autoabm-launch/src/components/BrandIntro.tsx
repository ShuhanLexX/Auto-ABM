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
  dark: '#0f172a',
  white: '#f8fafc',
  muted: '#94a3b8',
}

export const BrandIntro: React.FC = () => {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()

  const logoScale = spring({frame, fps, config: {damping: 14, stiffness: 100}})
  const taglineOpacity = interpolate(frame, [20, 38], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const taglineY = interpolate(frame, [20, 38], [30, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const subOpacity = interpolate(frame, [35, 52], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const glowPulse = interpolate(
    Math.sin(frame / 12),
    [-1, 1],
    [0.15, 0.35],
  )

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 70% 55% at 50% 45%, #134e4a 0%, ${BRAND.dark} 75%)`,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${BRAND.teal}${Math.round(glowPulse * 255).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
          filter: 'blur(40px)',
        }}
      />

      <div
        style={{
          transform: `scale(${logoScale})`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${BRAND.teal}, ${BRAND.tealLight})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 8px 32px ${BRAND.teal}55`,
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
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
              fontSize: 72,
              fontWeight: 800,
              color: BRAND.white,
              letterSpacing: -1,
              fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
            }}
          >
            AutoABM
          </span>
        </div>

        <div
          style={{
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
            fontSize: 48,
            fontWeight: 600,
            color: BRAND.white,
            letterSpacing: -0.5,
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          }}
        >
          今天想研究什么系统？
        </div>

        <div
          style={{
            opacity: subOpacity,
            marginTop: 20,
            fontSize: 24,
            color: BRAND.muted,
            maxWidth: 720,
            lineHeight: 1.5,
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          }}
        >
          AI 原生的 ABM 科研工作台
        </div>
      </div>
    </AbsoluteFill>
  )
}
