import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { fetchAuditLogs } from "../actions";
import { AuditTrailClient } from "./audit-trail-client";

interface AuditLogRow {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  user_id: string | null;
  created_at: string;
}

interface PageProps {
  searchParams: Promise<{ entity_type?: string; limit?: string }>;
}

export default async function FinanceAuditTrailPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const entityType =
    params.entity_type && params.entity_type !== "all"
      ? params.entity_type
      : undefined;
  const limit = params.limit ? Math.min(Number(params.limit), 500) : 100;

  const result = await fetchAuditLogs(entityType, limit);
  const rows = result.success ? ((result.data ?? []) as AuditLogRow[]) : [];

  // Resolve user_id → full_name for display. AUDIT-LOG-SELECT-EXPLICIT-COLUMNS
  // applies: keep the projection narrow (id + full_name) and skip emails/PII
  // not needed for the list view.
  const userIds = Array.from(
    new Set(
      rows
        .map((r) => r.user_id)
        .filter((id): id is string => id !== null && id !== ""),
    ),
  );

  let userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const supabase = await createClient();
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);

    userMap = new Map(
      (profiles ?? []).map((p) => [p.id, p.full_name ?? "—"]),
    );
  }

  const enrichedRows = rows.map((r) => ({
    ...r,
    user_name: r.user_id ? (userMap.get(r.user_id) ?? "—") : "Hệ thống",
  }));

  // Distinct entity types in current result for the filter dropdown.
  const observedTypes = Array.from(
    new Set(rows.map((r) => r.entity_type)),
  ).sort();

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
            Kế toán · Kiểm toán
          </span>
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Nhật ký kiểm toán
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Lịch sử mọi thao tác ảnh hưởng tới hóa đơn, sổ kế toán, chu kỳ
              tài chính và bảng lương. Read-only — không sửa được sự kiện đã
              ghi.
            </p>
          </div>
        </CardContent>
      </Card>

      <AuditTrailClient
        rows={enrichedRows}
        entityType={entityType ?? "all"}
        observedTypes={observedTypes}
        limit={limit}
      />
    </div>
  );
}
