import { canonicalizeShopeeOrderRef } from "@comtammatu/shared/delivery";

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const MAX_REFERENCE_DAY_DISTANCE = 2;

export type DeliveryOrderIdentityItem = {
  menu_item_id: number;
  item_name: string;
  quantity: number;
};

export type ShopeeLegacyLookup = {
  shortRef: string;
  startIso: string;
  endIso: string;
};

export type LegacyOrderCandidate = {
  orderId: number;
  items: readonly DeliveryOrderIdentityItem[];
};

export type LegacyOrderClassification =
  | { status: "none" }
  | { status: "matched"; orderId: number }
  | { status: "ambiguous" };

function validUtcDay(year: number, month: number, day: number): number | null {
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

export function deriveShopeeLegacyLookup(
  fullRef: string,
  now = new Date(),
): ShopeeLegacyLookup | null {
  const match = /^(\d{2})(\d{2})(\d)-(\d{4,})$/.exec(
    canonicalizeShopeeOrderRef(fullRef),
  );
  if (!match || Number.isNaN(now.getTime())) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const yearDigit = Number(match[3]);
  const suffix = match[4];
  if (suffix === undefined) return null;

  const vietnamNow = new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS);
  const currentYear = vietnamNow.getUTCFullYear();
  const currentDay = Date.UTC(
    currentYear,
    vietnamNow.getUTCMonth(),
    vietnamNow.getUTCDate(),
  );
  const currentDecade = Math.floor(currentYear / 10) * 10;
  const candidateYears = [
    currentDecade - 10 + yearDigit,
    currentDecade + yearDigit,
    currentDecade + 10 + yearDigit,
  ];

  const candidate = candidateYears
    .map((year) => ({ year, dayStart: validUtcDay(year, month, day) }))
    .filter(
      (value): value is { year: number; dayStart: number } =>
        value.dayStart !== null,
    )
    .sort(
      (left, right) =>
        Math.abs(left.dayStart - currentDay) -
        Math.abs(right.dayStart - currentDay),
    )[0];

  if (!candidate) return null;
  const dayDistance =
    Math.abs(candidate.dayStart - currentDay) / (24 * 60 * 60 * 1000);
  if (dayDistance > MAX_REFERENCE_DAY_DISTANCE) return null;

  const start = candidate.dayStart - VIETNAM_UTC_OFFSET_MS;
  return {
    shortRef: suffix.slice(-4),
    startIso: new Date(start).toISOString(),
    endIso: new Date(start + 24 * 60 * 60 * 1000).toISOString(),
  };
}

function normalizeItemName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isPackagingItem(itemName: string): boolean {
  return normalizeItemName(itemName) === "dung cu mang ve";
}

function itemSignature(
  items: readonly DeliveryOrderIdentityItem[],
): string | null {
  const quantities = new Map<number, number>();

  for (const item of items) {
    if (isPackagingItem(item.item_name)) continue;
    if (
      !Number.isInteger(item.menu_item_id) ||
      item.menu_item_id <= 0 ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0
    ) {
      return null;
    }
    quantities.set(
      item.menu_item_id,
      (quantities.get(item.menu_item_id) ?? 0) + item.quantity,
    );
  }

  if (quantities.size === 0) return null;
  return [...quantities.entries()]
    .sort(([leftId], [rightId]) => leftId - rightId)
    .map(([menuItemId, quantity]) => `${menuItemId}:${quantity}`)
    .join("|");
}

export function classifyLegacyOrderCandidates(
  incomingItems: readonly DeliveryOrderIdentityItem[],
  candidates: readonly LegacyOrderCandidate[],
): LegacyOrderClassification {
  if (candidates.length === 0) return { status: "none" };
  if (candidates.length !== 1) return { status: "ambiguous" };

  const candidate = candidates[0];
  if (!candidate) return { status: "ambiguous" };
  const incomingSignature = itemSignature(incomingItems);
  const candidateSignature = itemSignature(candidate.items);
  if (!incomingSignature || incomingSignature !== candidateSignature) {
    return { status: "ambiguous" };
  }

  return { status: "matched", orderId: candidate.orderId };
}
