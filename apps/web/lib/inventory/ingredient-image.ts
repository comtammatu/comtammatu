export const INGREDIENT_IMAGE_BUCKET = "inventory-attachments";
export const INGREDIENT_IMAGE_MAX_BYTES = 512 * 1024;
export const INGREDIENT_IMAGE_INPUT_MAX_BYTES = 10 * 1024 * 1024;
export const INGREDIENT_IMAGE_MAX_DIMENSION = 800;

export function ingredientImageObjectPath(
  url: string,
  origin: string,
  tenantId: number,
): string | null {
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0) return null;
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${INGREDIENT_IMAGE_BUCKET}/`;
    if (
      parsed.origin !== new URL(origin).origin ||
      parsed.search ||
      parsed.hash ||
      !parsed.pathname.startsWith(marker)
    )
      return null;
    const path = parsed.pathname.slice(marker.length);
    return new RegExp(
      `^${tenantId}/ingredients/[0-9a-f-]{36}/[0-9a-f-]{36}\\.webp$`,
    ).test(path)
      ? path
      : null;
  } catch {
    return null;
  }
}

export function isWebpImageBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  );
}

export function ingredientImageDimensions(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("invalid_image_dimensions");
  const scale = Math.min(
    1,
    INGREDIENT_IMAGE_MAX_DIMENSION / Math.max(width, height),
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function prepareIngredientImage(file: File): Promise<File> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size === 0 ||
    file.size > INGREDIENT_IMAGE_INPUT_MAX_BYTES
  )
    throw new Error("invalid_image_file");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const dimensions = ingredientImageDimensions(bitmap.width, bitmap.height);
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image_processing_failed");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.65, 0.5]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (
        blob?.type === "image/webp" &&
        blob.size > 0 &&
        blob.size <= INGREDIENT_IMAGE_MAX_BYTES
      ) {
        return new File([blob], "ingredient.webp", { type: "image/webp" });
      }
    }
    throw new Error("image_processing_failed");
  } finally {
    bitmap.close();
  }
}
