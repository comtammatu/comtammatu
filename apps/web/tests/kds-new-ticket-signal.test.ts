import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  KDS_NEW_TICKET_SIGNAL_MS,
  getKdsNewTicketSignalClass,
  selectKdsNewTicketSignalIds,
} from "../app/(protected)/br/[branchId]/kds/_hooks/use-kds-new-ticket-signal";

const read = (relPath: string) =>
  readFileSync(join(process.cwd(), relPath), "utf8");

const realtimeSource = read(
  "app/(protected)/br/[branchId]/kds/_hooks/use-kds-realtime.ts",
);
const boardSource = read("app/(protected)/br/[branchId]/kds/kds-board.tsx");
const orderGridSource = read(
  "app/(protected)/br/[branchId]/kds/_components/order-grid.tsx",
);
const focusViewSource = read(
  "app/(protected)/br/[branchId]/kds/_components/focus-view.tsx",
);

test("realtime INSERT signals a genuinely new, still-visible ticket", () => {
  const added = selectKdsNewTicketSignalIds({
    insertedTicketIds: [42],
    visibleTicketIds: new Set([42, 7]),
    activeSignalIds: new Set(),
  });
  assert.deepEqual(added, [42]);
});

test("no insert event → no signal (snapshot / reconnect / poll / visibility / filter / station / mode / ready-removal)", () => {
  // Every non-INSERT path drains an empty buffer, even when the board gains a
  // never-before-seen ticket via a snapshot refresh.
  const added = selectKdsNewTicketSignalIds({
    insertedTicketIds: [],
    visibleTicketIds: new Set([1, 2, 3, 99]),
    activeSignalIds: new Set(),
  });
  assert.deepEqual(added, []);
});

test("inserted id no longer visible is not signalled", () => {
  const added = selectKdsNewTicketSignalIds({
    insertedTicketIds: [50],
    visibleTicketIds: new Set([1, 2]),
    activeSignalIds: new Set(),
  });
  assert.deepEqual(added, []);
});

test("one-shot: an already-signalling id is not re-signalled", () => {
  const added = selectKdsNewTicketSignalIds({
    insertedTicketIds: [8],
    visibleTicketIds: new Set([8]),
    activeSignalIds: new Set([8]),
  });
  assert.deepEqual(added, []);
});

test("duplicate inserted ids collapse to a single signal", () => {
  const added = selectKdsNewTicketSignalIds({
    insertedTicketIds: [11, 11, 12],
    visibleTicketIds: new Set([11, 12]),
    activeSignalIds: new Set(),
  });
  assert.deepEqual(added, [11, 12]);
});

test("signal class is a § G one-shot content enter: fade + narrow ring, duration-150, no loop or slide", () => {
  const cls = getKdsNewTicketSignalClass();
  assert.match(cls, /motion-safe:animate-in/);
  assert.match(cls, /motion-safe:fade-in/);
  assert.match(cls, /motion-safe:duration-150/);
  assert.match(cls, /ring-info\//);
  assert.doesNotMatch(cls, /duration-300/);
  assert.doesNotMatch(cls, /slide-in/);
  assert.doesNotMatch(cls, /transition-all/);
  assert.doesNotMatch(cls, /animate-pulse/);
  assert.ok(Number.isFinite(KDS_NEW_TICKET_SIGNAL_MS));
  assert.ok(KDS_NEW_TICKET_SIGNAL_MS > 0);
});

test("realtime hook records inserted ids from the INSERT branch only", () => {
  // The provable source: exactly one push, tied to the INSERT payload's
  // newTicket, and never to an UPDATE (`updated`) or DELETE (`deleted`) row.
  const pushMatches = realtimeSource.match(
    /insertedTicketIdsRef\.current\.push\(/g,
  );
  assert.equal(pushMatches?.length, 1);
  assert.match(
    realtimeSource,
    /insertedTicketIdsRef\.current\.push\(newTicket\.id\)/,
  );
  assert.doesNotMatch(
    realtimeSource,
    /insertedTicketIdsRef\.current\.push\(updated\.id\)/,
  );
  assert.doesNotMatch(
    realtimeSource,
    /insertedTicketIdsRef\.current\.push\(deleted\.id\)/,
  );
  assert.match(
    realtimeSource,
    /consumeRealtimeInsertedTicketIds: \(\) => readonly number\[\]/,
  );
  // refreshBoardSnapshot replaces state wholesale and must not fill the buffer.
  assert.match(realtimeSource, /setTickets\(nextTickets\)/);
});

test("board wires the signal hook off the realtime drain and provides it", () => {
  assert.match(boardSource, /useKdsNewTicketSignal\(\{/);
  assert.match(
    boardSource,
    /consumeInsertedTicketIds: consumeRealtimeInsertedTicketIds/,
  );
  assert.match(
    boardSource,
    /<KdsNewTicketSignalProvider value=\{newTicketSignalIds\}>/,
  );
});

test("both render surfaces consume the signal and apply the enter class", () => {
  assert.match(orderGridSource, /useKdsNewTicketSignalIds\(\)/);
  assert.match(orderGridSource, /getKdsNewTicketSignalClass\(\)/);
  assert.match(focusViewSource, /useKdsNewTicketSignalIds\(\)/);
  assert.match(focusViewSource, /getKdsNewTicketSignalClass\(\)/);
});
