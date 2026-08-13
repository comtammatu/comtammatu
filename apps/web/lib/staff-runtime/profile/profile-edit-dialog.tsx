"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Pencil as IconPencil } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormDialog, TextField, BusinessDateField } from "@/components/form";
import { messages } from "@lib/messages";
import { updateMyProfile } from "./actions";

const copy = messages.employee.profile;

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? "");

const profileFormSchema = z.object({
  fullName: z.string().trim().min(1, { error: "Họ tên không được để trống" }),
  phone: optionalText,
  birthDate: optionalText,
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;
type ProfileButtonSize = "sm" | "touch";
type ProfileButtonVariant = "default" | "outline" | "ghost";

export function ProfileEditDialog({
  branchId,
  defaultValues,
  className,
  buttonSize = "touch",
  buttonVariant = "default",
  triggerLabel = copy.editProfile,
}: {
  branchId: number | null;
  defaultValues: ProfileFormValues;
  className?: string;
  buttonSize?: ProfileButtonSize;
  buttonVariant?: ProfileButtonVariant;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSubmit(values: ProfileFormValues) {
    return updateMyProfile({
      fullName: values.fullName,
      phone: values.phone,
      birthDate: values.birthDate,
      branchId,
    });
  }

  return (
    <>
      <Button
        size={buttonSize}
        variant={buttonVariant}
        className={className}
        onClick={() => setOpen(true)}
      >
        <IconPencil data-icon="inline-start" />
        {triggerLabel}
      </Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        schema={profileFormSchema}
        defaultValues={defaultValues}
        entityKey={defaultValues.fullName}
        title={copy.editProfile}
        description={copy.editProfileDescription}
        submitLabel={copy.saveProfile}
        actionSize="touch"
        successMessage={copy.savedProfile}
        onSubmit={handleSubmit}
        onSuccess={() => {
          toast.success(copy.savedProfile);
          router.refresh();
        }}
      >
        {(form) => (
          <>
            <TextField
              control={form.control}
              name="fullName"
              label={copy.fullName}
              autoComplete="name"
              required
            />
            <TextField
              control={form.control}
              name="phone"
              label={copy.phone}
              placeholder="0901234567"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
            />
            <BusinessDateField
              control={form.control}
              name="birthDate"
              label={copy.birthDate}
            />
          </>
        )}
      </FormDialog>
    </>
  );
}
