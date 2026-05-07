"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CalendarDays as IconCalendarEvent,
  CircleX as IconCircleX,
  Plus as IconPlus,
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
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { ACTIONS_VI, BRANCH_VI } from "@comtammatu/shared/messages";
import { EmployeePanel } from "../components/employee-page";
import {
  cancelShiftRequest,
  fetchShiftsForRegister,
  submitShiftRequest,
} from "./actions";
import type { InitialRequest } from "./page";

interface BranchOption {
  id: number;
  name: string;
}

interface ShiftOption {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
}

interface ShiftRegisterClientProps {
  branches: BranchOption[];
  defaultBranchId: number | null;
  initialRequests: InitialRequest[];
}

const STATUS_LABELS = {
  pending: { label: "Chờ duyệt", variant: "warning" as const },
  approved: { label: "Đã duyệt", variant: "success" as const },
  rejected: { label: "Từ chối", variant: "destructive" as const },
  cancelled: { label: "Đã huỷ", variant: "secondary" as const },
};

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
}

export function ShiftRegisterClient({
  branches,
  defaultBranchId,
  initialRequests,
}: ShiftRegisterClientProps) {
  const [requests, setRequests] = useState<InitialRequest[]>(initialRequests);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState<number | null>(defaultBranchId);
  const [shiftId, setShiftId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [note, setNote] = useState("");

  const todayIso = new Date().toISOString().split("T")[0]!;
  const maxDateIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 21);
    return d.toISOString().split("T")[0]!;
  })();

  // Load shifts when branch changes
  useEffect(() => {
    if (!branchId) {
      setShifts([]);
      return;
    }
    startTransition(async () => {
      const result = await fetchShiftsForRegister({ branchId });
      if (result.success) {
        setShifts((result.data as ShiftOption[]) ?? []);
      } else {
        toast.error(result.error ?? "Không tải được ca làm");
      }
    });
  }, [branchId]);

  function resetForm() {
    setShiftId("");
    setDate("");
    setNote("");
  }

  function handleSubmit() {
    if (!branchId || !shiftId || !date) return;
    startTransition(async () => {
      const result = await submitShiftRequest({
        branchId,
        shiftId: Number(shiftId),
        date,
        note: note.trim() || undefined,
      });

      if (!result.success) {
        toast.error(result.error ?? "Không thể đăng ký");
        return;
      }

      toast.success("Đã gửi đăng ký — chờ quản lý duyệt");
      const newId = (result.data as { requestId: number }).requestId;
      const shift = shifts.find((s) => s.id === Number(shiftId));
      const newReq: InitialRequest = {
        id: newId,
        status: "pending",
        date,
        note: note.trim() || null,
        created_at: new Date().toISOString(),
        rejected_reason: null,
        shift_id: Number(shiftId),
        branch_id: branchId,
        shifts: shift
          ? {
              id: shift.id,
              name: shift.name,
              start_time: shift.start_time,
              end_time: shift.end_time,
            }
          : null,
      };
      setRequests((prev) =>
        [newReq, ...prev].sort((a, b) => a.date.localeCompare(b.date)),
      );
      resetForm();
      setOpen(false);
    });
  }

  function handleCancel(req: InitialRequest) {
    startTransition(async () => {
      const result = await cancelShiftRequest({ requestId: req.id });
      if (!result.success) {
        toast.error(result.error ?? "Không thể huỷ");
        return;
      }
      toast.success("Đã huỷ đăng ký");
      setRequests((prev) =>
        prev.map((r) =>
          r.id === req.id ? { ...r, status: "cancelled" } : r,
        ),
      );
    });
  }

  if (branches.length === 0) {
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <IconCircleX />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Chưa thể đăng ký ca</EmptyTitle>
          <EmptyDescription>
            Tài khoản chưa được gán chi nhánh. Liên hệ quản lý để cấu hình.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <EmployeePanel
        title="Đăng ký mới"
        description="Chọn ngày và ca bạn muốn nhận trong 21 ngày tới."
      >
        <div className="flex">
          <Button
            type="button"
            size="lg"
            className="w-full sm:w-fit"
            onClick={() => setOpen(true)}
            disabled={isPending}
          >
            <IconPlus data-icon="inline-start" />
            Đăng ký ca mới
          </Button>
        </div>
      </EmployeePanel>

      <EmployeePanel
        title="Đăng ký của tôi"
        description="Trạng thái xử lý các đăng ký 21 ngày tới."
      >
        {requests.length === 0 ? (
          <Empty>
            <EmptyMedia variant="icon">
              <IconCalendarEvent />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Chưa có đăng ký nào</EmptyTitle>
              <EmptyDescription>
                Bấm &ldquo;Đăng ký ca mới&rdquo; để gửi nguyện vọng đầu tiên.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup>
            {requests.map((req) => {
              const status = STATUS_LABELS[req.status];
              return (
                <Item key={req.id} variant="outline">
                  <ItemContent>
                    <ItemTitle>
                      {req.shifts?.name ?? "—"}
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </ItemTitle>
                    <ItemDescription>
                      {formatFullDate(req.date)}
                      {req.shifts
                        ? ` · ${req.shifts.start_time} - ${req.shifts.end_time}`
                        : null}
                      {req.note ? ` · ${req.note}` : null}
                      {req.status === "rejected" && req.rejected_reason
                        ? ` · ${req.rejected_reason}`
                        : null}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {req.status === "pending" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleCancel(req)}
                        aria-label="Huỷ đăng ký"
                      >
                        <IconX className="size-4" />
                      </Button>
                    ) : null}
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </EmployeePanel>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Đăng ký ca làm</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {branches.length > 1 ? (
              <div className="space-y-2">
                <Label>{BRANCH_VI.long}</Label>
                <Select
                  value={branchId?.toString() ?? ""}
                  onValueChange={(v) => setBranchId(Number(v))}
                >
                  <SelectTrigger>
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
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="register-date">Ngày *</Label>
              <Input
                id="register-date"
                type="date"
                value={date}
                min={todayIso}
                max={maxDateIso}
                onChange={(e) => setDate(e.target.value)}
              />
              {date ? (
                <p className="text-xs text-muted-foreground">
                  {formatFullDate(date)}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-shift">Ca làm *</Label>
              <Select
                value={shiftId}
                onValueChange={setShiftId}
                disabled={shifts.length === 0}
              >
                <SelectTrigger id="register-shift">
                  <SelectValue
                    placeholder={
                      shifts.length === 0
                        ? "Chưa có ca khả dụng"
                        : "Chọn ca làm"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {shifts.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name} · {s.start_time} - {s.end_time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-note">Ghi chú (không bắt buộc)</Label>
              <Input
                id="register-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="Ví dụ: chỉ làm được sáng"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !branchId || !shiftId || !date}
            >
              {isPending && <Spinner className="mr-2" />}
              Gửi đăng ký
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
