"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { loadAuthState } from "@/_lib/auth";

const createBranchIncidentSchema = z.object({
  branchId: z.number().int().positive(),
  category: z.enum(["it", "kitchen", "facility", "service"]),
  title: z.string().trim().min(3, "Tiêu đề tối thiểu 3 ký tự").max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(["high", "urgent"]).default("urgent"),
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

  const { supabase, userId } = await loadAuthState();
  if (!userId) {
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

  return {
    success: true,
    data: {
      taskId: Number(result.task_id),
      title: String(result.title),
      priority: String(result.priority),
    },
  };
}
