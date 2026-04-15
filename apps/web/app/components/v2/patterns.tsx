import type { ReactNode } from "react";
import { AlertTriangle, CircleHelp, SearchX } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";

export type EmptyStateMode = "no-data" | "no-results" | "no-access";
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";
export type SurfaceDensity = "compact" | "comfortable" | "touch";

const TONE_VARIANTS: Record<StatusTone, BadgeProps["variant"]> = {
  success: "success",
  warning: "warning",
  danger: "destructive",
  info: "info",
  neutral: "secondary",
};

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
    description:
      "Thử điều chỉnh bộ lọc hoặc phạm vi truy vấn rồi thử lại một lượt nữa.",
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

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "space-y-4 px-4 py-4 md:space-y-5 md:px-6 md:py-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "rounded-4xl border-border/80 bg-card shadow-app-sm",
        className,
      )}
    >
      <CardHeader className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <div className="space-y-1.5">
            <CardTitle className="text-2xl tracking-tight md:text-4xl">
              {title}
            </CardTitle>
            {description ? (
              <CardDescription className="max-w-3xl leading-6">
                {description}
              </CardDescription>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </CardHeader>
    </Card>
  );
}

export function FilterBar({
  children,
  className,
  density: _density,
}: {
  children: ReactNode;
  className?: string;
  density?: SurfaceDensity;
}) {
  return (
    <Card
      className={cn(
        "rounded-4xl border-border/80 bg-card shadow-app-sm",
        className,
      )}
    >
      <CardContent className="flex flex-wrap items-end gap-3 p-5">
        {children}
      </CardContent>
    </Card>
  );
}

export function SectionCard({
  children,
  className,
  contentClassName,
  density = "comfortable",
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  density?: SurfaceDensity;
}) {
  const paddingClassName =
    density === "compact"
      ? "p-4 md:p-5"
      : density === "touch"
        ? "p-6 md:p-7"
        : "p-5 md:p-6";

  return (
    <Card
      className={cn(
        "rounded-4xl border-border/80 bg-card shadow-app-sm",
        className,
      )}
    >
      <CardContent className={cn(paddingClassName, contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  icon,
  mode = "no-data",
  title,
  description,
  action,
  className,
  density: _density,
}: {
  icon?: ReactNode;
  mode?: EmptyStateMode;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  density?: SurfaceDensity;
}) {
  const resolvedTitle = title ?? EMPTY_STATE_COPY[mode].title;
  const resolvedDescription = description ?? EMPTY_STATE_COPY[mode].description;

  return (
    <Card
      className={cn(
        "rounded-4xl border-border/80 bg-card shadow-app-sm",
        className,
      )}
    >
      <CardContent className="flex min-h-56 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        {(icon ?? EMPTY_STATE_ICONS[mode]) ? (
          <div className="flex size-14 items-center justify-center rounded-3xl border border-border/70 bg-panel-subtle text-muted-foreground">
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
        {action}
      </CardContent>
    </Card>
  );
}

export function EmptyStatePanel({
  title,
  mode = "no-data",
  description,
  icon,
  className,
  children,
  density,
}: {
  title?: string;
  mode?: EmptyStateMode;
  description?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
  density?: SurfaceDensity;
}) {
  return (
    <EmptyState
      mode={mode}
      icon={icon}
      title={title}
      description={description}
      action={children}
      className={className}
      density={density}
    />
  );
}

export function StatusBadge({
  tone = "neutral",
  className,
  children,
  label,
  status,
}: {
  tone?: StatusTone;
  className?: string;
  children?: ReactNode;
  label?: string;
  status?: string;
}) {
  return (
    <Badge
      variant={TONE_VARIANTS[tone]}
      className={cn("rounded-full px-3 py-1", className)}
    >
      {status ? (label ?? status) : children}
    </Badge>
  );
}

export function ActionIconButton({
  icon,
  label,
  onClick,
  className,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={disabled}
      onClick={onClick}
      className={cn("rounded-2xl shadow-app-sm", className)}
      aria-label={label}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
  );
}
