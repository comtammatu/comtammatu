import { cn } from "@comtammatu/ui/lib/utils";
import { formatVND } from "@comtammatu/shared/format";

// Pure SVG 7×24 heatmap (dow × hour). No chart library — the data shape
// is too simple to justify Recharts' overhead, and we get full control
// over semantic-token colors.
//
// Color stops use --chart-1 (low) to --chart-5 (peak) per the design
// tokens. A blank cell (no data) renders as muted bg.

export interface HeatmapCell {
  /** 0=Sunday .. 6=Saturday (matches Postgres EXTRACT(DOW)) */
  dow: number;
  /** 0..23 */
  hour: number;
  value: number;
  orderCount?: number;
}

interface HeatmapGridProps {
  cells: HeatmapCell[];
  /** Optional max for scaling — defaults to max(value) in cells */
  max?: number;
  className?: string;
  /** Title shown to screen readers; the visual title lives in the parent Card */
  ariaLabel?: string;
}

const DOW_LABEL = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;
const HOUR_LABELS = [0, 6, 12, 18] as const;

// Five steps, evenly spaced on the normalized 0..1 axis. Cells with
// value=0 keep the muted background so "no orders" reads differently
// from "1 small order".
function bucket(normalized: number): number {
  if (normalized <= 0) return 0;
  if (normalized < 0.2) return 1;
  if (normalized < 0.4) return 2;
  if (normalized < 0.6) return 3;
  if (normalized < 0.8) return 4;
  return 5;
}

const FILL_VAR: Record<number, string> = {
  0: "transparent",
  1: "color-mix(in oklab, var(--chart-1) 25%, transparent)",
  2: "color-mix(in oklab, var(--chart-1) 50%, transparent)",
  3: "var(--chart-1)",
  4: "var(--chart-2)",
  5: "var(--chart-3)",
};

export function HeatmapGrid({
  cells,
  max,
  className,
  ariaLabel = "Biểu đồ nhiệt doanh thu theo giờ và ngày trong tuần",
}: HeatmapGridProps) {
  // Build a (dow, hour) → value map for O(1) lookup during render.
  const map = new Map<string, HeatmapCell>();
  let computedMax = 0;
  for (const c of cells) {
    map.set(`${c.dow}-${c.hour}`, c);
    if (c.value > computedMax) computedMax = c.value;
  }
  const peak = max ?? computedMax;

  // SVG geometry — 24 columns × 7 rows + 1 row for hour ticks + 1 col
  // for dow labels. Each cell is 14×14 with 1px gap.
  const cellSize = 14;
  const gap = 1;
  const cellPitch = cellSize + gap;
  const labelGutter = 28;
  const headerHeight = 14;
  const width = labelGutter + 24 * cellPitch;
  const height = headerHeight + 7 * cellPitch;

  return (
    <div
      className={cn(
        "w-full overflow-x-auto",
        className,
      )}
      role="img"
      aria-label={ariaLabel}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        preserveAspectRatio="xMinYMin meet"
        className="block"
      >
        {/* Hour ticks (top row) */}
        {HOUR_LABELS.map((h) => (
          <text
            key={`hour-${h}`}
            x={labelGutter + h * cellPitch + cellSize / 2}
            y={10}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {String(h).padStart(2, "0")}h
          </text>
        ))}

        {/* DOW labels + cells */}
        {DOW_LABEL.map((label, dow) => (
          <g key={`row-${dow}`}>
            <text
              x={labelGutter - 6}
              y={headerHeight + dow * cellPitch + cellSize - 3}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {label}
            </text>
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = map.get(`${dow}-${hour}`);
              const value = cell?.value ?? 0;
              const normalized = peak > 0 ? value / peak : 0;
              const step = bucket(normalized);
              const titleParts: string[] = [
                `${label} ${String(hour).padStart(2, "0")}:00`,
              ];
              titleParts.push(
                value > 0 ? formatVND(value) : "Không có doanh thu",
              );
              if (cell?.orderCount != null) {
                titleParts.push(`${cell.orderCount} đơn`);
              }
              return (
                <rect
                  key={`cell-${dow}-${hour}`}
                  x={labelGutter + hour * cellPitch}
                  y={headerHeight + dow * cellPitch}
                  width={cellSize}
                  height={cellSize}
                  rx={2}
                  className={cn(
                    "stroke-border",
                    step === 0 ? "fill-muted/30" : undefined,
                  )}
                  style={
                    step === 0 ? undefined : { fill: FILL_VAR[step] }
                  }
                  strokeWidth={0.5}
                >
                  <title>{titleParts.join(" · ")}</title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
