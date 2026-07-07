"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  ArrowRight as IconArrowRight,
  Landmark as IconBank,
  Settings2 as IconSettings,
  Wallet as IconWallet,
  ArrowRightLeft as IconTransfer,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import type { ActionResult } from "@comtammatu/shared/types";
import { cn } from "@comtammatu/ui/lib/utils";
import { Button } from "@comtammatu/ui/components/button";
import { AppSection } from "@/components/surface";
import {
  BusinessDateField,
  FormDialog,
  MoneyVndField,
  TextField,
} from "@/components/form";
import { messages } from "@lib/messages";
import { setCashOpening } from "../cash-actions";
import { transferCashToBank } from "../cash-transfer-actions";

const copy = messages.finance.cash;

interface Props {
  cashOnHand: number | null;
  openingBalance: number;
  openingDate: string | null;
  cashInSince: number;
  cashOutSince: number;
  hasBankOpening: boolean;
  bankOnHand: number;
  bankOpeningBalance: number;
  bankInSince: number;
  bankOutSince: number;
  cashDeltaAfterPaidExpenses: number;
  todayBusinessDate: string;
  canManageCashOpening: boolean;
}

const cashOpeningSchema = z.object({
  balance: z
    .string()
    .min(1, { error: "Nhập số dư" })
    .refine((v) => Number(v) >= 0, { error: "Số dư không hợp lệ" }),
  bankBalance: z
    .string()
    .min(1, { error: "Nhập số dư ngân hàng" })
    .refine((v) => Number(v) >= 0, { error: "Số dư không hợp lệ" }),
  date: z.string().min(1, { error: "Chọn ngày" }),
});

type CashOpeningValues = z.infer<typeof cashOpeningSchema>;

const transferSchema = z.object({
  amount: z
    .string()
    .min(1, { error: "Nhập số tiền" })
    .refine((v) => Number(v) >= 1000, { error: "Số tiền tối thiểu 1.000 VNĐ" }),
  referenceCode: z.string().optional(),
});

type TransferValues = z.infer<typeof transferSchema>;

export function CashPanel({
  cashOnHand,
  openingBalance,
  openingDate,
  cashInSince,
  cashOutSince,
  hasBankOpening,
  bankOnHand,
  bankOpeningBalance,
  bankInSince,
  bankOutSince,
  cashDeltaAfterPaidExpenses,
  todayBusinessDate,
  canManageCashOpening,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const needsFullOpeningRefresh = openingDate != null && !hasBankOpening;

  const defaultValues: CashOpeningValues = {
    balance:
      openingDate && !needsFullOpeningRefresh ? String(openingBalance) : "",
    bankBalance: hasBankOpening ? String(bankOpeningBalance) : "",
    date:
      openingDate && !needsFullOpeningRefresh ? openingDate : todayBusinessDate,
  };

  async function onSubmit(values: CashOpeningValues): Promise<ActionResult> {
    const result = await setCashOpening({
      balance: Number(values.balance),
      bankBalance: Number(values.bankBalance),
      date: values.date,
    });
    if (result.success) {
      router.refresh();
    }
    return result;
  }

  async function onTransferSubmit(values: TransferValues): Promise<ActionResult> {
    const result = await transferCashToBank({
      amount: Number(values.amount),
      referenceCode: values.referenceCode,
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
          <div className="flex items-center gap-2">
            {canManageCashOpening && (
              <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
                <IconTransfer data-icon="inline-start" />
                {copy.transferAction}
              </Button>
            )}
            {canManageCashOpening && (
              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <IconSettings data-icon="inline-start" />
                {openingDate ? copy.editOpening : copy.setOpening}
              </Button>
            )}
          </div>
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
        title={copy.bankTitle}
        icon={<IconBank />}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/finance/bank-transactions">
              {copy.bankTransactionsAction}
              <IconArrowRight data-icon="inline-end" aria-hidden />
            </Link>
          </Button>
        }
      >
        {hasBankOpening ? (
          <>
            <p className="truncate font-mono text-2xl font-semibold tabular-nums text-primary">
              {formatVND(bankOnHand)}
            </p>
            <p className="text-xs text-muted-foreground">
              {copy.bankBreakdown(
                formatVND(bankOpeningBalance),
                openingDate ?? "",
                formatVND(bankInSince),
                formatVND(bankOutSince),
              )}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.bankNoOpening}</p>
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

      {canManageCashOpening ? (
        <>
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
                <MoneyVndField
                  control={form.control}
                  name="bankBalance"
                  label={copy.openingBankLabel}
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
          
          <FormDialog
            open={transferOpen}
            onOpenChange={setTransferOpen}
            title={copy.transferTitle}
            description={copy.transferDescription}
            schema={transferSchema}
            defaultValues={{ amount: "", referenceCode: "" }}
            onSubmit={onTransferSubmit}
            successMessage={copy.transferSuccess}
            submitLabel={copy.transferSubmit}
          >
            {(form) => (
              <>
                <MoneyVndField
                  control={form.control}
                  name="amount"
                  label={copy.transferAmountLabel}
                  required
                />
                <TextField
                  control={form.control}
                  name="referenceCode"
                  label={copy.transferRefLabel}
                  placeholder="SePay Webhook Ref"
                />
              </>
            )}
          </FormDialog>
        </>
      ) : null}
    </div>
  );
}
