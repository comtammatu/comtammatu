"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatAccountingVND as formatVND } from "@comtammatu/shared/format";
import { formatVNDate, formatVNTimeSeconds } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import {
  InputGroup,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  RadioGroup,
  RadioGroupItem,
} from "@comtammatu/ui/components/radio-group";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { cn } from "@comtammatu/ui";
import { confirm } from "@/components/confirm-dialog";
import { AppSheet } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  canManuallyLinkSepayPayment,
  resolveSepayTransactionInstant,
  type SepayBankTransaction,
} from "../_lib/sepay-bank-transaction-model";
import {
  linkSepayTransactionToPayment,
  recordBankTransactionCashDeposit,
  searchSepayMatchablePayments,
  type SepayMatchablePayment,
} from "../bank-webhook-review-actions";
import { BankMatchEvidence } from "./bank-match-evidence";

const copy = messages.finance.bankTransactions;
const table = copy.unmatchedMoneyInTable;

type MoneyInPurpose = "order" | "cash_deposit";

export type SalesBranchOption = {
  id: number;
  name: string;
};

export function MatchPaymentSheet({
  tx,
  canLinkPayments,
  touch,
  trigger,
  salesBranches,
}: {
  tx: SepayBankTransaction;
  canLinkPayments: boolean;
  touch: boolean;
  trigger: React.ReactElement;
  salesBranches: readonly SalesBranchOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [purpose, setPurpose] = React.useState<MoneyInPurpose>("order");
  const [orderQuery, setOrderQuery] = React.useState("");
  const [selectedPaymentId, setSelectedPaymentId] = React.useState<
    string | null
  >(null);
  const [items, setItems] = React.useState<SepayMatchablePayment[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [isSearchPending, startSearchTransition] = React.useTransition();
  const [isPaymentPending, startPaymentTransition] = React.useTransition();
  const [isDepositPending, startDepositTransition] = React.useTransition();
  const [cashBranchId, setCashBranchId] = React.useState<string>("");
  const bankTransactionId = tx.bankTransactionId ?? null;
  const eventId = tx.eventId;
  const previousOpenRef = React.useRef(false);

  const loadOrders = React.useCallback(
    (query: string) => {
      const trimmed = query.trim();
      setSearchError(null);
      startSearchTransition(async () => {
        const result = await searchSepayMatchablePayments({
          query: trimmed,
          amount: trimmed === "" ? tx.amount : undefined,
        });
        if (!result.success || result.data == null) {
          setSearchError(result.error ?? table.noMatchingOrders);
          setItems([]);
          setLoaded(true);
          return;
        }
        setItems(result.data.items);
        setLoaded(true);
        if (result.data.items.length === 1) {
          const only = result.data.items[0];
          if (only != null) setSelectedPaymentId(String(only.paymentId));
        }
      });
    },
    [tx.amount],
  );

  React.useEffect(() => {
    const justOpened = open && !previousOpenRef.current;
    previousOpenRef.current = open;
    if (!justOpened) return;
    setPurpose("order");
    setOrderQuery("");
    setSelectedPaymentId(null);
    setItems([]);
    setLoaded(false);
    setSearchError(null);
    setCashBranchId("");
    loadOrders("");
  }, [loadOrders, open]);

  if (
    !canLinkPayments ||
    (bankTransactionId == null && eventId == null) ||
    !canManuallyLinkSepayPayment(tx)
  ) {
    return null;
  }

  const selected = items.find(
    (item) => String(item.paymentId) === selectedPaymentId,
  );
  const canRecordCashDeposit = bankTransactionId != null;
  const resultLabel =
    orderQuery.trim() === "" ? table.suggestedOrders : table.searchResults;

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = orderQuery.trim();
    if (trimmed === "") {
      toast.error(table.linkInvalid);
      return;
    }
    setSelectedPaymentId(null);
    loadOrders(trimmed);
  };

  const handleMatchOrder = () => {
    const paymentCode = selected?.paymentCode ?? orderQuery.trim();
    if (paymentCode === "") {
      toast.error(table.linkInvalid);
      return;
    }

    startPaymentTransition(async () => {
      const res = await linkSepayTransactionToPayment({
        bankTransactionId,
        eventId,
        paymentCode,
      });
      if (!res.success) {
        toast.error(res.error ?? table.linkError);
        return;
      }
      toast.success(table.linkSuccess);
      setOpen(false);
      router.refresh();
    });
  };

  const handleCashDeposit = async () => {
    if (bankTransactionId == null) return;
    const branchId = Number(cashBranchId);
    const branch = salesBranches.find((item) => item.id === branchId);
    if (!Number.isInteger(branchId) || branchId <= 0 || branch == null) {
      toast.error(table.cashDepositBranchRequired);
      return;
    }

    const approved = await confirm({
      title: table.cashDepositConfirmTitle,
      description: table.cashDepositConfirm(formatVND(tx.amount), branch.name),
      confirmText: table.cashDepositAction,
    });
    if (!approved) return;

    startDepositTransition(async () => {
      const res = await recordBankTransactionCashDeposit({
        bankTransactionId,
        branchId,
      });
      if (!res.success) {
        toast.error(res.error ?? table.cashDepositError);
        return;
      }
      toast.success(table.cashDepositSuccess);
      setOpen(false);
      router.refresh();
    });
  };

  const busy = isPaymentPending || isDepositPending || isSearchPending;

  return (
    <AppSheet
      open={open}
      onOpenChange={setOpen}
      title={table.linkTitle}
      description={table.linkDescription}
      trigger={trigger}
      contentClassName="overflow-hidden"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      footer={
        purpose === "order" ? (
          <Button
            type="button"
            size={touch ? "touch" : "default"}
            className="w-full"
            disabled={busy || selected == null}
            onClick={handleMatchOrder}
          >
            {isPaymentPending ? table.linkPending : table.linkPaymentAction}
          </Button>
        ) : canRecordCashDeposit ? (
          <Button
            type="button"
            size={touch ? "touch" : "default"}
            className="w-full"
            disabled={busy || cashBranchId === ""}
            onClick={() => void handleCashDeposit()}
          >
            {isDepositPending ? table.cashDepositPending : table.cashDepositAction}
          </Button>
        ) : null
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <BankMatchEvidence
          transferType="in"
          amount={tx.amount}
          content={tx.content}
          occurredAt={resolveSepayTransactionInstant(tx)}
          reference={tx.referenceCode ?? tx.code ?? tx.requestId}
          accountNumber={tx.accountNumber}
        />
        <ToggleGroup
          type="single"
          value={purpose}
          variant="outline"
          size={touch ? "touch" : "default"}
          spacing={0}
          className="grid w-full grid-cols-2"
          aria-label={copy.matchPurposeTitle}
          onValueChange={(value) => {
            if (value === "order" || value === "cash_deposit") {
              setPurpose(value);
            }
          }}
        >
          <ToggleGroupItem value="order" className="min-w-0 justify-center">
            {table.orderPurpose}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="cash_deposit"
            className="min-w-0 justify-center"
            disabled={!canRecordCashDeposit}
          >
            {table.cashDepositAction}
          </ToggleGroupItem>
        </ToggleGroup>
        {purpose === "order" ? (
          <div className="grid gap-3">
            <form className="grid gap-2" onSubmit={handleSearch}>
              <Field>
                <FieldLabel htmlFor="bank-match-order-number">
                  {table.linkInputLabel}
                </FieldLabel>
                <InputGroup size={touch ? "touch" : "default"}>
                  <InputGroupInput
                    id="bank-match-order-number"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={64}
                    aria-describedby="bank-match-order-help"
                    placeholder={table.linkInputPlaceholder}
                    value={orderQuery}
                    onChange={(event) => setOrderQuery(event.target.value)}
                    disabled={busy}
                    className="font-mono"
                  />
                </InputGroup>
                <FieldDescription id="bank-match-order-help">
                  {table.linkInputHelp}
                </FieldDescription>
              </Field>
              <Button
                type="submit"
                size={touch ? "touch" : "default"}
                variant="outline"
                disabled={busy}
              >
                {isSearchPending ? table.linkSearchPending : table.linkSearchAction}
              </Button>
            </form>
            {searchError ? (
              <p role="status" className="text-xs text-destructive">
                {searchError}
              </p>
            ) : null}
            {loaded && items.length === 0 && searchError == null ? (
              <p className="text-sm text-muted-foreground">
                {table.noMatchingOrders}
              </p>
            ) : null}
            {items.length > 0 ? (
              <div className="grid gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {resultLabel}
                </p>
                <RadioGroup
                  value={selectedPaymentId ?? ""}
                  onValueChange={setSelectedPaymentId}
                  className="gap-1"
                  aria-label={table.selectOrder}
                >
                  {items.map((item) => {
                    const optionId = `bank-match-order-${item.paymentId}`;
                    const amountMatches = item.amount === tx.amount;
                    const time = `${formatVNDate(item.createdAt)} ${formatVNTimeSeconds(item.createdAt)}`;
                    return (
                      <label
                        key={item.paymentId}
                        htmlFor={optionId}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/30",
                          selectedPaymentId === String(item.paymentId) &&
                            "bg-muted/50",
                        )}
                      >
                        <RadioGroupItem
                          id={optionId}
                          value={String(item.paymentId)}
                          size={touch ? "touch" : "default"}
                          disabled={busy}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-sm font-medium">
                            {item.orderNumber}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {item.branchName ? `${item.branchName} · ` : ""}
                            {time} ·{" "}
                            {item.status === "pending"
                              ? table.orderWaiting
                              : table.orderPaid}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="font-mono text-xs tabular-nums">
                            {formatVND(item.amount)}
                          </span>
                          <Badge variant={amountMatches ? "success" : "warning"}>
                            {amountMatches
                              ? table.amountMatches
                              : table.amountDiffers}
                          </Badge>
                        </span>
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3">
            <p className="font-medium">{table.cashDepositTitle}</p>
            <p className="text-sm text-muted-foreground">
              {table.cashDepositDescription}
            </p>
            <Field>
              <FieldLabel htmlFor="bank-match-cash-branch">
                {table.cashDepositBranchLabel}
              </FieldLabel>
              <Select
                value={cashBranchId}
                onValueChange={setCashBranchId}
                disabled={busy}
              >
                <SelectTrigger
                  id="bank-match-cash-branch"
                  size={touch ? "touch" : "default"}
                  className="w-full"
                >
                  <SelectValue placeholder={table.cashDepositBranchRequired} />
                </SelectTrigger>
                <SelectContent>
                  {salesBranches.map((branch) => (
                    <SelectItem
                      key={branch.id}
                      value={String(branch.id)}
                      size={touch ? "touch" : "default"}
                    >
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}
      </div>
    </AppSheet>
  );
}
