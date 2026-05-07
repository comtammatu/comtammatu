"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import { Save as IconDeviceFloppy } from "lucide-react";
import { AppPage, AppPageHeader } from "@/components/surface";
import { FormattedNumberInput } from "@/inventory/_components/formatted-number-input";
import { saveQcSettings } from "../../notifications-actions";

type Initial = {
  qty_short_tolerance_pct: number;
  price_variance_warn_pct: number;
  price_variance_review_pct: number;
  reject_requires_photo: boolean;
  alert_webhook_url: string | null;
  alert_channel: string;
};

export function QcSettingsClient({ initial }: { initial: Initial }) {
  const [shortTol, setShortTol] = useState(
    Number(initial.qty_short_tolerance_pct ?? 5),
  );
  const [warnPct, setWarnPct] = useState(
    Number(initial.price_variance_warn_pct ?? 5),
  );
  const [reviewPct, setReviewPct] = useState(
    Number(initial.price_variance_review_pct ?? 15),
  );
  const [requirePhoto, setRequirePhoto] = useState(
    Boolean(initial.reject_requires_photo ?? true),
  );
  const [webhookUrl, setWebhookUrl] = useState(
    initial.alert_webhook_url ?? "",
  );
  const [channel, setChannel] = useState<
    "generic" | "telegram" | "discord" | "slack"
  >((initial.alert_channel as never) ?? "generic");
  const [isSaving, start] = useTransition();

  function handleSave() {
    if (warnPct >= reviewPct) {
      toast.error("Ngưỡng cảnh báo phải nhỏ hơn ngưỡng kiểm tra.");
      return;
    }
    start(async () => {
      const res = await saveQcSettings({
        qtyShortTolerancePct: shortTol,
        priceVarianceWarnPct: warnPct,
        priceVarianceReviewPct: reviewPct,
        rejectRequiresPhoto: requirePhoto,
        alertWebhookUrl: webhookUrl,
        alertChannel: channel,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không thể lưu cài đặt.");
        return;
      }
      toast.success("Đã lưu cài đặt QC.");
    });
  }

  return (
    <AppPage>
      <AppPageHeader eyebrow="Kho hàng" title="Cài đặt QC nhập kho" />
      <div className="mx-auto max-w-3xl space-y-6">
          <Alert>
            <AlertDescription>
              Cấu hình ngưỡng kiểm soát chất lượng cho phiếu nhập (GRN). Các
              ngưỡng này áp dụng toàn tenant. Webhook nhận thông báo khi có
              cảnh báo realtime.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Tolerance số lượng & giá</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="short-tol">Thiếu hàng ≤ (%)</Label>
                <FormattedNumberInput
                  id="short-tol"
                  value={String(shortTol)}
                  onValueChange={(v) => setShortTol(Number(v || 0))}
                  maxFractionDigits={1}
                />
                <p className="text-xs text-muted-foreground">
                  Dưới ngưỡng → tự chấp nhận, không bắt chọn cách xử lý.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="warn-pct">Giá lệch cảnh báo ≥ (%)</Label>
                <FormattedNumberInput
                  id="warn-pct"
                  value={String(warnPct)}
                  onValueChange={(v) => setWarnPct(Number(v || 0))}
                  maxFractionDigits={1}
                />
                <p className="text-xs text-muted-foreground">
                  Vượt ngưỡng → bắt nhập lý do.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="review-pct">Giá lệch kiểm tra ≥ (%)</Label>
                <FormattedNumberInput
                  id="review-pct"
                  value={String(reviewPct)}
                  onValueChange={(v) => setReviewPct(Number(v || 0))}
                  maxFractionDigits={1}
                />
                <p className="text-xs text-muted-foreground">
                  Vượt ngưỡng → bắt thêm ảnh hóa đơn + flag review.
                </p>
              </div>
              <div className="md:col-span-3">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="text-sm">
                      Bắt buộc ảnh khi reject hàng
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Khi có hàng từ chối, phải đính kèm ảnh trước khi chốt.
                    </p>
                  </div>
                  <Switch
                    checked={requirePhoto}
                    onCheckedChange={setRequirePhoto}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Cảnh báo realtime</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="channel">Kênh nhận</Label>
                <Select
                  value={channel}
                  onValueChange={(v) =>
                    setChannel(v as typeof channel)
                  }
                >
                  <SelectTrigger id="channel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generic">
                      Generic JSON POST
                    </SelectItem>
                    <SelectItem value="telegram">Telegram bot bridge</SelectItem>
                    <SelectItem value="discord">Discord webhook</SelectItem>
                    <SelectItem value="slack">Slack webhook</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="webhook">Webhook URL</Label>
                <Input
                  id="webhook"
                  type="url"
                  value={webhookUrl}
                  placeholder="https://hooks.slack.com/services/… hoặc URL bot riêng"
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Để trống = bỏ qua. Hệ thống POST JSON vào URL này khi có sự
                  kiện <code>grn.requires_review</code> hoặc{" "}
                  <code>supplier_return.created</code>. Outbox tự retry tối đa
                  3 lần khi HTTP fail.
                </p>
              </div>
            </CardContent>
          </Card>

          <footer className="flex justify-end gap-2 border-t pt-4">
            <Button onClick={handleSave} disabled={isSaving}>
              <IconDeviceFloppy className="size-4" /> Lưu cài đặt
            </Button>
          </footer>
      </div>
    </AppPage>
  );
}
