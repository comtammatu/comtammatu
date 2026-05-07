"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Check as IconCheck,
  CalendarDays as IconCalendarEvent,
  X as IconX,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { ACTIONS_VI, BRANCH_VI } from "@comtammatu/shared/messages";
import {
  approveShiftRequest,
  fetchPendingShiftRequests,
  rejectShiftRequest,
} from "./shift-request-actions";
import type { BranchOption } from "./page";

interface ShiftRequestRow {
  id: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  date: string;
  note: string | null;
  created_at: string;
  rejected_reason: string | null;
  shifts: {
    id: number;
    name: string;
    start_time: string;
    end_time: string;
  } | null;
  employees: {
    id: number;
    employee_code: string | null;
    profiles: { full_name: string } | null;
  } | null;
}

interface ShiftRequestsTableProps {
  branches: BranchOption[];
}

const STATUS_LABELS = {
  pending: { label: "Chờ duyệt", variant: "warning" as const },
  approved: { label: "Đã duyệt", variant: "success" as const },
  rejected: { label: "Từ chối", variant: "destructive" as const },
  cancelled: { label: "Đã huỷ", variant: "secondary" as const },
};

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
}

export function ShiftRequestsTable({ branches }: ShiftRequestsTableProps) {
  const [requests, setRequests] = useState<ShiftRequestRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    branches[0]?.id ?? null,
  );
  const [isPending, startTransition] = useTransition();

  const [rejectTarget, setRejectTarget] = useState<ShiftRequestRow | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback((branchId: number) => {
    startTransition(async () => {
      const result = await fetchPendingShiftRequests({ branchId });
      if (result.success) {
        setRequests((result.data as ShiftRequestRow[]) ?? []);
      } else {
        toast.error(result.error ?? "Lỗi tải danh sách đăng ký ca");
      }
    });
  }, []);

  useEffect(() => {
    if (selectedBranchId !== null) load(selectedBranchId);
  }, [selectedBranchId, load]);

  function handleApprove(request: ShiftRequestRow) {
    startTransition(async () => {
      const result = await approveShiftRequest({ requestId: request.id });
      if (!result.success) {
        toast.error(result.error ?? "Không thể duyệt");
        return;
      }
      toast.success("Đã duyệt và tạo phân ca");
      setRequests((prev) =>
        prev.map((r) =>
          r.id === request.id ? { ...r, status: "approved" } : r,
        ),
      );
    });
  }

  function handleReject() {
    if (!rejectTarget) return;
    startTransition(async () => {
      const result = await rejectShiftRequest({
        requestId: rejectTarget.id,
        reason: rejectReason.trim() || undefined,
      });
      if (!result.success) {
        toast.error(result.error ?? "Không thể từ chối");
        return;
      }
      toast.success("Đã từ chối đăng ký");
      setRequests((prev) =>
        prev.map((r) =>
          r.id === rejectTarget.id
            ? {
                ...r,
                status: "rejected",
                rejected_reason: rejectReason.trim() || null,
              }
            : r,
        ),
      );
      setRejectTarget(null);
      setRejectReason("");
    });
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={selectedBranchId?.toString() ?? ""}
          onValueChange={(v) => setSelectedBranchId(Number(v))}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder={BRANCH_VI.select} />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id.toString()}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">
          {pendingCount} đăng ký chờ duyệt · tổng {requests.length}
        </span>

        {isPending && <Spinner />}
      </div>

      {requests.length === 0 && !isPending ? (
        <Empty>
          <EmptyMedia variant="icon">
            <IconCalendarEvent />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Chưa có đăng ký ca</EmptyTitle>
            <EmptyDescription>
              Nhân viên chưa gửi nguyện vọng ca làm cho chi nhánh này.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead>Ca</TableHead>
                <TableHead>Nhân viên</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="w-32 text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => {
                const statusInfo = STATUS_LABELS[req.status];
                const isPendingRow = req.status === "pending";
                return (
                  <TableRow key={req.id}>
                    <TableCell>{formatShortDate(req.date)}</TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {req.shifts?.name ?? "—"}
                      </div>
                      {req.shifts ? (
                        <div className="text-xs text-muted-foreground">
                          {req.shifts.start_time} - {req.shifts.end_time}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {req.employees?.profiles?.full_name ??
                        req.employees?.employee_code ??
                        "—"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {req.note ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusInfo.variant}>
                        {statusInfo.label}
                      </Badge>
                      {req.status === "rejected" && req.rejected_reason ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {req.rejected_reason}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {isPendingRow ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={isPending}
                            onClick={() => handleApprove(req)}
                            aria-label="Duyệt"
                          >
                            <IconCheck className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={isPending}
                            onClick={() => {
                              setRejectTarget(req);
                              setRejectReason("");
                            }}
                            aria-label="Từ chối"
                          >
                            <IconX className="size-4" />
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Từ chối đăng ký ca?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Đăng ký của{" "}
              <strong>
                {rejectTarget?.employees?.profiles?.full_name ?? "nhân viên"}
              </strong>{" "}
              cho ca <strong>{rejectTarget?.shifts?.name ?? ""}</strong> ngày{" "}
              <strong>
                {rejectTarget?.date
                  ? formatShortDate(rejectTarget.date)
                  : ""}
              </strong>
              .
            </p>
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Lý do (không bắt buộc)</Label>
              <Input
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                maxLength={500}
                placeholder="Ví dụ: ca này đã đủ người"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectTarget(null)}
              disabled={isPending}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleReject}
              disabled={isPending}
            >
              {isPending && <Spinner className="mr-2" />}
              Từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
