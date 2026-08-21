import {
  formatDecimal,
  formatQuantity,
  formatVND,
} from "@comtammatu/shared/format";
import { formatVNDate, formatVNDateTime } from "@comtammatu/shared/time";

export { formatDecimal, formatVND };

export function parseOptionalNumber(
  value: string | undefined,
): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function formatQty(n: number): string {
  return formatQuantity(n);
}

export function formatDate(iso: string): string {
  return formatVNDate(iso);
}

export function formatDateTime(iso: string): string {
  return formatVNDateTime(iso);
}

export function formatSmartQuantityUnit(
  quantity: number | null | undefined,
  unitName: string,
): { formattedQty: string; displayUnit: string; hint?: string } {
  if (quantity == null || !Number.isFinite(quantity)) {
    return { formattedQty: "—", displayUnit: unitName };
  }

  const normalizedUnit = unitName.trim().toLowerCase();
  const absQty = Math.abs(quantity);

  // 1. Gram -> Kilogram (g -> kg) when qty >= 1000 g
  if (
    (normalizedUnit === "g" ||
      normalizedUnit === "gram" ||
      normalizedUnit === "gam") &&
    absQty >= 1000
  ) {
    const inKg = quantity / 1000;
    const roundedKg = Math.round(inKg * 1000) / 1000;
    return {
      formattedQty: formatQuantity(roundedKg),
      displayUnit: "kg",
      hint: `${formatQuantity(quantity)} g`,
    };
  }

  // 2. Kilogram -> Gram (kg -> g) when 0 < qty < 1 kg and has clean gram equivalent
  if (
    (normalizedUnit === "kg" ||
      normalizedUnit === "kilogram" ||
      normalizedUnit === "kí") &&
    absQty > 0 &&
    absQty < 1
  ) {
    const inG = Math.round(quantity * 1000);
    return {
      formattedQty: formatQuantity(inG),
      displayUnit: "g",
      hint: `${formatQuantity(quantity)} kg`,
    };
  }

  // 3. Milliliter -> Liter (ml -> lít) when qty >= 1000 ml
  if (
    (normalizedUnit === "ml" ||
      normalizedUnit === "mililit" ||
      normalizedUnit === "mlit") &&
    absQty >= 1000
  ) {
    const inLiter = quantity / 1000;
    const roundedLiter = Math.round(inLiter * 1000) / 1000;
    return {
      formattedQty: formatQuantity(roundedLiter),
      displayUnit: "lít",
      hint: `${formatQuantity(quantity)} ml`,
    };
  }

  // 4. Liter -> Milliliter (lít -> ml) when 0 < qty < 1 liter
  if (
    (normalizedUnit === "l" ||
      normalizedUnit === "lít" ||
      normalizedUnit === "lit") &&
    absQty > 0 &&
    absQty < 1
  ) {
    const inMl = Math.round(quantity * 1000);
    return {
      formattedQty: formatQuantity(inMl),
      displayUnit: "ml",
      hint: `${formatQuantity(quantity)} lít`,
    };
  }

  // Standard clean formatting
  const roundedInt = Math.round(quantity);
  const cleanVal =
    Math.abs(quantity - roundedInt) < 1e-4
      ? roundedInt
      : Math.round(quantity * 1000) / 1000;

  return {
    formattedQty: formatQuantity(cleanVal),
    displayUnit: unitName,
  };
}
