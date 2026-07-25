"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ReceiptText as IconReceipt } from "lucide-react";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Field, FieldError, FieldLabel } from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { AppSection } from "@/components/surface";
import {
  isBusinessTaxCode,
  lookupBusinessTaxCode,
} from "@lib/hddt/business-tax-lookup";
import { invoiceBuyer } from "@lib/messages/invoice-buyer";
import {
  submitInvoiceBuyerDetails,
  type SubmitInvoiceBuyerDetailsResult,
} from "./actions";

type LookupStatus = "idle" | "loading" | "found" | "not-found" | "unavailable";

export function InvoiceBuyerForm({
  token,
  expiresAt,
}: {
  token: string;
  expiresAt: string;
}) {
  const [taxCode, setTaxCode] = useState("");
  const [email, setEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>("idle");
  const [result, setResult] = useState<SubmitInvoiceBuyerDetailsResult | null>(
    null,
  );
  const [expired, setExpired] = useState(false);
  const [isPending, startTransition] = useTransition();
  const requestRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const remaining = Date.parse(expiresAt) - Date.now();
    if (remaining <= 0) {
      setExpired(true);
      return;
    }
    const timer = window.setTimeout(() => setExpired(true), remaining);
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  function handleTaxCodeChange(value: string) {
    requestRef.current?.abort();
    setTaxCode(value);
    setBuyerName("");
    setBuyerAddress("");
    setLookupStatus("idle");
    setResult(null);
  }

  async function handleLookup() {
    const normalized = taxCode.trim();
    if (!isBusinessTaxCode(normalized)) {
      setLookupStatus("not-found");
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLookupStatus("loading");
    setResult(null);

    try {
      const business = await lookupBusinessTaxCode(
        normalized,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (!business) {
        setLookupStatus("not-found");
        return;
      }
      setBuyerName(business.name);
      setBuyerAddress(business.address);
      setLookupStatus("found");
    } catch {
      if (controller.signal.aborted) return;
      setLookupStatus("unavailable");
    }
  }

  function handleSubmit() {
    if (lookupStatus !== "found") return;
    startTransition(async () => {
      const nextResult = await submitInvoiceBuyerDetails({
        token,
        taxCode: taxCode.trim(),
        email: email.trim(),
      });
      setResult(nextResult);
    });
  }

  if (result?.ok) {
    return (
      <Alert>
        <AlertDescription>{invoiceBuyer.success}</AlertDescription>
      </Alert>
    );
  }
  if (expired || (result && !result.ok && result.terminal)) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {result && !result.ok ? result.message : invoiceBuyer.expired}
        </AlertDescription>
      </Alert>
    );
  }

  const taxCodeInvalid =
    taxCode.trim().length > 0 && !isBusinessTaxCode(taxCode);
  const lookupMessage =
    lookupStatus === "loading"
      ? invoiceBuyer.lookupLoading
      : lookupStatus === "found"
        ? invoiceBuyer.lookupFound
        : lookupStatus === "not-found"
          ? invoiceBuyer.lookupNotFound
          : lookupStatus === "unavailable"
            ? invoiceBuyer.lookupUnavailable
            : null;

  return (
    <AppSection
      title={invoiceBuyer.sectionTitle}
      description={invoiceBuyer.sectionDescription(formatVNDateTime(expiresAt))}
      icon={<IconReceipt />}
      size="sm"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <Field data-invalid={taxCodeInvalid || undefined}>
          <FieldLabel htmlFor="invoice-buyer-tax-code">
            {invoiceBuyer.taxCodeLabel}
          </FieldLabel>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              id="invoice-buyer-tax-code"
              controlSize="touch"
              className="font-mono"
              inputMode="numeric"
              maxLength={14}
              autoComplete="off"
              spellCheck={false}
              value={taxCode}
              disabled={isPending}
              aria-invalid={taxCodeInvalid || undefined}
              aria-describedby={
                lookupMessage ? "invoice-buyer-tax-lookup" : undefined
              }
              placeholder="0123456789"
              onChange={(event) => handleTaxCodeChange(event.target.value)}
              onBlur={() => void handleLookup()}
            />
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={isPending || lookupStatus === "loading"}
              onClick={() => void handleLookup()}
            >
              {lookupStatus === "loading" ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              {invoiceBuyer.lookupAction}
            </Button>
          </div>
          {taxCodeInvalid ? (
            <FieldError>{invoiceBuyer.taxCodeInvalid}</FieldError>
          ) : null}
          {lookupMessage ? (
            <p
              id="invoice-buyer-tax-lookup"
              role="status"
              aria-live="polite"
              className="text-xs text-muted-foreground"
            >
              {lookupMessage}
            </p>
          ) : null}
        </Field>

        <Field>
          <FieldLabel htmlFor="invoice-buyer-name">
            {invoiceBuyer.buyerNameLabel}
          </FieldLabel>
          <Input
            id="invoice-buyer-name"
            controlSize="touch"
            value={buyerName}
            readOnly
            placeholder={invoiceBuyer.autoFilledPlaceholder}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="invoice-buyer-address">
            {invoiceBuyer.addressLabel}
          </FieldLabel>
          <Textarea
            id="invoice-buyer-address"
            value={buyerAddress}
            readOnly
            placeholder={invoiceBuyer.autoFilledPlaceholder}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="invoice-buyer-email">
            {invoiceBuyer.emailLabel}
          </FieldLabel>
          <Input
            id="invoice-buyer-email"
            type="email"
            required
            controlSize="touch"
            autoComplete="email"
            maxLength={254}
            spellCheck={false}
            value={email}
            disabled={isPending}
            placeholder="email@example.com"
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        {result && !result.ok ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        ) : null}

        <Button
          type="submit"
          size="touch"
          disabled={isPending || lookupStatus !== "found"}
        >
          {isPending ? <Spinner data-icon="inline-start" /> : null}
          {invoiceBuyer.submitAction}
        </Button>
      </form>
    </AppSection>
  );
}
