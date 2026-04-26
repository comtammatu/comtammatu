import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";

interface PosLineItemCompactProps {
  quantity: number;
  title: string;
  total: string;
  options: string | null;
  note: string | null;
  afterTitle?: ReactNode;
  className?: string;
  quantityClassName?: string;
  titleClassName?: string;
  totalClassName?: string;
  optionsClassName?: string;
  noteClassName?: string;
}

export function PosLineItemCompact({
  quantity,
  title,
  total,
  options,
  note,
  afterTitle,
  className,
  quantityClassName,
  titleClassName,
  totalClassName,
  optionsClassName,
  noteClassName,
}: PosLineItemCompactProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full min-w-0 max-w-full overflow-hidden gap-2.5",
        className,
      )}
    >
      <Badge
        variant="outline"
        className={cn(
          "mt-0.5 w-8 shrink-0 rounded-none px-1 text-xs font-bold tabular-nums",
          quantityClassName,
        )}
      >
        x{quantity}
      </Badge>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex h-6 min-w-0 max-w-full items-center gap-2 overflow-hidden">
          <p
            className={cn(
              "min-w-0 truncate text-base font-semibold leading-6 text-foreground",
              titleClassName,
            )}
          >
            {title}
          </p>
          {afterTitle ? <span className="shrink-0">{afterTitle}</span> : null}
        </div>
        <p
          className={cn(
            "h-5 truncate text-xs leading-5 text-muted-foreground",
            optionsClassName,
          )}
        >
          {options}
        </p>
        <p
          className={cn(
            "h-5 truncate text-xs italic leading-5 text-muted-foreground",
            noteClassName,
          )}
        >
          {note}
        </p>
      </div>
      <p
        className={cn(
          "h-6 w-24 shrink-0 whitespace-nowrap text-right text-sm font-bold leading-6 text-primary tabular-nums",
          totalClassName,
        )}
      >
        {total}
      </p>
    </div>
  );
}
