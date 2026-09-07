import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

type Result = { data: unknown; error: unknown };
export type IngredientImageCleanupDependencies = {
  claim: () => PromiseLike<Result>;
  remove: (paths: string[]) => PromiseLike<{ error: unknown }>;
  finish: (paths: string[]) => PromiseLike<Result>;
};

const claimsSchema = z
  .array(
    z.object({
      object_name: z
        .string()
        .regex(
          /^[1-9][0-9]*\/ingredients\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/,
        ),
    }),
  )
  .max(50);

export function isIngredientImageCronAuthorized(
  header: string | null,
  secret: string | null | undefined,
): boolean {
  if (!secret || !header) return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function cleanupIngredientImages(
  deps: IngredientImageCleanupDependencies,
) {
  const claimed = await deps.claim();
  const parsed = claimsSchema.safeParse(claimed.data);
  if (claimed.error || !parsed.success)
    throw new Error("image_cleanup_claim_failed");
  const paths = [...new Set(parsed.data.map((row) => row.object_name))];
  if (paths.length === 0) return { removed: 0 };
  const removal = await deps.remove(paths);
  if (removal.error) throw new Error("image_cleanup_storage_failed");
  const finished = await deps.finish(paths);
  if (finished.error || finished.data !== paths.length) {
    throw new Error("image_cleanup_incomplete");
  }
  return { removed: paths.length };
}
