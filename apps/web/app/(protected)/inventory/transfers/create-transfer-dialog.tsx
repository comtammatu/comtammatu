"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus as IconPlus,
  Trash as IconTrash,
  TriangleAlert as IconTriangleAlert,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
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
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { AppEmptyState, AppSection } from "@/components/surface";
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

function withBranchQuery(path: string, branchId: number | null) {
  return branchId == null ? path : `${path}?branchId=${branchId}`;
}

export function CreateTransferForm({
  branches,
  ingredients,
  locations,
  userBranchId,
  userRole,
  basePath = "/inventory/transfers",
}: {
  branches: BranchForTransfer[];
  ingredients: IngredientRow[];
  locations: InventoryLocation[];
  userBranchId: number | null;
  userRole: StaffRole;
  basePath?: string;
}) {
  const router = useRouter();
  const isBranchManager = userRole === "branch_manager";
  const operational = branches.filter(
    (branch) => (branch.branch_kind ?? "branch") === "branch",
  );
  const currentBranch =
    userBranchId == null
      ? null
      : (branches.find((branch) => branch.id === userBranchId) ?? null);
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
    const branch = branches.find((item) => item.id === userBranchId);
    return branch ? formatBranchSiteLabel(branch) : null;
  }, [branches, userBranchId]);

  const activeIngredients = useMemo(
    () => ingredients.filter((ingredient) => ingredient.is_active),
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
    const location = internalSourceLocations[0];
    return location ? String(location.id) : "";
  }, [internalSourceLocations]);
  const defaultInternalToLocationId = useMemo(() => {
    const location = internalKitchenLocations.find(
      (item) => String(item.id) !== defaultInternalFromLocationId,
    );
    return location ? String(location.id) : "";
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
        (location) => String(location.id) === intraToLocationId,
      ) ?? null,
    [internalKitchenLocations, intraToLocationId],
  );
  const selectedInternalKitchenWarning =
    selectedInternalKitchen &&
    selectedInternalKitchen.is_default_consumption !== true
      ? "Vị trí bếp này chưa được đánh dấu Bếp mặc định. Phiếu vẫn được tạo; hệ thống sẽ ghi cảnh báo vận hành để đội kho kiểm tra cấu hình."
      : null;

  useEffect(() => {
    if (slipKind !== "internal") return;
    setIntraFromLocationId((current) =>
      internalSourceLocations.some((location) => String(location.id) === current)
        ? current
        : defaultInternalFromLocationId,
    );
    setIntraToLocationId((current) =>
      internalKitchenLocations.some((location) => String(location.id) === current)
        ? current
        : defaultInternalToLocationId,
    );
  }, [
    defaultInternalFromLocationId,
    defaultInternalToLocationId,
    internalKitchenLocations,
    internalSourceLocations,
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
    const ingredientId = Number(pickerIngredientId);
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) {
      toast.error("Chọn nguyên liệu");
      return;
    }
    if (draftLines.some((line) => line.ingredientId === ingredientId)) {
      toast.error("Nguyên liệu đã có trong danh sách");
      return;
    }
    setDraftLines((current) => [
      ...current,
      {
        key: `${ingredient.id}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`,
        ingredientId: ingredient.id,
        name: ingredient.name,
        quantity: "",
        unit: getWarehouseUnit(ingredient),
      },
    ]);
    setPickerIngredientId("");
  }

  function removeLine(key: string) {
    setDraftLines((current) => current.filter((line) => line.key !== key));
  }

  function updateLine(
    key: string,
    patch: Partial<Pick<DraftLine, "quantity" | "unit">>,
  ) {
    setDraftLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function buildLinesPayload(
    lines: DraftLine[],
  ): { ingredientId: number; quantity: number; unit: string }[] | undefined {
    const out: { ingredientId: number; quantity: number; unit: string }[] = [];
    for (const line of lines) {
      const quantity = Number(line.quantity);
      const unit = line.unit.trim();
      if (!Number.isFinite(quantity) || quantity <= 0 || !unit) {
        toast.error("Kiểm tra số lượng và đơn vị cho từng dòng");
        return undefined;
      }
      out.push({ ingredientId: line.ingredientId, quantity, unit });
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
      const message =
        slipKind === "internal"
          ? "Đã cấp bếp"
          : slipKind === "inbound"
            ? "Đã tạo phiếu nhập"
            : "Đã tạo phiếu xuất";
      toast.success(message);
      resetForm();
      const id = (res.data as { id: number }).id;
      router.push(withBranchQuery(`${basePath}/${id}`, userBranchId));
      router.refresh();
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const notes = String(formData.get("notes") ?? "") || undefined;
    const vehicleInfo = String(formData.get("vehicleInfo") ?? "") || undefined;

    if (isBranchManager && slipKind !== "internal") {
      toast.error("Quản lý chi nhánh chỉ tạo Cấp bếp nội bộ.");
      return;
    }

    let fromId: number | undefined;
    let toId: number | undefined;
    let fromLocationId: number | undefined;
    let toLocationId: number | undefined;

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
      fromLocationId = Number(intraFromLocationId) || undefined;
      toLocationId = Number(intraToLocationId) || undefined;
      if (!fromLocationId || !toLocationId) {
        toast.error("Chọn vị trí kho gửi và kho nhận.");
        return;
      }
      if (fromLocationId === toLocationId) {
        toast.error("Vị trí gửi và nhận phải khác nhau.");
        return;
      }
      fromId = userBranchId;
      toId = userBranchId;
    } else if (slipKind === "inbound") {
      toId = userBranchId ?? (Number(inboundToBranchId) || undefined);
      fromId = Number(inboundFromBranchId) || undefined;
    } else {
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
      fromLocationId,
      toLocationId,
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
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
      <AppSection
        title={
          isBranchManager
            ? messages.inventory.transfer.createKitchenTitle
            : messages.inventory.transfer.createTransferTitle
        }
        contentClassName="gap-4"
      >
        <Tabs
          value={slipKind}
          onValueChange={(value) => {
            const next = value as SlipKind;
            if (next === "inbound" && !canCreateInbound) return;
            if (next === "outbound" && !canCreateOutbound) return;
            if (next === "internal" && !canInternalTransfer) return;
            setSlipKind(next);
          }}
        >
          <TabsList className={`grid w-full ${tabsGridClass}`}>
            {canCreateInbound ? (
              <TabsTrigger value="inbound">
                {messages.inventory.transfer.tabs.inbound}
              </TabsTrigger>
            ) : null}
            {canCreateOutbound ? (
              <TabsTrigger value="outbound">
                {messages.inventory.transfer.tabs.outbound}
              </TabsTrigger>
            ) : null}
            {canInternalTransfer ? (
              <TabsTrigger value="internal">
                {messages.inventory.transfer.tabs.internal}
              </TabsTrigger>
            ) : null}
          </TabsList>

          {canCreateInbound ? (
            <TabsContent value="inbound" className="pt-2">
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  {isUserOperational && myBranchName
                    ? messages.inventory.transfer.inboundToBranch(myBranchName)
                    : messages.inventory.transfer.inboundToSelected}
                </p>
                {!isUserOperational ? (
                  <div className="flex flex-col gap-1.5">
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
                        <SelectGroup>
                          {operational.map((branch) => (
                            <SelectItem
                              key={branch.id}
                              value={String(branch.id)}
                            >
                              {formatBranchSiteLabel(branch)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            </TabsContent>
          ) : null}

          <TabsContent value="outbound" className="pt-2">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {myBranchName
                  ? messages.inventory.transfer.outboundFromBranch(myBranchName)
                  : messages.inventory.transfer.outboundFromSelected}
              </p>
              <div className="flex flex-col gap-1.5">
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
                    <SelectGroup>
                      {outboundDestinationOptions.map((branch) => (
                        <SelectItem key={branch.id} value={String(branch.id)}>
                          {formatBranchSiteLabel(branch)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="internal" className="pt-2">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {messages.inventory.transfer.internalDescription}
              </p>
              {internalSetupMessage ? (
                <NoteCallout
                  tone="warning"
                  icon={<IconTriangleAlert />}
                  label={messages.inventory.transfer.internalUnavailableTitle}
                >
                  {internalSetupMessage}
                </NoteCallout>
              ) : null}
              <div className="flex flex-col gap-1.5">
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
                    <SelectGroup>
                      {internalSourceLocations.map((location) => (
                        <SelectItem
                          key={location.id}
                          value={String(location.id)}
                        >
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
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
                    <SelectGroup>
                      {internalKitchenLocations
                        .filter(
                          (location) =>
                            String(location.id) !== intraFromLocationId,
                        )
                        .map((location) => (
                          <SelectItem
                            key={location.id}
                            value={String(location.id)}
                          >
                            {location.name}
                            {location.is_default_consumption
                              ? messages.inventory.transfer.defaultKitchenSuffix
                              : ""}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {selectedInternalKitchenWarning ? (
                <NoteCallout
                  tone="warning"
                  icon={<IconTriangleAlert />}
                  label={messages.inventory.transfer.kitchenConfigReviewTitle}
                >
                  {selectedInternalKitchenWarning}
                </NoteCallout>
              ) : null}
            </div>
          </TabsContent>
        </Tabs>
      </AppSection>

      <AppSection title={messages.inventory.transfer.ingredientsQtyRequired}>
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
                <SelectGroup>
                  {activeIngredients.map((ingredient) => (
                    <SelectItem
                      key={ingredient.id}
                      value={String(ingredient.id)}
                      textValue={`${ingredient.name} ${getWarehouseUnit(
                        ingredient,
                      )} ${ingredient.id}`}
                    >
                      {ingredient.name} ({getWarehouseUnit(ingredient)})
                    </SelectItem>
                  ))}
                </SelectGroup>
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
            <IconPlus data-icon="inline-start" />
          </Button>
        </div>

        {draftLines.length === 0 ? (
          <AppEmptyState
            compact
            title={messages.inventory.transfer.emptyIngredientsTitle}
            description={messages.inventory.transfer.emptyIngredientsDescription}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {draftLines.map((line) => (
              <div
                key={line.key}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {line.name}
                </span>
                <FormattedNumberInput
                  className="h-8 w-20"
                  placeholder={messages.inventory.common.quantityShort}
                  value={line.quantity}
                  onValueChange={(value) =>
                    updateLine(line.key, { quantity: value })
                  }
                  maxFractionDigits={3}
                  required
                />
                <Input
                  className="h-8 w-16"
                  value={line.unit}
                  readOnly
                  aria-readonly="true"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  onClick={() => removeLine(line.key)}
                  aria-label={messages.inventory.transfer.removeLineAria}
                >
                  <IconTrash />
                </Button>
              </div>
            ))}
          </div>
        )}
      </AppSection>

      <AppSection title={FORM_VI.notes}>
        {slipKind !== "internal" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicleInfo">
              {messages.inventory.transfer.vehicleInfo}
            </Label>
            <Input id="vehicleInfo" name="vehicleInfo" />
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">{FORM_VI.notes}</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder={messages.inventory.transfer.notesPlaceholder}
            className="min-h-24"
          />
        </div>
        {isBranchManager ? (
          <p className="text-xs text-muted-foreground">
            {messages.inventory.transfer.branchManagerHint}
          </p>
        ) : null}
      </AppSection>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" asChild>
          <Link href={withBranchQuery(basePath, userBranchId)}>
            {ACTIONS_VI.cancel}
          </Link>
        </Button>
        <Button type="submit" disabled={submitDisabled}>
          {isPending
            ? messages.inventory.transfer.creating
            : messages.inventory.transfer.createSlip}
        </Button>
      </div>
    </form>
  );
}
