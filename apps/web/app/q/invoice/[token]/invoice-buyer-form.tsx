"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ReceiptText as IconReceipt } from "lucide-react";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Field, FieldError, FieldLabel } from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { PublicSection } from "@/components/surface";
import {
  isBusinessTaxCode,
  lookupBusinessTaxCode,
} from "@lib/hddt/business-tax-lookup";
import { BUYER_KIND_TOGGLE_ITEM_CLASS } from "@lib/hddt/buyer-kind-ui";
import { invoiceBuyer } from "@lib/messages/invoice-buyer";
import {
  submitInvoiceBuyerDetails,
  type SubmitInvoiceBuyerDetailsResult,
} from "./actions";

type BuyerKind = "business" | "individual";
type LookupStatus = "idle" | "loading" | "found" | "not-found" | "unavailable";

const MST_REGEX = /^\d{10}(-\d{3})?$/;

export function InvoiceBuyerForm({
  token,
  expiresAt,
}: {
  token: string;
  expiresAt: string;
}) {
  const [buyerKind, setBuyerKind] = useState<BuyerKind>("business");
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

  function resetBuyerFields() {
    requestRef.current?.abort();
    setTaxCode("");
    setBuyerName("");
    setBuyerAddress("");
    setLookupStatus("idle");
    setResult(null);
  }

  function handleBuyerKindChange(value: string | null) {
    if (value !== "business" && value !== "individual") return;
    setBuyerKind(value);
    resetBuyerFields();
  }

  function handleTaxCodeChange(value: string) {
    requestRef.current?.abort();
    setTaxCode(value);
    if (buyerKind === "business") {
      setBuyerName("");
      setBuyerAddress("");
      setLookupStatus("idle");
    }
    setResult(null);
  }

  async function handleLookup() {
    if (buyerKind !== "business") return;
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

  const taxTrim = taxCode.trim();
  const taxCodeInvalid =
    taxTrim.length > 0 &&
    (buyerKind === "business"
      ? !isBusinessTaxCode(taxTrim)
      : !MST_REGEX.test(taxTrim));
  const individualNameMissing =
    buyerKind === "individual" && buyerName.trim().length === 0;
  const canSubmit =
    buyerKind === "business"
      ? lookupStatus === "found" && email.trim().length > 0
      : !individualNameMissing &&
        email.trim().length > 0 &&
        !taxCodeInvalid;

  function handleSubmit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const nextResult =
        buyerKind === "business"
          ? await submitInvoiceBuyerDetails({
              buyerKind: "business",
              token,
              taxCode: taxTrim,
              email: email.trim(),
            })
          : await submitInvoiceBuyerDetails({
              buyerKind: "individual",
              token,
              buyerName: buyerName.trim(),
              email: email.trim(),
              taxCode: taxTrim,
              buyerAddress: buyerAddress.trim(),
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

  const lookupMessage =
    buyerKind !== "business"
      ? null
      : lookupStatus === "loading"
        ? invoiceBuyer.lookupLoading
        : lookupStatus === "found"
          ? invoiceBuyer.lookupFound
          : lookupStatus === "not-found"
            ? invoiceBuyer.lookupNotFound
            : lookupStatus === "unavailable"
              ? invoiceBuyer.lookupUnavailable
              : null;

  return (
    <PublicSection
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
        <Field>
          <FieldLabel>{invoiceBuyer.buyerKindLabel}</FieldLabel>
          <ToggleGroup
            type="single"
            value={buyerKind}
            onValueChange={handleBuyerKindChange}
            variant="outline"
            size="touch"
            className="grid w-full grid-cols-2 gap-2"
            aria-label={invoiceBuyer.buyerKindLabel}
          >
            <ToggleGroupItem
              value="business"
              className={`text-sm ${BUYER_KIND_TOGGLE_ITEM_CLASS}`}
            >
              {invoiceBuyer.buyerKindBusiness}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="individual"
              className={`text-sm ${BUYER_KIND_TOGGLE_ITEM_CLASS}`}
            >
              {invoiceBuyer.buyerKindIndividual}
            </ToggleGroupItem>
          </ToggleGroup>
          <p
            role="status"
            aria-live="polite"
            className="text-xs text-muted-foreground"
          >
            {invoiceBuyer.buyerKindSelected(buyerKind)}
          </p>
        </Field>

        <Field data-invalid={taxCodeInvalid || undefined}>
          <FieldLabel htmlFor="invoice-buyer-tax-code">
            {buyerKind === "business"
              ? invoiceBuyer.taxCodeLabel
              : invoiceBuyer.taxCodeOptionalLabel}
          </FieldLabel>
          <div
            className={
              buyerKind === "business"
                ? "grid gap-2 sm:grid-cols-[1fr_auto]"
                : undefined
            }
          >
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
              onBlur={() => {
                if (buyerKind === "business") void handleLookup();
              }}
            />
            {buyerKind === "business" ? (
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
            ) : null}
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

        <Field data-invalid={individualNameMissing || undefined}>
          <FieldLabel htmlFor="invoice-buyer-name">
            {buyerKind === "business"
              ? invoiceBuyer.buyerNameLabel
              : invoiceBuyer.individualNameLabel}
          </FieldLabel>
          <Input
            id="invoice-buyer-name"
            controlSize="touch"
            value={buyerName}
            readOnly={buyerKind === "business"}
            disabled={isPending && buyerKind === "individual"}
            required={buyerKind === "individual"}
            maxLength={200}
            placeholder={
              buyerKind === "business"
                ? invoiceBuyer.autoFilledPlaceholder
                : undefined
            }
            onChange={
              buyerKind === "individual"
                ? (event) => setBuyerName(event.target.value)
                : undefined
            }
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="invoice-buyer-address">
            {buyerKind === "business"
              ? invoiceBuyer.addressLabel
              : invoiceBuyer.addressOptionalLabel}
          </FieldLabel>
          <Textarea
            id="invoice-buyer-address"
            value={buyerAddress}
            readOnly={buyerKind === "business"}
            disabled={isPending && buyerKind === "individual"}
            maxLength={500}
            placeholder={
              buyerKind === "business"
                ? invoiceBuyer.autoFilledPlaceholder
                : undefined
            }
            onChange={
              buyerKind === "individual"
                ? (event) => setBuyerAddress(event.target.value)
                : undefined
            }
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

        <Button type="submit" size="touch" disabled={isPending || !canSubmit}>
          {isPending ? <Spinner data-icon="inline-start" /> : null}
          {invoiceBuyer.submitAction}
        </Button>
      </form>
    </PublicSection>
  );
}
