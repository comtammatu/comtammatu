"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { MessageSquare } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@comtammatu/ui/components/drawer";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@comtammatu/ui/components/empty";
import { bulkMarkSuspect } from "../actions";

const RATING_EMOJI: Record<number, string> = {
  1: "😡",
  2: "😞",
  3: "😐",
  4: "🙂",
  5: "🤩",
};

const SEVERITY_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  low: "secondary",
  medium: "outline",
  high: "default",
  critical: "destructive",
};

const SEVERITY_LABEL: Record<string, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  critical: "Khẩn cấp",
};

export interface FeedbackRow {
  id: number;
  rating: number;
  comment: string;
  phone: string | null;
  branch_name?: string | null;
  qr_label?: string | null;
  created_at: string;
  is_suspect: boolean;
  // AI fields
  ai_categories?: string[] | null;
  ai_severity?: string | null;
  ai_summary_vi?: string | null;
  ai_sentiment_score?: number | null;
  alert_priority?: number;
}

const columnHelper = createColumnHelper<FeedbackRow>();

// Data columns (no checkbox — checkbox added dynamically in component)
const dataColumns = [
  columnHelper.accessor("rating", {
    header: "Đánh giá",
    cell: (info) => (
      <span className="text-lg" title={`${info.getValue()}/5`}>
        {RATING_EMOJI[info.getValue()] ?? info.getValue()}
      </span>
    ),
    size: 80,
  }),
  columnHelper.accessor("comment", {
    header: "Nhận xét",
    cell: (info) => {
      const text = info.getValue();
      return (
        <span className="text-sm" title={text}>
          {text.length > 60 ? `${text.slice(0, 60)}…` : text}
        </span>
      );
    },
  }),
  columnHelper.accessor("phone", {
    header: "Điện thoại",
    cell: (info) => (
      <span className="text-sm text-muted-foreground">
        {info.getValue() ?? "—"}
      </span>
    ),
    size: 120,
  }),
  columnHelper.accessor("branch_name", {
    header: "Chi nhánh",
    cell: (info) => <span className="text-sm">{info.getValue() ?? "—"}</span>,
    size: 120,
  }),
  columnHelper.accessor("qr_label", {
    header: "QR",
    cell: (info) => (
      <span className="text-sm text-muted-foreground">
        {info.getValue() ?? "—"}
      </span>
    ),
    size: 140,
  }),
  columnHelper.accessor("ai_severity", {
    header: "AI",
    cell: (info) => {
      const sev = info.getValue();
      if (!sev) return null;
      return (
        <Badge
          variant={SEVERITY_VARIANT[sev] ?? "secondary"}
          className="text-xs"
        >
          {SEVERITY_LABEL[sev] ?? sev}
        </Badge>
      );
    },
    size: 90,
  }),
  columnHelper.accessor("created_at", {
    header: "Thời gian",
    cell: (info) => {
      const date = new Date(info.getValue());
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      let relative: string;
      if (diffMins < 1) relative = "Vừa xong";
      else if (diffMins < 60) relative = `${diffMins} phút trước`;
      else if (diffHours < 24) relative = `${diffHours} giờ trước`;
      else relative = `${diffDays} ngày trước`;
      return <span className="text-sm text-muted-foreground">{relative}</span>;
    },
    size: 120,
  }),
  columnHelper.accessor("is_suspect", {
    header: "",
    cell: (info) =>
      info.getValue() ? (
        <Badge variant="destructive" className="text-xs">
          Nghi ngờ
        </Badge>
      ) : null,
    size: 80,
  }),
];

interface FeedbackInboxTableProps {
  feedbacks: FeedbackRow[];
}

function FeedbackDetailDrawer({
  feedback,
  onClose,
}: {
  feedback: FeedbackRow;
  onClose: () => void;
}) {
  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <DrawerHeader className="flex items-center justify-between">
          <DrawerTitle>
            {RATING_EMOJI[feedback.rating] ?? feedback.rating} Phản hồi #
            {feedback.id}
          </DrawerTitle>
          <DrawerClose asChild>
            <Button variant="ghost" size="sm">
              Đóng
            </Button>
          </DrawerClose>
        </DrawerHeader>
        <div className="space-y-4 overflow-y-auto p-4">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground">Đánh giá</p>
              <p className="font-medium">{feedback.rating}/5</p>
            </div>
            <div>
              <p className="text-muted-foreground">Điện thoại</p>
              <p className="font-medium">{feedback.phone ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Chi nhánh</p>
              <p className="font-medium">{feedback.branch_name ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">QR</p>
              <p className="font-medium">{feedback.qr_label ?? "—"}</p>
            </div>
          </div>

          {/* Comment */}
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Nội dung</p>
            <p className="rounded-md border p-3 text-sm leading-relaxed">
              {feedback.comment}
            </p>
          </div>

          {/* AI fields */}
          {feedback.ai_severity ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Phân tích AI</p>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    SEVERITY_VARIANT[feedback.ai_severity] ?? "secondary"
                  }
                >
                  {SEVERITY_LABEL[feedback.ai_severity] ?? feedback.ai_severity}
                </Badge>
                {(feedback.ai_categories ?? []).map((cat) => (
                  <Badge key={cat} variant="outline" className="text-xs">
                    {cat}
                  </Badge>
                ))}
              </div>
              {feedback.ai_summary_vi ? (
                <p className="text-sm text-muted-foreground">
                  {feedback.ai_summary_vi}
                </p>
              ) : null}
              {feedback.ai_sentiment_score !== null &&
              feedback.ai_sentiment_score !== undefined ? (
                <p className="text-xs text-muted-foreground">
                  Cảm xúc: {feedback.ai_sentiment_score.toFixed(2)} (
                  {feedback.ai_sentiment_score >= 0.3
                    ? "tích cực"
                    : feedback.ai_sentiment_score <= -0.3
                      ? "tiêu cực"
                      : "trung tính"}
                  )
                </p>
              ) : null}
              {(feedback.alert_priority ?? 0) >= 10 ? (
                <Badge variant="destructive" className="text-xs">
                  Ưu tiên cao — cần xử lý ngay
                </Badge>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Chưa xử lý AI
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function FeedbackInboxTable({ feedbacks }: FeedbackInboxTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<FeedbackRow | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [isBulkPending, startBulkTransition] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);

  const table = useReactTable({
    data: feedbacks,
    columns: dataColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  const pageRows = table.getRowModel().rows;
  const pageIds = pageRows.map((r) => r.original.id);
  const allPageChecked =
    pageIds.length > 0 && pageIds.every((id) => checkedIds.has(id));
  const somePageChecked = pageIds.some((id) => checkedIds.has(id));

  function toggleAll() {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (allPageChecked) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function toggleOne(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkMark(isSuspect: boolean) {
    setBulkError(null);
    startBulkTransition(async () => {
      const result = await bulkMarkSuspect({
        feedback_ids: Array.from(checkedIds),
        is_suspect: isSuspect,
      });
      if (!result.success) {
        setBulkError(result.error ?? "Có lỗi xảy ra.");
        return;
      }
      setCheckedIds(new Set());
      router.refresh();
    });
  }

  if (feedbacks.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquare />
          </EmptyMedia>
          <EmptyTitle>Chưa có phản ánh nào</EmptyTitle>
        </EmptyHeader>
        <EmptyDescription>
          Khi khách hàng gửi phản ánh, chúng sẽ xuất hiện ở đây.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk toolbar */}
      {checkedIds.size > 0 ? (
        <div className="flex items-center gap-3 rounded-md border px-4 py-2">
          <span className="text-sm text-muted-foreground">
            Đã chọn {checkedIds.size} phản ánh
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkMark(true)}
            disabled={isBulkPending}
          >
            Đánh dấu nghi spam
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkMark(false)}
            disabled={isBulkPending}
          >
            Bỏ đánh dấu
          </Button>
          {bulkError ? (
            <span className="text-destructive text-sm">{bulkError}</span>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {/* Checkbox header */}
                <TableHead style={{ width: 40 }}>
                  <Checkbox
                    checked={
                      allPageChecked
                        ? true
                        : somePageChecked
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={toggleAll}
                    aria-label="Chọn tất cả trang hiện tại"
                  />
                </TableHead>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => setSelected(row.original)}
              >
                {/* Checkbox cell — stop propagation to avoid opening drawer */}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={checkedIds.has(row.original.id)}
                    onCheckedChange={() => toggleOne(row.original.id)}
                    aria-label={`Chọn phản ánh #${row.original.id}`}
                  />
                </TableCell>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Trang {table.getState().pagination.pageIndex + 1} /{" "}
            {table.getPageCount()}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Sau
            </Button>
          </div>
        </div>
      ) : null}

      {selected ? (
        <FeedbackDetailDrawer
          feedback={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
