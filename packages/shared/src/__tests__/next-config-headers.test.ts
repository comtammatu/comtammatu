import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Workspace-root-relative path. `import.meta.dirname` is file-absolute, so
// these tests work regardless of the runner's cwd. From
// `packages/shared/src/__tests__/` to repo root is 4 levels up.
const repoRoot = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");

test("next.config.ts emits all security headers + disables X-Powered-By", () => {
  const src = read("apps/web/next.config.ts");
  assert.ok(
    /poweredByHeader:\s*false/.test(src),
    "expected poweredByHeader: false in next.config.ts",
  );
  // headers() must source-pattern apply to all paths.
  assert.ok(
    /source:\s*"\/:path\*"/.test(src),
    "expected headers() source pattern '/:path*'",
  );
  // The 6 header keys we ship: 5 OWASP-style + Strict-Transport-Security
  // (preload-eligible value).
  for (const key of [
    "Content-Security-Policy",
    "X-Frame-Options",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Strict-Transport-Security",
  ]) {
    assert.ok(
      src.includes(`key: "${key}"`),
      `expected security header '${key}' in next.config.ts`,
    );
  }
  assert.ok(
    /key:\s*"X-Frame-Options",\s*value:\s*"DENY"/.test(src),
    "expected X-Frame-Options: DENY",
  );
  assert.ok(
    /key:\s*"X-Content-Type-Options",\s*value:\s*"nosniff"/.test(src),
    "expected X-Content-Type-Options: nosniff",
  );
  assert.ok(
    src.includes('value: "max-age=63072000; includeSubDomains; preload"'),
    "expected HSTS value with includeSubDomains + preload (preload-list eligibility)",
  );
  // CSP must keep the locked-down directives.
  for (const directive of [
    "default-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ]) {
    assert.ok(src.includes(directive), `expected CSP directive '${directive}'`);
  }
});
