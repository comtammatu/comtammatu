"use client";

import { useEffect, useState, useTransition } from "react";
import { DELIVERY_PLATFORM_LABELS_VI } from "@comtammatu/shared/labels";
import { MENU_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { WholeVndInput } from "@/components/form";
import {
  fetchItemChannelPrices,
  saveItemChannelPrices,
  seedItemChannelPrices,
} from "./actions";

const PLATFORMS = ["grab", "shopee", "be", "green_sm"] as const;

type Platform = (typeof PLATFORMS)[number];

const EMPTY_PRICES: Record<Platform, string> = {
  grab: "",
  shopee: "",
  be: "",
  green_sm: "",
};

function pricesFromRows(
  rows: Array<{ delivery_platform: Platform; unit_price: number }>,
): Record<Platform, string> {
  const next = { ...EMPTY_PRICES };
  for (const row of rows) {
    next[row.delivery_platform] = String(row.unit_price);
  }
  return next;
}

export function ItemChannelPricesFields({
  menuItemId,
  open,
}: {
  menuItemId: number;
  open: boolean;
}) {
  const [prices, setPrices] = useState<Record<Platform, string>>(EMPTY_PRICES);
  const [sharedPrice, setSharedPrice] = useState("");
  const [markupPercent, setMarkupPercent] = useState("25");
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void fetchItemChannelPrices({ menuItemId })
      .then((result) => {
        if (cancelled || !result.success) return;
        setPrices(
          pricesFromRows(
            (result.data ?? []) as Array<{
              delivery_platform: Platform;
              unit_price: number;
            }>,
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [menuItemId, open]);

  function savePrices(nextPrices: Record<Platform, string>) {
    startTransition(async () => {
      const payload = PLATFORMS.flatMap((platform) => {
        const raw = nextPrices[platform].trim();
        if (raw === "") return [];
        const unitPrice = Number(raw);
        if (!Number.isFinite(unitPrice) || unitPrice < 0) return [];
        return [{ delivery_platform: platform, unit_price: unitPrice }];
      });

      const result = await saveItemChannelPrices({
        menuItemId,
        prices: payload,
      });
      if (!result.success) {
        toast.error(result.error ?? MENU_VI.channelPricesSaveFailed);
        return;
      }
      toast.success(MENU_VI.channelPricesSaved);
    });
  }

  function applySharedPriceToAll() {
    const raw = sharedPrice.trim();
    const unitPrice = Number(raw);
    if (raw === "" || !Number.isFinite(unitPrice) || unitPrice < 0) {
      toast.error(MENU_VI.channelPricesApplyAllEmpty);
      return;
    }
    const next = {
      grab: raw,
      shopee: raw,
      be: raw,
      green_sm: raw,
    };
    setPrices(next);
    savePrices(next);
  }

  function applyMarkup(target: Platform | "all") {
    startTransition(async () => {
      const parsed = Number(markupPercent);
      const percent = Number.isFinite(parsed) ? parsed : 25;
      const result = await seedItemChannelPrices({
        menuItemId,
        deliveryPlatform: target,
        markupPercent: percent,
      });
      if (!result.success) {
        toast.error(result.error ?? MENU_VI.channelPricesMarkupFailed);
        return;
      }
      const reload = await fetchItemChannelPrices({ menuItemId });
      if (reload.success && Array.isArray(reload.data)) {
        setPrices(
          pricesFromRows(
            reload.data as Array<{
              delivery_platform: Platform;
              unit_price: number;
            }>,
          ),
        );
      }
      toast.success(MENU_VI.channelPricesMarkupSaved);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        {MENU_VI.channelPricesLoading}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <FieldLabel>{MENU_VI.channelPricesTitle}</FieldLabel>
      <div className="grid gap-3 sm:grid-cols-2">
        {PLATFORMS.map((platform) => (
          <Field key={platform}>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel>{DELIVERY_PLATFORM_LABELS_VI[platform]}</FieldLabel>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => void applyMarkup(platform)}
              >
                {MENU_VI.channelPricesMarkupOne(
                  DELIVERY_PLATFORM_LABELS_VI[platform],
                )}
              </Button>
            </div>
            <WholeVndInput
              value={prices[platform]}
              onValueChange={(value) =>
                setPrices((current) => ({ ...current, [platform]: value }))
              }
              placeholder={MENU_VI.channelPricePlaceholder}
            />
          </Field>
        ))}
      </div>
      <Field>
        <FieldLabel>{MENU_VI.channelPricesApplyAllLabel}</FieldLabel>
        <div className="flex flex-wrap items-end gap-2">
          <WholeVndInput
            value={sharedPrice}
            onValueChange={setSharedPrice}
            placeholder={MENU_VI.channelPricePlaceholder}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => applySharedPriceToAll()}
          >
            {MENU_VI.channelPricesApplyAllAction}
          </Button>
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor="channel-markup-percent">
          {MENU_VI.channelPricesMarkupLabel}
        </FieldLabel>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            id="channel-markup-percent"
            type="number"
            inputMode="decimal"
            min={0}
            max={500}
            step={1}
            value={markupPercent}
            onChange={(event) => setMarkupPercent(event.target.value)}
            className="w-24 font-mono"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => void applyMarkup("all")}
          >
            {MENU_VI.channelPricesMarkupAll}
          </Button>
        </div>
      </Field>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={isPending}
        onClick={() => savePrices(prices)}
      >
        {isPending ? <Spinner data-icon="inline-start" /> : null}
        {MENU_VI.channelPricesSave}
      </Button>
    </div>
  );
}
