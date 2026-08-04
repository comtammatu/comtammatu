export const UI_RUNTIME_SOURCE_ROOTS = Object.freeze([
  "apps/web/app",
  "apps/web/lib/branch-operator",
  "apps/web/lib/staff-runtime",
  "apps/web/lib/hr",
]);

// Roots onboarded under the contract-first rule: measured by the audit, but
// not enforced by blocking guards until their debt is burned down.
export const UI_RUNTIME_REPORT_ONLY_ROOTS = Object.freeze([
  "apps/web/lib/hr",
]);

export const UI_RUNTIME_BLOCKING_SOURCE_ROOTS = Object.freeze(
  UI_RUNTIME_SOURCE_ROOTS.filter(
    (root) => !UI_RUNTIME_REPORT_ONLY_ROOTS.includes(root),
  ),
);

export function uiRuntimeRoots(extensions) {
  return UI_RUNTIME_BLOCKING_SOURCE_ROOTS.map((dir) => ({ dir, extensions }));
}

export function isReportOnlyUiRuntimeFile(file) {
  return UI_RUNTIME_REPORT_ONLY_ROOTS.some((root) => file.startsWith(`${root}/`));
}
