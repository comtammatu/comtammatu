import assert from "node:assert/strict";
import test from "node:test";
import {
  CSV_BOM,
  CSV_SEP,
  buildSemicolonCsv,
  escapeCsvCell,
} from "../app/_lib/export-csv";

test("buildSemicolonCsv uses BOM, semicolon, and signature lines", () => {
  const csv = buildSemicolonCsv({
    signatureLines: ["Đối tượng: Phiếu nhập", "Xuất lúc: 10/08/2026"],
    header: ["Thời gian", "Hành động"],
    rows: [["10/08/2026 10:00", "Đã tạo"]],
  });
  assert.ok(csv.startsWith(CSV_BOM));
  assert.match(csv, new RegExp(`Thời gian${CSV_SEP}Hành động`));
  assert.match(csv, /Đối tượng: Phiếu nhập/);
  assert.match(csv, /Đã tạo/);
});

test("escapeCsvCell quotes separators and quotes", () => {
  assert.equal(escapeCsvCell(`a${CSV_SEP}b`), `"a${CSV_SEP}b"`);
  assert.equal(escapeCsvCell('say "hi"'), '"say ""hi"""');
});
