"use client";

import Link from "next/link";
import {
  ExternalLink as IconExternalLink,
  Pause as IconPause,
  Play as IconPlay,
  Ticket as IconTicket,
  Trash2 as IconTrash2,
} from "lucide-react";
import { PROMOTIONS_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { AppSheet } from "@/components/surface/app-sheet";
import { StatusBadge } from "@/components/status-badge";
import { promotionKindLabel } from "@lib/promotions/kinds";
import type { PromotionListRow } from "./promotions-list-client";

export function PromotionQuickViewSheet({
  open,
  onOpenChange,
  promotion,
  branchNames,
  benefitText,
  onStatusChange,
  onDelete,
  isPending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promotion: PromotionListRow | null;
  branchNames?: string[];
  benefitText: string;
  onStatusChange: (row: PromotionListRow, status: "active" | "paused" | "ended") => void;
  onDelete: (row: PromotionListRow) => void;
  isPending?: boolean;
}) {
  if (!promotion) return null;

  const hasCodes = promotion.totalCodesCount > 0 || promotion.reusableCode != null;
  const isEnded = promotion.status === "ended";
  const isActive = promotion.status === "active";

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title={promotion.name}
      description={promotionKindLabel(promotion.kind)}
      contentClassName="flex flex-col gap-5 p-4 sm:p-6"
      footer={
        <div className="flex w-full items-center justify-between gap-2 border-t pt-3">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() => onDelete(promotion)}
          >
            <IconTrash2 className="mr-1 size-3.5" />
            {PROMOTIONS_VI.deleteAction}
          </Button>

          <div className="flex items-center gap-2">
            {!isEnded ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  onStatusChange(promotion, isActive ? "paused" : "active")
                }
              >
                {isActive ? (
                  <>
                    <IconPause className="mr-1 size-3.5" />
                    {PROMOTIONS_VI.pause}
                  </>
                ) : (
                  <>
                    <IconPlay className="mr-1 size-3.5" />
                    {PROMOTIONS_VI.activate}
                  </>
                )}
              </Button>
            ) : null}

            <Button
              size="sm"
              render={<Link href={`/promotions/${String(promotion.id)}`} />}
            >
              <IconExternalLink className="mr-1 size-3.5" />
              {PROMOTIONS_VI.openFullEdit}
            </Button>
          </div>
        </div>
      }
    >
      {/* Mockup Voucher Card */}
      <Frame className="flex flex-col gap-3 bg-primary/10 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <IconTicket className="size-5 text-primary" />
            <span className="font-semibold text-foreground">
              {PROMOTIONS_VI.voucherMockupTitle}
            </span>
          </div>
          <StatusBadge domain="promotion" value={promotion.status} />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xl font-semibold tracking-tight text-foreground">
            {benefitText}
          </span>
          {promotion.minSubtotal > 0 ? (
            <span className="text-xs text-muted-foreground">
              {PROMOTIONS_VI.minOrderCond(formatVND(promotion.minSubtotal))}
            </span>
          ) : null}
          {promotion.maxDiscountAmount ? (
            <span className="text-xs text-muted-foreground">
              {PROMOTIONS_VI.maxDiscountLabel}: {formatVND(promotion.maxDiscountAmount)}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant="outline" className="text-xs">
            {promotionKindLabel(promotion.kind)}
          </Badge>
          {promotion.reusableCode ? (
            <Badge variant="secondary" className="font-mono text-xs uppercase">
              {PROMOTIONS_VI.codeLabel}: {promotion.reusableCode}
            </Badge>
          ) : null}
        </div>
      </Frame>

      {/* Rules & Summary */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {PROMOTIONS_VI.rulesTitle}
        </span>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {PROMOTIONS_VI.kindLabel}
            </span>
            <span className="font-medium text-foreground">
              {promotionKindLabel(promotion.kind)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {PROMOTIONS_VI.statusLabel}
            </span>
            <div>
              <StatusBadge domain="promotion" value={promotion.status} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {PROMOTIONS_VI.minSubtotalLabel}
            </span>
            <span className="font-medium text-foreground">
              {promotion.minSubtotal > 0 ? formatVND(promotion.minSubtotal) : "0đ"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {PROMOTIONS_VI.maxDiscountLabel}
            </span>
            <span className="font-medium text-foreground">
              {promotion.maxDiscountAmount
                ? formatVND(promotion.maxDiscountAmount)
                : PROMOTIONS_VI.periodUnlimited}
            </span>
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {PROMOTIONS_VI.scheduleSection}
        </span>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">
            {PROMOTIONS_VI.periodLabel}
          </span>
          <span className="font-medium text-foreground">
            {!promotion.startsAt && !promotion.endsAt ? (
              PROMOTIONS_VI.periodUnlimited
            ) : (
              <>
                {promotion.startsAt ? formatVNDate(promotion.startsAt) : "—"}
                {" → "}
                {promotion.endsAt ? formatVNDate(promotion.endsAt) : "—"}
              </>
            )}
          </span>
        </div>
      </div>

      {/* Scope / Branches */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {PROMOTIONS_VI.targetBranchesTitle}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {branchNames && branchNames.length > 0 ? (
            branchNames.map((name, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                {name}
              </Badge>
            ))
          ) : (
            <Badge variant="outline" className="text-xs">
              {PROMOTIONS_VI.branchesAll}
            </Badge>
          )}
        </div>
      </div>

      {/* Codes statistics */}
      {hasCodes ? (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {PROMOTIONS_VI.codesStatsTitle}
          </span>
          <div className="grid grid-cols-3 gap-2">
            <Frame className="flex flex-col items-center justify-center p-2 text-center">
              <span className="text-xs text-muted-foreground">
                {PROMOTIONS_VI.statTotalCodes}
              </span>
              <span className="text-base font-semibold text-foreground">
                {promotion.totalCodesCount}
              </span>
            </Frame>
            <Frame className="flex flex-col items-center justify-center p-2 text-center">
              <span className="text-xs text-muted-foreground">
                {PROMOTIONS_VI.statRedeemedCodes}
              </span>
              <span className="text-base font-semibold text-primary">
                {promotion.redeemedCodesCount}
              </span>
            </Frame>
            <Frame className="flex flex-col items-center justify-center p-2 text-center">
              <span className="text-xs text-muted-foreground">
                {PROMOTIONS_VI.codeStatusActive}
              </span>
              <span className="text-base font-semibold text-foreground">
                {promotion.activeCodesCount}
              </span>
            </Frame>
          </div>
        </div>
      ) : null}
    </AppSheet>
  );
}
