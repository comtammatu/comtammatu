"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Label } from "@comtammatu/ui/components/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { updatePaymentSettings } from "./actions";
import { toast } from "@comtammatu/ui/components/sonner";

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
  const [state, formAction, isPending] = useActionState(
    updatePaymentSettings,
    null,
  );

  useEffect(() => {
    if (state?.success) {
      toast.success("Đã lưu cài đặt thanh toán");
    }
  }, [state]);

  const vietqrOn =
    settings[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR] === "true";
  const momoOn = settings[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO] === "true";

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Phương thức thanh toán trên POS</CardTitle>
          <CardDescription>
            Bật kênh đã cấu hình env. Tiền mặt luôn khả dụng.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-row items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label
                htmlFor={SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR}
                className="text-base"
              >
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
                  <span className="text-warning">Chưa đủ biến môi trường</span>
                )}
              </p>
            </div>
            <input
              type="checkbox"
              id={SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR}
              name={SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR}
              value="true"
              defaultChecked={vietqrOn}
              disabled={!vietqrEnvConfigured}
              className="mt-1 size-4"
            />
          </div>

          <div className="flex flex-row items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label
                htmlFor={SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO}
                className="text-base"
              >
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
                  <span className="text-warning">Chưa đủ biến môi trường</span>
                )}
              </p>
            </div>
            <input
              type="checkbox"
              id={SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO}
              name={SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO}
              value="true"
              defaultChecked={momoOn}
              disabled={!momoEnvConfigured}
              className="mt-1 size-4"
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
          {isPending && <Spinner className="mr-2" />}
          Lưu cài đặt
        </Button>
      </div>
    </form>
  );
}
