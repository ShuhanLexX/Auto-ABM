import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

const BRAND = {
  teal: '#14b8a6',
  tealLight: '#5eead4',
  dark: '#0f172a',
  darkMid: '#1e293b',
  white: '#f8fafc',
  muted: '#94a3b8',
}

type ScreenshotSceneProps = {
  src: string
  title: string
  subtitle: string
}

export const ScreenshotScene: React.FC<ScreenshotSceneProps> = ({
  src,
  title,
  subtitle,
}) => {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()

  const enter = spring({frame, fps, config: {damping: 18, stiffness: 120}})
  const scale = interpolate(enter, [0, 1], [1.06, 1.0])
  const panY = interpolate(frame, [0, 90], [12, -8], {
    extrapolateRight: 'clamp',
  })
  const textOpacity = interpolate(frame, [8, 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const textY = interpolate(frame, [8, 22], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 80% 60% at 50% 40%, #1a3a35 0%, ${BRAND.dark} 70%)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 72,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
        }}
      >
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            color: BRAND.white,
            letterSpacing: -0.5,
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 26,
            color: BRAND.tealLight,
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          }}
        >
          {subtitle}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 200,
          left: '50%',
          transform: `translateX(-50%) scale(${scale}) translateY(${panY}px)`,
          width: 1680,
          height: 820,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: `0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08), 0 0 60px ${BRAND.teal}22`,
        }}
      >
        <Img
          src={staticFile(src)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top center',
          }}
        />
      </div>
    </AbsoluteFill>
  )
}
