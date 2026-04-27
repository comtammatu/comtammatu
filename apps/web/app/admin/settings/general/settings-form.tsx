"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { toast } from "@comtammatu/ui/components/sonner";
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { TextField, valuesToFormData } from "@/components/form";
import { updateSettings } from "./actions";

const settingsSchema = z.object({
  vat_rate: z
    .string()
    .trim()
    .refine(
      (v) => {
        if (!v) return true;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 && n <= 100;
      },
      { error: "Thuế GTGT phải trong khoảng 0-100" },
    ),
  service_charge: z
    .string()
    .trim()
    .refine(
      (v) => {
        if (!v) return true;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 && n <= 100;
      },
      { error: "Phí dịch vụ phải trong khoảng 0-100" },
    ),
  currency: z.string().trim(),
  store_phone: z.string().trim(),
  store_email: z
    .string()
    .trim()
    .refine((v) => !v || /.+@.+\..+/.test(v), {
      error: "Email không hợp lệ",
    }),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

interface SettingsFormProps {
  settings: Record<string, string>;
}

export function SettingsForm({ settings }: SettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<SettingsFormValues, unknown, SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      vat_rate: settings[SYSTEM_SETTING_KEYS.VAT_RATE] ?? "8",
      service_charge: settings[SYSTEM_SETTING_KEYS.SERVICE_CHARGE] ?? "5",
      currency: settings[SYSTEM_SETTING_KEYS.CURRENCY] ?? "VND",
      store_phone: settings[SYSTEM_SETTING_KEYS.STORE_PHONE] ?? "",
      store_email: settings[SYSTEM_SETTING_KEYS.STORE_EMAIL] ?? "",
    },
  });

  function onValid(values: SettingsFormValues) {
    startTransition(async () => {
      setServerError(null);
      const fd = valuesToFormData(values);
      const result = await updateSettings(null, fd);
      if (!result.success) {
        setServerError(result.error ?? ERRORS_VI.fallback);
        return;
      }
      toast.success(`${ACTIONS_VI.save} cài đặt`);
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
          <CardTitle>Thuế & Phí</CardTitle>
          <CardDescription>Áp dụng cho toàn hệ thống</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="vat_rate"
              label="Thuế GTGT (%)"
              type="number"
              min={0}
              max={100}
              step="0.1"
            />
            <TextField
              control={form.control}
              name="service_charge"
              label="Phí dịch vụ (%)"
              type="number"
              min={0}
              max={100}
              step="0.1"
            />
            <TextField
              control={form.control}
              name="currency"
              label="Đơn vị tiền tệ"
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin liên hệ</CardTitle>
          <CardDescription>Hiển thị trên hóa đơn</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="store_phone"
              label="Số điện thoại"
              type="tel"
              placeholder="028 1234 5678"
            />
            <TextField
              control={form.control}
              name="store_email"
              label="Email"
              type="email"
              placeholder="info@comtammatu.com"
            />
          </FieldGroup>
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
