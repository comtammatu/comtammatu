import { NextResponse } from "next/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getCronSecret } from "@comtammatu/shared/runtime";
import { INGREDIENT_IMAGE_BUCKET } from "@lib/inventory/ingredient-image";
import {
  cleanupIngredientImages,
  isIngredientImageCronAuthorized,
} from "@lib/inventory/ingredient-image-cleanup";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = getCronSecret();
  if (!secret)
    return NextResponse.json(
      { ok: false, error: "not_configured" },
      { status: 503 },
    );
  if (
    !isIngredientImageCronAuthorized(
      request.headers.get("authorization"),
      secret,
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }
  try {
    const supabase = createServiceClient();
    // The Production type source is updated only after the DB-first release.
    const rpc = (
      supabase.rpc as unknown as (
        name:
          "claim_ingredient_image_cleanup" | "finish_ingredient_image_cleanup",
        args: { p_limit: number } | { p_object_names: string[] },
      ) => PromiseLike<{ data: unknown; error: unknown }>
    ).bind(supabase);
    const result = await cleanupIngredientImages({
      claim: () => rpc("claim_ingredient_image_cleanup", { p_limit: 50 }),
      remove: (paths) =>
        supabase.storage.from(INGREDIENT_IMAGE_BUCKET).remove(paths),
      finish: (paths) =>
        rpc("finish_ingredient_image_cleanup", { p_object_names: paths }),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    console.error(
      "[cron/ingredient-image-cleanup] cleanup failed; claims remain retryable",
    );
    return NextResponse.json(
      { ok: false, error: "cleanup_failed" },
      { status: 500 },
    );
  }
}
