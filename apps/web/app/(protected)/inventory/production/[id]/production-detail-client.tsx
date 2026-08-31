/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { Item } from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { Alert, AlertDescription, AlertTitle } from "@comtammatu/ui/components/alert";
import { confirm } from "@/components/confirm-dialog";
import { QuantityInput } from "@/components/form/domain-number-inputs";
import { AppDialog } from "@/components/form";
import {
  AppSection,
  DescriptionList,
} from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import {
  formatDateTime,
  formatQty,
  formatSmartQuantityUnit,
  formatVND,
} from "@lib/inventory/format";
import { formatPercent } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  cancelProductionRun,
  completeProductionRun,
  fetchProductionRunById,
  startProductionRun,
  type ProductionRunRow,
} from "../../production-run-actions";
import type { ProductionShortageRow } from "../../production-types";

const detailCopy = messages.inventory.productionDetail;

export function ProductionDetailClient({
  run: initialRun,
  presentation = "dialog",
  onClose,
  onRunReloaded,
}: {
  run: ProductionRunRow;
  presentation?: "page" | "dialog";
  onClose?: () => void;
  onRunReloaded?: (run: ProductionRunRow) => void;
}) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [isPending, startTransition] = useTransition();
  const [actualOutput, setActualOutput] = useState(
    initialRun.actual_quantity == null
      ? String(initialRun.planned_quantity)
      : String(initialRun.actual_quantity),
  );
  const [actualIngredients, setActualIngredients] = useState<
    Record<number, string>
  >(() =>
    Object.fromEntries(
      initialRun.lines.map((line) => [
        line.ingredient_id,
        String(line.actual_quantity ?? line.planned_quantity),
      ]),
    ),
  );
  const [shortages, setShortages] = useState<ProductionShortageRow[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setRun(initialRun);
    setActualOutput(
      initialRun.actual_quantity == null
        ? String(initialRun.planned_quantity)
        : String(initialRun.actual_quantity),
    );
    setActualIngredients(
      Object.fromEntries(
        initialRun.lines.map((line) => [
          line.ingredient_id,
          String(line.actual_quantity ?? line.planned_quantity),
        ]),
      ),
    );
  }, [initialRun]);

  const actualRows = useMemo(
    () =>
      run.lines.map((line) => ({
        ingredientId: line.ingredient_id,
        actualQuantity: Number(actualIngredients[line.ingredient_id]),
      })),
    [actualIngredients, run.lines],
  );

  async function reloadRun() {
    const result = await fetchProductionRunById(run.id);
    if (result.success && result.data) {
      setRun(result.data);
      onRunReloaded?.(result.data);
    }
    router.refresh();
  }

  function refreshAfter(result: { success: boolean; error?: string }) {
    if (!result.success) {
      setActionError(result.error ?? "Thao tác không thành công.");
      return false;
    }
    setActionError(null);
    void reloadRun();
    return true;
  }

  function handleStart() {
    startTransition(async () => {
      const result = await startProductionRun({
        id: run.id,
        branchId: run.branch_id,
      });
      if (refreshAfter(result)) toast.success("Đã bắt đầu sản xuất.");
    });
  }

  async function handleCancel() {
    const accepted = await confirm({
      title: "Hủy Lệnh sản xuất?",
      description:
        "Lệnh sẽ chỉ đọc sau khi hủy. Nếu có vật tư hỏng, hãy ghi nhận bằng Hao hụt.",
      confirmText: "Hủy lệnh",
      cancelText: "Quay lại",
      variant: "destructive",
    });
    if (!accepted) return;
    startTransition(async () => {
      const result = await cancelProductionRun({
        id: run.id,
        branchId: run.branch_id,
      });
      if (refreshAfter(result)) toast.success("Đã hủy Lệnh sản xuất.");
    });
  }

  function handleComplete() {
    const output = Number(actualOutput);
    if (
      !Number.isFinite(output) ||
      output <= 0 ||
      actualRows.some(
        (line) => !Number.isFinite(line.actualQuantity) || line.actualQuantity < 0,
      ) ||
      actualRows.every((line) => line.actualQuantity === 0)
    ) {
      setActionError(
        "Sản lượng phải lớn hơn 0 và tổng nguyên liệu thực tế không được bằng 0.",
      );
      return;
    }
    setShortages([]);
    startTransition(async () => {
      const result = await completeProductionRun({
        id: run.id,
        branchId: run.branch_id,
        actualQuantity: output,
        actualIngredients: actualRows,
      });
      if (!result.success) {
        setActionError(result.error ?? "Không thể hoàn thành Lệnh sản xuất.");
        setShortages(
          result.errorCode === "PRODUCTION_SHORTAGE"
            ? Array.isArray(result.data)
              ? (result.data as ProductionShortageRow[])
              : Array.isArray(result.meta?.shortages)
                ? (result.meta.shortages as ProductionShortageRow[])
                : []
            : [],
        );
        return;
      }
      toast.success("Đã hoàn thành và nhập thành phẩm tại Bếp Trung Tâm.");
      void reloadRun();
    });
  }

  const unit = run.entry_unit_name ?? "";
  const actualSmart = formatSmartQuantityUnit(run.actual_quantity, unit);
  const actualQtyLabel =
    run.actual_quantity == null
      ? "—"
      : `${actualSmart.formattedQty} ${actualSmart.displayUnit}`.trim();

  const plannedSmart = formatSmartQuantityUnit(run.planned_quantity, unit);

  const body = (
    <div className="flex flex-col gap-5">
      <Item
        variant="outline"
        className="grid shrink-0 grid-cols-2 gap-4 p-4 text-xs sm:grid-cols-3 lg:grid-cols-6"
      >
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {detailCopy.kpiLines}
          </span>
          <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
            {run.lines.length}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {detailCopy.kpiPlanned}
          </span>
          <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
            {`${plannedSmart.formattedQty} ${plannedSmart.displayUnit}`.trim()}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {detailCopy.kpiActual}
          </span>
          <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
            {actualQtyLabel}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {detailCopy.kpiBranch}
          </span>
          <span className="mt-1 block truncate text-base font-semibold text-foreground">
            {run.branch_name}
          </span>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <span className="block font-medium text-muted-foreground">
            {detailCopy.kpiFinishedGood}
          </span>
          <span className="mt-1 block break-words text-base font-semibold text-foreground">
            {run.finished_good_name}
          </span>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <span className="block font-medium text-muted-foreground">
            {run.status === "completed" ? "Giá vốn mẻ (Thực tế)" : "Giá vốn mẻ (Dự kiến)"}
          </span>
          <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
            {run.total_cost != null && run.total_cost > 0 ? formatVND(run.total_cost) : "—"}
          </span>
          {run.unit_cost != null && run.unit_cost > 0 ? (
            <span
              className="block text-xs text-muted-foreground font-mono"
              title={`Giá vốn: ${formatVND(run.unit_cost)} / ${run.entry_unit_name ?? "ĐV"}`}
            >
              {formatVND(run.unit_cost)} / {run.entry_unit_name ?? "ĐV"}
            </span>
          ) : null}
        </div>
      </Item>

      <AppSection title="Thông tin lệnh" size="sm">
        <DescriptionList
          className="grid gap-3 sm:grid-cols-2"
          descriptionClassName="font-medium"
          items={[
            {
              term: detailCopy.startedAt,
              description: run.started_at
                ? formatDateTime(run.started_at)
                : "—",
            },
            {
              term: detailCopy.completedAt,
              description: run.completed_at
                ? formatDateTime(run.completed_at)
                : "—",
            },
          ]}
        />
      </AppSection>

      <AppSection
        title="Định mức đã chốt theo lệnh"
        description={`${detailCopy.sectionLineCount(run.lines.length)} · Lệnh giữ nguyên định mức dù công thức được sửa sau đó.`}
        contentFlush
      >
        <Frame className="border-0 rounded-none overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="flex gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="min-w-0 flex-1">Nguyên liệu</span>
                <span className="w-24 shrink-0 text-right">Kế hoạch</span>
                <span className="w-28 shrink-0 text-right">Thực tế</span>
                <span className="w-24 shrink-0 text-right">Chênh lệch</span>
                <span className="w-24 shrink-0 text-right">Đơn giá</span>
                <span className="w-28 shrink-0 text-right">Thành tiền</span>
              </div>
              <div className="divide-y">
                {run.lines.map((line) => {
                  const plannedSmartLine = formatSmartQuantityUnit(line.planned_quantity, line.entry_unit_name);
                  const actualSmartLine = formatSmartQuantityUnit(line.actual_quantity, line.entry_unit_name);
                  const planned = Number(line.planned_quantity);
                  const currentActual =
                    run.status === "in_progress"
                      ? Number(actualIngredients[line.ingredient_id])
                      : line.actual_quantity;
                  const hasActual =
                    currentActual != null &&
                    Number.isFinite(currentActual) &&
                    run.status !== "draft";
                  const diff = hasActual ? Number(currentActual) - planned : null;
                  const diffPercent =
                    diff != null && planned > 0
                      ? (diff / planned) * 100
                      : null;

                  return (
                    <div
                      key={line.ingredient_id}
                      className="flex items-center gap-2 px-3 py-2.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 font-medium text-foreground">
                        {line.ingredient_name}
                      </span>
                      <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground text-xs sm:text-sm font-mono">
                        {plannedSmartLine.formattedQty} {plannedSmartLine.displayUnit}
                      </span>
                      <div className="w-28 shrink-0 flex items-center justify-end gap-1.5">
                        {run.status === "in_progress" ? (
                          <div className="flex w-full items-center gap-1.5">
                            <QuantityInput
                              value={actualIngredients[line.ingredient_id] ?? ""}
                              onValueChange={(value) =>
                                setActualIngredients((current) => ({
                                  ...current,
                                  [line.ingredient_id]: value,
                                }))
                              }
                              min="0"
                              maxFractionDigits={3}
                              className="h-8 text-xs"
                              aria-label={`Thực tế ${line.ingredient_name}`}
                            />
                            <span className="text-xs text-muted-foreground shrink-0">
                              {line.entry_unit_name}
                            </span>
                          </div>
                        ) : (
                          <span className="tabular-nums font-medium text-foreground font-mono">
                            {line.actual_quantity == null
                              ? "—"
                              : `${actualSmartLine.formattedQty} ${actualSmartLine.displayUnit}`}
                          </span>
                        )}
                      </div>
                      <div className="w-24 shrink-0 flex items-center justify-end">
                        {diff == null ? (
                          <span className="text-xs text-muted-foreground font-mono">—</span>
                        ) : Math.abs(diff) < 1e-4 ? (
                          <span className="text-xs text-muted-foreground font-mono">±0%</span>
                        ) : diff > 0 ? (
                          <span
                            className="text-xs font-semibold text-destructive font-mono"
                            title={`Vượt định mức ${formatQty(diff)} ${line.entry_unit_name}`}
                          >
                            +{diffPercent != null ? formatPercent(diffPercent, 1) : ""}
                          </span>
                        ) : (
                          <span
                            className="text-xs font-semibold text-success font-mono"
                            title={`Tiết kiệm ${formatQty(Math.abs(diff))} ${line.entry_unit_name}`}
                          >
                            {diffPercent != null ? formatPercent(diffPercent, 1) : ""}
                          </span>
                        )}
                      </div>
                      <div className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {line.unit_cost != null && line.unit_cost > 0
                          ? formatVND(line.unit_cost)
                          : "—"}
                      </div>
                      <div className="w-28 shrink-0 text-right font-mono text-xs font-medium tabular-nums text-foreground">
                        {line.line_cost != null && line.line_cost > 0
                          ? formatVND(line.line_cost)
                          : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2.5 text-xs font-semibold text-foreground">
            <span>Tổng giá trị nguyên liệu {run.status === "completed" ? "(Thực tế)" : "(Dự kiến)"}</span>
            <span className="font-mono text-sm tabular-nums font-semibold text-foreground">
              {run.total_cost != null && run.total_cost > 0 ? formatVND(run.total_cost) : "—"}
            </span>
          </div>
        </Frame>
      </AppSection>

      {run.status === "in_progress" ? (
        <AppSection
          title="Sản lượng thực tế"
          description="Nhập số thành phẩm đã đạt. Mẻ không có sản lượng phải hủy."
        >
          <div className="flex max-w-sm items-center gap-2">
            <QuantityInput
              aria-label="Số lượng thực tế"
              value={actualOutput}
              onValueChange={setActualOutput}
              min="0"
              maxFractionDigits={3}
            />
            <span className="text-sm font-medium text-muted-foreground">{run.entry_unit_name}</span>
          </div>
        </AppSection>
      ) : null}

      {actionError ? (
        <Alert variant="destructive"><AlertTitle>Thao tác không thành công</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert>
      ) : null}
      {shortages.length ? (
        <Alert variant="destructive">
          <AlertTitle>Không đủ tồn nguyên liệu</AlertTitle>
          <AlertDescription>
            {shortages.map((row) => (
              <div key={row.ingredient_id}>{row.ingredient_name}: cần {formatQty(row.needed)} {row.unit}, còn {formatQty(row.on_hand)} {row.unit}</div>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

      {run.status === "completed" ? (
        <AppSection
          title={detailCopy.shipToBranchTitle}
          description={detailCopy.shipToBranchDescription}
          action={
            <Button
              render={
                <Link
                  href={
                    `/inventory/transfers/new?branch=${run.branch_id}&direction=outbound&ingredientId=${run.finished_good_id}` +
                    (run.actual_quantity != null ? `&quantity=${run.actual_quantity}` : "") +
                    (run.entry_unit_id != null ? `&entryUnitId=${run.entry_unit_id}` : "")
                  }
                />
              }
            >
              {detailCopy.shipToBranchAction}
            </Button>
          }
        >
          <p className="text-sm text-muted-foreground">
            Lệnh sản xuất đã hoàn tất. Bạn có thể tạo phiếu điều chuyển để xuất thành phẩm tới các chi nhánh bán hàng.
          </p>
        </AppSection>
      ) : null}

      {run.status === "cancelled" && run.cancel_reason ? (
        <AppSection title="Lý do hủy"><p className="text-sm">{run.cancel_reason}</p></AppSection>
      ) : null}
    </div>
  );

  const dialogFooter = (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div>
        {run.status === "draft" || run.status === "in_progress" ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleCancel()}
            disabled={isPending}
          >
            Hủy lệnh
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          {ACTIONS_VI.close}
        </Button>
        {run.status === "draft" ? (
          <Button type="button" onClick={handleStart} disabled={isPending}>
            Bắt đầu sản xuất
          </Button>
        ) : run.status === "in_progress" ? (
          <Button type="button" onClick={handleComplete} disabled={isPending}>
            Hoàn thành
          </Button>
        ) : null}
      </div>
    </div>
  );

  if (presentation === "dialog") {
    return (
      <AppDialog
        open
        onOpenChange={(next) => {
          if (!next) onClose?.();
        }}
        variant="document"
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{run.production_number}</span>
            <StatusBadge domain="inventory" value={run.status} />
          </div>
        }
        description={run.finished_good_name}
        footer={dialogFooter}
      >
        {body}
      </AppDialog>
    );
  }

  return body;
}
