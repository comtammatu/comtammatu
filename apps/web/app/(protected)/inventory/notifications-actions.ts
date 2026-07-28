"use server";

import {
  PERMISSION_KEYS,
  SUPPLIER_RETURN_ROLES,
} from "@comtammatu/shared/auth";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "./_lib/auth";

const ROLES = SUPPLIER_RETURN_ROLES;

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

  const { data: settings } = await createServiceClient()
    .from("inventory_qc_settings")
    .select("alert_webhook_url")
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  const webhookUrl = settings?.alert_webhook_url ?? null;

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
      row.payload &&
      typeof row.payload === "object" &&
      !Array.isArray(row.payload)
        ? (row.payload as OutboxPayload)
        : ({} as OutboxPayload);
    const body = formatPayload(row.topic, payload);
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

function formatPayload(topic: string, payload: OutboxPayload): unknown {
  const safePayload = sanitizePayload(payload);
  const text = formatTopicText(topic, safePayload);
  return { topic, text, payload: safePayload };
}

function formatTopicText(topic: string, payload: OutboxPayload): string {
  if (topic === "grn.requires_review") {
    return [
      "🚨 Phiếu nhập cần Kế toán kiểm tra giá",
      `Phiếu: ${payload.grn_number ?? "?"} (${payload.branch_name ?? "?"})`,
      `NCC: ${payload.supplier_name ?? "?"}`,
      `Nguyên liệu: ${payload.ingredient_name ?? "?"}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (topic === "supplier_return.created") {
    return [
      `📦 Phiếu trả NCC mới: ${payload.return_number ?? "?"}`,
      `NCC: ${payload.supplier_name ?? "?"} • Kho: ${payload.branch_name ?? "?"}`,
      `Lý do: ${payload.reason ?? "?"} • Cách xử lý: ${payload.resolution ?? "?"}`,
    ].join("\n");
  }
  return `Inventory event: ${topic}`;
}

const MONETARY_PAYLOAD_KEYS = new Set([
  "po_unit_price",
  "unit_cost",
  "total_cost",
  "total_value",
  "price_variance_pct",
  "baseline_variance_pct",
  "override_note",
  "override_photo_url",
]);

function sanitizePayload(payload: OutboxPayload): OutboxPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) => !MONETARY_PAYLOAD_KEYS.has(key),
    ),
  );
}
