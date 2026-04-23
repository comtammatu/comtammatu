"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, SUPPLIER_RETURN_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction } from "@/_lib/with-action";
import { getAuthContextWithPermission } from "./_lib/auth";

const ROLES = SUPPLIER_RETURN_ROLES;

/* ─── fetchQcSettingsForForm ─── */

export async function fetchQcSettingsForForm(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("inventory_qc_settings")
    .select(
      "qty_short_tolerance_pct, price_variance_warn_pct, price_variance_review_pct, reject_requires_photo, alert_webhook_url, alert_channel",
    )
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (error) return { success: false, error: "Không thể tải cấu hình QC." };
  return {
    success: true,
    data: data ?? {
      qty_short_tolerance_pct: 5,
      price_variance_warn_pct: 5,
      price_variance_review_pct: 15,
      reject_requires_photo: true,
      alert_webhook_url: null,
      alert_channel: "generic",
    },
  };
}

/* ─── saveQcSettings ─── */

const qcSettingsSchema = z.object({
  qtyShortTolerancePct: z.coerce.number().min(0).max(100),
  priceVarianceWarnPct: z.coerce.number().min(0).max(100),
  priceVarianceReviewPct: z.coerce.number().min(0).max(100),
  rejectRequiresPhoto: z.boolean(),
  alertWebhookUrl: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  alertChannel: z.enum(["generic", "telegram", "discord", "slack"]),
});

export const saveQcSettings = withAction(
  {
    roles: ROLES,
    schema: qcSettingsSchema,
    permission: PERMISSION_KEYS.SETTINGS_TENANT,
  },
  async (data, { supabase, claims, user }) => {
    if (data.priceVarianceWarnPct >= data.priceVarianceReviewPct) {
      return {
        success: false,
        error: "Ngưỡng cảnh báo phải nhỏ hơn ngưỡng kiểm tra.",
      };
    }
    const { error } = await supabase.from("inventory_qc_settings").upsert(
      {
        tenant_id: claims.tenant_id,
        qty_short_tolerance_pct: data.qtyShortTolerancePct,
        price_variance_warn_pct: data.priceVarianceWarnPct,
        price_variance_review_pct: data.priceVarianceReviewPct,
        reject_requires_photo: data.rejectRequiresPhoto,
        alert_webhook_url: data.alertWebhookUrl,
        alert_channel: data.alertChannel,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    if (error) {
      console.error("saveQcSettings", error);
      return { success: false, error: "Không thể lưu cấu hình QC." };
    }
    revalidatePath("/inventory/settings/qc");
    revalidatePath("/inventory/grn");
    return { success: true };
  },
);

/* ─── dispatchNotificationOutbox ─── */
/**
 * Pulls pending notifications from outbox, POSTs to configured webhook URL,
 * marks as sent/failed. Caller should fire-and-forget. Safe to call from any
 * server action; processes ≤20 items per call to avoid runaway loops.
 */
export async function dispatchNotificationOutbox(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const { data: settings } = await supabase
    .from("inventory_qc_settings")
    .select("alert_webhook_url, alert_channel")
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  const webhookUrl = settings?.alert_webhook_url ?? null;
  const channel = settings?.alert_channel ?? "generic";

  const { data: pending, error: fetchErr } = await supabase
    .from("notification_outbox")
    .select("id, channel, topic, payload, retries")
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "pending")
    .order("created_at")
    .limit(20);

  if (fetchErr) {
    return { success: false, error: "Không thể đọc outbox." };
  }

  if (!pending || pending.length === 0) {
    return { success: true, data: { processed: 0 } };
  }

  if (!webhookUrl) {
    // No webhook configured — mark as skipped so they don't pile up forever
    const ids = pending.map((p) => p.id);
    await supabase
      .from("notification_outbox")
      .update({ status: "skipped", sent_at: new Date().toISOString() })
      .in("id", ids)
      .eq("tenant_id", claims.tenant_id);
    return { success: true, data: { processed: 0, skipped: ids.length } };
  }

  let sent = 0;
  let failed = 0;
  for (const row of pending) {
    const payload =
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as OutboxPayload)
        : ({} as OutboxPayload);
    const body = formatPayloadForChannel(channel, row.topic, payload);
    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        await supabase
          .from("notification_outbox")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("tenant_id", claims.tenant_id);
        sent++;
      } else {
        const txt = await resp.text().catch(() => "");
        await supabase
          .from("notification_outbox")
          .update({
            status: row.retries >= 3 ? "failed" : "pending",
            retries: row.retries + 1,
            last_error: `HTTP ${resp.status}: ${txt.slice(0, 200)}`,
          })
          .eq("id", row.id)
          .eq("tenant_id", claims.tenant_id);
        failed++;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("notification_outbox")
        .update({
          status: row.retries >= 3 ? "failed" : "pending",
          retries: row.retries + 1,
          last_error: msg.slice(0, 500),
        })
        .eq("id", row.id)
        .eq("tenant_id", claims.tenant_id);
      failed++;
    }
  }

  return { success: true, data: { processed: sent + failed, sent, failed } };
}

type OutboxPayload = Record<string, unknown>;

function formatPayloadForChannel(
  channel: string,
  topic: string,
  payload: OutboxPayload,
): unknown {
  const text = formatTopicText(topic, payload);

  if (channel === "telegram") {
    // Caller should have set webhook URL to a Telegram bot proxy that accepts
    // { chat_id, text } or to a simple HTTP-to-bot bridge. Generic shape:
    return { text, topic, payload };
  }
  if (channel === "discord") {
    return { content: text };
  }
  if (channel === "slack") {
    return { text };
  }
  return { topic, text, payload };
}

function formatTopicText(topic: string, payload: OutboxPayload): string {
  if (topic === "grn.requires_review") {
    const variance = payload.price_variance_pct;
    return [
      `🚨 GRN cần kiểm tra giá lệch ${variance ?? "?"}%`,
      `Phiếu: ${payload.grn_number ?? "?"} (${payload.branch_name ?? "?"})`,
      `NCC: ${payload.supplier_name ?? "?"}`,
      `Nguyên liệu: ${payload.ingredient_name ?? "?"}`,
      `Giá PO: ${payload.po_unit_price ?? "?"} → giá nhập: ${payload.unit_cost ?? "?"}`,
      payload.override_note ? `Lý do: ${payload.override_note}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (topic === "supplier_return.created") {
    return [
      `📦 Phiếu trả NCC mới: ${payload.return_number ?? "?"}`,
      `NCC: ${payload.supplier_name ?? "?"} • Kho: ${payload.branch_name ?? "?"}`,
      `Lý do: ${payload.reason ?? "?"} • Cách xử lý: ${payload.resolution ?? "?"}`,
      `Giá trị: ${payload.total_value ?? 0}đ`,
    ].join("\n");
  }
  return `Inventory event: ${topic}`;
}
