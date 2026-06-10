import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  getVNDateString,
  getVNMonthStartDateString,
} from "@/_lib/format-datetime";
import { ReconciliationClient } from "./reconciliation-client";

interface Props {
  searchParams: Promise<{ since?: string }>;
}

export default async function ReconciliationPage({ searchParams }: Props) {
  const copy = messages.finance.reconciliation.page;
  const params = await searchParams;
  const supabase = await createClient();

  const sinceIso = params.since
    ? new Date(params.since).toISOString()
    : undefined;

  const [{ data: desyncRows }, { data: branches }] = await Promise.all([
    supabase.rpc("find_payment_order_desync", { p_since: sinceIso }),
    supabase.from("branches").select("id, name").order("name"),
  ]);

  const desync = (desyncRows ?? []).map((r) => ({
    payment_id: Number(r.payment_id),
    order_id: Number(r.order_id),
    branch_id: r.branch_id == null ? null : Number(r.branch_id),
    amount: Number(r.amount),
    payment_method: r.payment_method,
    payment_paid_at: r.payment_paid_at,
    order_payment_status: r.order_payment_status,
    age_minutes: r.age_minutes,
  }));

  const branchOptions = (branches ?? []).map((b) => ({
    id: Number(b.id),
    name: b.name,
  }));

  // Default range: current Vietnam-local month-to-date.
  const defaultStart = getVNMonthStartDateString();
  const defaultEnd = getVNDateString();

  return (
    <AppPage>
      <Button asChild variant="ghost" size="sm" className="-ml-3 self-start">
        <Link href="/finance">
          <IconArrowLeft data-icon="inline-start" />
          {messages.finance.common.backToFinance}
        </Link>
      </Button>
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />

      <ReconciliationClient
        branches={branchOptions}
        desync={desync}
        defaultStartDate={defaultStart}
        defaultEndDate={defaultEnd}
      />
    </AppPage>
  );
}
