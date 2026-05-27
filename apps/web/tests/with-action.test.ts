import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  withAction,
  withActionPositional,
  type ActionContext,
} from "../app/_lib/with-action";

/**
 * Fake ActionContext suitable for handler bodies. The new helper paths
 * (`customAuth`, `afterSuccess`, `withActionPositional`) accept any ctx the
 * resolver returns; they never re-inspect Supabase. Tests construct a
 * minimal claims shape and cast — production callers wire the real
 * `getAuthContext` family from `app/_lib/auth.ts`, which is exercised by
 * existing e2e suites, not by these unit tests.
 */
function fakeCtx(overrides?: {
  role?: ActionContext["claims"]["user_role"];
  branch_id?: number | null;
}): ActionContext {
  return {
    supabase: {} as ActionContext["supabase"],
    user: {} as ActionContext["user"],
    claims: {
      user_role: overrides?.role ?? "owner",
      branch_id: overrides?.branch_id ?? null,
      tenant_id: 1,
    } as ActionContext["claims"],
  };
}

const sampleSchema = z.object({
  orderItemId: z.coerce
    .number()
    .int()
    .positive({ error: "Món không hợp lệ" }),
  reason: z.string().trim().min(5, { error: "Lý do tối thiểu 5 ký tự" }),
});

test("withAction returns validation failure when schema fails", async () => {
  const action = withAction(
    {
      schema: sampleSchema,
      customAuth: async () => fakeCtx(),
    },
    async () => ({ success: true }),
  );

  const result = await action({ orderItemId: 5, reason: "x" });
  assert.equal(result.success, false);
  assert.equal(result.error, "Lý do tối thiểu 5 ký tự");
});

test("withAction returns forbidden when customAuth returns null", async () => {
  const action = withAction(
    {
      schema: sampleSchema,
      customAuth: async () => null,
    },
    async () => ({ success: true }),
  );

  const result = await action({ orderItemId: 1, reason: "valid reason" });
  assert.equal(result.success, false);
  assert.equal(result.error, "Không có quyền");
});

test("withAction passes parsed data and ctx to handler on success", async () => {
  let seenData: unknown = null;
  let seenCtx: ActionContext | null = null;
  const ctx = fakeCtx({ role: "branch_manager", branch_id: 7 });

  const action = withAction(
    {
      schema: sampleSchema,
      customAuth: async () => ctx,
    },
    async (data, c) => {
      seenData = data;
      seenCtx = c;
      return { success: true, data: { ok: true } };
    },
  );

  const result = await action({ orderItemId: 42, reason: "valid reason" });
  assert.deepEqual(result, { success: true, data: { ok: true } });
  assert.deepEqual(seenData, { orderItemId: 42, reason: "valid reason" });
  assert.equal(seenCtx, ctx);
});

test("withAction fails closed when neither roles nor customAuth supplied", async () => {
  // Compile-time mistake: caller forgot both auth fields. Helper rejects
  // rather than allowing a wide-open action.
  const action = withAction(
    {
      schema: sampleSchema,
    },
    async () => ({ success: true }),
  );

  const result = await action({ orderItemId: 1, reason: "valid reason" });
  assert.equal(result.success, false);
  assert.equal(result.error, "Không có quyền");
});

test("withAction afterSuccess merges warning into result.meta", async () => {
  const action = withAction(
    {
      schema: sampleSchema,
      customAuth: async () => fakeCtx(),
      afterSuccess: async () => ({ warning: "máy in offline" }),
    },
    async () => ({ success: true, data: { id: 1 } }),
  );

  const result = await action({ orderItemId: 1, reason: "valid reason" });
  assert.equal(result.success, true);
  assert.deepEqual(result.data, { id: 1 });
  assert.deepEqual(result.meta, { warning: "máy in offline" });
});

test("withAction afterSuccess never flips success to false", async () => {
  let afterCalled = false;
  const action = withAction(
    {
      schema: sampleSchema,
      customAuth: async () => fakeCtx(),
      afterSuccess: async () => {
        afterCalled = true;
        return { warning: "non-fatal" };
      },
    },
    async () => ({ success: true }),
  );

  const result = await action({ orderItemId: 1, reason: "valid reason" });
  assert.equal(afterCalled, true);
  assert.equal(result.success, true);
});

test("withAction afterSuccess does not run on handler failure", async () => {
  let afterCalled = false;
  const action = withAction(
    {
      schema: sampleSchema,
      customAuth: async () => fakeCtx(),
      afterSuccess: async () => {
        afterCalled = true;
      },
    },
    async () => ({ success: false, error: "RPC failed" }),
  );

  const result = await action({ orderItemId: 1, reason: "valid reason" });
  assert.equal(afterCalled, false);
  assert.equal(result.success, false);
});

test("withAction afterSuccess returning undefined leaves meta untouched", async () => {
  const action = withAction(
    {
      schema: sampleSchema,
      customAuth: async () => fakeCtx(),
      // Returns void — common case for "best-effort side effect with no
      // warning to surface."
      afterSuccess: async () => undefined,
    },
    async () => ({ success: true, data: 42, meta: { existing: true } }),
  );

  const result = await action({ orderItemId: 1, reason: "valid reason" });
  assert.equal(result.success, true);
  assert.equal(result.data, 42);
  assert.deepEqual(result.meta, { existing: true });
});

test("withAction afterSuccess preserves existing meta keys", async () => {
  const action = withAction(
    {
      schema: sampleSchema,
      customAuth: async () => fakeCtx(),
      afterSuccess: async () => ({ warning: "hook warning" }),
    },
    async () => ({
      success: true,
      data: 1,
      meta: { traceId: "abc", auditId: 99 },
    }),
  );

  const result = await action({ orderItemId: 1, reason: "valid reason" });
  assert.deepEqual(result.meta, {
    traceId: "abc",
    auditId: 99,
    warning: "hook warning",
  });
});

test("withAction requireBranchScope skipped when customAuth is used", async () => {
  // The branch-scope guard belongs to the standard auth path. customAuth
  // resolvers own their own scope checks; the wrapper must NOT second-guess.
  // Confirm a branch_manager with null branch_id reaches the handler when
  // customAuth supplies it.
  let handlerRan = false;
  const action = withAction(
    {
      schema: sampleSchema,
      customAuth: async () =>
        fakeCtx({ role: "branch_manager", branch_id: null }),
      requireBranchScope: true,
    },
    async () => {
      handlerRan = true;
      return { success: true };
    },
  );

  const result = await action({ orderItemId: 1, reason: "valid reason" });
  assert.equal(handlerRan, true);
  assert.equal(result.success, true);
});

test("withActionPositional maps positional args through argsToInput", async () => {
  let seenData: unknown = null;
  const action = withActionPositional(
    {
      argsToInput: (orderItemId: number, reason: string) => ({
        orderItemId,
        reason,
      }),
      schema: sampleSchema,
      customAuth: async () => fakeCtx(),
    },
    async (data) => {
      seenData = data;
      return { success: true };
    },
  );

  const result = await action(42, "valid reason");
  assert.equal(result.success, true);
  assert.deepEqual(seenData, { orderItemId: 42, reason: "valid reason" });
});

test("withActionPositional validates the mapped input shape", async () => {
  const action = withActionPositional(
    {
      argsToInput: (orderItemId: number, reason: string) => ({
        orderItemId,
        reason,
      }),
      schema: sampleSchema,
      customAuth: async () => fakeCtx(),
    },
    async () => ({ success: true }),
  );

  const result = await action(42, "x"); // reason too short
  assert.equal(result.success, false);
  assert.equal(result.error, "Lý do tối thiểu 5 ký tự");
});

test("withActionPositional preserves the callable's positional signature", async () => {
  // Smoke check that the wrapper returns a function callable with the same
  // positional args the original Server Action would expose. POS code calls
  // `voidOrderItem(orderItemId, reason)` from client components — this
  // signature must not require object-input migration on the caller side.
  const action = withActionPositional(
    {
      argsToInput: (
        branchId: number,
        items: readonly number[],
        idempotencyKey?: string,
      ) => ({ branchId, items, idempotencyKey: idempotencyKey ?? null }),
      schema: z.object({
        branchId: z.number().int().positive(),
        items: z.array(z.number().int().positive()).min(1),
        idempotencyKey: z.string().nullable(),
      }),
      customAuth: async () => fakeCtx(),
    },
    async () => ({ success: true }),
  );

  const a = await action(1, [10, 20]); // omit optional arg
  const b = await action(1, [10, 20], "key-123"); // include optional arg

  assert.equal(a.success, true);
  assert.equal(b.success, true);
});

test("withActionPositional propagates afterSuccess warning", async () => {
  // Same merge semantics as withAction — verified separately because the
  // positional variant has its own internal call path.
  const action = withActionPositional(
    {
      argsToInput: (orderItemId: number, reason: string) => ({
        orderItemId,
        reason,
      }),
      schema: sampleSchema,
      customAuth: async () => fakeCtx(),
      afterSuccess: async () => ({ warning: "print queue offline" }),
    },
    async () => ({ success: true, data: { autoCancelled: true } }),
  );

  const result = await action(1, "valid reason");
  assert.deepEqual(result.meta, { warning: "print queue offline" });
});
