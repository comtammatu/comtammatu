import { cn } from "@comtammatu/ui";
import type { ReactNode } from "react";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { TableCell, TableRow } from "@comtammatu/ui/components/table";
import type { EmptyStateMode } from "@/components/patterns";

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
      <TableCell
        colSpan={colSpan}
        className={cn(paddingClassName, "text-center")}
      >
        <Card className="mx-auto max-w-sm">
          <CardContent className="flex flex-col items-center gap-3 py-6">
            {icon ? (
              <div className="flex size-11 items-center justify-center rounded-full border bg-muted text-muted-foreground">
                {icon}
              </div>
            ) : null}
            <p className="text-sm font-semibold text-foreground">
              {resolvedTitle}
            </p>
            {description ? (
              <p className="text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </TableCell>
    </TableRow>
  );
}
