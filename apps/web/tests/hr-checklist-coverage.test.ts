import assert from "node:assert/strict";
import { test } from "node:test";

import { buildChecklistCoverage } from "../app/(protected)/hr/checklist-coverage";

const templates = [
  {
    id: 1,
    name: "Checklist chuẩn",
    branchName: null,
    isActive: true,
    items: [{ id: 10, taskKind: "standard" }],
  },
  {
    id: 2,
    name: "Checklist bếp",
    branchName: null,
    isActive: true,
    items: [{ id: 20, taskKind: "consumption_report" }],
  },
  {
    id: 3,
    name: "Checklist phụ bếp",
    branchName: null,
    isActive: true,
    items: [{ id: 30, taskKind: "consumption_report" }],
  },
];

const employees = [
  {
    id: 1,
    employee_code: "E001",
    is_active: true,
    default_checklist_template_id: null,
    profiles: {
      full_name: "Bếp chính",
      positions: {
        code: "chef",
        label_vi: "Bếp",
        default_checklist_template_id: 2,
      },
      branches: { name: "CN1" },
    },
  },
  {
    id: 2,
    employee_code: "E002",
    is_active: true,
    default_checklist_template_id: null,
    profiles: {
      full_name: "Thu ngân thiếu",
      positions: {
        code: "cashier",
        label_vi: "Thu ngân",
        default_checklist_template_id: null,
      },
      branches: { name: "CN1" },
    },
  },
  {
    id: 3,
    employee_code: "E003",
    is_active: true,
    default_checklist_template_id: 1,
    profiles: {
      full_name: "Bếp checklist riêng",
      positions: {
        code: "chef",
        label_vi: "Bếp",
        default_checklist_template_id: 2,
      },
      branches: { name: "CN1" },
    },
  },
  {
    id: 4,
    employee_code: "E004",
    is_active: true,
    default_checklist_template_id: null,
    profiles: {
      full_name: "Phụ bếp thiếu nguyên liệu",
      positions: {
        code: "kitchen_helper",
        label_vi: "Phụ bếp",
        default_checklist_template_id: 3,
      },
      branches: { name: "CN1" },
    },
  },
];

test("HR checklist coverage ranks missing checklist and consumption defaults first", () => {
  const coverage = buildChecklistCoverage({
    employees,
    templates,
    consumptionDefaults: [{ templateItemId: 20 }],
    positions: [
      {
        id: 1,
        code: "chef",
        label_vi: "Bếp",
        default_checklist_template_id: 2,
      },
      {
        id: 2,
        code: "cashier",
        label_vi: "Thu ngân",
        default_checklist_template_id: null,
      },
      {
        id: 3,
        code: "kitchen_helper",
        label_vi: "Phụ bếp",
        default_checklist_template_id: 3,
      },
    ],
  });

  assert.deepEqual(
    coverage.positionsCoverage.map((row) => row.status),
    ["missing_checklist", "missing_consumption_defaults", "ok"],
  );
  assert.deepEqual(
    coverage.employeeIssues.map((row) => row.status),
    ["missing_checklist", "missing_consumption_defaults", "custom_checklist"],
  );
  assert.equal(coverage.positionsCoverage[2]?.employeeCount, 2);
});
