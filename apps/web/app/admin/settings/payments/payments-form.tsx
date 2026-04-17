"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Label } from "@comtammatu/ui/components/label";
import { Switch } from "@comtammatu/ui/components/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { toast } from "@comtammatu/ui/components/sonner";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { updatePaymentSettings } from "./actions";

const paymentsSchema = z.object({
  enable_vietqr: z.boolean(),
  enable_momo: z.boolean(),
});

type PaymentsFormValues = z.infer<typeof paymentsSchema>;

interface PaymentsFormProps {
  settings: Record<string, string>;
  vietqrEnvConfigured: boolean;
  momoEnvConfigured: boolean;
}

export function PaymentsForm({
  settings,
  vietqrEnvConfigured,
  momoEnvConfigured,
}: PaymentsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<PaymentsFormValues, unknown, PaymentsFormValues>({
    resolver: zodResolver(paymentsSchema),
    defaultValues: {
      enable_vietqr:
        settings[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR] === "true",
      enable_momo: settings[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO] === "true",
    },
  });

  function onValid(values: PaymentsFormValues) {
    startTransition(async () => {
      setServerError(null);
      const fd = new FormData();
      if (values.enable_vietqr) {
        fd.set(SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR, "true");
      }
      if (values.enable_momo) {
        fd.set(SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO, "true");
      }
      const result = await updatePaymentSettings(null, fd);
      if (!result.success) {
        setServerError(result.error ?? "Đã xảy ra lỗi");
        return;
      }
      toast.success("Đã lưu cài đặt thanh toán");
    });
  }

  return (
    <form
      onSubmit={form.handleSubmit(onValid)}
      noValidate
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <CardTitle>Phương thức thanh toán trên POS</CardTitle>
          <CardDescription>
            Bật kênh đã cấu hình env. Tiền mặt luôn khả dụng.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Controller
            control={form.control}
            name="enable_vietqr"
            render={({ field }) => (
              <div className="flex flex-row items-start justify-between gap-4 rounded-lg border p-4">
                <div className="space-y-1">
                  <Label htmlFor="enable-vietqr" className="text-base">
                    VietQR (chuyển khoản QR)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Cần{" "}
                    <code className="rounded bg-muted px-1 text-xs">
                      VIETQR_API_KEY
                    </code>
                    ,{" "}
                    <code className="rounded bg-muted px-1 text-xs">
                      VIETQR_ACCOUNT_NO
                    </code>
                    ,{" "}
                    <code className="rounded bg-muted px-1 text-xs">
                      VIETQR_BANK_ID
                    </code>
                    .
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Trạng thái env:{" "}
                    {vietqrEnvConfigured ? (
                      <span className="text-success">✓ Đã cấu hình</span>
                    ) : (
                      <span className="text-warning">
                        Chưa đủ biến môi trường
                      </span>
                    )}
                  </p>
                </div>
                <Switch
                  id="enable-vietqr"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={!vietqrEnvConfigured}
                  className="mt-1"
                />
              </div>
            )}
          />

          <Controller
            control={form.control}
            name="enable_momo"
            render={({ field }) => (
              <div className="flex flex-row items-start justify-between gap-4 rounded-lg border p-4">
                <div className="space-y-1">
                  <Label htmlFor="enable-momo" className="text-base">
                    MoMo
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Cần{" "}
                    <code className="rounded bg-muted px-1 text-xs">
                      MOMO_PARTNER_CODE
                    </code>
                    ,{" "}
                    <code className="rounded bg-muted px-1 text-xs">
                      MOMO_ACCESS_KEY
                    </code>
                    ,{" "}
                    <code className="rounded bg-muted px-1 text-xs">
                      MOMO_SECRET_KEY
                    </code>
                    .
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Trạng thái env:{" "}
                    {momoEnvConfigured ? (
                      <span className="text-success">✓ Đã cấu hình</span>
                    ) : (
                      <span className="text-warning">
                        Chưa đủ biến môi trường
                      </span>
                    )}
                  </p>
                </div>
                <Switch
                  id="enable-momo"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={!momoEnvConfigured}
                  className="mt-1"
                />
              </div>
            )}
          />
        </CardContent>
      </Card>

      {serverError && (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner className="mr-2" />}
          Lưu cài đặt
        </Button>
      </div>
    </form>
  );
}
