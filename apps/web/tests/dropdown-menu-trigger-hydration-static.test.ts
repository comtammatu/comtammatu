import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  join(process.cwd(), "../../packages/ui/src/components/dropdown-menu.tsx"),
  "utf8",
);

test("rendered dropdown triggers keep the rendered control data slot stable", () => {
  assert.match(
    source,
    /function DropdownMenuTrigger\(\{\s*render,\s*\.\.\.props/,
  );
  assert.match(
    source,
    /React\.isValidElement\(render\)[\s\S]*React\.cloneElement\([\s\S]*"data-slot": "dropdown-menu-trigger"/,
  );
  assert.match(source, /data-slot="dropdown-menu-trigger"/);
  assert.match(source, /render=\{slottedRender\}/);
});
