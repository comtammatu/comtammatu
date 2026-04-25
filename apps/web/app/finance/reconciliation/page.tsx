import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { ReconciliationClient } from "./reconciliation-client";

interface Props {
  searchParams: Promise<{ since?: string }>;
}

export default async function ReconciliationPage({ searchParams }: Props) {
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

  // Default range: current month-to-date
  const now = new Date();
  const defaultStart = `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}-01`;
  const defaultEnd = now.toISOString().slice(0, 10);

  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="space-y-3 p-5 sm:p-6">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-3 self-start"
          >
            <Link href="/finance">
              <IconArrowLeft className="mr-1 size-4" /> Quay lại Tài chính
            </Link>
          </Button>
          <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Tài chính
          </span>
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Đối chiếu sổ phụ ↔ sổ cái
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              So sánh tổng phát sinh sổ phụ (POS, kho, nhân sự, công nợ) với
              tổng bút toán đã ghi nhận trong sổ cái. Khi có chênh lệch, drilldown
              để xem chứng từ gốc và bút toán liên quan.
            </p>
          </div>
        </CardContent>
      </Card>

      <ReconciliationClient
        branches={branchOptions}
        desync={desync}
        defaultStartDate={defaultStart}
        defaultEndDate={defaultEnd}
      />
    </div>
  );
}
