import { useId } from "react";
import { resolveInventoryColorValue, type InventorySemanticColor } from "./ui";

interface BarChartData {
  label: string;
  values: { value: number; color: InventorySemanticColor | string }[];
}

export function SimpleBarChart({
  data,
  height = 160,
}: {
  data: BarChartData[];
  height?: number;
}) {
  const maxValue = Math.max(
    ...data.flatMap((item) => item.values.map((value) => value.value)),
    0,
  );
  const isLast = (index: number) => index === data.length - 1;

  return (
    <div
      className="flex items-end gap-3 border-b border-border px-4 pb-4"
      style={{ height }}
    >
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
              return (
                <div
                  key={`${item.label}-${valueIndex}`}
                  className="w-full cursor-pointer transition-[transform,filter,opacity] duration-300 hover:-translate-y-0.5 hover:brightness-110"
                  style={{
                    height: `${pct}%`,
                    backgroundColor: color,
                    opacity: isLast(dataIndex) ? 1 : 0.25,
                    borderRadius:
                      valueIndex === 0
                        ? "0.5rem 0.5rem 0 0"
                        : valueIndex === item.values.length - 1
                          ? "0 0 0.5rem 0.5rem"
                          : "0",
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
  width = 200,
  height = 60,
  color = "primary",
  target,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: InventorySemanticColor | string;
  target?: number;
}) {
  if (data.length < 2) return null;

  const strokeColor = resolveInventoryColorValue(color);
  const gradientId = useId().replace(/:/g, "");
  const min = Math.min(...data) * 0.9;
  const max = Math.max(...data) * 1.1;
  const range = max - min || 1;
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });
  const targetY = target ? height - ((target - min) / range) * height : null;
  const fillPath = `M${points.join(" L")} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
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
