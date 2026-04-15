"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { updateSettings } from "./actions";
import { toast } from "@comtammatu/ui/components/sonner";

interface SettingsFormProps {
  settings: Record<string, string>;
}

export function SettingsForm({ settings }: SettingsFormProps) {
  const [state, formAction, isPending] = useActionState(updateSettings, null);

  useEffect(() => {
    if (state?.success) {
      toast.success("Đã lưu cài đặt");
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-6">
      {/* Tax & Charges */}
      <Card>
        <CardHeader>
          <CardTitle>Thuế & Phí</CardTitle>
          <CardDescription>
            Áp dụng cho toàn hệ thống
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={SYSTEM_SETTING_KEYS.VAT_RATE}>Thuế GTGT (%)</Label>
            <Input
              id={SYSTEM_SETTING_KEYS.VAT_RATE}
              name={SYSTEM_SETTING_KEYS.VAT_RATE}
              type="number"
              min={0}
              max={100}
              step="0.1"
              defaultValue={settings[SYSTEM_SETTING_KEYS.VAT_RATE] ?? "8"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={SYSTEM_SETTING_KEYS.SERVICE_CHARGE}>
              Phí dịch vụ (%)
            </Label>
            <Input
              id={SYSTEM_SETTING_KEYS.SERVICE_CHARGE}
              name={SYSTEM_SETTING_KEYS.SERVICE_CHARGE}
              type="number"
              min={0}
              max={100}
              step="0.1"
              defaultValue={settings[SYSTEM_SETTING_KEYS.SERVICE_CHARGE] ?? "5"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={SYSTEM_SETTING_KEYS.CURRENCY}>Đơn vị tiền tệ</Label>
            <Input
              id={SYSTEM_SETTING_KEYS.CURRENCY}
              name={SYSTEM_SETTING_KEYS.CURRENCY}
              defaultValue={settings[SYSTEM_SETTING_KEYS.CURRENCY] ?? "VND"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader>
          <CardTitle>Thông tin liên hệ</CardTitle>
          <CardDescription>Hiển thị trên hóa đơn</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={SYSTEM_SETTING_KEYS.STORE_PHONE}>
              Số điện thoại
            </Label>
            <Input
              id={SYSTEM_SETTING_KEYS.STORE_PHONE}
              name={SYSTEM_SETTING_KEYS.STORE_PHONE}
              type="tel"
              defaultValue={settings[SYSTEM_SETTING_KEYS.STORE_PHONE] ?? ""}
              placeholder="028 1234 5678"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={SYSTEM_SETTING_KEYS.STORE_EMAIL}>Email</Label>
            <Input
              id={SYSTEM_SETTING_KEYS.STORE_EMAIL}
              name={SYSTEM_SETTING_KEYS.STORE_EMAIL}
              type="email"
              defaultValue={settings[SYSTEM_SETTING_KEYS.STORE_EMAIL] ?? ""}
              placeholder="info@comtammatu.com"
            />
          </div>
        </CardContent>
      </Card>

      {state?.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Lưu cài đặt
        </Button>
      </div>
    </form>
  );
}
