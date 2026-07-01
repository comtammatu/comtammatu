#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const ID_CHUNK_SIZE = 200;
const ARCHIVE_DOWNLOAD_CONCURRENCY = 8;
const PROD_REF = "iexwsuaqqenyjiskawoj";

type AnyRow = Record<string, unknown>;

type Args = {
  from: string | null;
  help: boolean;
  noFiles: boolean;
  out: string;
  selfTest: boolean;
  to: string | null;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    from: null,
    help: false,
    noFiles: false,
    out: `.tmp/hddt-export/${new Date().toISOString().replace(/[:.]/g, "-")}`,
    selfTest: false,
    to: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--self-test") out.selfTest = true;
    else if (arg === "--no-files") out.noFiles = true;
    else if (arg === "--from") out.from = readArg(argv, ++index, "--from");
    else if (arg === "--to") out.to = readArg(argv, ++index, "--to");
    else if (arg === "--out") out.out = readArg(argv, ++index, "--out");
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function readArg(argv: string[], index: number, name: string): string {
  const value = argv[index];
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage:
  pnpm --filter @comtammatu/web hddt:export -- [--out .tmp/hddt-export/run] [--from ISO] [--to ISO] [--no-files]

Exports HĐĐT legal archive data read-only:
  - tax_invoices, tax_invoice_events, tax_invoice_orders, archive_run_log
  - linked orders, order_items, payments, refunds
  - tenant, branch, profile metadata
  - PDF/XML files from hddt-archive when tax_invoices paths exist

Output stays under .tmp/ by default and is not tracked by git.`);
}

function repoRoot(): string {
  return path.resolve(process.cwd(), "../..");
}

function resolveOutDir(input: string): string {
  const root = repoRoot();
  const resolved = path.resolve(root, input);
  const relative = path.relative(root, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Output must stay inside the repository");
  }
  if (!relative.startsWith(".tmp/")) {
    throw new Error("Output must stay under .tmp/");
  }
  return resolved;
}

function projectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url).host;
    return host.endsWith(".supabase.co") ? host.split(".")[0] ?? null : null;
  } catch {
    return null;
  }
}

function requireEnv() {
  const url =
    process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  const projectId = process.env["SUPABASE_PROJECT_ID"] ?? "";
  const ref = projectRefFromUrl(url);

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  if (ref !== PROD_REF || projectId !== PROD_REF) {
    throw new Error(`Ref mismatch. Expected ${PROD_REF}, got url=${ref ?? "unknown"} env=${projectId || "empty"}`);
  }

  return { url, key, ref };
}

function chunk<T>(values: readonly T[], size = ID_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

function uniqueDefined<T>(values: readonly (T | null | undefined)[]): T[] {
  return [...new Set(values.filter((value): value is T => value != null))];
}

function stringifyCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toCsv(rows: readonly AnyRow[]): string {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value: unknown) => {
    const text = stringifyCell(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [
    headers.map(escape).join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(",")),
  ].join("\n");
}

function hashHex(bytes: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeCsv(filePath: string, rows: readonly AnyRow[]) {
  await writeFile(filePath, `${toCsv(rows)}\n`);
}

async function fetchAll(
  supabase: ReturnType<typeof createClient>,
  table: string,
  select = "*",
  apply?: (query: ReturnType<ReturnType<typeof createClient>["from"]>["select"]) => unknown,
  orderBy: string | readonly string[] | null = "id",
): Promise<AnyRow[]> {
  const rows: AnyRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from(table)
      .select(select)
      .range(offset, offset + PAGE_SIZE - 1);
    for (const column of Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) {
      query = query.order(column, { ascending: true });
    }

    if (apply) query = apply(query as never) as typeof query;

    const { data, error } = await query;
    if (error) throw new Error(`${table} read failed: ${error.code}`);

    const page = (data ?? []) as AnyRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchByIds(
  supabase: ReturnType<typeof createClient>,
  table: string,
  column: string,
  ids: readonly (number | string | null | undefined)[],
  select = "*",
  orderBy: string | readonly string[] | null = "id",
): Promise<AnyRow[]> {
  const unique = uniqueDefined(ids);
  const rows: AnyRow[] = [];

  for (const group of chunk(unique)) {
    rows.push(
      ...(await fetchAll(
        supabase,
        table,
        select,
        (query) => query.in(column, group),
        orderBy,
      )),
    );
  }

  return rows;
}

function addTimeFilters(query: unknown, args: Args) {
  let out = query as { gte: (column: string, value: string) => unknown; lt: (column: string, value: string) => unknown };
  if (args.from) out = out.gte("created_at", args.from) as typeof out;
  if (args.to) out = out.lt("created_at", args.to) as typeof out;
  return out;
}

function invoiceOrderLinks(taxInvoices: readonly AnyRow[], taxInvoiceOrders: readonly AnyRow[]) {
  const perOrder = taxInvoices
    .filter((invoice) => invoice["order_id"] != null)
    .map((invoice) => ({
      source: "tax_invoices.order_id",
      tax_invoice_id: invoice["id"],
      order_id: invoice["order_id"],
    }));
  const summary = taxInvoiceOrders.map((link) => ({
    source: "tax_invoice_orders",
    tax_invoice_id: link["tax_invoice_id"],
    order_id: link["order_id"],
  }));
  return [...perOrder, ...summary];
}

function invoiceLineRows(
  links: readonly AnyRow[],
  invoices: readonly AnyRow[],
  orders: readonly AnyRow[],
  orderItems: readonly AnyRow[],
) {
  const invoiceById = new Map(invoices.map((row) => [row["id"], row]));
  const orderById = new Map(orders.map((row) => [row["id"], row]));
  const linksByOrder = new Map<unknown, AnyRow[]>();

  for (const link of links) {
    const current = linksByOrder.get(link["order_id"]) ?? [];
    current.push(link);
    linksByOrder.set(link["order_id"], current);
  }

  return orderItems.flatMap((item) => {
    const itemLinks = linksByOrder.get(item["order_id"]) ?? [];
    return itemLinks.map((link) => {
      const invoice = invoiceById.get(link["tax_invoice_id"]) ?? {};
      const order = orderById.get(link["order_id"]) ?? {};
      return {
        tax_invoice_id: link["tax_invoice_id"],
        invoice_kind: invoice["invoice_kind"],
        invoice_number: invoice["invoice_number"],
        invoice_status: invoice["status"],
        issued_at: invoice["issued_at"],
        order_id: item["order_id"],
        order_number: order["order_number"],
        order_created_at: order["created_at"],
        order_payment_status: order["payment_status"],
        order_total_amount: order["total_amount"],
        order_item_id: item["id"],
        item_name: item["item_name"],
        variant_name: item["variant_name"],
        quantity: item["quantity"],
        unit_price: item["unit_price"],
        subtotal: item["subtotal"],
        discount_amount: item["discount_amount"],
        vat_rate: item["vat_rate"],
        status: item["status"],
        modifiers: item["modifiers"],
        sides: item["sides"],
      };
    });
  });
}

async function downloadArchiveFiles(
  supabase: ReturnType<typeof createClient>,
  outDir: string,
  invoices: readonly AnyRow[],
) {
  const files: AnyRow[] = [];
  const storageDir = path.join(outDir, "storage", "hddt-archive");
  await mkdir(storageDir, { recursive: true });
  const paths = invoices.flatMap((invoice) =>
    (["pdf_url", "xml_url"] as const)
      .map((column) => ({ invoice, column, storagePath: String(invoice[column] ?? "") }))
      .filter((item) => item.storagePath),
  );

  const downloadOne = async ({
    invoice,
    column,
    storagePath,
  }: (typeof paths)[number]): Promise<AnyRow> => {
    const relativeFile = path.join(
      "storage",
      "hddt-archive",
      storagePath.replaceAll("/", "__"),
    );
    const absoluteFile = path.join(outDir, relativeFile);

    try {
      const existing = await readFile(absoluteFile);
      return {
        tax_invoice_id: invoice["id"],
        column,
        storage_path: storagePath,
        file: relativeFile,
        bytes: existing.byteLength,
        downloaded: true,
        skipped_existing: true,
        sha256: createHash("sha256").update(existing).digest("hex"),
      };
    } catch {
      // File is absent; download below.
    }

    try {
      const { data, error } = await supabase.storage
        .from("hddt-archive")
        .download(storagePath);
      if (error || !data) {
        return {
          tax_invoice_id: invoice["id"],
          column,
          storage_path: storagePath,
          downloaded: false,
          error: error?.name ?? "download_failed",
        };
      }

      const bytes = await data.arrayBuffer();
      await writeFile(absoluteFile, Buffer.from(bytes));
      return {
        tax_invoice_id: invoice["id"],
        column,
        storage_path: storagePath,
        file: relativeFile,
        bytes: bytes.byteLength,
        downloaded: true,
        sha256: hashHex(bytes),
      };
    } catch (error) {
      return {
        tax_invoice_id: invoice["id"],
        column,
        storage_path: storagePath,
        downloaded: false,
        error: error instanceof Error ? error.name : "download_failed",
      };
    }
  };

  let completed = 0;
  for (const group of chunk(paths, ARCHIVE_DOWNLOAD_CONCURRENCY)) {
    files.push(...(await Promise.all(group.map(downloadOne))));
    completed += group.length;
    if (completed % 24 === 0 || completed === paths.length) {
      console.error(`archive files: ${completed}/${paths.length}`);
    }
  }

  return files;
}

async function runExport(args: Args) {
  const { url, key, ref } = requireEnv();
  const outDir = resolveOutDir(args.out);
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await mkdir(outDir, { recursive: true });

  const taxInvoices = await fetchAll(supabase, "tax_invoices", "*", (query) =>
    addTimeFilters(query, args),
  );
  const invoiceIds = taxInvoices.map((row) => row["id"] as number);
  const taxInvoiceEvents = await fetchByIds(
    supabase,
    "tax_invoice_events",
    "tax_invoice_id",
    invoiceIds,
  );
  const taxInvoiceOrders = await fetchByIds(
    supabase,
    "tax_invoice_orders",
    "tax_invoice_id",
    invoiceIds,
    "*",
    ["tax_invoice_id", "order_id"],
  );
  const archiveRunLog = await fetchByIds(
    supabase,
    "archive_run_log",
    "tax_invoice_id",
    invoiceIds,
  );

  const links = invoiceOrderLinks(taxInvoices, taxInvoiceOrders);
  const orderIds = uniqueDefined(links.map((row) => row["order_id"] as number));
  const orders = await fetchByIds(supabase, "orders", "id", orderIds);
  const orderItems = await fetchByIds(supabase, "order_items", "order_id", orderIds);
  const payments = await fetchByIds(supabase, "payments", "order_id", orderIds);
  const refunds = await fetchByIds(supabase, "refunds", "order_id", orderIds);

  const tenantIds = uniqueDefined([
    ...taxInvoices.map((row) => row["tenant_id"] as number),
    ...orders.map((row) => row["tenant_id"] as number),
  ]);
  const branchIds = uniqueDefined([
    ...taxInvoices.map((row) => row["branch_id"] as number),
    ...orders.map((row) => row["branch_id"] as number),
  ]);
  const profileIds = uniqueDefined([
    ...taxInvoices.map((row) => row["created_by"] as string),
    ...taxInvoiceEvents.map((row) => row["actor_id"] as string),
    ...orders.map((row) => row["created_by"] as string),
    ...payments.map((row) => row["created_by"] as string),
    ...refunds.map((row) => row["created_by"] as string),
    ...refunds.map((row) => row["approved_by"] as string),
  ]);

  const [tenants, branches, profiles] = await Promise.all([
    fetchByIds(
      supabase,
      "tenants",
      "id",
      tenantIds,
      "id,name,slug,legal_name,tax_code,legal_address,representative,created_at,updated_at",
    ),
    fetchByIds(
      supabase,
      "branches",
      "id",
      branchIds,
      "id,tenant_id,name,code,address,phone,branch_kind,timezone,created_at,updated_at",
    ),
    fetchByIds(
      supabase,
      "profiles",
      "id",
      profileIds,
      "id,tenant_id,branch_id,full_name,phone,is_active,created_at,updated_at,position_id",
    ),
  ]);

  const lineRows = invoiceLineRows(links, taxInvoices, orders, orderItems);
  const archiveFiles = args.noFiles
    ? []
    : await downloadArchiveFiles(supabase, outDir, taxInvoices);

  const manifest = {
    exported_at: new Date().toISOString(),
    project_ref: ref,
    filters: { from: args.from, to: args.to },
    counts: {
      tax_invoices: taxInvoices.length,
      tax_invoice_events: taxInvoiceEvents.length,
      tax_invoice_orders: taxInvoiceOrders.length,
      archive_run_log: archiveRunLog.length,
      invoice_order_links: links.length,
      orders: orders.length,
      order_items: orderItems.length,
      invoice_line_rows: lineRows.length,
      payments: payments.length,
      refunds: refunds.length,
      tenants: tenants.length,
      branches: branches.length,
      profiles: profiles.length,
      archive_files: archiveFiles.length,
      archive_files_downloaded: archiveFiles.filter((file) => file["downloaded"]).length,
    },
  };

  await writeJson(path.join(outDir, "manifest.json"), manifest);
  await writeJson(path.join(outDir, "hddt-export.json"), {
    manifest,
    tax_invoices: taxInvoices,
    tax_invoice_events: taxInvoiceEvents,
    tax_invoice_orders: taxInvoiceOrders,
    archive_run_log: archiveRunLog,
    invoice_order_links: links,
    orders,
    order_items: orderItems,
    invoice_line_rows: lineRows,
    payments,
    refunds,
    tenants,
    branches,
    profiles,
    archive_files: archiveFiles,
  });

  await writeCsv(path.join(outDir, "tax_invoices.csv"), taxInvoices);
  await writeCsv(path.join(outDir, "invoice_order_lines.csv"), lineRows);
  await writeCsv(path.join(outDir, "orders.csv"), orders);
  await writeCsv(path.join(outDir, "payments.csv"), payments);
  await writeCsv(path.join(outDir, "refunds.csv"), refunds);
  await writeCsv(path.join(outDir, "archive_files.csv"), archiveFiles);

  console.log(JSON.stringify({ outDir, manifest }, null, 2));
}

function selfTest() {
  assert.deepEqual(uniqueDefined([1, null, 2, 1, undefined]), [1, 2]);
  assert.deepEqual(chunk([1, 2, 3], 2), [[1, 2], [3]]);
  assert.equal(
    toCsv([{ a: "x,y", b: 'a "quote"', c: { ok: true } }]),
    'a,b,c\n"x,y","a ""quote""","{""ok"":true}"',
  );
  assert.equal(projectRefFromUrl("https://iexwsuaqqenyjiskawoj.supabase.co"), PROD_REF);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
} else if (args.selfTest) {
  selfTest();
  console.log("ok");
} else {
  await runExport(args);
}
