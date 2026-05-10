// One-off diagnostic for shift cash variance — V2.
// Usage: node --env-file=apps/web/.env.local apps/web/scripts/diagnose-cash-variance.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const fmt = (n) => Number(n ?? 0).toLocaleString("vi-VN");
const log = (...a) => console.log(...a);

log(`Project: ${url}`);

async function fetchAll(builder, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await builder().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}

// === A. Variance summary across ALL closed sessions, split by opening_cash. ===
const sess = await fetchAll(() =>
  sb
    .from("pos_sessions")
    .select("id, branch_id, opening_cash, expected_cash, closing_cash, cash_difference, opened_at, closed_at, status")
    .eq("status", "closed")
    .not("closed_at", "is", null),
);
{
  const num = (s) => Number(s.cash_difference ?? 0);
  const split = (rows) => ({
    n: rows.length,
    n_balanced: rows.filter((s) => num(s) === 0).length,
    n_over: rows.filter((s) => num(s) > 0).length,
    n_short: rows.filter((s) => num(s) < 0).length,
    total_diff: fmt(rows.reduce((a, s) => a + num(s), 0)),
    avg_diff: fmt(rows.length ? rows.reduce((a, s) => a + num(s), 0) / rows.length : 0),
    min_diff: fmt(rows.length ? Math.min(...rows.map(num)) : 0),
    max_diff: fmt(rows.length ? Math.max(...rows.map(num)) : 0),
  });

  const open0 = sess.filter((s) => Number(s.opening_cash) === 0);
  const openPos = sess.filter((s) => Number(s.opening_cash) > 0);

  log("\n=== A. Variance summary across ALL closed sessions ===");
  log(`Total closed sessions: ${sess.length}`);
  log("All sessions:");
  console.table([split(sess)]);
  log("Sessions with opening_cash = 0:");
  console.table([split(open0)]);
  log("Sessions with opening_cash > 0:");
  console.table([split(openPos)]);

  const worst = [...sess]
    .sort((a, b) => Math.abs(num(b)) - Math.abs(num(a)))
    .slice(0, 10);
  log("\nTop 10 sessions by |cash_difference|:");
  console.table(
    worst.map((s) => ({
      session_id: s.id,
      branch: s.branch_id,
      closed_at: s.closed_at,
      opening: fmt(s.opening_cash),
      expected: fmt(s.expected_cash),
      closing: fmt(s.closing_cash),
      diff: fmt(s.cash_difference),
    })),
  );

  const byBranch = new Map();
  for (const s of sess) {
    const b = s.branch_id ?? "NULL";
    const cur = byBranch.get(b) ?? { n: 0, total: 0, n_balanced: 0 };
    cur.n++;
    cur.total += num(s);
    if (num(s) === 0) cur.n_balanced++;
    byBranch.set(b, cur);
  }
  log("\nPer-branch totals:");
  console.table(
    [...byBranch].map(([b, v]) => ({
      branch_id: b,
      n_sessions: v.n,
      n_balanced: v.n_balanced,
      pct_balanced: ((v.n_balanced / v.n) * 100).toFixed(1) + "%",
      total_diff_VND: fmt(v.total),
      avg_diff_VND: fmt(v.total / v.n),
    })),
  );
}

// === B. Carry-over check — opening_cash[N] vs closing_cash[N-1] per branch ===
{
  const all = await fetchAll(() =>
    sb
      .from("pos_sessions")
      .select("id, branch_id, opening_cash, closing_cash, opened_at, closed_at, status")
      .order("branch_id", { ascending: true })
      .order("opened_at", { ascending: true }),
  );
  const byBranch = new Map();
  for (const s of all) {
    const arr = byBranch.get(s.branch_id) ?? [];
    arr.push(s);
    byBranch.set(s.branch_id, arr);
  }
  const carryIssues = [];
  for (const [, arr] of byBranch) {
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1];
      const cur = arr[i];
      if (prev.status !== "closed") continue;
      const prevClose = Number(prev.closing_cash ?? 0);
      const curOpen = Number(cur.opening_cash ?? 0);
      if (prevClose !== curOpen) {
        carryIssues.push({
          branch: cur.branch_id,
          prev_session: prev.id,
          prev_close_VND: fmt(prevClose),
          cur_session: cur.id,
          cur_open_VND: fmt(curOpen),
          delta_VND: fmt(curOpen - prevClose),
          gap_min: prev.closed_at && cur.opened_at
            ? Math.round((new Date(cur.opened_at) - new Date(prev.closed_at)) / 60000)
            : null,
        });
      }
    }
  }
  log(`\n=== B. Carry-over: opening_cash[N] vs closing_cash[N-1] (per branch) ===`);
  log(`Found ${carryIssues.length} mismatches.`);
  if (carryIssues.length) console.table(carryIssues.slice(0, 20));
}

// === C. Order status × payment_status × payment_method distribution (90d) ===
{
  const since = new Date(Date.now() - 90 * 86400e3).toISOString();
  const orders = await fetchAll(() =>
    sb
      .from("orders")
      .select("status, payment_status, payment_method, total_amount, created_at")
      .gte("created_at", since),
  );
  const dist = new Map();
  for (const o of orders) {
    const k = `${o.status} | ${o.payment_status} | ${o.payment_method ?? "NULL"}`;
    const cur = dist.get(k) ?? { n: 0, revenue: 0 };
    cur.n++;
    cur.revenue += Number(o.total_amount);
    dist.set(k, cur);
  }
  log("\n=== C. Order status × payment_status × payment_method (last 90d) ===");
  console.table(
    [...dist]
      .map(([k, v]) => ({ combo: k, n: v.n, revenue_VND: fmt(v.revenue) }))
      .sort((a, b) => b.n - a.n),
  );
}

// === D. Re-compute RPC formula across ALL closed sessions ===
{
  let nFormulaErrors = 0;
  let totalFormulaError = 0;
  const bad = [];

  for (const s of sess) {
    const orders = await fetchAll(() =>
      sb
        .from("orders")
        .select("id, total_amount, payment_method, payment_status, status")
        .eq("pos_session_id", s.id),
    );
    const rpcCash = orders
      .filter(
        (o) =>
          o.status !== "cancelled" &&
          o.payment_status === "paid" &&
          o.payment_method === "cash",
      )
      .reduce((a, o) => a + Number(o.total_amount), 0);
    const correctExpected = Number(s.opening_cash) + rpcCash;
    const formulaError = Number(s.expected_cash) - correctExpected;
    if (formulaError !== 0) {
      nFormulaErrors++;
      totalFormulaError += formulaError;
      bad.push({
        session_id: s.id,
        branch: s.branch_id,
        formula_error_VND: fmt(formulaError),
        stored_expected_VND: fmt(s.expected_cash),
        rpc_recomputed_VND: fmt(correctExpected),
      });
    }
  }
  log(`\n=== D. RPC re-computation across ALL ${sess.length} closed sessions ===`);
  log(
    `Sessions with formula_error ≠ 0: ${nFormulaErrors} / ${sess.length}; sum_formula_error = ${fmt(totalFormulaError)}`,
  );
  if (bad.length) {
    log("Top 10 sessions with non-zero formula_error:");
    console.table(
      bad
        .sort(
          (a, b) =>
            Math.abs(parseInt(b.formula_error_VND.replace(/\D/g, "")) || 0) -
            Math.abs(parseInt(a.formula_error_VND.replace(/\D/g, "")) || 0),
        )
        .slice(0, 10),
    );
  }
}

log("\nDone.");
