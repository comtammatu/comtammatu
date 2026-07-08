"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: employee inventory count slip keeps operational copy close to the workflow controls */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Send as IconSend, Warehouse as IconWarehouse } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { AppEmptyState } from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";
import {
  EmployeeActionBar,
  EmployeeFrame,
  EmployeePanel,
  EmployeeStatusStrip,
} from "../components/staff-runtime-page";
import { submitCountSlip } from "./actions";
import type {
  CountAssignment,
  CountLocationGroup,
  CountSlipHeader,
  CountUnitChoice,
} from "./page";

interface CountSlipClientProps {
  branchId: number;
  shiftId: number | null;
  baseHref?: string;
  groups: CountLocationGroup[];
  selectedLocationId: number | null;
  slipByLocation: Record<number, CountSlipHeader>;
  prefill: Record<
    number,
    { quantity: string; entryUnitId: number | null; note: string }
  >;
}

interface DraftLine {
  quantity: string;
  note: string;
  entryUnitId: number | null;
}

function parseDraftQuantity(value: string): number | null {
  const raw = value.trim().replace(",", ".");
  if (raw.length === 0) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatCountQuantity(value: number): string {
  return value % 1 === 0
    ? value.toLocaleString("vi-VN")
    : value.toLocaleString("vi-VN", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 3,
      });
}

function getBaseCountUnit(units: CountUnitChoice[]) {
  return units.find((unit) => unit.isBase) ?? units[0] ?? null;
}

function buildCountUnitPreview({
  quantity,
  entryUnitId,
  units,
}: {
  quantity: string;
  entryUnitId: number | null;
  units: CountUnitChoice[];
}): string | null {
  const baseUnit = getBaseCountUnit(units);
  const entryUnit =
    entryUnitId == null
      ? null
      : (units.find((unit) => unit.unitId === entryUnitId) ?? null);
  if (!baseUnit || !entryUnit || baseUnit.unitId === entryUnit.unitId) {
    return null;
  }

  const quantityValue = parseDraftQuantity(quantity);
  const factor = entryUnit.toBaseFactor;
  if (
    quantityValue === null ||
    factor === null ||
    !Number.isFinite(factor)
  ) {
    return null;
  }

  return `${formatCountQuantity(quantityValue)} ${entryUnit.code} = ${formatCountQuantity(quantityValue * factor)} ${baseUnit.code}`;
}

function buildDraftSummary({
  quantity,
  entryUnitId,
  units,
}: {
  quantity: string;
  entryUnitId: number | null;
  units: CountUnitChoice[];
}): string | null {
  const quantityValue = parseDraftQuantity(quantity);
  if (quantityValue === null) return null;
  const unit =
    entryUnitId == null
      ? getBaseCountUnit(units)
      : (units.find((item) => item.unitId === entryUnitId) ??
        getBaseCountUnit(units));
  return `${formatCountQuantity(quantityValue)}${unit?.code ? ` ${unit.code}` : ""}`;
}

export function CountSlipClient({
  branchId,
  shiftId,
  baseHref = "/br",
  groups,
  selectedLocationId,
  slipByLocation,
  prefill,
}: CountSlipClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const draftSeedKeyRef = useRef<string | null>(null);

  const activeGroup = useMemo(
    () =>
      groups.find((group) => group.locationId === selectedLocationId) ?? null,
    [groups, selectedLocationId],
  );

  const slip =
    selectedLocationId !== null
      ? (slipByLocation[selectedLocationId] ?? null)
      : null;
  const slipMeta = slip ? getStatusBadgeMeta("count-slip", slip.status) : null;
  const locked = slip?.status === "submitted" || slip?.status === "approved";

  const [draft, setDraft] = useState<Record<number, DraftLine>>({});
  const [selectedIngredientId, setSelectedIngredientId] = useState<number | null>(
    null,
  );
  const selectedAssignment =
    activeGroup?.assignments.find(
      (assignment) => assignment.ingredientId === selectedIngredientId,
    ) ?? null;

  useEffect(() => {
    if (!activeGroup) {
      if (draftSeedKeyRef.current !== null) {
        draftSeedKeyRef.current = null;
        setDraft({});
      }
      return;
    }
    const next: Record<number, DraftLine> = {};
    const seedRows: Array<[number, string, number | null, string]> = [];
    for (const assignment of activeGroup.assignments) {
      const prior = prefill[assignment.ingredientId];
      const baseUnit = getBaseCountUnit(assignment.countUnits);
      const line = {
        quantity: prior?.quantity ?? "",
        note: prior?.note ?? "",
        entryUnitId: prior?.entryUnitId ?? baseUnit?.unitId ?? null,
      };
      next[assignment.ingredientId] = line;
      seedRows.push([
        assignment.ingredientId,
        line.quantity,
        line.entryUnitId,
        line.note,
      ]);
    }
    const nextSeedKey = JSON.stringify([activeGroup.locationId, seedRows]);
    // Guard identical RSC refresh payloads; count inputs are local until submit.
    if (draftSeedKeyRef.current === nextSeedKey) return;
    draftSeedKeyRef.current = nextSeedKey;
    setDraft(next);
  }, [activeGroup, prefill]);

  useEffect(() => {
    if (selectedIngredientId !== null && !selectedAssignment) {
      setSelectedIngredientId(null);
    }
  }, [selectedIngredientId, selectedAssignment]);

  function changeLocation(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("location", value);
    router.replace(`${baseHref}?${params.toString()}`);
  }

  function updateLine(ingredientId: number, patch: Partial<DraftLine>) {
    setDraft((current) => ({
      ...current,
      [ingredientId]: {
        quantity: current[ingredientId]?.quantity ?? "",
        note: current[ingredientId]?.note ?? "",
        entryUnitId: current[ingredientId]?.entryUnitId ?? null,
        ...patch,
      },
    }));
  }

  function submit() {
    if (!activeGroup || selectedLocationId === null) return;

    const lines = activeGroup.assignments.map((assignment) => {
      const entry = draft[assignment.ingredientId];
      const raw = (entry?.quantity ?? "").trim().replace(",", ".");
      return {
        ingredientId: assignment.ingredientId,
        countedQuantity: Number(raw),
        entryUnitId: entry?.entryUnitId ?? null,
        rawEmpty: raw.length === 0,
        note: entry?.note.trim() || undefined,
      };
    });

    const invalid = lines.some(
      (line) =>
        line.rawEmpty ||
        !Number.isFinite(line.countedQuantity) ||
        line.countedQuantity < 0,
    );
    if (invalid) {
      toast.error("Nhập số đếm cho tất cả nguyên liệu được giao.");
      return;
    }

    startTransition(async () => {
      const result = await submitCountSlip({
        branchId,
        locationId: selectedLocationId,
        shiftId,
        lines: lines.map((line) => ({
          ingredientId: line.ingredientId,
          countedQuantity: line.countedQuantity,
          entryUnitId: line.entryUnitId,
          note: line.note,
        })),
      });

      if (!result.success) {
        toast.error(result.error ?? "Không thể gửi phiếu kiểm kê.");
        return;
      }

      toast.success("Đã gửi phiếu kiểm kê — chờ duyệt.");
      router.refresh();
    });
  }

  const locationOptions = groups.map((group) => ({
    value: String(group.locationId),
    label: group.locationName,
  }));

  function renderIngredientSheet(assignment: CountAssignment | null) {
    const entry = assignment ? draft[assignment.ingredientId] : undefined;
    const inputId = assignment ? `count-${assignment.ingredientId}` : "count";
    const unitInputId = `${inputId}-unit`;
    const baseUnit = assignment ? getBaseCountUnit(assignment.countUnits) : null;
    const selectedUnit =
      assignment == null
        ? null
        : entry?.entryUnitId == null
          ? baseUnit
          : (assignment.countUnits.find(
              (unit) => unit.unitId === entry.entryUnitId,
            ) ?? baseUnit);
    const quantityPlaceholder = selectedUnit?.code
      ? `VD: 5 ${selectedUnit.code}`
      : "VD: 5";
    const unitPreview = assignment
      ? buildCountUnitPreview({
          quantity: entry?.quantity ?? "",
          entryUnitId: entry?.entryUnitId ?? null,
          units: assignment.countUnits,
        })
      : null;

    return (
      <Sheet
        open={assignment !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedIngredientId(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-hidden sm:max-w-md">
          {assignment ? (
            <>
              <SheetHeader>
                <SheetTitle className="min-w-0 break-words pr-8">
                  {assignment.ingredientName}
                </SheetTitle>
                <SheetDescription>
                  {baseUnit?.code
                    ? `Tồn so theo: ${baseUnit.code}`
                    : "Nhập số đếm thực tế."}
                </SheetDescription>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
                <div
                  className={
                    assignment.countUnits.length > 0
                      ? "grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(7.5rem,9rem)]"
                      : "grid gap-2"
                  }
                >
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={inputId}>Số đếm được</Label>
                    <Input
                      id={inputId}
                      inputMode="decimal"
                      autoComplete="off"
                      value={entry?.quantity ?? ""}
                      disabled={locked || isPending}
                      onChange={(event) =>
                        updateLine(assignment.ingredientId, {
                          quantity: event.target.value,
                        })
                      }
                      placeholder={quantityPlaceholder}
                      className="min-h-12 text-base tabular-nums md:text-sm"
                    />
                  </div>
                  {assignment.countUnits.length > 0 ? (
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <Label htmlFor={unitInputId}>Đơn vị đếm</Label>
                      <Select
                        value={
                          entry?.entryUnitId != null
                            ? String(entry.entryUnitId)
                            : ""
                        }
                        onValueChange={(value) =>
                          updateLine(assignment.ingredientId, {
                            entryUnitId: Number(value),
                          })
                        }
                        disabled={locked || isPending}
                      >
                        <SelectTrigger
                          id={unitInputId}
                          size="touch"
                          className="w-full min-w-0"
                          aria-label={`Đơn vị đếm ${assignment.ingredientName}`}
                        >
                          <SelectValue placeholder="Đơn vị" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignment.countUnits.map((unit) => (
                            <SelectItem
                              key={unit.unitId}
                              value={String(unit.unitId)}
                            >
                              {unit.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
                {unitPreview ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    So sánh tồn:{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {unitPreview}
                    </span>
                  </p>
                ) : null}
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={`${inputId}-note`}>Ghi chú</Label>
                  <Textarea
                    id={`${inputId}-note`}
                    value={entry?.note ?? ""}
                    disabled={locked || isPending}
                    maxLength={500}
                    onChange={(event) =>
                      updateLine(assignment.ingredientId, {
                        note: event.target.value,
                      })
                    }
                    placeholder="Ví dụ: bao rách, thiếu 1 chai..."
                    className="min-h-24 text-base md:text-sm"
                  />
                </div>
              </div>
              <SheetFooter>
                <SheetClose asChild>
                  <Button type="button" variant="outline" size="touch">
                    Xong
                  </Button>
                </SheetClose>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      {groups.length > 1 ? (
        <EmployeePanel
          icon={IconWarehouse}
          title="Khu vực kiểm kê"
          description="Chọn kho bạn đang đếm."
        >
          <Select
            value={
              selectedLocationId !== null ? String(selectedLocationId) : ""
            }
            onValueChange={changeLocation}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Chọn kho" />
            </SelectTrigger>
            <SelectContent>
              {locationOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </EmployeePanel>
      ) : null}

      {!activeGroup ? (
        <EmployeePanel title="Kiểm kê tồn">
          <AppEmptyState
            title="Chọn kho để bắt đầu"
            description="Chọn kho ở trên để xem danh sách nguyên liệu cần đếm."
            icon={<IconWarehouse />}
          />
        </EmployeePanel>
      ) : (
        <EmployeePanel
          title={activeGroup.locationName}
          description="Nhập số đếm được cho từng nguyên liệu."
          badge={
            slipMeta
              ? {
                  children: slipMeta.label,
                  variant: slipMeta.variant,
                }
              : undefined
          }
        >
          <div className="flex flex-col gap-3">
            <EmployeeStatusStrip
              items={[
                {
                  label: "Nguyên liệu",
                  value: `${activeGroup.assignments.length} mục`,
                },
                {
                  label: "Trạng thái",
                  value: slipMeta ? slipMeta.label : "Chưa gửi",
                  muted: !slip,
                },
              ]}
            />

            {slip?.status === "needs_changes" && slip.reviewNote ? (
              <EmployeeFrame
                pad="sm"
                className="border-destructive/30 bg-destructive/5 text-sm leading-5"
              >
                <span className="font-medium">Quản lý yêu cầu đếm lại: </span>
                {slip.reviewNote}
              </EmployeeFrame>
            ) : null}

            {locked ? (
              <EmployeeFrame
                pad="sm"
                className="bg-muted/30 text-sm text-muted-foreground"
              >
                {slip?.status === "approved"
                  ? "Phiếu hôm nay đã được duyệt."
                  : "Phiếu đã gửi, đang chờ quản lý duyệt."}
              </EmployeeFrame>
            ) : null}

            <ItemGroup className="grid grid-cols-2 gap-2">
              {activeGroup.assignments.map((assignment) => {
                const entry = draft[assignment.ingredientId];
                const baseUnit = getBaseCountUnit(assignment.countUnits);
                const summary = buildDraftSummary({
                  quantity: entry?.quantity ?? "",
                  entryUnitId: entry?.entryUnitId ?? null,
                  units: assignment.countUnits,
                });
                const stockUnitLabel = baseUnit?.code ?? null;
                return (
                  <Item
                    asChild
                    key={assignment.ingredientId}
                    variant="outline"
                    className="min-h-24 cursor-pointer items-start gap-2 bg-card text-left hover:bg-muted/50"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedIngredientId(assignment.ingredientId)
                      }
                    >
                      <ItemContent className="min-w-0 gap-1">
                        <ItemTitle className="line-clamp-none w-full break-words text-sm font-semibold">
                          {assignment.ingredientName}
                        </ItemTitle>
                        <ItemDescription className="line-clamp-none break-words text-xs">
                          {summary ??
                            (stockUnitLabel
                              ? `Tồn so theo: ${stockUnitLabel}`
                              : "Chưa nhập")}
                        </ItemDescription>
                      </ItemContent>
                      <Badge variant={summary ? "success" : "secondary"}>
                        {summary ? "Đã nhập" : "Chưa đếm"}
                      </Badge>
                    </button>
                  </Item>
                );
              })}
            </ItemGroup>
            {renderIngredientSheet(selectedAssignment)}

            {!locked ? (
              <EmployeeActionBar>
                <Button
                  type="button"
                  size="touch"
                  className="w-full sm:w-fit"
                  disabled={isPending}
                  onClick={submit}
                >
                  <IconSend data-icon="inline-start" />
                  {slip?.status === "needs_changes"
                    ? "Gửi lại phiếu"
                    : "Gửi phiếu"}
                </Button>
              </EmployeeActionBar>
            ) : null}
          </div>
        </EmployeePanel>
      )}
    </>
  );
}
