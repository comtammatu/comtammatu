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
  from_branch_id: number;
  to_branch_id: number;
  created_at: string;
  from_branch_name: string;
  to_branch_name: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  confirmed_ship: "Đã xuất TS",
  in_transit: "Đang VC",
  received: "Đã nhận",
  cancelled: "Đã hủy",
};

interface BranchOpt {
  id: number;
  name: string;
}

export function TransfersListClient({
  initial,
  destinationBranches,
}: {
  initial: TransferListRow[];
  destinationBranches: BranchOpt[];
}) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [toBranchId, setToBranchId] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const bid = Number(toBranchId || fd.get("toBranchId"));
    if (!bid) {
      toast.error("Chọn chi nhánh nhận");
      return;
    }
    startTransition(async () => {
      const res = await createStockTransfer({
        toBranchId: bid,
        notes: String(fd.get("notes") ?? "") || undefined,
        vehicleInfo: String(fd.get("vehicleInfo") ?? "") || undefined,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không tạo được phiếu");
        return;
      }
      toast.success("Đã tạo phiếu chuyển");
      setOpen(false);
      setToBranchId("");
      const again = await fetchStockTransfers();
      if (again.success) setRows((again.data ?? []) as TransferListRow[]);
    });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Luân chuyển Trụ sở → chi nhánh
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hàng từ NCC chỉ nhập tại Trụ sở; chi nhánh nhận qua phiếu chuyển nội
            bộ.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={destinationBranches.length === 0}
        >
          <Plus className="mr-2 size-4" />
          Tạo phiếu
        </Button>
      </div>

      {destinationBranches.length === 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Cần có ít nhất một chi nhánh hoạt động (không phải Trụ sở).
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Phiếu chuyển mới (nháp)</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Chi nhánh nhận *</Label>
              <Select value={toBranchId} onValueChange={setToBranchId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn chi nhánh" />
                </SelectTrigger>
                <SelectContent>
                  {destinationBranches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              <Button type="submit" disabled={isPending || !toBranchId}>
                {isPending ? "Đang tạo…" : "Tạo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
