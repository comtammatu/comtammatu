import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

if (
  process.env["CI"] !== "true" ||
  process.env["GITHUB_ACTIONS"] !== "true"
) {
  throw new Error("hddt-buyer-race-test is restricted to the CI e2e harness");
}

const container =
  process.env["SUPABASE_DB_CONTAINER"] ?? "supabase_db_comtammatu-e2e";
const databaseArgs = [
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

function runDatabase(sql) {
  const result = spawnSync("docker", databaseArgs, {
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

function startDatabase(sql) {
  const child = spawn("docker", databaseArgs, {
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
  return {
    child,
    done: new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    }),
  };
}

function assertSuccess(result, label) {
  if (result.status !== 0) {
    throw new Error(
      `${label} failed\n${result.stdout.trim()}\n${result.stderr.trim()}`,
    );
  }
}

function serviceRoleSql(body) {
  return `
    SET LOCAL request.jwt.claim.role = 'service_role';
    SET LOCAL request.jwt.claims = '{"role":"service_role"}';
    ${body}
  `;
}

function createFixture(label, paidAtSql) {
  const orderNumber = `HDDT-RACE-${label}-${randomUUID()}`;
  const tokenHash = randomBytes(32).toString("hex");
  const result = runDatabase(`
    BEGIN;
    SET LOCAL comtammatu.skip_quota_enforcement = 'true';
    INSERT INTO public.menu_categories (tenant_id, name)
    SELECT branch.tenant_id, ${sqlLiteral(orderNumber)}
    FROM public.branches branch
    JOIN public.profiles profile
      ON profile.tenant_id = branch.tenant_id
    WHERE branch.is_active = true
    ORDER BY branch.id, profile.id
    LIMIT 1;

    INSERT INTO public.menu_items (tenant_id, category_id, name, base_price)
    SELECT category.tenant_id, category.id, ${sqlLiteral(orderNumber)}, 45000
    FROM public.menu_categories category
    WHERE category.name = ${sqlLiteral(orderNumber)};

    INSERT INTO public.orders (
      tenant_id,
      branch_id,
      order_number,
      order_type,
      status,
      subtotal,
      total_amount,
      created_by,
      payment_method,
      payment_status
    )
    SELECT
      branch.tenant_id,
      branch.id,
      ${sqlLiteral(orderNumber)},
      'takeaway',
      'completed',
      45000,
      45000,
      profile.id,
      'cash',
      'paid'
    FROM public.branches branch
    JOIN public.profiles profile
      ON profile.tenant_id = branch.tenant_id
    WHERE branch.is_active = true
    ORDER BY branch.id, profile.id
    LIMIT 1;

    INSERT INTO public.order_items (
      tenant_id,
      order_id,
      menu_item_id,
      item_name,
      quantity,
      unit_price,
      subtotal,
      status,
      vat_rate
    )
    SELECT
      orders.tenant_id,
      orders.id,
      menu.id,
      menu.name,
      1,
      45000,
      45000,
      'served',
      0
    FROM public.orders orders
    JOIN public.menu_items menu
      ON menu.tenant_id = orders.tenant_id
     AND menu.is_active = true
     AND menu.name = ${sqlLiteral(orderNumber)}
    WHERE orders.order_number = ${sqlLiteral(orderNumber)}
    ORDER BY menu.id
    LIMIT 1;

    INSERT INTO public.payments (
      tenant_id,
      branch_id,
      order_id,
      method,
      amount,
      status,
      paid_at,
      provider_data,
      created_by
    )
    SELECT
      orders.tenant_id,
      orders.branch_id,
      orders.id,
      'cash',
      45000,
      'completed',
      ${paidAtSql},
      '{"invoiceSnapshot":{"buyerNotGetInvoice":true}}'::jsonb,
      orders.created_by
    FROM public.orders orders
    WHERE orders.order_number = ${sqlLiteral(orderNumber)};

    INSERT INTO public.tax_invoice_buyer_requests (
      tenant_id,
      branch_id,
      order_id,
      token_hash,
      expires_at
    )
    SELECT
      job.tenant_id,
      job.branch_id,
      job.order_id,
      ${sqlLiteral(tokenHash)},
      payment.paid_at + interval '2 hours'
    FROM public.tax_invoice_issue_jobs job
    JOIN public.payments payment ON payment.id = job.payment_id
    JOIN public.orders orders ON orders.id = job.order_id
    WHERE orders.order_number = ${sqlLiteral(orderNumber)};
    COMMIT;

    SELECT
      job.id,
      job.tax_invoice_id,
      job.order_id,
      job.payment_id
    FROM public.tax_invoice_issue_jobs job
    JOIN public.orders orders ON orders.id = job.order_id
    WHERE orders.order_number = ${sqlLiteral(orderNumber)};
  `);
  assertSuccess(result, `create ${label} fixture`);
  const [jobId, invoiceId, orderId, paymentId] = result.stdout
    .trim()
    .split("|")
    .map(Number);
  if (![jobId, invoiceId, orderId, paymentId].every(Number.isSafeInteger)) {
    throw new Error(`create ${label} fixture returned invalid identifiers`);
  }
  return { jobId, invoiceId, orderId, orderNumber, paymentId, tokenHash };
}

async function waitForAdvisoryLock(lockKey) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = runDatabase(`
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

async function complete(session, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      session.child.kill("SIGKILL");
      reject(new Error(`${label} timed out`));
    }, 20_000);
  });
  return Promise.race([session.done, timeout]).finally(() => clearTimeout(timer));
}

function submitSql(tokenHash, buyerName, lockKey = null) {
  return `
    BEGIN;
    SET LOCAL statement_timeout = '15s';
    ${serviceRoleSql(`
      SELECT public.submit_invoice_buyer_request_as_system(
        ${sqlLiteral(tokenHash)},
        jsonb_build_object(
          'buyerName', ${sqlLiteral(buyerName)},
          'buyerTaxCode', '0312345678',
          'buyerAddress', '1 Test Street',
          'buyerEmail', 'invoice@example.com'
        )
      );
    `)}
    ${
      lockKey === null
        ? ""
        : `SELECT pg_advisory_xact_lock(${lockKey}); SELECT pg_sleep(2);`
    }
    COMMIT;
  `;
}

function claimSql(jobId, lockKey = null) {
  return `
    BEGIN;
    SET LOCAL statement_timeout = '15s';
    ${serviceRoleSql(`
      SELECT count(*)
      FROM public.claim_tax_invoice_issue_job(${jobId}, 300);
    `)}
    ${
      lockKey === null
        ? ""
        : `SELECT pg_advisory_xact_lock(${lockKey}); SELECT pg_sleep(2);`
    }
    COMMIT;
  `;
}

function claimBatchSql() {
  return `
    BEGIN;
    SET LOCAL statement_timeout = '15s';
    ${serviceRoleSql(`
      SELECT id
      FROM public.claim_tax_invoice_issue_jobs(1, 300);
    `)}
    COMMIT;
  `;
}

function cleanup(fixtures) {
  const orderIds = fixtures.map(({ orderId }) => orderId).join(",");
  const orderNumbers = fixtures
    .map(({ orderNumber }) => sqlLiteral(orderNumber))
    .join(",");
  const result = runDatabase(`
    DELETE FROM public.tax_invoice_buyer_requests WHERE order_id IN (${orderIds});
    DELETE FROM public.tax_invoice_issue_jobs WHERE order_id IN (${orderIds});
    DELETE FROM public.tax_invoice_events
    WHERE tax_invoice_id IN (
      SELECT id FROM public.tax_invoices WHERE order_id IN (${orderIds})
    );
    DELETE FROM public.tax_invoices WHERE order_id IN (${orderIds});
    DELETE FROM public.payments WHERE order_id IN (${orderIds});
    DELETE FROM public.order_items WHERE order_id IN (${orderIds});
    DELETE FROM public.orders WHERE id IN (${orderIds});
    DELETE FROM public.menu_categories WHERE name IN (${orderNumbers});
  `);
  assertSuccess(result, "fixture cleanup");
}

const lockSeed = Number.parseInt(randomBytes(3).toString("hex"), 16);
const fixtures = [];

try {
  const submitFixture = createFixture("SUBMIT", "now()");
  fixtures.push(submitFixture);
  const expiryFixture = createFixture("EXPIRY", "now() - interval '3 hours'");
  fixtures.push(expiryFixture);

  const preservedSnapshot = runDatabase(`
    UPDATE public.payments
    SET provider_data = '{"source":"race-test"}'::jsonb
    WHERE id = ${submitFixture.paymentId};
    SELECT
      provider_data ->> 'source',
      jsonb_typeof(provider_data #> '{invoiceSnapshot,draftSnapshot}')
    FROM public.payments
    WHERE id = ${submitFixture.paymentId};
  `);
  assertSuccess(preservedSnapshot, "payment snapshot preservation");
  if (preservedSnapshot.stdout.trim() !== "race-test|object") {
    throw new Error(
      `payment snapshot was not preserved: ${preservedSnapshot.stdout}`,
    );
  }

  const tamperedSnapshot = runDatabase(`
    UPDATE public.payments
    SET provider_data = jsonb_set(
      provider_data,
      '{invoiceSnapshot,buyerName}',
      '"Tampered"'::jsonb
    )
    WHERE id = ${submitFixture.paymentId};
  `);
  if (
    tamperedSnapshot.status === 0 ||
    !tamperedSnapshot.stderr.includes("invoice_snapshot_immutable")
  ) {
    throw new Error("payment snapshot mutation was not rejected");
  }

  const submitHolder = startDatabase(
    submitSql(submitFixture.tokenHash, "Buyer A", lockSeed),
  );
  await waitForAdvisoryLock(lockSeed);
  const submitContender = startDatabase(
    submitSql(submitFixture.tokenHash, "Buyer B"),
  );
  const [submitHolderResult, submitContenderResult] = await Promise.all([
    complete(submitHolder, "submit holder"),
    complete(submitContender, "submit contender"),
  ]);
  assertSuccess(submitHolderResult, "submit holder");
  assertSuccess(submitContenderResult, "submit contender");

  const submitState = runDatabase(`
    SELECT
      request.status,
      request.submitted_payload ->> 'buyerName',
      count(event.id)
    FROM public.tax_invoice_buyer_requests request
    JOIN public.tax_invoice_issue_jobs job ON job.order_id = request.order_id
    LEFT JOIN public.tax_invoice_events event
      ON event.tax_invoice_id = job.tax_invoice_id
     AND event.note = 'Buyer details confirmed from receipt QR'
    WHERE request.order_id = ${submitFixture.orderId}
    GROUP BY request.status, request.submitted_payload ->> 'buyerName';
  `);
  assertSuccess(submitState, "submit state verification");
  if (submitState.stdout.trim() !== "submitted|Buyer A|1") {
    throw new Error(`submit race stored unexpected state: ${submitState.stdout}`);
  }

  const claimHolder = startDatabase(claimSql(expiryFixture.jobId, lockSeed + 1));
  await waitForAdvisoryLock(lockSeed + 1);
  const claimContender = runDatabase(claimSql(expiryFixture.jobId));
  assertSuccess(claimContender, "claim contender");
  if (claimContender.stdout.trim() !== "0") {
    throw new Error(`second worker claimed the same job: ${claimContender.stdout}`);
  }

  const parallelClaim = runDatabase(claimBatchSql());
  assertSuccess(parallelClaim, "parallel claim");
  if (parallelClaim.stdout.trim() !== String(submitFixture.jobId)) {
    throw new Error(
      `locked oldest job blocked a later job: ${parallelClaim.stdout}`,
    );
  }
  assertSuccess(await complete(claimHolder, "claim holder"), "claim holder");

  const providerRef = `HDDT-RACE-${randomUUID()}`;
  const expiryHolder = startDatabase(`
    BEGIN;
    SET LOCAL statement_timeout = '15s';
    ${serviceRoleSql(`
      SELECT public.prepare_tax_invoice_issue_job_as_system(
        ${expiryFixture.jobId},
        ${expiryFixture.invoiceId},
        ${sqlLiteral(providerRef)}
      );
    `)}
    SELECT pg_advisory_xact_lock(${lockSeed + 2});
    SELECT pg_sleep(2);
    COMMIT;
  `);
  await waitForAdvisoryLock(lockSeed + 2);
  const expiryContender = startDatabase(
    submitSql(expiryFixture.tokenHash, "Too Late"),
  );
  const [expiryHolderResult, expiryContenderResult] = await Promise.all([
    complete(expiryHolder, "expiry holder"),
    complete(expiryContender, "expiry contender"),
  ]);
  assertSuccess(expiryHolderResult, "expiry holder");
  assertSuccess(expiryContenderResult, "expiry contender");

  const expiryState = runDatabase(`
    SELECT
      request.status,
      request.close_reason,
      request.submitted_payload IS NULL,
      invoice.status,
      invoice.buyer_name,
      count(event.id)
    FROM public.tax_invoice_buyer_requests request
    JOIN public.tax_invoice_issue_jobs job ON job.order_id = request.order_id
    JOIN public.tax_invoices invoice ON invoice.id = job.tax_invoice_id
    LEFT JOIN public.tax_invoice_events event
      ON event.tax_invoice_id = invoice.id
     AND event.note = 'Buyer details confirmed from receipt QR'
    WHERE request.order_id = ${expiryFixture.orderId}
    GROUP BY
      request.status,
      request.close_reason,
      request.submitted_payload,
      invoice.status,
      invoice.buyer_name;
  `);
  assertSuccess(expiryState, "expiry state verification");
  if (
    expiryState.stdout.trim() !==
    "expired|deadline_elapsed|t|signing|Bán cho người tiêu dùng|0"
  ) {
    throw new Error(`expiry race stored unexpected state: ${expiryState.stdout}`);
  }

  process.stdout.write(
    "HĐĐT buyer races passed: immutable payment snapshot, one submit snapshot, one claim per job, locked jobs do not block later jobs, terminal expiry wins safely.\n",
  );
} finally {
  if (fixtures.length > 0) cleanup(fixtures);
}
