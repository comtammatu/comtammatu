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
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Minus as IconMinus, Plus as IconPlus } from "lucide-react";

import { ACTIONS_VI, FORM_VI, POS_VI, PROMOTIONS_VI } from "@comtammatu/shared/messages";
import { StationSheet } from "@/components/surface";
import { Input } from "@comtammatu/ui/components/input";

export type DiscountType = "pct" | "vnd";

const DEFAULT_DISCOUNT_MODES: readonly DiscountType[] = ["pct", "vnd"];
const FALLBACK_DISCOUNT_MODES: readonly DiscountType[] = ["vnd"];

/** Item-level discount is VND-only (ADR 0013). Stable identity for callers. */
export const ITEM_DISCOUNT_MODES: readonly DiscountType[] = ["vnd"];

export type PromoSideCandidate = {
  order_item_id: number;
  side_item_id: number;
  name: string;
  unit_price: number;
  max_units: number;
  parent_name: string;
};

export type PromoPreviewResult =
  | {
      success: true;
      amount: number;
      name: string;
      kind?: string;
      needsSideSelection?: boolean;
      promotionId?: number | null;
      freeQty?: number | null;
      candidates?: PromoSideCandidate[];
      amountHint?: number | null;
    }
  | { success: false; error: string };

interface DiscountSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  subtotalLabel?: string;
  totalLabel?: string;
  clearLabel?: string;
  modes?: readonly DiscountType[];
  subtotal: number;
  serviceCharge: number;
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
  onClear: (reason: string) => void;
  promo?: {
    enabled: boolean;
    canManual: boolean;
    hasPromotion: boolean;
    initialOffer?: {
      promotionId: number;
      name: string;
      kind?: string;
      freeQty: number;
      needsSideSelection: boolean;
      amountHint: number;
      code?: string | null;
      candidates: PromoSideCandidate[];
    } | null;
    onPreview: (code: string) => Promise<PromoPreviewResult>;
    onApplyCode: (
      code: string,
      sideSelections?: Array<{
        order_item_id: number;
        side_item_id: number;
        units: number;
      }>,
    ) => void;
    onApplyFreeSide?: (
      promotionId: number,
      selections: Array<{
        order_item_id: number;
        side_item_id: number;
        units: number;
      }>,
      code?: string | null,
    ) => void;
    onClearPromo: (reason: string) => void;
  };
}

function candidateKey(c: PromoSideCandidate): string {
  return `${String(c.order_item_id)}:${String(c.side_item_id)}`;
}

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
  const [note, setNote] = useState(current.note ?? "");
  const [codeText, setCodeText] = useState("");
  const [preview, setPreview] = useState<{
    amount: number;
    name: string;
    kind: string;
    needsSideSelection: boolean;
    freeQty: number | null;
    candidates: PromoSideCandidate[];
    amountHint: number | null;
    promotionId?: number | null;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [sideUnits, setSideUnits] = useState<Record<string, number>>({});
  const wasOpenRef = useRef(false);

  const activePane: "code" | "manual" =
    showPromo && (!showManual || pane === "code") ? "code" : "manual";

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
    setCodeText(promo?.initialOffer?.code ?? "");
    setPreviewError(null);
    setSideUnits({});
    setPane(showPromo ? "code" : "manual");
    if (promo?.initialOffer) {
      setPreview({
        amount: promo.initialOffer.amountHint,
        name: promo.initialOffer.name,
        kind: promo.initialOffer.kind ?? "free_side",
        needsSideSelection: promo.initialOffer.needsSideSelection,
        freeQty: promo.initialOffer.freeQty,
        candidates: promo.initialOffer.candidates,
        amountHint: promo.initialOffer.amountHint,
        promotionId: promo.initialOffer.promotionId,
      });
    } else {
      setPreview(null);
    }
  }, [
    open,
    current.type,
    current.value,
    current.note,
    allowedModes,
    showPromo,
    promo?.initialOffer,
  ]);

  const hasExistingDiscount = current.amount > 0;

  const numericValue = useMemo(() => {
    const trimmed = valueText.trim();
    if (trimmed === "") return 0;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return 0;
    if (type === "pct") return Math.min(n, 100);
    return Math.min(n, Math.max(subtotal, 0));
  }, [valueText, type, subtotal]);

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

  const selectedUnitsTotal = useMemo(() => {
    return Object.values(sideUnits).reduce((sum, n) => sum + n, 0);
  }, [sideUnits]);

  const selectedAmount = useMemo(() => {
    if (!preview?.candidates) return 0;
    let sum = 0;
    for (const c of preview.candidates) {
      const units = sideUnits[candidateKey(c)] ?? 0;
      if (units > 0) sum += units * c.unit_price;
    }
    return sum;
  }, [preview, sideUnits]);

  const noteTrimLen = note.trim().length;
  const noteValid = noteTrimLen >= 3;
  const valueValid = previewDiscountAmount > 0;
  const canApply = noteValid && valueValid && !isPending;
  const canClear = hasExistingDiscount && noteValid && !isPending;
  const codeTrim = codeText.trim().toUpperCase();
  const canPreviewCode =
    showPromo && codeTrim.length >= 3 && !isPending && !previewPending;
  const needsPick = preview?.needsSideSelection === true;
  const isFreeItemPick = needsPick && preview?.kind === "free_item";
  const pickComplete =
    !needsPick ||
    (preview?.freeQty != null &&
      selectedUnitsTotal >= 1 &&
      selectedUnitsTotal <= preview.freeQty);
  const autoPreviewAmount =
    (preview?.amount ?? 0) > 0
      ? (preview?.amount ?? 0)
      : (preview?.amountHint ?? 0);
  const canApplyCode =
    showPromo &&
    preview != null &&
    !isPending &&
    !promo?.hasPromotion &&
    pickComplete &&
    (needsPick ? selectedAmount > 0 : autoPreviewAmount > 0);
  const canClearPromo =
    showPromo && promo?.hasPromotion === true && noteValid && !isPending;

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
      setPreview({
        amount: result.amount,
        name: result.name,
        kind: result.kind ?? "",
        needsSideSelection: result.needsSideSelection === true,
        freeQty: result.freeQty ?? null,
        candidates: result.candidates ?? [],
        amountHint: result.amountHint ?? null,
        promotionId: result.promotionId ?? null,
      });
      setSideUnits({});
      setPreviewError(null);
    } else {
      setPreview(null);
      setPreviewError(result.error);
    }
  };

  const candidateGroups = useMemo(() => {
    if (!preview?.candidates || preview.candidates.length === 0) return [];
    const map = new Map<
      number,
      {
        orderItemId: number;
        parentName: string;
        candidates: PromoSideCandidate[];
      }
    >();
    for (const c of preview.candidates) {
      let group = map.get(c.order_item_id);
      if (!group) {
        group = {
          orderItemId: c.order_item_id,
          parentName: c.parent_name || "Phần ăn",
          candidates: [],
        };
        map.set(c.order_item_id, group);
      }
      group.candidates.push(c);
    }
    return Array.from(map.values());
  }, [preview?.candidates]);

  const handleSetFreeItemUnits = (
    c: PromoSideCandidate,
    nextUnits: number,
  ) => {
    const targetKey = candidateKey(c);
    setSideUnits((prev) => {
      const next = { ...prev };
      const usedElsewhere = Object.entries(next).reduce(
        (sum, [k, n]) => (k === targetKey ? sum : sum + n),
        0,
      );
      const remaining = Math.max(
        0,
        (preview?.freeQty ?? 0) - usedElsewhere,
      );
      const clamped = Math.max(
        0,
        Math.min(c.max_units, remaining, nextUnits),
      );
      if (clamped < 1) {
        delete next[targetKey];
      } else {
        next[targetKey] = clamped;
      }
      return next;
    });
  };

  const handleToggleSide = (c: PromoSideCandidate, isChecked: boolean) => {
    const targetKey = candidateKey(c);
    setSideUnits((prev) => {
      const next = { ...prev };
      if (!isChecked) {
        delete next[targetKey];
        return next;
      }
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${String(c.order_item_id)}:`) && key !== targetKey) {
          delete next[key];
        }
      }
      const usedInOtherGroups = Object.entries(next).reduce(
        (sum, [k, n]) =>
          k.startsWith(`${String(c.order_item_id)}:`) ? sum : sum + n,
        0,
      );
      const remaining = Math.max(
        0,
        (preview?.freeQty ?? 1) - usedInOtherGroups,
      );
      const allocated = Math.min(c.max_units, Math.max(1, remaining));
      if (allocated > 0) {
        next[targetKey] = allocated;
      }
      return next;
    });
  };

  const buildSelections = () => {
    if (!preview?.candidates) return [];
    return preview.candidates.flatMap((c) => {
      const units = sideUnits[candidateKey(c)] ?? 0;
      if (units < 1) return [];
      return [
        {
          order_item_id: c.order_item_id,
          side_item_id: c.side_item_id,
          units,
        },
      ];
    });
  };

  const handleApplyCode = () => {
    if (!canApplyCode || !promo || !preview) return;
    const selections = needsPick ? buildSelections() : undefined;
    const resolvedCode =
      codeTrim || promo.initialOffer?.code?.trim().toUpperCase() || "";
    if (resolvedCode) {
      promo.onApplyCode(resolvedCode, selections);
      return;
    }
    if (preview.promotionId != null && promo.onApplyFreeSide) {
      promo.onApplyFreeSide(preview.promotionId, selections ?? [], null);
    }
  };

  const codePreviewAmount = needsPick ? selectedAmount : autoPreviewAmount;
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
          {(activePane === "code"
            ? canClearPromo
            : canClear && !promo?.hasPromotion) ? (
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
                {needsPick
                  ? PROMOTIONS_VI.posPickSidesApply
                  : PROMOTIONS_VI.posApplyCode}
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
            {!promo.initialOffer?.code ? (
              <>
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
                      setSideUnits({});
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
              </>
            ) : null}
            {previewError ? (
              <p className="text-sm text-destructive">{previewError}</p>
            ) : null}
            {preview ? (
              <div className="flex flex-col gap-1 text-sm">
                <p>
                  {PROMOTIONS_VI.posPreviewName}:{" "}
                  <span className="font-medium">{preview.name}</span>
                </p>
                {!needsPick && preview.freeQty != null && autoPreviewAmount > 0 ? (
                  <p className="text-muted-foreground">
                    {preview.kind === "free_item"
                      ? PROMOTIONS_VI.posAutoFreeItemHint(
                          preview.freeQty,
                          formatVND(autoPreviewAmount),
                        )
                      : PROMOTIONS_VI.posAutoFreeSideHint(
                          preview.freeQty,
                          formatVND(autoPreviewAmount),
                        )}
                  </p>
                ) : null}
              </div>
            ) : null}
            {needsPick && candidateGroups.length > 0 ? (
              <div className="flex flex-col gap-2">
                <FieldLabel>
                  {preview?.kind === "free_item"
                    ? PROMOTIONS_VI.posPickItemsTitle
                    : PROMOTIONS_VI.posPickSidesTitle}
                </FieldLabel>
                {preview?.kind === "free_item" && preview.freeQty != null ? (
                  <p className="text-sm text-muted-foreground">
                    {PROMOTIONS_VI.posPickItemsHint(preview.freeQty)}
                  </p>
                ) : null}
                <div className="flex flex-col gap-2">
                  {candidateGroups.map((group) => (
                    <Frame
                      key={group.orderItemId}
                      className="flex flex-col gap-2 p-2.5"
                    >
                      {preview?.kind === "free_item" ? null : (
                        <span className="text-xs font-semibold text-foreground/80">
                          {group.parentName}
                        </span>
                      )}
                      <ItemGroup className="gap-2">
                        {group.candidates.map((c) => {
                          const key = candidateKey(c);
                          const units = sideUnits[key] ?? 0;
                          if (isFreeItemPick) {
                            const usedElsewhere = selectedUnitsTotal - units;
                            const remaining = Math.max(
                              0,
                              (preview?.freeQty ?? 0) - usedElsewhere,
                            );
                            const lineMax = Math.min(c.max_units, remaining);
                            return (
                              <Item
                                key={key}
                                variant="outline"
                                className="items-center justify-between gap-3 px-3 py-2"
                              >
                                <ItemContent className="min-w-0">
                                  <ItemTitle className="text-sm font-medium">
                                    {c.name}
                                  </ItemTitle>
                                  <span className="text-xs text-muted-foreground">
                                    {PROMOTIONS_VI.posCandidateLine(
                                      c.max_units,
                                      formatVND(c.unit_price),
                                      lineMax,
                                    )}
                                  </span>
                                </ItemContent>
                                <div
                                  role="group"
                                  aria-label={PROMOTIONS_VI.posFreeItemQtyGroup(
                                    c.name,
                                  )}
                                  className="flex shrink-0 items-center gap-1.5"
                                >
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-touch"
                                    aria-label={PROMOTIONS_VI.posFreeItemDec}
                                    disabled={isPending || units <= 0}
                                    onClick={() =>
                                      handleSetFreeItemUnits(c, units - 1)
                                    }
                                  >
                                    <IconMinus />
                                  </Button>
                                  <output
                                    aria-live="polite"
                                    className="min-w-8 text-center font-mono text-base font-semibold tabular-nums"
                                  >
                                    {units}
                                  </output>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-touch"
                                    aria-label={PROMOTIONS_VI.posFreeItemInc}
                                    disabled={isPending || units >= lineMax}
                                    onClick={() =>
                                      handleSetFreeItemUnits(c, units + 1)
                                    }
                                  >
                                    <IconPlus />
                                  </Button>
                                </div>
                              </Item>
                            );
                          }
                          const checked = units > 0;
                          return (
                            <Item
                              key={key}
                              variant="outline"
                              className="cursor-pointer items-center justify-between gap-3 px-3 py-2 hover:bg-muted/50 transition-colors"
                              render={<label />}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(value) => {
                                    handleToggleSide(c, value === true);
                                  }}
                                />
                                <ItemTitle className="text-sm font-medium">
                                  {c.name}
                                </ItemTitle>
                              </div>
                            </Item>
                          );
                        })}
                      </ItemGroup>
                    </Frame>
                  ))}
                </div>
              </div>
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
              {(activePane === "code" ? codePreviewAmount : previewDiscountAmount) >
              0
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
