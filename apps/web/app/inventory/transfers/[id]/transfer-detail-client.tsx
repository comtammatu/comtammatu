"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  ClipboardCheck as IconClipboardCheck,
  CircleCheck as IconCircleCheck,
  ListChecks as IconListChecks,
  Printer as IconPrinter,
  Route as IconRoute,
  WalletCards as IconWalletCards,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { FormattedNumberInput } from "../../_components/formatted-number-input";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@comtammatu/ui/components/table";
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
import type { AuditLogRow } from "@/admin/_lib/audit";
import { TimelineStepper } from "../../_components/timeline-stepper";
import { TableEmptyStateRow } from "../../_components/table-empty-state-row";
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

type TransferLine = TransferDetail["items"][number];

function formatQty(value: number) {
  return value.toLocaleString("vi-VN", { maximumFractionDigits: 3 });
}

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
      label:
        transfer.status === "confirmed_receive" ||
        transfer.status === "received"
          ? copy.steps.checking
          : copy.steps.inTransit,
      completed: transfer.status === "received",
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
    copy.actions.confirmKitchen,
    copy.actions.confirmReceive,
    copy.actions.confirmShip,
    copy.actions.markInTransit,
    copy.actions.receive,
    transfer.fromBranchId,
    transfer.status,
    transfer.toBranchId,
    isIntraBranch,
    isBranchScopedOps,
    userBranchId,
    userRole,
  ]);
  const actionDisabled =
    isPending ||
    !actionConfig?.enabled ||
    (isReceiveMode && actionConfig?.action === "receive" && !noteOk);
  const defaultTab = isReceiveMode ? "lines" : "overview";
  const nextStepDescription =
    copy.nextStepDescriptions[
      transfer.status as keyof typeof copy.nextStepDescriptions
    ] ?? copy.nextStepDescriptions.default;
  const nextStepTitle = actionConfig
    ? actionConfig.label
    : transfer.status === "received"
      ? copy.nextStepDoneTitle
      : copy.nextStepWaitingTitle;
  const nextStepBody = actionConfig
    ? actionConfig.enabled
      ? nextStepDescription
      : copy.nextStepWaitingDescription
    : transfer.status === "received"
      ? copy.nextStepDoneDescription
      : nextStepDescription;
  const nextStepTone =
    transfer.status === "confirmed_receive" || hasShort ? "warning" : "info";
  const formattedTotal = messages.inventory.common.currencyCompact(
    formatVND(transfer.total),
  );
  const formattedSubtotal = messages.inventory.common.currencyCompact(
    formatVND(transfer.subtotal),
  );
  const formattedShipping = messages.inventory.common.currencyCompact(
    formatVND(transfer.shipping),
  );
  const lineProgress = isReceiveMode
    ? copy.linesNeedCheck(String(transfer.items.length).padStart(2, "0"))
    : copy.lineProgress(
        String(receivedCount).padStart(2, "0"),
        String(transfer.items.length).padStart(2, "0"),
      );
  const overviewMetrics = [
    {
      label: copy.totalValue,
      value: formattedTotal,
      icon: <IconWalletCards className="size-4 text-primary" />,
    },
    {
      label: copy.totalItems,
      value: String(transfer.items.length).padStart(2, "0"),
      icon: <IconListChecks className="size-4 text-info" />,
    },
    {
      label: isReceiveMode ? copy.needsCheck : copy.recorded,
      value: lineProgress,
      icon: <IconClipboardCheck className="size-4 text-success" />,
    },
    {
      label: copy.route,
      value: `${transfer.fromBranch} → ${transfer.toBranch}`,
      icon: <IconRoute className="size-4 text-warning" />,
    },
  ];

  function updateReceiveQty(ingredientId: number, value: string) {
    setReceiveQty((prev) => ({
      ...prev,
      [ingredientId]: value,
    }));
  }

  function getReceiveQty(item: TransferLine) {
    return Number(receiveQty[item.ingredientId] ?? item.qty);
  }

  function isShortLine(item: TransferLine) {
    const received = getReceiveQty(item);
    return isReceiveMode && Number.isFinite(received) && received < item.qty;
  }

  function renderPrimaryActionButton(className?: string) {
    if (!actionConfig) return null;

    return (
      <Button
        type="button"
        size="touch"
        disabled={actionDisabled}
        className={className}
        onClick={handlePrimaryAction}
      >
        <IconCircleCheck className="size-5" />
        {actionConfig.label}
      </Button>
    );
  }

  function renderReceivedValue(item: TransferLine, className?: string) {
    if (isReceiveMode) {
      return (
        <FormattedNumberInput
          value={receiveQty[item.ingredientId] ?? ""}
          onValueChange={(value) => updateReceiveQty(item.ingredientId, value)}
          maxFractionDigits={3}
          className={className}
        />
      );
    }

    if (item.received != null) {
      return (
        <span className="font-mono tabular-nums">
          {formatQty(item.received)}
        </span>
      );
    }

    return (
      <span className="italic text-muted-foreground">{copy.notReceived}</span>
    );
  }

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

  return (
    <AppPage density="compact">
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
            <IconArrowLeft className="size-4" />
            {tRoute("/inventory/transfers")}
          </Link>
        }
        tabs={
          <AppPageTabs
            defaultValue={defaultTab}
            items={[
              { value: "overview", label: copy.tabsDetail.overview },
              {
                value: "lines",
                label: copy.tabsDetail.lines,
                count: transfer.items.length,
              },
              {
                value: "history",
                label: copy.tabsDetail.history,
                count: auditLogs.length,
              },
            ]}
          >
            <TabsContent value="overview" className="mt-3">
              <div className="space-y-3">
                <AppSection
                  size="sm"
                  tone={nextStepTone}
                  title={copy.nextStepTitle}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold">{nextStepTitle}</p>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {nextStepBody}
                      </p>
                      {actionConfig && !actionConfig.enabled ? (
                        <p className="text-xs font-medium text-muted-foreground">
                          {copy.actionUnavailable}
                        </p>
                      ) : null}
                    </div>
                    {actionConfig?.action !== "receive" ? (
                      <div className="w-full lg:w-auto">
                        {renderPrimaryActionButton("w-full lg:w-auto")}
                      </div>
                    ) : null}
                  </div>
                </AppSection>

                <AppSection size="sm" contentClassName="py-3">
                  <div className="flex justify-center">
                    <TimelineStepper steps={transferSteps} />
                  </div>
                </AppSection>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {overviewMetrics.map((info) => (
                    <Card key={info.label} size="sm">
                      <CardContent className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="secondary">{info.label}</Badge>
                          {info.icon}
                        </div>
                        <p className="min-h-10 break-words text-sm font-semibold leading-5 tabular-nums">
                          {info.value}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {transfer.note ? (
                  <AppSection size="sm" title={copy.transportNote}>
                    <p className="line-clamp-3 break-words text-sm italic">
                      &ldquo;{transfer.note}&rdquo;
                    </p>
                  </AppSection>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="lines" className="mt-3">
              <div className="space-y-3">
                {isReceiveMode ? (
                  <AppSection
                    size="sm"
                    tone={hasShort ? "warning" : "info"}
                    title={copy.receiveWorkTitle}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm leading-6 text-muted-foreground">
                        {copy.receiveWorkDescription(shortLines)}
                      </p>
                      <div className="w-full sm:w-auto">
                        {renderPrimaryActionButton("w-full sm:w-auto")}
                      </div>
                    </div>
                  </AppSection>
                ) : null}

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
                  <AppSection
                    className="overflow-hidden"
                    title={tTerm("ingredientsList")}
                    headerHint={
                      isReceiveMode ? lineProgress : copy.receivedReadonlyHint
                    }
                    contentClassName="p-0"
                  >
                    <div className="space-y-3 p-3 md:hidden">
                      {transfer.items.length === 0 ? (
                        <div className="rounded-md border border-dashed border-border p-4 text-center">
                          <p className="text-sm font-semibold">
                            {copy.emptyTransferItemsTitle}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {copy.emptyTransferItemsDescription}
                          </p>
                        </div>
                      ) : null}

                      {transfer.items.map((item, index) => {
                        const short = isShortLine(item);
                        return (
                          <Card
                            key={item.ingredientId}
                            size="sm"
                            className={
                              short
                                ? "border-warning/40 bg-warning/5"
                                : "bg-muted/20"
                            }
                          >
                            <CardContent className="space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold">
                                    {item.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.sku || copy.noSku}
                                  </p>
                                </div>
                                <Badge
                                  variant={short ? "warning" : "secondary"}
                                >
                                  {copy.lineIndex(index + 1)}
                                </Badge>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <p className="text-muted-foreground">
                                    {copy.sentQty}
                                  </p>
                                  <p className="font-semibold">
                                    {formatQty(item.qty)} {item.unit}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">
                                    {copy.wacCost}
                                  </p>
                                  <p className="font-semibold">
                                    {formatVND(item.cost)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">
                                    {FORM_VI.amount}
                                  </p>
                                  <p className="font-semibold text-primary">
                                    {formatVND(item.total)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">
                                    {copy.unit}
                                  </p>
                                  <p className="font-semibold">{item.unit}</p>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">
                                  {copy.receivedQty}
                                </p>
                                {renderReceivedValue(item)}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>

                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            {[
                              { label: tTerm("ingredient"), align: "" },
                              { label: copy.sentQty, align: "text-right" },
                              { label: copy.unit, align: "" },
                              { label: copy.wacCost, align: "text-right" },
                              { label: copy.lineAmount, align: "text-right" },
                              { label: copy.receivedQty, align: "text-right" },
                            ].map((h) => (
                              <TableHead
                                key={h.label}
                                variant="eyebrow"
                                className={h.align}
                              >
                                {h.label}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transfer.items.length === 0 ? (
                            <TableEmptyStateRow
                              colSpan={6}
                              paddingClassName="py-12"
                              title={copy.emptyTransferItemsTitle}
                              description={copy.emptyTransferItemsDescription}
                            />
                          ) : null}
                          {transfer.items.map((item) => (
                            <TableRow
                              key={item.ingredientId}
                              className="group transition-colors"
                            >
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-semibold">
                                    {item.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {item.sku || copy.noSku}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold tabular-nums">
                                {formatQty(item.qty)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">{item.unit}</Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums">
                                {formatVND(item.cost)}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums">
                                {formatVND(item.total)}
                              </TableCell>
                              <TableCell className="text-right">
                                {renderReceivedValue(item, "text-right")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow className="border-border">
                            <TableCell
                              colSpan={4}
                              className="text-right text-sm text-muted-foreground"
                            >
                              {copy.ingredientValue}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {formattedSubtotal}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                          <TableRow className="border-border">
                            <TableCell
                              colSpan={4}
                              className="text-right text-sm text-muted-foreground"
                            >
                              {copy.shippingFee}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {formattedShipping}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                          <TableRow className="border-border">
                            <TableCell
                              colSpan={4}
                              className="text-right text-sm font-semibold"
                            >
                              {copy.totalValue}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold tabular-nums text-primary">
                              {formattedTotal}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  </AppSection>

                  <AppSection
                    size="sm"
                    tone="info"
                    title={copy.lineSummaryTitle}
                  >
                    <dl className="grid gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {copy.totalTransferValue}
                        </dt>
                        <dd className="mt-1 font-semibold tabular-nums text-primary">
                          {formattedTotal}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {copy.totalItems}
                        </dt>
                        <dd className="mt-1 font-semibold tabular-nums">
                          {String(transfer.items.length).padStart(2, "0")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {isReceiveMode ? copy.needsCheck : copy.recorded}
                        </dt>
                        <dd className="mt-1 font-semibold tabular-nums">
                          {lineProgress}
                        </dd>
                      </div>
                    </dl>
                  </AppSection>
                </div>

                {isReceiveMode && hasShort ? (
                  <AppSection tone="warning" size="sm">
                    <div className="space-y-2">
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
                    </div>
                  </AppSection>
                ) : null}

                <AppDetailFooter
                  leading={
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="touch"
                        className="w-full text-muted-foreground sm:w-auto"
                        onClick={() => window.print()}
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
                  trailing={renderPrimaryActionButton("w-full sm:w-auto")}
                />
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-3">
              <AuditHistoryList logs={auditLogs} />
            </TabsContent>
          </AppPageTabs>
        }
      />
    </AppPage>
  );
}
