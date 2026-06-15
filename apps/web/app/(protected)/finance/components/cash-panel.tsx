"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Settings2 as IconSettings, Wallet as IconWallet } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import type { ActionResult } from "@comtammatu/shared/types";
import { cn } from "@comtammatu/ui/lib/utils";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
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
  cashProfit: number;
  netProfit: number;
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
  cashProfit,
  netProfit,
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
      <Card size="sm" className="min-w-0">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <IconWallet className="size-4 shrink-0 text-muted-foreground" />
              <CardTitle className="truncate">{copy.onHandTitle}</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <IconSettings data-icon="inline-start" />
              {openingDate ? copy.editOpening : copy.setOpening}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
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
        </CardContent>
      </Card>

      <Card size="sm" className="min-w-0">
        <CardHeader>
          <div className="flex min-w-0 items-center gap-2">
            <IconWallet className="size-4 shrink-0 text-muted-foreground" />
            <CardTitle className="truncate">{copy.cashProfitTitle}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p
            className={cn(
              "truncate font-mono text-2xl font-semibold tabular-nums",
              cashProfit >= 0 ? "text-success" : "text-warning",
            )}
          >
            {formatVND(cashProfit)}
          </p>
          <p className="text-xs text-muted-foreground">
            {copy.cashProfitHint(formatVND(netProfit))}
          </p>
        </CardContent>
      </Card>

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
