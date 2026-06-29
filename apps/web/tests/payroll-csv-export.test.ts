import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPayrollCsv,
  type PayrollCsvColumnLabels,
  type PayrollCsvOptions,
} from "../app/(protected)/hr/payroll/[periodId]/payroll-csv";
import type { PayrollEntryRow } from "../app/(protected)/hr/payroll/[periodId]/_types";

const columns: PayrollCsvColumnLabels = {
  employeeCode: "Mã nhân viên",
  employeeName: "Họ tên",
  period: "Kỳ lương",
  gross: "Lương gộp",
  insuranceBase: "Lương đóng BH",
  bhxh: "BHXH (8%)",
  bhyt: "BHYT (1,5%)",
  bhtn: "BHTN (1%)",
  taxableIncome: "Thu nhập tính thuế",
  pit: "Thuế TNCN",
  net: "Thực lĩnh",
};

const options: PayrollCsvOptions = {
  columns,
  periodLabel: "Tháng 6/2026",
};

function makeEntry(overrides: Partial<PayrollEntryRow> = {}): PayrollEntryRow {
  return {
    id: 1,
    employee_id: 10,
    working_days: 26,
    paid_leave_days: 0,
    unpaid_leave_days: 0,
    payable_days: 26,
    standard_days: 26,
    base_salary: 10_000_000,
    gross_total: 10_000_000,
    bhxh_employee: 800_000,
    bhyt_employee: 150_000,
    bhtn_employee: 100_000,
    total_insurance_employee: 1_050_000,
    total_insurance_employer: 2_150_000,
    insurance_base: 10_000_000,
    personal_deduction: 11_000_000,
    dependent_count: 0,
    dependent_deduction: 0,
    taxable_income: 0,
    pit_tax: 0,
    advance_deduction: 0,
    other_deductions: 0,
    net_salary: 8_950_000,
    employees: {
      id: 10,
      employee_code: "NV001",
      profiles: { full_name: "Nguyễn Văn A" },
    },
    ...overrides,
  };
}

// Only "BHYT (1,5%)" contains a comma, so only it is quoted (RFC 4180):
// "BHXH (8%)" and "BHTN (1%)" carry no comma and stay bare.
const EXPECTED_HEADER =
  "Mã nhân viên,Họ tên,Kỳ lương,Lương gộp,Lương đóng BH," +
  'BHXH (8%),"BHYT (1,5%)",BHTN (1%),Thu nhập tính thuế,Thuế TNCN,Thực lĩnh';

function lines(csv: string): string[] {
  // Strip the leading UTF-8 BOM, then split on CRLF.
  return csv.replace(/^\uFEFF/, "").split("\r\n");
}

test("buildPayrollCsv emits a BOM + header row + one row per entry", () => {
  const csv = buildPayrollCsv([makeEntry()], options);
  assert.equal(csv.startsWith("\uFEFF"), true);

  const rows = lines(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0], EXPECTED_HEADER);
  assert.equal(
    rows[1],
    "NV001,Nguyễn Văn A,Tháng 6/2026,10000000,10000000,800000,150000,100000,0,0,8950000",
  );
});

test("buildPayrollCsv produces one body row per employee", () => {
  const csv = buildPayrollCsv(
    [
      makeEntry({ id: 1 }),
      makeEntry({
        id: 2,
        employees: {
          id: 11,
          employee_code: "NV002",
          profiles: { full_name: "Trần Thị B" },
        },
      }),
    ],
    options,
  );
  const rows = lines(csv);
  assert.equal(rows.length, 3); // header + 2 entries
  assert.match(rows[2]!, /^NV002,Trần Thị B,/);
});

test("buildPayrollCsv quotes and escapes commas and quotes in names", () => {
  const csv = buildPayrollCsv(
    [
      makeEntry({
        employees: {
          id: 10,
          employee_code: "NV001",
          // Name with both a comma and a double-quote.
          profiles: { full_name: 'Lê, Văn "Bin" C' },
        },
      }),
    ],
    options,
  );
  const rows = lines(csv);
  // Comma forces quoting; inner quotes are doubled per RFC 4180.
  assert.equal(rows[1]!.split(",")[0], "NV001");
  assert.match(rows[1]!, /"Lê, Văn ""Bin"" C"/);
});

test("buildPayrollCsv tolerates missing employee join data", () => {
  const csv = buildPayrollCsv([makeEntry({ employees: null })], options);
  const rows = lines(csv);
  // Empty code + empty name, then the period label.
  assert.equal(rows[1]!.startsWith(",,Tháng 6/2026,"), true);
});

test("buildPayrollCsv rounds numeric fields to integers", () => {
  const csv = buildPayrollCsv(
    [makeEntry({ gross_total: 10_000_000.6, net_salary: 8_949_999.4 })],
    options,
  );
  const cells = lines(csv)[1]!.split(",");
  assert.equal(cells[3], "10000001"); // gross rounded up
  assert.equal(cells[10], "8949999"); // net rounded down
});

test("buildPayrollCsv with no entries emits only the header", () => {
  const csv = buildPayrollCsv([], options);
  const rows = lines(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0], EXPECTED_HEADER);
});
