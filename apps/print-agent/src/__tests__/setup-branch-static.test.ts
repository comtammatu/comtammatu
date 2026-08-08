import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const setupPs1 = readFileSync(join(root, "scripts/setup-branch.ps1"), "utf8");
const setupCmd = readFileSync(join(root, "SETUP.cmd"), "utf8");
const buildBundle = readFileSync(join(root, "scripts/build-bundle.sh"), "utf8");
const installService = readFileSync(join(root, "scripts/install-service.ps1"), "utf8");

test("one-shot branch setup script exists and covers install/update/env merge", () => {
  assert.ok(existsSync(join(root, "scripts/setup-branch.ps1")));
  assert.ok(existsSync(join(root, "SETUP.cmd")));
  assert.match(setupPs1, /Ensure-Node24/);
  assert.match(setupPs1, /Get-LatestNode24Version/);
  assert.match(setupPs1, /nodejs\.org\/dist\/index\.json/);
  assert.match(setupPs1, /Install-Node24FromOfficialMsi/);
  assert.match(setupPs1, /latest-v24\.x/);
  assert.match(setupPs1, /OpenJS\.NodeJS\.LTS/);
  assert.doesNotMatch(setupPs1, /--id OpenJS\.NodeJS(?:\s|$)/);
  assert.match(setupPs1, /Ensure-Nssm/);
  assert.match(setupPs1, /Merge-EnvExampleKeys/);
  assert.match(setupPs1, /Migrate-LegacyEnv/);
  assert.match(setupPs1, /install-service\.ps1/);
  assert.match(setupPs1, /realtime status=SUBSCRIBED/);
  assert.match(setupCmd, /setup-branch\.ps1/);
  assert.match(setupCmd, /RunAs/);
  assert.match(setupCmd, /^pause$/m);
  assert.match(setupCmd, /Missing scripts\\setup-branch\.ps1/);
  assert.equal(
    [...setupPs1].some((ch) => ch.charCodeAt(0) > 127),
    false,
    "setup-branch.ps1 must stay ASCII-only for Windows PowerShell 5.1",
  );
  assert.equal(
    [...setupCmd].some((ch) => ch.charCodeAt(0) > 127),
    false,
    "SETUP.cmd must stay ASCII-only",
  );
});

test("build-bundle ships a lean branch zip contract", () => {
  assert.match(buildBundle, /SETUP\.cmd/);
  assert.match(buildBundle, /setup-branch\.ps1/);
  assert.match(buildBundle, /install-service\.ps1/);
  assert.match(buildBundle, /uninstall-service\.ps1/);
  assert.match(buildBundle, /VERSION/);
  assert.match(buildBundle, /cat > "\$STAGING\/INSTALL\.md"/);
  assert.match(buildBundle, /SETUP\.cmd -EnvFile branch\.env/);
  assert.match(buildBundle, /lean bundle|lean artifacts/);

  // Must not ship developer docs / repo junk into the branch zip.
  assert.doesNotMatch(buildBundle, /cp\s+"\$AGENT_DIR\/README\.md"/);
  assert.doesNotMatch(buildBundle, /cp\s+"\$AGENT_DIR\/package\.json"/);
  assert.doesNotMatch(buildBundle, /run\.ps1/);
  assert.doesNotMatch(buildBundle, /cp -r "\$AGENT_DIR\/scripts"/);
  assert.doesNotMatch(buildBundle, /presence:provision/);
  assert.doesNotMatch(
    buildBundle,
    /Cài Node\.js 24\.x: https:\/\/nodejs\.org\//,
  );
});

test("install-service remains the NSSM helper called by setup-branch", () => {
  assert.match(installService, /ComTamMaTu-PrintAgent/);
  assert.match(installService, /AppEnvironmentExtra/);
  assert.match(installService, /SERVICE_AUTO_START/);
  assert.match(setupPs1, /InstallServiceScript/);
});

test(".env.example matches the current branch.env catalog", () => {
  const envExample = readFileSync(join(root, ".env.example"), "utf8");
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "AGENT_TENANT_ID",
    "AGENT_BRANCH_ID",
    "AGENT_ID",
    "WEB_BASE_URL",
    "PRINT_AGENT_PRESENCE_TOKEN",
  ]) {
    assert.match(envExample, new RegExp(`^${key}=`, "m"));
  }
  assert.match(envExample, /invoice QR/);
  assert.match(envExample, /nguyen-huu-tho/);
  assert.match(envExample, /AGENT_BRANCH_ID=3/);
  assert.doesNotMatch(envExample, /^AGENT_ID=$/m);
});
