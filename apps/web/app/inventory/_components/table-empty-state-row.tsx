import { cn } from "@comtammatu/ui";
import type { ReactNode } from "react";
import { TableCell, TableRow } from "@comtammatu/ui/components/table";

interface TableEmptyStateRowProps {
  colSpan: number;
  title: string;
  description?: string;
  icon?: ReactNode;
  paddingClassName?: string;
}

export function TableEmptyStateRow({
  colSpan,
  title,
  description,
  icon,
  paddingClassName = "py-12",
}: TableEmptyStateRowProps) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className={`${paddingClassName} text-center`}
      >
        <div
          className={cn(
            "mx-auto flex max-w-sm flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-card px-4 py-6 shadow-sm",
          )}
        >
          {icon ? (
            <div className="flex size-11 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm">
              {icon}
            </div>
          ) : null}
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {description ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
