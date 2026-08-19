export type TransferCreateDirection = "pull" | "outbound";

export function branchTransferCreateHref(
  branchId: number,
  direction: TransferCreateDirection = "pull",
): string {
  return `/br/${branchId}/stock/transfer/new?direction=${direction}`;
}

export const CONTROL_TRANSFER_CREATE_HREF = "/inventory/transfers/new" as const;

export function controlTransferCreateHref(
  direction: TransferCreateDirection = "outbound",
  branchId?: number | null,
): string {
  const params = new URLSearchParams();
  params.set("direction", direction);
  if (branchId != null) params.set("branch", String(branchId));
  return `${CONTROL_TRANSFER_CREATE_HREF}?${params.toString()}`;
}

export function parseTransferCreateDirection(
  raw: string | string[] | undefined,
): TransferCreateDirection | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "pull" || value === "outbound") return value;
  return undefined;
}

