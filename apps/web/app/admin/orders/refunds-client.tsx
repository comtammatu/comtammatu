"use client";

import { useState, useTransition } from "react";
import { Loader2, RotateCcw, CheckCircle, XCircle } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { approveRefund, fetchRefunds } from "./refund-actions";
import type { RefundRow } from "./refund-actions";
import { TableEmptyStateRow } from "../components/table-empty-state-row";
import { StatusBadge } from "@/components/foundation/ui-patterns";

/* ─── Status helpers ─── */

const REFUND_STATUS_LABELS: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

function refundStatusTone(
  status: string,
): "neutral" | "warning" | "success" | "danger" {
  switch (status) {
    case "pending":
      return "warning";
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}

/* ─── Props ─── */

interface RefundsClientProps {
  initialRefunds: RefundRow[];
  canApprove: boolean;
}

/* ─── Component ─── */

export function RefundsClient({
  initialRefunds,
  canApprove,
}: RefundsClientProps) {
  const [refunds, setRefunds] = useState<RefundRow[]>(initialRefunds);
  const [isPending, startTransition] = useTransition();
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function refreshRefunds() {
    startTransition(async () => {
      const result = await fetchRefunds();
      if (result.success && result.data) {
        setRefunds(result.data.refunds);
      }
    });
  }

  function handleApprove(refundId: number, approved: boolean) {
    setActioningId(refundId);
    setErrorMsg(null);
    startTransition(async () => {
      const result = await approveRefund({ refundId, approved });
      if (result.success) {
        await refreshRefunds();
      } else {
        setErrorMsg(result.error ?? "Có lỗi xảy ra");
      }
      setActioningId(null);
    });
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {refunds.length} yêu cầu hoàn tiền
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshRefunds}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <RotateCcw className="mr-1.5 size-3.5" />
          )}
          Làm mới
        </Button>
      </div>

      {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã đơn</TableHead>
              <TableHead className="hidden sm:table-cell">Chi nhánh</TableHead>
              <TableHead className="text-right">Số tiền</TableHead>
              <TableHead className="hidden md:table-cell">Lý do</TableHead>
              <TableHead className="hidden lg:table-cell">Người tạo</TableHead>
              <TableHead className="hidden lg:table-cell">Thời gian</TableHead>
              <TableHead>Trạng thái</TableHead>
              {canApprove && (
                <TableHead className="text-right">Hành động</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {refunds.length === 0 && (
              <TableEmptyStateRow
                colSpan={canApprove ? 8 : 7}
                paddingClassName="py-16"
                title="Không có yêu cầu hoàn tiền nào"
                icon={
                  <RotateCcw className="mx-auto size-8 text-muted-foreground" />
                }
              />
            )}
            {refunds.map((refund) => (
              <TableRow key={refund.id}>
                <TableCell>
                  <span className="font-mono text-sm font-medium">
                    {refund.order_number}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm">
                  {refund.branch_name}
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {formatVND(refund.amount)}
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm max-w-xs truncate">
                  {refund.reason}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm">
                  {refund.created_by_name}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                  {new Date(refund.created_at).toLocaleString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={refundStatusTone(refund.status)}>
                    {REFUND_STATUS_LABELS[refund.status] ?? refund.status}
                  </StatusBadge>
                </TableCell>
                {canApprove && (
                  <TableCell className="text-right">
                    {refund.status === "pending" ? (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-700 border-green-200 hover:bg-green-50"
                          disabled={isPending && actioningId === refund.id}
                          onClick={() => handleApprove(refund.id, true)}
                        >
                          {isPending && actioningId === refund.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <CheckCircle className="size-3.5" />
                          )}
                          <span className="ml-1 hidden sm:inline">Duyệt</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-700 border-red-200 hover:bg-red-50"
                          disabled={isPending && actioningId === refund.id}
                          onClick={() => handleApprove(refund.id, false)}
                        >
                          {isPending && actioningId === refund.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <XCircle className="size-3.5" />
                          )}
                          <span className="ml-1 hidden sm:inline">Từ chối</span>
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {refund.approved_by_name ?? "—"}
                      </span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
