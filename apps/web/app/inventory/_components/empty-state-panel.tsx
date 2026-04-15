import type { ReactNode } from "react";
import { CircleHelp, SearchX, AlertTriangle } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Card, CardContent } from "@comtammatu/ui/components/card";

export type EmptyStateMode = "no-data" | "no-results" | "no-access";

const EMPTY_STATE_COPY: Record<
  EmptyStateMode,
  { title: string; description: string }
> = {
  "no-data": {
    title: "Chưa có dữ liệu",
    description:
      "Danh sách hiện chưa có dữ liệu để hiển thị cho nghiệp vụ hiện tại.",
  },
  "no-results": {
    title: "Không có kết quả phù hợp",
    description: "Thử điều chỉnh bộ lọc hoặc phạm vi truy vấn rồi thử lại.",
  },
  "no-access": {
    title: "Không có quyền truy cập",
    description:
      "Bạn không có quyền xem khu vực này. Liên hệ quản trị viên để được cấp quyền.",
  },
};

const EMPTY_STATE_ICONS: Record<EmptyStateMode, ReactNode> = {
  "no-data": <CircleHelp className="size-4" />,
  "no-results": <SearchX className="size-4" />,
  "no-access": <AlertTriangle className="size-4" />,
};

interface EmptyStatePanelProps {
  title?: string;
  mode?: EmptyStateMode;
  description?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function EmptyStatePanel({
  title,
  mode = "no-data",
  description,
  icon,
  className,
  children,
}: EmptyStatePanelProps) {
  const resolvedTitle = title ?? EMPTY_STATE_COPY[mode].title;
  const resolvedDescription = description ?? EMPTY_STATE_COPY[mode].description;

  return (
    <Card className={cn("border-border/70", className)}>
      <CardContent className="flex min-h-52 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        {icon ?? EMPTY_STATE_ICONS[mode] ? (
          <div className="flex size-12 items-center justify-center rounded-full border bg-muted/40 text-muted-foreground">
            {icon ?? EMPTY_STATE_ICONS[mode]}
          </div>
        ) : null}
        <div className="space-y-1.5">
          <p className="text-base font-semibold">{resolvedTitle}</p>
          {resolvedDescription ? (
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              {resolvedDescription}
            </p>
          ) : null}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
