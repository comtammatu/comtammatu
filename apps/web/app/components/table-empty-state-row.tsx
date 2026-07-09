import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { TableCell, TableRow } from "@comtammatu/ui/components/table";
import { AppEmptyState, type AppEmptyStateMode } from "./surface";

type EmptyStateMode = Extract<
  AppEmptyStateMode,
  "no-data" | "no-results" | "no-access"
>;

interface TableEmptyStateRowProps {
  colSpan: number;
  title?: string;
  mode?: EmptyStateMode;
  description?: string;
  icon?: ReactNode;
  paddingClassName?: string;
}

export function TableEmptyStateRow({
  colSpan,
  title,
  mode = "no-data",
  description,
  icon,
  paddingClassName = "py-10",
}: TableEmptyStateRowProps) {
  return (
    <TableRow className="border-0 hover:bg-transparent">
      <TableCell
        colSpan={colSpan}
        className={cn(paddingClassName, "text-center")}
      >
        <AppEmptyState
          compact
          title={title}
          mode={mode}
          description={description}
          icon={icon}
          className="mx-auto max-w-none border-0 bg-transparent p-0 shadow-none"
        />
      </TableCell>
    </TableRow>
  );
}
