import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const countAssignmentsClientSource = readWeb(
  "app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
);

test("count assignment UI reseeds from server props and refreshes after save", () => {
  assert.match(
    countAssignmentsClientSource,
    /function seedSelections[\s\S]*assignmentsByEmployee\[String\(emp\.id\)\] \?\? \[\]/,
    "Count assignment state should be seeded from server assignments for the current scope",
  );
  assert.match(
    countAssignmentsClientSource,
    /useEffect\(\(\) => \{[\s\S]*setSelectionByEmployee\(seedSelections\(employees, assignmentsByEmployee\)\);[\s\S]*\}, \[employees, assignmentsByEmployee\]\)/,
    "Changing branch/location or refreshing server props should reset the local assignment chips",
  );
  assert.match(
    countAssignmentsClientSource,
    /await setCountAssignments\([\s\S]*toast\.success[\s\S]*router\.refresh\(\);/,
    "Saving assignments should refresh the server page so reassigned ingredients disappear from other employees",
  );
});
