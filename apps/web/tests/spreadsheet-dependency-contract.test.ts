import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";

const nextConfig = readFileSync(
  resolve(process.cwd(), "next.config.ts"),
  "utf8",
);

test("Next keeps ExcelJS on the native Node.js runtime boundary", () => {
  assert.match(
    nextConfig,
    /serverExternalPackages: \["exceljs", "ai", "@ai-sdk\/gateway"\]/,
  );
});

test("ExcelJS writes and reads an xlsx workbook through the pinned unzipper", async () => {
  const source = new ExcelJS.Workbook();
  const sheet = source.addWorksheet("Menu");
  sheet.addRow(["Món", "Giá"]);
  sheet.addRow(["Cơm tấm sườn", 45_000]);

  const buffer = await source.xlsx.writeBuffer();
  const parsed = new ExcelJS.Workbook();
  await parsed.xlsx.load(buffer);

  assert.equal(
    parsed.getWorksheet("Menu")?.getCell("A2").value,
    "Cơm tấm sườn",
  );
  assert.equal(parsed.getWorksheet("Menu")?.getCell("B2").value, 45_000);
});
