"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
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
import { toast } from "@comtammatu/ui/components/sonner";
import { createStockTransfer, fetchStockTransfers } from "../transfer-actions";

export interface TransferListRow {
  id: number;
  transfer_number: string;
  status: string;
  notes: string | null;
  vehicle_info: string | null;
  shipped_at: string | null;
  received_at: string | null;
  receive_started_at: string | null;
  from_branch_id: number;
  to_branch_id: number;
  created_at: string;
  from_branch_name: string;
  to_branch_name: string;
}

export interface BranchForTransfer {
  id: number;
  name: string;
  is_headquarters: boolean;
  is_active: boolean;
}

type TransferKind = "hq_to_branch" | "branch_to_hq" | "branch_to_branch";

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  confirmed_ship: "Đã xuất kho",
  in_transit: "Đang VC",
  confirmed_receive: "Đang kiểm nhận",
  received: "Đã nhận",
  cancelled: "Đã hủy",
};

export function TransfersListClient({
  initial,
  branches,
}: {
  initial: TransferListRow[];
  branches: BranchForTransfer[];
}) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TransferKind>("hq_to_branch");
  const [toOpId, setToOpId] = useState("");
  const [fromOpId, setFromOpId] = useState("");
  const [b2bFrom, setB2bFrom] = useState("");
  const [b2bTo, setB2bTo] = useState("");
  const [isPending, startTransition] = useTransition();

  const hq = branches.find((b) => b.is_headquarters);
  const operational = branches.filter((b) => !b.is_headquarters);
  const canCreate = Boolean(hq && operational.length >= 1);
  const canBranchToBranch = operational.length >= 2;

  function resetForm() {
    setKind("hq_to_branch");
    setToOpId("");
    setFromOpId("");
    setB2bFrom("");
    setB2bTo("");
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const notes = String(fd.get("notes") ?? "") || undefined;
    const vehicleInfo = String(fd.get("vehicleInfo") ?? "") || undefined;

    if (kind === "hq_to_branch") {
      const bid = Number(toOpId);
      if (!bid) {
        toast.error("Chọn chi nhánh nhận");
        return;
      }
      startTransition(async () => {
        const res = await createStockTransfer({
          kind: "hq_to_branch",
          toBranchId: bid,
          notes,
          vehicleInfo,
        });
        if (!res.success || !res.data) {
          toast.error(res.error ?? "Không tạo được phiếu");
          return;
        }
        toast.success("Đã tạo phiếu chuyển");
        setOpen(false);
        resetForm();
        const again = await fetchStockTransfers();
        if (again.success) setRows((again.data ?? []) as TransferListRow[]);
      });
      return;
    }

    if (kind === "branch_to_hq") {
      const bid = Number(fromOpId);
      if (!bid) {
        toast.error("Chọn chi nhánh gửi");
        return;
      }
      startTransition(async () => {
        const res = await createStockTransfer({
          kind: "branch_to_hq",
          fromBranchId: bid,
          notes,
          vehicleInfo,
        });
        if (!res.success || !res.data) {
          toast.error(res.error ?? "Không tạo được phiếu");
          return;
        }
        toast.success("Đã tạo phiếu chuyển");
        setOpen(false);
        resetForm();
        const again = await fetchStockTransfers();
        if (again.success) setRows((again.data ?? []) as TransferListRow[]);
      });
      return;
    }

    const f = Number(b2bFrom);
    const t = Number(b2bTo);
    if (!f || !t) {
      toast.error("Chọn đủ chi nhánh gửi và nhận");
      return;
    }
    if (f === t) {
      toast.error("Hai chi nhánh phải khác nhau");
      return;
    }
    startTransition(async () => {
      const res = await createStockTransfer({
        kind: "branch_to_branch",
        fromBranchId: f,
        toBranchId: t,
        notes,
        vehicleInfo,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không tạo được phiếu");
        return;
      }
      toast.success("Đã tạo phiếu chuyển");
      setOpen(false);
      resetForm();
      const again = await fetchStockTransfers();
      if (again.success) setRows((again.data ?? []) as TransferListRow[]);
    });
  }

  const submitDisabled =
    isPending ||
    (kind === "hq_to_branch" && !toOpId) ||
    (kind === "branch_to_hq" && !fromOpId) ||
    (kind === "branch_to_branch" && (!b2bFrom || !b2bTo || b2bFrom === b2bTo));

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Luân chuyển nội bộ
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Trụ sở ↔ chi nhánh hoặc chi nhánh ↔ chi nhánh. Hàng từ NCC chỉ nhập
            tại Trụ sở (PO/GRN).
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!canCreate}
        >
          <Plus className="mr-2 size-4" />
          Tạo phiếu
        </Button>
      </div>

      {!canCreate && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Cần cấu hình Trụ sở và ít nhất một chi nhánh vận hành hoạt động.
        </p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Số phiếu</TableHead>
              <TableHead className="hidden md:table-cell">Từ</TableHead>
              <TableHead>Đến</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-12 text-center text-muted-foreground"
                >
                  Chưa có phiếu chuyển
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">
                  {r.transfer_number}
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {r.from_branch_name}
                </TableCell>
                <TableCell>{r.to_branch_name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/inventory/transfers/${r.id}`}>
                      Chi tiết
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Phiếu chuyển mới (nháp)</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Loại luân chuyển</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as TransferKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hq_to_branch">
                    Trụ sở → Chi nhánh
                  </SelectItem>
                  <SelectItem value="branch_to_hq">
                    Chi nhánh → Trụ sở
                  </SelectItem>
                  <SelectItem
                    value="branch_to_branch"
                    disabled={!canBranchToBranch}
                  >
                    Chi nhánh → Chi nhánh
                    {!canBranchToBranch ? " (cần ≥ 2 CN)" : ""}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {kind === "hq_to_branch" && (
              <div className="space-y-1.5">
                <Label>Chi nhánh nhận *</Label>
                <Select value={toOpId} onValueChange={setToOpId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn chi nhánh" />
                  </SelectTrigger>
                  <SelectContent>
                    {operational.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {kind === "branch_to_hq" && (
              <div className="space-y-1.5">
                <Label>Chi nhánh gửi *</Label>
                <Select value={fromOpId} onValueChange={setFromOpId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn chi nhánh" />
                  </SelectTrigger>
                  <SelectContent>
                    {operational.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {kind === "branch_to_branch" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Chi nhánh gửi *</Label>
                  <Select value={b2bFrom} onValueChange={setB2bFrom} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Từ" />
                    </SelectTrigger>
                    <SelectContent>
                      {operational.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Chi nhánh nhận *</Label>
                  <Select value={b2bTo} onValueChange={setB2bTo} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Đến" />
                    </SelectTrigger>
                    <SelectContent>
                      {operational.map((b) => (
                        <SelectItem
                          key={b.id}
                          value={String(b.id)}
                          disabled={b2bFrom !== "" && String(b.id) === b2bFrom}
                        >
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="vehicleInfo">Xe / người giao</Label>
              <Input id="vehicleInfo" name="vehicleInfo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Ghi chú</Label>
              <Input id="notes" name="notes" />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={submitDisabled}>
                {isPending ? "Đang tạo…" : "Tạo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
