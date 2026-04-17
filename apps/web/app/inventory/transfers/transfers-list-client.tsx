"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MoveRight, Plus, Search } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { cn } from "@comtammatu/ui";
import { fetchStockTransfers } from "../transfer-actions";
import { CreateTransferDialog } from "./create-transfer-dialog";
import type { BranchForTransfer } from "./create-transfer-dialog";
import type { IngredientRow } from "../page";
import { InventoryHeader } from "../_components/inventory-header";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";

export type { BranchForTransfer };

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

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: "Nháp", className: "bg-muted text-muted-foreground" },
  confirmed_ship: { label: "Đã xuất kho", className: "bg-info/10 text-info border-info/30" },
  in_transit: { label: "Đang vận chuyển", className: "bg-info/10 text-info border-info/30" },
  confirmed_receive: { label: "Đang kiểm nhận", className: "bg-warning/10 text-warning border-warning/30" },
  received: { label: "Đã nhận", className: "bg-success/10 text-success border-success/30" },
  cancelled: { label: "Đã hủy", className: "bg-destructive/10 text-destructive border-destructive/30" },
};

export function TransfersListClient({
  initial,
  branches,
  ingredients,
  hqBranchId,
  userBranchId,
  userRole,
  basePath = "/inventory/transfers",
}: {
  initial: TransferListRow[];
  branches: BranchForTransfer[];
  ingredients: IngredientRow[];
  hqBranchId: number | null;
  userBranchId: number | null;
  userRole: StaffRole;
  basePath?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const canCreate = branches.length >= 2;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter) list = list.filter((r) => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.transfer_number.toLowerCase().includes(q) ||
          r.from_branch_name.toLowerCase().includes(q) ||
          r.to_branch_name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, search, statusFilter]);

  function handleCreated(id: number) {
    fetchStockTransfers().then((res) => {
      if (res.success) setRows((res.data ?? []) as TransferListRow[]);
    });
    router.push(`${basePath}/${id}`);
  }

  return (
    <>
      <InventoryHeader
        title="Điều chuyển nội bộ"
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              Tạo phiếu
            </Button>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-7xl space-y-4">
          {/* Status filter buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={statusFilter === null ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(null)}
            >
              Tất cả
              <Badge variant="secondary" className="ml-2">{rows.length}</Badge>
            </Button>
            {Object.entries(STATUS_META).map(([key, meta]) => {
              const count = statusCounts[key] ?? 0;
              if (count === 0) return null;
              return (
                <Button
                  key={key}
                  variant={statusFilter === key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(statusFilter === key ? null : key)}
                >
                  {meta.label}
                  <Badge variant="secondary" className="ml-2">{count}</Badge>
                </Button>
              );
            })}
          </div>

          {/* Search */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Tìm số phiếu hoặc tên kho..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {filtered.length} / {rows.length}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Số phiếu</TableHead>
                    <TableHead>Lộ trình</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead>Ngày xuất / nhận</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableEmptyStateRow
                      colSpan={6}
                      title={
                        search || statusFilter
                          ? "Không tìm thấy phiếu nào"
                          : "Chưa có phiếu luân chuyển"
                      }
                    />
                  )}
                  {filtered.map((r) => {
                    const meta = STATUS_META[r.status] ?? {
                      label: r.status,
                      className: "bg-muted text-muted-foreground",
                    };
                    const dateDisplay = r.shipped_at
                      ? `Xuất: ${new Date(r.shipped_at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}`
                      : r.received_at
                        ? `Nhận: ${new Date(r.received_at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}`
                        : "—";

                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {r.transfer_number}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <span>{r.from_branch_name}</span>
                            <MoveRight className="size-3 text-muted-foreground" />
                            <span>{r.to_branch_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-xs", meta.className)}>
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {dateDisplay}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon-sm" asChild>
                            <Link href={`${basePath}/${r.id}`}>
                              <ArrowRight className="size-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      <CreateTransferDialog
        open={open}
        onOpenChange={setOpen}
        branches={branches}
        ingredients={ingredients}
        hqBranchId={hqBranchId}
        userBranchId={userBranchId}
        userRole={userRole}
        onCreated={handleCreated}
      />
    </>
  );
}
