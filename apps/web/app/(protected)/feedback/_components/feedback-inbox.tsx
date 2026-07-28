"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { BRANCH_VI } from "@comtammatu/shared/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";
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
import {
  Item,
  ItemContent,
  ItemDescription,
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
      {items.length === 0 ? (
        <AppEmptyState mode="no-data" description={feedbackCopy.inboxEmpty} />
      ) : (
        <DataTable
          columns={columns}
          data={items}
          getRowKey={(row) => row.id}
          pageSize={FEEDBACK_PAGE_SIZE}
          currentPage={page}
          totalCount={total}
          onPageChange={(nextPage) => pushParams({ page: String(nextPage) })}
          emptyTitle={feedbackCopy.inboxEmpty}
          mobileBreakpoint={forceTouch ? Number.POSITIVE_INFINITY : undefined}
          mobileCardRender={(item) => (
            <Item variant="outline">
              <ItemContent className="gap-1">
                <ItemTitle>
                  {feedbackCopy.rating}: {item.rating}
                </ItemTitle>
                <ItemDescription>
                  {formatVNDateTime(item.createdAt)}
                  {showBranchFilter ? ` · ${item.branchName}` : ""}
                </ItemDescription>
                <ItemDescription className="line-clamp-3">
                  {item.comment ?? "—"}
                </ItemDescription>
                <ItemDescription>QR: {item.qrLabel}</ItemDescription>
              </ItemContent>
            </Item>
          )}
        />
      )}
    </AppListFrame>
  );
}
