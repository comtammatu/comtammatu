"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Button } from "@comtammatu/ui/components/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@comtammatu/ui/components/form";
import { Input } from "@comtammatu/ui/components/input";
import type { TenantRow } from "./actions";
import { updateTenantInfo } from "./actions";

const formSchema = z.object({
  name: z.string().min(1, { error: "Tên cửa hàng không được để trống" }),
  legal_name: z.string().optional(),
  tax_code: z.string().optional(),
  legal_address: z.string().optional(),
  representative: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface GeneralSettingsFormProps {
  tenant: TenantRow;
  canEdit: boolean;
}

export function GeneralSettingsForm({ tenant, canEdit }: GeneralSettingsFormProps) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: tenant.name,
      legal_name: tenant.legal_name ?? "",
      tax_code: tenant.tax_code ?? "",
      legal_address: tenant.legal_address ?? "",
      representative: tenant.representative ?? "",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await updateTenantInfo(values);
      if (!result.success) {
        toast.error(result.error ?? "Có lỗi xảy ra");
        return;
      }
      toast.success("Đã lưu thông tin cửa hàng");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông tin cửa hàng</CardTitle>
        <CardDescription>
          {canEdit
            ? "Cập nhật thông tin pháp lý và đại diện của cửa hàng."
            : "Thông tin pháp lý và đại diện của cửa hàng. Liên hệ chủ sở hữu để thay đổi."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên cửa hàng *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Cơm Tấm Má Tư"
                      disabled={!canEdit}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="legal_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên pháp nhân</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="CÔNG TY CỔ PHẦN CƠM TẤM MÁ TƯ"
                      disabled={!canEdit}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tax_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mã số thuế</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="0123456789"
                      disabled={!canEdit}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="legal_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Địa chỉ đăng ký</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố"
                      disabled={!canEdit}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="representative"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Người đại diện</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Họ và tên người đại diện pháp luật"
                      disabled={!canEdit}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {canEdit && (
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Đang lưu..." : "Lưu thay đổi"}
                </Button>
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
