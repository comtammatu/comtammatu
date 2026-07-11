import type { SelfOrderMenuCategory } from "@lib/self-order/contracts";

export const ALL_MENU_VALUE = "all";

const MENU_NAME_TAG_RE = /\s*\(([^()]+)\)\s*$/u;

function normalizeCategoryName(value: string) {
  return value.trim().toLocaleLowerCase("vi");
}

function normalizeItemName(value: string) {
  return value
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("vi")
    .replace(/\s+/g, " ");
}

/** Only the named Cơm category is visually prominent — never Khác or other main_dish. */
export function isSelfOrderComCategory(
  category: Pick<SelfOrderMenuCategory, "name">,
): boolean {
  return normalizeCategoryName(category.name) === "cơm";
}

/** Prefer the Cơm category; else first non-empty category that is not Khác. */
export function defaultSelfOrderCategoryValue(
  categories: SelfOrderMenuCategory[],
): string {
  const available = categories.filter(
    (category) => category.menu_items.length > 0,
  );
  const comCategory = available.find(isSelfOrderComCategory);
  if (comCategory) return String(comCategory.id);
  const firstOther = available.find(
    (category) => normalizeCategoryName(category.name) !== "khác",
  );
  if (firstOther) return String(firstOther.id);
  const first = available[0];
  return first ? String(first.id) : ALL_MENU_VALUE;
}

/** Split a trailing `(tag)` note from the display title; cart/KDS keep the raw name. */
export function splitMenuItemDisplayName(name: string): {
  title: string;
  tag: string | null;
} {
  const match = MENU_NAME_TAG_RE.exec(name);
  if (!match || match.index == null) return { title: name, tag: null };
  const tag = match[1]?.trim() ?? "";
  const title = name.slice(0, match.index).trim();
  if (!tag || !title) return { title: name, tag: null };
  return { title, tag };
}

/**
 * Curated image badges for hero dishes. Matched on the display title after
 * stripping a trailing parenthetical note.
 */
export function selfOrderItemImageBadges(name: string): string[] {
  const { title } = splitMenuItemDisplayName(name);
  const normalized = normalizeItemName(title);

  if (normalized.includes("cốt lết") || normalized.includes("cot let")) {
    return ["Truyền thống"];
  }

  if (normalized.includes("một gang") || normalized.includes("mot gang")) {
    return ["Chờ 20 phút"];
  }

  return [];
}
