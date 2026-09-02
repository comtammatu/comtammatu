"use client";

import { useEffect, useState, useTransition } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { DELIVERY_PLATFORM_LABELS_VI } from "@comtammatu/shared/labels";
import { MENU_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { WholeVndInput } from "@/components/form";
import {
  fetchItemChannelPrices,
  saveItemChannelPrices,
  seedItemChannelPrices,
} from "./actions";

const PLATFORMS = ["shopee", "grab", "be", "green_sm"] as const;

type Platform = (typeof PLATFORMS)[number];

const EMPTY_PRICES: Record<Platform, string> = {
  shopee: "",
  grab: "",
  be: "",
  green_sm: "",
};

function pricesFromRows(
  rows: Array<{ delivery_platform: Platform; unit_price: number }>,
): Record<Platform, string> {
  const next = { ...EMPTY_PRICES };
  for (const row of rows) {
    if (row.delivery_platform in next) {
      next[row.delivery_platform] = String(row.unit_price);
    }
  }
  return next;
}

export function ItemChannelPricesFields({
  menuItemId,
  basePrice,
  open,
}: {
  menuItemId: number;
  basePrice?: number | null;
  open: boolean;
}) {
  const [mode, setMode] = useState<"same" | "custom">("same");
  const [prices, setPrices] = useState<Record<Platform, string>>(EMPTY_PRICES);
  const [sharedPrice, setSharedPrice] = useState("");
  const [markupPercent, setMarkupPercent] = useState("20");
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void fetchItemChannelPrices({ menuItemId })
      .then((result) => {
        if (cancelled || !result.success) return;
        const rows = (result.data ?? []) as Array<{
          delivery_platform: Platform;
          unit_price: number;
        }>;
        const next = pricesFromRows(rows);
        setPrices(next);

        // Detect if all active platform prices are identical or empty
        const nonZeroValues = PLATFORMS.map((p) => next[p].trim()).filter(
          (v) => v !== "",
        );
        const uniqueValues = Array.from(new Set(nonZeroValues));

        if (uniqueValues.length <= 1) {
          setMode("same");
          setSharedPrice(uniqueValues[0] ?? "");
        } else {
          setMode("custom");
          setSharedPrice(uniqueValues[0] ?? "");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [menuItemId, open]);

  function savePlatformPrices(nextPrices: Record<Platform, string>) {
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

  function handleSaveSamePrice() {
    const raw = sharedPrice.trim();
    const unitPrice = Number(raw);
    if (raw === "" || !Number.isFinite(unitPrice) || unitPrice < 0) {
      toast.error(MENU_VI.channelPricesApplyAllEmpty);
      return;
    }
    const next: Record<Platform, string> = {
      shopee: raw,
      grab: raw,
      be: raw,
      green_sm: raw,
    };
    setPrices(next);
    savePlatformPrices(next);
  }

  function applyQuickMarkup(percent: number) {
    if (basePrice == null || basePrice <= 0) return;
    const calculated = Math.round(basePrice * (1 + percent / 100));
    setSharedPrice(String(calculated));
    const next: Record<Platform, string> = {
      shopee: String(calculated),
      grab: String(calculated),
      be: String(calculated),
      green_sm: String(calculated),
    };
    setPrices(next);
  }

  function applyCustomMarkup(target: Platform | "all") {
    startTransition(async () => {
      const parsed = Number(markupPercent);
      const percent = Number.isFinite(parsed) ? parsed : 20;
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
        const next = pricesFromRows(
          reload.data as Array<{
            delivery_platform: Platform;
            unit_price: number;
          }>,
        );
        setPrices(next);
        const nonZero = PLATFORMS.map((p) => next[p].trim()).filter(
          (v) => v !== "",
        );
        if (nonZero[0]) setSharedPrice(nonZero[0]);
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
      <div className="flex flex-col gap-1">
        <FieldLabel className="text-sm font-semibold">
          {MENU_VI.channelPricesTitle}
        </FieldLabel>
        {basePrice != null && basePrice > 0 ? (
          <p className="text-xs text-muted-foreground">
            {MENU_VI.channelPriceBaseHint(formatVND(basePrice))}
          </p>
        ) : null}
      </div>

      <Tabs
        value={mode}
        onValueChange={(v) => {
          const nextMode = v as "same" | "custom";
          setMode(nextMode);
          if (nextMode === "same" && sharedPrice.trim() === "") {
            const firstSet = PLATFORMS.map((p) => prices[p].trim()).find(
              (v) => v !== "",
            );
            if (firstSet) setSharedPrice(firstSet);
          }
        }}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="same">{MENU_VI.channelPriceModeSame}</TabsTrigger>
          <TabsTrigger value="custom">
            {MENU_VI.channelPriceModeCustom}
          </TabsTrigger>
        </TabsList>

        {/* Chế độ 1: Cùng đơn giá cho cả 4 sàn */}
        <TabsContent value="same" className="mt-3 flex flex-col gap-3">
          <Field>
            <FieldLabel>{MENU_VI.channelPricesApplyAllLabel}</FieldLabel>
            <div className="mt-1 flex flex-col gap-2">
              <WholeVndInput
                value={sharedPrice}
                onValueChange={setSharedPrice}
                placeholder={MENU_VI.channelPricePlaceholder}
              />
              {basePrice != null && basePrice > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">
                    {MENU_VI.channelPriceQuickCalcLabel}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={isPending}
                    onClick={() => applyQuickMarkup(20)}
                  >
                    {MENU_VI.channelPriceQuick20}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={isPending}
                    onClick={() => applyQuickMarkup(25)}
                  >
                    {MENU_VI.channelPriceQuick25}
                  </Button>
                </div>
              ) : null}
            </div>
          </Field>

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={handleSaveSamePrice}
            >
              {isPending ? <Spinner data-icon="inline-start" /> : null}
              {MENU_VI.channelPricesApplyAllAction}
            </Button>
          </div>
        </TabsContent>

        {/* Chế độ 2: Thiết lập giá riêng cho từng sàn */}
        <TabsContent value="custom" className="mt-3 flex flex-col gap-3">
          <FieldDescription>{MENU_VI.channelPriceCustomHint}</FieldDescription>
          <div className="grid gap-3 sm:grid-cols-2">
            {PLATFORMS.map((platform) => (
              <Field key={platform}>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel>
                    {DELIVERY_PLATFORM_LABELS_VI[platform]}
                  </FieldLabel>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={isPending}
                    onClick={() => void applyCustomMarkup(platform)}
                    title={MENU_VI.channelPricesMarkupOne(
                      DELIVERY_PLATFORM_LABELS_VI[platform],
                    )}
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

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {MENU_VI.channelPricesMarkupLabel}
              </span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={500}
                step={1}
                value={markupPercent}
                onChange={(event) => setMarkupPercent(event.target.value)}
                className="h-8 w-18 font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => void applyCustomMarkup("all")}
              >
                {MENU_VI.channelPricesMarkupAll}
              </Button>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={() => savePlatformPrices(prices)}
            >
              {isPending ? <Spinner data-icon="inline-start" /> : null}
              {MENU_VI.channelPricesSave}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
