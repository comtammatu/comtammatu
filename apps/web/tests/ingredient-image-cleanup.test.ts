import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  cleanupIngredientImages,
  isIngredientImageCronAuthorized,
  type IngredientImageCleanupDependencies,
} from "../lib/inventory/ingredient-image-cleanup.ts";

const path =
  "419/ingredients/3a1d2c40-9f22-40b6-8bc3-7c3db8f19461/6ac71c37-d35d-4471-bce0-978b53724e12.webp";
function harness(overrides: Partial<IngredientImageCleanupDependencies> = {}) {
  const calls: string[] = [];
  const deps: IngredientImageCleanupDependencies = {
    claim: async () => ({ data: [{ object_name: path }], error: null }),
    remove: async (paths) => {
      calls.push("remove");
      assert.deepEqual(paths, [path]);
      return { error: null };
    },
    finish: async (paths) => {
      calls.push("finish");
      assert.deepEqual(paths, [path]);
      return { data: 1, error: null };
    },
    ...overrides,
  };
  return { deps, calls };
}

test("image cron authentication fails closed, including equal-length invalid secrets", () => {
  assert.equal(isIngredientImageCronAuthorized("Bearer abc", "abc"), true);
  for (const header of [
    null,
    "abc",
    "Bearer abd",
    "Bearer abc ",
    "Bearer abc-extra",
  ]) {
    assert.equal(isIngredientImageCronAuthorized(header, "abc"), false);
  }
  assert.equal(
    isIngredientImageCronAuthorized("Bearer undefined", undefined),
    false,
  );
});

test("cleanup acknowledges only the claimed Storage batch after successful deletion", async () => {
  const { deps, calls } = harness();
  assert.deepEqual(await cleanupIngredientImages(deps), { removed: 1 });
  assert.deepEqual(calls, ["remove", "finish"]);
});

test("empty or malformed claims never cause Storage deletion", async () => {
  const empty = harness({ claim: async () => ({ data: [], error: null }) });
  assert.deepEqual(await cleanupIngredientImages(empty.deps), { removed: 0 });
  assert.deepEqual(empty.calls, []);
  for (const data of [
    null,
    [{ object_name: "419/grn/evidence.webp" }],
    [{ object_name: path.replace("419/", "0/") }],
  ]) {
    const invalid = harness({ claim: async () => ({ data, error: null }) });
    await assert.rejects(
      cleanupIngredientImages(invalid.deps),
      /image_cleanup_claim_failed/,
    );
    assert.deepEqual(invalid.calls, []);
  }
});

test("failed deletion retains the claim for retry and incomplete removal is not success", async () => {
  const failed = harness({
    remove: async () => ({ error: { message: "private storage failure" } }),
  });
  await assert.rejects(
    cleanupIngredientImages(failed.deps),
    /image_cleanup_storage_failed/,
  );
  assert.deepEqual(failed.calls, []);
  const partial = harness({ finish: async () => ({ data: 0, error: null }) });
  await assert.rejects(
    cleanupIngredientImages(partial.deps),
    /image_cleanup_incomplete/,
  );
});

test("orphan claim and publication share the lock, and only service-role can run bounded cleanup", () => {
  const sql = readFileSync(
    "../../supabase/migrations/20260907144730_ingredient_images.sql",
    "utf8",
  );
  assert.match(sql, /created_at < now\(\) - interval '24 hours'/);
  assert.match(sql, /p_limit NOT BETWEEN 1 AND 100/);
  assert.match(sql, /auth.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(sql, /FROM PUBLIC, anon, authenticated/);
  assert.match(
    sql,
    /pg_try_advisory_xact_lock[\s\S]+INSERT INTO private.ingredient_image_cleanup_claims/,
  );
  assert.match(
    sql,
    /pg_advisory_xact_lock[\s\S]+ingredient_image_cleanup_claims[\s\S]+ingredient_image_retired/,
  );
  assert.doesNotMatch(sql, /DELETE FROM storage.objects/);
});
