import { matchesSearch } from "@lib/search";

export type GrnSourceSupplier = {
  id: number;
  name: string;
  phone: string | null;
  recentLabel: string | null;
  lastLabel: string | null;
};

export function filterGrnSourceSuppliers(
  suppliers: GrnSourceSupplier[],
  query: string,
): GrnSourceSupplier[] {
  const needle = query.trim();
  if (!needle) return suppliers;

  return suppliers.filter((supplier) =>
    matchesSearch([supplier.name, supplier.phone], needle),
  );
}

export function grnSourceSupplierHref(
  sourceBasePath: string,
  supplierId: number,
): string {
  return `${sourceBasePath}/${supplierId}`;
}

export function parseGrnSupplierIdParam(
  raw: string | string[] | undefined,
): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;

  const supplierId = Number(value);
  return Number.isInteger(supplierId) && supplierId > 0 ? supplierId : null;
}
