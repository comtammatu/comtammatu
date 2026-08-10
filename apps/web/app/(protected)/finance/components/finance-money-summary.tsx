import { cn } from "@comtammatu/ui";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { formatAccountingVND } from "@comtammatu/shared/format";

export type FinanceMoneySummaryTone = "default" | "muted" | "warning" | "danger";

export interface FinanceMoneySummaryRow {
  label: string;
  /** Canonical money string or number; formatted with formatAccountingVND. */
  value?: string | number;
  /** Optional display override (e.g. signed outflow already formatted). */
  display?: string;
  tone?: FinanceMoneySummaryTone;
  emphasize?: boolean;
}

const TONE_CLASS: Record<FinanceMoneySummaryTone, string> = {
  default: "font-medium",
  muted: "text-muted-foreground",
  warning: "font-medium text-warning",
  danger: "font-medium text-destructive",
};

/**
 * Stacked label/value money rows (expenses NoteCallout / bank match summary).
 * Prefer this over equal-width multi-column grids in narrow Sheets.
 */
export function FinanceMoneySummary({
  rows,
  className,
  tone = "muted",
}: {
  rows: readonly FinanceMoneySummaryRow[];
  className?: string;
  tone?: "muted" | "none";
}) {
  const body = (
    <div className={cn("flex flex-col gap-2", className)}>
      {rows.map((row, index) => {
        const display =
          row.display ??
          formatAccountingVND(row.value ?? 0);
        const rowTone = row.tone ?? "default";
        return (
          <div
            key={`${row.label}-${String(index)}`}
            className={cn(
              "flex items-center justify-between gap-3 text-sm",
              row.emphasize && "mt-1 border-t pt-2 font-medium",
            )}
          >
            <span className="min-w-0 text-muted-foreground">{row.label}</span>
            <span
              className={cn(
                "shrink-0 whitespace-nowrap font-mono tabular-nums",
                TONE_CLASS[rowTone],
              )}
            >
              {display}
            </span>
          </div>
        );
      })}
    </div>
  );

  if (tone === "none") return body;
  return <NoteCallout tone="muted">{body}</NoteCallout>;
}
