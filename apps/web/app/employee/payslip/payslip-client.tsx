"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import type { PayslipEntry } from "./page";

const fmt = (n: number) =>
  n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

export function PayslipClient({ entries }: { entries: PayslipEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Chưa có phiếu lương nào.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => {
        const period = entry.payroll_periods;
        const isPaid = period?.status === "paid";

        return (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Tháng {period?.period_month}/{period?.period_year}
                </CardTitle>
                <Badge variant={isPaid ? "default" : "secondary"}>
                  {isPaid ? "Đã trả" : (period?.status ?? "—")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
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
              <div className="border-t pt-2">
                <Row
                  label="THỰC LĨNH"
                  value={fmt(Number(entry.net_salary))}
                  bold
                />
              </div>
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
        className={`font-mono ${bold ? "text-lg font-bold text-primary" : ""} ${muted ? "text-muted-foreground" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
