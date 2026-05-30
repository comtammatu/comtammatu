"use server";

import { createHash, randomUUID } from "node:crypto";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext, probePermission } from "@/_lib/auth";

const MAX_PHOTOS = 3;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const EXT_BY_TYPE = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
]);

// SECURITY: requires QR token + feedbackId + one-shot upload token. We verify
// the feedback was created via this token's QR code, the upload token hash
// matches, and the row is still fresh. tenant_id is always derived from DB.
const FRESH_WINDOW_MS = 10 * 60 * 1000;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function uploadFeedbackPhotos(
  formData: FormData,
  feedbackId: number,
  token?: string,
  photoUploadToken?: string,
): Promise<ActionResult<{ paths: string[] }>> {
  const files = formData.getAll("photos") as File[];

  if (files.length === 0) {
    return { success: true, data: { paths: [] } };
  }

  if (files.length > MAX_PHOTOS) {
    return { success: false, error: "Tối đa 3 ảnh" };
  }

  if (!token) {
    return { success: false, error: "Thiếu token" };
  }

  if (
    !photoUploadToken ||
    !/^[a-f0-9]{64}$/.test(photoUploadToken)
  ) {
    return { success: false, error: "Phiên tải ảnh không hợp lệ" };
  }

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return { success: false, error: "Mỗi ảnh tối đa 5 MB" };
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return { success: false, error: "Định dạng ảnh không hỗ trợ" };
    }
  }

  const supabase = createServiceClient();
  const tokenHash = sha256Hex(photoUploadToken);

  const { data: qr } = await supabase
    .from("feedback_qr_codes")
    .select("id")
    .eq("token", token)
    .maybeSingle();

  if (!qr) {
    return { success: false, error: "Token không hợp lệ" };
  }

  const { data: feedbackRow } = await supabase
    .from("feedbacks")
    .select(
      "tenant_id, qr_code_id, photo_paths, created_at, photo_upload_expires_at, photo_upload_consumed_at",
    )
    .eq("id", feedbackId)
    .eq("qr_code_id", qr.id)
    .eq("photo_upload_token_sha256", tokenHash)
    .maybeSingle();

  if (!feedbackRow) {
    return { success: false, error: "Phiên tải ảnh không hợp lệ" };
  }

  const ageMs = Date.now() - new Date(feedbackRow.created_at).getTime();
  if (ageMs > FRESH_WINDOW_MS) {
    return { success: false, error: "Phản ánh đã cũ, không thể tải ảnh" };
  }

  if (feedbackRow.photo_paths && feedbackRow.photo_paths.length > 0) {
    return { success: false, error: "Phản ánh đã có ảnh" };
  }

  if (feedbackRow.photo_upload_consumed_at) {
    return { success: false, error: "Phiên tải ảnh đã được sử dụng" };
  }

  if (
    !feedbackRow.photo_upload_expires_at ||
    new Date(feedbackRow.photo_upload_expires_at).getTime() <= Date.now()
  ) {
    return { success: false, error: "Phiên tải ảnh đã hết hạn" };
  }

  const tenantId = feedbackRow.tenant_id;
  const paths: string[] = [];

  for (const file of files) {
    const ext = EXT_BY_TYPE.get(file.type) ?? "jpg";
    const random = randomUUID().replaceAll("-", "").slice(0, 24);
    const path = `${tenantId}/${feedbackId}/${random}.${ext}`;

    const bytes = await file.arrayBuffer();
    const { error } = await supabase.storage
      .from("feedback-photos")
      .upload(path, bytes, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error("[uploadFeedbackPhotos] upload error", error.message);
      // Continue uploading the rest; collect what succeeded
      continue;
    }

    paths.push(path);
  }

  if (paths.length === 0 && files.length > 0) {
    return {
      success: false,
      error: "Không thể tải ảnh lên. Vui lòng thử lại.",
    };
  }

  // Update feedbacks.photo_paths with the collected storage paths.
  // Conditional WHERE on photo_paths IS NULL OR '{}' closes the TOCTOU race
  // where two concurrent uploads for the same feedback_id both pass the
  // earlier emptiness check and then race to overwrite each other.
  // The upload token is consumed in the same UPDATE so it remains one-shot.
  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("feedbacks")
    .update({ photo_paths: paths, photo_upload_consumed_at: nowIso })
    .eq("id", feedbackId)
    .eq("photo_upload_token_sha256", tokenHash)
    .is("photo_upload_consumed_at", null)
    .gt("photo_upload_expires_at", nowIso)
    .or("photo_paths.is.null,photo_paths.eq.{}")
    .select("id");

  if (updateError) {
    console.error("[uploadFeedbackPhotos] update error", updateError.code);
    const { error: removeError } = await supabase.storage
      .from("feedback-photos")
      .remove(paths);
    if (removeError) {
      console.warn(
        "[uploadFeedbackPhotos] cleanup-after-update-error failed",
        removeError.message,
      );
    }
    return {
      success: false,
      error: "Không thể tải ảnh lên. Vui lòng thử lại.",
    };
  } else if (!updated || updated.length === 0) {
    console.warn(
      "[uploadFeedbackPhotos] race-lost feedbackId=%d — removing uploaded paths",
      feedbackId,
    );
    const { error: removeError } = await supabase.storage
      .from("feedback-photos")
      .remove(paths);
    if (removeError) {
      console.warn(
        "[uploadFeedbackPhotos] cleanup-after-race-lost failed",
        removeError.message,
      );
    }
    return {
      success: false,
      error: "Không thể tải ảnh lên. Vui lòng thử lại.",
    };
  }

  return { success: true, data: { paths } };
}

/**
 * Get signed URLs (TTL 600s) for feedback photos — for admin inbox drawer.
 */
export async function getFeedbackPhotoUrls(
  feedbackId: number,
  tenantId: number,
): Promise<ActionResult<{ urls: string[] }>> {
  if (
    !Number.isInteger(feedbackId) ||
    feedbackId <= 0 ||
    !Number.isInteger(tenantId) ||
    tenantId <= 0
  ) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContext(MODULE_ACL.feedback.allowedRoles);
  if (!ctx || ctx.claims.tenant_id !== tenantId) {
    return { success: false, error: "Không có quyền xem ảnh." };
  }

  const supabase = createServiceClient();

  const { data: feedback } = await supabase
    .from("feedbacks")
    .select("photo_paths, tenant_id, branch_id")
    .eq("id", feedbackId)
    .eq("tenant_id", ctx.claims.tenant_id)
    .maybeSingle();

  if (!feedback) {
    return { success: false, error: "Không tìm thấy phản ánh" };
  }

  const canView = await probePermission(
    ctx,
    PERMISSION_KEYS.FEEDBACK_VIEW,
    feedback.branch_id,
  );
  if (!canView) {
    return { success: false, error: "Không có quyền xem ảnh." };
  }

  if (!feedback.photo_paths || feedback.photo_paths.length === 0) {
    return { success: true, data: { urls: [] } };
  }

  const urls: string[] = [];
  const expectedPrefix = `${feedback.tenant_id}/${feedbackId}/`;
  for (const path of feedback.photo_paths) {
    if (!path.startsWith(expectedPrefix)) {
      console.warn(
        "[getFeedbackPhotoUrls] unexpected photo path feedbackId=%d",
        feedbackId,
      );
      continue;
    }

    const { data } = await supabase.storage
      .from("feedback-photos")
      .createSignedUrl(path, 600);
    if (data?.signedUrl) {
      urls.push(data.signedUrl);
    }
  }

  return { success: true, data: { urls } };
}
