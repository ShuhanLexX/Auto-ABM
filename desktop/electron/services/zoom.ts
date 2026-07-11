export const MIN_APP_ZOOM = 0.5
export const MAX_APP_ZOOM = 2

export function normalizeZoomFactor(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 1
  return Math.min(Math.max(numeric, MIN_APP_ZOOM), MAX_APP_ZOOM)
}
