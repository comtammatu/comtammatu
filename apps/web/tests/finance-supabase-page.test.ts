import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAllPagedRows } from "../app/(protected)/finance/_lib/supabase-page";

test("finance valuation reads page past the 1000-row PostgREST default", async () => {
  const rows = Array.from({ length: 2223 }, (_, index) => ({ id: index + 1 }));
  const requestedRanges: Array<[number, number]> = [];

  const result = await fetchAllPagedRows(async (from, to) => {
    requestedRanges.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  });

  assert.equal(result.error, null);
  assert.equal(result.data?.length, 2223);
  assert.deepEqual(requestedRanges, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
});
