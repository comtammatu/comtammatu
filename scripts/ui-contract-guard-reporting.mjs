const GUARD_ID_RE = /\bid:\s*"([a-z][a-z0-9-]+)"/g;
const DIRECT_FAILURE_GUARD_RE = /failures\.push\(\s*[`'"]([a-z][a-z0-9-]+):/g;
const AUDIT_GUARD_IDS_RE = /guardIds:\s*\[([\s\S]*?)\]/g;

export const UI_CONTRACT_LINT_ONLY_GROUPS = {
  "contract-anchor": {
    status: "lint-static",
    reason:
      "Documentation, runtime-owner, and source-of-truth anchors are exact static contracts rather than route-family debt signals.",
    guardIds: [
      "active-entrypoints-no-stale-ui-provider-terms",
      "all-sources-no-dead-legacy-doc-terms",
      "app-page-header-eyebrow-contract",
      "app-section-icon-size-contract",
      "baseline-reporting-closure",
      "browser-chrome-theme-color-source",
      "button-radius-runtime-contract",
      "card-content-layout-props-contract",
      "card-content-layout-props-module-doc",
      "card-content-runtime-variants",
      "card-title-runtime-contract",
      "data-table-mobile-empty-state-adapter",
      "design-system-one-source-agent-rule",
      "design-system-one-source-contract",
      "design-system-one-source-module-doc",
      "design-system-one-source-regression",
      "design-system-runtime-token-contract",
      "docs-index-design-system-contract-pointer",
      "matu-ds-agent-rule",
      "matu-ds-module-doc",
      "matu-ds-runtime-contract",
      "readme-design-system-contract-pointer",
      "readme-ui-runtime-current",
      "theme-baseline-runtime-current",
      "ui-authority-no-retired-scaffold-names",
      "ui-module-contract-boundary",
    ],
  },
  "preventive-pattern": {
    status: "lint-static",
    reason:
      "Preventive source-pattern checks are blocking in CI but do not represent a useful route-family risk count.",
    guardIds: [
      "admin-finance-branch-raw-card-import",
      "admin-finance-branch-raw-table-import",
      "admin-finance-branch-toolbar-fixed-control",
      "app-arbitrary-sizing",
      "app-effect-shadow-rung",
      "brand-pattern-placement",
      "mascot-animation-placement",
      "app-section-content-named-layout-props",
      "card-content-named-layout-props",
      "focus-ring-contrast",
      "gap-scale",
      "heading-scale",
      "hover-shadow-rung",
      "icon-size",
      "motion-color-duration",
      "non-current-visual-layer",
      "primitive-arbitrary-shadow",
      "primitive-radius-scale",
      "primitive-runtime-arbitrary-px-rem-sizing",
      "primitive-shadow-overrun",
      "primitive-transition-all",
      "print-format-ssot",
      "radius-scale",
      "raw-percent-output-ssot",
      "resting-shadow-rung",
      "root-viewport-allows-zoom",
      "operator-no-stat-metric",
      "scrollarea-no-max-height-only",
      "status-focus-ring-contrast",
      "status-foreground-on-tint",
    ],
  },
  "baseline-ratchet": {
    status: "lint-baseline",
    reason:
      "Frozen source debt is still blocking against growth; debt-versus-permanent-exception accounting is reported as a separate closure wave.",
    guardIds: [
      "card-content-classname-baseline",
      "card-title-classname-baseline",
      "custom-shadow-baseline",
      "gap-atypical-baseline",
      "hand-rolled-page-heading-baseline",
      "inline-chrome-baseline",
      "operator-embedded-button-density",
      "pos-kds-touch-reveal-baseline",
      "radius-tier-baseline",
      "raw-padding-baseline",
      "resting-shadow-baseline",
      "space-y-baseline",
      "status-chip-wrapper-baseline",
      "tint-opacity",
      "uppercase-label-scale",
    ],
  },
  "route-structure": {
    status: "lint-structural",
    reason:
      "Repository, shell, route, archetype, and boundary invariants are existence or ownership checks rather than per-file risk scores.",
    guardIds: [
      "dead-doc-reference",
      "external-design-context",
      "form-dialog-crud-wrapper",
      "header-lockup-registry",
      "legacy-doc-references",
      "legacy-docs",
      "list-width-tier",
      "matu-ds-boundary",
      "nav-shell-inline-literal",
      "operator-embedded-page-header-boundary",
      "operator-admin-dashboard-route-boundary",
      "operator-admin-dashboard-shell-boundary",
      "page-archetype",
      "page-padding",
      "raw-empty-import-route-code",
      "route-boundary-adapters",
      "route-boundary-coverage",
      "route-manifest",
      "shell-registry",
      "shell-registry-bespoke-main",
      "shell-registry-sidebar-provider",
    ],
  },
  "ratchet-maintenance": {
    status: "maintenance",
    reason:
      "These ids identify --write baseline-maintenance summaries, not independent runtime guard signals.",
    guardIds: [
      "button-height-baseline",
      "form-dialog-crud-allowlist",
      "page-padding-baseline",
      "raw-empty-import-allowlist",
    ],
  },
};

export const UI_CONTRACT_BASELINE_POLICIES = {
  "card-content-classname-baseline": {
    debtReason: "Route-local CardContent layout overrides must be removed.",
    permanentReason:
      "The AppSection implementation owns the full-height CardContent composition.",
    permanentExceptions: {
      "apps/web/app/components/surface.tsx": 1,
    },
  },
  "card-title-classname-baseline": {
    debtReason: "CardTitle typography overrides must be removed.",
  },
  "custom-shadow-baseline": {
    debtReason:
      "Arbitrary shadow values must migrate to the locked elevation tokens.",
  },
  "gap-atypical-baseline": {
    debtReason: "Atypical gaps must migrate to the documented spacing scale.",
  },
  "hand-rolled-page-heading-baseline": {
    debtReason: "Management page headings must route through AppPageHeader.",
    permanentReason:
      "These headings belong to standalone public or operator chrome, not Management pages.",
    permanentExceptions: {
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/catalog-back-header.tsx": 1,
      "apps/web/app/(public)/payment/momo/return/page.tsx": 1,
      "apps/web/app/q/[token]/self-order-client.tsx": 1,
    },
  },
  "inline-chrome-baseline": {
    debtReason:
      "Hand-rolled bordered surfaces must migrate to a named surface role.",
  },
  "operator-embedded-button-density": {
    debtReason: "Embedded operator actions must use the touch size contract.",
  },
  "pos-kds-touch-reveal-baseline": {
    debtReason: "Touch workflows must not depend on hover-only disclosure.",
  },
  "radius-tier-baseline": {
    debtReason: "Wrong-tier radii must migrate to the documented radius role.",
  },
  "raw-padding-baseline": {
    debtReason:
      "Large local padding must migrate to a named density or surface prop.",
    permanentReason:
      "POS Operations chrome owns its full-screen frame spacing; station surfaces do not mount AppPage, so no density prop can absorb these.",
    permanentExceptions: {
      "apps/web/app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/cart-pane.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/order-history.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/session-gate.tsx": 2,
    },
  },
  "resting-shadow-baseline": {
    debtReason:
      "Resting elevation must migrate to an approved fixed-chrome or overlay token.",
    permanentReason:
      "These implementations own the locked sticky CTA and POS ceiling shadow rungs.",
    permanentExceptions: {
      "apps/web/app/components/surface.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/pos-mobile-action-bar.tsx": 1,
    },
  },
  "space-y-baseline": {
    debtReason:
      "Local space-y rhythm must migrate to the shared gap and stack contract.",
  },
  "status-chip-wrapper-baseline": {
    debtReason:
      "Route-local status wrappers must migrate to StatusBadge metadata.",
  },
  "tint-opacity": {
    debtReason:
      "Off-scale semantic tint opacity must migrate to the locked tint scale.",
  },
  "uppercase-label-scale": {
    debtReason: "Uppercase labels must use the locked compact label type role.",
  },
};

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function sumValues(record) {
  return Object.values(record).reduce((sum, value) => sum + value, 0);
}

export function buildUiContractBaselineReporting(definitions) {
  const expectedIds = uniqueSorted(
    UI_CONTRACT_LINT_ONLY_GROUPS["baseline-ratchet"].guardIds,
  );
  const policyIds = Object.keys(UI_CONTRACT_BASELINE_POLICIES).sort();
  const definitionIds = definitions.map((definition) => definition.id).sort();
  const expectedSet = new Set(expectedIds);
  const errors = [];

  const missingPolicies = expectedIds.filter((id) => !policyIds.includes(id));
  const stalePolicies = policyIds.filter((id) => !expectedSet.has(id));
  const missingDefinitions = expectedIds.filter(
    (id) => !definitionIds.includes(id),
  );
  const staleDefinitions = definitionIds.filter((id) => !expectedSet.has(id));
  const duplicateDefinitions = definitionIds.filter(
    (id, index) => definitionIds.indexOf(id) !== index,
  );

  if (missingPolicies.length > 0) {
    errors.push(`baseline ids missing policy: ${missingPolicies.join(", ")}`);
  }
  if (stalePolicies.length > 0) {
    errors.push(`stale baseline policies: ${stalePolicies.join(", ")}`);
  }
  if (missingDefinitions.length > 0) {
    errors.push(
      `baseline ids missing live definition: ${missingDefinitions.join(", ")}`,
    );
  }
  if (staleDefinitions.length > 0) {
    errors.push(`stale baseline definitions: ${staleDefinitions.join(", ")}`);
  }
  if (duplicateDefinitions.length > 0) {
    errors.push(
      `duplicate baseline definitions: ${uniqueSorted(duplicateDefinitions).join(", ")}`,
    );
  }

  const rows = definitions
    .filter((definition) => expectedSet.has(definition.id))
    .map((definition) => {
      const policy = UI_CONTRACT_BASELINE_POLICIES[definition.id];
      const actualByFile = definition.actualByFile ?? {};
      const allowedByFile = definition.allowedByFile ?? null;
      const actual = sumValues(actualByFile);
      const permanentExceptions = policy?.permanentExceptions ?? {};
      let permanent = 0;

      if (!policy?.debtReason) {
        errors.push(`${definition.id} is missing debtReason`);
      }
      if (
        Object.keys(permanentExceptions).length > 0 &&
        !policy?.permanentReason
      ) {
        errors.push(`${definition.id} is missing permanentReason`);
      }

      for (const [file, budget] of Object.entries(permanentExceptions)) {
        if (!Number.isInteger(budget) || budget <= 0) {
          errors.push(
            `${definition.id} permanent exception must be a positive integer: ${file}`,
          );
          continue;
        }
        if (allowedByFile && (allowedByFile[file] ?? 0) < budget) {
          errors.push(
            `${definition.id} permanent exception exceeds its guard allowance: ${file}`,
          );
        }
        permanent += Math.min(actualByFile[file] ?? 0, budget);
      }

      const allowed = definition.allowed;
      if (!Number.isInteger(allowed) || allowed < 0) {
        errors.push(`${definition.id} has invalid allowed total ${allowed}`);
      }
      if (permanent > allowed) {
        errors.push(
          `${definition.id} permanent actual ${permanent} exceeds allowed total ${allowed}`,
        );
      }

      const debt = actual - permanent;
      const delta = actual - allowed;
      const classification =
        actual === 0
          ? "clean"
          : debt > 0 && permanent > 0
            ? "mixed"
            : permanent > 0
              ? "permanent-exception"
              : "debt";

      return {
        id: definition.id,
        actual,
        allowed,
        delta,
        debt,
        permanent,
        classification,
        debtReason: policy?.debtReason ?? "",
        permanentReason: policy?.permanentReason ?? "",
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    rows,
    errors: uniqueSorted(errors),
    totals: rows.reduce(
      (totals, row) => ({
        actual: totals.actual + row.actual,
        allowed: totals.allowed + row.allowed,
        delta: totals.delta + row.delta,
        debt: totals.debt + row.debt,
        permanent: totals.permanent + row.permanent,
      }),
      { actual: 0, allowed: 0, delta: 0, debt: 0, permanent: 0 },
    ),
  };
}

export function extractUiContractGuardIds(contractSource) {
  return uniqueSorted([
    ...[...contractSource.matchAll(GUARD_ID_RE)].map((match) => match[1]),
    ...[...contractSource.matchAll(DIRECT_FAILURE_GUARD_RE)].map(
      (match) => match[1],
    ),
  ]);
}

export function extractAuditVisibleGuardIds(auditSource) {
  const guardIds = [];
  for (const match of auditSource.matchAll(AUDIT_GUARD_IDS_RE)) {
    for (const guardIdMatch of (match[1] ?? "").matchAll(
      /"([a-z][a-z0-9-]+)"/g,
    )) {
      guardIds.push(guardIdMatch[1]);
    }
  }
  return uniqueSorted(guardIds);
}

export function buildUiContractGuardReporting(contractSource, auditSource) {
  const declaredGuardIds = extractUiContractGuardIds(contractSource);
  const declaredGuardIdSet = new Set(declaredGuardIds);
  const auditVisibleGuardIds = extractAuditVisibleGuardIds(auditSource);
  const auditVisibleGuardIdSet = new Set(auditVisibleGuardIds);
  const lintOnlyOwners = new Map();
  const groupRows = [];

  for (const [group, definition] of Object.entries(
    UI_CONTRACT_LINT_ONLY_GROUPS,
  )) {
    const guardIds = uniqueSorted(definition.guardIds);
    groupRows.push({
      group,
      status: definition.status,
      reason: definition.reason,
      guardIds,
      count: guardIds.length,
    });
    for (const guardId of guardIds) {
      const owners = lintOnlyOwners.get(guardId) ?? [];
      owners.push(group);
      lintOnlyOwners.set(guardId, owners);
    }
  }

  const duplicateLintOnly = [...lintOnlyOwners.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([guardId, owners]) => `${guardId} (${owners.join(", ")})`)
    .sort();
  const auditAndLintOnly = [...lintOnlyOwners.keys()]
    .filter((guardId) => auditVisibleGuardIdSet.has(guardId))
    .sort();
  const staleLintOnly = [...lintOnlyOwners.keys()]
    .filter((guardId) => !declaredGuardIdSet.has(guardId))
    .sort();
  const auditMissingFromContract = auditVisibleGuardIds
    .filter((guardId) => !declaredGuardIdSet.has(guardId))
    .sort();
  const unclassified = declaredGuardIds
    .filter(
      (guardId) =>
        !auditVisibleGuardIdSet.has(guardId) && !lintOnlyOwners.has(guardId),
    )
    .sort();
  const lintOnlyGuardIds = [...lintOnlyOwners.keys()].sort();
  const errors = [];

  if (duplicateLintOnly.length > 0) {
    errors.push(
      `lint-only guard ids have multiple owners: ${duplicateLintOnly.join(", ")}`,
    );
  }
  if (auditAndLintOnly.length > 0) {
    errors.push(
      `guard ids cannot be both audit-visible and lint-only: ${auditAndLintOnly.join(", ")}`,
    );
  }
  if (staleLintOnly.length > 0) {
    errors.push(
      `lint-only registry points at missing guard ids: ${staleLintOnly.join(", ")}`,
    );
  }
  if (auditMissingFromContract.length > 0) {
    errors.push(
      `audit points at missing guard ids: ${auditMissingFromContract.join(", ")}`,
    );
  }
  if (unclassified.length > 0) {
    errors.push(
      `unclassified guard ids: ${unclassified.join(", ")}. Add an audit signal or an explicit lint-only owner with a reason.`,
    );
  }

  return {
    declaredGuardIds,
    auditVisibleGuardIds,
    lintOnlyGuardIds,
    groupRows,
    duplicateLintOnly,
    auditAndLintOnly,
    staleLintOnly,
    auditMissingFromContract,
    unclassified,
    errors,
    total: declaredGuardIds.length,
  };
}
