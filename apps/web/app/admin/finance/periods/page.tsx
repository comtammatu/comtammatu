import { fetchFiscalPeriods } from "../period-actions";
import {
  PageContainer,
  PageHeader,
} from "@/components/foundation/ui-patterns";
import { PeriodsClient } from "./periods-client";

export default async function PeriodsPage() {
  const result = await fetchFiscalPeriods();
  const periods = result.success
    ? ((result.data ?? []) as FiscalPeriodRow[])
    : [];

  return (
    <PageContainer>
      <PageHeader eyebrow="Tài chính" title="Kỳ kế toán" />
      <PeriodsClient periods={periods} />
    </PageContainer>
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
