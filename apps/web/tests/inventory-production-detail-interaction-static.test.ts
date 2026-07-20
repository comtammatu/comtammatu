import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/inventory/production/[id]/production-detail-client.tsx",
  ),
  "utf8",
);

test("production detail uses the shared destructive confirm flow", () => {
  assert.match(
    source,
    /import \{ confirm \} from "@comtammatu\/ui\/components\/confirm-dialog"/,
  );
  assert.match(source, /const shouldCancel = await confirm\(\{/);
  assert.match(source, /variant: "destructive"/);
  assert.doesNotMatch(source, /if \(!confirm\(/);
});

test("production detail actions stay touch-sized below desktop", () => {
  assert.match(source, /const isTouchLayout = useIsMobile\(1024\)/);
  assert.match(
    source,
    /const actionSize = embedded \|\| isTouchLayout \? "touch" : "default"/,
  );
  assert.equal(source.match(/size=\{actionSize\}/g)?.length, 3);
});
