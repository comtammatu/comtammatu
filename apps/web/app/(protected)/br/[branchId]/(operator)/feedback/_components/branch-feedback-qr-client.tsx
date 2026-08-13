"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemActions,
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
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { QrCodeImage } from "@/components/qr-code-image";
import { RowActionsMenu, type RowActionItem } from "@/components/row-actions-menu";
import { AppEmptyState, AppSheet } from "@/components/surface";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import {
  createFeedbackQr,
  deactivateFeedbackQr,
  rotateFeedbackQr,
  type FeedbackQrRow,
} from "@/(protected)/feedback/actions";
import { feedbackCopy } from "@lib/messages/feedback";

const BRANCH_WIDE_TABLE = "branch";

export type BranchFeedbackQrTableOption = {
  id: number;
  number: number;
  branchId: number;
};

function downloadFeedbackQrPng(url: string, qrCodeId: number) {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 1024,
  }).then((dataUrl) => {
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `ma-qr-phan-hoi-${qrCodeId}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  });
}

function resolveUrl(item: FeedbackQrRow, origin: string) {
  return item.url || `${origin}/r/${item.token}`;
}

export function BranchFeedbackQrClient({
  branchId,
  items,
  canManage,
  tables,
}: {
  branchId: number;
  items: FeedbackQrRow[];
  canManage: boolean;
  tables: BranchFeedbackQrTableOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [tableKey, setTableKey] = useState(BRANCH_WIDE_TABLE);
  const origin = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    [],
  );

  function refresh() {
    router.refresh();
  }

  function getRowActions(item: FeedbackQrRow): RowActionItem[] {
    const url = resolveUrl(item, origin);
    const actions: RowActionItem[] = [
      {
        key: "copy",
        label: feedbackCopy.copyUrl,
        onSelect: () => {
          void navigator.clipboard.writeText(url).then(() => {
            toast.success(feedbackCopy.copied);
          });
        },
      },
      {
        key: "download",
        label: feedbackCopy.downloadQr,
        onSelect: () => {
          void downloadFeedbackQrPng(url, item.id)
            .then(() => {
              toast.success(feedbackCopy.downloadOk);
            })
            .catch(() => {
              toast.error(feedbackCopy.downloadFailed);
            });
        },
      },
    ];
    if (canManage && item.isActive) {
      actions.push(
        {
          key: "rotate",
          label: feedbackCopy.qrRotate,
          disabled: isPending,
          onSelect: () => {
            startTransition(async () => {
              const result = await rotateFeedbackQr({
                qrCodeId: item.id,
                branchId: item.branchId,
              });
              if (!result.success) {
                toast.error(result.error ?? feedbackCopy.toastRotateFailed);
                return;
              }
              toast.success(feedbackCopy.toastRotateOk);
              refresh();
            });
          },
        },
        {
          key: "deactivate",
          label: feedbackCopy.qrDeactivate,
          destructive: true,
          separatorBefore: true,
          disabled: isPending,
          onSelect: () => {
            startTransition(async () => {
              const result = await deactivateFeedbackQr({
                qrCodeId: item.id,
                branchId: item.branchId,
              });
              if (!result.success) {
                toast.error(result.error ?? feedbackCopy.toastDeactivateFailed);
                return;
              }
              toast.success(feedbackCopy.toastDeactivateOk);
              refresh();
            });
          },
        },
      );
    }
    return actions;
  }

  function handleCreate() {
    const trimmed = label.trim();
    if (!trimmed) {
      toast.error(feedbackCopy.labelRequired);
      return;
    }
    const tableId =
      tableKey === BRANCH_WIDE_TABLE ? null : Number(tableKey);
    startTransition(async () => {
      const result = await createFeedbackQr({
        branchId,
        tableId,
        label: trimmed,
      });
      if (!result.success) {
        toast.error(result.error ?? feedbackCopy.toastCreateFailed);
        return;
      }
      toast.success(feedbackCopy.toastCreateOk);
      setCreateOpen(false);
      setLabel("");
      setTableKey(BRANCH_WIDE_TABLE);
      refresh();
    });
  }

  return (
    <>
      {canManage ? (
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="w-full border-dashed"
          onClick={() => setCreateOpen(true)}
        >
          {feedbackCopy.qrCreate}
        </Button>
      ) : null}

      {items.length === 0 ? (
        <AppEmptyState compact title={feedbackCopy.qrEmpty} symbol="riceGrain" />
      ) : (
        <BranchOperatorPanel contentFlush>
          <ItemGroup className="gap-2">
            {items.map((item) => {
              const url = resolveUrl(item, origin);
              return (
                <Item
                  key={item.id}
                  variant="outline"
                  size="sm"
                  className="min-h-12 items-start gap-3"
                >
                  <QrCodeImage
                    value={url}
                    alt={item.label}
                    className="size-24 shrink-0"
                  />
                  <ItemContent className="min-w-0 gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ItemTitle className="text-sm font-medium">
                        {item.label}
                      </ItemTitle>
                      <Badge variant={item.isActive ? "default" : "secondary"}>
                        {item.isActive
                          ? feedbackCopy.statusActive
                          : feedbackCopy.statusInactive}
                      </Badge>
                    </div>
                    <ItemDescription>
                      {item.tableNumber != null
                        ? feedbackCopy.tableLabel.replace(
                            "{number}",
                            String(item.tableNumber),
                          )
                        : feedbackCopy.qrBranchWide}
                    </ItemDescription>
                    <ItemDescription className="break-all font-mono text-xs">
                      {url}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="shrink-0">
                    <RowActionsMenu
                      items={getRowActions(item)}
                      triggerSize="icon-touch"
                    />
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        </BranchOperatorPanel>
      )}

      <AppSheet
        open={createOpen}
        onOpenChange={(next) => {
          setCreateOpen(next);
          if (!next) {
            setLabel("");
            setTableKey(BRANCH_WIDE_TABLE);
          }
        }}
        title={feedbackCopy.qrCreate}
        side="bottom"
        footer={
          <Button
            type="button"
            size="touch-lg"
            className="w-full"
            onClick={handleCreate}
            disabled={isPending}
          >
            {isPending ? <Spinner className="mr-2" /> : null}
            {feedbackCopy.qrCreate}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="branch-feedback-qr-label">
              {feedbackCopy.qrLabel}
            </FieldLabel>
            <Input
              id="branch-feedback-qr-label"
              controlSize="touch"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={feedbackCopy.placeholderBranchWide}
            />
          </Field>
          <Field>
            <FieldLabel>{feedbackCopy.qrTable}</FieldLabel>
            <Select value={tableKey} onValueChange={setTableKey}>
              <SelectTrigger size="touch" aria-label={feedbackCopy.qrTable}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BRANCH_WIDE_TABLE} size="touch">
                  {feedbackCopy.qrBranchWide}
                </SelectItem>
                {tables.map((table) => (
                  <SelectItem
                    key={table.id}
                    value={String(table.id)}
                    size="touch"
                  >
                    {feedbackCopy.tableLabel.replace(
                      "{number}",
                      String(table.number),
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </AppSheet>
    </>
  );
}
