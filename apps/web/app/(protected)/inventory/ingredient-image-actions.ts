"use server";

import { z } from "zod";
import { INGREDIENT_CATALOG_WRITE_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithAnyPermission } from "./_lib/auth";
import { CATALOG_MANAGE_PERMISSIONS } from "./_lib/catalog-permissions";
import {
  INGREDIENT_IMAGE_BUCKET,
  INGREDIENT_IMAGE_MAX_BYTES,
  ingredientImageObjectPath,
  isWebpImageBytes,
} from "@lib/inventory/ingredient-image";
import { messages } from "@lib/messages";

const copy = messages.inventory.ingredientImage;
const imageSchema = z
  .instanceof(File)
  .refine(
    (file) =>
      file.type === "image/webp" &&
      file.size > 0 &&
      file.size <= INGREDIENT_IMAGE_MAX_BYTES,
  );

export async function uploadIngredientImage(
  input: FormData,
): Promise<ActionResult<{ url: string }>> {
  const form = z.instanceof(FormData).safeParse(input);
  if (!form.success) return { success: false, error: copy.invalid };
  const file = imageSchema.safeParse(form.data.get("file"));
  if (!file.success) return { success: false, error: copy.invalid };
  const ctx = await getAuthContextWithAnyPermission(
    INGREDIENT_CATALOG_WRITE_ROLES,
    CATALOG_MANAGE_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: copy.forbidden };
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  if (!isWebpImageBytes(bytes)) return { success: false, error: copy.invalid };
  const { data: userResult, error: userError } =
    await ctx.supabase.auth.getUser();
  if (userError || !userResult.user)
    return { success: false, error: copy.forbidden };
  const path = `${ctx.claims.tenant_id}/ingredients/${userResult.user.id}/${crypto.randomUUID()}.webp`;
  const bucket = ctx.supabase.storage.from(INGREDIENT_IMAGE_BUCKET);
  const { error } = await bucket.upload(path, bytes, {
    contentType: "image/webp",
    upsert: false,
  });
  if (error) return { success: false, error: copy.uploadFailed };
  return {
    success: true,
    data: { url: bucket.getPublicUrl(path).data.publicUrl },
  };
}

export async function discardIngredientImage(
  input: string,
): Promise<ActionResult> {
  const parsed = z.string().url().max(2048).safeParse(input);
  if (!parsed.success) return { success: false, error: copy.invalid };
  const ctx = await getAuthContextWithAnyPermission(
    INGREDIENT_CATALOG_WRITE_ROLES,
    CATALOG_MANAGE_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: copy.forbidden };
  const bucket = ctx.supabase.storage.from(INGREDIENT_IMAGE_BUCKET);
  const origin = new URL(bucket.getPublicUrl("probe").data.publicUrl).origin;
  const path = ingredientImageObjectPath(
    parsed.data,
    origin,
    ctx.claims.tenant_id,
  );
  if (!path) return { success: false, error: copy.invalid };
  // Storage RLS serializes this with publication and rejects referenced images.
  const { error } = await bucket.remove([path]);
  return error
    ? { success: false, error: copy.cleanupFailed }
    : { success: true };
}
