"use client";

// Internal client-only entry point that actually pulls in Recharts.
// Split out from trend-sparkline.tsx so the dynamic-import boundary is
// unambiguous: the public component is RSC-safe; this one is the chunk
// that gets lazy-loaded.

import {
  Line,
  LineChart,
  ResponsiveContainer,
} from "@comtammatu/ui/components/chart";
import type { TrendPoint } from "./trend-sparkline";

interface SparklineChartProps {
  data: TrendPoint[];
  /** CSS color string (e.g. var(--chart-1)) */
  stroke: string;
}

export function SparklineChart({ data, stroke }: SparklineChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 1, right: 1, bottom: 1, left: 1 }}
      >
        <Line
          type="monotone"
          dataKey="y"
          stroke={stroke}
          strokeWidth={1.5}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
