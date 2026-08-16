/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { Item } from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
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
import { formatDateTime, formatQty } from "@lib/inventory/format";
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
  const actualQtyLabel =
    run.actual_quantity == null
      ? "—"
      : `${formatQty(run.actual_quantity)} ${unit}`.trim();

  const body = (
    <div className="flex flex-col gap-5">
      <Item
        variant="outline"
        className="grid shrink-0 grid-cols-2 gap-4 p-4 text-xs sm:grid-cols-3 lg:grid-cols-5"
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
            {`${formatQty(run.planned_quantity)} ${unit}`.trim()}
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
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {detailCopy.kpiFinishedGood}
          </span>
          <span className="mt-1 block truncate text-base font-semibold text-foreground">
            {run.finished_good_name}
          </span>
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
        description={detailCopy.sectionLineCount(run.lines.length)}
        headerHint="Lệnh giữ nguyên định mức này dù công thức được sửa sau đó."
        contentFlush
      >
        <Frame className="border-0 rounded-none overflow-hidden">
          <div className="flex gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="min-w-0 flex-1">Nguyên liệu</span>
            <span className="w-36 shrink-0 text-right">Kế hoạch</span>
            <span className="w-36 shrink-0 text-right">Thực tế</span>
          </div>
          <ScrollArea className="h-72">
            <div className="divide-y">
              {run.lines.map((line) => (
                <div
                  key={line.ingredient_id}
                  className="flex flex-col gap-2 px-3 py-2.5 text-sm sm:flex-row sm:items-center"
                >
                  <span className="min-w-0 flex-1 font-medium text-foreground">
                    {line.ingredient_name}
                  </span>
                  <span className="w-36 shrink-0 text-left sm:text-right tabular-nums text-muted-foreground text-xs sm:text-sm">
                    {formatQty(line.planned_quantity)} {line.entry_unit_name}
                  </span>
                  <div className="w-36 shrink-0 flex items-center justify-start sm:justify-end gap-1.5">
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
                      <span className="tabular-nums font-medium text-foreground">
                        {line.actual_quantity == null
                          ? "—"
                          : `${formatQty(line.actual_quantity)} ${line.entry_unit_name}`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
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
                <Link href={`/inventory/transfers/new?branch=${run.branch_id}`} />
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
