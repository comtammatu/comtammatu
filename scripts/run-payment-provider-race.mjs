#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const CASHIER_ID = "a0000004-0000-4000-8000-000000000004";
const DB_PORT = process.env["E2E_DB_PORT"];
const RUN_ID = randomBytes(4).toString("hex");
const FIXTURE_PREFIX = `PAYRACE-${RUN_ID}`;
const sessions = [];

function command(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 30_000,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout || ""}${result.stderr || ""}`,
    );
  }
  return (result.stdout || "").trim();
}

function findLocalDatabaseContainer() {
  if (!DB_PORT || !/^\d{4,5}$/.test(DB_PORT)) {
    throw new Error(
      "Set E2E_DB_PORT to the published port of the local Supabase database.",
    );
  }
  for (const key of ["DATABASE_URL", "SUPABASE_DB_URL", "PGHOST", "PGPORT"]) {
    if (process.env[key]) {
      throw new Error(
        `${key} is set; this harness only accepts a discovered local Docker database.`,
      );
    }
  }

  const endpoint = JSON.parse(
    command("docker", [
      "context",
      "inspect",
      "--format",
      "{{json .Endpoints.docker.Host}}",
    ]),
  );
  if (typeof endpoint !== "string" || !endpoint.startsWith("unix://")) {
    throw new Error(`Refusing non-local Docker endpoint: ${String(endpoint)}`);
  }

  const portPattern = new RegExp(
    `(?:^|[\\s,])(?:127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::\\]):${DB_PORT}->5432/tcp`,
  );
  const matches = command("docker", [
    "ps",
    "--format",
    "{{.Names}}\t{{.Ports}}",
  ])
    .split("\n")
    .filter((line) => portPattern.test(line));
  if (matches.length !== 1) {
    throw new Error(
      `Expected one local database container on port ${DB_PORT}; found ${matches.length}.`,
    );
  }

  const container = matches[0].split("\t", 1)[0];
  if (!container?.startsWith("supabase_db_")) {
    throw new Error(
      `Refusing non-Supabase database container: ${container || "unknown"}`,
    );
  }
  const project = command("docker", [
    "inspect",
    container,
    "--format",
    '{{ index .Config.Labels "com.supabase.cli.project" }}',
  ]);
  if (project !== "comtammatu-e2e") {
    throw new Error(
      `Refusing Docker project ${project || "without Supabase label"}.`,
    );
  }
  return container;
}

const container = findLocalDatabaseContainer();

function psql(sql) {
  return command(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-q",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: sql },
  );
}

function openSession(name) {
  const process = spawn(
    "docker",
    [
      "exec",
      "-i",
      "-e",
      `PGAPPNAME=${name}`,
      container,
      "psql",
      "-X",
      "-q",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const session = { name, process, stdout: "", stderr: "", waiters: [] };
  sessions.push(session);

  const settleWaiters = () => {
    for (const waiter of [...session.waiters]) {
      if (session.stdout.includes(waiter.marker)) {
        clearTimeout(waiter.timer);
        session.waiters.splice(session.waiters.indexOf(waiter), 1);
        waiter.resolve();
      }
    }
  };
  process.stdout.on("data", (chunk) => {
    session.stdout += chunk.toString();
    settleWaiters();
  });
  process.stderr.on("data", (chunk) => {
    session.stderr += chunk.toString();
  });
  process.on("exit", (code) => {
    for (const waiter of session.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(
        new Error(
          `${name} exited with ${code} before ${waiter.marker}\n${session.stdout}${session.stderr}`,
        ),
      );
    }
  });
  return session;
}

function send(session, sql) {
  session.process.stdin.write(`${sql}\n`);
}

function waitFor(session, marker, timeoutMs = 15_000) {
  if (session.stdout.includes(marker)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const waiter = {
      marker,
      resolve,
      reject,
      timer: setTimeout(() => {
        session.waiters.splice(session.waiters.indexOf(waiter), 1);
        reject(
          new Error(
            `${session.name} timed out waiting for ${marker}\n${session.stdout}${session.stderr}`,
          ),
        );
      }, timeoutMs),
    };
    session.waiters.push(waiter);
  });
}

async function waitForBlock(blockedName, blockerName) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const edge = psql(`
      SELECT blocked.pid::text || '<-' || blocker.pid::text
      FROM pg_stat_activity blocked
      CROSS JOIN LATERAL unnest(pg_blocking_pids(blocked.pid)) AS waiting(blocker_pid)
      JOIN pg_stat_activity blocker ON blocker.pid = waiting.blocker_pid
      WHERE blocked.application_name = '${blockedName}'
        AND blocker.application_name = '${blockerName}'
      LIMIT 1;
    `);
    if (edge) return edge;
    await delay(25);
  }
  throw new Error(
    `No pg_blocking_pids edge observed: ${blockedName} <- ${blockerName}`,
  );
}

function authSettings(tenantId, branchId) {
  const claims = JSON.stringify({
    sub: CASHIER_ID,
    role: "authenticated",
    app_metadata: { tenant_id: tenantId, branch_id: branchId },
  });
  return `
    SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub', '${CASHIER_ID}', true);
    SELECT set_config('request.jwt.claim.role', 'authenticated', true);
    SELECT set_config('request.jwt.claims', '${claims}', true);
  `;
}

function serviceSettings() {
  return `
    SET LOCAL ROLE service_role;
    DO $claims$
    BEGIN
      PERFORM set_config('request.jwt.claim.sub', '', true);
      PERFORM set_config('request.jwt.claim.role', 'service_role', true);
      PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    END
    $claims$;
  `;
}

async function closeSessions() {
  await Promise.all(
    sessions.map(async (session) => {
      if (session.process.exitCode !== null) return;
      const exited = once(session.process, "exit");
      session.process.stdin.end("ROLLBACK;\n\\q\n");
      await Promise.race([exited, delay(2_000)]);
      if (session.process.exitCode === null) session.process.kill("SIGTERM");
    }),
  );
}

function assertState(label, row) {
  if (!row.startsWith("true|"))
    throw new Error(`${label} state mismatch: ${row}`);
  return row.slice(5);
}

function momoMetadata(providerRef, requestId) {
  return {
    providerRef,
    qrCodeUrl: `https://local.invalid/${requestId}`,
    requestId,
    momoOrderId: providerRef,
  };
}

function momoPayload(requestId, providerRef, resultCode, message) {
  return {
    requestId,
    orderId: providerRef,
    amount: 0,
    resultCode,
    message,
  };
}

async function runBlockedRace(label, firstBody, secondBody) {
  const first = openSession(`payrace_${RUN_ID}_${label}_first`);
  const second = openSession(`payrace_${RUN_ID}_${label}_second`);
  const marker = label.toUpperCase();

  send(
    first,
    `
      BEGIN;
      SET LOCAL statement_timeout = '15s';
      ${firstBody}
      \\echo __${marker}_FIRST_READY__
    `,
  );
  await waitFor(first, `__${marker}_FIRST_READY__`);
  send(
    second,
    `
      BEGIN;
      SET LOCAL statement_timeout = '15s';
      ${secondBody}
      COMMIT;
      \\echo __${marker}_SECOND_COMMITTED__
    `,
  );
  const edge = await waitForBlock(second.name, first.name);
  send(first, `COMMIT;\n\\echo __${marker}_FIRST_COMMITTED__`);
  await Promise.all([
    waitFor(first, `__${marker}_FIRST_COMMITTED__`),
    waitFor(second, `__${marker}_SECOND_COMMITTED__`),
  ]);
  return edge;
}

async function main() {
  const readiness = psql(`
    SELECT current_database() || '|' || current_user || '|' ||
      (to_regprocedure('public.create_payment(bigint,bigint,bigint,text,numeric,uuid,text,text)') IS NOT NULL)::text || '|' ||
      (to_regprocedure('public.create_remote_payment_intent(bigint,bigint,bigint,text,numeric,uuid,text,jsonb)') IS NOT NULL)::text || '|' ||
      (to_regprocedure('public.record_momo_pending_result(bigint,bigint,jsonb)') IS NOT NULL)::text || '|' ||
      (to_regprocedure('public.finalize_momo_successful_payment(bigint,bigint,jsonb)') IS NOT NULL)::text || '|' ||
      (to_regprocedure('public.finalize_momo_failed_payment(bigint,bigint,jsonb)') IS NOT NULL)::text || '|' ||
      (position('FOR UPDATE NOWAIT' IN pg_get_functiondef(
        to_regprocedure('public.create_remote_payment_intent(bigint,bigint,bigint,text,numeric,uuid,text,jsonb)')
      )) > 0)::text || '|' ||
      (position('pending_momo_payment_requires_provider_resolution' IN pg_get_functiondef(
        to_regprocedure('public.confirm_cash_payment(bigint,numeric)')
      )) > 0)::text;
  `);
  if (readiness !== "postgres|postgres|true|true|true|true|true|true|true") {
    throw new Error(
      `Local database is not ready for guarded-payment races: ${readiness}`,
    );
  }

  const providerRefs = {
    createFirst: `${FIXTURE_PREFIX}-CREATE-FIRST-REF`,
    completionFirst: `${FIXTURE_PREFIX}-COMPLETION-FIRST-REF`,
    samePendingFirst: `${FIXTURE_PREFIX}-SAME-PENDING-FIRST-REF`,
    sameSuccessFirst: `${FIXTURE_PREFIX}-SAME-SUCCESS-FIRST-REF`,
    separateSuccessFirst: `${FIXTURE_PREFIX}-SEPARATE-SUCCESS-FIRST-REF`,
    separateFailureFirst: `${FIXTURE_PREFIX}-SEPARATE-FAILURE-FIRST-REF`,
    momoCashRace: `${FIXTURE_PREFIX}-MOMO-CASH-RACE-REF`,
    exactCashWaits: `${FIXTURE_PREFIX}-EXACT-CASH-WAITS-REF`,
    orderFirstInversion: `${FIXTURE_PREFIX}-ORDER-FIRST-INVERSION-REF`,
  };
  const initialRequests = {
    createFirst: `INIT-${FIXTURE_PREFIX}-CREATE-FIRST`,
    completionFirst: `INIT-${FIXTURE_PREFIX}-COMPLETION-FIRST`,
    samePendingFirst: `INIT-${FIXTURE_PREFIX}-SAME-PENDING-FIRST`,
    sameSuccessFirst: `INIT-${FIXTURE_PREFIX}-SAME-SUCCESS-FIRST`,
    separateSuccessFirst: `INIT-${FIXTURE_PREFIX}-SEPARATE-SUCCESS-FIRST`,
    separateFailureFirst: `INIT-${FIXTURE_PREFIX}-SEPARATE-FAILURE-FIRST`,
    momoCashRace: `INIT-${FIXTURE_PREFIX}-MOMO-CASH-RACE`,
    exactCashWaits: `INIT-${FIXTURE_PREFIX}-EXACT-CASH-WAITS`,
  };
  const eventRequests = {
    samePendingFirst: `${FIXTURE_PREFIX}-SAME-PENDING-FIRST`,
    sameSuccessFirst: `${FIXTURE_PREFIX}-SAME-SUCCESS-FIRST`,
    separateSuccessFirstSuccess: `${FIXTURE_PREFIX}-SEPARATE-SUCCESS-FIRST-SUCCESS`,
    separateSuccessFirstFailure: `${FIXTURE_PREFIX}-SEPARATE-SUCCESS-FIRST-FAILURE`,
    separateFailureFirstSuccess: `${FIXTURE_PREFIX}-SEPARATE-FAILURE-FIRST-SUCCESS`,
    separateFailureFirstFailure: `${FIXTURE_PREFIX}-SEPARATE-FAILURE-FIRST-FAILURE`,
    momoCashRace: `${FIXTURE_PREFIX}-MOMO-CASH-RACE`,
    exactCashWaits: `${FIXTURE_PREFIX}-EXACT-CASH-WAITS`,
  };
  const output = [];
  let cleanupState;

  try {
    const fixtureText = psql(`
      BEGIN;
      WITH context AS (
        SELECT tenant.id AS tenant_id, branch.id AS branch_id
        FROM public.tenants tenant
        JOIN public.branches branch
          ON branch.tenant_id = tenant.id
         AND branch.name = 'Chi nhánh Đất Đỏ'
        JOIN public.profiles profile
          ON profile.id = '${CASHIER_ID}'::uuid
         AND profile.tenant_id = tenant.id
         AND profile.branch_id = branch.id
         AND profile.is_active
        WHERE tenant.slug = 'comtammatu'
      ), scenarios(suffix) AS (
        VALUES
          ('CREATE-FIRST'),
          ('COMPLETION-FIRST'),
          ('SAME-PENDING-FIRST'),
          ('SAME-SUCCESS-FIRST'),
          ('SEPARATE-SUCCESS-FIRST'),
          ('SEPARATE-FAILURE-FIRST'),
          ('MOMO-CASH-RACE'),
          ('EXACT-CASH-WAITS'),
          ('ORDER-FIRST-INVERSION')
      )
      INSERT INTO public.orders (
        tenant_id, branch_id, order_number, order_type, status, subtotal,
        total_amount, created_by, payment_status
      )
      SELECT
        context.tenant_id,
        context.branch_id,
        '${FIXTURE_PREFIX}-' || scenarios.suffix,
        'takeaway',
        'new',
        0,
        0,
        '${CASHIER_ID}'::uuid,
        'unpaid'
      FROM context CROSS JOIN scenarios;

      ${serviceSettings()}
      DO $fixture$
      DECLARE
        fixture record;
      BEGIN
        FOR fixture IN
          SELECT order_row.id AS order_id,
                 order_row.tenant_id,
                 order_row.branch_id,
                 source.provider_ref,
                 source.initial_request
          FROM public.orders order_row
          JOIN (VALUES
            ('CREATE-FIRST', '${providerRefs.createFirst}', '${initialRequests.createFirst}'),
            ('COMPLETION-FIRST', '${providerRefs.completionFirst}', '${initialRequests.completionFirst}'),
            ('SAME-PENDING-FIRST', '${providerRefs.samePendingFirst}', '${initialRequests.samePendingFirst}'),
            ('SAME-SUCCESS-FIRST', '${providerRefs.sameSuccessFirst}', '${initialRequests.sameSuccessFirst}'),
            ('SEPARATE-SUCCESS-FIRST', '${providerRefs.separateSuccessFirst}', '${initialRequests.separateSuccessFirst}'),
            ('SEPARATE-FAILURE-FIRST', '${providerRefs.separateFailureFirst}', '${initialRequests.separateFailureFirst}'),
            ('MOMO-CASH-RACE', '${providerRefs.momoCashRace}', '${initialRequests.momoCashRace}'),
            ('EXACT-CASH-WAITS', '${providerRefs.exactCashWaits}', '${initialRequests.exactCashWaits}')
          ) AS source(suffix, provider_ref, initial_request)
            ON order_row.order_number = '${FIXTURE_PREFIX}-' || source.suffix
        LOOP
          PERFORM public.create_remote_payment_intent(
            fixture.tenant_id,
            fixture.branch_id,
            fixture.order_id,
            'momo',
            0,
            '${CASHIER_ID}'::uuid,
            fixture.provider_ref,
            jsonb_build_object(
              'providerRef', fixture.provider_ref,
              'qrCodeUrl', 'https://local.invalid/' || fixture.initial_request,
              'requestId', fixture.initial_request,
              'momoOrderId', fixture.provider_ref
            )
          );
        END LOOP;
      END
      $fixture$;
      RESET ROLE;

      INSERT INTO public.webhook_events (
        tenant_id, provider, request_id, order_id, signature_valid,
        payload, processing_status
      )
      SELECT
        order_row.tenant_id,
        'momo',
        source.request_id,
        order_row.id,
        true,
        '{}'::jsonb,
        'received'
      FROM public.orders order_row
      JOIN (VALUES
        ('SAME-PENDING-FIRST', '${eventRequests.samePendingFirst}'),
        ('SAME-SUCCESS-FIRST', '${eventRequests.sameSuccessFirst}'),
        ('SEPARATE-SUCCESS-FIRST', '${eventRequests.separateSuccessFirstSuccess}'),
        ('SEPARATE-SUCCESS-FIRST', '${eventRequests.separateSuccessFirstFailure}'),
        ('SEPARATE-FAILURE-FIRST', '${eventRequests.separateFailureFirstSuccess}'),
        ('SEPARATE-FAILURE-FIRST', '${eventRequests.separateFailureFirstFailure}'),
        ('MOMO-CASH-RACE', '${eventRequests.momoCashRace}'),
        ('EXACT-CASH-WAITS', '${eventRequests.exactCashWaits}')
      ) AS source(suffix, request_id)
        ON order_row.order_number = '${FIXTURE_PREFIX}-' || source.suffix;
      COMMIT;

      SELECT jsonb_build_object(
        'tenantId', (
          SELECT tenant.id FROM public.tenants tenant
          WHERE tenant.slug = 'comtammatu'
        ),
        'branchId', (
          SELECT branch.id
          FROM public.branches branch
          JOIN public.tenants tenant ON tenant.id = branch.tenant_id
          WHERE tenant.slug = 'comtammatu'
            AND branch.name = 'Chi nhánh Đất Đỏ'
        ),
        'orders', (
          SELECT jsonb_object_agg(
            replace(order_row.order_number, '${FIXTURE_PREFIX}-', ''),
            order_row.id
          )
          FROM public.orders order_row
          WHERE order_row.order_number LIKE '${FIXTURE_PREFIX}-%'
        ),
        'payments', (
          SELECT jsonb_object_agg(
            replace(order_row.order_number, '${FIXTURE_PREFIX}-', ''),
            payment.id
          )
          FROM public.orders order_row
          JOIN public.payments payment ON payment.order_id = order_row.id
          WHERE order_row.order_number LIKE '${FIXTURE_PREFIX}-%'
        ),
        'events', (
          SELECT jsonb_object_agg(
            replace(event.request_id, '${FIXTURE_PREFIX}-', ''),
            event.id
          )
          FROM public.webhook_events event
          WHERE event.request_id LIKE '${FIXTURE_PREFIX}-%'
        )
      )::text;
    `);
    const fixture = JSON.parse(fixtureText);
    const tenantId = Number(fixture.tenantId);
    const branchId = Number(fixture.branchId);
    const orderId = (key) => Number(fixture.orders?.[key]);
    const paymentId = (key) => Number(fixture.payments?.[key]);
    const eventId = (key) => Number(fixture.events?.[key]);

    const createFirstOrderId = orderId("CREATE-FIRST");
    const createFirstPaymentId = paymentId("CREATE-FIRST");
    const completionFirstOrderId = orderId("COMPLETION-FIRST");
    const completionFirstPaymentId = paymentId("COMPLETION-FIRST");
    const samePendingFirstPaymentId = paymentId("SAME-PENDING-FIRST");
    const samePendingFirstEventId = eventId("SAME-PENDING-FIRST");
    const sameSuccessFirstPaymentId = paymentId("SAME-SUCCESS-FIRST");
    const sameSuccessFirstEventId = eventId("SAME-SUCCESS-FIRST");
    const separateSuccessFirstPaymentId = paymentId("SEPARATE-SUCCESS-FIRST");
    const separateSuccessEventId = eventId("SEPARATE-SUCCESS-FIRST-SUCCESS");
    const separateSuccessFailureEventId = eventId(
      "SEPARATE-SUCCESS-FIRST-FAILURE",
    );
    const separateFailureFirstPaymentId = paymentId("SEPARATE-FAILURE-FIRST");
    const separateFailureSuccessEventId = eventId(
      "SEPARATE-FAILURE-FIRST-SUCCESS",
    );
    const separateFailureEventId = eventId("SEPARATE-FAILURE-FIRST-FAILURE");
    const momoCashOrderId = orderId("MOMO-CASH-RACE");
    const momoCashPaymentId = paymentId("MOMO-CASH-RACE");
    const momoCashEventId = eventId("MOMO-CASH-RACE");
    const exactCashWaitsOrderId = orderId("EXACT-CASH-WAITS");
    const exactCashWaitsPaymentId = paymentId("EXACT-CASH-WAITS");
    const exactCashWaitsEventId = eventId("EXACT-CASH-WAITS");
    const inversionOrderId = orderId("ORDER-FIRST-INVERSION");
    const fixtureIds = [
      tenantId,
      branchId,
      createFirstOrderId,
      createFirstPaymentId,
      completionFirstOrderId,
      completionFirstPaymentId,
      samePendingFirstPaymentId,
      samePendingFirstEventId,
      sameSuccessFirstPaymentId,
      sameSuccessFirstEventId,
      separateSuccessFirstPaymentId,
      separateSuccessEventId,
      separateSuccessFailureEventId,
      separateFailureFirstPaymentId,
      separateFailureSuccessEventId,
      separateFailureEventId,
      momoCashOrderId,
      momoCashPaymentId,
      momoCashEventId,
      exactCashWaitsOrderId,
      exactCashWaitsPaymentId,
      exactCashWaitsEventId,
      inversionOrderId,
    ];
    if (fixtureIds.some((value) => !Number.isSafeInteger(value))) {
      throw new Error(`Invalid local fixture context: ${fixtureText}`);
    }

    const metadataCoverage = psql(`
      SELECT count(*)::text || '|' || count(*) FILTER (
        WHERE jsonb_typeof(payment.provider_data) = 'object'
          AND NULLIF(btrim(payment.provider_ref), '') IS NOT NULL
          AND NULLIF(btrim(payment.provider_data ->> 'providerRef'), '')
            = payment.provider_ref
          AND NULLIF(btrim(payment.provider_data ->> 'qrCodeUrl'), '') IS NOT NULL
          AND NULLIF(btrim(payment.provider_data ->> 'requestId'), '') IS NOT NULL
          AND NULLIF(btrim(payment.provider_data ->> 'momoOrderId'), '')
            = payment.provider_ref
      )::text
      FROM public.payments payment
      JOIN public.orders order_row ON order_row.id = payment.order_id
      WHERE order_row.order_number LIKE '${FIXTURE_PREFIX}-%'
        AND payment.method = 'momo';
    `);
    if (metadataCoverage !== "8|8") {
      throw new Error(
        `Atomic create metadata coverage mismatch: ${metadataCoverage}`,
      );
    }
    const createFirstMetadata = momoMetadata(
      providerRefs.createFirst,
      initialRequests.createFirst,
    );
    const completionFirstMetadata = momoMetadata(
      providerRefs.completionFirst,
      initialRequests.completionFirst,
    );
    const createFirstSettled = {
      ...createFirstMetadata,
      settlement: "create-first",
    };
    const createFirstEdge = await runBlockedRace(
      "atomic_create_first",
      `
        ${serviceSettings()}
        SELECT public.create_remote_payment_intent(
          ${tenantId}, ${branchId}, ${createFirstOrderId}, 'momo', 0,
          '${CASHIER_ID}'::uuid, '${providerRefs.createFirst}',
          '${JSON.stringify(createFirstMetadata)}'::jsonb
        );
      `,
      `
        SELECT status FROM public.complete_payment_and_consume_stock(
          ${createFirstPaymentId}, 0,
          '${JSON.stringify(createFirstSettled)}'::jsonb,
          '${CASHIER_ID}'::uuid
        );
      `,
    );
    const createFirstState = assertState(
      "atomic-create-first",
      psql(`
        SELECT (
          payment.status = 'completed'
          AND payment.order_id = ${createFirstOrderId}
          AND payment.provider_data = '${JSON.stringify(createFirstSettled)}'::jsonb
        )::text || '|' || payment.status || '|' || payment.provider_data::text
        FROM public.payments payment WHERE payment.id = ${createFirstPaymentId};
      `),
    );

    const completionFirstSettled = {
      ...completionFirstMetadata,
      settlement: "completion-first",
    };
    const completionFirstEdge = await runBlockedRace(
      "atomic_completion_first",
      `
        SELECT status FROM public.complete_payment_and_consume_stock(
          ${completionFirstPaymentId}, 0,
          '${JSON.stringify(completionFirstSettled)}'::jsonb,
          '${CASHIER_ID}'::uuid
        );
      `,
      `
        ${serviceSettings()}
        DO $race$
        BEGIN
          PERFORM public.create_remote_payment_intent(
            ${tenantId}, ${branchId}, ${completionFirstOrderId}, 'momo', 0,
            '${CASHIER_ID}'::uuid, '${providerRefs.completionFirst}',
            '${JSON.stringify(completionFirstMetadata)}'::jsonb
          );
          RAISE EXCEPTION 'create_remote_payment_intent unexpectedly succeeded after completion';
        EXCEPTION WHEN SQLSTATE 'P0001' THEN
          IF SQLERRM IS DISTINCT FROM 'order_already_paid' THEN
            RAISE;
          END IF;
        END
        $race$;
      `,
    );
    const completionFirstState = assertState(
      "atomic-completion-first",
      psql(`
        SELECT (
          payment.status = 'completed'
          AND payment.order_id = ${completionFirstOrderId}
          AND payment.provider_data = '${JSON.stringify(completionFirstSettled)}'::jsonb
        )::text || '|' || payment.status || '|' || payment.provider_data::text
        FROM public.payments payment WHERE payment.id = ${completionFirstPaymentId};
      `),
    );

    const samePendingPayload = momoPayload(
      eventRequests.samePendingFirst,
      providerRefs.samePendingFirst,
      1000,
      "provider pending",
    );
    const samePendingSuccessPayload = momoPayload(
      eventRequests.samePendingFirst,
      providerRefs.samePendingFirst,
      0,
      "provider success",
    );
    const samePendingFirstEdge = await runBlockedRace(
      "same_event_pending_first",
      `
        ${serviceSettings()}
        SELECT public.record_momo_pending_result(
          ${samePendingFirstEventId}, ${samePendingFirstPaymentId},
          '${JSON.stringify(samePendingPayload)}'::jsonb
        );
      `,
      `
        ${serviceSettings()}
        SELECT public.finalize_momo_successful_payment(
          ${samePendingFirstEventId}, ${samePendingFirstPaymentId},
          '${JSON.stringify(samePendingSuccessPayload)}'::jsonb
        );
      `,
    );
    const samePendingFirstState = assertState(
      "same-event-pending-first",
      psql(`
        SELECT (
          payment.status = 'completed'
          AND event.processing_status = 'processed'
          AND event.payload = '${JSON.stringify(samePendingSuccessPayload)}'::jsonb
          AND payment.provider_data @> '${JSON.stringify(samePendingSuccessPayload)}'::jsonb
          AND NULLIF(payment.provider_data ->> 'qrCodeUrl', '') IS NOT NULL
        )::text || '|' || payment.status || '|' || event.processing_status || '|' ||
          (event.payload ->> 'resultCode')
        FROM public.payments payment
        JOIN public.webhook_events event ON event.id = ${samePendingFirstEventId}
        WHERE payment.id = ${samePendingFirstPaymentId};
      `),
    );

    const sameSuccessPayload = momoPayload(
      eventRequests.sameSuccessFirst,
      providerRefs.sameSuccessFirst,
      0,
      "provider success",
    );
    const sameLatePendingPayload = momoPayload(
      eventRequests.sameSuccessFirst,
      providerRefs.sameSuccessFirst,
      1000,
      "late provider pending",
    );
    const sameSuccessFirstEdge = await runBlockedRace(
      "same_event_success_first",
      `
        ${serviceSettings()}
        SELECT public.finalize_momo_successful_payment(
          ${sameSuccessFirstEventId}, ${sameSuccessFirstPaymentId},
          '${JSON.stringify(sameSuccessPayload)}'::jsonb
        );
      `,
      `
        ${serviceSettings()}
        SELECT public.record_momo_pending_result(
          ${sameSuccessFirstEventId}, ${sameSuccessFirstPaymentId},
          '${JSON.stringify(sameLatePendingPayload)}'::jsonb
        );
      `,
    );
    const sameSuccessFirstState = assertState(
      "same-event-success-first",
      psql(`
        SELECT (
          payment.status = 'completed'
          AND event.processing_status = 'processed'
          AND event.payload = '${JSON.stringify(sameSuccessPayload)}'::jsonb
          AND event.payload <> '${JSON.stringify(sameLatePendingPayload)}'::jsonb
          AND payment.provider_data @> '${JSON.stringify(sameSuccessPayload)}'::jsonb
        )::text || '|' || payment.status || '|' || event.processing_status || '|' ||
          (event.payload ->> 'resultCode')
        FROM public.payments payment
        JOIN public.webhook_events event ON event.id = ${sameSuccessFirstEventId}
        WHERE payment.id = ${sameSuccessFirstPaymentId};
      `),
    );

    const separateSuccessPayload = momoPayload(
      eventRequests.separateSuccessFirstSuccess,
      providerRefs.separateSuccessFirst,
      0,
      "success event won",
    );
    const separateLateFailurePayload = momoPayload(
      eventRequests.separateSuccessFirstFailure,
      providerRefs.separateSuccessFirst,
      1006,
      "late failure event",
    );
    const separateSuccessFirstEdge = await runBlockedRace(
      "separate_event_success_first",
      `
        ${serviceSettings()}
        SELECT public.finalize_momo_successful_payment(
          ${separateSuccessEventId}, ${separateSuccessFirstPaymentId},
          '${JSON.stringify(separateSuccessPayload)}'::jsonb
        );
      `,
      `
        ${serviceSettings()}
        SELECT public.finalize_momo_failed_payment(
          ${separateSuccessFailureEventId}, ${separateSuccessFirstPaymentId},
          '${JSON.stringify(separateLateFailurePayload)}'::jsonb
        );
      `,
    );
    const separateSuccessFirstState = assertState(
      "separate-event-success-first",
      psql(`
        SELECT (
          payment.status = 'completed'
          AND success_event.processing_status = 'processed'
          AND success_event.payload = '${JSON.stringify(separateSuccessPayload)}'::jsonb
          AND failure_event.processing_status = 'ignored'
          AND failure_event.error_code = 'payment_already_final'
          AND failure_event.payload = '${JSON.stringify(separateLateFailurePayload)}'::jsonb
          AND payment.provider_data @> '${JSON.stringify(separateSuccessPayload)}'::jsonb
          AND NOT payment.provider_data ? 'momoFailure'
        )::text || '|' || payment.status || '|' || success_event.processing_status || '|' ||
          failure_event.processing_status
        FROM public.payments payment
        JOIN public.webhook_events success_event ON success_event.id = ${separateSuccessEventId}
        JOIN public.webhook_events failure_event ON failure_event.id = ${separateSuccessFailureEventId}
        WHERE payment.id = ${separateSuccessFirstPaymentId};
      `),
    );

    const separateFailurePayload = momoPayload(
      eventRequests.separateFailureFirstFailure,
      providerRefs.separateFailureFirst,
      1006,
      "failure event won",
    );
    const separateLateSuccessPayload = momoPayload(
      eventRequests.separateFailureFirstSuccess,
      providerRefs.separateFailureFirst,
      0,
      "late success event",
    );
    const separateFailureFirstEdge = await runBlockedRace(
      "separate_event_failure_first",
      `
        ${serviceSettings()}
        SELECT public.finalize_momo_failed_payment(
          ${separateFailureEventId}, ${separateFailureFirstPaymentId},
          '${JSON.stringify(separateFailurePayload)}'::jsonb
        );
      `,
      `
        ${serviceSettings()}
        SELECT public.finalize_momo_successful_payment(
          ${separateFailureSuccessEventId}, ${separateFailureFirstPaymentId},
          '${JSON.stringify(separateLateSuccessPayload)}'::jsonb
        );
      `,
    );
    const separateFailureFirstState = assertState(
      "separate-event-failure-first",
      psql(`
        SELECT (
          payment.status = 'failed'
          AND failure_event.processing_status = 'processed'
          AND failure_event.error_code = 'provider_result_failed'
          AND failure_event.payload = '${JSON.stringify(separateFailurePayload)}'::jsonb
          AND success_event.processing_status = 'failed'
          AND success_event.error_code = 'failed'
          AND success_event.payload = '${JSON.stringify(separateLateSuccessPayload)}'::jsonb
          AND payment.provider_data ? 'momoFailure'
          AND payment.provider_data -> 'momoFailure' ->> 'resultCode' = '1006'
        )::text || '|' || payment.status || '|' || failure_event.processing_status || '|' ||
          success_event.processing_status
        FROM public.payments payment
        JOIN public.webhook_events success_event ON success_event.id = ${separateFailureSuccessEventId}
        JOIN public.webhook_events failure_event ON failure_event.id = ${separateFailureEventId}
        WHERE payment.id = ${separateFailureFirstPaymentId};
      `),
    );

    output.push(`atomic-metadata: ${metadataCoverage}`);
    output.push(`atomic-create-first: ${createFirstEdge}; ${createFirstState}`);
    output.push(
      `atomic-completion-first: ${completionFirstEdge}; ${completionFirstState}`,
    );
    output.push(
      `same-event-pending-first: ${samePendingFirstEdge}; ${samePendingFirstState}`,
    );
    output.push(
      `same-event-success-first: ${sameSuccessFirstEdge}; ${sameSuccessFirstState}`,
    );
    output.push(
      `separate-event-success-first: ${separateSuccessFirstEdge}; ${separateSuccessFirstState}`,
    );
    output.push(
      `separate-event-failure-first: ${separateFailureFirstEdge}; ${separateFailureFirstState}`,
    );

    const momoCashPayload = momoPayload(
      eventRequests.momoCashRace,
      providerRefs.momoCashRace,
      0,
      "signed provider success",
    );
    const cashRejecter = openSession(
      `payrace_${RUN_ID}_pending_momo_cash_reject`,
    );
    const momoSettler = openSession(
      `payrace_${RUN_ID}_pending_momo_success_settle`,
    );
    send(
      cashRejecter,
      `
        BEGIN;
        SET LOCAL statement_timeout = '15s';
        SELECT 1 FROM public.orders WHERE id = ${momoCashOrderId} FOR UPDATE;
        SELECT pg_advisory_xact_lock(${momoCashOrderId});
        ${authSettings(tenantId, branchId)}
        \\echo __PENDING_MOMO_CASH_LOCKS_READY__
      `,
    );
    await waitFor(cashRejecter, "__PENDING_MOMO_CASH_LOCKS_READY__");
    send(
      momoSettler,
      `
        BEGIN;
        SET LOCAL statement_timeout = '15s';
        ${serviceSettings()}
        SELECT public.finalize_momo_successful_payment(
          ${momoCashEventId}, ${momoCashPaymentId},
          '${JSON.stringify(momoCashPayload)}'::jsonb
        );
        COMMIT;
        \\echo __PENDING_MOMO_SUCCESS_COMMITTED__
      `,
    );
    const momoCashEdge = await waitForBlock(
      momoSettler.name,
      cashRejecter.name,
    );
    send(
      cashRejecter,
      `
        DO $race$
        BEGIN
          PERFORM public.confirm_cash_payment_with_invoice_binding(
            ${momoCashOrderId},
            0
          );
          RAISE EXCEPTION 'cash unexpectedly replaced pending MoMo';
        EXCEPTION WHEN SQLSTATE '55P03' THEN
          IF SQLERRM IS DISTINCT FROM
            'pending_momo_payment_requires_provider_resolution'
          THEN
            RAISE;
          END IF;
        END
        $race$;
        \\echo __PENDING_MOMO_CASH_REJECTED__
        COMMIT;
        \\echo __PENDING_MOMO_CASH_COMMITTED__
      `,
    );
    await Promise.all([
      waitFor(cashRejecter, "__PENDING_MOMO_CASH_COMMITTED__"),
      waitFor(momoSettler, "__PENDING_MOMO_SUCCESS_COMMITTED__"),
    ]);
    const momoCashState = assertState(
      "pending-momo-vs-cash",
      psql(`
        SELECT (
          payment.status = 'completed'
          AND payment.method = 'momo'
          AND order_row.payment_status = 'paid'
          AND order_row.payment_method = 'momo'
          AND event.processing_status = 'processed'
          AND event.http_status = 204
          AND event.error_code IS NULL
          AND event.payment_id = payment.id
          AND event.payload = '${JSON.stringify(momoCashPayload)}'::jsonb
          AND payment.provider_data @> '${JSON.stringify(momoCashPayload)}'::jsonb
        )::text || '|' || payment.status || '|' || payment.method || '|' ||
          event.processing_status
        FROM public.payments payment
        JOIN public.orders order_row ON order_row.id = payment.order_id
        JOIN public.webhook_events event ON event.id = ${momoCashEventId}
        WHERE payment.id = ${momoCashPaymentId};
      `),
    );
    output.push(
      `pending-momo-vs-cash: ${momoCashEdge}; cash=55P03/pending_momo_payment_requires_provider_resolution; ${momoCashState}`,
    );

    const exactCashWaitsPayload = momoPayload(
      eventRequests.exactCashWaits,
      providerRefs.exactCashWaits,
      0,
      "provider success while cash waits",
    );
    const exactMomoSettler = openSession(
      `payrace_${RUN_ID}_exact_cash_waits_momo_settle`,
    );
    const exactCashWaiter = openSession(
      `payrace_${RUN_ID}_exact_cash_waits_cash_confirm`,
    );
    send(
      exactMomoSettler,
      `
        BEGIN;
        SET LOCAL statement_timeout = '15s';
        ${serviceSettings()}
        SELECT 1
        FROM public.webhook_events
        WHERE id = ${exactCashWaitsEventId}
        FOR UPDATE;
        SELECT pg_advisory_xact_lock(${exactCashWaitsOrderId});
        \\echo __EXACT_CASH_WAITS_MOMO_PREFIX_LOCKED__
      `,
    );
    await waitFor(exactMomoSettler, "__EXACT_CASH_WAITS_MOMO_PREFIX_LOCKED__");
    send(
      exactCashWaiter,
      `
        BEGIN;
        SET LOCAL statement_timeout = '15s';
        ${authSettings(tenantId, branchId)}
        DO $race$
        DECLARE
          v_result jsonb;
        BEGIN
          v_result := public.confirm_cash_payment(${exactCashWaitsOrderId}, 0);
          IF v_result ->> 'status' IS DISTINCT FROM 'already_completed'
            OR (v_result ->> 'payment_id')::bigint IS DISTINCT FROM
              ${exactCashWaitsPaymentId}
            OR (v_result ->> 'idempotent')::boolean IS DISTINCT FROM true
          THEN
            RAISE EXCEPTION 'unexpected exact cash replay result: %', v_result;
          END IF;
        END
        $race$;
        COMMIT;
        \\echo __EXACT_CASH_WAITS_CASH_COMMITTED__
      `,
    );
    const exactCashWaitsEdge = await waitForBlock(
      exactCashWaiter.name,
      exactMomoSettler.name,
    );
    const exactCashWaitsLockState = assertState(
      "exact-cash-waits-lock",
      psql(`
        WITH blocked AS (
          SELECT activity.pid, activity.wait_event_type, activity.wait_event
          FROM pg_stat_activity activity
          WHERE activity.application_name = '${exactCashWaiter.name}'
        )
        SELECT (
          blocked.wait_event_type = 'Lock'
          AND lower(blocked.wait_event) = 'advisory'
          AND EXISTS (
            SELECT 1
            FROM pg_locks pending_lock
            WHERE pending_lock.pid = blocked.pid
              AND pending_lock.locktype = 'advisory'
              AND pending_lock.granted = false
          )
        )::text || '|' || blocked.wait_event_type || '|' ||
          blocked.wait_event || '|' ||
          (SELECT count(*)
           FROM pg_locks pending_lock
           WHERE pending_lock.pid = blocked.pid
             AND pending_lock.locktype = 'advisory'
             AND pending_lock.granted = false)::text
        FROM blocked;
      `),
    );
    send(
      exactMomoSettler,
      `
        SELECT public.finalize_momo_successful_payment(
          ${exactCashWaitsEventId}, ${exactCashWaitsPaymentId},
          '${JSON.stringify(exactCashWaitsPayload)}'::jsonb
        );
        COMMIT;
        \\echo __EXACT_CASH_WAITS_MOMO_COMMITTED__
      `,
    );
    await Promise.all([
      waitFor(exactMomoSettler, "__EXACT_CASH_WAITS_MOMO_COMMITTED__"),
      waitFor(exactCashWaiter, "__EXACT_CASH_WAITS_CASH_COMMITTED__"),
    ]);
    const exactCashWaitsState = assertState(
      "exact-cash-waits",
      psql(`
        SELECT (
          payment.status = 'completed'
          AND payment.method = 'momo'
          AND order_row.payment_status = 'paid'
          AND order_row.payment_method = 'momo'
          AND event.processing_status = 'processed'
          AND event.http_status = 204
          AND event.error_code IS NULL
          AND event.payment_id = payment.id
          AND event.payload = '${JSON.stringify(exactCashWaitsPayload)}'::jsonb
          AND payment.provider_data @> '${JSON.stringify(exactCashWaitsPayload)}'::jsonb
          AND (
            SELECT count(*)
            FROM public.payments active_payment
            WHERE active_payment.order_id = order_row.id
              AND active_payment.status <> 'failed'
          ) = 1
        )::text || '|' || payment.status || '|' || payment.method || '|' ||
          event.processing_status
        FROM public.payments payment
        JOIN public.orders order_row ON order_row.id = payment.order_id
        JOIN public.webhook_events event ON event.id = ${exactCashWaitsEventId}
        WHERE payment.id = ${exactCashWaitsPaymentId};
      `),
    );
    output.push(
      `exact-cash-waits-on-advisory: ${exactCashWaitsEdge}; ${exactCashWaitsLockState}; cash=already_completed; ${exactCashWaitsState}`,
    );

    const orderFirstInversionMetadata = momoMetadata(
      providerRefs.orderFirstInversion,
      `INIT-${FIXTURE_PREFIX}-ORDER-FIRST-INVERSION`,
    );
    const cashConfirmer = openSession(
      `payrace_${RUN_ID}_order_first_cash_confirm`,
    );
    const guardedCreator = openSession(
      `payrace_${RUN_ID}_order_first_guarded_create`,
    );
    send(
      cashConfirmer,
      `
        BEGIN;
        SET LOCAL statement_timeout = '15s';
        SELECT 1 FROM public.orders WHERE id = ${inversionOrderId} FOR UPDATE;
        ${authSettings(tenantId, branchId)}
        \\echo __ORDER_FIRST_ROW_LOCKED__
      `,
    );
    await waitFor(cashConfirmer, "__ORDER_FIRST_ROW_LOCKED__");
    send(
      guardedCreator,
      `
        BEGIN;
        SET LOCAL statement_timeout = '15s';
        SELECT pg_advisory_xact_lock(${inversionOrderId});
        ${serviceSettings()}
        \\echo __ORDER_FIRST_ADVISORY_LOCKED__
      `,
    );
    await waitFor(guardedCreator, "__ORDER_FIRST_ADVISORY_LOCKED__");
    send(
      cashConfirmer,
      `
        SELECT public.confirm_cash_payment(${inversionOrderId}, 0);
        \\echo __CASH_CONFIRMED__
        COMMIT;
        \\echo __CASH_COMMITTED__
      `,
    );
    const inversionEdge = await waitForBlock(
      cashConfirmer.name,
      guardedCreator.name,
    );
    send(
      guardedCreator,
      `
        DO $race$
        BEGIN
          PERFORM public.create_remote_payment_intent(
            ${tenantId}, ${branchId}, ${inversionOrderId}, 'momo', 0,
            '${CASHIER_ID}'::uuid, '${providerRefs.orderFirstInversion}',
            '${JSON.stringify(orderFirstInversionMetadata)}'::jsonb
          );
          RAISE EXCEPTION 'create_remote_payment_intent unexpectedly waited through the row lock';
        EXCEPTION WHEN SQLSTATE '55P03' THEN
          NULL;
        END
        $race$;
        \\echo __CREATE_NOWAIT_GUARDED__
        COMMIT;
        \\echo __CREATE_GUARD_COMMITTED__
      `,
    );
    await Promise.all([
      waitFor(guardedCreator, "__CREATE_GUARD_COMMITTED__"),
      waitFor(cashConfirmer, "__CASH_COMMITTED__"),
    ]);
    const inversionState = assertState(
      "order-first-inversion",
      psql(`
        SELECT (
          order_row.payment_status = 'paid'
          AND order_row.payment_method = 'cash'
          AND count(*) FILTER (WHERE payment.status = 'completed' AND payment.method = 'cash') = 1
          AND count(*) FILTER (WHERE payment.status <> 'failed') = 1
          AND count(*) FILTER (WHERE payment.method = 'momo') = 0
        )::text || '|' || order_row.payment_status || '|' || order_row.payment_method || '|' ||
          count(*) FILTER (WHERE payment.status = 'completed')::text
        FROM public.orders order_row
        LEFT JOIN public.payments payment ON payment.order_id = order_row.id
        WHERE order_row.id = ${inversionOrderId}
        GROUP BY order_row.payment_status, order_row.payment_method;
      `),
    );
    output.push(
      `order-first-inversion: ${inversionEdge}; ${inversionState}; create_remote_payment_intent=55P03`,
    );
  } finally {
    await closeSessions();
    psql(`
      DELETE FROM public.webhook_events
      WHERE request_id LIKE '${FIXTURE_PREFIX}-%';
      DELETE FROM public.orders
      WHERE order_number LIKE '${FIXTURE_PREFIX}-%';
    `);
    cleanupState = psql(`
      SELECT
        (SELECT count(*) FROM public.orders
          WHERE order_number LIKE '${FIXTURE_PREFIX}-%')::text || '|' ||
        (SELECT count(*) FROM public.webhook_events
          WHERE request_id LIKE '${FIXTURE_PREFIX}-%')::text || '|' ||
        (SELECT count(*) FROM public.payments
          WHERE provider_ref LIKE '${FIXTURE_PREFIX}-%')::text || '|' ||
        (SELECT count(*) FROM pg_stat_activity
          WHERE application_name LIKE 'payrace_${RUN_ID}_%')::text;
    `);
  }

  if (cleanupState !== "0|0|0|0") {
    throw new Error(`Payment race cleanup mismatch: ${cleanupState}`);
  }
  process.stdout.write(
    `Payment provider race harness passed against ${container} (Postgres 17 local).\n`,
  );
  for (const line of output) process.stdout.write(`${line}\n`);
  process.stdout.write("cleanup: orders=0; events=0; payments=0; sessions=0\n");
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
