"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  MapPin as IconMapPin,
  CircleCheck as IconCircleCheck,
  Printer as IconPrinter,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import { FormattedNumberInput } from "@/components/form";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  DocumentStockCorrectionDialog,
  type CorrectionBranchOption,
} from "../../_components/document-stock-correction-dialog";
import {
  AppDetailFooter,
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
  DescriptionList,
} from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";

import { AuditHistoryList } from "../../_components/audit-history-list";
import type { AuditLogRow } from "@/_lib/audit";
import { TimelineStepper } from "../../_components/timeline-stepper";
import { tRoute, tTerm } from "../../_lib/dictionary";
import { formatVND } from "../../_lib/format";
import {
  transferConfirmShip,
  transferMarkInTransit,
  transferReceive,
} from "../../transfer-actions";
import { messages } from "@lib/messages";

import { FORM_VI } from "@comtammatu/shared/messages";
const transferDetailTitle = "Chi tiết điều chuyển";
const historySectionTitle = "Lịch sử chỉnh sửa";
export type TransferDetail = {
  id: number;
  code: string;
  status: string;
  fromBranchId: number;
  toBranchId: number;
  fromBranch: string;
  toBranch: string;
  createdBy: string;
  date: string;
  note: string | null;
  subtotal: number;
  shipping: number;
  total: number;
  items: Array<{
    ingredientId: number;
    name: string;
    sku: string;
    qty: number;
    unit: string;
    cost: number;
    total: number;
    received: number | null;
  }>;
};

type TransferLineItem = TransferDetail["items"][number];

export function TransferDetailClient({
  transfer,
  userRole,
  userBranchId,
  correctionBranches,
  auditLogs = [],
  embedded = false,
  listHref,
}: {
  transfer: TransferDetail;
  userRole: StaffRole;
  userBranchId: number | null;
  correctionBranches: CorrectionBranchOption[];
  auditLogs?: AuditLogRow[];
  embedded?: boolean;
  listHref?: string;
}) {
  const router = useRouter();
  const copy = messages.inventory.transfer;
  const statusBadge = getStatusBadgeMeta("inventory", transfer.status);
  const [isPending, startTransition] = useTransition();
  const [receiveQty, setReceiveQty] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (const item of transfer.items) {
      initial[item.ingredientId] = String(item.received ?? item.qty);
    }
    return initial;
  });
  const [shortNote, setShortNote] = useState("");
  const isReceiveMode = transfer.status === "in_transit" || transfer.status === "confirmed_receive";
  const isIntraBranch = transfer.fromBranchId === transfer.toBranchId;
  const isBranchScopedOps =
    userRole === "warehouse_manager" || userRole === "production_manager";
  const transferListHref =
    listHref ??
    (userBranchId != null
      ? `/inventory/transfers?branchId=${userBranchId}`
      : "/inventory/transfers");
  const shortLines = useMemo(() => {
    if (!isReceiveMode) return 0;
    let count = 0;
    for (const item of transfer.items) {
      const got = Number(receiveQty[item.ingredientId] ?? item.qty);
      if (Number.isFinite(got) && got < item.qty) count += 1;
    }
    return count;
  }, [isReceiveMode, transfer.items, receiveQty]);
  const hasShort = shortLines > 0;
  const noteOk = !hasShort || shortNote.trim().length >= 3;
  const receivedCount = transfer.items.filter(
    (item) => item.received != null,
  ).length;
  const transferSteps = [
    {
      label: copy.steps.draft,
      completed: transfer.status !== "draft",
      active: transfer.status === "draft",
    },
    {
      label: copy.steps.inTransit,
      completed:
        transfer.status === "confirmed_receive" ||
        transfer.status === "received",
      active:
        transfer.status === "confirmed_ship" ||
        transfer.status === "in_transit",
    },
    {
      label: copy.steps.received,
      completed: transfer.status === "received",
      active: transfer.status === "confirmed_receive",
    },
  ];
  const actionConfig = useMemo(() => {
    if (transfer.status === "draft") {
      return {
        label: isIntraBranch
          ? copy.actions.confirmKitchen
          : copy.actions.confirmShip,
        action: "confirm_ship" as const,
        enabled:
          userRole === "branch_manager"
            ? isIntraBranch && userBranchId === transfer.fromBranchId
            : isBranchScopedOps
              ? userBranchId === transfer.fromBranchId
              : true,
      };
    }
    if (transfer.status === "confirmed_ship") {
      return {
        label: copy.actions.markInTransit,
        action: "mark_in_transit" as const,
        enabled:
          userRole === "branch_manager"
            ? false
            : isBranchScopedOps
              ? userBranchId === transfer.fromBranchId
              : true,
      };
    }
    if (transfer.status === "in_transit") {
      return {
        label: copy.actions.receive,
        action: "receive" as const,
        enabled:
          userRole === "branch_manager"
            ? userBranchId === transfer.toBranchId
            : isBranchScopedOps
              ? userBranchId === transfer.toBranchId
              : true,
      };
    }
    if (transfer.status === "confirmed_receive") {
      return {
        label: copy.actions.receive,
        action: "receive" as const,
        enabled:
          userRole === "branch_manager"
            ? userBranchId === transfer.toBranchId
            : isBranchScopedOps
              ? userBranchId === transfer.toBranchId
              : true,
      };
    }

    return null;
  }, [
    transfer.fromBranchId,
    transfer.status,
    transfer.toBranchId,
    isIntraBranch,
    isBranchScopedOps,
    userBranchId,
    userRole,
  ]);

  function handlePrimaryAction() {
    if (!actionConfig) return;

    startTransition(async () => {
      let res: { success: boolean; error?: string | null } | undefined;

      if (actionConfig.action === "confirm_ship") {
        res = await transferConfirmShip(transfer.id);
      } else if (actionConfig.action === "mark_in_transit") {
        res = await transferMarkInTransit(transfer.id);
      } else {
        if (!noteOk) {
          toast.error("Nhập ghi chú thiếu hụt tối thiểu 3 ký tự.");
          return;
        }
        const trimmedNote = shortNote.trim();
        const payload: Record<string, { qty: number; note?: string }> = {};
        for (const item of transfer.items) {
          const raw = receiveQty[item.ingredientId];
          const qty = Number(raw ?? item.qty);
          if (!Number.isFinite(qty) || qty < 0) {
            toast.error(`Số lượng nhận không hợp lệ cho ${item.name}.`);
            return;
          }
          if (qty > item.qty) {
            toast.error(
              `Số lượng nhận không được vượt quá số lượng xuất cho ${item.name}.`,
            );
            return;
          }
          payload[String(item.ingredientId)] =
            qty < item.qty && trimmedNote
              ? { qty, note: trimmedNote }
              : { qty };
        }
        res = await transferReceive(transfer.id, payload);
      }

      if (!res?.success) {
        toast.error(res?.error ?? "Không thể cập nhật phiếu điều chuyển.");
        return;
      }

      toast.success(actionConfig.label);
      router.refresh();
    });
  }

  const lineColumns: DataTableColumn<TransferLineItem>[] = [
    {
      key: "ingredient",
      header: tTerm("ingredient"),
      render: (item) => (
        <div className="flex flex-col whitespace-normal break-words min-w-48 max-w-80">
          <span className="font-bold">{item.name}</span>
          <span className="text-xs text-muted-foreground">{item.sku}</span>
        </div>
      ),
    },
    {
      key: "qty",
      header: copy.sentQty,
      className: "text-right font-mono tabular-nums font-semibold",
      render: (item) => item.qty,
    },
    {
      key: "unit",
      header: copy.unit,
      render: (item) => <Badge variant="secondary">{item.unit}</Badge>,
    },
    {
      key: "cost",
      header: copy.wacCost,
      className: "text-right font-mono tabular-nums",
      render: (item) => formatVND(item.cost),
    },
    {
      key: "amount",
      header: copy.lineAmount,
      className: "text-right font-mono tabular-nums",
      render: (item) => formatVND(item.total),
    },
    {
      key: "received",
      header: copy.receivedQty,
      className: "text-right w-28 md:w-32",
      render: (item) =>
        isReceiveMode ? (
          <FormattedNumberInput
            value={receiveQty[item.ingredientId] ?? ""}
            onValueChange={(value) =>
              setReceiveQty((prev) => ({
                ...prev,
                [item.ingredientId]: value,
              }))
            }
            maxFractionDigits={3}
            className={embedded ? "h-12 text-right" : "h-9 text-right"}
          />
        ) : item.received != null ? (
          <span className="font-mono tabular-nums">{item.received}</span>
        ) : (
          <span className="italic text-muted-foreground">
            {copy.notReceived}
          </span>
        ),
    },
  ];

  const pageLayout = (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Left Column: Ingredients List Table + Audit History */}
        <div className="flex flex-col gap-4">
          <AppSection
            className="overflow-hidden"
            title={tTerm("ingredientsList")}
            headerHint={
              isReceiveMode
                ? copy.receiveInstructions
                : copy.receivedReadonlyHint
            }
            contentFlush
          >
            <DataTable
              className="p-4 md:p-0"
              columns={lineColumns}
              data={transfer.items}
              getRowKey={(item) => item.sku || item.name}
              emptyTitle={copy.emptyTransferItemsTitle}
              emptyDescription={copy.emptyTransferItemsDescription}
              mobileCardRender={(item) => (
                <TransferLineMobileCard
                  item={item}
                  isReceiveMode={isReceiveMode}
                  embedded={embedded}
                  receiveValue={receiveQty[item.ingredientId] ?? ""}
                  onReceiveValueChange={(value) =>
                    setReceiveQty((prev) => ({
                      ...prev,
                      [item.ingredientId]: value,
                    }))
                  }
                />
              )}
              mobileFooter={
                <Item
                  variant="outline"
                  className="flex-col items-stretch gap-2 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {copy.totalValue}
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-primary">
                      {messages.inventory.common.currencyCompact(
                        formatVND(transfer.total),
                      )}
                    </span>
                  </div>
                </Item>
              }
              desktopFooterRows={[
                {
                  key: "ingredient-value",
                  className: "border-border",
                  cells: [
                    {
                      key: "label",
                      colSpan: 4,
                      className: "text-right text-sm text-muted-foreground",
                      content: copy.ingredientValue,
                    },
                    {
                      key: "value",
                      className: "text-right font-mono tabular-nums",
                      content: messages.inventory.common.currencyCompact(
                        formatVND(transfer.subtotal),
                      ),
                    },
                    { key: "actions", content: null },
                  ],
                },
                {
                  key: "shipping-fee",
                  className: "border-border",
                  cells: [
                    {
                      key: "label",
                      colSpan: 4,
                      className: "text-right text-sm text-muted-foreground",
                      content: copy.shippingFee,
                    },
                    {
                      key: "value",
                      className: "text-right font-mono tabular-nums",
                      content: messages.inventory.common.currencyCompact(
                        formatVND(transfer.shipping),
                      ),
                    },
                    { key: "actions", content: null },
                  ],
                },
                {
                  key: "total-value",
                  className: "border-border",
                  cells: [
                    {
                      key: "label",
                      colSpan: 4,
                      className: "text-right text-sm font-bold",
                      content: copy.totalValue,
                    },
                    {
                      key: "value",
                      className:
                        "text-right font-mono font-bold tabular-nums text-primary",
                      content: messages.inventory.common.currencyCompact(
                        formatVND(transfer.total),
                      ),
                    },
                    { key: "actions", content: null },
                  ],
                },
              ]}
            />
          </AppSection>

          {isReceiveMode && hasShort ? (
            <AppSection tone="warning">
              <p className="text-sm font-semibold">
                {copy.shortageNoteTitle}{" "}
                <span className="text-destructive">*</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {copy.shortageNoteDescription(shortLines)}
              </p>
              <Textarea
                value={shortNote}
                onChange={(e) => setShortNote(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder={copy.shortageNotePlaceholder}
              />
              {!noteOk ? (
                <p className="text-xs text-destructive">
                  {copy.shortageNoteMinLength}
                </p>
              ) : null}
            </AppSection>
          ) : null}

          {/* Audit History (Collapsible) */}
          <AppSection
            title={historySectionTitle}
            collapsible={true}
            defaultOpen={false}
          >
            <AuditHistoryList logs={auditLogs} />
          </AppSection>
        </div>

        {/* Right Column: Metadata Overview + Timeline Stepper + Transport Note */}
        <div className="flex flex-col gap-4">
          <AppSection title={transferDetailTitle}>
            <DescriptionList
              className="grid gap-3"
              descriptionClassName="flex items-center gap-1 font-semibold"
              items={[
                {
                  term: copy.totalValue,
                  description: (
                    <span className="text-primary font-bold">
                      {messages.inventory.common.currencyCompact(formatVND(transfer.total))}
                    </span>
                  ),
                },
                {
                  term: copy.totalItems,
                  description: String(transfer.items.length).padStart(2, "0"),
                },
                {
                  term: tTerm("fromWarehouse"),
                  description: (
                    <>
                      <IconMapPin className="size-3 text-primary" />
                      {transfer.fromBranch}
                    </>
                  ),
                },
                {
                  term: tTerm("toWarehouse"),
                  description: (
                    <>
                      <IconMapPin className="size-3 text-info" />
                      {transfer.toBranch}
                    </>
                  ),
                },
                {
                  term: copy.recorded,
                  description: `${String(receivedCount).padStart(2, "0")}/${String(transfer.items.length).padStart(2, "0")}`,
                },
              ]}
            />
          </AppSection>

          <AppSection>
            <TimelineStepper steps={transferSteps} orientation="vertical" />
          </AppSection>

          {transfer.note && (
            <AppSection title={copy.transportNote}>
              <p className="line-clamp-3 break-words text-sm italic">
                &ldquo;{transfer.note}&rdquo;
              </p>
            </AppSection>
          )}
        </div>
      </div>

      {/* Footer Action Bar */}
      <AppDetailFooter
        sticky={embedded}
        leading={
          <>
            <Button
              type="button"
              variant="outline"
              size={embedded ? "touch" : "default"}
              className="px-4 font-bold text-muted-foreground"
            >
              <IconPrinter className="size-5" />
              {copy.printSlip}
            </Button>
            {transfer.status !== "draft" &&
            correctionBranches.length > 0 &&
            transfer.items.length > 0 ? (
              <DocumentStockCorrectionDialog
                documentType="transfer"
                documentId={transfer.id}
                documentCode={transfer.code}
                branchOptions={correctionBranches}
                itemOptions={transfer.items.map((item) => ({
                  ingredientId: item.ingredientId,
                  name: item.name,
                  unit: item.unit,
                }))}
              />
            ) : null}
          </>
        }
        trailing={
          <Button
            type="button"
            disabled={
              isPending ||
              !actionConfig?.enabled ||
              (isReceiveMode &&
                actionConfig?.action === "receive" &&
                !noteOk)
            }
            size={embedded ? "touch" : "default"}
            className="px-4 font-bold"
            onClick={handlePrimaryAction}
          >
            <IconCircleCheck className="size-5" />
            {actionConfig?.label ?? copy.completedSlip}
          </Button>
        }
      />
    </div>
  );

  const mobileLayout = (
    <div className="flex flex-col gap-4">
      {/* 1. Tổng quan điều chuyển */}
      <AppSection title={transferDetailTitle} size="sm">
        <DescriptionList
          className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm"
          descriptionClassName="font-semibold text-right"
          items={[
            {
              term: copy.totalValue,
              description: (
                <span className="text-primary font-bold">
                  {messages.inventory.common.currencyCompact(formatVND(transfer.total))}
                </span>
              ),
            },
            {
              term: copy.totalItems,
              description: String(transfer.items.length).padStart(2, "0"),
            },
            {
              term: tTerm("fromWarehouse"),
              description: (
                <span className="inline-flex items-center gap-1">
                  <IconMapPin className="size-3 text-primary" />
                  {transfer.fromBranch}
                </span>
              ),
            },
            {
              term: tTerm("toWarehouse"),
              description: (
                <span className="inline-flex items-center gap-1">
                  <IconMapPin className="size-3 text-info" />
                  {transfer.toBranch}
                </span>
              ),
            },
            {
              term: copy.recorded,
              description: `${String(receivedCount).padStart(2, "0")}/${String(transfer.items.length).padStart(2, "0")}`,
            },
          ]}
        />
      </AppSection>

      {/* Timeline Stepper */}
      <AppSection size="sm">
        <TimelineStepper steps={transferSteps} orientation="vertical" />
      </AppSection>

      {/* Ghi chú vận chuyển nếu có */}
      {transfer.note && (
        <AppSection title={copy.transportNote} size="sm" collapsible defaultOpen={false}>
          <p className="break-words text-sm italic">
            &ldquo;{transfer.note}&rdquo;
          </p>
        </AppSection>
      )}

      {/* 2. Danh sách nguyên liệu */}
      <AppSection
        title={tTerm("ingredientsList")}
        description={
          isReceiveMode
            ? copy.receiveInstructions
            : copy.receivedReadonlyHint
        }
        size="sm"
      >
        {transfer.items.length === 0 ? (
          <AppEmptyState
            mode="no-data"
            title={copy.emptyTransferItemsTitle}
            description={copy.emptyTransferItemsDescription}
            compact
          />
        ) : (
          <ItemGroup className="gap-2 p-0 rounded-none border-0">
            {transfer.items.map((item) => (
              <TransferLineMobileCard
                key={item.sku || item.name}
                item={item}
                isReceiveMode={isReceiveMode}
                embedded={embedded}
                receiveValue={receiveQty[item.ingredientId] ?? ""}
                onReceiveValueChange={(value) =>
                  setReceiveQty((prev) => ({
                    ...prev,
                    [item.ingredientId]: value,
                  }))
                }
              />
            ))}
          </ItemGroup>
        )}

        {transfer.items.length > 0 && (
          <Item variant="outline" className="mt-4 flex-col items-stretch gap-2 p-3 text-sm bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{copy.ingredientValue}</span>
              <span className="font-bold">
                {messages.inventory.common.currencyCompact(formatVND(transfer.subtotal))}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{copy.shippingFee}</span>
              <span className="font-bold">
                {messages.inventory.common.currencyCompact(formatVND(transfer.shipping))}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="font-bold">{copy.totalValue}</span>
              <span className="font-mono font-semibold text-primary">
                {messages.inventory.common.currencyCompact(formatVND(transfer.total))}
              </span>
            </div>
          </Item>
        )}
      </AppSection>

      {isReceiveMode && hasShort ? (
        <AppSection tone="warning" size="sm">
          <p className="text-sm font-semibold">
            {copy.shortageNoteTitle} <span className="text-destructive">*</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {copy.shortageNoteDescription(shortLines)}
          </p>
          <Textarea
            value={shortNote}
            onChange={(e) => setShortNote(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder={copy.shortageNotePlaceholder}
          />
          {!noteOk ? (
            <p className="text-xs text-destructive">
               {copy.shortageNoteMinLength}
            </p>
          ) : null}
        </AppSection>
      ) : null}

      {/* 3. Lịch sử */}
      <AppSection title={historySectionTitle} size="sm" collapsible defaultOpen={false}>
        <AuditHistoryList logs={auditLogs} />
      </AppSection>

      {/* Action Footer */}
      <AppDetailFooter
        sticky={embedded}
        leading={
          <>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="px-4 font-bold text-muted-foreground"
            >
              <IconPrinter className="size-5" />
              {copy.printSlip}
            </Button>
            {transfer.status !== "draft" &&
            correctionBranches.length > 0 &&
            transfer.items.length > 0 ? (
               <DocumentStockCorrectionDialog
                 documentType="transfer"
                 documentId={transfer.id}
                 documentCode={transfer.code}
                 branchOptions={correctionBranches}
                 itemOptions={transfer.items.map((item) => ({
                   ingredientId: item.ingredientId,
                   name: item.name,
                   unit: item.unit,
                 }))}
               />
            ) : null}
          </>
        }
        trailing={
          <Button
            type="button"
            disabled={
              isPending ||
              !actionConfig?.enabled ||
              (isReceiveMode &&
                actionConfig?.action === "receive" &&
                !noteOk)
            }
            size="touch"
            className="px-4 font-bold"
            onClick={handlePrimaryAction}
          >
            <IconCircleCheck className="size-5" />
            {actionConfig?.label ?? copy.completedSlip}
          </Button>
        }
      />
    </div>
  );

  const content = embedded ? (
    <>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link
            href={transferListHref}
            aria-label={tRoute("/inventory/transfers")}
          >
            <IconArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-semibold">
            {transfer.code}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {copy.routeMeta(
              transfer.fromBranch,
              transfer.toBranch,
              transfer.date,
            )}
          </p>
        </div>
        <Badge variant={statusBadge.variant} className="shrink-0">
          {statusBadge.label}
        </Badge>
      </div>
      {mobileLayout}
    </>
  ) : (
    <AppPageHeader
      eyebrow="Kho hàng"
      title={transfer.code}
      description={copy.routeMeta(
        transfer.fromBranch,
        transfer.toBranch,
        transfer.date,
      )}
      badge={{
        children: statusBadge.label,
        variant: statusBadge.variant,
      }}
      breadcrumb={
        <Link
          href={transferListHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <IconArrowLeft className="size-4" /> {tRoute("/inventory/transfers")}
        </Link>
      }
    />
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return (
    <AppPage width="xwide" density="compact">
      {content}
      {!embedded && pageLayout}
    </AppPage>
  );
}

function TransferLineMobileCard({
  item,
  isReceiveMode,
  embedded,
  receiveValue,
  onReceiveValueChange,
}: {
  item: TransferLineItem;
  isReceiveMode: boolean;
  embedded: boolean;
  receiveValue: string;
  onReceiveValueChange: (value: string) => void;
}) {
  const copy = messages.inventory.transfer;
  return (
    <Item variant="outline" className="flex-col items-stretch gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{item.name}</p>
          <p className="text-xs text-muted-foreground">{item.sku}</p>
        </div>
        <Badge variant="secondary">{item.unit}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-muted-foreground">{copy.sentQty}</p>
          <p className="font-semibold">{item.qty}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{copy.receivedQty}</p>
          {isReceiveMode ? (
            <FormattedNumberInput
              value={receiveValue}
              onValueChange={onReceiveValueChange}
              maxFractionDigits={3}
              className={embedded ? "h-12" : "h-9"}
            />
          ) : (
            <p className="font-semibold">
              {item.received != null ? (
                item.received
              ) : (
                <span className="italic text-muted-foreground">
                  {copy.notReceived}
                </span>
              )}
            </p>
          )}
        </div>
        <div>
          <p className="text-muted-foreground">{copy.wacCost}</p>
          <p className="font-semibold">{formatVND(item.cost)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{FORM_VI.amount}</p>
          <p className="font-semibold text-primary">{formatVND(item.total)}</p>
        </div>
      </div>
    </Item>
  );
}
