import assert from "node:assert/strict";
import { test } from "node:test";
import {
  includesAny,
  mapRpcError,
  type RpcErrorMapping,
} from "../app/_lib/rpc-error-map";

const fallback = {
  userMessage: "Không thể xử lý. Vui lòng thử lại.",
  errorCode: "test.fallback",
} as const;

test("mapRpcError returns first matching mapping", () => {
  const mappings: readonly RpcErrorMapping[] = [
    {
      match: (m) => m.includes("forbidden"),
      errorCode: "test.forbidden",
      userMessage: "Cần quyền.",
    },
    {
      match: (m) => m.includes("voidable"),
      errorCode: "test.voidable",
      userMessage: "Không thể hủy.",
    },
  ];

  const result = mapRpcError({ message: "RLS forbidden" }, mappings, fallback);
  assert.equal(result.success, false);
  assert.equal(result.error, "Cần quyền.");
  assert.equal(result.errorCode, "test.forbidden");
});

test("mapRpcError lowercases the message once before matching", () => {
  // Predicates receive a pre-lowercased string, so callers can use plain
  // `.includes("forbidden")` without re-lowercasing.
  const mappings: readonly RpcErrorMapping[] = [
    {
      match: (m) => m.includes("permission denied"),
      errorCode: "test.permdenied",
      userMessage: "Permission denied.",
    },
  ];

  const result = mapRpcError(
    { message: "PERMISSION DENIED for relation orders" },
    mappings,
    fallback,
  );
  assert.equal(result.errorCode, "test.permdenied");
});

test("mapRpcError falls back when no mapping matches", () => {
  const mappings: readonly RpcErrorMapping[] = [
    {
      match: (m) => m.includes("forbidden"),
      errorCode: "test.forbidden",
      userMessage: "Cần quyền.",
    },
  ];

  const result = mapRpcError({ message: "unknown rpc error" }, mappings, fallback);
  assert.equal(result.success, false);
  assert.equal(result.error, fallback.userMessage);
  assert.equal(result.errorCode, "test.fallback");
});

test("mapRpcError fallback defaults errorCode to rpc_unknown", () => {
  const result = mapRpcError(
    { message: "totally unknown" },
    [],
    { userMessage: "Lỗi không xác định" },
  );
  assert.equal(result.errorCode, "rpc_unknown");
});

test("mapRpcError tolerates null/undefined message", () => {
  const mappings: readonly RpcErrorMapping[] = [
    {
      match: (m) => m === "",
      errorCode: "test.empty",
      userMessage: "Empty.",
    },
  ];

  const r1 = mapRpcError({ message: null }, mappings, fallback);
  assert.equal(r1.errorCode, "test.empty");

  const r2 = mapRpcError({}, mappings, fallback);
  assert.equal(r2.errorCode, "test.empty");
});

test("mapRpcError preserves first-match ordering", () => {
  // If two predicates would both match, the earlier mapping wins.
  // Authors order mappings most-specific first.
  const mappings: readonly RpcErrorMapping[] = [
    {
      match: (m) => m.includes("tenant"),
      errorCode: "test.tenant",
      userMessage: "Tenant.",
    },
    {
      match: (m) => m.includes("denied"),
      errorCode: "test.denied",
      userMessage: "Denied.",
    },
  ];

  const result = mapRpcError(
    { message: "tenant mismatch: permission denied" },
    mappings,
    fallback,
  );
  assert.equal(result.errorCode, "test.tenant");
});

test("mapRpcError passes Postgres error.code to predicates", () => {
  // Mappings can match on .code instead of (or alongside) .message — used by
  // submitOrder to detect 55P03 (advisory lock contention) and 42501
  // (stale RPC grant insufficient_privilege) which arrive with stable codes
  // even when the message text varies.
  const mappings: readonly RpcErrorMapping[] = [
    {
      match: (_msg, code) => code === "55P03",
      errorCode: "db.lock",
      userMessage: "Đang có giao dịch khác.",
    },
    {
      match: (msg, code) => code === "42501" || msg.includes("42501"),
      errorCode: "db.privilege",
      userMessage: "Không có quyền (hệ thống).",
    },
  ];

  const lock = mapRpcError(
    { message: "could not obtain lock on relation", code: "55P03" },
    mappings,
    fallback,
  );
  assert.equal(lock.errorCode, "db.lock");

  const privilege = mapRpcError(
    { message: "permission denied for table orders", code: "42501" },
    mappings,
    fallback,
  );
  assert.equal(privilege.errorCode, "db.privilege");

  // Message-based 42501 (some clients carry it in message even with no .code)
  const privilegeViaMsg = mapRpcError(
    { message: "ERROR: 42501 — permission denied", code: null },
    mappings,
    fallback,
  );
  assert.equal(privilegeViaMsg.errorCode, "db.privilege");
});

test("mapRpcError predicates may ignore the code arg (backward compat)", () => {
  // 1-arg predicates that ignore the code arg must keep working.
  const mappings: readonly RpcErrorMapping[] = [
    {
      match: (msg) => msg.includes("forbidden"),
      errorCode: "test.forbidden",
      userMessage: "Cần quyền.",
    },
  ];

  const result = mapRpcError(
    { message: "RLS forbidden", code: "42501" },
    mappings,
    fallback,
  );
  assert.equal(result.errorCode, "test.forbidden");
});

test("includesAny matches when any needle is present", () => {
  const predicate = includesAny("forbidden", "permission denied");
  assert.equal(predicate("rls forbidden on table"), true);
  assert.equal(predicate("permission denied for ..."), true);
  assert.equal(predicate("totally unrelated"), false);
});

test("includesAny treats needles case-insensitively", () => {
  // Predicate sees the already-lowercased message, but author may pass
  // mixed-case needles — `includesAny` lowercases needles up front so both
  // sides converge.
  const predicate = includesAny("Forbidden", "PERMISSION");
  assert.equal(predicate("rls forbidden"), true);
  assert.equal(predicate("permission ..."), true);
});

test("includesAny with empty needle list returns false", () => {
  const predicate = includesAny();
  assert.equal(predicate("anything"), false);
});
