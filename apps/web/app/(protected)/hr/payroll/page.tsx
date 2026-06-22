import Link from "next/link";
import { fetchPayrollPeriods } from "../payroll-actions";
import { AppPage, AppPageHeader } from "@/components/surface";
import { PayrollListClient } from "./payroll-list-client";
import type { PayrollPeriodRow } from "./_types";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";

export default async function PayrollPage() {
  const result = await fetchPayrollPeriods();
  const copy = messages.hr.payroll;
  const periods = result.success
    ? ((result.data ?? []) as PayrollPeriodRow[])
    : [];

  return (
    <AppPage width="wide">
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
