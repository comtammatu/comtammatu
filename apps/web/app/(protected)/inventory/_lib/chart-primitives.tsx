import * as React from "react";
import { resolveInventoryColorValue, type InventorySemanticColor } from "./ui";

interface BarChartData {
  label: string;
  values: {
    label: string;
    value: number;
    color: InventorySemanticColor | string;
  }[];
}

export function SimpleBarChart({
  data,
  ariaLabel,
  formatValue = String,
  height = 160,
}: {
  data: BarChartData[];
  ariaLabel: string;
  formatValue?: (value: number) => string;
  height?: number;
}) {
  const descriptionId = `${React.useId().replace(/:/g, "")}-description`;
  const maxValue = Math.max(
    ...data.flatMap((item) => item.values.map((value) => value.value)),
    0,
  );
  const isLast = (index: number) => index === data.length - 1;
  const dataDescription = data
    .map((item) => {
      if (item.values.length === 1) {
        return `${item.label}: ${formatValue(item.values[0]?.value ?? 0)}`;
      }
      return `${item.label}: ${item.values
        .map((value) => `${value.label} ${formatValue(value.value)}`)
        .join(", ")}`;
    })
    .join(". ");

  return (
    <div
      className="flex items-end gap-3 border-b border-border px-4 pb-4"
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
      aria-describedby={descriptionId}
    >
      <span id={descriptionId} className="sr-only">
        {dataDescription}
      </span>
      {data.map((item, dataIndex) => (
        <div
          key={item.label}
          className="group flex flex-1 flex-col items-center gap-1"
        >
          <div
            className="flex w-full flex-col items-center justify-end gap-1"
            style={{ height: height - 32 }}
          >
            {item.values.map((value, valueIndex) => {
              const pct = maxValue > 0 ? (value.value / maxValue) * 100 : 0;
              const color = resolveInventoryColorValue(value.color);
              const radiusClass = [
                valueIndex === 0 ? "rounded-t-md" : "",
                valueIndex === item.values.length - 1 ? "rounded-b-md" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div
                  key={`${item.label}-${valueIndex}`}
                  className={`w-full ${radiusClass}`}
                  style={{
                    height: `${pct}%`,
                    backgroundColor: color,
                    opacity: isLast(dataIndex) ? 1 : 0.25,
                    minHeight: value.value > 0 ? 4 : 0,
                  }}
                />
              );
            })}
          </div>
          <span
            className={
              isLast(dataIndex)
                ? "mt-2 text-xs font-bold text-muted-foreground opacity-100"
                : "mt-2 text-xs text-muted-foreground opacity-50"
            }
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TrendSparkline({
  data,
  ariaLabel,
  formatValue = String,
  width = 200,
  height = 60,
  color = "primary",
  target,
  targetDescription,
}: {
  data: { label: string; value: number }[];
  ariaLabel: string;
  formatValue?: (value: number) => string;
  width?: number;
  height?: number;
  color?: InventorySemanticColor | string;
  target?: number;
  targetDescription?: string;
}) {
  const gradientId = React.useId().replace(/:/g, "");
  const descriptionId = `${gradientId}-description`;

  if (data.length < 2) return null;

  const strokeColor = resolveInventoryColorValue(color);
  const values = data.map((point) => point.value);
  const min = Math.min(...values) * 0.9;
  const max = Math.max(...values) * 1.1;
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });
  const targetY =
    target !== undefined ? height - ((target - min) / range) * height : null;
  const fillPath = `M${points.join(" L")} L${width},${height} L0,${height} Z`;
  const dataDescription = [
    data
      .map((point) => `${point.label}: ${formatValue(point.value)}`)
      .join(". "),
    targetDescription,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full max-w-full overflow-visible"
      role="img"
      aria-label={ariaLabel}
      aria-describedby={descriptionId}
    >
      <desc id={descriptionId}>{dataDescription}</desc>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.15} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradientId})`} />
      {targetY !== null ? (
        <line
          x1={0}
          y1={targetY}
          x2={width}
          y2={targetY}
          stroke="var(--color-destructive)"
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.5}
        />
      ) : null}
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
      {points
        .filter((_, index) => index % 3 === 0 || index === points.length - 1)
        .map((point) => {
          const [cx, cy] = point.split(",").map(Number);
          return (
            <circle key={point} cx={cx} cy={cy} r={4} fill={strokeColor} />
          );
        })}
    </svg>
  );
}
