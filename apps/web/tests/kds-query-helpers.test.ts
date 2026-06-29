import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chunkNumbers,
  dedupeRowsById,
  fetchChunkedRows,
  fetchPagedRows,
  sortKdsTicketsNewestFirst,
} from "../app/(protected)/br/[branchId]/kds/_lib/query-helpers";
import type { KdsTicket } from "../app/(protected)/br/[branchId]/kds/types";

test("KDS query helpers chunk long ID lists without dropping IDs", () => {
  const chunks = chunkNumbers(Array.from({ length: 450 }, (_, i) => i + 1));

  assert.equal(chunks.length, 3);
  assert.deepEqual(
    chunks.map((chunk) => chunk.length),
    [200, 200, 50],
  );
  assert.deepEqual(
    chunks.flat(),
    Array.from({ length: 450 }, (_, i) => i + 1),
  );
});

test("KDS chunked row fetch combines every chunk result", async () => {
  const seenChunks: number[][] = [];
  const result = await fetchChunkedRows(
    Array.from({ length: 450 }, (_, i) => i + 1),
    async (ids) => {
      seenChunks.push(ids);
      return {
        data: ids.map((id) => ({ id, label: `row-${String(id)}` })),
        error: null,
      };
    },
  );

  assert.equal(result.error, null);
  assert.equal(result.data?.length, 450);
  assert.deepEqual(
    seenChunks.map((chunk) => chunk.length),
    [200, 200, 50],
  );
  assert.equal(result.data?.at(-1)?.label, "row-450");
});

test("KDS paged row fetch keeps requesting until a partial page", async () => {
  const rows = Array.from({ length: 1205 }, (_, i) => ({ id: i + 1 }));
  const requestedRanges: Array<[number, number]> = [];

  const result = await fetchPagedRows(async (from, to) => {
    requestedRanges.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  });

  assert.equal(result.error, null);
  assert.equal(result.data?.length, 1205);
  assert.deepEqual(requestedRanges, [
    [0, 499],
    [500, 999],
    [1000, 1499],
  ]);
});

test("KDS visible ticket merge dedupes rows and preserves stable newest-first order", () => {
  const baseTicket: KdsTicket = {
    id: 1,
    station_id: 1,
    order_id: 1,
    order_item_id: 1,
    kitchen_send_batch_id: null,
    status: "pending",
    bumped_at: null,
    created_at: "2026-05-25T10:00:00.000Z",
    updated_at: "2026-05-25T10:00:00.000Z",
  };
  const duplicate = { ...baseTicket, status: "preparing" };
  const sameTimeLaterId = { ...baseTicket, id: 2, order_id: 2 };
  const newest = {
    ...baseTicket,
    id: 3,
    order_id: 3,
    created_at: "2026-05-25T10:01:00.000Z",
  };

  const result = sortKdsTicketsNewestFirst(
    dedupeRowsById([baseTicket, sameTimeLaterId, duplicate, newest]),
  );

  assert.deepEqual(
    result.map((ticket) => [ticket.id, ticket.status]),
    [
      [3, "pending"],
      [2, "pending"],
      [1, "preparing"],
    ],
  );
});
