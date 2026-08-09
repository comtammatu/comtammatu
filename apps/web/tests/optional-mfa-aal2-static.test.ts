import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("login MFA challenge is Owner-only", () => {
  const actions = read("apps/web/app/(public)/(auth)/login/actions.ts");
  const form = read("apps/web/app/(public)/(auth)/login/login-form.tsx");

  assert.match(actions, /mfaRequired\?: boolean/);
  assert.match(actions, /user_role === "owner"/);
  assert.match(actions, /getAuthenticatorAssuranceLevel/);
  assert.match(actions, /listFactors/);
  assert.match(actions, /mfaRequired:\s*true/);
  assert.match(actions, /completeLoginAfterMfa/);
  assert.match(form, /MfaChallengeForm/);
  assert.match(form, /completeLoginAfterMfa/);
});

test("MFA security settings are Owner-only at /settings/security", () => {
  const owner = read(
    "apps/web/app/(protected)/settings/security/page.tsx",
  );
  const settingsHome = read("apps/web/app/(protected)/settings/page.tsx");
  const scope = read("packages/shared/src/auth/scope.ts");

  assert.match(owner, /MfaSecurityClient/);
  assert.match(owner, /user_role !== "owner"/);
  assert.match(settingsHome, /\/settings\/security/);
  assert.doesNotMatch(scope, /\/me\/security/);
  assert.doesNotMatch(scope, /\/profile\/security/);
});

test("role binding action returns structured aal2_required for step-up", () => {
  const actions = read(
    "apps/web/app/(protected)/hr/staff/[id]/permissions/actions.ts",
  );
  const client = read(
    "apps/web/app/(protected)/hr/staff/[id]/permissions/role-bindings-client.tsx",
  );

  assert.match(actions, /AAL2_REQUIRED:\s*"aal2_required"/);
  assert.match(actions, /errorCode/);
  assert.match(client, /ROLE_BINDING_ERROR_CODES\.AAL2_REQUIRED/);
  assert.match(client, /MfaStepUpDialog/);
  assert.match(client, /canOpenSecuritySettings/);
});
