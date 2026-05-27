"use client";

import { useState, useTransition } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import { Input } from "@comtammatu/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { updateFeedbackSettings } from "../actions";
import type { FeedbackSettingsRow } from "@comtammatu/shared/feedback";

interface AiSettingsClientProps {
  settings: FeedbackSettingsRow;
}

export function AiSettingsClient({ settings }: AiSettingsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const [pushMode, setPushMode] = useState<"threshold" | "all" | "none">(
    settings.push_mode,
  );
  const [thresholdRating, setThresholdRating] = useState(
    String(settings.threshold_rating),
  );
  const [aiMonthlyBudget, setAiMonthlyBudget] = useState(
    String(settings.ai_monthly_budget_usd),
  );
  const [reportHour, setReportHour] = useState(
    String(settings.daily_report_hour_local),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const result = await updateFeedbackSettings({
        push_mode: pushMode,
        threshold_rating: Number(thresholdRating),
        ai_monthly_budget_usd: Number(aiMonthlyBudget),
        daily_report_hour_local: Number(reportHour),
      });

      if (result.success) {
        setMessage({ ok: true, text: "Đã lưu cài đặt." });
      } else {
        setMessage({ ok: false, text: result.error ?? "Lỗi không xác định" });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
      {message ? (
        <Alert variant={message.ok ? "default" : "destructive"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="push-mode">Chế độ đẩy Telegram</Label>
        <Select
          value={pushMode}
          onValueChange={(v) => setPushMode(v as "threshold" | "all" | "none")}
        >
          <SelectTrigger id="push-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="threshold">Dưới ngưỡng (threshold)</SelectItem>
            <SelectItem value="all">Tất cả phản hồi</SelectItem>
            <SelectItem value="none">Tắt</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Xác định khi nào gửi thông báo Telegram theo đánh giá.
        </p>
      </div>

      {pushMode === "threshold" ? (
        <div className="space-y-2">
          <Label htmlFor="threshold-rating">Ngưỡng đánh giá (1–5)</Label>
          <Input
            id="threshold-rating"
            type="number"
            min={1}
            max={5}
            value={thresholdRating}
            onChange={(e) => setThresholdRating(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Gửi Telegram khi điểm đánh giá ≤ ngưỡng này.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="ai-budget">Ngân sách AI hàng tháng (USD)</Label>
        <Input
          id="ai-budget"
          type="number"
          min={0}
          step={0.5}
          value={aiMonthlyBudget}
          onChange={(e) => setAiMonthlyBudget(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Giới hạn chi phí gọi AI mỗi tháng. Nhập 0 để không giới hạn.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="report-hour">
          Giờ tạo báo cáo hàng ngày (giờ địa phương)
        </Label>
        <Input
          id="report-hour"
          type="number"
          min={0}
          max={23}
          value={reportHour}
          onChange={(e) => setReportHour(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Báo cáo AI được tạo tự động vào giờ này mỗi ngày (0–23).{" "}
          <span className="text-warning">
            Lưu ý: hiện tại chạy cố định 02:00 ICT. Tuỳ chỉnh giờ sẽ có ở phiên
            bản sau.
          </span>
        </p>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Đang lưu..." : "Lưu cài đặt"}
      </Button>
    </form>
  );
}
