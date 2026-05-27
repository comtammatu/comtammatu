"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";

interface AuditLogEnriched {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  user_id: string | null;
  user_name: string;
  created_at: string;
}

interface AuditTrailClientProps {
  rows: AuditLogEnriched[];
  entityType: string;
  observedTypes: string[];
  limit: number;
}

const COMMON_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "all", label: "Tất cả" },
  { value: "tax_invoice", label: "HĐĐT" },
  { value: "journal_entry", label: "Bút toán" },
  { value: "payroll_period", label: "Kỳ lương" },
  { value: "fiscal_period", label: "Kỳ kế toán" },
  { value: "supplier_invoice", label: "HĐ NCC" },
  { value: "purchase_order", label: "Đơn mua" },
  { value: "goods_received_note", label: "Phiếu nhập" },
  { value: "stock_transfer", label: "Chuyển kho" },
  { value: "profile", label: "Nhân sự" },
];

const ACTION_TONE: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  create: "default",
  post: "default",
  approve: "default",
  update: "secondary",
  cancel: "destructive",
  void: "destructive",
  delete: "destructive",
  reject: "destructive",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function AuditTrailClient({
  rows,
  entityType,
  observedTypes,
  limit,
}: AuditTrailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Merge predefined types with whatever this result observed, so unfamiliar
  // entity_type values surface in the picker (e.g. a future feature posts an
  // audit row with a type the dropdown didn't anticipate).
  const knownValues = new Set(COMMON_TYPES.map((t) => t.value));
  const extras = observedTypes
    .filter((t) => !knownValues.has(t))
    .map((t) => ({ value: t, label: t }));
  const typeOptions = [...COMMON_TYPES, ...extras];

  function applyFilter(nextEntityType: string) {
    const usp = new URLSearchParams(searchParams);
    if (nextEntityType === "all") {
      usp.delete("entity_type");
    } else {
      usp.set("entity_type", nextEntityType);
    }
    startTransition(() => {
      router.replace(`/finance/audit-trail?${usp.toString()}`, {
        scroll: false,
      });
    });
  }

  function applyLimit(nextLimit: number) {
    const usp = new URLSearchParams(searchParams);
    usp.set("limit", String(nextLimit));
    startTransition(() => {
      router.replace(`/finance/audit-trail?${usp.toString()}`, {
        scroll: false,
      });
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1 space-y-1">
          <CardTitle className="text-lg">
            {rows.length} sự kiện gần nhất
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sắp xếp theo thời gian giảm dần. Chỉ chủ sở hữu và quản lý cấp cao
            xem được.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="audit-entity-type" className="text-xs">
              Đối tượng
            </Label>
            <Select
              value={entityType}
              onValueChange={applyFilter}
              disabled={isPending}
            >
              <SelectTrigger id="audit-entity-type" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-limit" className="text-xs">
              Số dòng
            </Label>
            <Select
              value={String(limit)}
              onValueChange={(v) => applyLimit(Number(v))}
              disabled={isPending}
            >
              <SelectTrigger id="audit-limit" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="500">500</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            disabled={isPending}
          >
            Tải lại
          </Button>
        </div>
      </CardHeader>

      <CardContent flush>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Thời gian</TableHead>
                <TableHead className="w-28">Hành động</TableHead>
                <TableHead className="w-36">Đối tượng</TableHead>
                <TableHead className="w-24">ID</TableHead>
                <TableHead>Người thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-12 text-center text-muted-foreground"
                  >
                    Không có sự kiện phù hợp với bộ lọc hiện tại.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {formatDateTime(r.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ACTION_TONE[r.action] ?? "outline"}>
                        {r.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.entity_type}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.entity_id ?? "—"}
                    </TableCell>
                    <TableCell>{r.user_name}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
