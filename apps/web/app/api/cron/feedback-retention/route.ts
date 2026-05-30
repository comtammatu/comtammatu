/**
 * Feedback retention cron worker.
 *
 * Auth: Bearer CRON_SECRET.
 * Schedule: 0 20 * * * (UTC) = 03:00 ICT — see vercel.json.
 *
 * Steps:
 *   1. Call RPC feedback_retention_cleanup() — handles phone/ip/row/outbox pruning.
 *   2. Delete queued photo storage objects from feedback rows pruned by RPC.
 *   3. Delete photo storage objects older than 3 months per tenant prefix.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getCronSecret } from "@comtammatu/shared/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOTO_RETENTION_MS = 3 * 30 * 24 * 60 * 60 * 1000; // ~3 months
const PHOTO_DELETE_BATCH_SIZE = 1000;

type ServiceClient = ReturnType<typeof createServiceClient>;
type CleanupQueueRow = { id: number; path: string };

function timingSafeEquals(a: string, b: string): boolean {
  const MAX = 256;
  const ba = Buffer.alloc(MAX);
  const bb = Buffer.alloc(MAX);
  ba.write(a.slice(0, MAX), "utf8");
  bb.write(b.slice(0, MAX), "utf8");
  const eq = timingSafeEqual(ba, bb);
  return eq && a.length === b.length;
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "unauthorized" },
    { status: 401 },
  );
}

async function processQueuedPhotoCleanup(
  supabase: ServiceClient,
): Promise<number> {
  const { data: rows, error } = await supabase
    .from("feedback_photo_cleanup_queue")
    .select("id, path")
    .is("processed_at", null)
    .order("queued_at", { ascending: true })
    .limit(PHOTO_DELETE_BATCH_SIZE);

  if (error) {
    console.error(
      "[cron/feedback-retention] photo queue read error",
      error.code,
    );
    return 0;
  }

  const queueRows = (rows ?? []) as CleanupQueueRow[];
  const paths = queueRows.map((row) => row.path).filter(Boolean);
  if (paths.length === 0) {
    return 0;
  }

  const { error: removeError } = await supabase.storage
    .from("feedback-photos")
    .remove(paths);

  if (removeError) {
    const ids = queueRows.map((row) => row.id);
    console.error(
      "[cron/feedback-retention] queued photo remove error",
      removeError.message,
    );
    await supabase
      .from("feedback_photo_cleanup_queue")
      .update({ last_error: removeError.message.slice(0, 500) })
      .in("id", ids);
    return 0;
  }

  const processedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("feedback_photo_cleanup_queue")
    .update({ processed_at: processedAt, last_error: null })
    .in(
      "id",
      queueRows.map((row) => row.id),
    );

  if (updateError) {
    console.error(
      "[cron/feedback-retention] photo queue update error",
      updateError.code,
    );
  }

  return paths.length;
}

export async function POST(request: Request) {
  const expected = getCronSecret();
  if (!expected) {
    console.error("[cron/feedback-retention] CRON_SECRET not configured");
    return NextResponse.json(
      { ok: false, error: "not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const provided = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!provided || !timingSafeEquals(provided, expected)) {
    return unauthorized();
  }

  const supabase = createServiceClient();

  // 1. Call retention RPC
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "feedback_retention_cleanup",
  );

  if (rpcError) {
    console.error("[cron/feedback-retention] rpc error", rpcError.code);
    return NextResponse.json(
      { ok: false, error: "rpc failed" },
      { status: 500 },
    );
  }

  // 2. Delete photos queued by the RPC before the source rows were pruned.
  const queuedPhotosDeleted = await processQueuedPhotoCleanup(supabase);

  // 3. Delete old photos from storage per tenant.
  // List top-level prefixes (tenant_ids) then iterate
  let photosDeleted = 0;
  const cutoffIso = new Date(Date.now() - PHOTO_RETENTION_MS).toISOString();

  const { data: tenantPrefixes } = await supabase.storage
    .from("feedback-photos")
    .list("", { limit: 1000 });

  for (const prefix of tenantPrefixes ?? []) {
    if (prefix.id === null) {
      // It's a folder prefix — list feedback_id subfolders
      const { data: feedbackPrefixes } = await supabase.storage
        .from("feedback-photos")
        .list(prefix.name, { limit: 1000 });

      for (const fbPrefix of feedbackPrefixes ?? []) {
        if (fbPrefix.id === null) {
          // List files in this feedback folder
          const folderPath = `${prefix.name}/${fbPrefix.name}`;
          const { data: files } = await supabase.storage
            .from("feedback-photos")
            .list(folderPath, { limit: 1000 });

          const toDelete = (files ?? [])
            .filter(
              (f) =>
                f.created_at !== null &&
                f.created_at !== undefined &&
                f.created_at < cutoffIso,
            )
            .map((f) => `${folderPath}/${f.name}`);

          if (toDelete.length > 0) {
            await supabase.storage.from("feedback-photos").remove(toDelete);
            photosDeleted += toDelete.length;
          }
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    retention: rpcResult,
    queued_photos_deleted: queuedPhotosDeleted,
    photos_deleted: photosDeleted,
  });
}

export const GET = POST;
