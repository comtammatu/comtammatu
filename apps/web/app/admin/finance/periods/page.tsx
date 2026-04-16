import { Card, CardContent } from "@comtammatu/ui/components/card";
import { fetchFiscalPeriods } from "../period-actions";
import { PeriodsClient } from "./periods-client";

export default async function PeriodsPage() {
  const result = await fetchFiscalPeriods();
  const periods = result.success
    ? ((result.data ?? []) as FiscalPeriodRow[])
    : [];

  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Tài chính
            </span>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Kỳ kế toán
              </h2>
            </div>
          </div>
        </CardContent>
      </Card>
      {!result.success ? (
        <p className="py-10 text-center text-destructive">
          {result.error ?? "Không thể tải danh sách kỳ kế toán."}
        </p>
      ) : (
        <PeriodsClient periods={periods} />
      )}
    </div>
  );
}

export interface FiscalPeriodRow {
  id: number;
  period_month: number;
  period_year: number;
  status: string;
  closed_by: string | null;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface ReconciliationItem {
  category: string;
  subledger_total: number;
  gl_total: number;
  difference: number;
}
