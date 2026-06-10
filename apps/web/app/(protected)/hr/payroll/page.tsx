import Link from "next/link";
import { fetchPayrollPeriods } from "../payroll-actions";
import { AppPage, AppPageHeader } from "@/components/surface";
import { PayrollListClient } from "./payroll-list-client";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";

export default async function PayrollPage() {
  const result = await fetchPayrollPeriods();
  const copy = messages.hr.payroll;
  const periods = result.success
    ? ((result.data ?? []) as PayrollPeriodRow[])
    : [];

  return (
    <AppPage>
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.list.title}
        description={copy.list.description}
        badge={{ children: copy.supportBadge, variant: "secondary" }}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/hr">{copy.backToHr}</Link>
          </Button>
        }
      />
      <PayrollListClient initialPeriods={periods} />
    </AppPage>
  );
}

export interface PayrollPeriodRow {
  id: number;
  tenant_id: number;
  period_month: number;
  period_year: number;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}
