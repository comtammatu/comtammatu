import {
  PROMOTION_CODE_STATUS_LABELS_VI,
  PROMOTION_STATUS_LABELS_VI,
} from "@comtammatu/shared/labels";
import { PROMOTIONS_VI } from "@comtammatu/shared/messages";

export const PROMOTION_KINDS = [
  "order_pct",
  "order_vnd",
  "voucher_face",
  "auto_order",
  "bxgy",
] as const;

export type PromotionKind = (typeof PROMOTION_KINDS)[number];

export const PROMOTION_STATUSES = [
  "draft",
  "active",
  "paused",
  "ended",
] as const;

export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

export function promotionKindLabel(kind: string): string {
  switch (kind) {
    case "order_pct":
      return PROMOTIONS_VI.kindOrderPct;
    case "order_vnd":
      return PROMOTIONS_VI.kindOrderVnd;
    case "voucher_face":
      return PROMOTIONS_VI.kindVoucher;
    case "auto_order":
      return PROMOTIONS_VI.kindAuto;
    case "bxgy":
      return PROMOTIONS_VI.kindBxgy;
    default:
      return kind;
  }
}

export function promotionStatusLabel(status: string): string {
  if (status in PROMOTION_STATUS_LABELS_VI) {
    return PROMOTION_STATUS_LABELS_VI[
      status as keyof typeof PROMOTION_STATUS_LABELS_VI
    ];
  }
  return status;
}

export function promotionCodeStatusLabel(status: string): string {
  if (status in PROMOTION_CODE_STATUS_LABELS_VI) {
    return PROMOTION_CODE_STATUS_LABELS_VI[
      status as keyof typeof PROMOTION_CODE_STATUS_LABELS_VI
    ];
  }
  return status;
}

export const PROMOTION_DOW_LABELS = [
  PROMOTIONS_VI.dowSun,
  PROMOTIONS_VI.dowMon,
  PROMOTIONS_VI.dowTue,
  PROMOTIONS_VI.dowWed,
  PROMOTIONS_VI.dowThu,
  PROMOTIONS_VI.dowFri,
  PROMOTIONS_VI.dowSat,
] as const;
