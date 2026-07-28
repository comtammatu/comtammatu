"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { BRANCH_VI, FORM_VI } from "@comtammatu/shared/messages";
import { toast } from "@comtammatu/ui/components/sonner";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  AppEmptyState,
  AppListFrame,
  AppToolbar,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { useFormControlSize } from "@/components/form/control-size";
import { QrCodeImage } from "@/components/qr-code-image";
import {
  RowActionsMenu,
  RowActionsContextMenuItems,
  type RowActionItem,
} from "@/components/row-actions-menu";
import {
  deactivateFeedbackQr,
  rotateFeedbackQr,
  type FeedbackQrRow,
} from "../actions";
import { feedbackCopy } from "@lib/messages/feedback";

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

export type FeedbackQrTableOption = {
  id: number;
  number: number;
  branchId: number;
};

export type FeedbackListPresentation = "owner" | "branch";

export function QrManagement({
  items,
  canManage,
  lockBranch,
  branches = [],
  selectedBranchId = null,
  basePath = "/feedback/qr",
  showBranchFilter = false,
  presentation = "owner",
}: {
  items: FeedbackQrRow[];
  canManage: boolean;
  lockBranch: boolean;
  branches?: { id: number; name: string }[];
  selectedBranchId?: number | null;
  basePath?: string;
  showBranchFilter?: boolean;
  presentation?: FeedbackListPresentation;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const controlSize = useFormControlSize();
  const [isPending, startTransition] = useTransition();
  const [openActionRowId, setOpenActionRowId] = useState<number | null>(null);
  const origin = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    [],
  );
  const forceTouch = presentation === "branch";

  function refresh() {
    router.refresh();
  }

  function pushBranchFilter(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("branch");
    else params.set("branch", value);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function resolveUrl(item: FeedbackQrRow) {
    return item.url || `${origin}/r/${item.token}`;
  }

  function getRowActions(item: FeedbackQrRow): RowActionItem[] {
    const url = resolveUrl(item);
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
                toast.error(
                  result.error ?? feedbackCopy.toastDeactivateFailed,
                );
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

  const columns: DataTableColumn<FeedbackQrRow>[] = [
    {
      key: "qr",
      header: "QR",
      render: (item) => (
        <QrCodeImage
          value={resolveUrl(item)}
          alt={item.label}
          className="size-16"
        />
      ),
    },
    {
      key: "label",
      header: feedbackCopy.qrLabel,
      render: (item) => item.label,
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (item) => (
        <Badge variant={item.isActive ? "default" : "secondary"}>
          {item.isActive
            ? feedbackCopy.statusActive
            : feedbackCopy.statusInactive}
        </Badge>
      ),
    },
    ...(!lockBranch
      ? [
          {
            key: "branch",
            header: BRANCH_VI.long,
            render: (item: FeedbackQrRow) => item.branchName,
          } satisfies DataTableColumn<FeedbackQrRow>,
        ]
      : []),
    {
      key: "table",
      header: feedbackCopy.qrTable,
      render: (item) =>
        item.tableNumber != null
          ? feedbackCopy.tableLabel.replace(
              "{number}",
              String(item.tableNumber),
            )
          : feedbackCopy.qrBranchWide,
    },
    {
      key: "url",
      header: "URL",
      className: "max-w-56",
      render: (item) => (
        <span className="block truncate font-mono text-xs text-muted-foreground">
          {resolveUrl(item)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12 text-right",
      render: (item) => (
        <RowActionsMenu
          items={getRowActions(item)}
          open={openActionRowId === item.id}
          onOpenChange={(open) =>
            setOpenActionRowId(open ? item.id : null)
          }
        />
      ),
    },
  ];

  return (
    <AppListFrame
      contentScroll
      toolbar={
        showBranchFilter ? (
          <AppToolbar
            variant="inline"
            filters={
              <Select
                value={
                  selectedBranchId != null ? String(selectedBranchId) : "all"
                }
                onValueChange={pushBranchFilter}
              >
                <SelectTrigger
                  size={controlSize}
                  className="min-w-40"
                  aria-label={BRANCH_VI.selectAll}
                >
                  <SelectValue placeholder={BRANCH_VI.selectAll} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{BRANCH_VI.selectAll}</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={String(branch.id)}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <AppEmptyState mode="no-data" description={feedbackCopy.qrEmpty} />
      ) : (
        <DataTable
          columns={columns}
          data={items}
          getRowKey={(row) => row.id}
          emptyTitle={feedbackCopy.qrEmpty}
          mobileBreakpoint={forceTouch ? Number.POSITIVE_INFINITY : undefined}
          renderRowContextMenu={
            forceTouch
              ? undefined
              : (row) => (
                  <RowActionsContextMenuItems items={getRowActions(row)} />
                )
          }
          mobileCardRender={(item) => {
            const url = resolveUrl(item);
            const actions = getRowActions(item);
            return (
              <Item variant="outline" className="items-start gap-3">
                <QrCodeImage
                  value={url}
                  alt={item.label}
                  className="size-24 shrink-0"
                />
                <ItemContent className="gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <ItemTitle>{item.label}</ItemTitle>
                    <Badge variant={item.isActive ? "default" : "secondary"}>
                      {item.isActive
                        ? feedbackCopy.statusActive
                        : feedbackCopy.statusInactive}
                    </Badge>
                  </div>
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
                  <ItemDescription className="break-all font-mono text-xs">
                    {url}
                  </ItemDescription>
                  <ItemActions className="justify-start">
                    <RowActionsMenu items={actions} />
                  </ItemActions>
                </ItemContent>
              </Item>
            );
          }}
        />
      )}
    </AppListFrame>
  );
}
