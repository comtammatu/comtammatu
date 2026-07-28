"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { AppEmptyState } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import type { FeedbackInboxRow } from "../actions";
import { feedbackCopy } from "@lib/messages/feedback";
import { FEEDBACK_PAGE_SIZE } from "@lib/feedback/contracts";

export function FeedbackInbox({
  items,
  total,
  page,
  branches,
  selectedBranchId,
  basePath,
  showBranchFilter,
}: {
  items: FeedbackInboxRow[];
  total: number;
  page: number;
  branches: { id: number; name: string }[];
  selectedBranchId: number | null;
  basePath: string;
  showBranchFilter: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageCount = Math.max(1, Math.ceil(total / FEEDBACK_PAGE_SIZE));

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
            header: feedbackCopy.branch,
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
    <div className="flex flex-col gap-4">
      {showBranchFilter ? (
        <div className="flex max-w-xs flex-col gap-2">
          <span className="text-sm text-muted-foreground">
            {feedbackCopy.filterBranch}
          </span>
          <Select
            value={selectedBranchId != null ? String(selectedBranchId) : "all"}
            onValueChange={(value) => {
              pushParams({
                branch: value === "all" ? null : value,
                page: "1",
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={feedbackCopy.allBranches} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{feedbackCopy.allBranches}</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {items.length === 0 ? (
        <AppEmptyState mode="no-data" description={feedbackCopy.inboxEmpty} />
      ) : (
        <DataTable columns={columns} data={items} getRowKey={(row) => row.id} />
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1}
            onClick={() => pushParams({ page: String(page - 1) })}
          >
            {feedbackCopy.pagePrev}
          </Button>
          <span className="text-sm text-muted-foreground">
            {feedbackCopy.pageOf
              .replace("{page}", String(page))
              .replace("{pageCount}", String(pageCount))}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => pushParams({ page: String(page + 1) })}
          >
            {feedbackCopy.pageNext}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
