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
import { AppDetailFooter, AppPage, AppPageHeader, AppSection } from "@/components/surface";
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

  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Kho hàng"
        title={transfer.code}
        description={copy.routeMeta(transfer.fromBranch, transfer.toBranch, transfer.date)}
        badge={{ children: getInventoryStatusLabel(transfer.status), variant: getInventoryStatusBadgeVariant(transfer.status) }}
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
            <TabsContent value="overview" className="mt-4">
              <div className="space-y-6">
          {/* Timeline */}
          <AppSection contentClassName="py-6">
            <div className="flex justify-center">
              <TimelineStepper steps={transferSteps} />
            </div>
          </AppSection>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: copy.totalValue,
                value: `${formatVND(transfer.total)}đ`,
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
              <Card key={info.label}>
                <CardContent>
                  <Badge variant="secondary">{info.label}</Badge>
                  <p className="mt-3 flex items-center gap-1 text-lg font-semibold">
                    {info.icon} {info.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Note */}
          {transfer.note && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {copy.transportNote}
                </p>
                <p className="mt-1 line-clamp-3 break-words text-sm italic">
                  &ldquo;{transfer.note}&rdquo;
                </p>
              </CardContent>
            </Card>
          )}
              </div>
            </TabsContent>

            <TabsContent value="lines" className="mt-4">
              <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Items table */}
            <div className="lg:col-span-2">
              <AppSection
                className="overflow-hidden"
                title={tTerm("ingredientsList")}
                headerHint={
                  isReceiveMode
                    ? copy.receiveInstructions
                    : copy.receivedReadonlyHint
                }
                contentClassName="p-0"
              >
                  <div className="space-y-3 p-6 md:hidden">
                    {transfer.items.map((item) => (
                      <Card key={item.sku || item.name} className="bg-muted/30">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.sku}
                            </p>
                          </div>
                          <Badge variant="secondary">{item.unit}</Badge>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground">
                              {copy.sentQty}
                            </p>
                            <p className="font-semibold">{item.qty}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">
                              {copy.receivedQty}
                            </p>
                            {isReceiveMode ? (
                              <FormattedNumberInput
                                value={receiveQty[item.ingredientId] ?? ""}
                                onValueChange={(value) =>
                                  setReceiveQty((prev) => ({
                                    ...prev,
                                    [item.ingredientId]: value,
                                  }))
                                }
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
                        </div>
                      </Card>
                    ))}
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
                              className={`px-6 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider ${h.align}`}
                            >
                              {h.label}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transfer.items.length === 0 && (
                          <TableEmptyStateRow
                            colSpan={6}
                            paddingClassName="py-16"
                            title={copy.emptyTransferItemsTitle}
                            description={copy.emptyTransferItemsDescription}
                          />
                        )}
                        {transfer.items.map((item) => (
                          <TableRow
                            key={item.sku || item.name}
                            className="group transition-colors"
                          >
                            <TableCell className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold">{item.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {item.sku}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="px-6 py-4 text-right font-mono tabular-nums font-semibold">
                              {item.qty}
                            </TableCell>
                            <TableCell className="px-6 py-4">
                              <Badge variant="secondary">{item.unit}</Badge>
                            </TableCell>
                            <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                              {formatVND(item.cost)}
                            </TableCell>
                            <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                              {formatVND(item.total)}
                            </TableCell>
                            <TableCell className="px-6 py-4 text-right">
                              {isReceiveMode ? (
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
                                <span className="font-mono tabular-nums">
                                  {item.received}
                                </span>
                              ) : (
                                <span className="italic text-muted-foreground">
                                  {copy.notReceived}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow className="border-border">
                          <TableCell
                            colSpan={4}
                            className="px-6 py-3 text-right text-sm text-muted-foreground"
                          >
                            {copy.ingredientValue}
                          </TableCell>
                          <TableCell className="px-6 py-3 text-right font-mono tabular-nums">
                            {messages.inventory.common.currencyCompact(
                              formatVND(transfer.subtotal),
                            )}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                        <TableRow className="border-border">
                          <TableCell
                            colSpan={4}
                            className="px-6 py-3 text-right text-sm text-muted-foreground"
                          >
                            {copy.shippingFee}
                          </TableCell>
                          <TableCell className="px-6 py-3 text-right font-mono tabular-nums">
                            {messages.inventory.common.currencyCompact(
                              formatVND(transfer.shipping),
                            )}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                        <TableRow className="border-border">
                          <TableCell
                            colSpan={4}
                            className="px-6 py-3 text-right text-sm font-bold"
                          >
                            {copy.totalValue}
                          </TableCell>
                          <TableCell className="px-6 py-3 text-right font-mono tabular-nums font-bold text-primary">
                            {messages.inventory.common.currencyCompact(
                              formatVND(transfer.total),
                            )}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
              </AppSection>
            </div>

            {/* Sidebar value card */}
            <Card className="h-fit border-primary/20 bg-primary/5">
              <CardContent className="space-y-3 pt-6">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {copy.totalTransferValue}
                </p>
                <p className="text-2xl font-black tabular-nums text-primary">
                  {messages.inventory.common.currencyCompact(
                    formatVND(transfer.total),
                  )}
                </p>
                <Card>
                  <CardContent className="space-y-1 pt-6">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {copy.totalItems}
                    </p>
                    <p className="text-lg font-bold tabular-nums">
                      {String(transfer.items.length).padStart(2, "0")}
                    </p>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </div>

          {isReceiveMode && hasShort ? (
            <AppSection tone="warning" contentClassName="space-y-2 pt-6">
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
                  className="rounded-full px-6 font-bold text-muted-foreground"
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
                  (isReceiveMode && actionConfig?.action === "receive" && !noteOk)
                }
                className="rounded-full px-10 font-bold shadow-lg"
                onClick={handlePrimaryAction}
              >
                <IconCircleCheck className="size-5" />
                {actionConfig?.label ?? copy.completedSlip}
              </Button>
            }
          />
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <AuditHistoryList logs={auditLogs} />
            </TabsContent>
          </AppPageTabs>
        }
      />
    </AppPage>
  );
}
