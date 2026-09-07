import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ingredientImageDimensions,
  ingredientImageObjectPath,
  isWebpImageBytes,
} from "../lib/inventory/ingredient-image.ts";

const origin = "https://image-test.supabase.co";
const path =
  "419/ingredients/3a1d2c40-9f22-40b6-8bc3-7c3db8f19461/6ac71c37-d35d-4471-bce0-978b53724e12.webp";
const url = `${origin}/storage/v1/object/public/inventory-attachments/${path}`;

test("image cleanup only accepts the authenticated tenant and trusted origin", () => {
  assert.equal(ingredientImageObjectPath(url, origin, 419), path);
  for (const invalid of [
    url.replace("419/", "823/"),
    url.replace("image-test", "foreign"),
    `${url}?download=1`,
    `${url}#other`,
    url.replace(".webp", ".svg"),
    url.replace("/ingredients/", "/grn/"),
  ]) {
    assert.equal(ingredientImageObjectPath(invalid, origin, 419), null);
  }
  assert.equal(ingredientImageObjectPath(url, origin, 0), null);
});

test("image dimensions preserve aspect ratio and never enlarge small files", () => {
  assert.deepEqual(ingredientImageDimensions(2400, 1200), {
    width: 800,
    height: 400,
  });
  assert.deepEqual(ingredientImageDimensions(600, 2400), {
    width: 200,
    height: 800,
  });
  assert.deepEqual(ingredientImageDimensions(120, 80), {
    width: 120,
    height: 80,
  });
  assert.throws(() => ingredientImageDimensions(0, 80));
  assert.throws(() => ingredientImageDimensions(Infinity, 80));
});

test("server rejects files that merely claim to be WebP", () => {
  assert.equal(
    isWebpImageBytes(new TextEncoder().encode("<svg>payload")),
    false,
  );
  assert.equal(isWebpImageBytes(new Uint8Array()), false);
  assert.equal(
    isWebpImageBytes(new TextEncoder().encode("RIFF0000WEBP")),
    true,
  );
});

const baseline = readFileSync(
  "../../supabase/migrations/20260902162918_baseline.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const migration = readFileSync(
  "../../supabase/migrations/20260907144730_ingredient_images.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const storageAccess = readFileSync(
  "../../supabase/migrations/20260907144730_ingredient_images.sql",
  "utf8",
);
const executionAcl = readFileSync(
  "../../supabase/migrations/20260907144730_ingredient_images.sql",
  "utf8",
);
function catalogFunction(sql: string) {
  const start = sql.indexOf("CREATE FUNCTION public.save_ingredient_catalog(");
  assert.ok(start >= 0);
  return sql.slice(start, sql.indexOf("\n$$;", start) + 4);
}

test("image RPC extension preserves all existing catalog and unit-conversion behavior", () => {
  const extended = catalogFunction(migration)
    .replace(
      ", p_image_url text DEFAULT NULL::text, p_image_url_set boolean DEFAULT false)",
      ")",
    )
    .replace(
      "  IF p_image_url_set THEN\n    UPDATE public.ingredients SET image_url = p_image_url\n    WHERE id = v_id AND tenant_id = v_tenant;\n  END IF;\n",
      "",
    );
  assert.equal(extended, catalogFunction(baseline));
});

test("image policy restricts existing permissive writes and serializes cleanup with publication", () => {
  assert.match(
    storageAccess,
    /ingredient_image_upload ON storage.objects FOR INSERT TO authenticated/,
  );
  assert.match(
    storageAccess,
    /ingredient_image_read ON storage.objects FOR SELECT TO authenticated/,
  );
  assert.match(
    executionAcl,
    /REVOKE ALL ON FUNCTION public.save_ingredient_catalog\([^;]+FROM anon/,
  );
  assert.match(
    migration,
    /GRANT SELECT \(image_url\) ON TABLE public.ingredients TO authenticated/,
  );
  assert.match(
    migration,
    /ingredient_image_insert ON storage.objects AS RESTRICTIVE FOR INSERT/,
  );
  assert.match(
    migration,
    /ingredient_image_immutable ON storage.objects AS RESTRICTIVE FOR UPDATE/,
  );
  assert.match(
    migration,
    /ingredient_image_delete ON storage.objects AS RESTRICTIVE FOR DELETE/,
  );
  assert.equal((migration.match(/pg_advisory_xact_lock/g) ?? []).length, 3);
  assert.match(migration, /RETURN NOT EXISTS \([\s\S]*FROM public.ingredients/);
  assert.match(migration, /auth.jwt\(\)->>'iss'/);
  assert.match(migration, /metadata->>'mimetype' = 'image\/webp'/);
});

test("form uploads at submit and handles failed publication before local success state", () => {
  const form = readFileSync(
    "app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
    "utf8",
  );
  const input = readFileSync(
    "app/(protected)/inventory/ingredients/ingredient-image-input.tsx",
    "utf8",
  );
  assert.doesNotMatch(input, /uploadIngredientImage|\.storage\./);
  assert.match(input, /URL.revokeObjectURL/);
  assert.match(
    form,
    /if \(!result.success\) \{[\s\S]*discardIngredientImage\(uploadedImage\)/,
  );
  assert.match(
    form,
    /uploadedImage = null;[\s\S]*resolvedIngredient.image_url !== imageUrl/,
  );
});
