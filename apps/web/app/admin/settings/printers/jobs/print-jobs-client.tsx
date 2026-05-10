"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ACTIONS_VI,
  BRANCH_VI,
  FORM_VI,
  STATES_VI,
} from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
import { toast } from "@comtammatu/ui/components/sonner";
import { TableEmptyStateRow } from "@/components/table-empty-state-row";
import {
  RefreshCw as IconRefresh,
  RotateCcw as IconRotate,
} from "lucide-react";
import { retryJobFromMonitor } from "./actions";

export type JobRow = {
  id: number;
  branch_id: number;
  printer_id: number;
  job_type: string;
  status: string;
  attempts: number;
  retry_count: number;
  last_error: string | null;
  last_retried_at: string | null;
  created_at: string;
  printed_at: string | null;
  claimed_by_agent: string | null;
  printer_role?: string | null;
  printer_name?: string | null;
};

export type BranchOption = { id: number; name: string };

interface Props {
  jobs: JobRow[];
  branches: BranchOption[];
  filterBranch: number | null;
  filterStatus: string | null;
  filterJobType: string | null;
  currentBranchLocked: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ",
  processing: "Đang in",
  printed: "Đã in",
  failed: "Lỗi",
  expired: "Hết hạn",
  cancelled: STATES_VI.cancelled,
};

const STATUS_VARIANT: Record<
  string,
  "default" | "outline" | "secondary" | "destructive"
> = {
  pending: "outline",
  processing: "secondary",
  printed: "default",
  failed: "destructive",
  expired: "destructive",
  cancelled: "outline",
};

const JOB_TYPE_LABEL: Record<string, string> = {
  kitchen_ticket: "Phiếu bếp",
  receipt: "Hóa đơn",
  provisional_bill: "Phiếu tạm tính",
  tax_invoice: "Thông tin HĐĐT",
  shift_close_report: "Phiếu chốt ca",
  reprint: "In lại",
  cancel_ticket: "Phiếu hủy",
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

export function PrintJobsClient({
  jobs,
  branches,
  filterBranch,
  filterStatus,
  filterJobType,
  currentBranchLocked,
}: Props) {
  const router = useRouter();
  const [pendingJobId, setPendingJobId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const updateParam = (key: string, value: string | null) => {
    const sp = new URLSearchParams(window.location.search);
    if (value == null || value === "" || value === "all") sp.delete(key);
    else sp.set(key, value);
    const qs = sp.toString();
    router.push(qs ? `?${qs}` : "?");
  };

  const handleRetry = (id: number) => {
    setPendingJobId(id);
    startTransition(async () => {
      const r = await retryJobFromMonitor(id);
      setPendingJobId(null);
      if (r.success) {
        toast.success(`Đã đẩy lại job #${id} vào hàng đợi`);
        router.refresh();
      } else {
        toast.error(r.error ?? "Không thể thử lại");
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!currentBranchLocked && branches.length > 1 && (
          <Select
            value={filterBranch != null ? String(filterBranch) : "all"}
            onValueChange={(v) => updateParam("branch", v === "all" ? null : v)}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder={BRANCH_VI.selectAll} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{BRANCH_VI.selectAll}</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={filterStatus ?? "all"}
          onValueChange={(v) => updateParam("status", v === "all" ? null : v)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterJobType ?? "all"}
          onValueChange={(v) => updateParam("job_type", v === "all" ? null : v)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Loại phiếu" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả loại</SelectItem>
            {Object.entries(JOB_TYPE_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1"
          onClick={() => router.refresh()}
        >
          <IconRefresh className="size-3.5" />
          {ACTIONS_VI.refresh}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>{FORM_VI.type}</TableHead>
            <TableHead>Máy in</TableHead>
            <TableHead>{FORM_VI.status}</TableHead>
            <TableHead className="text-right">Thử</TableHead>
            <TableHead>Tạo lúc</TableHead>
            <TableHead>In lúc</TableHead>
            <TableHead>Lỗi</TableHead>
            <TableHead className="text-right">Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.length === 0 ? (
            <TableEmptyStateRow
              colSpan={9}
              title="Chưa có job in nào khớp bộ lọc"
            />
          ) : null}
          {jobs.map((j) => {
            const canRetry = j.status === "failed" || j.status === "expired";
            return (
              <TableRow key={j.id}>
                <TableCell className="font-mono text-xs">{j.id}</TableCell>
                <TableCell>
                  {JOB_TYPE_LABEL[j.job_type] ?? j.job_type}
                </TableCell>
                <TableCell>
                  <div className="text-xs">
                    <div>{j.printer_name ?? `#${j.printer_id}`}</div>
                    {j.printer_role && (
                      <div className="text-muted-foreground">
                        {j.printer_role}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[j.status] ?? "outline"}>
                    {STATUS_LABEL[j.status] ?? j.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {j.attempts}
                  {j.retry_count > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      (+{j.retry_count})
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatTime(j.created_at)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatTime(j.printed_at)}
                </TableCell>
                <TableCell
                  className="max-w-xs truncate text-xs text-destructive"
                  title={j.last_error ?? ""}
                >
                  {j.last_error ?? ""}
                </TableCell>
                <TableCell className="text-right">
                  {canRetry ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1"
                      disabled={isPending && pendingJobId === j.id}
                      onClick={() => handleRetry(j.id)}
                    >
                      <IconRotate className="size-3.5" />
                      {ACTIONS_VI.retry}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
