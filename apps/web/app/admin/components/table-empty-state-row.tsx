import type { ReactNode } from "react";
import { TableCell, TableRow } from "@comtammatu/ui/components/table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { cn } from "@comtammatu/ui";

type EmptyStateMode = "no-data" | "no-results" | "no-access";

const TABLE_EMPTY_STATE_COPY: Partial<Record<EmptyStateMode, string>> = {
  "no-data": "Chưa có dữ liệu",
  "no-results": "Không có kết quả phù hợp",
  "no-access": "Không có quyền truy cập",
};

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
  paddingClassName = "py-12",
}: TableEmptyStateRowProps) {
  const resolvedTitle = title ?? TABLE_EMPTY_STATE_COPY[mode];

  return (
    <TableRow>
      <TableCell colSpan={colSpan} className={cn(paddingClassName, "text-center")}>
        <Empty className="mx-auto max-w-sm border bg-background py-6">
          {icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
          <EmptyHeader>
            <EmptyTitle className="text-sm font-semibold">
              {resolvedTitle}
            </EmptyTitle>
            {description ? (
              <EmptyDescription className="text-xs leading-5">
                {description}
              </EmptyDescription>
            ) : null}
          </EmptyHeader>
        </Empty>
      </TableCell>
    </TableRow>
  );
}
