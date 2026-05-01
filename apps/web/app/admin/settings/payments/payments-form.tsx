"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Switch } from "@comtammatu/ui/components/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { toast } from "@comtammatu/ui/components/sonner";
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { updatePaymentSettings } from "./actions";

const paymentsSchema = z.object({
  enable_vietqr: z.boolean(),
  enable_momo: z.boolean(),
  vietqr_bank_code: z
    .string()
    .trim()
    .max(32)
    .regex(/^[A-Za-z0-9]*$/, {
      error: "Mã NH chỉ chứa chữ và số (vd: TCB, VCB, 970407).",
    }),
  vietqr_account_no: z
    .string()
    .trim()
    .max(32)
    .regex(/^[A-Za-z0-9]*$/, {
      error: "STK chỉ chứa chữ và số (không khoảng trắng).",
    }),
  vietqr_account_name: z.string().trim().max(64),
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
      vietqr_bank_code:
        settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE] ?? "",
      vietqr_account_no:
        settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO] ?? "",
      vietqr_account_name:
        settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME] ?? "",
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
      fd.set(
        SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE,
        values.vietqr_bank_code,
      );
      fd.set(
        SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO,
        values.vietqr_account_no,
      );
      fd.set(
        SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME,
        values.vietqr_account_name,
      );
      const result = await updatePaymentSettings(null, fd);
      if (!result.success) {
        setServerError(result.error ?? ERRORS_VI.fallback);
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
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3 rounded-lg border p-4">
            <Controller
              control={form.control}
              name="enable_vietqr"
              render={({ field }) => (
                <div className="flex flex-row items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="enable-vietqr" className="text-base">
                      VietQR (chuyển khoản QR)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Nhập STK ngân hàng dưới đây. Nếu để trống sẽ dùng biến môi
                      trường <code className="text-2xs">VIETQR_*</code>{" "}
                      ({vietqrEnvConfigured ? "✓ có sẵn" : "chưa đặt"}).
                    </p>
                  </div>
                  <Switch
                    id="enable-vietqr"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="mt-1"
                  />
                </div>
              )}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="vietqr-bank-code" className="text-xs">
                  Mã ngân hàng
                </Label>
                <Input
                  id="vietqr-bank-code"
                  placeholder="TCB"
                  autoCapitalize="characters"
                  {...form.register("vietqr_bank_code")}
                />
                {form.formState.errors.vietqr_bank_code && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.vietqr_bank_code.message}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="vietqr-account-no" className="text-xs">
                  Số tài khoản
                </Label>
                <Input
                  id="vietqr-account-no"
                  autoCapitalize="characters"
                  placeholder="19035xxxxxxxx"
                  {...form.register("vietqr_account_no")}
                />
                {form.formState.errors.vietqr_account_no && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.vietqr_account_no.message}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="vietqr-account-name" className="text-xs">
                  Chủ tài khoản
                </Label>
                <Input
                  id="vietqr-account-name"
                  placeholder="CONG TY CP COM TAM MA TU"
                  {...form.register("vietqr_account_name")}
                />
                {form.formState.errors.vietqr_account_name && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.vietqr_account_name.message}
                  </p>
                )}
              </div>
            </div>
            <p className="text-2xs text-muted-foreground">
              Mã NH: TCB, VCB, BIDV, MB, ACB, TPB, VPB, STB... (Napas BIN cũng
              chấp nhận, vd 970407 = Techcombank).
            </p>
          </div>

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
          {ACTIONS_VI.save} cài đặt
        </Button>
      </div>
    </form>
  );
}
