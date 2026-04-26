type SearchValue = string | number | null | undefined;

/**
 * Normalize text for Vietnamese diacritic-insensitive search.
 * Example: "trung" matches "trung" with tone marks, and "dau" matches "dau"
 * with the Vietnamese d-stroke.
 */
export function normalizeSearch(value: SearchValue): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

export function matchesSearch(
  values: readonly SearchValue[],
  query: SearchValue,
): boolean {
  const normalizedQuery = normalizeSearch(query).trim();
  if (normalizedQuery.length === 0) return true;

  return values.map(normalizeSearch).join(" ").includes(normalizedQuery);
}
