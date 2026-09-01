"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import { formatCount } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import { matchBankByTransferToken } from "../bank-webhook-review-actions";
import type { SepayBankTransaction } from "../_lib/sepay-bank-transaction-model";
import { classifySepayReconciliationState } from "../_lib/sepay-bank-transaction-model";

const copy = messages.finance.bankTransactions;

export function AutoMatchTransferTokenButton({
  transactions,
  enabled,
  size = "default",
}: {
  transactions: SepayBankTransaction[];
  enabled: boolean;
  size?: "sm" | "default" | "touch" | "field";
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const buttonSize = size === "field" ? "default" : size;

  const candidateIds = React.useMemo(
    () =>
      transactions.flatMap((tx) => {
        if (tx.bankTransactionId == null) return [];
        if (classifySepayReconciliationState(tx) !== "needs_review") return [];
        return [tx.bankTransactionId];
      }),
    [transactions],
  );

  if (!enabled) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size={buttonSize}
      disabled={pending || candidateIds.length === 0}
      onClick={() => {
        if (candidateIds.length === 0) {
          toast.message(copy.autoMatchTokenEmpty);
          return;
        }
        startTransition(async () => {
          const result = await matchBankByTransferToken({
            bankTransactionIds: candidateIds,
          });
          if (!result.success || result.data == null) {
            toast.error(result.error ?? copy.autoMatchTokenError);
            return;
          }
          toast.success(
            copy.autoMatchTokenSuccess(
              formatCount(result.data.matched),
              formatCount(result.data.skipped),
              formatCount(result.data.needsReview),
            ),
          );
          router.refresh();
        });
      }}
    >
      {pending ? copy.autoMatchTokenPending : copy.autoMatchTokenAction}
    </Button>
  );
}
