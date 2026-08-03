import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const container =
  process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_comtammatu-e2e";
const psqlArgs = [
  "exec",
  "-i",
  container,
  "psql",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-X",
  "-qAt",
  "-v",
  "ON_ERROR_STOP=1",
];

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runPsql(sql) {
  const result = spawnSync("docker", psqlArgs, {
    input: sql,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function startPsql(sql) {
  const child = spawn("docker", psqlArgs, {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.end(sql);

  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });

  return { child, done };
}

function assertSuccess(result, label) {
  if (result.status !== 0) {
    throw new Error(
      `${label} failed\n${result.stdout.trim()}\n${result.stderr.trim()}`,
    );
  }
}

async function waitForAdvisoryLock(lockKey) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = runPsql(`
      SELECT count(*)
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND granted
        AND classid = 0::oid
        AND objid = ${lockKey}::oid;
    `);
    assertSuccess(result, "advisory lock probe");
    if (result.stdout.trim() === "1") return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for advisory lock ${lockKey}`);
}

async function waitForBlockedSession(applicationName) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = runPsql(`
      SELECT count(*)
      FROM pg_stat_activity
      WHERE application_name = ${sqlLiteral(applicationName)}
        AND state = 'active'
        AND wait_event_type = 'Lock';
    `);
    assertSuccess(result, "blocked session probe");
    if (result.stdout.trim() === "1") return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for blocked session ${applicationName}`);
}

function waitForCompletion(session, label) {
  let timeout;
  const timedOut = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      session.child.kill("SIGKILL");
      reject(new Error(`${label} timed out`));
    }, 20_000);
  });
  return Promise.race([session.done, timedOut]).finally(() => {
    clearTimeout(timeout);
  });
}

function serviceMatchSql(eventId, applicationName, lockKey = null) {
  return `
    BEGIN;
    SET LOCAL application_name = ${sqlLiteral(applicationName)};
    SET LOCAL statement_timeout = '15s';
    SELECT set_config('request.jwt.claim.role', 'service_role', true);
    SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
    SELECT public.match_sepay_transfer_intent_event(${eventId});
    ${
      lockKey === null
        ? ""
        : `SELECT pg_advisory_xact_lock(${lockKey});\nSELECT pg_sleep(5);`
    }
    COMMIT;
  `;
}

function ownerCancelSql({
  expenseId,
  ownerId,
  tenantId,
  applicationName,
  lockKey = null,
}) {
  return `
    BEGIN;
    SET LOCAL application_name = ${sqlLiteral(applicationName)};
    SET LOCAL statement_timeout = '15s';
    SELECT set_config('request.jwt.claim.sub', ${sqlLiteral(ownerId)}, true);
    SELECT set_config('request.jwt.claim.role', 'authenticated', true);
    SELECT set_config(
      'request.jwt.claims',
      jsonb_build_object(
        'sub', ${sqlLiteral(ownerId)},
        'role', 'authenticated',
        'app_metadata', jsonb_build_object('tenant_id', ${tenantId})
      )::text,
      true
    );
    SELECT public.cancel_expense(${expenseId});
    ${
      lockKey === null
        ? ""
        : `SELECT pg_advisory_xact_lock(${lockKey});\nSELECT pg_sleep(5);`
    }
    COMMIT;
  `;
}

async function runRace({
  holderEventId,
  contenderEventId,
  lockKey,
  contenderShouldFail,
}) {
  const holderApplicationName = `transfer-intent-holder-${lockKey}`;
  const contenderApplicationName = `transfer-intent-contender-${lockKey}`;
  const holder = startPsql(
    serviceMatchSql(holderEventId, holderApplicationName, lockKey),
  );
  let contender;
  let completions;
  try {
    await waitForAdvisoryLock(lockKey);
    contender = startPsql(
      serviceMatchSql(contenderEventId, contenderApplicationName),
    );
    completions = [
      waitForCompletion(holder, "race holder"),
      waitForCompletion(contender, "race contender"),
    ];
    await waitForBlockedSession(contenderApplicationName);
  } catch (error) {
    holder.child.kill("SIGKILL");
    contender?.child.kill("SIGKILL");
    if (completions) await Promise.allSettled(completions);
    throw error;
  }

  const [holderResult, contenderResult] = await Promise.all(completions);

  assertSuccess(holderResult, "race holder");
  if (contenderShouldFail) {
    if (
      contenderResult.status === 0 ||
      !contenderResult.stderr.includes("expense_already_matched")
    ) {
      throw new Error(
        `contender did not fail closed\n${contenderResult.stdout.trim()}\n${contenderResult.stderr.trim()}`,
      );
    }
  } else {
    assertSuccess(contenderResult, "same-event contender");
  }
}

async function runCancelRace({ fixture, cancelWins, lockKey }) {
  const holderApplicationName = `expense-cancel-holder-${lockKey}`;
  const contenderApplicationName = `expense-cancel-contender-${lockKey}`;
  const cancelSql = ownerCancelSql({
    expenseId: fixture.expenseId,
    ownerId: fixture.ownerId,
    tenantId: fixture.tenantId,
    applicationName: cancelWins
      ? holderApplicationName
      : contenderApplicationName,
    lockKey: cancelWins ? lockKey : null,
  });
  const matchSql = serviceMatchSql(
    fixture.eventId,
    cancelWins ? contenderApplicationName : holderApplicationName,
    cancelWins ? null : lockKey,
  );
  const holder = startPsql(cancelWins ? cancelSql : matchSql);
  let contender;
  let completions;
  try {
    await waitForAdvisoryLock(lockKey);
    contender = startPsql(cancelWins ? matchSql : cancelSql);
    completions = [
      waitForCompletion(holder, "cancel race holder"),
      waitForCompletion(contender, "cancel race contender"),
    ];
    await waitForBlockedSession(contenderApplicationName);
  } catch (error) {
    holder.child.kill("SIGKILL");
    contender?.child.kill("SIGKILL");
    if (completions) await Promise.allSettled(completions);
    throw error;
  }

  const [holderResult, contenderResult] = await Promise.all(completions);
  assertSuccess(holderResult, "cancel race holder");
  if (cancelWins) {
    assertSuccess(contenderResult, "match after cancel");
  } else if (
    contenderResult.status === 0 ||
    !contenderResult.stderr.includes("expense_already_matched")
  ) {
    throw new Error(
      `cancel after match did not fail closed\n${contenderResult.stdout.trim()}\n${contenderResult.stderr.trim()}`,
    );
  }
}

const suffix = randomUUID().replaceAll("-", "");
const setup = runPsql(`
  BEGIN;
  CREATE TEMP TABLE transfer_intent_race_fixture (
    owner_id uuid NOT NULL,
    tenant_id bigint NOT NULL,
    same_expense_id bigint NOT NULL,
    same_event_id bigint NOT NULL,
    conflict_expense_id bigint NOT NULL,
    conflict_event_a_id bigint NOT NULL,
    conflict_event_b_id bigint NOT NULL,
    match_wins_expense_id bigint NOT NULL,
    match_wins_event_id bigint NOT NULL,
    cancel_wins_expense_id bigint NOT NULL,
    cancel_wins_event_id bigint NOT NULL
  ) ON COMMIT DROP;

  DO $$
  DECLARE
    v_owner uuid;
    v_tenant_id bigint;
    v_branch_id bigint;
    v_same_expense_id bigint;
    v_same_content text;
    v_same_event_id bigint;
    v_conflict_expense_id bigint;
    v_conflict_content text;
    v_conflict_event_a_id bigint;
    v_conflict_event_b_id bigint;
    v_match_wins_expense_id bigint;
    v_match_wins_content text;
    v_match_wins_event_id bigint;
    v_cancel_wins_expense_id bigint;
    v_cancel_wins_content text;
    v_cancel_wins_event_id bigint;
  BEGIN
    SELECT profile.id, profile.tenant_id
    INTO v_owner, v_tenant_id
    FROM public.profiles profile
    JOIN public.positions position
      ON position.id = profile.position_id
     AND position.tenant_id = profile.tenant_id
    WHERE position.code = 'owner'
      AND COALESCE(profile.is_active, true)
    ORDER BY profile.id
    LIMIT 1;

    SELECT branch.id
    INTO v_branch_id
    FROM public.branches branch
    WHERE branch.tenant_id = v_tenant_id
    ORDER BY branch.id
    LIMIT 1;

    IF v_owner IS NULL OR v_tenant_id IS NULL OR v_branch_id IS NULL THEN
      RAISE EXCEPTION 'finance_transfer_intent_race_seed_missing';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config(
      'request.jwt.claims',
      jsonb_build_object(
        'sub', v_owner::text,
        'role', 'authenticated',
        'app_metadata', jsonb_build_object('tenant_id', v_tenant_id)
      )::text,
      true
    );

    SELECT result.expense_id, result.transfer_content
    INTO v_same_expense_id, v_same_content
    FROM public.create_expense_transfer_intent(
      v_branch_id,
      '2099-12-31'::date,
      'utilities',
      jsonb_build_array(jsonb_build_object(
        'vat_rate', 0,
        'taxable_amount', 100001,
        'vat_amount', 0
      )),
      'Race same event',
      NULL
    ) result;

    SELECT result.expense_id, result.transfer_content
    INTO v_conflict_expense_id, v_conflict_content
    FROM public.create_expense_transfer_intent(
      v_branch_id,
      '2099-12-31'::date,
      'utilities',
      jsonb_build_array(jsonb_build_object(
        'vat_rate', 0,
        'taxable_amount', 100002,
        'vat_amount', 0
      )),
      'Race conflicting events',
      NULL
    ) result;

    INSERT INTO public.webhook_events (
      tenant_id,
      provider,
      request_id,
      signature_valid,
      payload,
      processing_status,
      created_at
    ) VALUES (
      v_tenant_id,
      'sepay',
      ${sqlLiteral(`same-${suffix}`)},
      true,
      jsonb_build_object(
        'transferType', 'out',
        'transferAmount', 100001,
        'content', 'BANK ' || v_same_content || ' DONE'
      ),
      'received',
      '2099-12-31 12:00:00+07'::timestamptz
    )
    RETURNING id INTO v_same_event_id;

    INSERT INTO public.webhook_events (
      tenant_id,
      provider,
      request_id,
      signature_valid,
      payload,
      processing_status,
      created_at
    ) VALUES (
      v_tenant_id,
      'sepay',
      ${sqlLiteral(`conflict-a-${suffix}`)},
      true,
      jsonb_build_object(
        'transferType', 'out',
        'transferAmount', 100002,
        'content', 'BANK ' || v_conflict_content || ' DONE'
      ),
      'received',
      '2099-12-31 12:00:01+07'::timestamptz
    )
    RETURNING id INTO v_conflict_event_a_id;

    INSERT INTO public.webhook_events (
      tenant_id,
      provider,
      request_id,
      signature_valid,
      payload,
      processing_status,
      created_at
    ) VALUES (
      v_tenant_id,
      'sepay',
      ${sqlLiteral(`conflict-b-${suffix}`)},
      true,
      jsonb_build_object(
        'transferType', 'out',
        'transferAmount', 100002,
        'content', 'BANK ' || v_conflict_content || ' DONE'
      ),
      'received',
      '2099-12-31 12:00:02+07'::timestamptz
    )
    RETURNING id INTO v_conflict_event_b_id;

    SELECT result.expense_id, result.transfer_content
    INTO v_match_wins_expense_id, v_match_wins_content
    FROM public.create_expense_transfer_intent(
      v_branch_id,
      '2099-12-31'::date,
      'utilities',
      jsonb_build_array(jsonb_build_object(
        'vat_rate', 0,
        'taxable_amount', 100003,
        'vat_amount', 0
      )),
      'Race match wins',
      NULL
    ) result;

    INSERT INTO public.webhook_events (
      tenant_id,
      provider,
      request_id,
      signature_valid,
      payload,
      processing_status,
      created_at
    ) VALUES (
      v_tenant_id,
      'sepay',
      ${sqlLiteral(`match-wins-${suffix}`)},
      true,
      jsonb_build_object(
        'transferType', 'out',
        'transferAmount', 100003,
        'content', 'BANK ' || v_match_wins_content || ' DONE'
      ),
      'received',
      '2099-12-31 12:00:03+07'::timestamptz
    )
    RETURNING id INTO v_match_wins_event_id;

    SELECT result.expense_id, result.transfer_content
    INTO v_cancel_wins_expense_id, v_cancel_wins_content
    FROM public.create_expense_transfer_intent(
      v_branch_id,
      '2099-12-31'::date,
      'utilities',
      jsonb_build_array(jsonb_build_object(
        'vat_rate', 0,
        'taxable_amount', 100004,
        'vat_amount', 0
      )),
      'Race cancel wins',
      NULL
    ) result;

    INSERT INTO public.webhook_events (
      tenant_id,
      provider,
      request_id,
      signature_valid,
      payload,
      processing_status,
      created_at
    ) VALUES (
      v_tenant_id,
      'sepay',
      ${sqlLiteral(`cancel-wins-${suffix}`)},
      true,
      jsonb_build_object(
        'transferType', 'out',
        'transferAmount', 100004,
        'content', 'BANK ' || v_cancel_wins_content || ' DONE'
      ),
      'received',
      '2099-12-31 12:00:04+07'::timestamptz
    )
    RETURNING id INTO v_cancel_wins_event_id;

    INSERT INTO transfer_intent_race_fixture VALUES (
      v_owner,
      v_tenant_id,
      v_same_expense_id,
      v_same_event_id,
      v_conflict_expense_id,
      v_conflict_event_a_id,
      v_conflict_event_b_id,
      v_match_wins_expense_id,
      v_match_wins_event_id,
      v_cancel_wins_expense_id,
      v_cancel_wins_event_id
    );
  END;
  $$;

  SELECT json_build_object(
    'ownerId', owner_id,
    'tenantId', tenant_id,
    'sameExpenseId', same_expense_id,
    'sameEventId', same_event_id,
    'conflictExpenseId', conflict_expense_id,
    'conflictEventAId', conflict_event_a_id,
    'conflictEventBId', conflict_event_b_id,
    'matchWinsExpenseId', match_wins_expense_id,
    'matchWinsEventId', match_wins_event_id,
    'cancelWinsExpenseId', cancel_wins_expense_id,
    'cancelWinsEventId', cancel_wins_event_id
  )
  FROM transfer_intent_race_fixture;
  COMMIT;
`);
assertSuccess(setup, "race fixture setup");

const fixtureLine = setup.stdout
  .trim()
  .split(/\r?\n/)
  .findLast((line) => line.trim().startsWith("{"));
if (!fixtureLine) throw new Error("race fixture setup returned no fixture");
const fixture = JSON.parse(fixtureLine);

await runRace({
  holderEventId: fixture.sameEventId,
  contenderEventId: fixture.sameEventId,
  lockKey: 1_100_000_000 + Math.floor(Math.random() * 100_000_000),
  contenderShouldFail: false,
});

await runRace({
  holderEventId: fixture.conflictEventAId,
  contenderEventId: fixture.conflictEventBId,
  lockKey: 1_300_000_000 + Math.floor(Math.random() * 100_000_000),
  contenderShouldFail: true,
});

await runCancelRace({
  fixture: {
    ownerId: fixture.ownerId,
    tenantId: fixture.tenantId,
    expenseId: fixture.matchWinsExpenseId,
    eventId: fixture.matchWinsEventId,
  },
  cancelWins: false,
  lockKey: 1_500_000_000 + Math.floor(Math.random() * 100_000_000),
});

await runCancelRace({
  fixture: {
    ownerId: fixture.ownerId,
    tenantId: fixture.tenantId,
    expenseId: fixture.cancelWinsExpenseId,
    eventId: fixture.cancelWinsEventId,
  },
  cancelWins: true,
  lockKey: 1_700_000_000 + Math.floor(Math.random() * 100_000_000),
});

const invariant = runPsql(`
  SELECT json_build_object(
    'sameMatchCount', (
      SELECT count(*)
      FROM public.bank_transaction_expense_matches
      WHERE expense_id = ${fixture.sameExpenseId}
    ),
    'conflictMatchCount', (
      SELECT count(*)
      FROM public.bank_transaction_expense_matches
      WHERE expense_id = ${fixture.conflictExpenseId}
    ),
    'sameProcessed', (
      SELECT processing_status = 'processed'
      FROM public.webhook_events
      WHERE id = ${fixture.sameEventId}
    ),
    'conflictProcessedCount', (
      SELECT count(*)
      FROM public.webhook_events
      WHERE id IN (
        ${fixture.conflictEventAId},
        ${fixture.conflictEventBId}
      )
        AND processing_status = 'processed'
    ),
    'matchWinsExpenseExists', EXISTS (
      SELECT 1
      FROM public.expenses
      WHERE id = ${fixture.matchWinsExpenseId}
    ),
    'matchWinsMatchCount', (
      SELECT count(*)
      FROM public.bank_transaction_expense_matches
      WHERE expense_id = ${fixture.matchWinsExpenseId}
    ),
    'cancelWinsExpenseExists', EXISTS (
      SELECT 1
      FROM public.expenses
      WHERE id = ${fixture.cancelWinsExpenseId}
    ),
    'cancelWinsMatchCount', (
      SELECT count(*)
      FROM public.bank_transaction_expense_matches
      WHERE expense_id = ${fixture.cancelWinsExpenseId}
    ),
    'cancelWinsAuditCount', (
      SELECT count(*)
      FROM public.audit_logs
      WHERE entity_type = 'expense'
        AND entity_id = ${fixture.cancelWinsExpenseId}
        AND action = 'cancel'
    )
  );
`);
assertSuccess(invariant, "race invariant query");
const state = JSON.parse(invariant.stdout.trim());
if (
  state.sameMatchCount !== 1 ||
  state.conflictMatchCount !== 1 ||
  state.sameProcessed !== true ||
  state.conflictProcessedCount !== 1 ||
  state.matchWinsExpenseExists !== true ||
  state.matchWinsMatchCount !== 1 ||
  state.cancelWinsExpenseExists !== false ||
  state.cancelWinsMatchCount !== 0 ||
  state.cancelWinsAuditCount !== 1
) {
  throw new Error(`race invariant failed: ${JSON.stringify(state)}`);
}

process.stdout.write("finance-transfer-intent-race: ok\n");
