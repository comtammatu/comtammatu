"use client";

import { cn } from "@comtammatu/ui";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Separator } from "@comtammatu/ui/components/separator";
import type { PayslipEntry } from "./page";

const fmt = (n: number) =>
  n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

const PERIOD_STATUS_LABELS: Record<string, string> = {
  draft: "Nháp",
  calculated: "Đã tính",
  approved: "Đã duyệt",
  paid: "Đã trả",
};

const PERIOD_STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  draft: "outline",
  calculated: "secondary",
  approved: "info",
  paid: "success",
};

export function PayslipClient({ entries }: { entries: PayslipEntry[] }) {
  if (entries.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Chưa có phiếu lương</EmptyTitle>
          <EmptyDescription>
            Các kỳ lương đã phát hành sẽ hiển thị tại đây.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {entries.map((entry) => {
        const period = entry.payroll_periods;
        const status = period?.status ?? "draft";
        const statusLabel = PERIOD_STATUS_LABELS[status] ?? status;

        return (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {period?.period_month && period?.period_year
                    ? `Tháng ${period.period_month}/${period.period_year}`
                    : "Kỳ lương"}
                </CardTitle>
                <Badge variant={PERIOD_STATUS_VARIANTS[status] ?? "secondary"}>
                  {statusLabel}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Row
                label="Ngày công"
                value={`${Number(entry.working_days)}/${Number(entry.standard_days)}`}
              />
              <Row label="Lương Gross" value={fmt(Number(entry.gross_total))} />
              <Row
                label="BH (NLĐ đóng)"
                value={`-${fmt(Number(entry.total_insurance_employee))}`}
                muted
              />
              <Row
                label="Giảm trừ bản thân"
                value={`-${fmt(Number(entry.personal_deduction))}`}
                muted
              />
              {Number(entry.dependent_count) > 0 && (
                <Row
                  label={`Giảm trừ NPT (${entry.dependent_count} người)`}
                  value={`-${fmt(Number(entry.dependent_deduction))}`}
                  muted
                />
              )}
              <Row
                label="Thu nhập tính thuế"
                value={fmt(Number(entry.taxable_income))}
              />
              <Row
                label="Thuế TNCN"
                value={
                  Number(entry.pit_tax) > 0
                    ? `-${fmt(Number(entry.pit_tax))}`
                    : "0"
                }
                muted
              />
              <Separator />
              <Row
                label="Thực lĩnh"
                value={fmt(Number(entry.net_salary))}
                bold
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span
        className={cn(
          "font-mono",
          bold && "text-lg font-bold text-primary",
          muted && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}
