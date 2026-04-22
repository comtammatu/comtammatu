import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { formatVND } from "@comtammatu/shared/format";

interface Props {
  searchParams: Promise<{ since?: string }>;
}

export default async function ReconciliationPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();

  const sinceIso = params.since
    ? new Date(params.since).toISOString()
    : undefined;

  const { data: rows } = await supabase.rpc("find_payment_order_desync", {
    p_since: sinceIso,
  });

  const desync = rows ?? [];
  const branchIds = Array.from(
    new Set(desync.map((r) => r.branch_id).filter(Boolean) as number[]),
  );
  const { data: branches } = branchIds.length
    ? await supabase.from("branches").select("id, name").in("id", branchIds)
    : { data: [] as { id: number; name: string }[] };
  const branchName = new Map<number, string>(
    (branches ?? []).map((b) => [b.id, b.name]),
  );

  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-3">
            <Button asChild variant="ghost" size="sm" className="-ml-3 self-start">
              <Link href="/finance">
                <ArrowLeft className="mr-1 size-4" /> Quay lại Tài chính
              </Link>
            </Button>
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-7 text-amber-500" />
              <div>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Đối soát thanh toán ↔ Đơn hàng
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Liệt kê payment đã <code>completed</code> nhưng order tương
                  ứng chưa chuyển sang <code>paid</code>. Signal webhook gateway
                  fail hoặc race condition. Mặc định 30 ngày gần nhất.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {desync.length === 0 ? (
              <>
                <CheckCircle2 className="size-4 text-emerald-500" />
                Không có desync
              </>
            ) : (
              <>
                <AlertTriangle className="size-4 text-amber-500" />
                {desync.length} mục cần kiểm tra
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {desync.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Tất cả thanh toán đều khớp trạng thái đơn trong cửa sổ quan sát.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Payment
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Đơn
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Chi nhánh
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Số tiền
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Phương thức
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Order status
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Paid lúc
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Lệch
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {desync.map((r) => (
                  <TableRow key={r.payment_id}>
                    <TableCell className="font-mono text-xs">
                      #{r.payment_id}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      #{r.order_id}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.branch_id
                        ? (branchName.get(r.branch_id) ?? `#${r.branch_id}`)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatVND(Number(r.amount))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {r.payment_method ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.order_payment_status === "refunded"
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {r.order_payment_status ?? "unpaid"}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {r.payment_paid_at
                        ? new Date(r.payment_paid_at).toLocaleString("vi-VN")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {r.age_minutes != null ? `${r.age_minutes} phút` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
