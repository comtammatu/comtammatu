/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: invoice form section displays inline vietnamese text for advisory warnings and placeholder text */
"use client";

import { useId } from "react";
import { Receipt as IconReceipt } from "lucide-react";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import { BUYER_NOT_GET_INVOICE_NAME } from "@comtammatu/shared/providers";
import { POS_VI } from "@comtammatu/shared/messages";
import { AppSection } from "@/components/surface";

const ADVISORY_THRESHOLD_VND = 200_000;
const MST_REGEX = /^\d{10}(-\d{3})?$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface InvoiceFormState {
  enabled: boolean;
  buyerName: string;
  buyerTaxCode: string;
  buyerAddress: string;
  buyerEmail: string;
}

export const EMPTY_INVOICE_FORM: InvoiceFormState = {
  enabled: false,
  buyerName: "",
  buyerTaxCode: "",
  buyerAddress: "",
  buyerEmail: "",
};

export interface InvoiceFormPayload {
  buyerName: string;
  buyerTaxCode?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  buyerNotGetInvoice?: boolean;
}

export function isInvoiceFormValid(state: InvoiceFormState): boolean {
  if (!state.enabled) return true;
  const name = state.buyerName.trim();
  const mst = state.buyerTaxCode.trim();
  const email = state.buyerEmail.trim();
  if (mst.length > 0 && !MST_REGEX.test(mst)) return false;
  if (mst.length > 0 && name.length === 0) return false;
  if (email.length > 0 && !EMAIL_REGEX.test(email)) return false;
  return true;
}

export function buildInvoicePayload(
  state: InvoiceFormState,
): InvoiceFormPayload {
  const name = state.enabled ? state.buyerName.trim() : "";
  const mst = state.enabled ? state.buyerTaxCode.trim() : "";
  const addr = state.enabled ? state.buyerAddress.trim() : "";
  const email = state.enabled ? state.buyerEmail.trim() : "";
  const hasBuyerDetails =
    name.length > 0 || mst.length > 0 || addr.length > 0 || email.length > 0;
  const buyerNotGetInvoice = !state.enabled || !hasBuyerDetails;

  return {
    buyerName: name || BUYER_NOT_GET_INVOICE_NAME,
    ...(buyerNotGetInvoice ? { buyerNotGetInvoice: true } : {}),
    ...(mst ? { buyerTaxCode: mst } : {}),
    ...(addr ? { buyerAddress: addr } : {}),
    ...(email ? { buyerEmail: email } : {}),
  };
}

interface InvoiceFormSectionProps {
  state: InvoiceFormState;
  totalAmount: number;
  disabled: boolean;
  onChange: (next: InvoiceFormState) => void;
}

export function InvoiceFormSection({
  state,
  totalAmount,
  disabled,
  onChange,
}: InvoiceFormSectionProps) {
  const checkboxId = useId();
  const nameId = useId();
  const mstId = useId();
  const addrId = useId();
  const emailId = useId();

  const showAdvisory = !state.enabled && totalAmount >= ADVISORY_THRESHOLD_VND;
  const buyerNotGetInvoice = !state.enabled;

  const mstTrim = state.buyerTaxCode.trim();
  const emailTrim = state.buyerEmail.trim();
  const mstInvalid = mstTrim.length > 0 && !MST_REGEX.test(mstTrim);
  const emailInvalid = emailTrim.length > 0 && !EMAIL_REGEX.test(emailTrim);
  const nameMissing =
    state.enabled && mstTrim.length > 0 && state.buyerName.trim().length === 0;

  return (
    <AppSection size="sm" contentClassName="gap-3">
      <>
        <Field orientation="horizontal">
          <Checkbox
            id={checkboxId}
            size="touch"
            checked={buyerNotGetInvoice}
            disabled={disabled}
            onCheckedChange={(checked) =>
              checked === true
                ? onChange({
                    enabled: false,
                    buyerName: "",
                    buyerTaxCode: "",
                    buyerAddress: "",
                    buyerEmail: "",
                  })
                : onChange({ ...state, enabled: true })
            }
          />
          <FieldLabel
            htmlFor={checkboxId}
            className="flex flex-1 items-center gap-2 text-sm font-medium"
          >
            <IconReceipt />
            {POS_VI.buyerNoInvoice}
          </FieldLabel>
        </Field>

        {showAdvisory ? (
          <Alert>
            <AlertDescription>
              HĐĐT vẫn phát hành với tên "{BUYER_NOT_GET_INVOICE_NAME}".
            </AlertDescription>
          </Alert>
        ) : null}

        {state.enabled ? (
          <FieldGroup className="gap-3">
            <Field data-invalid={nameMissing || undefined}>
              <FieldLabel htmlFor={nameId} className="text-xs">
                {POS_VI.buyerNameLabel}
                {""}
                {mstTrim ? (
                  <span className="text-destructive">*</span>
                ) : (
                  <span className="text-muted-foreground">
                    {POS_VI.optionalHint}
                  </span>
                )}
              </FieldLabel>
              <Input
                id={nameId}
                value={state.buyerName}
                disabled={disabled}
                maxLength={200}
                onChange={(e) =>
                  onChange({ ...state, buyerName: e.target.value })
                }
                placeholder={POS_VI.buyerNamePlaceholder}
                aria-invalid={nameMissing || undefined}
              />
            </Field>

            <Field data-invalid={mstInvalid || undefined}>
              <FieldLabel htmlFor={mstId} className="text-xs">
                {POS_VI.taxCodeLabel}
                {""}
                <span className="text-muted-foreground">
                  {POS_VI.taxCodeOptionalHint}
                </span>
              </FieldLabel>
              <Input
                id={mstId}
                value={state.buyerTaxCode}
                disabled={disabled}
                maxLength={14}
                onChange={(e) =>
                  onChange({ ...state, buyerTaxCode: e.target.value })
                }
                placeholder="0123456789"
                aria-invalid={mstInvalid || undefined}
              />
              {mstInvalid ? (
                <FieldError>{POS_VI.taxCodeError}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor={addrId} className="text-xs">
                {POS_VI.addressLabel}
                {""}
                <span className="text-muted-foreground">
                  {POS_VI.optionalHint}
                </span>
              </FieldLabel>
              <Input
                id={addrId}
                value={state.buyerAddress}
                disabled={disabled}
                maxLength={500}
                onChange={(e) =>
                  onChange({ ...state, buyerAddress: e.target.value })
                }
              />
            </Field>

            <Field data-invalid={emailInvalid || undefined}>
              <FieldLabel htmlFor={emailId} className="text-xs">
                Email nhận hóa đơn{""}
                <span className="text-muted-foreground">
                  {POS_VI.optionalHint}
                </span>
              </FieldLabel>
              <Input
                id={emailId}
                type="email"
                value={state.buyerEmail}
                disabled={disabled}
                maxLength={254}
                onChange={(e) =>
                  onChange({ ...state, buyerEmail: e.target.value })
                }
                placeholder="email@example.com"
                aria-invalid={emailInvalid || undefined}
              />
              {emailInvalid ? (
                <FieldError>Email không hợp lệ</FieldError>
              ) : null}
            </Field>
          </FieldGroup>
        ) : null}
      </>
    </AppSection>
  );
}
