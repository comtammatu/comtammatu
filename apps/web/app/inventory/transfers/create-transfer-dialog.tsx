"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus as IconPlus, Trash as IconTrash } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { toast } from "@comtammatu/ui/components/sonner";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { FormattedNumberInput } from "../_components/formatted-number-input";
import { formatBranchSiteLabel } from "../_lib/branch-site-labels";
import { createStockTransfer } from "../transfer-actions";
import type { IngredientRow } from "../page";

export interface BranchForTransfer {
  id: number;
  name: string;
  branch_kind?: string | null;
  is_active: boolean;
}

export interface InventoryLocation {
  id: number;
  name: string;
  code: string;
  location_kind: string;
}

type SlipKind = "inbound" | "outbound" | "internal";
type OutboundDest = "hq" | "other_branch";

type DraftLine = {
  key: string;
  ingredientId: number;
  name: string;
  quantity: string;
  unit: string;
};

function getWarehouseUnit(ingredient: IngredientRow) {
  return ingredient.purchase_unit || ingredient.unit;
}

export function CreateTransferDialog({
  open,
  onOpenChange,
  branches,
  ingredients,
  locations,
  hqBranchId,
  userBranchId,
  userRole,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  branches: BranchForTransfer[];
  ingredients: IngredientRow[];
  locations: InventoryLocation[];
  hqBranchId: number | null;
  userBranchId: number | null;
  userRole: StaffRole;
  onCreated: (id: number) => void;
}) {
  const [slipKind, setSlipKind] = useState<SlipKind>("outbound");
  const [outboundDest, setOutboundDest] = useState<OutboundDest>("hq");
  const [outboundOtherBranchId, setOutboundOtherBranchId] = useState("");
  const [inboundFromBranchId, setInboundFromBranchId] = useState("");
  const [inboundToBranchId, setInboundToBranchId] = useState("");
  const [outboundToBranchId, setOutboundToBranchId] = useState("");
  const [intraFromLocationId, setIntraFromLocationId] = useState("");
  const [intraToLocationId, setIntraToLocationId] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [pickerIngredientId, setPickerIngredientId] = useState("");
  const [isPending, startTransition] = useTransition();

  const isProcurementBranch = (b: BranchForTransfer) =>
    b.branch_kind === "central_warehouse" ||
    b.branch_kind === "central_kitchen";
  const operational = branches.filter((b) => !isProcurementBranch(b));
  const canBranchToBranch = operational.length >= 2;
  const canInternalTransfer = userBranchId != null && locations.length >= 2;

  const isUserHq =
    hqBranchId != null && userBranchId != null && userBranchId === hqBranchId;
  const isUserOperational =
    hqBranchId != null && userBranchId != null && userBranchId !== hqBranchId;
  const isBranchManager =
    userRole === "branch_manager" ||
    userRole === "warehouse_manager" ||
    userRole === "production_manager";

  const myBranchName = useMemo(() => {
    if (userBranchId == null) return null;
    const branch = branches.find((b) => b.id === userBranchId);
    return branch ? formatBranchSiteLabel(branch) : null;
  }, [branches, userBranchId]);

  const activeIngredients = useMemo(
    () => ingredients.filter((i) => i.is_active),
    [ingredients],
  );

  function resetForm() {
    setSlipKind("outbound");
    setOutboundDest("hq");
    setOutboundOtherBranchId("");
    setInboundFromBranchId("");
    setInboundToBranchId("");
    setOutboundToBranchId("");
    setIntraFromLocationId("");
    setIntraToLocationId("");
    setDraftLines([]);
    setPickerIngredientId("");
  }

  function addIngredientLine() {
    const iid = Number(pickerIngredientId);
    const ing = ingredients.find((x) => x.id === iid);
    if (!ing) {
      toast.error("Chọn nguyên liệu");
      return;
    }
    if (draftLines.some((l) => l.ingredientId === iid)) {
      toast.error("Nguyên liệu đã có trong danh sách");
      return;
    }
    setDraftLines((prev) => [
      ...prev,
      {
        key: `${ing.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ingredientId: ing.id,
        name: ing.name,
        quantity: "",
        unit: getWarehouseUnit(ing),
      },
    ]);
    setPickerIngredientId("");
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

  function doCreate(
    fromBranchId: number,
    toBranchId: number,
    linesPayload: { ingredientId: number; quantity: number; unit: string }[],
    notes?: string,
    vehicleInfo?: string,
    fromLocationId?: number,
    toLocationId?: number,
  ) {
    startTransition(async () => {
      const res = await createStockTransfer({
        fromBranchId,
        toBranchId,
        fromLocationId,
        toLocationId,
        notes,
        vehicleInfo,
        lines: linesPayload,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không tạo được phiếu");
        return;
      }
      const msg =
        slipKind === "inbound" ? "Đã tạo phiếu nhập" : "Đã tạo phiếu xuất";
      toast.success(msg);
      onOpenChange(false);
      resetForm();
      const id = (res.data as { id: number }).id;
      onCreated(id);
    });
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const notes = String(fd.get("notes") ?? "") || undefined;
    const vehicleInfo = String(fd.get("vehicleInfo") ?? "") || undefined;

    const linesPayload = buildLinesPayload(draftLines);
    if (linesPayload === undefined) return;

    // Resolve fromBranchId / toBranchId based on slip direction
    let fromId: number | undefined;
    let toId: number | undefined;
    let fromLocId: number | undefined;
    let toLocId: number | undefined;

    if (slipKind === "internal") {
      if (!userBranchId) {
        toast.error("Tài khoản cần gắn với chi nhánh để chuyển nội bộ.");
        return;
      }
      fromLocId = Number(intraFromLocationId) || undefined;
      toLocId = Number(intraToLocationId) || undefined;
      if (!fromLocId || !toLocId) {
        toast.error("Chọn vị trí kho gửi và kho nhận.");
        return;
      }
      if (fromLocId === toLocId) {
        toast.error("Vị trí gửi và nhận phải khác nhau.");
        return;
      }
      fromId = userBranchId;
      toId = userBranchId;
    } else if (slipKind === "inbound") {
      // Inbound: receiving TO user's branch (or selected branch)
      toId = userBranchId ?? (Number(inboundToBranchId) || undefined);
      fromId = (Number(inboundFromBranchId) || hqBranchId) ?? undefined;
    } else {
      // Outbound: sending FROM user's branch (or HQ)
      fromId = userBranchId ?? hqBranchId ?? undefined;
      if (isUserOperational) {
        toId =
          outboundDest === "hq" && hqBranchId
            ? hqBranchId
            : Number(outboundOtherBranchId) || undefined;
      } else {
        toId = Number(outboundToBranchId) || undefined;
      }
    }

    if (!fromId || !toId) {
      toast.error("Chọn kho gửi và kho nhận.");
      return;
    }

    doCreate(
      fromId,
      toId,
      linesPayload,
      notes,
      vehicleInfo,
      fromLocId,
      toLocId,
    );
  }

  const submitDisabled =
    isPending ||
    (slipKind === "internal" &&
      (!intraFromLocationId ||
        !intraToLocationId ||
        intraFromLocationId === intraToLocationId)) ||
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
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) resetForm();
      }}
    >
      <DialogContent className="max-h-dvh overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo phiếu luân chuyển</DialogTitle>
          <DialogDescription>
            Chọn hướng luân chuyển, thêm nguyên liệu và nhập số lượng để tạo
            phiếu nháp trước khi xuất hoặc nhận kho.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {/* Step 1: Direction */}
          <Tabs
            value={slipKind}
            onValueChange={(v) => setSlipKind(v as SlipKind)}
          >
            <TabsList
              className={`grid w-full ${canInternalTransfer ? "grid-cols-3" : "grid-cols-2"}`}
            >
              <TabsTrigger value="inbound">Phiếu nhập</TabsTrigger>
              <TabsTrigger value="outbound">Phiếu xuất</TabsTrigger>
              {canInternalTransfer && (
                <TabsTrigger value="internal">Nội bộ</TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="inbound" className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                {isUserOperational && myBranchName
                  ? `Nhập từ Trụ sở về ${myBranchName}.`
                  : isUserHq
                    ? "Nhập từ kho vận hành về Trụ sở."
                    : "Nhập từ Trụ sở về kho được chọn."}
              </p>
              {!isUserOperational && !isUserHq && (
                <div className="space-y-1.5">
                  <Label>Kho nhận *</Label>
                  <Select
                    value={inboundToBranchId}
                    onValueChange={setInboundToBranchId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn kho" />
                    </SelectTrigger>
                    <SelectContent>
                      {operational.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {formatBranchSiteLabel(b)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {isUserHq && (
                <div className="space-y-1.5">
                  <Label>Kho gửi *</Label>
                  <Select
                    value={inboundFromBranchId}
                    onValueChange={setInboundFromBranchId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn kho gửi" />
                    </SelectTrigger>
                    <SelectContent>
                      {operational.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {formatBranchSiteLabel(b)}
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
                  : "Xuất từ Trụ sở — chọn kho nhận."}
              </p>
              {isUserOperational && userBranchId != null && (
                <>
                  <div className="space-y-1.5">
                    <Label>Kho nhận *</Label>
                    <Select
                      value={outboundDest}
                      onValueChange={(v) => setOutboundDest(v as OutboundDest)}
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
                          Kho vận hành khác
                          {!canBranchToBranch ? " (cần >= 2 kho)" : ""}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {outboundDest === "other_branch" && (
                    <div className="space-y-1.5">
                      <Label>Kho nhận *</Label>
                      <Select
                        value={outboundOtherBranchId}
                        onValueChange={setOutboundOtherBranchId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn kho" />
                        </SelectTrigger>
                        <SelectContent>
                          {operational
                            .filter((b) => b.id !== userBranchId)
                            .map((b) => (
                              <SelectItem key={b.id} value={String(b.id)}>
                                {formatBranchSiteLabel(b)}
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
                  <Label>Kho nhận *</Label>
                  <Select
                    value={outboundToBranchId}
                    onValueChange={setOutboundToBranchId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn kho nhận" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches
                        .filter(
                          (b) =>
                            b.is_active &&
                            b.id !== userBranchId &&
                            b.branch_kind !== "central_warehouse",
                        )
                        .map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {formatBranchSiteLabel(b)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </TabsContent>
            <TabsContent value="internal" className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                Chuyển hàng giữa hai vị trí kho trong cùng chi nhánh.
              </p>
              <div className="space-y-1.5">
                <Label>Vị trí gửi *</Label>
                <Select
                  value={intraFromLocationId}
                  onValueChange={setIntraFromLocationId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn vị trí kho gửi" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={String(loc.id)}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vị trí nhận *</Label>
                <Select
                  value={intraToLocationId}
                  onValueChange={setIntraToLocationId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn vị trí kho nhận" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations
                      .filter((loc) => String(loc.id) !== intraFromLocationId)
                      .map((loc) => (
                        <SelectItem key={loc.id} value={String(loc.id)}>
                          {loc.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>

          {/* Step 2: Ingredients — inline picker */}
          <div className="space-y-2">
            <Label>Nguyên liệu &amp; số lượng *</Label>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  value={pickerIngredientId}
                  onValueChange={setPickerIngredientId}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Chọn nguyên liệu…" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeIngredients.map((i) => (
                      <SelectItem
                        key={i.id}
                        value={String(i.id)}
                        textValue={`${i.name} ${getWarehouseUnit(i)} ${i.id}`}
                      >
                        {i.name} ({getWarehouseUnit(i)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={addIngredientLine}
                disabled={!pickerIngredientId}
                aria-label="Thêm nguyên liệu"
              >
                <IconPlus className="size-4" />
              </Button>
            </div>

            {draftLines.length === 0 ? (
              <Card className="rounded-lg border-dashed bg-muted/10">
                <CardContent className="py-6 text-center">
                  <div className="space-y-1.5">
                    <h3 className="text-2xl font-semibold">
                      Chưa có nguyên liệu
                    </h3>
                    <p className="max-w-md text-sm leading-6 text-muted-foreground mx-auto">
                      Thêm ít nhất một nguyên liệu để tạo phiếu luân chuyển.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {draftLines.map((l) => (
                  <div
                    key={l.key}
                    className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {l.name}
                    </span>
                    <FormattedNumberInput
                      className="h-8 w-20"
                      placeholder="SL"
                      value={l.quantity}
                      onValueChange={(value) =>
                        updateLine(l.key, { quantity: value })
                      }
                      maxFractionDigits={3}
                      required
                    />
                    <Input
                      className="h-8 w-16"
                      value={l.unit}
                      readOnly
                      aria-readonly="true"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      onClick={() => removeLine(l.key)}
                      aria-label="Xóa dòng"
                    >
                      <IconTrash className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vehicleInfo">Xe / người giao</Label>
            <Input id="vehicleInfo" name="vehicleInfo" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Ghi chú</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Ghi chú thêm cho phiếu luân chuyển"
              className="min-h-24"
            />
          </div>

          {isBranchManager && (
            <p className="text-xs text-muted-foreground">
              Tài khoản điểm vận hành: phiếu nhập chỉ nhận về kho của bạn; phiếu
              xuất chỉ gửi từ kho của bạn.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
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
  );
}
