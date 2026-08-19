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
import { ACTIONS_VI, FORM_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
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
import { FormattedNumberInput } from "@/components/form/formatted-number-input";
import {
  AppEmptyState,
  AppSheet,
} from "@/components/surface";
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
  CountAssignment,
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
    { quantity: string; entryUnitId: number | null; note: string }
  >;
}

interface DraftLine {
  quantity: string;
  note: string;
  entryUnitId: number | null;
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
      const line = {
        quantity: prior?.quantity ?? "",
        note: prior?.note ?? "",
        entryUnitId:
          prior?.entryUnitId ??
          getDefaultCountUnitChoice(assignment.countUnits)?.unitId ??
          null,
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
      const parsed = parseVietnameseNumericInput(entry?.quantity ?? "", {
        maxFractionDigits: 3,
      });
      return {
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

    return (
      <AppSheet
        side="right"
        size="md"
        open={assignment !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedIngredientId(null);
        }}
        title={assignment?.ingredientName ?? ""}
        contentClassName="overflow-hidden"
        headerClassName="[&_h2]:min-w-0 [&_h2]:break-words [&_h2]:pr-8"
        footer={
          <Button
            type="button"
            variant="outline"
            size="touch-lg"
            className="w-full"
            onClick={() => setSelectedIngredientId(null)}
          >
            {ACTIONS_VI.close}
          </Button>
        }
      >
        {assignment ? (
          <FieldGroup>
            <div
              className={
                assignment.countUnits.length > 0
                  ? "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end"
                  : undefined
              }
            >
              <Field>
                <FieldLabel htmlFor={inputId}>
                  {INVENTORY_VI.countedQtyHeader}
                </FieldLabel>
                <FormattedNumberInput
                  id={inputId}
                  inputMode="decimal"
                  autoComplete="off"
                  value={entry?.quantity ?? ""}
                  disabled={locked || isPending}
                  maxFractionDigits={3}
                  controlSize="touch"
                  className="tabular-nums"
                  onValueChange={(quantity) =>
                    updateLine(assignment.ingredientId, {
                      quantity,
                    })
                  }
                />
              </Field>
              {assignment.countUnits.length > 0 ? (
                <Field>
                  <FieldLabel htmlFor={unitInputId}>{FORM_VI.unit}</FieldLabel>
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
                      aria-label={`${FORM_VI.unit} ${assignment.ingredientName}`}
                    >
                      <SelectValue placeholder={FORM_VI.unit} />
                    </SelectTrigger>
                    <SelectContent>
                      {assignment.countUnits.map((unit) => (
                        <SelectItem
                          key={unit.unitId}
                          value={String(unit.unitId)}
                          size="touch"
                        >
                          {unit.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
            </div>
          </FieldGroup>
        ) : null}
      </AppSheet>
    );
  }

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
                  value: `${activeGroup.assignments.length} mục`,
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

            <ItemGroup className="grid grid-cols-2 gap-2">
              {activeGroup.assignments.map((assignment) => {
                const entry = draft[assignment.ingredientId];
                const summary = buildDraftSummary({
                  quantity: entry?.quantity ?? "",
                  entryUnitId: entry?.entryUnitId ?? null,
                  units: assignment.countUnits,
                });
                return (
                  <Item
                    key={assignment.ingredientId}
                    variant="outline"
                    className="min-h-24 cursor-pointer items-start gap-2 bg-card text-left hover:bg-muted/50"
                    render={
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedIngredientId(assignment.ingredientId)
                        }
                      />
                    }
                  >
                    <ItemContent className="min-w-0 gap-1">
                      <ItemTitle
                        size="heading"
                        className="line-clamp-none w-full break-words"
                      >
                        {assignment.ingredientName}
                      </ItemTitle>
                      {summary ? (
                        <ItemDescription className="line-clamp-none break-words text-xs">
                          {summary}
                        </ItemDescription>
                      ) : null}
                    </ItemContent>
                    <Badge variant={summary ? "success" : "secondary"}>
                      {summary ? "Đã nhập" : "Chưa đếm"}
                    </Badge>
                  </Item>
                );
              })}
            </ItemGroup>
            {renderIngredientSheet(selectedAssignment)}

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
