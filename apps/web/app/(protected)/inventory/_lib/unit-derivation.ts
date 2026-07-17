/**
 * TS mirror of `public.inv_derive_to_base_factor` (SQL, in
 * supabase/migration-archive/20260703160000_inventory_unit_system_phase_a.sql). Used
 * for the client-side live preview in the ingredient dialog only — the
 * server RPC is the authoritative computation. Keep both in sync if the
 * resolution rule changes.
 */

export type UnitDimension = "mass" | "volume";

export interface DerivationUnitInfo {
  id: number;
  dimension: UnitDimension | null;
  is_standard: boolean;
  standard_factor: number | null;
}

export interface DerivationRow {
  unit_id: number;
  is_base: boolean;
  anchor_unit_id: number | null;
  anchor_factor: number | null;
}

export class UnitDerivationError extends Error {
  constructor(
    message:
      | "base_unit_not_found"
      | "unit_not_found"
      | "standard_unit_dimension_mismatch"
      | "packaging_unit_requires_anchor"
      | "anchor_unit_not_found"
      | "unit_anchor_cycle",
  ) {
    super(message);
    this.name = "UnitDerivationError";
  }
}

/**
 * Resolves `to_base_factor` for one ingredient_units row given the
 * ingredient's base unit and the full set of unit rows being saved
 * together (needed to walk a multi-hop packaging anchor chain).
 *
 * Fail-closed: throws on a missing unit, a cross-dimension anchor once the
 * chain reaches a standard unit, or a cycle.
 */
export function deriveToBaseFactor(
  baseUnitId: number,
  row: DerivationRow,
  unitsById: ReadonlyMap<number, DerivationUnitInfo>,
  rowsByUnitId: ReadonlyMap<number, DerivationRow>,
): number {
  if (row.is_base) return 1;

  const base = unitsById.get(baseUnitId);
  if (!base) throw new UnitDerivationError("base_unit_not_found");

  const unit = unitsById.get(row.unit_id);
  if (!unit) throw new UnitDerivationError("unit_not_found");

  if (unit.is_standard && row.anchor_unit_id == null) {
    if (!base.is_standard || base.dimension !== unit.dimension) {
      throw new UnitDerivationError("standard_unit_dimension_mismatch");
    }
    return (unit.standard_factor ?? 0) / (base.standard_factor ?? 1);
  }

  if (row.anchor_unit_id == null || row.anchor_factor == null) {
    throw new UnitDerivationError("packaging_unit_requires_anchor");
  }

  const seen = new Set<number>();
  let currentUnit = row.unit_id;
  let currentAnchor = row.anchor_unit_id;
  let currentFactor = row.anchor_factor;
  let accFactor = 1;

  for (;;) {
    if (seen.has(currentUnit)) {
      throw new UnitDerivationError("unit_anchor_cycle");
    }
    seen.add(currentUnit);

    accFactor *= currentFactor;

    if (currentAnchor === baseUnitId) {
      return accFactor;
    }

    const hop = unitsById.get(currentAnchor);
    if (!hop) throw new UnitDerivationError("anchor_unit_not_found");

    if (hop.is_standard) {
      if (!base.is_standard || base.dimension !== hop.dimension) {
        throw new UnitDerivationError("standard_unit_dimension_mismatch");
      }
      return accFactor * ((hop.standard_factor ?? 0) / (base.standard_factor ?? 1));
    }

    currentUnit = currentAnchor;
    const next = rowsByUnitId.get(currentUnit);
    if (next?.anchor_unit_id == null || next.anchor_factor == null) {
      throw new UnitDerivationError("unit_anchor_cycle");
    }
    currentAnchor = next.anchor_unit_id;
    currentFactor = next.anchor_factor;
  }
}
