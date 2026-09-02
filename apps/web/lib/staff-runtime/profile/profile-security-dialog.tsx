"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR operational copy inline */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { KeyRound as IconKeyRound } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormDialog, TextField } from "@/components/form";
import { messages } from "@lib/messages";
import { changeMyPassword } from "./actions";

const copy = messages.employee.profile;

const securityFormSchema = z
  .object({
    newPassword: z.string().min(8, { error: copy.passwordMinLength }),
    confirmPassword: z.string().min(8, { error: copy.passwordMinLength }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: copy.passwordMismatch,
    path: ["confirmPassword"],
  });

type SecurityFormValues = z.infer<typeof securityFormSchema>;
type ProfileButtonSize = "sm" | "touch";
type ProfileButtonVariant = "default" | "outline" | "ghost";

export function ProfileSecurityDialog({
  branchId,
  className,
  buttonSize = "touch",
  buttonVariant = "outline",
  triggerLabel = copy.changePassword,
}: {
  branchId: number | null;
  className?: string;
  buttonSize?: ProfileButtonSize;
  buttonVariant?: ProfileButtonVariant;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSubmit(values: SecurityFormValues) {
    return changeMyPassword({
      newPassword: values.newPassword,
      branchId,
    });
  }

  const defaultValues: SecurityFormValues = {
    newPassword: "",
    confirmPassword: "",
  };

  return (
    <>
      <Button
        size={buttonSize}
        variant={buttonVariant}
        className={className}
        onClick={() => setOpen(true)}
      >
        <IconKeyRound data-icon="inline-start" />
        {triggerLabel}
      </Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        schema={securityFormSchema}
        defaultValues={defaultValues}
        entityKey="security-change-password"
        title={copy.changePassword}
        description={copy.changePasswordDescription}
        submitLabel={copy.savePassword}
        actionSize="touch"
        successMessage={copy.savedPassword}
        onSubmit={handleSubmit}
        onSuccess={() => {
          toast.success(copy.savedPassword);
          router.refresh();
        }}
      >
        {(form) => (
          <>
            <TextField
              control={form.control}
              name="newPassword"
              label={copy.newPassword}
              type="password"
              placeholder="Tối thiểu 8 ký tự"
              autoComplete="new-password"
              required
            />
            <TextField
              control={form.control}
              name="confirmPassword"
              label={copy.confirmPassword}
              type="password"
              placeholder="Nhập lại mật khẩu mới"
              autoComplete="new-password"
              required
            />
          </>
        )}
      </FormDialog>
    </>
  );
}
