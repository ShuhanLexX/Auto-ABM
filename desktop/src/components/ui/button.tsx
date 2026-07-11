import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/35 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:brightness-110',
        outline: 'border border-[var(--color-border)] bg-transparent hover:bg-[var(--color-surface-hover)]',
        ghost: 'hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]',
        moon: 'border border-[var(--color-moon-border)] bg-[var(--color-moon-chip)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]',
        moonSend:
          'rounded-lg bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-[0_0_20px_rgba(20,184,166,0.25)] hover:brightness-110',
        moonSendDisabled:
          'rounded-lg bg-[var(--color-surface-container-high)] text-[var(--color-text-tertiary)] cursor-not-allowed',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
        iconSm: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
