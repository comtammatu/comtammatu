"use client";

import { useMemo, useState, useTransition } from "react";
import { Search as IconSearch } from "lucide-react";
import { AppDialog } from "@/components/form";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
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
import { toast } from "@comtammatu/ui/components/sonner";
import { formatAccountingVND as formatVND } from "@comtammatu/shared/format";
import { FINANCE_VI, POS_VI } from "@comtammatu/shared/messages";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
import { createTaxInvoice, resolveOrderForManualInvoice } from "./actions";
import type { ManualInvoiceOrderPreview } from "./_lib/finance-types";
import { messages } from "@lib/messages";
import { formatVNDateTime } from "@/_lib/format-datetime";

const MI = messages.finance.invoiceList.manualIssue;
const MST_REGEX = /^\d{10}(-\d{3})?$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatHistoricalAggregateDate(date: string): string {
  return formatVNBusinessDate(date, date);
}

interface ManualIssueInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: { id: number; name: string }[];
  defaultBranchId?: number;
  onIssued: () => void;
}

export function ManualIssueInvoiceDialog({
  open,
  onOpenChange,
  branches,
  defaultBranchId,
  onIssued,
}: ManualIssueInvoiceDialogProps) {
  const initialBranch = useMemo(
    () =>
      defaultBranchId != null && branches.some((b) => b.id === defaultBranchId)
        ? String(defaultBranchId)
        : branches.length === 1
          ? String(branches[0]!.id)
          : "",
    [defaultBranchId, branches],
  );

  const [branchId, setBranchId] = useState(initialBranch);
  const [orderNumber, setOrderNumber] = useState("");
  const [preview, setPreview] = useState<ManualInvoiceOrderPreview | null>(
    null,
  );
  // Finance recovery may issue either a named buyer or the server-owned
  // consumer fallback.
  const [enabled, setEnabled] = useState(false);
  const [buyerKind, setBuyerKind] = useState<"individual" | "business">(
    "business",
  );
  const [buyerName, setBuyerName] = useState("");
  const [buyerTaxCode, setBuyerTaxCode] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [isPending, startTransition] = useTransition();

  function resetAll() {
    setBranchId(initialBranch);
    setOrderNumber("");
    setPreview(null);
    setEnabled(false);
    setBuyerKind("business");
    setBuyerName("");
    setBuyerTaxCode("");
    setBuyerAddress("");
    setBuyerEmail("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetAll();
    onOpenChange(next);
  }

  function resetToLookup() {
    setPreview(null);
    setEnabled(false);
    setBuyerKind("business");
    setBuyerName("");
    setBuyerTaxCode("");
    setBuyerAddress("");
    setBuyerEmail("");
  }

  const canLookup = branchId !== "" && orderNumber.trim().length > 0;

  function handleLookup() {
    if (!canLookup) return;
    startTransition(async () => {
      const result = await resolveOrderForManualInvoice({
        orderNumber: orderNumber.trim(),
        branchId: Number(branchId),
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? MI.lookupFailed);
        return;
      }
      setPreview(result.data);
    });
  }

  const mstTrim = buyerTaxCode.trim();
  const emailTrim = buyerEmail.trim();
  const nameTrim = buyerName.trim();
  const mstInvalid = mstTrim.length > 0 && !MST_REGEX.test(mstTrim);
  const emailInvalid = emailTrim.length > 0 && !EMAIL_REGEX.test(emailTrim);
  const nameMissing =
    enabled &&
    ((buyerKind === "business" && mstTrim.length > 0 && nameTrim.length === 0) ||
      (buyerKind === "individual" &&
        (mstTrim.length > 0 ||
          buyerAddress.trim().length > 0 ||
          emailTrim.length > 0) &&
        nameTrim.length === 0));
  const businessMstMissing =
    enabled && buyerKind === "business" && nameTrim.length > 0 && mstTrim.length === 0;
  const buyerValid =
    !mstInvalid && !emailInvalid && !nameMissing && !businessMstMissing;

  function handleIssue() {
    if (!preview || !preview.issuable || !buyerValid) return;
    const name = enabled ? nameTrim : "";
    const mst = enabled ? mstTrim : "";
    const addr = enabled ? buyerAddress.trim() : "";
    const email = enabled ? emailTrim : "";
    const hasBuyerDetails =
      name.length > 0 || mst.length > 0 || addr.length > 0 || email.length > 0;
    const orderId = preview.orderId;

    startTransition(async () => {
      const result = await createTaxInvoice({
        orderId,
        ...(name ? { buyerName: name } : {}),
        ...(mst ? { buyerTaxCode: mst } : {}),
        ...(addr ? { buyerAddress: addr } : {}),
        ...(email ? { buyerEmail: email } : {}),
        ...(!enabled || !hasBuyerDetails
          ? { buyerNotGetInvoice: true }
          : { buyerKind }),
      });
      if (!result.success) {
        toast.error(result.error ?? MI.failed);
        return;
      }
      const issued = result.data as {
        invoice_number?: string | null;
      } | null;
      toast.success(MI.success(issued?.invoice_number ?? `#${orderId}`));
      onIssued();
      handleOpenChange(false);
    });
  }

  const ineligibleReason = preview
    ? preview.paymentStatus !== "paid"
      ? MI.unpaid
      : preview.historicalAggregateDate
        ? MI.historicalAggregate(
            formatHistoricalAggregateDate(preview.historicalAggregateDate),
          )
        : preview.existingInvoiceStatus && !preview.isDraftRetry
          ? MI.alreadyInvoiced(
              preview.existingInvoiceNumber ?? preview.existingInvoiceStatus,
            )
          : !preview.hasActiveItems
            ? MI.noItems
            : null
    : null;

  const footer = !preview ? (
    <Button onClick={handleLookup} disabled={!canLookup || isPending}>
      {isPending ? (
        <Spinner className="size-4" />
      ) : (
        <IconSearch className="size-4" />
      )}
      {MI.lookup}
    </Button>
  ) : (
    <>
      <Button variant="outline" onClick={resetToLookup} disabled={isPending}>
        {MI.changeOrder}
      </Button>
      {!ineligibleReason ? (
        <Button onClick={handleIssue} disabled={isPending || !buyerValid}>
          {isPending ? <Spinner className="size-4" /> : null}
          {MI.submit}
        </Button>
      ) : null}
    </>
  );

  return (
    <AppDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={MI.title}
      description={MI.description}
      contentClassName="max-w-lg"
      footer={footer}
    >
      {!preview ? (
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="manual-issue-branch">{MI.branchLabel}</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger id="manual-issue-branch">
                <SelectValue placeholder={MI.branchPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manual-issue-order">{MI.orderNumberLabel}</Label>
            <Input
              id="manual-issue-order"
              value={orderNumber}
              disabled={isPending}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder={MI.orderNumberPlaceholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLookup();
              }}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{MI.orderNumberLabel}</dt>
            <dd className="font-mono">{preview.orderNumber}</dd>
            <dt className="text-muted-foreground">{MI.totalLabel}</dt>
            <dd className="font-mono tabular-nums">
              {formatVND(preview.totalAmount)}
            </dd>
            <dt className="text-muted-foreground">{MI.timeLabel}</dt>
            <dd>{formatVNDateTime(preview.createdAt)}</dd>
          </dl>

          {ineligibleReason ? (
            <Alert variant="destructive">
              <AlertDescription>{ineligibleReason}</AlertDescription>
            </Alert>
          ) : (
            <>
              {preview.isDraftRetry ? (
                <Alert>
                  <AlertDescription>{MI.draftRetry}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="manual-issue-no-invoice"
                  checked={!enabled}
                  disabled={isPending}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      setEnabled(false);
                      setBuyerKind("business");
                      setBuyerName("");
                      setBuyerTaxCode("");
                      setBuyerAddress("");
                      setBuyerEmail("");
                    } else {
                      setEnabled(true);
                    }
                  }}
                />
                <Label htmlFor="manual-issue-no-invoice">
                  {POS_VI.buyerNoInvoice}
                </Label>
              </div>
              {enabled ? (
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label>{FINANCE_VI.buyerKindLabel}</Label>
                    <ToggleGroup
                      type="single"
                      value={buyerKind}
                      onValueChange={(value) => {
                        if (value === "business" || value === "individual") {
                          setBuyerKind(value);
                        }
                      }}
                      size="sm"
                      className="grid w-full grid-cols-2"
                      aria-label={FINANCE_VI.buyerKindLabel}
                      disabled={isPending}
                    >
                      <ToggleGroupItem value="business">
                        {FINANCE_VI.buyerKindBusiness}
                      </ToggleGroupItem>
                      <ToggleGroupItem value="individual">
                        {FINANCE_VI.buyerKindIndividual}
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="manual-issue-buyer-name">
                      {FINANCE_VI.buyerNameLabel}
                    </Label>
                    <Input
                      id="manual-issue-buyer-name"
                      value={buyerName}
                      disabled={isPending}
                      maxLength={200}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder={POS_VI.buyerNamePlaceholder}
                      aria-invalid={nameMissing || undefined}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="manual-issue-buyer-mst">
                      {FINANCE_VI.buyerTaxCodeLabel}
                    </Label>
                    <Input
                      id="manual-issue-buyer-mst"
                      value={buyerTaxCode}
                      disabled={isPending}
                      maxLength={14}
                      onChange={(e) => setBuyerTaxCode(e.target.value)}
                      placeholder={FINANCE_VI.buyerTaxCodePlaceholder}
                      aria-invalid={mstInvalid || undefined}
                    />
                    {mstInvalid ? (
                      <p className="text-xs text-destructive">
                        {FINANCE_VI.taxCodeFormatError}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="manual-issue-buyer-addr">
                      {POS_VI.addressLabel}
                    </Label>
                    <Input
                      id="manual-issue-buyer-addr"
                      value={buyerAddress}
                      disabled={isPending}
                      maxLength={500}
                      onChange={(e) => setBuyerAddress(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="manual-issue-buyer-email">
                      {FINANCE_VI.buyerEmailLabel}
                    </Label>
                    <Input
                      id="manual-issue-buyer-email"
                      type="email"
                      value={buyerEmail}
                      disabled={isPending}
                      maxLength={254}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                      placeholder={FINANCE_VI.buyerEmailPlaceholder}
                      aria-invalid={emailInvalid || undefined}
                    />
                    {emailInvalid ? (
                      <p className="text-xs text-destructive">
                        {FINANCE_VI.emailFormatError}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </AppDialog>
  );
}
