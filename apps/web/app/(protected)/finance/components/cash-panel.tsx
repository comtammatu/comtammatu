"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Settings2 as IconSettings, Wallet as IconWallet } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import type { ActionResult } from "@comtammatu/shared/types";
import { cn } from "@comtammatu/ui/lib/utils";
import { Button } from "@comtammatu/ui/components/button";
import { AppSection } from "@/components/surface";
import { BusinessDateField, FormDialog, MoneyVndField } from "@/components/form";
import { messages } from "@lib/messages";
import { setCashOpening } from "../cash-actions";

const copy = messages.finance.cash;

interface Props {
  cashOnHand: number | null;
  openingBalance: number;
  openingDate: string | null;
  cashInSince: number;
  cashOutSince: number;
  cashDeltaAfterPaidExpenses: number;
  todayBusinessDate: string;
}

const cashOpeningSchema = z.object({
  balance: z
    .string()
    .min(1, { error: "Nhập số dư" })
    .refine((v) => Number(v) >= 0, { error: "Số dư không hợp lệ" }),
  date: z.string().min(1, { error: "Chọn ngày" }),
});

type CashOpeningValues = z.infer<typeof cashOpeningSchema>;

export function CashPanel({
  cashOnHand,
  openingBalance,
  openingDate,
  cashInSince,
  cashOutSince,
  cashDeltaAfterPaidExpenses,
  todayBusinessDate,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const defaultValues: CashOpeningValues = {
    balance: openingDate ? String(openingBalance) : "",
    date: openingDate ?? todayBusinessDate,
  };

  async function onSubmit(values: CashOpeningValues): Promise<ActionResult> {
    const result = await setCashOpening({
      balance: Number(values.balance),
      date: values.date,
    });
    if (result.success) {
      router.refresh();
    }
    return result;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <AppSection
        size="sm"
        className="min-w-0"
        title={copy.onHandTitle}
        icon={<IconWallet />}
        action={
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <IconSettings data-icon="inline-start" />
            {openingDate ? copy.editOpening : copy.setOpening}
          </Button>
        }
      >
        {cashOnHand == null ? (
          <p className="text-sm text-muted-foreground">{copy.noOpening}</p>
        ) : (
          <>
            <p className="truncate font-mono text-2xl font-semibold tabular-nums text-primary">
              {formatVND(cashOnHand)}
            </p>
            <p className="text-xs text-muted-foreground">
              {copy.onHandBreakdown(
                formatVND(openingBalance),
                openingDate ?? "",
                formatVND(cashInSince),
                formatVND(cashOutSince),
              )}
            </p>
          </>
        )}
      </AppSection>

      <AppSection
        size="sm"
        className="min-w-0"
        title={copy.cashDeltaTitle}
        icon={<IconWallet />}
      >
        <p
          className={cn(
            "truncate font-mono text-2xl font-semibold tabular-nums",
            cashDeltaAfterPaidExpenses >= 0 ? "text-success" : "text-warning",
          )}
        >
          {formatVND(cashDeltaAfterPaidExpenses)}
        </p>
        <p className="text-xs text-muted-foreground">{copy.cashDeltaHint}</p>
      </AppSection>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.openingTitle}
        description={copy.openingDescription}
        schema={cashOpeningSchema}
        defaultValues={defaultValues}
        onSubmit={onSubmit}
        successMessage={copy.openingSuccess}
        submitLabel={copy.openingSubmit}
      >
        {(form) => (
          <>
            <MoneyVndField
              control={form.control}
              name="balance"
              label={copy.openingBalanceLabel}
              required
            />
            <BusinessDateField
              control={form.control}
              name="date"
              label={copy.openingDateLabel}
              required
            />
          </>
        )}
      </FormDialog>
    </div>
  );
}
