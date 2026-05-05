import test from "node:test";
import assert from "node:assert/strict";
import { buildQrLabel } from "../auto-label";

test("buildQrLabel with table_label", () => {
  assert.equal(
    buildQrLabel({ branch_name: "Quận 1", table_label: "5" }),
    "Quận 1 — Bàn 5",
  );
});

test("buildQrLabel with null table_label → 'Chung'", () => {
  assert.equal(
    buildQrLabel({ branch_name: "Quận 3", table_label: null }),
    "Quận 3 — Chung",
  );
});

test("buildQrLabel with empty table_label → 'Chung'", () => {
  assert.equal(
    buildQrLabel({ branch_name: "Cầu Giấy", table_label: "" }),
    "Cầu Giấy — Chung",
  );
});

test("buildQrLabel with whitespace-only table_label → 'Chung'", () => {
  assert.equal(
    buildQrLabel({ branch_name: "HCM", table_label: "   " }),
    "HCM — Chung",
  );
});

test("buildQrLabel trims branch_name and table_label", () => {
  assert.equal(
    buildQrLabel({ branch_name: "  Quận 1  ", table_label: "  12  " }),
    "Quận 1 — Bàn 12",
  );
});
