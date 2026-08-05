export const UI_RUNTIME_SOURCE_ROOTS = Object.freeze([
  "apps/web/app",
  "apps/web/lib/branch-operator",
  "apps/web/lib/staff-runtime",
  "apps/web/lib/hr",
]);

export function uiRuntimeRoots(extensions) {
  return UI_RUNTIME_SOURCE_ROOTS.map((dir) => ({ dir, extensions }));
}
