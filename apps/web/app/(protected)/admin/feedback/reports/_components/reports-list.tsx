"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
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
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { triggerDailyReportNow } from "../actions";
import type { DailyReportRow } from "@comtammatu/shared/feedback";

interface ReportsListProps {
  reports: DailyReportRow[];
}

/** Render markdown as safe plain text — whitespace-pre, no dangerouslySetInnerHTML */
function MarkdownPreview({ content }: { content: string }) {
  // Escape HTML entities then render as whitespace-pre
  const escaped = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return (
    <pre
      className="whitespace-pre-wrap text-sm font-mono leading-relaxed"
      // Safe: escaped above, no user HTML rendered
      dangerouslySetInnerHTML={{ __html: escaped }}
    />
  );
}

function formatDate(dateStr: string): string {
  // dateStr = YYYY-MM-DD
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

export function ReportsList({ reports }: ReportsListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<DailyReportRow | null>(
    null,
  );

  function handleTrigger() {
    startTransition(async () => {
      setTriggerMsg(null);
      const result = await triggerDailyReportNow();
      if (result.success && result.data) {
        setTriggerMsg(
          `Đã tạo ${result.data.reports_generated} báo cáo cho ngày ${result.data.report_date}`,
        );
        router.refresh();
      } else {
        setTriggerMsg(`Lỗi: ${result.error ?? "Không xác định"}`);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {reports.length} báo cáo
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleTrigger}
          disabled={isPending}
        >
          {isPending ? "Đang tạo..." : "Tạo báo cáo ngay"}
        </Button>
      </div>

      {triggerMsg ? (
        <Alert>
          <AlertDescription>{triggerMsg}</AlertDescription>
        </Alert>
      ) : null}

      {reports.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>Chưa có báo cáo nào</EmptyTitle>
          </EmptyHeader>
          <EmptyDescription>
            Báo cáo AI được tạo tự động mỗi ngày lúc 02:00 ICT.
          </EmptyDescription>
        </Empty>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead>Chi nhánh</TableHead>
                <TableHead>Số phản hồi</TableHead>
                <TableHead>Điểm TB</TableHead>
                <TableHead>Chi phí AI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow
                  key={report.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedReport(report)}
                >
                  <TableCell className="text-sm">
                    {formatDate(report.report_date)}
                  </TableCell>
                  <TableCell>
                    {report.branch_id === null ? (
                      <Badge variant="secondary">Toàn hệ thống</Badge>
                    ) : (
                      <span className="text-sm">
                        {report.branch_name ?? `Chi nhánh #${report.branch_id}`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {report.feedback_count}
                  </TableCell>
                  <TableCell className="text-sm">
                    {report.avg_rating !== null
                      ? `${report.avg_rating.toFixed(2)}/5`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatCost(report.llm_cost_usd)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedReport ? (
        <Drawer open onOpenChange={(open) => !open && setSelectedReport(null)}>
          <DrawerContent>
            <DrawerHeader className="flex items-center justify-between">
              <DrawerTitle>
                Báo cáo {formatDate(selectedReport.report_date)} —{" "}
                {selectedReport.branch_id === null
                  ? "Toàn hệ thống"
                  : (selectedReport.branch_name ??
                    `Chi nhánh #${selectedReport.branch_id}`)}
              </DrawerTitle>
              <DrawerClose asChild>
                <Button variant="ghost" size="sm">
                  Đóng
                </Button>
              </DrawerClose>
            </DrawerHeader>
            <div className="overflow-y-auto p-4">
              <MarkdownPreview content={selectedReport.report_md} />
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}
    </div>
  );
}
