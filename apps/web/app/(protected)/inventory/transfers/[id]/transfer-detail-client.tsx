"use client";

import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  MapPin as IconMapPin,
  CircleCheck as IconCircleCheck,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { ReasonConfirmDialog } from "@/components/reason-confirm-dialog";
import { Item } from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { QuantityInput } from "@/components/form/domain-number-inputs";
import { useIsOnline } from "@/components/pwa-runtime";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import type { CorrectionBranchOption } from "../../_components/document-stock-correction-dialog";
import { AppDialogFooter } from "@/components/form";
import {
  AppBackLink,
  AppDetailFooter,
  AppPage,
  AppPageHeader,
  AppSection,
  DescriptionList,
} from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { getStatusBadgeMeta } from "@/components/status-badge";

import { AuditHistoryList } from "@/components/audit-history-list";
import type { AuditLogRow } from "@/_lib/audit";
import { TimelineStepper } from "../../_components/timeline-stepper";
import { tRoute, tTerm } from "../../_lib/dictionary";
import { formatVND } from "@lib/inventory/format";
import {
  cancelStockTransfer,
  transferConfirmShip,
  transferConfirmReceive,
  transferMarkInTransit,
  transferReceive,
} from "../../transfer-actions";
import { messages } from "@lib/messages";
import {
  getTransferActionConfig,
  isTransferReceiveReady,
  type TransferActionKind,
  type TransferDetail,
} from "@lib/inventory/transfer-detail-model";
import {
  applyInventoryActionError,
  inventoryShortageToastMessage,
} from "@lib/inventory/apply-inventory-action-error";

import { FORM_VI } from "@comtammatu/shared/messages";

const DocumentStockCorrectionDialog = dynamic(
  () =>
    import("../../_components/document-stock-correction-dialog").then(
      (mod) => mod.DocumentStockCorrectionDialog,
    ),
  { ssr: false },
);

const transferDetailTitle = "Chi tiết điều chuyển";
const documentTabLabel = "Phiếu điều chuyển";
const historyTabLabel = "Lịch sử";
const historySectionTitle = "Lịch sử chỉnh sửa";
type TransferLineItem = TransferDetail["items"][number];

function getTransferActionLabel(kind: TransferActionKind): string {
  const actions = messages.inventory.transfer.actions;
  if (kind === "confirm_ship") return actions.confirmShip;
  if (kind === "mark_in_transit") return actions.markInTransit;
  if (kind === "confirm_receive") return "Bắt đầu kiểm nhận";
  return actions.receive;
}

export function TransferDetailClient({
  transfer,
  userRole,
  userBranchId,
  correctionBranches,
  auditLogs = [],
  embedded = false,
  embeddedHeader = true,
  listHref,
}: {
  transfer: TransferDetail;
  userRole: StaffRole;
  userBranchId: number | null;
  correctionBranches: CorrectionBranchOption[];
  auditLogs?: AuditLogRow[];
  embedded?: boolean;
  embeddedHeader?: boolean;
  listHref?: string;
}) {
  const router = useRouter();
  const isOnline = useIsOnline();
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
  const [shortfallClass, setShortfallClass] = useState<
    "source_variance" | "transit_loss"
  >("source_variance");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [shortageIngredientId, setShortageIngredientId] = useState<
    number | null
  >(null);
  const isReceiveMode = isTransferReceiveReady(transfer.status);
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
  const noteOk = !hasShort || shortNote.trim().length >= 5;
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
  const actionConfig = useMemo(
    () => getTransferActionConfig({ transfer, userRole, userBranchId }),
    [transfer, userBranchId, userRole],
  );
  const actionLabel = actionConfig
    ? getTransferActionLabel(actionConfig.kind)
    : copy.completedSlip;

  function handlePrimaryAction() {
    if (!actionConfig) return;
    if (!isOnline) {
      toast.error(messages.inventory.stockRequests.journey.offlineMutation);
      return;
    }

    startTransition(async () => {
      let res: { success: boolean; error?: string | null } | undefined;

      if (actionConfig.kind === "confirm_ship") {
        res = await transferConfirmShip(transfer.id);
      } else if (actionConfig.kind === "mark_in_transit") {
        res = await transferMarkInTransit(transfer.id);
      } else if (actionConfig.kind === "confirm_receive") {
        res = await transferConfirmReceive(transfer.id);
      } else {
        if (!noteOk) {
          toast.error(copy.shortageNoteMinLength);
          return;
        }
        const trimmedNote = shortNote.trim();
        const payload: Record<
          string,
          { qty: number; note?: string; shortfall_class?: string }
        > = {};
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
            qty < item.qty
              ? {
                  qty,
                  note: trimmedNote,
                  shortfall_class: shortfallClass,
                }
              : { qty };
        }
        res = await transferReceive(transfer.id, payload);
      }

      if (!res?.success) {
        const applied = applyInventoryActionError(
          res ?? {},
          "Không thể cập nhật phiếu điều chuyển.",
        );
        const namedLine =
          applied.lineTarget == null
            ? null
            : transfer.items.find(
                (item) => item.ingredientId === applied.lineTarget?.ingredientId,
              );
        setShortageIngredientId(applied.lineTarget?.ingredientId ?? null);
        toast.error(
          inventoryShortageToastMessage(
            applied,
            namedLine?.name,
            copy.shortageNamed,
          ),
        );
        return;
      }

      setShortageIngredientId(null);
      toast.success(actionLabel);
      router.refresh();
    });
  }

  function handleCancel() {
    if (!isOnline) {
      toast.error(messages.inventory.stockRequests.journey.offlineMutation);
      return;
    }
    startTransition(async () => {
      const result = await cancelStockTransfer(transfer.id, cancelReason);
      if (!result.success) {
        const applied = applyInventoryActionError(
          result,
          "Không thể hủy phiếu điều chuyển.",
        );
        toast.error(applied.toastMessage);
        return;
      }
      toast.success(copy.cancelSuccess);
      setCancelOpen(false);
      setCancelReason("");
      router.refresh();
    });
  }

  const lineColumns: DataTableColumn<TransferLineItem>[] = [
    {
      key: "ingredient",
      header: tTerm("ingredient"),
      render: (item) => (
        <div
          className={cn(
            "flex flex-col whitespace-normal break-words min-w-48 max-w-80",
            shortageIngredientId === item.ingredientId && "text-destructive",
          )}
          data-shortage={
            shortageIngredientId === item.ingredientId ? "true" : undefined
          }
        >
          <span>{item.name}</span>
          <span className="text-xs text-muted-foreground">{item.sku}</span>
          {shortageIngredientId === item.ingredientId ? (
            <span className="text-xs text-destructive">
              {copy.lineShortageHint}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "qty",
      header: copy.sentQty,
      className: "text-right font-mono tabular-nums",
      render: (item) => item.qty,
    },
    {
      key: "unit",
      header: copy.unit,
      render: (item) => <Badge variant="secondary">{item.unit}</Badge>,
    },
    ...(transfer.monetary
      ? [
          {
            key: "cost",
            header: copy.wacCost,
            className: "text-right font-mono tabular-nums",
            render: (item: TransferLineItem) => {
              const cost = item.monetary?.cost ?? 0;
              const baseLabel = item.baseUnit || item.unit;
              return baseLabel
                ? `${formatVND(cost)}/${baseLabel}`
                : formatVND(cost);
            },
          },
          {
            key: "amount",
            header: copy.lineAmount,
            className: "text-right font-mono tabular-nums",
            render: (item: TransferLineItem) =>
              formatVND(item.monetary?.total ?? 0),
          },
        ]
      : []),
    {
      key: "received",
      header: copy.receivedQty,
      className: "text-right w-28 md:w-32",
      render: (item) =>
        isReceiveMode ? (
          <QuantityInput
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

  const lineTable = (
    <DataTable
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
        transfer.monetary ? (
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
                  formatVND(transfer.monetary.total),
                )}
              </span>
            </div>
          </Item>
        ) : null
      }
      desktopFooterRows={
        transfer.monetary
          ? [
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
                      formatVND(transfer.monetary.subtotal),
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
                      formatVND(transfer.monetary.shipping),
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
                    className: "text-right text-sm font-semibold",
                    content: copy.totalValue,
                  },
                  {
                    key: "value",
                    className:
                      "text-right font-mono font-semibold tabular-nums text-primary",
                    content: messages.inventory.common.currencyCompact(
                      formatVND(transfer.monetary.total),
                    ),
                  },
                  { key: "actions", content: null },
                ],
              },
            ]
          : undefined
      }
    />
  );

  const pageLayout = (
    <div
      className={cn(
        "flex flex-col gap-4",
        // Document dialog: fill body height on desktop so only the line list scrolls.
        embedded && "lg:h-full lg:min-h-0",
      )}
    >
      <div
        className={cn(
          "grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]",
          embedded
            ? "min-h-0 flex-1 overflow-hidden lg:items-stretch"
            : "lg:items-start",
        )}
      >
          <div
            className={cn(
              "order-2 flex flex-col gap-4 lg:order-1",
              embedded && "min-h-0 lg:overflow-hidden",
            )}
          >
            <AppSection
              className={cn(
                "overflow-hidden",
                embedded && "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col",
              )}
              title={tTerm("ingredientsList")}
            headerHint={
              isReceiveMode
                ? copy.receiveInstructions
                : copy.receivedReadonlyHint
              }
              contentFlush
              contentClassName={cn(embedded && "lg:min-h-0 lg:flex-1")}
            >
              {embedded ? (
                <ScrollArea className="lg:h-full">{lineTable}</ScrollArea>
              ) : (
                lineTable
              )}
          </AppSection>

          {isReceiveMode && hasShort ? (
            <AppSection tone="warning">
              <p className="text-sm font-semibold">
                {copy.shortfallClassTitle}{" "}
                <span className="text-destructive">*</span>
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  size="sm"
                  variant={
                    shortfallClass === "source_variance"
                      ? "default"
                      : "outline"
                  }
                  onClick={() => setShortfallClass("source_variance")}
                >
                  {copy.shortfallClassSourceVariance}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    shortfallClass === "transit_loss" ? "default" : "outline"
                  }
                  onClick={() => setShortfallClass("transit_loss")}
                >
                  {copy.shortfallClassTransitLoss}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {shortfallClass === "transit_loss"
                  ? copy.shortfallClassTransitLossHint
                  : copy.shortfallClassSourceVarianceHint}
              </p>
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
        </div>

        {/* Right Column: Metadata Overview + Timeline Stepper + Transport Note */}
        <div
          className={cn(
            "order-1 flex flex-col gap-4 lg:order-2",
            embedded ? "shrink-0 lg:self-start" : "lg:sticky lg:top-4",
          )}
        >
          <AppSection title={transferDetailTitle}>
            <DescriptionList
              className="grid gap-3"
              descriptionClassName="flex items-center gap-1 font-semibold"
              items={[
                ...(transfer.monetary
                  ? [
                      {
                        term: copy.totalValue,
                        description: (
                          <span className="text-primary font-semibold">
                            {messages.inventory.common.currencyCompact(
                              formatVND(transfer.monetary.total),
                            )}
                          </span>
                        ),
                      },
                    ]
                  : []),
                {
                  term: copy.totalItems,
                  description: String(transfer.items.length).padStart(2, "0"),
                },
                {
                  term: copy.sourceBranchLabel,
                  description: (
                    <>
                      <IconMapPin className="size-3 text-primary" />
                      {transfer.fromLocation}
                    </>
                  ),
                },
                {
                  term: copy.targetBranchLabel,
                  description: (
                    <>
                      <IconMapPin className="size-3 text-info" />
                      {transfer.toLocation}
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

          {embedded ? null : (
            <AppSection>
              <TimelineStepper steps={transferSteps} orientation="vertical" />
            </AppSection>
          )}

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
      {embedded ? (
        <AppDialogFooter>
          <AppDetailFooter
            sticky
            leading={
              <>
                {transfer.status === "draft" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    disabled={isPending || !isOnline}
                    onClick={() => setCancelOpen(true)}
                  >
                    {copy.actions.cancel}
                  </Button>
                ) : null}
                {transfer.status !== "draft" &&
                correctionBranches.length > 0 &&
                transfer.items.length > 0 ? (
                  <DocumentStockCorrectionDialog
                    documentType="transfer"
                    documentId={transfer.id}
                    documentCode={transfer.code}
                    branchOptions={correctionBranches}
                    buttonSize="touch"
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
                  !isOnline ||
                  !actionConfig?.enabled ||
                  (isReceiveMode &&
                    actionConfig?.kind === "receive" &&
                    !noteOk)
                }
                size="touch"
                className="px-4 font-semibold"
                onClick={handlePrimaryAction}
              >
                <IconCircleCheck className="size-5" />
                {actionLabel}
              </Button>
            }
          />
        </AppDialogFooter>
      ) : (
        <AppDetailFooter
          sticky={false}
          leading={
            <>
              {transfer.status === "draft" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  disabled={isPending || !isOnline}
                  onClick={() => setCancelOpen(true)}
                >
                  {copy.actions.cancel}
                </Button>
              ) : null}
              {transfer.status !== "draft" &&
              correctionBranches.length > 0 &&
              transfer.items.length > 0 ? (
                <DocumentStockCorrectionDialog
                  documentType="transfer"
                  documentId={transfer.id}
                  documentCode={transfer.code}
                  branchOptions={correctionBranches}
                  buttonSize="default"
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
                !isOnline ||
                !actionConfig?.enabled ||
                (isReceiveMode && actionConfig?.kind === "receive" && !noteOk)
              }
              size="default"
              className="px-4 font-semibold"
              onClick={handlePrimaryAction}
            >
              <IconCircleCheck className="size-5" />
              {actionLabel}
            </Button>
          }
        />
      )}
      <ReasonConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={copy.cancelTitle}
        description={copy.cancelDescription}
        reasonId="stock-transfer-cancel-reason"
        reason={cancelReason}
        onReasonChange={setCancelReason}
        reasonLabel={copy.cancelReasonLabel}
        reasonPlaceholder={copy.cancelReasonPlaceholder}
        cancelLabel={copy.cancelBack}
        confirmLabel={copy.actions.cancel}
        onConfirm={handleCancel}
        isPending={isPending || !isOnline}
      />
    </div>
  );

  const tabs = (
    <AppPageTabs
      items={[
        { value: "document", label: documentTabLabel },
        {
          value: "history",
          label: historyTabLabel,
          count: auditLogs.length,
        },
      ]}
      defaultValue="document"
      stickyList={!embedded}
    >
      <TabsContent value="document" className="mt-4">
        {pageLayout}
      </TabsContent>
      <TabsContent value="history" className="mt-4">
        <AppSection title={historySectionTitle}>
          <AuditHistoryList logs={auditLogs} />
        </AppSection>
      </TabsContent>
    </AppPageTabs>
  );

  const embeddedLayout = pageLayout;

  if (embedded) {
    if (!embeddedHeader) return embeddedLayout;
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            render={
              <Link
                href={transferListHref}
                aria-label={tRoute("/inventory/transfers")}
              />
            }
          >
            <IconArrowLeft className="size-4" />
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
        {embeddedLayout}
      </div>
    );
  }

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
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
          <AppBackLink href={transferListHref}>
            {tRoute("/inventory/transfers")}
          </AppBackLink>
        }
      />
      {tabs}
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
          <p className="font-semibold">{item.name}</p>
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
            <QuantityInput
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
        {item.monetary ? (
          <div>
            <p className="text-muted-foreground">
              {item.baseUnit
                ? copy.wacCostPerUnit(item.baseUnit)
                : copy.wacCost}
            </p>
            <p className="font-semibold">{formatVND(item.monetary.cost)}</p>
          </div>
        ) : null}
        {item.monetary ? (
          <div>
            <p className="text-muted-foreground">{FORM_VI.amount}</p>
            <p className="font-semibold text-primary">
              {formatVND(item.monetary.total)}
            </p>
          </div>
        ) : null}
      </div>
    </Item>
  );
}
