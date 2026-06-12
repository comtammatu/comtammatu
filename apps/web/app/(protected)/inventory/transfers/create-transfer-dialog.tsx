"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Plus as IconPlus,
  Trash as IconTrash,
  TriangleAlert as IconTriangleAlert,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
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
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { toast } from "@comtammatu/ui/components/sonner";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { FormattedNumberInput } from "../_components/formatted-number-input";
import { formatBranchSiteLabel } from "../_lib/branch-site-labels";
import { createStockTransfer } from "../transfer-actions";
import type { IngredientRow } from "../page";
import { messages } from "@lib/messages";

import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
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
  is_default_consumption?: boolean | null;
}

type SlipKind = "inbound" | "outbound" | "internal";

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
  userBranchId,
  userRole,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  branches: BranchForTransfer[];
  ingredients: IngredientRow[];
  locations: InventoryLocation[];
  userBranchId: number | null;
  userRole: StaffRole;
  onCreated: (id: number) => void;
}) {
  const isBranchManager = userRole === "branch_manager";
  const operational = branches.filter(
    (b) => (b.branch_kind ?? "branch") === "branch",
  );
  const currentBranch =
    userBranchId == null
      ? null
      : (branches.find((b) => b.id === userBranchId) ?? null);
  const currentBranchKind = currentBranch?.branch_kind ?? null;
  const canCreateInbound = false;
  const canCreateOutbound =
    !isBranchManager && userBranchId != null && currentBranchKind === "branch";
  const canInternalTransfer =
    userBranchId != null &&
    currentBranchKind === "branch" &&
    locations.length >= 2;
  const initialSlipKind: SlipKind = isBranchManager
    ? "internal"
    : canCreateOutbound
      ? "outbound"
      : canInternalTransfer
        ? "internal"
        : "outbound";
  const [slipKind, setSlipKind] = useState<SlipKind>(initialSlipKind);
  const [inboundFromBranchId, setInboundFromBranchId] = useState("");
  const [inboundToBranchId, setInboundToBranchId] = useState("");
  const [outboundToBranchId, setOutboundToBranchId] = useState("");
  const [intraFromLocationId, setIntraFromLocationId] = useState("");
  const [intraToLocationId, setIntraToLocationId] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [pickerIngredientId, setPickerIngredientId] = useState("");
  const [isPending, startTransition] = useTransition();
  const tabCount =
    (canCreateInbound ? 1 : 0) +
    (canCreateOutbound ? 1 : 0) +
    (canInternalTransfer ? 1 : 0);
  const tabsGridClass =
    tabCount <= 1
      ? "grid-cols-1"
      : tabCount === 2
        ? "grid-cols-2"
        : "grid-cols-3";

  const isUserOperational = currentBranchKind === "branch";
  const outboundSourceBranchId = userBranchId;
  const outboundDestinationOptions = branches.filter((branch) => {
    if (!branch.is_active || branch.id === outboundSourceBranchId) return false;
    return (branch.branch_kind ?? "branch") === "branch";
  });

  const myBranchName = useMemo(() => {
    if (userBranchId == null) return null;
    const branch = branches.find((b) => b.id === userBranchId);
    return branch ? formatBranchSiteLabel(branch) : null;
  }, [branches, userBranchId]);

  const activeIngredients = useMemo(
    () => ingredients.filter((i) => i.is_active),
    [ingredients],
  );
  const internalSourceLocations = useMemo(
    () => locations.filter((item) => item.location_kind === "warehouse"),
    [locations],
  );
  const internalKitchenLocations = useMemo(
    () =>
      locations
        .filter((item) => item.location_kind === "kitchen")
        .sort(
          (a, b) =>
            Number(b.is_default_consumption === true) -
            Number(a.is_default_consumption === true),
        ),
    [locations],
  );
  const defaultInternalFromLocationId = useMemo(() => {
    const loc = internalSourceLocations[0];
    return loc ? String(loc.id) : "";
  }, [internalSourceLocations]);
  const defaultInternalToLocationId = useMemo(() => {
    const loc = internalKitchenLocations.find(
      (item) => String(item.id) !== defaultInternalFromLocationId,
    );
    return loc ? String(loc.id) : "";
  }, [internalKitchenLocations, defaultInternalFromLocationId]);
  const canSubmitInternalTransfer =
    defaultInternalFromLocationId.length > 0 &&
    defaultInternalToLocationId.length > 0;
  const internalSetupMessage = !defaultInternalFromLocationId
    ? "Chi nhánh chưa có vị trí kho gửi. Cần cấu hình kho chi nhánh trước khi Cấp bếp."
    : !defaultInternalToLocationId
      ? "Chi nhánh chưa có vị trí bếp nhận. Cần cấu hình một vị trí bếp trước khi Cấp bếp."
      : null;
  const selectedInternalKitchen = useMemo(
    () =>
      internalKitchenLocations.find(
        (loc) => String(loc.id) === intraToLocationId,
      ) ?? null,
    [internalKitchenLocations, intraToLocationId],
  );
  const selectedInternalKitchenWarning =
    selectedInternalKitchen &&
    selectedInternalKitchen.is_default_consumption !== true
      ? "Vị trí bếp này chưa được đánh dấu Bếp mặc định. Phiếu vẫn được tạo; hệ thống sẽ ghi cảnh báo vận hành để đội kho kiểm tra cấu hình."
      : null;

  useEffect(() => {
    if (!open || slipKind !== "internal") return;
    setIntraFromLocationId((current) =>
      internalSourceLocations.some((loc) => String(loc.id) === current)
        ? current
        : defaultInternalFromLocationId,
    );
    setIntraToLocationId((current) =>
      internalKitchenLocations.some((loc) => String(loc.id) === current)
        ? current
        : defaultInternalToLocationId,
    );
  }, [
    defaultInternalFromLocationId,
    defaultInternalToLocationId,
    internalKitchenLocations,
    internalSourceLocations,
    open,
    slipKind,
  ]);

  function resetForm() {
    setSlipKind(initialSlipKind);
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
        slipKind === "internal"
          ? "Đã cấp bếp"
          : slipKind === "inbound"
            ? "Đã tạo phiếu nhập"
            : "Đã tạo phiếu xuất";
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

    if (isBranchManager && slipKind !== "internal") {
      toast.error("Quản lý chi nhánh chỉ tạo Cấp bếp nội bộ.");
      return;
    }

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
      if (!canSubmitInternalTransfer) {
        toast.error(
          internalSetupMessage ?? "Chi nhánh chưa đủ cấu hình để tạo Cấp bếp.",
        );
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
      fromId = Number(inboundFromBranchId) || undefined;
    } else {
      // Transfer workflow is source-created; destination branch receives after transit.
      fromId = outboundSourceBranchId ?? undefined;
      toId = Number(outboundToBranchId) || undefined;
    }

    const linesPayload = buildLinesPayload(draftLines);
    if (linesPayload === undefined) return;

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
      (!canSubmitInternalTransfer ||
        !intraFromLocationId ||
        !intraToLocationId ||
        intraFromLocationId === intraToLocationId)) ||
    (slipKind === "outbound" && (!canCreateOutbound || !outboundToBranchId)) ||
    (slipKind === "inbound" && !isUserOperational && !inboundToBranchId) ||
    draftLines.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isBranchManager
              ? messages.inventory.transfer.createKitchenTitle
              : messages.inventory.transfer.createTransferTitle}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {/* Step 1: Direction */}
          <Tabs
            value={slipKind}
            onValueChange={(v) => {
              const next = v as SlipKind;
              if (next === "inbound" && !canCreateInbound) return;
              if (next === "outbound" && !canCreateOutbound) return;
              if (next === "internal" && !canInternalTransfer) return;
              setSlipKind(next);
            }}
          >
            <TabsList className={`grid w-full ${tabsGridClass}`}>
              {canCreateInbound && (
                <TabsTrigger value="inbound">
                  {messages.inventory.transfer.tabs.inbound}
                </TabsTrigger>
              )}
              {canCreateOutbound && (
                <TabsTrigger value="outbound">
                  {messages.inventory.transfer.tabs.outbound}
                </TabsTrigger>
              )}
              {canInternalTransfer && (
                <TabsTrigger value="internal">
                  {messages.inventory.transfer.tabs.internal}
                </TabsTrigger>
              )}
            </TabsList>
            {canCreateInbound && (
              <TabsContent value="inbound" className="space-y-3 pt-2">
                <p className="text-sm text-muted-foreground">
                  {isUserOperational && myBranchName
                    ? messages.inventory.transfer.inboundToBranch(myBranchName)
                    : messages.inventory.transfer.inboundToSelected}
                </p>
                {!isUserOperational && (
                  <div className="space-y-1.5">
                    <Label>
                      {messages.inventory.transfer.receivingWarehouseRequired}
                    </Label>
                    <Select
                      value={inboundToBranchId}
                      onValueChange={setInboundToBranchId}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            messages.inventory.transfer.chooseWarehouse
                          }
                        />
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
            )}
            <TabsContent value="outbound" className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                {myBranchName
                  ? messages.inventory.transfer.outboundFromBranch(myBranchName)
                  : messages.inventory.transfer.outboundFromSelected}
              </p>
              <div className="space-y-1.5">
                <Label>
                  {messages.inventory.transfer.receivingWarehouseRequired}
                </Label>
                <Select
                  value={outboundToBranchId}
                  onValueChange={setOutboundToBranchId}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        messages.inventory.transfer.chooseReceivingWarehouse
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {outboundDestinationOptions.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {formatBranchSiteLabel(b)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
            <TabsContent value="internal" className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                {messages.inventory.transfer.internalDescription}
              </p>
              {internalSetupMessage ? (
                <NoteCallout
                  tone="warning"
                  icon={<IconTriangleAlert className="size-4" />}
                  label={messages.inventory.transfer.internalUnavailableTitle}
                >
                  {internalSetupMessage}
                </NoteCallout>
              ) : null}
              <div className="space-y-1.5">
                <Label>
                  {messages.inventory.transfer.sourceLocationRequired}
                </Label>
                <Select
                  value={intraFromLocationId}
                  onValueChange={(value) => {
                    setIntraFromLocationId(value);
                    if (intraToLocationId === value) setIntraToLocationId("");
                  }}
                  disabled={!defaultInternalFromLocationId}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        messages.inventory.transfer.chooseSourceLocation
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {internalSourceLocations.map((loc) => (
                      <SelectItem key={loc.id} value={String(loc.id)}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  {messages.inventory.transfer.destinationLocationRequired}
                </Label>
                <Select
                  value={intraToLocationId}
                  onValueChange={setIntraToLocationId}
                  disabled={!defaultInternalToLocationId}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        messages.inventory.transfer.chooseDestinationLocation
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {internalKitchenLocations
                      .filter((loc) => String(loc.id) !== intraFromLocationId)
                      .map((loc) => (
                        <SelectItem key={loc.id} value={String(loc.id)}>
                          {loc.name}
                          {loc.is_default_consumption
                            ? messages.inventory.transfer.defaultKitchenSuffix
                            : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedInternalKitchenWarning ? (
                <NoteCallout
                  tone="warning"
                  icon={<IconTriangleAlert className="size-4" />}
                  label={messages.inventory.transfer.kitchenConfigReviewTitle}
                >
                  {selectedInternalKitchenWarning}
                </NoteCallout>
              ) : null}
            </TabsContent>
          </Tabs>

          {/* Step 2: Ingredients — inline picker */}
          <div className="space-y-2">
            <Label>{messages.inventory.transfer.ingredientsQtyRequired}</Label>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  value={pickerIngredientId}
                  onValueChange={setPickerIngredientId}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue
                      placeholder={messages.inventory.transfer.chooseIngredient}
                    />
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
                aria-label={messages.inventory.transfer.addIngredientAria}
              >
                <IconPlus className="size-4" />
              </Button>
            </div>

            {draftLines.length === 0 ? (
              <Card className="rounded-lg border-dashed bg-muted/10">
                <CardContent className="py-6 text-center">
                  <div className="space-y-1.5">
                    <h3 className="font-heading text-2xl font-semibold">
                      {messages.inventory.transfer.emptyIngredientsTitle}
                    </h3>
                    <p className="max-w-md text-sm leading-6 text-muted-foreground mx-auto">
                      {messages.inventory.transfer.emptyIngredientsDescription}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {draftLines.map((l) => (
                  <div
                    key={l.key}
                    className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {l.name}
                    </span>
                    <FormattedNumberInput
                      className="h-8 w-20"
                      placeholder={messages.inventory.common.quantityShort}
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
                      size="icon-sm"
                      className="shrink-0"
                      onClick={() => removeLine(l.key)}
                      aria-label={messages.inventory.transfer.removeLineAria}
                    >
                      <IconTrash className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {slipKind !== "internal" && (
            <div className="space-y-1.5">
              <Label htmlFor="vehicleInfo">
                {messages.inventory.transfer.vehicleInfo}
              </Label>
              <Input id="vehicleInfo" name="vehicleInfo" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="notes">{FORM_VI.notes}</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder={messages.inventory.transfer.notesPlaceholder}
              className="min-h-24"
            />
          </div>

          {isBranchManager && (
            <p className="text-xs text-muted-foreground">
              {messages.inventory.transfer.branchManagerHint}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              {isPending
                ? messages.inventory.transfer.creating
                : messages.inventory.transfer.createSlip}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
