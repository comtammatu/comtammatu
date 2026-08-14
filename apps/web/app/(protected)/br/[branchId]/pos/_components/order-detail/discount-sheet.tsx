"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatPercent, formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";

import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { FormattedNumberInput } from "@/components/form";

import { ACTIONS_VI, FORM_VI, POS_VI, PROMOTIONS_VI } from "@comtammatu/shared/messages";
import { StationSheet } from "@/components/surface";
import { Input } from "@comtammatu/ui/components/input";

export type DiscountType = "pct" | "vnd";

const DEFAULT_DISCOUNT_MODES: readonly DiscountType[] = ["pct", "vnd"];
const FALLBACK_DISCOUNT_MODES: readonly DiscountType[] = ["vnd"];

/** Item-level discount is VND-only (ADR 0034). Stable identity for callers. */
export const ITEM_DISCOUNT_MODES: readonly DiscountType[] = ["vnd"];

interface DiscountSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  subtotalLabel?: string;
  totalLabel?: string;
  clearLabel?: string;
  /** Allowed discount modes. Item discounts are VND-only (ADR 0034). */
  modes?: readonly DiscountType[];
  /** Subtotal trước giảm — dùng để live preview + clamp UI. */
  subtotal: number;
  /** Phụ phí trên đơn — cộng vào total preview. */
  serviceCharge: number;
  /** Discount hiện tại trên đơn (để pre-fill khi mở edit). */
  current: {
    type: DiscountType | null;
    value: number | null;
    note: string | null;
    amount: number;
  };
  isPending?: boolean;
  onSubmit: (input: {
    type: DiscountType;
    value: number;
    note: string;
  }) => void;
  /** Bỏ chiết khấu (gọi clear_order_discount). Chỉ active khi đang có discount.
   * Reason ≥3 ký tự — cùng ô textarea với "Áp dụng" để giữ UX gọn. */
  onClear: (reason: string) => void;
  promo?: {
    enabled: boolean;
    canManual: boolean;
    hasPromotion: boolean;
    onPreview: (
      code: string,
    ) => Promise<{ success: true; amount: number; name: string } | { success: false; error: string }>;
    onApplyCode: (code: string) => void;
    onClearPromo: (reason: string) => void;
  };
}

/**
 * Apply / edit / clear an order-level discount. Two tabs (% vs VND); the
 * input clamps live to the max for that tab (UI auto-correct per Q1 owner
 * decision: cashier nhập 150 → ô % tự về 100). Server clamps again as
 * defense-in-depth.
 *
 * Sheet (not Dialog) so the cashier on a mobile terminal sees the full
 * keyboard above the content. Dialog patterns work too but Sheet keeps the
 * footer pinned which matters when previewing the new total.
 */
export function DiscountSheet({
  open,
  onOpenChange,
  title = "Chiết khấu",
  subtotalLabel = FORM_VI.subtotal,
  totalLabel = POS_VI.newTotal,
  clearLabel = POS_VI.clearDiscount,
  modes = DEFAULT_DISCOUNT_MODES,
  subtotal,
  serviceCharge,
  current,
  isPending = false,
  onSubmit,
  onClear,
  promo,
}: DiscountSheetProps) {
  // Stabilize mode list identity — inline `modes={["vnd"]}` / default arrays
  // would otherwise churn every parent render and re-seed (wiping typed codes).
  const modesKey = modes.join("|");
  const allowedModes = useMemo((): readonly DiscountType[] => {
    const parts = modesKey
      .split("|")
      .filter((part): part is DiscountType => part === "pct" || part === "vnd");
    return parts.length > 0 ? parts : FALLBACK_DISCOUNT_MODES;
  }, [modesKey]);
  const showPromo = promo?.enabled === true;
  const showManual = !showPromo || promo?.canManual === true;
  const [pane, setPane] = useState<"code" | "manual">(
    showPromo ? "code" : "manual",
  );
  const defaultType: DiscountType = allowedModes.includes("pct")
    ? ((current.type && allowedModes.includes(current.type)
        ? current.type
        : allowedModes[0]) ?? "vnd")
    : "vnd";
  const [type, setType] = useState<DiscountType>(defaultType);
  const [valueText, setValueText] = useState<string>(
    current.value != null ? String(current.value) : "",
  );
  const [note, setNote] = useState<string>(current.note ?? "");
  const [codeText, setCodeText] = useState("");
  const [preview, setPreview] = useState<{
    amount: number;
    name: string;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const wasOpenRef = useRef(false);

  const activePane: "code" | "manual" =
    showPromo && (!showManual || pane === "code") ? "code" : "manual";

  // Seed only on open rising edge. Re-seeding while open (realtime refetch,
  // unstable modes array) cleared promo codeText on every keystroke.
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    const nextType: DiscountType =
      current.type && allowedModes.includes(current.type)
        ? current.type
        : (allowedModes[0] ?? "vnd");
    setType(nextType);
    setValueText(current.value != null ? String(current.value) : "");
    setNote(current.note ?? "");
    setCodeText("");
    setPreview(null);
    setPreviewError(null);
    setPane(showPromo ? "code" : "manual");
  }, [
    open,
    current.type,
    current.value,
    current.note,
    allowedModes,
    showPromo,
  ]);

  const hasExistingDiscount = current.amount > 0;

  // Parse + clamp the typed value so the preview always reflects what the
  // server will accept. Empty / NaN / negative => 0.
  const numericValue = useMemo(() => {
    const trimmed = valueText.trim();
    if (trimmed === "") return 0;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return 0;
    if (type === "pct") return Math.min(n, 100);
    return Math.min(n, Math.max(subtotal, 0));
  }, [valueText, type, subtotal]);

  // Mirror server's compute_discount_amount so the cashier preview matches
  // the row that lands in the DB. FLOOR for pct → integer VND.
  const previewDiscountAmount = useMemo(() => {
    if (numericValue <= 0 || subtotal <= 0) return 0;
    if (type === "pct") {
      return Math.floor((subtotal * numericValue) / 100);
    }
    return Math.min(numericValue, subtotal);
  }, [numericValue, subtotal, type]);

  const previewTotal = Math.max(
    0,
    subtotal + serviceCharge - previewDiscountAmount,
  );

  const noteTrimLen = note.trim().length;
  const noteValid = noteTrimLen >= 3;
  const valueValid = previewDiscountAmount > 0;
  const canApply = noteValid && valueValid && !isPending;
  const canClear = hasExistingDiscount && noteValid && !isPending;
  const codeTrim = codeText.trim().toUpperCase();
  const canPreviewCode =
    showPromo && codeTrim.length >= 3 && !isPending && !previewPending;
  const canApplyCode =
    showPromo &&
    preview != null &&
    preview.amount > 0 &&
    !isPending &&
    !promo?.hasPromotion;
  const canClearPromo =
    showPromo &&
    promo?.hasPromotion === true &&
    noteValid &&
    !isPending;

  const handleClose = () => {
    if (isPending) return;
    onOpenChange(false);
  };

  const handleApply = () => {
    if (!canApply) return;
    onSubmit({ type, value: numericValue, note: note.trim() });
  };

  const handleClear = () => {
    if (activePane === "code") {
      if (!canClearPromo || !promo) return;
      promo.onClearPromo(note.trim());
      return;
    }
    if (!canClear) return;
    onClear(note.trim());
  };

  const handlePreviewCode = async () => {
    if (!canPreviewCode || !promo) return;
    setPreviewPending(true);
    const result = await promo.onPreview(codeTrim);
    setPreviewPending(false);
    if (result.success) {
      setPreview({ amount: result.amount, name: result.name });
      setPreviewError(null);
    } else {
      setPreview(null);
      setPreviewError(result.error);
    }
  };

  const handleApplyCode = () => {
    if (!canApplyCode || !promo) return;
    promo.onApplyCode(codeTrim);
  };

  const codePreviewAmount = preview?.amount ?? 0;
  const codePreviewTotal = Math.max(
    0,
    subtotal + serviceCharge - codePreviewAmount,
  );

  return (
    <StationSheet
      side="right"
      size="md"
      open={open}
      onOpenChange={(o) => !o && handleClose()}
      title={title}
      footerClassName="sm:flex-row sm:justify-between"
      footer={
        <>
          {(activePane === "code" ? canClearPromo : canClear && !promo?.hasPromotion) ? (
            <Button
              type="button"
              variant="destructive"
              size="touch"
              disabled={activePane === "code" ? !canClearPromo : !canClear}
              onClick={handleClear}
              title={!noteValid ? POS_VI.clearDiscountReasonTitle : undefined}
              className="sm:order-first"
            >
              {activePane === "code" ? PROMOTIONS_VI.posClearPromo : clearLabel}
            </Button>
          ) : (
            <span className="hidden sm:block" aria-hidden />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={isPending}
              onClick={handleClose}
            >
              {ACTIONS_VI.cancel}
            </Button>
            {activePane === "code" ? (
              <Button
                type="button"
                size="touch"
                disabled={!canApplyCode}
                onClick={handleApplyCode}
              >
                {PROMOTIONS_VI.posApplyCode}
              </Button>
            ) : (
              <Button
                type="button"
                size="touch"
                disabled={!canApply}
                onClick={handleApply}
              >
                {POS_VI.apply}
              </Button>
            )}
          </div>
        </>
      }
    >
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {showPromo && showManual ? (
            <Tabs
              value={activePane}
              onValueChange={(value) => setPane(value as "code" | "manual")}
            >
              <TabsList size="touch" className="w-full">
                <TabsTrigger value="code" className="flex-1">
                  {PROMOTIONS_VI.posCodeTab}
                </TabsTrigger>
                <TabsTrigger value="manual" className="flex-1">
                  {POS_VI.discountTitle}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}

          {activePane === "code" && promo ? (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="promo-code-input">
                  {PROMOTIONS_VI.posCodeLabel}
                </FieldLabel>
                <Input
                  id="promo-code-input"
                  value={codeText}
                  onChange={(event) => {
                    setCodeText(event.target.value);
                    setPreview(null);
                    setPreviewError(null);
                  }}
                  placeholder={PROMOTIONS_VI.posCodePlaceholder}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  controlSize="touch"
                  className="font-mono"
                  inputMode="text"
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                size="touch"
                disabled={!canPreviewCode}
                onClick={() => void handlePreviewCode()}
              >
                {PROMOTIONS_VI.posPreview}
              </Button>
              {previewError ? (
                <p className="text-sm text-destructive">{previewError}</p>
              ) : null}
              {promo.hasPromotion && current.note ? (
                <p className="text-sm">
                  {PROMOTIONS_VI.posPromoChip}: {current.note}
                </p>
              ) : null}
              <Field data-invalid={!noteValid && noteTrimLen > 0}>
                <FieldLabel htmlFor="discount-note">
                  {POS_VI.discountReasonLabel}
                </FieldLabel>
                <Textarea
                  id="discount-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={POS_VI.discountReasonPlaceholder}
                  aria-invalid={!noteValid && noteTrimLen > 0}
                  rows={2}
                />
                <FieldDescription>
                  {POS_VI.discountNoteHint(noteTrimLen)}
                </FieldDescription>
              </Field>
            </FieldGroup>
          ) : (
            <>
          {allowedModes.length > 1 ? (
            <Tabs
              value={type}
              onValueChange={(v) => {
                setType(v as DiscountType);
                // Reset the value on tab switch — 10% and 10đ mean different
                // things; keeping the old number invites mistakes.
                setValueText("");
              }}
            >
              <TabsList size="touch" className="w-full">
                {allowedModes.includes("pct") ? (
                  <TabsTrigger value="pct" className="flex-1">
                    {POS_VI.discountPctTab}
                  </TabsTrigger>
                ) : null}
                {allowedModes.includes("vnd") ? (
                  <TabsTrigger value="vnd" className="flex-1">
                    {POS_VI.discountVndTab}
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </Tabs>
          ) : null}

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="discount-value">
                {type === "pct"
                  ? POS_VI.discountPctLabel
                  : POS_VI.discountVndLabel}
              </FieldLabel>
              <FormattedNumberInput
                id="discount-value"
                maxFractionDigits={type === "pct" ? 2 : 0}
                value={valueText}
                onValueChange={setValueText}
                placeholder={
                  type === "pct"
                    ? POS_VI.discountPctPlaceholder
                    : POS_VI.discountVndPlaceholder
                }
              />
              <FieldDescription>
                {type === "pct"
                  ? POS_VI.discountPctMaxHint
                  : `Tối đa ${formatVND(subtotal)} (tự giới hạn nếu nhập quá).`}
              </FieldDescription>
            </Field>

            <Field data-invalid={!noteValid && noteTrimLen > 0}>
              <FieldLabel htmlFor="discount-note-manual">
                {POS_VI.discountReasonLabel}
              </FieldLabel>
              <Textarea
                id="discount-note-manual"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={POS_VI.discountReasonPlaceholder}
                aria-invalid={!noteValid && noteTrimLen > 0}
                rows={2}
              />
              <FieldDescription>
                {POS_VI.discountNoteHint(noteTrimLen)}
              </FieldDescription>
            </Field>
          </FieldGroup>
            </>
          )}

          <Frame className="border-border/60 bg-muted/50 p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{subtotalLabel}</span>
              <span className="tabular-nums">{formatVND(subtotal)}</span>
            </div>
            {serviceCharge > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>{POS_VI.serviceChargeTitle}</span>
                <span className="tabular-nums">{formatVND(serviceCharge)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>
                {POS_VI.discountReduceLabel}
                {activePane === "manual" && type === "pct" && numericValue > 0
                  ? ` (${formatPercent(numericValue)})`
                  : ""}
              </span>
              <span className="tabular-nums">
                {(activePane === "code" ? codePreviewAmount : previewDiscountAmount) > 0
                  ? `-${formatVND(
                      activePane === "code"
                        ? codePreviewAmount
                        : previewDiscountAmount,
                    )}`
                  : "—"}
              </span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border/60 pt-1 font-semibold">
              <span>{totalLabel}</span>
              <span className="tabular-nums">
                {formatVND(
                  activePane === "code" ? codePreviewTotal : previewTotal,
                )}
              </span>
            </div>
          </Frame>
        </div>
    </StationSheet>
  );
}
