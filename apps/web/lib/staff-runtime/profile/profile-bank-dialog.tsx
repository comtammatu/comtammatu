"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR operational copy inline */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Landmark as IconBank } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormDialog, TextField } from "@/components/form";
import { messages } from "@lib/messages";
import { updateMyBankInfo, getMyBankInfo } from "./actions";

const copy = messages.employee.profile;

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? "");

const bankFormSchema = z.object({
  bankAccount: optionalText,
  bankName: optionalText,
  idNumber: optionalText,
});

type BankFormValues = z.infer<typeof bankFormSchema>;
type ProfileButtonSize = "sm" | "touch";
type ProfileButtonVariant = "default" | "outline" | "ghost";

export function ProfileBankDialog({
  branchId,
  defaultValues,
  className,
  buttonSize = "touch",
  buttonVariant = "outline",
  triggerLabel = copy.editBankShort,
}: {
  branchId: number | null;
  defaultValues?: Partial<BankFormValues>;
  className?: string;
  buttonSize?: ProfileButtonSize;
  buttonVariant?: ProfileButtonVariant;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [bankData, setBankData] = useState<BankFormValues>({
    bankAccount: defaultValues?.bankAccount ?? "",
    bankName: defaultValues?.bankName ?? "",
    idNumber: defaultValues?.idNumber ?? "",
  });
  const router = useRouter();

  useEffect(() => {
    if (open) {
      getMyBankInfo().then((res) => {
        if (res.success && res.data) {
          setBankData({
            bankAccount: res.data.bankAccount ?? "",
            bankName: res.data.bankName ?? "",
            idNumber: res.data.idNumber ?? "",
          });
        }
      });
    }
  }, [open]);

  async function handleSubmit(values: BankFormValues) {
    return updateMyBankInfo({
      bankAccount: values.bankAccount,
      bankName: values.bankName,
      idNumber: values.idNumber,
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
        <IconBank data-icon="inline-start" />
        {triggerLabel}
      </Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        schema={bankFormSchema}
        defaultValues={bankData}
        entityKey={`bank-dialog-${bankData.bankAccount}`}
        title={copy.editBank}
        description={copy.editBankDescription}
        submitLabel={copy.saveBank}
        actionSize="touch"
        successMessage={copy.savedBank}
        onSubmit={handleSubmit}
        onSuccess={() => {
          toast.success(copy.savedBank);
          router.refresh();
        }}
      >
        {(form) => (
          <>
            <TextField
              control={form.control}
              name="bankAccount"
              label={copy.bankAccount}
              placeholder="Ví dụ: 1903..."
              autoComplete="off"
            />
            <TextField
              control={form.control}
              name="bankName"
              label={copy.bankName}
              placeholder="Ví dụ: Techcombank, MB Bank, Vietcombank..."
              autoComplete="off"
            />
            <TextField
              control={form.control}
              name="idNumber"
              label={copy.idNumber}
              placeholder={copy.idNumberPlaceholder}
              autoComplete="off"
            />
          </>
        )}
      </FormDialog>
    </>
  );
}
