"use server";

import { createServiceClient } from "@comtammatu/database/supabase/service";
import type { ActionResult } from "@comtammatu/shared/types";

const MAX_PHOTOS = 3;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

// SECURITY: requires token + feedbackId. We verify the feedback was created
// via this token's QR code AND was recent (≤ FRESH_WINDOW_MS) so an attacker
// can't grab a feedback_id from somewhere else and stuff photos onto it.
// tenant_id is derived from the feedback row, never trusted from client.
const FRESH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes — generous for slow uploads

export async function uploadFeedbackPhotos(
  formData: FormData,
  feedbackId: number,
  token?: string,
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

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return { success: false, error: "Mỗi ảnh tối đa 5 MB" };
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return { success: false, error: "Định dạng ảnh không hỗ trợ" };
    }
  }

  const supabase = createServiceClient();

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
    .select("tenant_id, qr_code_id, photo_paths, created_at")
    .eq("id", feedbackId)
    .eq("qr_code_id", qr.id)
    .maybeSingle();

  if (!feedbackRow) {
    return { success: false, error: "Không tìm thấy phản ánh" };
  }

  const ageMs = Date.now() - new Date(feedbackRow.created_at).getTime();
  if (ageMs > FRESH_WINDOW_MS) {
    return { success: false, error: "Phản ánh đã cũ, không thể tải ảnh" };
  }

  if (feedbackRow.photo_paths && feedbackRow.photo_paths.length > 0) {
    return { success: false, error: "Phản ánh đã có ảnh" };
  }

  const tenantId = feedbackRow.tenant_id;
  const paths: string[] = [];

  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const random = Math.random().toString(36).slice(2, 10);
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
    return { success: false, error: "Không thể tải ảnh lên. Vui lòng thử lại." };
  }

  // Update feedbacks.photo_paths with the collected storage paths.
  // Conditional WHERE on photo_paths IS NULL OR '{}' closes the TOCTOU race
  // where two concurrent uploads for the same feedback_id both pass the
  // earlier emptiness check and then race to overwrite each other.
  const { data: updated, error: updateError } = await supabase
    .from("feedbacks")
    .update({ photo_paths: paths })
    .eq("id", feedbackId)
    .or("photo_paths.is.null,photo_paths.eq.{}")
    .select("id");

  if (updateError) {
    console.error("[uploadFeedbackPhotos] update error", updateError.code);
    // Non-fatal — photos are uploaded, just not linked
  } else if (!updated || updated.length === 0) {
    console.warn(
      "[uploadFeedbackPhotos] race-lost feedbackId=%d — paths orphaned",
      feedbackId,
    );
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
  const supabase = createServiceClient();

  const { data: feedback } = await supabase
    .from("feedbacks")
    .select("photo_paths, tenant_id")
    .eq("id", feedbackId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!feedback) {
    return { success: false, error: "Không tìm thấy phản ánh" };
  }

  if (!feedback.photo_paths || feedback.photo_paths.length === 0) {
    return { success: true, data: { urls: [] } };
  }

  const urls: string[] = [];
  for (const path of feedback.photo_paths) {
    const { data } = await supabase.storage
      .from("feedback-photos")
      .createSignedUrl(path, 600);
    if (data?.signedUrl) {
      urls.push(data.signedUrl);
    }
  }

  return { success: true, data: { urls } };
}
