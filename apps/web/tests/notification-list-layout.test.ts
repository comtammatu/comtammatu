import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.join(process.cwd(), "app/_components/notification-list.tsx"),
  "utf8",
);

test("notification list constrains max-height in normal flow", () => {
  assert.doesNotMatch(source, /ScrollArea/);
  assert.match(
    source,
    /cn\("overflow-y-auto overscroll-contain", scrollClassName\)/,
  );
});
