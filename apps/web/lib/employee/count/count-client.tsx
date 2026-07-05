"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: employee inventory count slip keeps operational copy close to the workflow controls */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Send as IconSend, Warehouse as IconWarehouse } from "lucide-react";
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
import { toast } from "@comtammatu/ui/components/sonner";
import { AppEmptyState } from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";
import {
  EmployeeActionBar,
  EmployeeFrame,
  EmployeePanel,
  EmployeeStatusStrip,
} from "../components/employee-page";
import { submitCountSlip } from "./actions";
import type { CountLocationGroup, CountSlipHeader } from "./page";

interface CountSlipClientProps {
  branchId: number;
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

export function CountSlipClient({
  branchId,
  baseHref = "/br",
  groups,
  selectedLocationId,
  slipByLocation,
  prefill,
}: CountSlipClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

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

  // Re-seed the draft whenever the active location or its prefill changes.
  useEffect(() => {
    if (!activeGroup) {
      setDraft({});
      return;
    }
    const next: Record<number, DraftLine> = {};
    for (const assignment of activeGroup.assignments) {
      const prior = prefill[assignment.ingredientId];
      const baseUnit =
        assignment.countUnits.find((u) => u.isBase) ??
        assignment.countUnits[0] ??
        null;
      next[assignment.ingredientId] = {
        quantity: prior?.quantity ?? "",
        note: prior?.note ?? "",
        entryUnitId: prior?.entryUnitId ?? baseUnit?.unitId ?? null,
      };
    }
    setDraft(next);
  }, [activeGroup, prefill]);

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

            <ItemGroup className="gap-2">
              {activeGroup.assignments.map((assignment) => {
                const entry = draft[assignment.ingredientId];
                const inputId = `count-${assignment.ingredientId}`;
                return (
                  <Item
                    key={assignment.ingredientId}
                    variant="outline"
                    className="flex-col items-stretch gap-2 bg-card"
                  >
                    <ItemContent className="min-w-0">
                      <ItemTitle className="text-sm font-semibold">
                        {assignment.ingredientName}
                      </ItemTitle>
                      {assignment.measureUnit ? (
                        <ItemDescription className="text-xs">
                          Đơn vị: {assignment.measureUnit}
                        </ItemDescription>
                      ) : null}
                    </ItemContent>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={inputId}>Số đếm được</Label>
                        <div className="flex gap-2">
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
                            placeholder={assignment.measureUnit || "Số lượng"}
                            className="flex-1"
                          />
                          {assignment.countUnits.length > 0 ? (
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
                                className="w-24 shrink-0"
                                aria-label="Đơn vị"
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
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`${inputId}-note`}>Ghi chú</Label>
                        <Input
                          id={`${inputId}-note`}
                          value={entry?.note ?? ""}
                          disabled={locked || isPending}
                          onChange={(event) =>
                            updateLine(assignment.ingredientId, {
                              note: event.target.value,
                            })
                          }
                          placeholder="Tuỳ chọn"
                        />
                      </div>
                    </div>
                  </Item>
                );
              })}
            </ItemGroup>

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
