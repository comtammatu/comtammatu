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
        <div className="mx-auto flex max-w-sm flex-col items-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 shadow-sm">
          {icon ? (
            <div className="flex size-11 items-center justify-center rounded-lg border border-border/70 bg-background/85 text-muted-foreground shadow-sm">
              {icon}
            </div>
          ) : null}
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {description ? (
            <p className="text-xs leading-5 text-muted-foreground/80">
              {description}
            </p>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
