"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { toast } from "@comtammatu/ui/components/sonner";
import { fetchIngredientsForBranch } from "../actions";
import { createStockTransfer, fetchStockTransfers } from "../transfer-actions";
import { IngredientSearchDialog } from "./transfer-ingredient-dialog";
import type { IngredientRow } from "../page";

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

type SlipKind = "inbound" | "outbound";

type OutboundDest = "hq" | "other_branch";

type DraftLine = {
  key: string;
  ingredientId: number;
  name: string;
  quantity: string;
  unit: string;
};

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
  ingredients,
  hqBranchId,
  userBranchId,
  userRole,
}: {
  initial: TransferListRow[];
  branches: BranchForTransfer[];
  ingredients: IngredientRow[];
  hqBranchId: number | null;
  userBranchId: number | null;
  userRole: StaffRole;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [slipKind, setSlipKind] = useState<SlipKind>("outbound");
  const [outboundDest, setOutboundDest] = useState<OutboundDest>("hq");
  const [outboundOtherBranchId, setOutboundOtherBranchId] = useState("");
  const [inboundFromBranchId, setInboundFromBranchId] = useState("");
  const [inboundToBranchId, setInboundToBranchId] = useState("");
  const [outboundToBranchId, setOutboundToBranchId] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pickerIngredients, setPickerIngredients] =
    useState<IngredientRow[]>(ingredients);

  const hq = branches.find((b) => b.is_headquarters);
  const operational = branches.filter((b) => !b.is_headquarters);
  const canBranchToBranch = operational.length >= 2;

  const isUserHq =
    hqBranchId != null && userBranchId != null && userBranchId === hqBranchId;
  const isUserOperational =
    hqBranchId != null && userBranchId != null && userBranchId !== hqBranchId;
  const isBranchManager = userRole === "branch_manager";

  const stockFromBranchId = useMemo((): number | null => {
    if (hqBranchId == null) return null;
    if (slipKind === "inbound") {
      if (isUserOperational && userBranchId != null) {
        return hqBranchId;
      }
      if (isUserHq) {
        const f = Number(inboundFromBranchId);
        return f > 0 ? f : null;
      }
      if (Number(inboundToBranchId) > 0) {
        return hqBranchId;
      }
      return null;
    }
    if (isUserOperational && userBranchId != null) {
      return userBranchId;
    }
    if (Number(outboundToBranchId) > 0) {
      return hqBranchId;
    }
    return null;
  }, [
    slipKind,
    hqBranchId,
    isUserOperational,
    isUserHq,
    userBranchId,
    inboundFromBranchId,
    inboundToBranchId,
    outboundToBranchId,
  ]);

  useEffect(() => {
    if (stockFromBranchId == null) {
      setPickerIngredients([]);
      return;
    }
    let cancelled = false;
    void fetchIngredientsForBranch(stockFromBranchId).then((res) => {
      if (cancelled || !res.success) return;
      setPickerIngredients((res.data ?? []) as IngredientRow[]);
    });
    return () => {
      cancelled = true;
    };
  }, [stockFromBranchId]);

  const myBranchName = useMemo(() => {
    if (userBranchId == null) return null;
    return branches.find((b) => b.id === userBranchId)?.name ?? null;
  }, [branches, userBranchId]);

  const canCreate = Boolean(hq && operational.length >= 1);

  function resetForm() {
    setSlipKind("outbound");
    setOutboundDest("hq");
    setOutboundOtherBranchId("");
    setInboundFromBranchId("");
    setInboundToBranchId("");
    setOutboundToBranchId("");
    setDraftLines([]);
  }

  function addIngredientLine(ing: IngredientRow) {
    setDraftLines((prev) => [
      ...prev,
      {
        key: `${ing.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ingredientId: ing.id,
        name: ing.name,
        quantity: "",
        unit: ing.unit,
      },
    ]);
  }

  function removeLine(key: string) {
    setDraftLines((prev) => prev.filter((l) => l.key !== key));
  }

  function updateLine(
    key: string,
    patch: Partial<Pick<DraftLine, "quantity" | "unit">>,
  ) {
    setDraftLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function buildLinesPayload(
    lines: DraftLine[],
  ): { ingredientId: number; quantity: number; unit: string }[] | undefined {
    const out: { ingredientId: number; quantity: number; unit: string }[] = [];
    for (const l of lines) {
      const q = Number(l.quantity);
      const u = l.unit.trim();
      if (!Number.isFinite(q) || q <= 0 || !u) {
        toast.error("Kiểm tra số lượng và đơn vị cho từng dòng");
        return undefined;
      }
      out.push({ ingredientId: l.ingredientId, quantity: q, unit: u });
    }
    return out.length > 0 ? out : undefined;
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const notes = String(fd.get("notes") ?? "") || undefined;
    const vehicleInfo = String(fd.get("vehicleInfo") ?? "") || undefined;

    const linesPayload = buildLinesPayload(draftLines);
    if (linesPayload === undefined) {
      return;
    }

    if (slipKind === "inbound") {
      if (hqBranchId == null) {
        toast.error("Chưa cấu hình Trụ sở.");
        return;
      }
      if (isUserOperational && userBranchId != null) {
        startTransition(async () => {
          const res = await createStockTransfer({
            kind: "hq_to_branch",
            toBranchId: userBranchId,
            notes,
            vehicleInfo,
            lines: linesPayload,
          });
          if (!res.success || !res.data) {
            toast.error(res.error ?? "Không tạo được phiếu");
            return;
          }
          toast.success("Đã tạo phiếu nhập");
          setOpen(false);
          resetForm();
          const id = (res.data as { id: number }).id;
          const again = await fetchStockTransfers();
          if (again.success) setRows((again.data ?? []) as TransferListRow[]);
          router.push(`/admin/inventory/transfers/${id}`);
        });
        return;
      }

      if (isUserHq) {
        const f = Number(inboundFromBranchId);
        if (!f) {
          toast.error("Chọn chi nhánh gửi");
          return;
        }
        startTransition(async () => {
          const res = await createStockTransfer({
            kind: "branch_to_hq",
            fromBranchId: f,
            notes,
            vehicleInfo,
            lines: linesPayload,
          });
          if (!res.success || !res.data) {
            toast.error(res.error ?? "Không tạo được phiếu");
            return;
          }
          toast.success("Đã tạo phiếu nhập");
          setOpen(false);
          resetForm();
          const id = (res.data as { id: number }).id;
          const again = await fetchStockTransfers();
          if (again.success) setRows((again.data ?? []) as TransferListRow[]);
          router.push(`/admin/inventory/transfers/${id}`);
        });
        return;
      }

      const t = Number(inboundToBranchId);
      if (!t) {
        toast.error("Chọn chi nhánh nhận");
        return;
      }
      startTransition(async () => {
        const res = await createStockTransfer({
          kind: "hq_to_branch",
          toBranchId: t,
          notes,
          vehicleInfo,
          lines: linesPayload,
        });
        if (!res.success || !res.data) {
          toast.error(res.error ?? "Không tạo được phiếu");
          return;
        }
        toast.success("Đã tạo phiếu nhập");
        setOpen(false);
        resetForm();
        const id = (res.data as { id: number }).id;
        const again = await fetchStockTransfers();
        if (again.success) setRows((again.data ?? []) as TransferListRow[]);
        router.push(`/admin/inventory/transfers/${id}`);
      });
      return;
    }

    /* outbound */
    if (hqBranchId == null) {
      toast.error("Chưa cấu hình Trụ sở.");
      return;
    }

    if (isUserOperational && userBranchId != null) {
      if (outboundDest === "hq") {
        startTransition(async () => {
          const res = await createStockTransfer({
            kind: "branch_to_hq",
            fromBranchId: userBranchId,
            notes,
            vehicleInfo,
            lines: linesPayload,
          });
          if (!res.success || !res.data) {
            toast.error(res.error ?? "Không tạo được phiếu");
            return;
          }
          toast.success("Đã tạo phiếu xuất");
          setOpen(false);
          resetForm();
          const id = (res.data as { id: number }).id;
          const again = await fetchStockTransfers();
          if (again.success) setRows((again.data ?? []) as TransferListRow[]);
          router.push(`/admin/inventory/transfers/${id}`);
        });
        return;
      }
      const other = Number(outboundOtherBranchId);
      if (!other || other === userBranchId) {
        toast.error("Chọn chi nhánh nhận");
        return;
      }
      startTransition(async () => {
        const res = await createStockTransfer({
          kind: "branch_to_branch",
          fromBranchId: userBranchId,
          toBranchId: other,
          notes,
          vehicleInfo,
          lines: linesPayload,
        });
        if (!res.success || !res.data) {
          toast.error(res.error ?? "Không tạo được phiếu");
          return;
        }
        toast.success("Đã tạo phiếu xuất");
        setOpen(false);
        resetForm();
        const id = (res.data as { id: number }).id;
        const again = await fetchStockTransfers();
        if (again.success) setRows((again.data ?? []) as TransferListRow[]);
        router.push(`/admin/inventory/transfers/${id}`);
      });
      return;
    }

    /* HQ / tenant-wide */
    const to = Number(outboundToBranchId);
    if (!to) {
      toast.error("Chọn chi nhánh nhận");
      return;
    }
    startTransition(async () => {
      const res = await createStockTransfer({
        kind: "hq_to_branch",
        toBranchId: to,
        notes,
        vehicleInfo,
        lines: linesPayload,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không tạo được phiếu");
        return;
      }
      toast.success("Đã tạo phiếu xuất");
      setOpen(false);
      resetForm();
      const id = (res.data as { id: number }).id;
      const again = await fetchStockTransfers();
      if (again.success) setRows((again.data ?? []) as TransferListRow[]);
      router.push(`/admin/inventory/transfers/${id}`);
    });
  }

  const submitDisabled =
    isPending ||
    (slipKind === "outbound" &&
      isUserOperational &&
      outboundDest === "other_branch" &&
      (!outboundOtherBranchId ||
        outboundOtherBranchId === String(userBranchId ?? ""))) ||
    (slipKind === "outbound" && !isUserOperational && !outboundToBranchId) ||
    (slipKind === "inbound" &&
      !isUserOperational &&
      !isUserHq &&
      !inboundToBranchId) ||
    (slipKind === "inbound" && isUserHq && !inboundFromBranchId) ||
    draftLines.length === 0;

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
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

      <div className="rounded-md border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs uppercase tracking-wider font-semibold">Số phiếu</TableHead>
              <TableHead className="hidden md:table-cell text-xs uppercase tracking-wider font-semibold">Từ</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-semibold">Đến</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-semibold">Trạng thái</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/60">
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-16 text-center"
                >
                  <p className="text-sm font-medium text-muted-foreground">Chưa có phiếu luân chuyển</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">Nhấn &quot;Tạo phiếu&quot; để tạo phiếu luân chuyển đầu tiên</p>
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} className="hover:bg-muted/40 transition-colors">
                <TableCell className="font-mono text-sm">
                  {r.transfer_number}
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {r.from_branch_name}
                </TableCell>
                <TableCell>{r.to_branch_name}</TableCell>
                <TableCell>
                  <Badge className={
                    r.status === "received" ? "bg-success/10 text-success border-success/20" :
                    r.status === "in_transit" || r.status === "confirmed_ship" ? "bg-info/10 text-info border-info/20" :
                    r.status === "confirmed_receive" ? "bg-warning/10 text-warning border-warning/20" :
                    r.status === "cancelled" ? "bg-destructive/10 text-destructive border-destructive/20" :
                    "bg-muted text-muted-foreground"
                  }>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
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
        <DialogContent className="max-h-[min(92vh,900px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tạo phiếu luân chuyển</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Tabs
              value={slipKind}
              onValueChange={(v) => setSlipKind(v as SlipKind)}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="inbound">Phiếu nhập</TabsTrigger>
                <TabsTrigger value="outbound">Phiếu xuất</TabsTrigger>
              </TabsList>
              <TabsContent value="inbound" className="space-y-3 pt-2">
                <p className="text-sm text-muted-foreground">
                  {isUserOperational && myBranchName
                    ? `Nhập từ Trụ sở về ${myBranchName}.`
                    : isUserHq
                      ? "Nhập từ chi nhánh về Trụ sở."
                      : "Nhập từ Trụ sở về chi nhánh được chọn."}
                </p>
                {!isUserOperational && !isUserHq && (
                  <div className="space-y-1.5">
                    <Label>Chi nhánh nhận *</Label>
                    <Select
                      value={inboundToBranchId}
                      onValueChange={setInboundToBranchId}
                    >
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
                {isUserHq && (
                  <div className="space-y-1.5">
                    <Label>Chi nhánh gửi *</Label>
                    <Select
                      value={inboundFromBranchId}
                      onValueChange={setInboundFromBranchId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn chi nhánh gửi" />
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
              </TabsContent>
              <TabsContent value="outbound" className="space-y-3 pt-2">
                <p className="text-sm text-muted-foreground">
                  {isUserOperational && myBranchName
                    ? `Xuất từ ${myBranchName} — chọn kho nhận.`
                    : "Xuất từ Trụ sở — chọn chi nhánh nhận."}
                </p>
                {isUserOperational && userBranchId != null && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Kho nhận *</Label>
                      <Select
                        value={outboundDest}
                        onValueChange={(v) =>
                          setOutboundDest(v as OutboundDest)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hq">Trụ sở</SelectItem>
                          <SelectItem
                            value="other_branch"
                            disabled={!canBranchToBranch}
                          >
                            Chi nhánh khác
                            {!canBranchToBranch ? " (cần ≥ 2 CN)" : ""}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {outboundDest === "other_branch" && (
                      <div className="space-y-1.5">
                        <Label>Chi nhánh nhận *</Label>
                        <Select
                          value={outboundOtherBranchId}
                          onValueChange={setOutboundOtherBranchId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn chi nhánh" />
                          </SelectTrigger>
                          <SelectContent>
                            {operational
                              .filter((b) => b.id !== userBranchId)
                              .map((b) => (
                                <SelectItem key={b.id} value={String(b.id)}>
                                  {b.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}
                {!isUserOperational && (
                  <div className="space-y-1.5">
                    <Label>Chi nhánh nhận *</Label>
                    <Select
                      value={outboundToBranchId}
                      onValueChange={setOutboundToBranchId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn chi nhánh nhận" />
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
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Nguyên liệu &amp; số lượng *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                >
                  Chọn nguyên liệu…
                </Button>
              </div>
              {draftLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Thêm ít nhất một dòng từ bảng nguyên liệu (popup tìm kiếm đầy
                  đủ).
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nguyên liệu</TableHead>
                        <TableHead className="w-28">SL</TableHead>
                        <TableHead className="w-24">Đơn vị</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {draftLines.map((l) => (
                        <TableRow key={l.key}>
                          <TableCell className="font-medium">
                            {l.name}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              className="h-8"
                              value={l.quantity}
                              onChange={(e) =>
                                updateLine(l.key, {
                                  quantity: e.target.value,
                                })
                              }
                              required
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8"
                              value={l.unit}
                              onChange={(e) =>
                                updateLine(l.key, { unit: e.target.value })
                              }
                              required
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => removeLine(l.key)}
                              aria-label="Xóa dòng"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vehicleInfo">Xe / người giao</Label>
              <Input id="vehicleInfo" name="vehicleInfo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Ghi chú</Label>
              <Input id="notes" name="notes" />
            </div>

            {isBranchManager && (
              <p className="text-xs text-muted-foreground">
                Tài khoản chi nhánh: phiếu nhập chỉ nhận về kho của bạn; phiếu
                xuất chỉ gửi từ kho của bạn (trừ Trụ sở: xuất đi chi nhánh).
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={submitDisabled}>
                {isPending ? "Đang tạo…" : "Tạo phiếu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <IngredientSearchDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        ingredients={pickerIngredients}
        onPick={addIngredientLine}
      />
    </>
  );
}
