"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { loadAuthState } from "@/_lib/auth";
import { operator } from "@lib/messages/operator";

const createBranchIncidentSchema = z.object({
  branchId: z.number().int().positive(),
  category: z.enum(["it", "kitchen", "facility", "service"]),
  title: z.string().trim().min(3, "Tiêu đề tối thiểu 3 ký tự").max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(["high", "urgent"]).default("urgent"),
  photoUrl: z.string().url().optional().or(z.literal("")),
  photoFileName: z.string().optional(),
  photoByteSize: z.number().optional(),
});

export type CreateBranchIncidentInput = z.infer<typeof createBranchIncidentSchema>;

export async function createBranchIncidentAction(
  input: CreateBranchIncidentInput,
): Promise<
  ActionResult<{
    taskId: number;
    title: string;
    priority: string;
  }>
> {
  const parsed = createBranchIncidentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Thông tin sự cố không hợp lệ",
    };
  }

  const { supabase, claims, userId } = await loadAuthState();
  if (!userId || !claims) {
    return { success: false, error: "Chưa đăng nhập" };
  }

  const { data, error } = await supabase.rpc("create_branch_incident_task", {
    p_branch_id: parsed.data.branchId,
    p_category: parsed.data.category,
    p_title: parsed.data.title,
    p_description: parsed.data.description || undefined,
    p_priority: parsed.data.priority,
  });

  if (error) {
    return {
      success: false,
      error: "Không thể gửi báo cáo sự cố",
    };
  }

  const result = data as {
    task_id: number;
    title: string;
    priority: string;
  } | null;

  if (!result) {
    return { success: false, error: "Không thể tạo sự cố" };
  }

  const taskId = Number(result.task_id);

  if (parsed.data.photoUrl) {
    try {
      const service = createServiceClient();
      await service.from("work_task_attachments").insert({
        tenant_id: claims.tenant_id,
        task_id: taskId,
        storage_path: parsed.data.photoUrl,
        file_name: parsed.data.photoFileName || "incident-photo.jpg",
        content_type: "image/jpeg",
        byte_size: parsed.data.photoByteSize ?? null,
        uploaded_by: userId,
      });
    } catch {
      // Non-fatal: task is already created
    }
  }

  return {
    success: true,
    data: {
      taskId,
      title: String(result.title),
      priority: String(result.priority),
    },
  };
}

export async function uploadBranchIncidentPhotoAction(
  formData: FormData,
): Promise<ActionResult<{ url: string; fileName: string; byteSize: number }>> {
  const file = formData.get("file");
  const branchIdRaw = formData.get("branchId");
  if (!(file instanceof File) || !branchIdRaw) {
    return { success: false, error: "Tệp không hợp lệ" };
  }
  const branchId = Number(branchIdRaw);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    return { success: false, error: "Mã chi nhánh không hợp lệ" };
  }

  const { claims, userId } = await loadAuthState();
  if (!userId || !claims) {
    return { success: false, error: "Chưa đăng nhập" };
  }

  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: "Kích thước ảnh vượt quá giới hạn 10MB" };
  }

  const service = createServiceClient();
  const ext = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf("."))
    : ".jpg";
  const storagePath = `${claims.tenant_id}/incidents/${branchId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await service.storage
    .from("inventory-attachments")
    .upload(storagePath, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (upErr) {
    return { success: false, error: operator.incident.photoUploadFailed };
  }

  const { data: urlData } = service.storage
    .from("inventory-attachments")
    .getPublicUrl(storagePath);

  return {
    success: true,
    data: {
      url: urlData.publicUrl,
      fileName: file.name,
      byteSize: file.size,
    },
  };
}
