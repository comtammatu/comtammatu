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
import { FormattedNumberInput } from "../../_components/formatted-number-input";
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
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { AuditHistoryList } from "../../_components/audit-history-list";
import type { AuditLogRow } from "@/_lib/audit";
import { TimelineStepper } from "../../_components/timeline-stepper";
import { tRoute, tTerm } from "../../_lib/dictionary";
import { formatVND } from "../../_lib/format";
import {
  transferConfirmReceive,
  transferConfirmShip,
  transferMarkInTransit,
  transferReceive,
} from "../../transfer-actions";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../../_lib/ui";
import { messages } from "@lib/messages";

import { FORM_VI } from "@comtammatu/shared/messages";
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
}: {
  transfer: TransferDetail;
  userRole: StaffRole;
  userBranchId: number | null;
  correctionBranches: CorrectionBranchOption[];
  auditLogs?: AuditLogRow[];
}) {
  const router = useRouter();
  const copy = messages.inventory.transfer;
  const [isPending, startTransition] = useTransition();
  const [receiveQty, setReceiveQty] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (const item of transfer.items) {
      initial[item.ingredientId] = String(item.received ?? item.qty);
    }
    return initial;
  });
  const [shortNote, setShortNote] = useState("");
  const isReceiveMode = transfer.status === "confirmed_receive";
  const isIntraBranch = transfer.fromBranchId === transfer.toBranchId;
  const isBranchScopedOps =
    userRole === "warehouse_manager" || userRole === "production_manager";
  const transferListHref =
    userBranchId != null
      ? `/inventory/transfers?branchId=${userBranchId}`
      : "/inventory/transfers";
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
      label: copy.steps.shipped,
      completed:
        transfer.status === "confirmed_ship" ||
        transfer.status === "in_transit" ||
        transfer.status === "confirmed_receive" ||
        transfer.status === "received",
      active: transfer.status === "confirmed_ship",
    },
    {
      label: copy.steps.checking,
      completed:
        transfer.status === "confirmed_receive" ||
        transfer.status === "received",
      active:
        transfer.status === "in_transit" ||
        transfer.status === "confirmed_receive",
    },
    {
      label: copy.steps.received,
      completed: transfer.status === "received",
      active: false,
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
        label: copy.actions.confirmReceive,
        action: "confirm_receive" as const,
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
      } else if (actionConfig.action === "confirm_receive") {
        res = await transferConfirmReceive(transfer.id);
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
        <div className="flex flex-col">
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
      className: "text-right",
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
            className="h-9 text-right"
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

  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Kho hàng"
        title={transfer.code}
        description={copy.routeMeta(
          transfer.fromBranch,
          transfer.toBranch,
          transfer.date,
        )}
        badge={{
          children: getInventoryStatusLabel(transfer.status),
          variant: getInventoryStatusBadgeVariant(transfer.status),
        }}
        breadcrumb={
          <Link
            href={transferListHref}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" />{" "}
            {tRoute("/inventory/transfers")}
          </Link>
        }
        tabs={
          <AppPageTabs
            items={[
              { value: "overview", label: "Tổng quan" },
              { value: "lines", label: "Dòng", count: transfer.items.length },
              { value: "history", label: "Lịch sử", count: auditLogs.length },
            ]}
          >
            <TabsContent value="overview">
              <div className="flex flex-col gap-4">
                <AppSection contentClassName="py-4">
                  <div className="flex justify-center">
                    <TimelineStepper steps={transferSteps} />
                  </div>
                </AppSection>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: copy.totalValue,
                      value: formatVND(transfer.total),
                      icon: null,
                    },
                    {
                      label: copy.totalItems,
                      value: String(transfer.items.length).padStart(2, "0"),
                      icon: null,
                    },
                    {
                      label: tTerm("fromWarehouse"),
                      value: transfer.fromBranch,
                      icon: <IconMapPin className="size-3 text-primary" />,
                    },
                    {
                      label: tTerm("toWarehouse"),
                      value: transfer.toBranch,
                      icon: <IconMapPin className="size-3 text-info" />,
                    },
                    {
                      label: copy.recorded,
                      value: `${String(receivedCount).padStart(2, "0")}/${String(transfer.items.length).padStart(2, "0")}`,
                      icon: null,
                    },
                  ].map((info) => (
                    <div key={info.label} className="rounded-md border bg-card p-4">
                      <Badge variant="secondary">{info.label}</Badge>
                      <p className="mt-3 flex items-center gap-1 text-lg font-semibold">
                        {info.icon} {info.value}
                      </p>
                    </div>
                  ))}
                </div>

                {transfer.note && (
                  <div className="rounded-md border bg-card p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {copy.transportNote}
                    </p>
                    <p className="mt-1 line-clamp-3 break-words text-sm italic">
                      &ldquo;{transfer.note}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="lines">
              <div className="flex flex-col gap-4">
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2">
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
                          <div className="rounded-md border bg-muted/20 p-3 text-sm">
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
                          </div>
                        }
                        desktopFooterRows={[
                          {
                            key: "ingredient-value",
                            className: "border-border",
                            cells: [
                              {
                                key: "label",
                                colSpan: 4,
                                className:
                                  "text-right text-sm text-muted-foreground",
                                content: copy.ingredientValue,
                              },
                              {
                                key: "value",
                                className:
                                  "text-right font-mono tabular-nums",
                                content:
                                  messages.inventory.common.currencyCompact(
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
                                className:
                                  "text-right text-sm text-muted-foreground",
                                content: copy.shippingFee,
                              },
                              {
                                key: "value",
                                className:
                                  "text-right font-mono tabular-nums",
                                content:
                                  messages.inventory.common.currencyCompact(
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
                                content:
                                  messages.inventory.common.currencyCompact(
                                    formatVND(transfer.total),
                                  ),
                              },
                              { key: "actions", content: null },
                            ],
                          },
                        ]}
                      />
                    </AppSection>
                  </div>

                  <AppSection tone="info" title={copy.totalTransferValue}>
                    <div className="flex flex-col gap-3">
                      <p className="font-mono text-xl font-semibold tabular-nums text-primary">
                        {messages.inventory.common.currencyCompact(
                          formatVND(transfer.total),
                        )}
                      </p>
                      <div className="rounded-md border bg-background/70 p-3">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                          {copy.totalItems}
                        </p>
                        <p className="text-lg font-bold tabular-nums">
                          {String(transfer.items.length).padStart(2, "0")}
                        </p>
                      </div>
                    </div>
                  </AppSection>
                </div>

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

                {/* Footer Action Bar */}
                <AppDetailFooter
                  leading={
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className="px-6 font-bold text-muted-foreground"
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
                      className="px-6 font-bold"
                      onClick={handlePrimaryAction}
                    >
                      <IconCircleCheck className="size-5" />
                      {actionConfig?.label ?? copy.completedSlip}
                    </Button>
                  }
                />
              </div>
            </TabsContent>

            <TabsContent value="history">
              <AuditHistoryList logs={auditLogs} />
            </TabsContent>
          </AppPageTabs>
        }
      />
    </AppPage>
  );
}

function TransferLineMobileCard({
  item,
  isReceiveMode,
  receiveValue,
  onReceiveValueChange,
}: {
  item: TransferLineItem;
  isReceiveMode: boolean;
  receiveValue: string;
  onReceiveValueChange: (value: string) => void;
}) {
  const copy = messages.inventory.transfer;
  return (
    <div className="rounded-md border bg-muted/30 p-4">
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
              className="h-9"
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
    </div>
  );
}
