import type { ReactNode } from "react";
import { TableCell, TableRow } from "../table";
import { cn } from "../../lib/utils";
import {
  AppEmptyState,
  type AppEmptyStateMode,
} from "../../surface/empty-state";

type EmptyStateMode = Extract<
  AppEmptyStateMode,
  "no-data" | "no-results" | "no-access"
>;

export interface TableEmptyStateRowProps {
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
