import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveToBaseFactor,
  UnitDerivationError,
  type DerivationRow,
  type DerivationUnitInfo,
} from "../app/(protected)/inventory/_lib/unit-derivation";

const KG = 1;
const G = 2;
const BAO = 3;
const PHAN = 4;
const L = 5;

const unitsById = new Map<number, DerivationUnitInfo>([
  [KG, { id: KG, dimension: "mass", is_standard: true, standard_factor: 1000 }],
  [G, { id: G, dimension: "mass", is_standard: true, standard_factor: 1 }],
  [BAO, { id: BAO, dimension: null, is_standard: false, standard_factor: null }],
  [PHAN, { id: PHAN, dimension: null, is_standard: false, standard_factor: null }],
  [L, { id: L, dimension: "volume", is_standard: true, standard_factor: 1000 }],
]);

function rowsMap(rows: DerivationRow[]): Map<number, DerivationRow> {
  return new Map(rows.map((r) => [r.unit_id, r]));
}

test("base unit resolves to factor 1", () => {
  const row: DerivationRow = {
    unit_id: KG,
    is_base: true,
    anchor_unit_id: null,
    anchor_factor: null,
  };
  const factor = deriveToBaseFactor(KG, row, unitsById, rowsMap([row]));
  assert.equal(factor, 1);
});

test("standard unit of same dimension derives a locked ratio (g against kg base)", () => {
  const gRow: DerivationRow = {
    unit_id: G,
    is_base: false,
    anchor_unit_id: null,
    anchor_factor: null,
  };
  const factor = deriveToBaseFactor(KG, gRow, unitsById, rowsMap([gRow]));
  assert.equal(factor, 1 / 1000);
});

test("bao -> kg -> g -> phan chain: 1 Bao = 250 Phan", () => {
  // Base = kg. Bao anchors directly to kg (1 bao = 50 kg). Phan anchors to
  // the standard unit g (1 phan = 200 g), which is the same dimension as
  // the kg base, so it resolves through the standard ratio.
  const baoRow: DerivationRow = {
    unit_id: BAO,
    is_base: false,
    anchor_unit_id: KG,
    anchor_factor: 50,
  };
  const phanRow: DerivationRow = {
    unit_id: PHAN,
    is_base: false,
    anchor_unit_id: G,
    anchor_factor: 200,
  };
  const rows = rowsMap([baoRow, phanRow]);

  const baoToBase = deriveToBaseFactor(KG, baoRow, unitsById, rows);
  const phanToBase = deriveToBaseFactor(KG, phanRow, unitsById, rows);

  assert.equal(baoToBase, 50);
  assert.equal(phanToBase, 0.2);
  // Transitively: 1 Bao = (50 / 0.2) = 250 Phan.
  assert.equal(baoToBase / phanToBase, 250);
});

test("multi-hop packaging chain resolves through an intermediate packaging unit", () => {
  // Base = kg. Bao anchors to kg (1 bao = 50 kg). A smaller "goi" packaging
  // unit anchors to Bao itself (1 goi = 1/25 bao), so goi should resolve to
  // 50/25 = 2 kg without the caller pre-flattening the chain.
  const GOI = 6;
  const unitsWithGoi = new Map(unitsById);
  unitsWithGoi.set(GOI, {
    id: GOI,
    dimension: null,
    is_standard: false,
    standard_factor: null,
  });

  const baoRow: DerivationRow = {
    unit_id: BAO,
    is_base: false,
    anchor_unit_id: KG,
    anchor_factor: 50,
  };
  const goiRow: DerivationRow = {
    unit_id: GOI,
    is_base: false,
    anchor_unit_id: BAO,
    anchor_factor: 1 / 25,
  };
  const rows = rowsMap([baoRow, goiRow]);

  const goiToBase = deriveToBaseFactor(KG, goiRow, unitsWithGoi, rows);
  assert.equal(goiToBase, 2);
});

test("standard unit locked to a mismatched dimension is rejected fail-closed", () => {
  // Base = kg (mass). Anchoring/using a volume standard unit (l) directly
  // must be rejected: cross-dimension standard-to-standard is never valid.
  const lRow: DerivationRow = {
    unit_id: L,
    is_base: false,
    anchor_unit_id: null,
    anchor_factor: null,
  };
  assert.throws(
    () => deriveToBaseFactor(KG, lRow, unitsById, rowsMap([lRow])),
    (err: unknown) =>
      err instanceof UnitDerivationError &&
      err.message === "standard_unit_dimension_mismatch",
  );
});

test("packaging unit anchored to a cross-dimension standard unit is rejected fail-closed", () => {
  // Base = kg (mass dimension). Bao anchors to l (volume) — invalid: the
  // chain reaches a standard unit of a different dimension than the base.
  const baoRow: DerivationRow = {
    unit_id: BAO,
    is_base: false,
    anchor_unit_id: L,
    anchor_factor: 2,
  };
  assert.throws(
    () => deriveToBaseFactor(KG, baoRow, unitsById, rowsMap([baoRow])),
    (err: unknown) =>
      err instanceof UnitDerivationError &&
      err.message === "standard_unit_dimension_mismatch",
  );
});

test("a packaging unit with no anchor is rejected fail-closed", () => {
  const baoRow: DerivationRow = {
    unit_id: BAO,
    is_base: false,
    anchor_unit_id: null,
    anchor_factor: null,
  };
  assert.throws(
    () => deriveToBaseFactor(KG, baoRow, unitsById, rowsMap([baoRow])),
    (err: unknown) =>
      err instanceof UnitDerivationError &&
      err.message === "packaging_unit_requires_anchor",
  );
});

test("a cyclical anchor chain is rejected fail-closed", () => {
  const GOI = 7;
  const unitsWithGoi = new Map(unitsById);
  unitsWithGoi.set(GOI, {
    id: GOI,
    dimension: null,
    is_standard: false,
    standard_factor: null,
  });

  const baoRow: DerivationRow = {
    unit_id: BAO,
    is_base: false,
    anchor_unit_id: GOI,
    anchor_factor: 25,
  };
  const goiRow: DerivationRow = {
    unit_id: GOI,
    is_base: false,
    anchor_unit_id: BAO,
    anchor_factor: 1 / 25,
  };
  const rows = rowsMap([baoRow, goiRow]);

  assert.throws(
    () => deriveToBaseFactor(KG, baoRow, unitsWithGoi, rows),
    (err: unknown) =>
      err instanceof UnitDerivationError &&
      err.message === "unit_anchor_cycle",
  );
});

test("owner scenario: 1 Thung = 24 Chai, 1 Chai = 250 ml resolves on an ml base", () => {
  // Flagship case. Base = ml (standard volume). Chai anchors to ml
  // (1 chai = 250 ml); Thung anchors to Chai (1 thung = 24 chai). Thung must
  // resolve two hops down to 6000 ml without the caller pre-flattening.
  const ML = 8;
  const CHAI = 9;
  const THUNG = 10;
  const units = new Map<number, DerivationUnitInfo>([
    [ML, { id: ML, dimension: "volume", is_standard: true, standard_factor: 1 }],
    [CHAI, { id: CHAI, dimension: null, is_standard: false, standard_factor: null }],
    [THUNG, { id: THUNG, dimension: null, is_standard: false, standard_factor: null }],
  ]);
  const mlRow: DerivationRow = {
    unit_id: ML,
    is_base: true,
    anchor_unit_id: null,
    anchor_factor: null,
  };
  const chaiRow: DerivationRow = {
    unit_id: CHAI,
    is_base: false,
    anchor_unit_id: ML,
    anchor_factor: 250,
  };
  const thungRow: DerivationRow = {
    unit_id: THUNG,
    is_base: false,
    anchor_unit_id: CHAI,
    anchor_factor: 24,
  };
  const rows = rowsMap([mlRow, chaiRow, thungRow]);

  assert.equal(deriveToBaseFactor(ML, mlRow, units, rows), 1);
  assert.equal(deriveToBaseFactor(ML, chaiRow, units, rows), 250);
  assert.equal(deriveToBaseFactor(ML, thungRow, units, rows), 6000);
});

test("standard secondary on a packaging base is rejected (A2 RPC keeps the client factor)", () => {
  // base = chai (packaging), secondary = ml (standard volume), no anchor. A
  // standard unit needs a same-dimension standard base, so the derivation
  // rejects this shape. The A2 resolver therefore keeps the anchorless client
  // to_base_factor rather than force-deriving, which is why such legacy
  // ingredients still save unchanged.
  const ML = 8;
  const CHAI = 9;
  const units = new Map<number, DerivationUnitInfo>([
    [ML, { id: ML, dimension: "volume", is_standard: true, standard_factor: 1 }],
    [CHAI, { id: CHAI, dimension: null, is_standard: false, standard_factor: null }],
  ]);
  const mlRow: DerivationRow = {
    unit_id: ML,
    is_base: false,
    anchor_unit_id: null,
    anchor_factor: null,
  };
  assert.throws(
    () => deriveToBaseFactor(CHAI, mlRow, units, rowsMap([mlRow])),
    (err: unknown) =>
      err instanceof UnitDerivationError &&
      err.message === "standard_unit_dimension_mismatch",
  );
});
