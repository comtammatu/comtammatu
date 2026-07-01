export const PAGINATION_ELLIPSIS = "ellipsis";

export type PaginationItem = number | typeof PAGINATION_ELLIPSIS;

export function getPaginationItems(
  page: number,
  pageCount: number,
  siblings = 1,
): PaginationItem[] {
  const safeCount = Math.max(1, Math.floor(pageCount));
  const safePage = Math.min(Math.max(1, Math.floor(page)), safeCount);
  const safeSiblings = Math.max(0, Math.floor(siblings));
  const span = safeSiblings * 2 + 5;

  if (safeCount <= span) {
    return Array.from({ length: safeCount }, (_, index) => index + 1);
  }

  const left = Math.max(safePage - safeSiblings, 1);
  const right = Math.min(safePage + safeSiblings, safeCount);
  const items: PaginationItem[] = [1];

  if (left > 2) items.push(PAGINATION_ELLIPSIS);

  for (
    let value = Math.max(left, 2);
    value <= Math.min(right, safeCount - 1);
    value += 1
  ) {
    items.push(value);
  }

  if (right < safeCount - 1) items.push(PAGINATION_ELLIPSIS);

  items.push(safeCount);
  return items;
}
