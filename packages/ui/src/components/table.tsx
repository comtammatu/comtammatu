"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from '../lib/utils'

const tableVariants = cva("w-full caption-bottom", {
  variants: {
    density: {
      compact: "text-xs",
      default: "text-xs",
      comfortable: "text-sm",
      spacious: "text-sm",
    },
  },
  defaultVariants: {
    density: "default",
  },
})

const tableHeadVariants = cva(
  "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground in-data-[density=compact]:h-8 in-data-[density=compact]:py-1.5 in-data-[density=comfortable]:h-12 in-data-[density=comfortable]:px-4 in-data-[density=comfortable]:py-3 in-data-[density=spacious]:h-auto in-data-[density=spacious]:px-6 in-data-[density=spacious]:py-4 [&:has([role=checkbox])]:pr-0",
  {
    variants: {
      variant: {
        default: "",
        eyebrow:
          "text-xs font-semibold tracking-wider text-muted-foreground uppercase",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Table({
  className,
  density = "default",
  ...props
}: React.ComponentProps<"table"> & VariantProps<typeof tableVariants>) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        data-density={density}
        className={cn(tableVariants({ density }), className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"th"> & VariantProps<typeof tableHeadVariants>) {
  return (
    <th
      data-slot="table-head"
      data-variant={variant}
      className={cn(tableHeadVariants({ variant }), className)}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap in-data-[density=compact]:py-1.5 in-data-[density=comfortable]:px-4 in-data-[density=comfortable]:py-3 in-data-[density=spacious]:px-6 in-data-[density=spacious]:py-4 [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  tableVariants,
  tableHeadVariants,
}
