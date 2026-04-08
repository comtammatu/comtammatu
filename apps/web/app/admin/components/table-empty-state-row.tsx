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
        {icon}
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          {title}
        </p>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground/70">{description}</p>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
