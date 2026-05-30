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
import {
  updateFeedbackBranchReviewSettings,
  updateFeedbackSettings,
} from "../actions";
import type {
  FeedbackBranchReviewSettingRow,
  FeedbackSettingsRow,
} from "@comtammatu/shared/feedback";

interface FeedbackBranchOption {
  id: number;
  name: string;
}

interface AiSettingsClientProps {
  settings: FeedbackSettingsRow;
  branches: FeedbackBranchOption[];
  branchReviewSettings: FeedbackBranchReviewSettingRow[];
}

export function AiSettingsClient({
  settings,
  branches,
  branchReviewSettings,
}: AiSettingsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [branchMessage, setBranchMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const [pushMode, setPushMode] = useState<"threshold" | "all" | "none">(
    settings.push_mode,
  );
  const [googleReviewUrl, setGoogleReviewUrl] = useState(
    settings.google_review_url ?? "",
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
  const [branchReviewUrls, setBranchReviewUrls] = useState<
    Record<number, string>
  >(() => {
    const byBranchId = new Map(
      branchReviewSettings.map((setting) => [
        setting.branch_id,
        setting.google_review_url ?? "",
      ]),
    );

    return Object.fromEntries(
      branches.map((branch) => [branch.id, byBranchId.get(branch.id) ?? ""]),
    );
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const result = await updateFeedbackSettings({
        push_mode: pushMode,
        google_review_url: googleReviewUrl,
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

  function handleBranchReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBranchMessage(null);

    startTransition(async () => {
      const result = await updateFeedbackBranchReviewSettings({
        settings: branches.map((branch) => ({
          branch_id: branch.id,
          google_review_url: branchReviewUrls[branch.id] ?? "",
        })),
      });

      if (result.success) {
        setBranchMessage({ ok: true, text: "Đã lưu link review chi nhánh." });
      } else {
        setBranchMessage({
          ok: false,
          text: result.error ?? "Lỗi không xác định",
        });
      }
    });
  }

  function setBranchReviewUrl(branchId: number, value: string) {
    setBranchReviewUrls((current) => ({
      ...current,
      [branchId]: value,
    }));
  }

  return (
    <div className="max-w-2xl space-y-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        {message ? (
          <Alert variant={message.ok ? "default" : "destructive"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="google-review-url">Link Google review mặc định</Label>
          <Input
            id="google-review-url"
            type="url"
            inputMode="url"
            placeholder="https://g.page/r/..."
            value={googleReviewUrl}
            onChange={(e) => setGoogleReviewUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Dùng cho chi nhánh chưa có link riêng. Khách chọn Hài lòng trên
            trang QR sẽ đi tới link review đã cấu hình.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="push-mode">Chế độ đẩy Telegram</Label>
          <Select
            value={pushMode}
            onValueChange={(v) =>
              setPushMode(v as "threshold" | "all" | "none")
            }
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
              Lưu ý: hiện tại chạy cố định 02:00 ICT. Tuỳ chỉnh giờ sẽ có ở
              phiên bản sau.
            </span>
          </p>
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Đang lưu..." : "Lưu cài đặt"}
        </Button>
      </form>

      <form
        onSubmit={handleBranchReviewSubmit}
        className="space-y-4 border-t pt-6"
      >
        {branchMessage ? (
          <Alert variant={branchMessage.ok ? "default" : "destructive"}>
            <AlertDescription>{branchMessage.text}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-1">
          <h2 className="font-heading text-base font-semibold">
            Link Google review theo chi nhánh
          </h2>
          <p className="text-sm text-muted-foreground">
            Link riêng sẽ được dùng trước link mặc định khi khách quét QR của
            chi nhánh đó.
          </p>
        </div>

        {branches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có chi nhánh đang hoạt động.
          </p>
        ) : (
          <div className="space-y-3">
            {branches.map((branch) => (
              <div
                key={branch.id}
                className="grid gap-2 sm:grid-cols-3 sm:items-center"
              >
                <Label htmlFor={`branch-review-url-${branch.id}`}>
                  {branch.name}
                </Label>
                <Input
                  id={`branch-review-url-${branch.id}`}
                  className="sm:col-span-2"
                  type="url"
                  inputMode="url"
                  placeholder="https://g.page/r/..."
                  value={branchReviewUrls[branch.id] ?? ""}
                  onChange={(e) =>
                    setBranchReviewUrl(branch.id, e.target.value)
                  }
                />
              </div>
            ))}
          </div>
        )}

        <Button type="submit" disabled={isPending || branches.length === 0}>
          {isPending ? "Đang lưu..." : "Lưu link chi nhánh"}
        </Button>
      </form>
    </div>
  );
}
