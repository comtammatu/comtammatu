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
import { AppSection } from "@/components/surface";

const ADVISORY_THRESHOLD_VND = 200_000;
const MST_REGEX = /^\d{10}(-\d{3})?$/;

export interface InvoiceFormState {
  enabled: boolean;
  buyerName: string;
  buyerTaxCode: string;
  buyerAddress: string;
}

export const EMPTY_INVOICE_FORM: InvoiceFormState = {
  enabled: false,
  buyerName: "",
  buyerTaxCode: "",
  buyerAddress: "",
};

export interface InvoiceFormPayload {
  buyerName: string;
  buyerTaxCode?: string;
  buyerAddress?: string;
  buyerNotGetInvoice?: boolean;
}

export function isInvoiceFormValid(state: InvoiceFormState): boolean {
  if (!state.enabled) return true;
  const name = state.buyerName.trim();
  const mst = state.buyerTaxCode.trim();
  if (mst.length > 0 && !MST_REGEX.test(mst)) return false;
  if (mst.length > 0 && name.length === 0) return false;
  return true;
}

export function buildInvoicePayload(
  state: InvoiceFormState,
): InvoiceFormPayload {
  const name = state.enabled ? state.buyerName.trim() : "";
  const mst = state.enabled ? state.buyerTaxCode.trim() : "";
  const addr = state.enabled ? state.buyerAddress.trim() : "";
  const hasBuyerDetails = name.length > 0 || mst.length > 0 || addr.length > 0;
  const buyerNotGetInvoice = !state.enabled || !hasBuyerDetails;

  return {
    buyerName: name || BUYER_NOT_GET_INVOICE_NAME,
    ...(buyerNotGetInvoice ? { buyerNotGetInvoice: true } : {}),
    ...(mst ? { buyerTaxCode: mst } : {}),
    ...(addr ? { buyerAddress: addr } : {}),
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

  const showAdvisory = !state.enabled && totalAmount >= ADVISORY_THRESHOLD_VND;
  const buyerNotGetInvoice = !state.enabled;

  const mstTrim = state.buyerTaxCode.trim();
  const mstInvalid = mstTrim.length > 0 && !MST_REGEX.test(mstTrim);
  const nameMissing =
    state.enabled && mstTrim.length > 0 && state.buyerName.trim().length === 0;

  return (
    <AppSection size="sm" contentClassName="gap-3">
      <>
        <Field orientation="horizontal">
          <Checkbox
            id={checkboxId}
            checked={buyerNotGetInvoice}
            disabled={disabled}
            onCheckedChange={(checked) =>
              checked === true
                ? onChange({
                    enabled: false,
                    buyerName: "",
                    buyerTaxCode: "",
                    buyerAddress: "",
                  })
                : onChange({ ...state, enabled: true })
            }
          />
          <FieldLabel
            htmlFor={checkboxId}
            className="flex flex-1 items-center gap-2 text-sm font-medium"
          >
            <IconReceipt />
            Người mua không lấy hóa đơn
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
          <FieldGroup className="gap-2.5">
            <Field data-invalid={nameMissing || undefined}>
              <FieldLabel htmlFor={nameId} className="text-xs">
                Tên người mua / công ty{""}
                {mstTrim ? (
                  <span className="text-destructive">*</span>
                ) : (
                  <span className="text-muted-foreground">(tùy chọn)</span>
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
                placeholder="Tên khách / công ty"
                aria-invalid={nameMissing || undefined}
              />
            </Field>

            <Field data-invalid={mstInvalid || undefined}>
              <FieldLabel htmlFor={mstId} className="text-xs">
                Mã số thuế{""}
                <span className="text-muted-foreground">
                  (tùy chọn, 10 hoặc 13 số)
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
                <FieldError>
                  MST phải có dạng 10 số hoặc 10-3 số (vd 0123456789-001).
                </FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor={addrId} className="text-xs">
                Địa chỉ{""}
                <span className="text-muted-foreground">(tùy chọn)</span>
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
          </FieldGroup>
        ) : null}
      </>
    </AppSection>
  );
}
