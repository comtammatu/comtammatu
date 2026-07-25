import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import {
  dispatchPrintJob,
  resolveInvoiceQrUrls,
  type PrinterRow,
  type PrintJobRow,
} from "../dispatch.js";

const retryOptions = {
  timeoutMs: 100,
  maxAttempts: 1,
  backoffMs: 1,
};

const listen = (server: net.Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });

const close = (server: net.Server): Promise<void> =>
  new Promise((resolve) => server.close(() => resolve()));

const job = (printerId = 10): PrintJobRow => ({
  id: 1,
  tenant_id: 1,
  branch_id: 1,
  printer_id: printerId,
  job_type: "receipt",
  status: "processing",
  payload: {
    kind: "receipt",
    order_number: "T001",
    order_type: "takeaway",
    items: [],
    subtotal: 0,
    total_amount: 0,
    printed_at: "2026-06-25T00:00:00.000Z",
  },
});

const printer = (overrides: Partial<PrinterRow> = {}): PrinterRow => ({
  id: 10,
  branch_id: 1,
  role: "receipt",
  connection_type: "lan",
  lan_host: "127.0.0.1",
  lan_port: 9100,
  paper_width_mm: 80,
  is_active: true,
  ...overrides,
});

test("renders fallback payload and sends ESC/POS bytes", async () => {
  let connections = 0;
  const received: number[] = [];
  let resolveData: (() => void) | undefined;
  const waitForData = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if (received.length > 0) {
        resolve();
        return;
      }
      const timeout = setTimeout(
        () => reject(new Error("printer test server received no data")),
        500,
      );
      resolveData = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
  const server = net.createServer((sock) => {
    connections += 1;
    sock.on("data", (chunk) => {
      received.push(...chunk);
      resolveData?.();
    });
    sock.on("end", () => sock.destroy());
  });
  const port = await listen(server);

  try {
    await dispatchPrintJob(
      job(),
      new Map([[10, printer({ lan_port: port })]]),
      retryOptions,
    );
    await waitForData();
  } finally {
    await close(server);
  }

  assert.equal(connections, 1);
  assert.ok(received.length > 100);
  assert.deepEqual(received.slice(0, 2), [0x1b, 0x40]);
});

test("fails before rendering when the printer is not cached", async () => {
  await assert.rejects(
    () => dispatchPrintJob(job(), new Map(), retryOptions),
    /printer 10 not in cache \/ inactive/,
  );
});

test("fails before rendering when the printer is not LAN", async () => {
  await assert.rejects(
    () =>
      dispatchPrintJob(
        job(),
        new Map([[10, printer({ connection_type: "usb" })]]),
        retryOptions,
      ),
    /only connection_type='lan' is supported/,
  );
});

test("fails before rendering when the LAN host is missing", async () => {
  await assert.rejects(
    () =>
      dispatchPrintJob(
        job(),
        new Map([[10, printer({ lan_host: null })]]),
        retryOptions,
      ),
    /printer 10 missing lan_host/,
  );
});

test("resolves the customer invoice QR against WEB_BASE_URL", () => {
  const payload = {
    ...job().payload,
    invoice_qr: {
      type: "invoice" as const,
      content: "/q/invoice/abc123",
      header_label: "NHẬN HĐĐT",
    },
    document: {
      schema_version: 1,
      template_id: 0,
      template_version: 1,
      paper_width_mm: 80,
      blocks: [
        {
          type: "invoiceQr",
          qr: { type: "invoice", content: "/q/invoice/abc123" },
        },
      ],
    },
  };

  const resolved = resolveInvoiceQrUrls(payload, "https://pos.matu.vn");
  assert.equal(
    resolved.kind === "receipt" ? resolved.invoice_qr?.content : null,
    "https://pos.matu.vn/q/invoice/abc123",
  );
  assert.equal(
    (resolved.document as { blocks: Array<{ qr: { content: string } }> })
      .blocks[0]?.qr.content,
    "https://pos.matu.vn/q/invoice/abc123",
  );
  assert.throws(() => resolveInvoiceQrUrls(payload), /requires WEB_BASE_URL/);
});
