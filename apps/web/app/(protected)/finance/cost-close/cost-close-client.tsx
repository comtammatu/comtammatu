"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { formatAccountingVND as formatVND } from "@comtammatu/shared/format";
import {
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import { Item, ItemContent, ItemTitle } from "@comtammatu/ui/components/item";
import { messages } from "@lib/messages";
import {
  activateInventoryValuationCutover,
  closeInventoryCostPeriod,
  prepareInventoryValuationCutover,
  type InventoryCostCloseStatus,
} from "./actions";

const copy = messages.finance.costClose;

function StatusItems({ items, empty }: { items: string[]; empty: string }) {
  const rows = items.length > 0 ? items : [empty];
  return (
    <div className="grid gap-2">
      {rows.map((item) => (
        <Item key={item} variant="outline" size="sm">
          <ItemContent>
            <ItemTitle className="line-clamp-none" size="heading">
              {item}
            </ItemTitle>
          </ItemContent>
        </Item>
      ))}
    </div>
  );
}

export function CostCloseClient({
  status,
  monthValue,
}: {
  status: InventoryCostCloseStatus;
  monthValue: string;
}) {
  const router = useRouter();
  const [waiverReason, setWaiverReason] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(monthValue);
  const [isPending, startTransition] = useTransition();
  const intentKey = useRef<string | null>(null);
  const needsWaiver = status.attentionCount > 0;
  const canPrepare = status.cutoverStatus === "inactive" && status.canPrepare;
  const canActivate =
    status.cutoverStatus === "shadow" &&
    status.shadowRemainingDays === 0 &&
    status.blockers.length === 0;
  const canClose =
    status.cutoverStatus === "active" &&
    !status.closed &&
    status.blockers.length === 0 &&
    (!needsWaiver || waiverReason.trim().length >= 5);
  const canSubmit =
    status.cutoverStatus === "inactive"
      ? canPrepare
      : status.cutoverStatus === "shadow"
        ? canActivate
        : canClose;
  const primaryLabel =
    status.cutoverStatus === "inactive"
      ? isPending
        ? copy.preparing
        : copy.prepare
      : status.cutoverStatus === "shadow"
        ? isPending
          ? copy.activating
          : copy.activate
        : isPending
          ? copy.closing
          : copy.close;

  function handlePrimaryAction() {
    intentKey.current ??= crypto.randomUUID();
    startTransition(async () => {
      const result =
        status.cutoverStatus === "inactive"
          ? await prepareInventoryValuationCutover({
              idempotencyKey: intentKey.current!,
            })
          : status.cutoverStatus === "shadow"
            ? await activateInventoryValuationCutover({
                idempotencyKey: intentKey.current!,
              })
            : await closeInventoryCostPeriod({
                year: status.year,
                month: status.month,
                waiverReason: needsWaiver ? waiverReason : null,
                idempotencyKey: intentKey.current!,
              });
      if (!result.success) {
        const fallback =
          status.cutoverStatus === "inactive"
            ? copy.prepareFailed
            : status.cutoverStatus === "shadow"
              ? copy.activateFailed
              : copy.closeFailed;
        toast.error(result.error ?? fallback);
        return;
      }
      intentKey.current = null;
      toast.success(
        status.cutoverStatus === "inactive"
          ? copy.prepareSuccess
          : status.cutoverStatus === "shadow"
            ? copy.activateSuccess
            : copy.closeSuccess,
      );
      router.refresh();
    });
  }

  function handlePeriodSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [year, month] = selectedMonth.split("-");
    if (!year || !month) return;
    router.push(
      `/finance/cost-close?year=${encodeURIComponent(year)}&month=${Number(month)}`,
    );
  }

  return (
    <DocumentFormFrame
      width="wide"
      density="compact"
      header={
        <AppPageHeader title={copy.title} description={copy.description} />
      }
      footer={
        <div className="flex justify-end">
          <Button
            type="button"
            size="touch"
            onClick={handlePrimaryAction}
            disabled={!canSubmit || isPending}
          >
            {primaryLabel}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={handlePeriodSubmit}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="cost-close-month">{copy.month}</Label>
          <Input
            id="cost-close-month"
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="w-auto font-mono"
          />
        </div>
        <Button type="submit" variant="outline">
          {copy.apply}
        </Button>
      </form>

      <AppSection
        title={copy.blocked}
        tone={status.blockers.length > 0 ? "destructive" : "default"}
        icon={status.blockers.length > 0 ? <XCircle /> : <CircleCheck />}
      >
        <StatusItems items={status.blockers} empty={copy.noBlockers} />
      </AppSection>

      <AppSection
        title={copy.attention}
        tone={status.attention.length > 0 ? "warning" : "default"}
        icon={status.attention.length > 0 ? <TriangleAlert /> : <CircleCheck />}
      >
        <StatusItems items={status.attention} empty={copy.noWaiverNeeded} />
        {needsWaiver ? (
          <div className="grid gap-1.5">
            <Label htmlFor="cost-close-waiver">{copy.waiverLabel}</Label>
            <Textarea
              id="cost-close-waiver"
              value={waiverReason}
              onChange={(event) => setWaiverReason(event.target.value)}
              placeholder={copy.waiverPlaceholder}
              maxLength={1000}
            />
          </div>
        ) : null}
      </AppSection>

      <AppSection title={copy.reconciled} icon={<CircleCheck />}>
        <StatusItems items={status.reconciled} empty={copy.noReconciliation} />
        <p className="text-sm text-muted-foreground">
          {status.cutoverStatus === "inactive"
            ? copy.confirmedPurchaseValue
            : copy.currentInventoryValue}
          :{" "}
          <span className="font-mono font-medium text-foreground">
            {formatVND(
              status.cutoverStatus === "inactive"
                ? status.confirmedNetInventoryValue
                : status.totalValue,
            )}
          </span>
        </p>
      </AppSection>
    </DocumentFormFrame>
  );
}
