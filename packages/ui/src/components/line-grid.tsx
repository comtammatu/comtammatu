"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../lib/utils"

// ---------------------------------------------------------------------------
// Column spec
// ---------------------------------------------------------------------------

export type LineGridAlign = "start" | "end" | "center"

export type LineGridColumn = {
  key: string
  label?: React.ReactNode
  /** Fixed pixel width. Ignored if `flex` is set. */
  width?: number
  /** CSS grid-template-columns track expression — e.g. "minmax(0, 2fr)" or "1fr". Wins over `width`. */
  flex?: string
  align?: LineGridAlign
  /** Apply font-mono + tabular-nums to header and cells of this column. */
  mono?: boolean
  /** Truncate direct children of cells in this column (pair with consumer-supplied min-w-0). */
  truncate?: boolean
  /** Extra classes for the header cell only. */
  headClassName?: string
}

function trackForColumn(c: LineGridColumn): string {
  if (c.flex) return c.flex
  if (typeof c.width === "number") return `${c.width}px`
  return "auto"
}

function alignClass(a: LineGridAlign | undefined): string {
  switch (a) {
    case "end":
      return "justify-end text-right"
    case "center":
      return "justify-center text-center"
    case "start":
    default:
      return "justify-start text-left"
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type LineGridContextValue = {
  columns: LineGridColumn[]
  template: string
}

const LineGridContext = React.createContext<LineGridContextValue | null>(null)

function useLineGrid(): LineGridContextValue {
  const ctx = React.useContext(LineGridContext)
  if (!ctx) {
    throw new Error(
      "LineGrid sub-components must be rendered inside <LineGrid>.",
    )
  }
  return ctx
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

const lineGridVariants = cva("flex w-full min-w-0 flex-col text-sm", {
  variants: {
    density: {
      compact: "",
      default: "",
    },
  },
  defaultVariants: { density: "default" },
})

function LineGrid({
  columns,
  density = "default",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof lineGridVariants> & { columns: LineGridColumn[] }) {
  const template = React.useMemo(
    () => columns.map(trackForColumn).join(" "),
    [columns],
  )
  const ctx = React.useMemo<LineGridContextValue>(
    () => ({ columns, template }),
    [columns, template],
  )
  return (
    <LineGridContext.Provider value={ctx}>
      <div
        data-slot="line-grid"
        data-density={density}
        className={cn(lineGridVariants({ density }), className)}
        {...props}
      >
        {children}
      </div>
    </LineGridContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Row variants
// ---------------------------------------------------------------------------

const lineGridRowVariants = cva("grid items-center px-3 md:px-5", {
  variants: {
    variant: {
      head: "border-b py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
      body: "border-b py-2.5 in-data-[density=compact]:py-1.5 transition-colors",
      total: "border-b bg-muted/10 py-2 text-sm",
      add: "border-t bg-muted/5 py-2",
    },
    hover: {
      true: "hover:bg-muted/20",
      false: "",
    },
  },
  defaultVariants: { variant: "body", hover: false },
})

type LineGridRowBaseProps = React.ComponentProps<"div"> & {
  asChild?: boolean
} & VariantProps<typeof lineGridRowVariants>

function LineGridRow({
  className,
  variant = "body",
  hover,
  asChild = false,
  style,
  children,
  ...props
}: LineGridRowBaseProps) {
  const { template } = useLineGrid()
  const Comp = asChild ? Slot.Root : "div"
  const resolvedHover = hover ?? variant === "body"
  return (
    <Comp
      data-slot="line-grid-row"
      data-variant={variant}
      className={cn(
        lineGridRowVariants({ variant, hover: resolvedHover, className }),
      )}
      style={{ gridTemplateColumns: template, ...style }}
      {...props}
    >
      {children}
    </Comp>
  )
}

// ---------------------------------------------------------------------------
// Header (auto-renders cells from columns)
// ---------------------------------------------------------------------------

function LineGridHeader({
  className,
  ...props
}: Omit<React.ComponentProps<typeof LineGridRow>, "variant" | "children">) {
  const { columns } = useLineGrid()
  return (
    <LineGridRow variant="head" className={className} {...props}>
      {columns.map((col) => (
        <span
          key={col.key}
          className={cn(
            "flex min-w-0 items-center overflow-hidden px-2",
            alignClass(col.align),
            col.mono && "font-mono tabular-nums",
            col.headClassName,
          )}
        >
          <span className="block min-w-0 max-w-full truncate">
            {col.label ?? null}
          </span>
        </span>
      ))}
    </LineGridRow>
  )
}

// ---------------------------------------------------------------------------
// Add-row (form-style row with top border + muted bg)
// ---------------------------------------------------------------------------

function LineGridAddRow(
  props: Omit<React.ComponentProps<typeof LineGridRow>, "variant">,
) {
  return <LineGridRow variant="add" {...props} />
}

// ---------------------------------------------------------------------------
// Cell — looks up column meta by index, applies align/mono/truncate
// ---------------------------------------------------------------------------

function LineGridCell({
  idx,
  className,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"div"> & { idx: number; asChild?: boolean }) {
  const { columns } = useLineGrid()
  const col = columns[idx]
  if (!col) return null
  const Comp = asChild ? Slot.Root : "div"
  // When col.truncate is set, auto-wrap children in a block-level span so the
  // Tailwind `truncate` utility (overflow + text-overflow:ellipsis +
  // white-space:nowrap) actually applies — text-overflow:ellipsis does not
  // work on inline elements like raw <span>. The wrapper is `min-w-0` so it
  // can shrink below content width inside the flex cell.
  const content = col.truncate ? (
    <span className="block min-w-0 max-w-full truncate">{children}</span>
  ) : (
    children
  )
  return (
    <Comp
      data-slot="line-grid-cell"
      data-column={col.key}
      className={cn(
        "flex min-w-0 items-center overflow-hidden px-2",
        alignClass(col.align),
        col.mono && "font-mono tabular-nums",
        className,
      )}
      {...props}
    >
      {content}
    </Comp>
  )
}

// ---------------------------------------------------------------------------
// Total row helper — label spans columns [0, valueAtIdx), value sits at column
// `valueAtIdx`, remaining columns become aria-hidden spacers.
// ---------------------------------------------------------------------------

function LineGridTotalRow({
  className,
  label,
  valueAtIdx,
  children,
  ...props
}: Omit<React.ComponentProps<typeof LineGridRow>, "variant" | "children"> & {
  label: React.ReactNode
  valueAtIdx: number
  children: React.ReactNode
}) {
  const { columns } = useLineGrid()
  const valueCol = columns[valueAtIdx]
  const trailing = Math.max(0, columns.length - valueAtIdx - 1)
  return (
    <LineGridRow variant="total" className={className} {...props}>
      <span
        className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        style={{ gridColumn: `1 / span ${valueAtIdx}` }}
      >
        {label}
      </span>
      <span
        className={cn(
          "flex items-center font-semibold",
          alignClass(valueCol?.align ?? "end"),
          (valueCol?.mono ?? true) && "font-mono tabular-nums",
        )}
      >
        {children}
      </span>
      {Array.from({ length: trailing }).map((_, i) => (
        <span key={i} aria-hidden="true" />
      ))}
    </LineGridRow>
  )
}

// ---------------------------------------------------------------------------
// Empty placeholder for the body region
// ---------------------------------------------------------------------------

function LineGridEmpty({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="line-grid-empty"
      className={cn(
        "border-b px-6 py-8 text-center text-sm text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export {
  LineGrid,
  LineGridHeader,
  LineGridRow,
  LineGridCell,
  LineGridAddRow,
  LineGridTotalRow,
  LineGridEmpty,
}
