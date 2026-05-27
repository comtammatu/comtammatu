"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  RefreshCcw as IconRefresh,
  PlayCircle as IconPlay,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppSection } from "@/components/surface";
import { TableEmptyStateRow } from "@/components/table-empty-state-row";
import { BusinessDateField, SelectField } from "@/components/form";
import {
  formatVNDateTime,
  getYesterdayVNDateString,
} from "@/_lib/format-datetime";
import {
  listSummaryRunQueue,
  runDailySummaryForBranch,
} from "../summary-invoice-actions";
import type { AccessibleBranch, SummaryQueueRow } from "./types";

const STATUS_LABEL: Record<SummaryQueueRow["status"], string> = {
  queued: "Đang chờ",
  running: "Đang chạy",
  issued: "Đã phát hành",
  failed: "Thất bại",
  skipped: "Bỏ qua",
};

const STATUS_VARIANT: Record<
  SummaryQueueRow["status"],
  "secondary" | "default" | "destructive" | "outline"
> = {
  queued: "outline",
  running: "secondary",
  issued: "default",
  failed: "destructive",
  skipped: "secondary",
};

const TRIGGER_LABEL: Record<SummaryQueueRow["trigger_source"], string> = {
  cron: "Tự động",
  manual: "Thủ công",
};

function formatDateTime(iso: string | null): string {
  return formatVNDateTime(iso);
}

const formSchema = z.object({
  branchId: z.string().min(1, "Vui lòng chọn chi nhánh"),
  summaryDate: z
    .string()
    .min(1, "Vui lòng chọn ngày")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ"),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  initialBranches: AccessibleBranch[];
  initialQueue: SummaryQueueRow[];
}

export function SummaryClient({ initialBranches, initialQueue }: Props) {
  const [queue, setQueue] = useState(initialQueue);
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, startRefresh] = useTransition();

  const branchById = new Map(
    initialBranches.map((b) => [String(b.id), b.name]),
  );

  const branchOptions = initialBranches.map((b) => ({
    value: String(b.id),
    label: b.name,
  }));

  const filterOptions = [
    { value: "all", label: "Tất cả chi nhánh" },
    ...branchOptions,
  ];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      branchId: initialBranches[0] ? String(initialBranches[0].id) : "",
      summaryDate: getYesterdayVNDateString(),
    },
  });

  const filterForm = useForm<{ branchFilter: string }>({
    defaultValues: { branchFilter: "all" },
  });

  const refreshQueue = (branchId: string) => {
    startRefresh(async () => {
      const result = await listSummaryRunQueue(
        branchId === "all" ? null : Number(branchId),
        30,
      );
      if (result.success) {
        setQueue((result.data ?? []) as SummaryQueueRow[]);
      } else {
        toast.error(result.error ?? "Không thể tải hàng đợi.");
      }
    });
  };

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = await runDailySummaryForBranch(
        Number(values.branchId),
        values.summaryDate,
      );
      if (!result.success) {
        toast.error(result.error ?? "Không thể tạo HĐ tổng hợp.");
        return;
      }
      const data = result.data as
        | { outcome: string; tax_invoice_id: number | null }
        | undefined;
      if (data?.outcome === "skipped") {
        toast.info("Đã bỏ qua: HĐ tổng hợp đã tồn tại hoặc không có đơn nào.");
      } else if (data?.outcome === "failed") {
        toast.error("Xử lý thất bại — kiểm tra dòng lỗi trong hàng đợi.");
      } else {
        toast.success("Đã tạo HĐ tổng hợp.");
      }
      refreshQueue(branchFilter);
    });
  };

  return (
    <>
      <AppSection
        title="Trigger thủ công"
        description="Chọn chi nhánh và ngày để tạo HĐ tổng hợp B2C ngoài lịch cron tự động."
      >
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <SelectField
            control={form.control}
            name="branchId"
            label="Chi nhánh"
            options={branchOptions}
            placeholder="Chọn chi nhánh"
            required
          />
          <BusinessDateField
            control={form.control}
            name="summaryDate"
            label="Ngày tổng hợp"
            timezoneLabel="Asia/Ho_Chi_Minh"
            required
          />
          <div className="flex items-end">
            <Button type="submit" disabled={isPending} className="w-full">
              <IconPlay data-icon="inline-start" />
              {isPending ? "Đang xử lý..." : "Chạy tổng hợp"}
            </Button>
          </div>
        </form>
      </AppSection>

      <AppSection
        title="Hàng đợi 30 ngày gần nhất"
        description="Mỗi lần cron chạy hoặc owner nhấn 'Chạy tổng hợp' tạo 1 dòng. Lỗi gần nhất hiển thị để chẩn đoán."
        action={
          <div className="flex items-center gap-2">
            <div className="w-48">
              <SelectField
                control={filterForm.control}
                name="branchFilter"
                label=""
                options={filterOptions}
                placeholder="Lọc theo chi nhánh"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isRefreshing}
              onClick={() => {
                const next = filterForm.getValues("branchFilter");
                setBranchFilter(next);
                refreshQueue(next);
              }}
            >
              <IconRefresh data-icon="inline-start" />
              Làm mới
            </Button>
          </div>
        }
        contentFlush
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead>Chi nhánh</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead className="text-right">Mã HĐ</TableHead>
                <TableHead>Lỗi gần nhất</TableHead>
                <TableHead>Hoàn tất</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.length === 0 ? (
                <TableEmptyStateRow
                  colSpan={7}
                  title="Chưa có lần chạy nào trong 30 ngày qua"
                />
              ) : (
                queue.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">
                      {row.summary_date}
                    </TableCell>
                    <TableCell>
                      {branchById.get(String(row.branch_id)) ??
                        `CN #${row.branch_id}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status]}>
                        {STATUS_LABEL[row.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {TRIGGER_LABEL[row.trigger_source]}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {row.tax_invoice_id ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {row.last_error ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(row.finished_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </AppSection>
    </>
  );
}
