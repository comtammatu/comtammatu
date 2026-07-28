"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@comtammatu/ui/components/sonner";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppEmptyState, AppSection } from "@/components/surface";
import { QrCodeImage } from "@/components/qr-code-image";
import {
  createFeedbackQr,
  deactivateFeedbackQr,
  rotateFeedbackQr,
  type FeedbackQrRow,
} from "../actions";
import { feedbackCopy } from "@lib/messages/feedback";

export function QrManagement({
  items,
  branchId,
  tables,
  canManage,
  lockBranch,
}: {
  items: FeedbackQrRow[];
  branchId: number;
  tables: { id: number; number: number }[];
  canManage: boolean;
  lockBranch: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [tableId, setTableId] = useState<string>("branch");
  const origin = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    [],
  );

  function refresh() {
    router.refresh();
  }

  function onCreate() {
    if (!label.trim()) {
      toast.error(feedbackCopy.toastLabelRequired);
      return;
    }
    startTransition(async () => {
      const result = await createFeedbackQr({
        branchId,
        tableId: tableId === "branch" ? null : Number(tableId),
        label: label.trim(),
      });
      if (!result.success) {
        toast.error(result.error ?? feedbackCopy.toastCreateFailed);
        return;
      }
      toast.success(feedbackCopy.toastCreateOk);
      setLabel("");
      setTableId("branch");
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <AppSection title={feedbackCopy.qrCreate} size="sm">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="qr-label">{feedbackCopy.qrLabel}</Label>
              <Input
                id="qr-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={
                  lockBranch
                    ? feedbackCopy.placeholderBranchWide
                    : feedbackCopy.placeholderWithTable
                }
                maxLength={200}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{feedbackCopy.qrTable}</Label>
              <Select value={tableId} onValueChange={setTableId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="branch">
                    {feedbackCopy.qrBranchWide}
                  </SelectItem>
                  {tables.map((table) => (
                    <SelectItem key={table.id} value={String(table.id)}>
                      {feedbackCopy.tableLabel.replace(
                        "{number}",
                        String(table.number),
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                onClick={onCreate}
                disabled={isPending}
                className="w-full"
              >
                {feedbackCopy.qrCreate}
              </Button>
            </div>
          </div>
        </AppSection>
      ) : null}

      {items.length === 0 ? (
        <AppEmptyState mode="no-data" description={feedbackCopy.qrEmpty} />
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((item) => {
            const url = item.url || `${origin}/r/${item.token}`;
            return (
              <Item key={item.id} variant="outline" className="items-start gap-4">
                <QrCodeImage
                  value={url}
                  alt={item.label}
                  className="mx-auto size-40 shrink-0"
                />
                <ItemContent className="gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <ItemTitle>{item.label}</ItemTitle>
                    <Badge variant={item.isActive ? "default" : "secondary"}>
                      {item.isActive
                        ? feedbackCopy.statusActive
                        : feedbackCopy.statusInactive}
                    </Badge>
                    {!lockBranch ? (
                      <ItemDescription>{item.branchName}</ItemDescription>
                    ) : null}
                    <ItemDescription>
                      {item.tableNumber != null
                        ? feedbackCopy.tableLabel.replace(
                            "{number}",
                            String(item.tableNumber),
                          )
                        : feedbackCopy.qrBranchWide}
                    </ItemDescription>
                  </div>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {url}
                  </p>
                  <ItemActions className="justify-start">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await navigator.clipboard.writeText(url);
                        toast.success(feedbackCopy.copied);
                      }}
                    >
                      {feedbackCopy.copyUrl}
                    </Button>
                    {canManage && item.isActive ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => {
                            startTransition(async () => {
                              const result = await rotateFeedbackQr({
                                qrCodeId: item.id,
                                branchId: item.branchId,
                              });
                              if (!result.success) {
                                toast.error(
                                  result.error ?? feedbackCopy.toastRotateFailed,
                                );
                                return;
                              }
                              toast.success(feedbackCopy.toastRotateOk);
                              refresh();
                            });
                          }}
                        >
                          {feedbackCopy.qrRotate}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={isPending}
                          onClick={() => {
                            startTransition(async () => {
                              const result = await deactivateFeedbackQr({
                                qrCodeId: item.id,
                                branchId: item.branchId,
                              });
                              if (!result.success) {
                                toast.error(
                                  result.error ??
                                    feedbackCopy.toastDeactivateFailed,
                                );
                                return;
                              }
                              toast.success(feedbackCopy.toastDeactivateOk);
                              refresh();
                            });
                          }}
                        >
                          {feedbackCopy.qrDeactivate}
                        </Button>
                      </>
                    ) : null}
                  </ItemActions>
                </ItemContent>
              </Item>
            );
          })}
        </div>
      )}
    </div>
  );
}
