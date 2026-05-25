export interface CurrentOrderCandidate {
  groupKey: string;
}

export function keepCurrentOrderFirst<T extends CurrentOrderCandidate>(
  orders: readonly T[],
  currentGroupKey: string | null,
): { currentGroupKey: string | null; orders: T[] } {
  if (orders.length === 0) {
    return { currentGroupKey: null, orders: [] };
  }

  const current =
    currentGroupKey === null
      ? undefined
      : orders.find((order) => order.groupKey === currentGroupKey);
  const nextCurrent = current ?? orders[0];

  if (!nextCurrent) {
    return { currentGroupKey: null, orders: [] };
  }

  return {
    currentGroupKey: nextCurrent.groupKey,
    orders: [
      nextCurrent,
      ...orders.filter((order) => order.groupKey !== nextCurrent.groupKey),
    ],
  };
}
