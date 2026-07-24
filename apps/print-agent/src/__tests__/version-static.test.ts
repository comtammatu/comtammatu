import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(join(process.cwd(), "src/index.ts"), "utf8");

test("heartbeat version comes from the package manifest", () => {
  assert.match(source, /import packageJson from "\.\.\/package\.json";/);
  assert.match(source, /version: packageJson\.version,/);
  assert.doesNotMatch(source, /AGENT_VERSION/);
});
