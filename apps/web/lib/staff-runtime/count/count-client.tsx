"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: employee inventory count slip keeps operational copy close to the workflow controls */

import {
  type ComponentProps,
  type ElementType,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Send as IconSend, Warehouse as IconWarehouse } from "lucide-react";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { parseVietnameseNumericInput } from "@comtammatu/shared/format";
import { FORM_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";

import { toast } from "@comtammatu/ui/components/sonner";
import { formatQty } from "@lib/inventory/format";
import { messages } from "@lib/messages";
import { NumberPadSheet } from "@/components/form/number-pad-sheet";
import { AppEmptyState } from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";
import {
  EmployeeActionBar,
  EmployeeFrame,
  EmployeePanel,
  EmployeeStatusStrip,
} from "../components/staff-runtime-page";
import {
  BranchOperatorActionBar,
  BranchOperatorFrame,
  BranchOperatorPanel,
  BranchOperatorStatusStrip,
} from "@lib/branch-operator/components/branch-operator-page";
import { submitCountSlip } from "./actions";
import type {
  CountLocationGroup,
  CountSlipHeader,
  CountUnitChoice,
} from "./page";

export type CountPlane = "employee" | "branch";

type CountTone = "default" | "success" | "warning" | "info" | "destructive";

type CountPanelComponent = (props: {
  title?: string;
  description?: string;
  headerHint?: ReactNode;
  icon?: ElementType;
  tone?: CountTone;
  badge?: { children: ReactNode; variant?: BadgeProps["variant"] };
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  size?: "default" | "sm";
}) => ReactNode;

type CountFrameComponent = (
  props: ComponentProps<"div"> & { pad?: "none" | "sm" },
) => ReactNode;

type CountActionBarComponent = (props: {
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}) => ReactNode;

type CountStatusStripComponent = (props: {
  items: Array<{
    label: string;
    value: ReactNode;
    muted?: boolean;
    mono?: boolean;
  }>;
  className?: string;
}) => ReactNode;

type CountRenderPrimitives = {
  Panel: CountPanelComponent;
  Frame: CountFrameComponent;
  ActionBar: CountActionBarComponent;
  StatusStrip: CountStatusStripComponent;
};

const EMPLOYEE_COUNT_PRIMITIVES: CountRenderPrimitives = {
  Panel: EmployeePanel,
  Frame: EmployeeFrame,
  ActionBar: EmployeeActionBar,
  StatusStrip: EmployeeStatusStrip,
};

const BRANCH_COUNT_PRIMITIVES: CountRenderPrimitives = {
  Panel: BranchOperatorPanel,
  Frame: BranchOperatorFrame,
  ActionBar: BranchOperatorActionBar,
  StatusStrip: BranchOperatorStatusStrip,
};

interface CountSlipClientProps {
  branchId: number;
  shiftId: number | null;
  baseHref: string;
  plane?: CountPlane;
  groups: CountLocationGroup[];
  selectedLocationId: number | null;
  slipByLocation: Record<number, CountSlipHeader>;
  prefill: Record<
    number,
    {
      lineId?: number;
      quantity: string;
      entryUnitId: number | null;
      note: string;
      recountRequired?: boolean;
      lastRecountRound?: number;
    }
  >;
}

interface DraftLine {
  lineId?: number;
  quantity: string;
  note: string;
  entryUnitId: number | null;
  recountRequired: boolean;
  lastRecountRound: number;
}

function parseDraftQuantity(value: string): number | null {
  const parsed = parseVietnameseNumericInput(value, { maxFractionDigits: 3 });
  return parsed.state === "valid" && parsed.value >= 0 ? parsed.value : null;
}

function formatCountQuantity(value: number): string {
  return formatQty(value);
}

function getBaseCountUnit(units: CountUnitChoice[]) {
  return units.find((unit) => unit.isBase) ?? units[0] ?? null;
}

function getDefaultCountUnitChoice(units: CountUnitChoice[]) {
  return getBaseCountUnit(units);
}

function getNextCountUnit(
  units: CountUnitChoice[],
  currentUnitId: number | null,
): CountUnitChoice | null {
  if (units.length === 0) return null;
  const currentIndex = units.findIndex((unit) => unit.unitId === currentUnitId);
  const nextIndex =
    currentIndex < 0 ? 0 : (currentIndex + 1) % units.length;
  return units[nextIndex] ?? units[0] ?? null;
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
      ? getDefaultCountUnitChoice(units)
      : (units.find((item) => item.unitId === entryUnitId) ??
        getDefaultCountUnitChoice(units));
  return `${formatCountQuantity(quantityValue)}${unit?.code ? ` ${unit.code}` : ""}`;
}

export function CountSlipClient({
  branchId,
  shiftId,
  baseHref,
  plane = "employee",
  groups,
  selectedLocationId,
  slipByLocation,
  prefill,
}: CountSlipClientProps) {
  const { Panel, Frame, ActionBar, StatusStrip } =
    plane === "branch" ? BRANCH_COUNT_PRIMITIVES : EMPLOYEE_COUNT_PRIMITIVES;
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
  const [selectedIngredientId, setSelectedIngredientId] = useState<
    number | null
  >(null);
  const ignoreSheetDismissRef = useRef(false);
  const selectedAssignment =
    activeGroup?.assignments.find(
      (assignment) => assignment.ingredientId === selectedIngredientId,
    ) ?? null;
  const countCopy = messages.employee.count;

  useEffect(() => {
    if (!activeGroup) {
      if (draftSeedKeyRef.current !== null) {
        draftSeedKeyRef.current = null;
        setDraft({});
      }
      return;
    }
    const next: Record<number, DraftLine> = {};
    const seedRows: Array<
      [number, number | undefined, string, number | null, string, boolean, number]
    > = [];
    for (const assignment of activeGroup.assignments) {
      const prior = prefill[assignment.ingredientId];
      const line = {
        lineId: prior?.lineId ?? assignment.lineId,
        quantity: prior?.quantity ?? "",
        note: prior?.note ?? "",
        entryUnitId:
          prior?.entryUnitId ??
          getDefaultCountUnitChoice(assignment.countUnits)?.unitId ??
          null,
        recountRequired:
          prior?.recountRequired ?? assignment.recountRequired ?? false,
        lastRecountRound:
          prior?.lastRecountRound ?? assignment.lastRecountRound ?? 0,
      };
      next[assignment.ingredientId] = line;
      seedRows.push([
        assignment.ingredientId,
        line.lineId,
        line.quantity,
        line.entryUnitId,
        line.note,
        line.recountRequired,
        line.lastRecountRound,
      ]);
    }
    const nextSeedKey = JSON.stringify([activeGroup.locationId, seedRows]);
    // Guard identical RSC refresh payloads; count inputs are local until submit.
    if (draftSeedKeyRef.current === nextSeedKey) return;
    draftSeedKeyRef.current = nextSeedKey;
    setDraft(next);
  }, [activeGroup, prefill]);

  useEffect(() => {
    if (selectedIngredientId === null || !activeGroup) return;
    const stillAssigned = activeGroup.assignments.some(
      (assignment) => assignment.ingredientId === selectedIngredientId,
    );
    if (!stillAssigned) setSelectedIngredientId(null);
  }, [selectedIngredientId, activeGroup]);

  function changeLocation(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("location", value);
    router.replace(`${baseHref}?${params.toString()}`);
  }

  function openIngredientSheet(ingredientId: number) {
    ignoreSheetDismissRef.current = true;
    setSelectedIngredientId(ingredientId);
    window.setTimeout(() => {
      ignoreSheetDismissRef.current = false;
    }, 400);
  }

  function handleSheetConfirm(value: number) {
    if (selectedIngredientId == null) return;
    updateLine(selectedIngredientId, {
      quantity: formatCountQuantity(value),
    });
    setSelectedIngredientId(null);
  }

  function cycleSelectedUnit() {
    if (selectedAssignment == null) return;
    const currentUnitId =
      draft[selectedAssignment.ingredientId]?.entryUnitId ??
      getDefaultCountUnitChoice(selectedAssignment.countUnits)?.unitId ??
      null;
    const next = getNextCountUnit(
      selectedAssignment.countUnits,
      currentUnitId,
    );
    if (next == null) return;
    updateLine(selectedAssignment.ingredientId, { entryUnitId: next.unitId });
  }

  function updateLine(ingredientId: number, patch: Partial<DraftLine>) {
    setDraft((current) => ({
      ...current,
      [ingredientId]: {
        lineId: current[ingredientId]?.lineId,
        quantity: current[ingredientId]?.quantity ?? "",
        note: current[ingredientId]?.note ?? "",
        entryUnitId: current[ingredientId]?.entryUnitId ?? null,
        recountRequired: current[ingredientId]?.recountRequired ?? false,
        lastRecountRound: current[ingredientId]?.lastRecountRound ?? 0,
        ...patch,
      },
    }));
  }

  function submit() {
    if (!activeGroup || selectedLocationId === null) return;

    const assignmentsToSubmit =
      slip?.status === "needs_changes"
        ? activeGroup.assignments.filter(
            (assignment) => draft[assignment.ingredientId]?.recountRequired,
          )
        : activeGroup.assignments;
    const lines = assignmentsToSubmit.map((assignment) => {
      const entry = draft[assignment.ingredientId];
      const parsed = parseVietnameseNumericInput(entry?.quantity ?? "", {
        maxFractionDigits: 3,
      });
      return {
        lineId: entry?.lineId,
        ingredientId: assignment.ingredientId,
        countedQuantity: parsed.state === "valid" ? parsed.value : Number.NaN,
        entryUnitId: entry?.entryUnitId ?? null,
        rawEmpty: parsed.state === "empty",
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
      toast.error(
        slip?.status === "needs_changes"
          ? "Nhập số đếm cho tất cả nguyên liệu cần đếm lại."
          : "Nhập số đếm cho tất cả nguyên liệu được giao.",
      );
      return;
    }

    startTransition(async () => {
      const result = await submitCountSlip({
        branchId,
        locationId: selectedLocationId,
        shiftId,
        ...(slip?.status === "needs_changes"
          ? { slipId: slip.id, recountRound: slip.recountRound }
          : {}),
        lines: lines.map((line) => ({
          lineId: line.lineId,
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

      toast.success(
        slip?.status === "needs_changes"
          ? `Đã gửi lại các nguyên liệu cần đếm lần ${slip.recountRound}.`
          : "Đã gửi phiếu kiểm kê — chờ duyệt.",
      );
      router.refresh();
    });
  }

  const locationOptions = groups.map((group) => ({
    value: String(group.locationId),
    label: group.locationName,
  }));
  const selectedEntry = selectedAssignment
    ? draft[selectedAssignment.ingredientId]
    : undefined;
  const selectedUnit =
    selectedAssignment == null
      ? null
      : selectedEntry?.entryUnitId == null
        ? getDefaultCountUnitChoice(selectedAssignment.countUnits)
        : (selectedAssignment.countUnits.find(
            (unit) => unit.unitId === selectedEntry.entryUnitId,
          ) ?? getDefaultCountUnitChoice(selectedAssignment.countUnits));
  const selectedQuantity = selectedEntry
    ? parseDraftQuantity(selectedEntry.quantity)
    : null;

  return (
    <>
      {groups.length > 1 ? (
        <Panel icon={IconWarehouse} title="Khu vực kiểm kê">
          <Select
            value={
              selectedLocationId !== null ? String(selectedLocationId) : ""
            }
            onValueChange={changeLocation}
          >
            <SelectTrigger size="touch" className="w-full">
              <SelectValue placeholder="Chọn kho" />
            </SelectTrigger>
            <SelectContent>
              {locationOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  size="touch"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Panel>
      ) : null}

      {!activeGroup ? (
        <Panel title={messages.employee.count.title}>
          <AppEmptyState
            title="Chọn kho để bắt đầu"
            description="Chọn kho ở trên để xem danh sách nguyên liệu cần đếm."
            icon={<IconWarehouse />}
          />
        </Panel>
      ) : (
        <Panel
          title={activeGroup.locationName}
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
            <StatusStrip
              items={[
                {
                  label: "Nguyên liệu",
                  value:
                    slip?.status === "needs_changes"
                      ? `${activeGroup.assignments.filter((assignment) => draft[assignment.ingredientId]?.recountRequired).length} mục cần đếm lại`
                      : `${activeGroup.assignments.length} mục`,
                },
              ]}
            />

            {slip?.status === "needs_changes" && slip.reviewNote ? (
              <Frame
                pad="sm"
                className="border-destructive/20 bg-destructive/10 text-sm leading-5"
              >
                <span className="font-medium">Quản lý yêu cầu đếm lại: </span>
                {slip.reviewNote}
              </Frame>
            ) : null}

            {locked ? (
              <Frame
                pad="sm"
                className="bg-muted/30 text-sm text-muted-foreground"
              >
                {slip?.status === "approved"
                  ? "Phiếu hôm nay đã được duyệt."
                  : "Phiếu đã gửi, đang chờ quản lý duyệt."}
              </Frame>
            ) : null}

            <ItemGroup className="gap-2">
              {activeGroup.assignments.map((assignment) => {
                const entry = draft[assignment.ingredientId];
                const summary = buildDraftSummary({
                  quantity: entry?.quantity ?? "",
                  entryUnitId: entry?.entryUnitId ?? null,
                  units: assignment.countUnits,
                });
                const canEdit =
                  !locked &&
                  (slip?.status !== "needs_changes" ||
                    entry?.recountRequired === true);
                return (
                  <Item
                    key={assignment.ingredientId}
                    variant="outline"
                    className="min-w-0 items-start gap-2 bg-card text-left hover:bg-muted/50"
                    render={
                      <button
                        type="button"
                        disabled={!canEdit || isPending}
                        onClick={() =>
                          openIngredientSheet(assignment.ingredientId)
                        }
                      />
                    }
                  >
                    <ItemContent className="min-w-0 gap-1">
                      <ItemTitle
                        size="heading"
                        className="block w-full min-w-0 max-w-full whitespace-normal break-words line-clamp-2"
                      >
                        {assignment.ingredientName}
                      </ItemTitle>
                      <ItemDescription className="min-w-0 max-w-full whitespace-normal break-words line-clamp-2 text-xs">
                        {summary ?? countCopy.tapToEnter}
                      </ItemDescription>
                    </ItemContent>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {slip?.status === "needs_changes" ? (
                        <Badge
                          variant={
                            entry?.recountRequired ? "warning" : "outline"
                          }
                        >
                          {entry?.recountRequired
                            ? INVENTORY_VI.recountRequiredBadge
                            : INVENTORY_VI.recountAcceptedBadge}
                        </Badge>
                      ) : (
                        <Badge variant={summary ? "success" : "secondary"}>
                          {summary ? countCopy.entered : countCopy.notCounted}
                        </Badge>
                      )}
                      {(entry?.lastRecountRound ?? 0) > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {INVENTORY_VI.recountCompletedRound(
                            entry?.lastRecountRound ?? 0,
                          )}
                        </span>
                      ) : null}
                    </div>
                  </Item>
                );
              })}
            </ItemGroup>
            <NumberPadSheet
              open={selectedAssignment !== null}
              onOpenChange={(open) => {
                if (!open && !ignoreSheetDismissRef.current) {
                  setSelectedIngredientId(null);
                }
              }}
              title={selectedAssignment?.ingredientName ?? ""}
              suffix={selectedUnit?.code || selectedUnit?.label}
              onSuffixClick={
                (selectedAssignment?.countUnits.length ?? 0) > 1
                  ? cycleSelectedUnit
                  : undefined
              }
              suffixAriaLabel={
                selectedUnit
                  ? `${FORM_VI.unit} ${selectedUnit.code || selectedUnit.label}. ${countCopy.cycleUnit}`
                  : countCopy.cycleUnit
              }
              initialValue={selectedQuantity}
              allowDecimal
              onConfirm={handleSheetConfirm}
            />

            {!locked ? (
              <ActionBar>
                <Button
                  type="button"
                  size="touch-lg"
                  className="w-full"
                  disabled={isPending}
                  onClick={submit}
                >
                  <IconSend data-icon="inline-start" />
                  {slip?.status === "needs_changes"
                    ? "Gửi lại phiếu"
                    : "Gửi phiếu"}
                </Button>
              </ActionBar>
            ) : null}
          </div>
        </Panel>
      )}
    </>
  );
}
