"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Landmark as IconBank, Wallet as IconWallet } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNDate, getVNDateString } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  BusinessDateField,
  FormDialog,
  MoneyVndField,
} from "@/components/form";
import { KpiCard } from "@/components/kpi/kpi-card";
import { AppSection, KpiRow } from "@/components/surface";
import { messages } from "@lib/messages";
import { setCashOpening } from "../cash-actions";
import type { CashSummary } from "../_lib/cash-cockpit";

const copy = messages.finance;

const openingSchema = z.object({
  balance: z.number().min(0).max(100_000_000_000),
  bankBalance: z.number().min(0).max(100_000_000_000),
  date: z.string().date(),
});

type OpeningValues = z.infer<typeof openingSchema>;

export function CurrentFundsSection({ cash }: { cash: CashSummary }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const defaultValues = useMemo<OpeningValues>(
    () => ({
      balance: cash.openingBalance,
      bankBalance: cash.bankOpeningBalance,
      date: cash.openingDate ?? getVNDateString(),
    }),
    [cash.bankOpeningBalance, cash.openingBalance, cash.openingDate],
  );

  return (
    <>
      <AppSection
        size="sm"
        title={copy.cash.onHandTitle}
        description={copy.cash.onHandDescription}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            {cash.hasOpening ? copy.cash.editOpening : copy.cash.setOpening}
          </Button>
        }
      >
        <KpiRow density="compact" className="lg:grid-cols-2 xl:grid-cols-2">
          <KpiCard
            icon={<IconWallet className="size-4 text-muted-foreground" />}
            label={copy.basic.kpis.cashOnHand}
            value={
              cash.hasOpening ? formatVND(cash.cashOnHand) : copy.common.noValue
            }
            hint={
              cash.hasOpening && cash.openingDate
                ? copy.cash.onHandBreakdown(
                    formatVND(cash.openingBalance),
                    formatVNDate(cash.openingDate),
                    formatVND(cash.cashInSince),
                    formatVND(cash.cashOutSince),
                  )
                : copy.cash.noOpening
            }
          />

          <KpiCard
            icon={<IconBank className="size-4 text-muted-foreground" />}
            label={copy.basic.kpis.bankOnHand}
            value={
              cash.hasBankOpening
                ? formatVND(cash.bankOnHand)
                : copy.common.noValue
            }
            hint={
              cash.hasBankOpening && cash.openingDate
                ? copy.cash.bankBreakdown(
                    formatVND(cash.bankOpeningBalance),
                    formatVNDate(cash.openingDate),
                    formatVND(cash.bankInSince),
                    formatVND(cash.bankOutSince),
                  )
                : copy.cash.bankNoOpening
            }
            href="/finance/bank-transactions"
          />
        </KpiRow>
      </AppSection>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={copy.cash.openingTitle}
        description={copy.cash.openingDescription}
        schema={openingSchema}
        defaultValues={defaultValues}
        onSubmit={setCashOpening}
        submitLabel={copy.cash.openingSubmit}
        onSuccess={() => {
          toast.success(copy.cash.openingSuccess);
          router.refresh();
        }}
      >
        {(form) => (
          <>
            <MoneyVndField
              control={form.control}
              name="balance"
              label={copy.cash.openingBalanceLabel}
              required
            />
            <MoneyVndField
              control={form.control}
              name="bankBalance"
              label={copy.cash.openingBankLabel}
              required
            />
            <BusinessDateField
              control={form.control}
              name="date"
              label={copy.cash.openingDateLabel}
              required
            />
          </>
        )}
      </FormDialog>
    </>
  );
}
