/**
 * Normalize a string for diacritic-insensitive search.
 * "Gao" will match "Gạo", "nha cung cap" will match "Nhà cung cấp".
 */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
