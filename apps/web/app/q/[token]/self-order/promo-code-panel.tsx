"use client";

import { useState } from "react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import {
  Field,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import { Spinner } from "@comtammatu/ui/components/spinner";

export function SelfOrderPromoPanel({
  promotionName,
  promotionCode,
  orderDiscountAmount,
  canEdit,
  isPending,
  error,
  onApply,
  onClear,
}: {
  promotionName?: string | null;
  promotionCode?: string | null;
  orderDiscountAmount: number;
  canEdit: boolean;
  isPending: boolean;
  error: string | null;
  onApply: (code: string) => void;
  onClear: () => void;
}) {
  const [code, setCode] = useState("");
  const applied =
    orderDiscountAmount > 0 &&
    (Boolean(promotionName) || Boolean(promotionCode));
  const trimmed = code.trim();

  if (applied) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3 text-sm text-success">
          <div className="min-w-0">
            <p className="font-medium">{SELF_ORDER_VI.promoApplied}</p>
            <p className="text-xs text-muted-foreground">
              {[promotionName, promotionCode].filter(Boolean).join(" · ")}
            </p>
          </div>
          <span className="shrink-0 font-mono tabular-nums">
            -{formatVND(orderDiscountAmount)}
          </span>
        </div>
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full"
            disabled={isPending}
            onClick={onClear}
          >
            {isPending ? <Spinner className="size-4" /> : null}
            {SELF_ORDER_VI.promoClear}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            {SELF_ORDER_VI.promoLocked}
          </p>
        )}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  if (!canEdit) return null;

  return (
    <div className="flex flex-col gap-2">
      <Field>
        <FieldLabel htmlFor="self-order-promo-code">
          {SELF_ORDER_VI.promoCodeLabel}
        </FieldLabel>
        <div className="flex gap-2">
          <Input
            id="self-order-promo-code"
            name="promoCode"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
            value={code}
            disabled={isPending}
            placeholder={SELF_ORDER_VI.promoCodePlaceholder}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (trimmed.length > 0 && !isPending) onApply(trimmed);
              }
            }}
          />
          <Button
            type="button"
            size="touch"
            disabled={isPending || trimmed.length < 1}
            onClick={() => onApply(trimmed)}
          >
            {isPending ? <Spinner className="size-4" /> : null}
            {SELF_ORDER_VI.promoApply}
          </Button>
        </div>
      </Field>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
