import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface GlassTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  containerClassName?: string
  showRing?: boolean
}

export const GlassTextarea = React.forwardRef<HTMLTextAreaElement, GlassTextareaProps>(
  ({ className, containerClassName, showRing = true, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false)

    return (
      <div className={cn('relative', containerClassName)}>
        <textarea
          className={cn(
            'flex w-full resize-none rounded-md border-0 bg-transparent px-1 py-2 text-sm',
            'transition-all duration-200 ease-in-out',
            'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]',
            'focus:outline-none focus:ring-0',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          ref={ref}
          onFocus={(event) => {
            setIsFocused(true)
            props.onFocus?.(event)
          }}
          onBlur={(event) => {
            setIsFocused(false)
            props.onBlur?.(event)
          }}
          {...props}
        />

        {showRing && isFocused && (
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-[var(--color-primary)]/25 ring-offset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </div>
    )
  },
)
GlassTextarea.displayName = 'GlassTextarea'
