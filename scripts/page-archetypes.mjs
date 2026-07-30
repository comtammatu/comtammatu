// page-archetype census (design-system.md § F / D058 W5): maps every
// route page.tsx to the archetype id it declares from
// docs/spec/page-archetypes.md. Pure data — the enforcement gate lives in
// scripts/check-ui-contract.mjs, which imports this map.
export const PAGE_ARCHETYPES = {
  "apps/web/app/(protected)/page.tsx": "LANDING",
  "apps/web/app/(protected)/settings/(tenant)/general/page.tsx":
    "SETTINGS-PANEL",
  "apps/web/app/(protected)/settings/(tenant)/payments/page.tsx":
    "SETTINGS-PANEL",
  "apps/web/app/(protected)/settings/page.tsx": "LANDING",
  "apps/web/app/(protected)/settings/printers/jobs/page.tsx": "LIST",
  "apps/web/app/(protected)/settings/printers/page.tsx": "LANDING",
  "apps/web/app/(protected)/settings/printers/templates/page.tsx":
    "SETTINGS-PANEL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx":
    "DASHBOARD",
  "apps/web/app/(protected)/br/[branchId]/(operator)/orders/page.tsx": "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx": "LANDING",
  "apps/web/app/(protected)/br/[branchId]/(operator)/profile/page.tsx":
    "EMBED-WRAPPER",
  "apps/web/app/(protected)/br/[branchId]/(operator)/profile/payslip/page.tsx":
    "EMBED-WRAPPER",
  "apps/web/app/(protected)/br/[branchId]/(operator)/settings/kds/page.tsx":
    "SETTINGS-PANEL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/menu-limits/page.tsx":
    "SETTINGS-PANEL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx":
    "LANDING",
  "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/page.tsx":
    "REPORT",
  "apps/web/app/(protected)/br/[branchId]/(operator)/settings/pos/page.tsx":
    "SETTINGS-PANEL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/settings/printers/page.tsx":
    "SETTINGS-PANEL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/settings/tables/page.tsx":
    "SETTINGS-PANEL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/shift/checkout-approvals/page.tsx":
    "EMBED-WRAPPER",
  "apps/web/app/(protected)/br/[branchId]/(operator)/shift/clock/page.tsx":
    "EMBED-WRAPPER",
  "apps/web/app/(protected)/br/[branchId]/(operator)/shift/leave-approvals/page.tsx":
    "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx":
    "EMBED-WRAPPER",
  "apps/web/app/(protected)/br/[branchId]/(operator)/shift/schedule/leave/page.tsx":
    "EMBED-WRAPPER",
  "apps/web/app/(protected)/br/[branchId]/(operator)/shift/schedule/page.tsx":
    "EMBED-WRAPPER",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/page.tsx":
    "LANDING",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/categories/page.tsx":
    "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/ingredients/page.tsx":
    "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/suppliers/page.tsx":
    "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/thresholds/page.tsx":
    "SETTINGS-PANEL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/units/page.tsx":
    "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/consumption/page.tsx":
    "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/consumption/[id]/page.tsx":
    "DETAIL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-assignments/page.tsx":
    "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/page.tsx":
    "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count/page.tsx":
    "EMBED-WRAPPER",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/page.tsx":
    "DETAIL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/[supplierId]/page.tsx":
    "DOC-WORKFLOW",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/page.tsx":
    "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/page.tsx":
    "REDIRECT-SHIM",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/[id]/page.tsx":
    "DETAIL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/page.tsx":
    "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/requests/[id]/page.tsx":
    "DETAIL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/requests/new/page.tsx":
    "DOC-WORKFLOW",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/requests/page.tsx":
    "REDIRECT-SHIM",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/[ingredientId]/page.tsx":
    "DETAIL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/page.tsx":
    "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx": "LANDING",

  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/[id]/page.tsx":
    "DETAIL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/new/page.tsx":
    "DOC-WORKFLOW",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/page.tsx":
    "LANDING",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/page.tsx":
    "DETAIL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/page.tsx":
    "REDIRECT-SHIM",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/reports/page.tsx":
    "REPORT",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/count/page.tsx":
    "DOC-WORKFLOW",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/page.tsx":
    "DETAIL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/new/page.tsx":
    "DOC-WORKFLOW",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/page.tsx":
    "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/[id]/page.tsx":
    "DETAIL",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx":
    "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/page.tsx":
    "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/page.tsx":
    "DOC-WORKFLOW",
  "apps/web/app/(protected)/br/[branchId]/(operator)/team/page.tsx": "LIST",
  "apps/web/app/(protected)/br/[branchId]/kds/page.tsx": "BOARD",
  "apps/web/app/(protected)/br/[branchId]/pos/page.tsx": "BOARD",
  "apps/web/app/(protected)/br/[branchId]/runner/page.tsx": "BOARD",
  "apps/web/app/(protected)/branches/page.tsx": "LIST",
  "apps/web/app/(protected)/finance/bank-transactions/page.tsx": "LIST",
  "apps/web/app/(protected)/finance/expenses/page.tsx": "LIST",
  "apps/web/app/(protected)/finance/food-cost/page.tsx": "REPORT",
  "apps/web/app/(protected)/finance/invoices/page.tsx": "LIST",
  "apps/web/app/(protected)/finance/page.tsx": "DASHBOARD",
  "apps/web/app/(protected)/finance/revenue/[date]/page.tsx": "REPORT",
  "apps/web/app/(protected)/finance/revenue/page.tsx": "REPORT",
  "apps/web/app/(protected)/finance/targets/page.tsx": "SETTINGS-PANEL",
  "apps/web/app/(protected)/finance/supplier-invoices/page.tsx": "LIST",
  "apps/web/app/(protected)/hr/page.tsx": "LIST",
  "apps/web/app/(protected)/hr/attendance/page.tsx": "LIST",
  "apps/web/app/(protected)/hr/payroll/[periodId]/page.tsx": "REDIRECT-SHIM",
  "apps/web/app/(protected)/hr/payroll/page.tsx": "LIST",
  "apps/web/app/(protected)/hr/setup/page.tsx": "LIST",
  "apps/web/app/(protected)/hr/staff/[id]/permissions/page.tsx": "DETAIL",
  "apps/web/app/(protected)/hr/staff/audit/page.tsx": "LIST",
  "apps/web/app/(protected)/hr/staff/page.tsx": "LIST",
  "apps/web/app/(protected)/inventory/consumption/[id]/page.tsx": "DETAIL",
  "apps/web/app/(protected)/inventory/consumption/page.tsx": "LIST",
  "apps/web/app/(protected)/inventory/count-assignments/page.tsx": "LIST",
  "apps/web/app/(protected)/inventory/count-slips/page.tsx": "LIST",
  "apps/web/app/(protected)/inventory/grn/[id]/page.tsx": "DETAIL",
  "apps/web/app/(protected)/inventory/grn/new/[supplierId]/page.tsx":
    "REDIRECT-SHIM",
  "apps/web/app/(protected)/inventory/grn/new/page.tsx": "REDIRECT-SHIM",
  "apps/web/app/(protected)/inventory/grn/page.tsx": "LIST",
  "apps/web/app/(protected)/inventory/ingredients/page.tsx": "LIST",
  "apps/web/app/(protected)/inventory/issues/[id]/page.tsx": "REDIRECT-SHIM",
  "apps/web/app/(protected)/inventory/issues/page.tsx": "REDIRECT-SHIM",
  "apps/web/app/(protected)/inventory/page.tsx": "DASHBOARD",
  "apps/web/app/(protected)/inventory/production/page.tsx": "LANDING",
  "apps/web/app/(protected)/inventory/production/new/page.tsx": "DOC-WORKFLOW",
  "apps/web/app/(protected)/inventory/production/[id]/page.tsx": "DETAIL",
  "apps/web/app/(protected)/inventory/purchase-orders/page.tsx": "LIST",
  "apps/web/app/(protected)/inventory/purchase-requests/page.tsx": "LIST",
  "apps/web/app/(protected)/inventory/menu-recipes/page.tsx": "LIST",
  "apps/web/app/(protected)/inventory/recipes/page.tsx": "REDIRECT-SHIM",
  "apps/web/app/(protected)/inventory/reports/page.tsx": "REPORT",
  "apps/web/app/(protected)/inventory/settings/categories/page.tsx":
    "SETTINGS-PANEL",
  "apps/web/app/(protected)/inventory/settings/page.tsx": "REDIRECT-SHIM",
  "apps/web/app/(protected)/inventory/settings/thresholds/page.tsx":
    "SETTINGS-PANEL",
  "apps/web/app/(protected)/inventory/settings/units/page.tsx":
    "SETTINGS-PANEL",
  "apps/web/app/(protected)/inventory/stock/[ingredientId]/page.tsx": "DETAIL",
  "apps/web/app/(protected)/inventory/stock/page.tsx": "LIST",
  "apps/web/app/(protected)/inventory/stock-requests/[id]/page.tsx": "DETAIL",
  "apps/web/app/(protected)/inventory/stock-requests/page.tsx": "REDIRECT-SHIM",
  "apps/web/app/(protected)/inventory/stocktake/[id]/count/page.tsx":
    "DOC-WORKFLOW",
  "apps/web/app/(protected)/inventory/stocktake/[id]/page.tsx": "DETAIL",
  "apps/web/app/(protected)/inventory/stocktake/new/page.tsx": "DOC-WORKFLOW",
  "apps/web/app/(protected)/inventory/stocktake/page.tsx": "LIST",
  "apps/web/app/(protected)/inventory/supplier-invoices/page.tsx":
    "REDIRECT-SHIM",
  "apps/web/app/(protected)/inventory/suppliers/[id]/items/page.tsx": "LIST",
  "apps/web/app/(protected)/inventory/suppliers/page.tsx": "LIST",
  "apps/web/app/(protected)/inventory/transfers/[id]/page.tsx": "DETAIL",
  "apps/web/app/(protected)/inventory/transfers/new/page.tsx": "DOC-WORKFLOW",
  "apps/web/app/(protected)/inventory/transfers/page.tsx": "LIST",
  "apps/web/app/(protected)/inventory/waste/approvals/page.tsx": "LIST",
  "apps/web/app/(protected)/inventory/waste/new/page.tsx": "DOC-WORKFLOW",
  "apps/web/app/(protected)/menu/page.tsx": "LIST",
  "apps/web/app/(protected)/notifications/page.tsx": "LIST",
  "apps/web/app/(protected)/orders/page.tsx": "LIST",
  "apps/web/app/(public)/(auth)/login/page.tsx": "GATE/AUTH",
  "apps/web/app/(public)/access-denied/page.tsx": "GATE/AUTH",
  "apps/web/app/offline/page.tsx": "GATE/AUTH",
  "apps/web/app/q/[token]/page.tsx": "PUBLIC-WORKFLOW",
  "apps/web/app/q/invoice/[token]/page.tsx": "PUBLIC-WORKFLOW",
  "apps/web/app/r/[token]/page.tsx": "PUBLIC-WORKFLOW",
  "apps/web/app/(protected)/feedback/page.tsx": "LIST",
  "apps/web/app/(protected)/feedback/qr/page.tsx": "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/page.tsx": "LIST",
  "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/qr/page.tsx":
    "LIST",
};

const PAGE_DISPOSITION_OVERRIDES = {
  "apps/web/app/q/invoice/[token]/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/q/[token]/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/r/[token]/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/feedback/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/feedback/qr/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/qr/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/br/[branchId]/runner/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/br/[branchId]/kds/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/br/[branchId]/pos/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/consumption/[id]/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/consumption/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/count-assignments/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/count-slips/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/grn/[id]/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/grn/new/[supplierId]/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/grn/new/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/grn/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/ingredients/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/issues/[id]/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/issues/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/production/[id]/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/purchase-orders/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/production/new/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/production/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/menu-recipes/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/reports/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/settings/thresholds/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/stock/[ingredientId]/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/stock/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/stocktake/[id]/count/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/stocktake/[id]/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/stocktake/new/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/stocktake/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/supplier-invoices/page.tsx": {
    status: "keep",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/suppliers/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/suppliers/[id]/items/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/transfers/[id]/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/transfers/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/stock-requests/[id]/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/stock-requests/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/requests/[id]/page.tsx":
    {
      status: "tune",
      evidence: "implemented-static",
      final: false,
    },
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/requests/new/page.tsx":
    {
      status: "tune",
      evidence: "implemented-static",
      final: false,
    },
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/requests/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/waste/approvals/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/waste/new/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/br/[branchId]/(operator)/shift/checkout-approvals/page.tsx":
    {
      status: "tune",
      evidence: "implemented-static",
      final: false,
    },
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/inventory/purchase-requests/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(protected)/branches/page.tsx": {
    status: "tune",
    evidence: "implemented-static",
    final: false,
  },
  "apps/web/app/(public)/(auth)/login/page.tsx": {
    status: "tune",
    evidence: "browser-runtime",
    final: false,
  },
  "apps/web/app/(public)/access-denied/page.tsx": {
    status: "tune",
    evidence: "browser-runtime",
    final: true,
  },
  "apps/web/app/offline/page.tsx": {
    status: "tune",
    evidence: "browser-runtime",
    final: true,
  },
};

export const PAGE_DISPOSITIONS = Object.fromEntries(
  Object.keys(PAGE_ARCHETYPES).map((file) => [
    file,
    PAGE_DISPOSITION_OVERRIDES[file] ?? {
      status: "keep",
      evidence: "source-baseline",
      final: false,
    },
  ]),
);
