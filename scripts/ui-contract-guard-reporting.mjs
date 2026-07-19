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
      "browser-chrome-theme-color-source",
      "button-radius-runtime-contract",
      "card-content-layout-props-contract",
      "card-content-layout-props-module-doc",
      "card-content-runtime-variants",
      "card-title-runtime-contract",
      "data-table-mobile-empty-state-adapter",
      "design-system-runtime-token-contract",
      "input-group-direct-input-contract",
      "matu-ds-agent-rule",
      "matu-ds-module-doc",
      "matu-ds-runtime-contract",
      "readme-design-system-contract-pointer",
      "readme-ui-runtime-current",
      "theme-baseline-runtime-current",
    ],
  },
  "preventive-pattern": {
    status: "lint-static",
    reason:
      "Preventive source-pattern checks are blocking in CI but do not represent a useful route-family risk count.",
    guardIds: [
      "focus-ring-contrast",
      "non-current-visual-layer",
      "primitive-transition-all",
      "print-format-ssot",
      "raw-percent-output-ssot",
      "root-viewport-allows-zoom",
      "operator-no-stat-metric",
      "pos-kds-touch-reveal",
      "scrollarea-no-max-height-only",
      "status-focus-ring-contrast",
      "status-foreground-on-tint",
    ],
  },
  "legacy-debt-ratchet": {
    status: "lint-baseline",
    reason:
      "Repository-wide and per-file debt baselines block visual drift growth; their aggregate scopes are enforced by lint rather than represented as route-family audit signals.",
    guardIds: [
      "card-content-classname-baseline",
      "card-title-classname-baseline",
      "custom-shadow-baseline",
      "gap-atypical-baseline",
      "hand-rolled-page-heading-baseline",
      "heading-weight-lock",
      "inline-chrome-baseline",
      "input-group-child-chrome",
      "radius-tier-baseline",
      "raw-alert-dialog-import-file-baseline",
      "raw-card-import-file-baseline",
      "raw-dialog-import-file-baseline",
      "raw-hover-shadow",
      "raw-input-fixed-height-baseline",
      "raw-padding-baseline",
      "raw-table-import-file-baseline",
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
      "legacy-doc-references",
      "legacy-docs",
      "list-width-tier",
      "matu-ds-boundary",
      "nav-shell-inline-literal",
      "operator-owner-route-boundary",
      "operator-owner-shell-boundary",
      "page-archetype",
      "page-padding",
      "route-boundary-adapters",
      "route-boundary-coverage",
      "route-manifest",
    ],
  },
};

function uniqueSorted(values) {
  return [...new Set(values)].sort();
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
