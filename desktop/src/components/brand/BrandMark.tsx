import { cn } from '../../lib/utils'
import { publicAssetPath } from '../../lib/publicAsset'

type BrandMarkProps = {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  /** Set to empty string when the logo is purely decorative (e.g. beside visible "AutoABM" text). */
  alt?: string
}

const sizeMap = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-14 w-14',
  xl: 'h-24 w-24',
}

const APP_ICON_SRC = publicAssetPath('app-icon.png')

export function BrandMark({ size = 'md', className, alt = 'AutoABM' }: BrandMarkProps) {
  return (
    <img
      src={APP_ICON_SRC}
      alt={alt}
      className={cn('shrink-0 rounded-xl object-cover', sizeMap[size], className)}
    />
  )
}
