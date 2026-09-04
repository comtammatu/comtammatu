"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Button } from "@comtammatu/ui/components/button";
import { BRANCH_VI } from "@comtammatu/shared/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";
import {
  AppListFrame,
  AppToolbar,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { useFormControlSize } from "@/components/form/control-size";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import type { FeedbackInboxRow } from "../actions";
import { feedbackCopy } from "@lib/messages/feedback";
import { FEEDBACK_PAGE_SIZE } from "@lib/feedback/contracts";
import type { FeedbackListPresentation } from "./qr-management";

export function FeedbackInbox({
  items,
  total,
  page,
  branches,
  selectedBranchId,
  basePath,
  showBranchFilter,
  presentation = "owner",
}: {
  items: FeedbackInboxRow[];
  total: number;
  page: number;
  branches: { id: number; name: string }[];
  selectedBranchId: number | null;
  basePath: string;
  showBranchFilter: boolean;
  presentation?: FeedbackListPresentation;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const controlSize = useFormControlSize();
  const forceTouch = presentation === "branch";

  function pushParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value == null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  const columns: DataTableColumn<FeedbackInboxRow>[] = [
    {
      key: "createdAt",
      header: feedbackCopy.createdAt,
      render: (item) => (
        <span className="whitespace-nowrap">
          {formatVNDateTime(item.createdAt)}
        </span>
      ),
    },
    ...(showBranchFilter
      ? [
          {
            key: "branch",
            header: BRANCH_VI.long,
            render: (item: FeedbackInboxRow) => item.branchName,
          } satisfies DataTableColumn<FeedbackInboxRow>,
        ]
      : []),
    {
      key: "orderNumber",
      header: feedbackCopy.orderNumber,
      render: (item) => item.orderNumber ?? "—",
    },
    {
      key: "tableNumber",
      header: feedbackCopy.tableNumber,
      render: (item) =>
        item.tableNumber
          ? feedbackCopy.tableLabel.replace("{number}", item.tableNumber)
          : "—",
    },
    {
      key: "orderCreatedAt",
      header: feedbackCopy.orderCreatedAt,
      render: (item) =>
        item.orderCreatedAt ? (
          <span className="whitespace-nowrap">
            {formatVNDateTime(item.orderCreatedAt)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "rating",
      header: feedbackCopy.rating,
      render: (item) => item.rating,
    },
    {
      key: "comment",
      header: feedbackCopy.comment,
      className: "max-w-md",
      render: (item) => (
        <span className="line-clamp-2">{item.comment ?? "—"}</span>
      ),
    },
    {
      key: "qr",
      header: "QR",
      render: (item) => item.qrLabel,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (item) =>
        item.rating <= 2 ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs text-destructive hover:bg-destructive/10"
            render={
              <Link
                href={`/work?q=Ph%E1%BA%A3n+h%E1%BB%93i+%23${item.id}`}
                target="_blank"
              />
            }
          >
            <span>{feedbackCopy.resolveTaskCta}</span>
            <span aria-hidden="true">↗</span>
          </Button>
        ) : null,
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
                onValueChange={(value) => {
                  pushParams({
                    branch: value === "all" ? null : value,
                    page: "1",
                  });
                }}
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
      <DataTable
        className="[&_table]:table-fixed"
        columns={columns}
        data={items}
        getRowKey={(row) => row.id}
        pageSize={FEEDBACK_PAGE_SIZE}
        currentPage={page}
        totalCount={total}
        onPageChange={(nextPage) => pushParams({ page: String(nextPage) })}
        emptyTitle={feedbackCopy.inboxEmpty}
        emptyMode="no-data"
        mobileBreakpoint={forceTouch ? Number.POSITIVE_INFINITY : undefined}
        mobileCardRender={(item) => (
          <Item variant="outline" className="w-full text-left">
            <ItemHeader>
              <ItemTitle>
                {feedbackCopy.rating}: {item.rating}
              </ItemTitle>
              <span className="text-xs text-muted-foreground">
                {formatVNDateTime(item.createdAt)}
                {showBranchFilter ? ` · ${item.branchName}` : ""}
              </span>
            </ItemHeader>
            <ItemContent className="min-w-0 text-left">
              {item.orderNumber || item.tableNumber ? (
                <ItemDescription className="truncate font-medium text-foreground">
                  {[
                    item.orderNumber
                      ? `${feedbackCopy.orderNumber} ${item.orderNumber}`
                      : null,
                    item.tableNumber
                      ? feedbackCopy.tableLabel.replace(
                          "{number}",
                          item.tableNumber,
                        )
                      : null,
                    item.orderCreatedAt
                      ? formatVNDateTime(item.orderCreatedAt)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </ItemDescription>
              ) : null}
              <ItemDescription className="text-xs text-muted-foreground line-clamp-3">
                {item.comment ?? "—"}
              </ItemDescription>
              <ItemDescription className="text-xs text-muted-foreground">
                QR: {item.qrLabel}
              </ItemDescription>
            </ItemContent>
            {item.rating <= 2 ? (
              <ItemFooter className="pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs text-destructive hover:bg-destructive/10"
                  render={
                    <Link
                      href={`/work?q=Ph%E1%BA%A3n+h%E1%BB%93i+%23${item.id}`}
                      target="_blank"
                    />
                  }
                >
                  <span>{feedbackCopy.resolveTaskCskhCta}</span>
                  <span aria-hidden="true">↗</span>
                </Button>
              </ItemFooter>
            ) : null}
          </Item>
        )}
      />
    </AppListFrame>
  );
}
