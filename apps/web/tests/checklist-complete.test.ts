import assert from "node:assert/strict";
import { test } from "node:test";
import { isRequiredChecklistItemComplete } from "../lib/staff-runtime/_lib/checklist-complete";

test("required photo tasks are incomplete without photo_path", () => {
  assert.equal(
    isRequiredChecklistItemComplete({
      isRequired: true,
      done: true,
      allowsPhoto: true,
      photoPath: null,
    }),
    false,
  );
  assert.equal(
    isRequiredChecklistItemComplete({
      isRequired: true,
      done: true,
      allowsPhoto: true,
      photoPath: "  ",
    }),
    false,
  );
  assert.equal(
    isRequiredChecklistItemComplete({
      isRequired: true,
      done: true,
      allowsPhoto: true,
      photoPath: "1/2026-08-17/task.jpg",
    }),
    true,
  );
  assert.equal(
    isRequiredChecklistItemComplete({
      isRequired: true,
      done: true,
      allowsPhoto: false,
      photoPath: null,
    }),
    true,
  );
  assert.equal(
    isRequiredChecklistItemComplete({
      isRequired: false,
      done: false,
      allowsPhoto: true,
      photoPath: null,
    }),
    true,
  );
});
