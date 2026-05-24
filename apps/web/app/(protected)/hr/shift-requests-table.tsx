"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  Check as IconCheck,
  CalendarDays as IconCalendarEvent,
  X as IconX,
} from "lucide-react";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
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
  return formatVNBusinessDate(dateStr);
}

export function ShiftRequestsTable({ branches }: ShiftRequestsTableProps) {
  const [requests, setRequests] = useState<ShiftRequestRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    branches[0]?.id ?? null,
  );
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<ShiftRequestRow | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback((branchId: number) => {
    startTransition(async () => {
      const result = await fetchPendingShiftRequests({ branchId });
      if (result.success) {
        setRequests((result.data as ShiftRequestRow[]) ?? []);
        setSelectedIds(new Set());
      } else {
        toast.error(result.error ?? "Lỗi tải danh sách đăng ký ca");
      }
    });
  }, []);

  useEffect(() => {
    if (selectedBranchId !== null) load(selectedBranchId);
  }, [selectedBranchId, load]);

  const pendingRows = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests],
  );
  const historyRows = useMemo(
    () => requests.filter((r) => r.status !== "pending"),
    [requests],
  );

  const allSelected =
    pendingRows.length > 0 && pendingRows.every((r) => selectedIds.has(r.id));
  const someSelected =
    pendingRows.some((r) => selectedIds.has(r.id)) && !allSelected;

  function toggleSelect(id: number, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(pendingRows.map((r) => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

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
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(request.id);
        return next;
      });
    });
  }

  function handleBulkApprove() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    startTransition(async () => {
      const results = await Promise.all(
        ids.map((id) =>
          approveShiftRequest({ requestId: id }).then((r) => ({ id, ...r })),
        ),
      );
      const okIds = results.filter((r) => r.success).map((r) => r.id);
      const failed = results.filter((r) => !r.success);
      if (okIds.length > 0) {
        toast.success(`Đã duyệt ${okIds.length} đăng ký`);
        setRequests((prev) =>
          prev.map((r) =>
            okIds.includes(r.id) ? { ...r, status: "approved" } : r,
          ),
        );
      }
      if (failed.length > 0) {
        toast.error(
          `${failed.length} đăng ký không duyệt được: ${failed[0]?.error ?? "lỗi không xác định"}`,
        );
      }
      setSelectedIds(new Set());
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
          {pendingRows.length} chờ duyệt · tổng {requests.length}
        </span>

        {isPending && <Spinner />}
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Chờ duyệt ({pendingRows.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            Lịch sử ({historyRows.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4 space-y-3">
          {selectedIds.size > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-md border bg-card p-2">
              <span className="text-sm">
                Đã chọn <strong>{selectedIds.size}</strong> đăng ký
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={isPending}
                >
                  Bỏ chọn
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleBulkApprove}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Spinner className="mr-2" />
                  ) : (
                    <IconCheck className="mr-1 size-4" />
                  )}
                  Duyệt {selectedIds.size} đăng ký
                </Button>
              </div>
            </div>
          ) : null}

          {pendingRows.length === 0 && !isPending ? (
            <Empty>
              <EmptyMedia variant="icon">
                <IconCalendarEvent />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Không có đăng ký chờ duyệt</EmptyTitle>
                <EmptyDescription>
                  Tất cả đăng ký đã được xử lý cho chi nhánh này.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          allSelected
                            ? true
                            : someSelected
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={(v) => toggleSelectAll(v === true)}
                        aria-label="Chọn tất cả"
                        disabled={pendingRows.length === 0 || isPending}
                      />
                    </TableHead>
                    <TableHead>Ngày</TableHead>
                    <TableHead>Ca</TableHead>
                    <TableHead>Nhân viên</TableHead>
                    <TableHead>Ghi chú</TableHead>
                    <TableHead className="w-32 text-right">Hành động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRows.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(req.id)}
                          onCheckedChange={(v) =>
                            toggleSelect(req.id, v === true)
                          }
                          aria-label={`Chọn đăng ký ${req.id}`}
                          disabled={isPending}
                        />
                      </TableCell>
                      <TableCell>{formatShortDate(req.date)}</TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {req.shifts?.name ?? "—"}
                        </div>
                        {req.shifts ? (
                          <div className="text-xs text-muted-foreground">
                            {req.shifts.start_time.slice(0, 5)} -{" "}
                            {req.shifts.end_time.slice(0, 5)}
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
                      <TableCell className="text-right">
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {historyRows.length === 0 && !isPending ? (
            <Empty>
              <EmptyMedia variant="icon">
                <IconCalendarEvent />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Chưa có lịch sử</EmptyTitle>
                <EmptyDescription>
                  Đăng ký đã duyệt, từ chối, hoặc đã huỷ sẽ hiện ở đây.
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRows.map((req) => {
                    const statusInfo = STATUS_LABELS[req.status];
                    return (
                      <TableRow key={req.id}>
                        <TableCell>{formatShortDate(req.date)}</TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {req.shifts?.name ?? "—"}
                          </div>
                          {req.shifts ? (
                            <div className="text-xs text-muted-foreground">
                              {req.shifts.start_time.slice(0, 5)} -{" "}
                              {req.shifts.end_time.slice(0, 5)}
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

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
                {rejectTarget?.date ? formatShortDate(rejectTarget.date) : ""}
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
