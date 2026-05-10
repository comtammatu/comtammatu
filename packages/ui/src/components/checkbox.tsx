"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from '../lib/utils'
import { Check as IconCheck } from "lucide-react"

const checkboxVariants = cva(
  "peer group/checkbox relative flex shrink-0 items-center justify-center border border-input transition-shadow outline-none group-has-disabled/field:opacity-50 after:absolute focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary",
  {
    variants: {
      size: {
        sm: "size-3.5 rounded-[4px] after:-inset-x-2.5 after:-inset-y-2",
        default: "size-4 rounded-[4px] after:-inset-x-3 after:-inset-y-2",
        touch: "size-5 rounded-md after:-inset-x-3 after:-inset-y-3",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
)

function Checkbox({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> &
  VariantProps<typeof checkboxVariants>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      data-size={size}
      className={cn(checkboxVariants({ size, className }))}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none group-data-[size=default]/checkbox:[&>svg]:size-3.5 group-data-[size=sm]/checkbox:[&>svg]:size-3 group-data-[size=touch]/checkbox:[&>svg]:size-4"
      >
        <IconCheck
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
