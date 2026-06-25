import {
  renderPayloadToEscpos,
  type PrintPayload,
} from "@comtammatu/print-render";
import { sendRawLAN } from "./lan.js";

export type PrinterRow = {
  id: number;
  branch_id: number;
  role: "receipt" | "kitchen_1" | "kitchen_2";
  connection_type: string;
  lan_host: string | null;
  lan_port: number | null;
  paper_width_mm: number;
  is_active: boolean;
};

export type PrintJobRow = {
  id: number;
  tenant_id: number;
  branch_id: number;
  printer_id: number;
  job_type:
    | "kitchen_ticket"
    | "receipt"
    | "cancel_ticket"
    | "provisional_bill"
    | "shift_close_report";
  payload: PrintPayload;
  status:
    | "pending"
    | "processing"
    | "printed"
    | "failed"
    | "expired"
    | "cancelled";
};

export type PrintRetryOptions = {
  timeoutMs: number;
  maxAttempts: number;
  backoffMs: number;
};

export async function dispatchPrintJob(
  job: PrintJobRow,
  printerCache: ReadonlyMap<number, PrinterRow>,
  options: PrintRetryOptions,
): Promise<void> {
  const printer = printerCache.get(job.printer_id);
  if (!printer) {
    throw new Error(`printer ${job.printer_id} not in cache / inactive`);
  }
  if (printer.connection_type !== "lan") {
    throw new Error(
      `printer ${printer.id}: only connection_type='lan' is supported (got '${printer.connection_type}')`,
    );
  }
  if (!printer.lan_host) {
    throw new Error(`printer ${printer.id} missing lan_host`);
  }

  const bytes = await renderPayloadToEscpos(job.payload);
  await sendRawLAN(printer.lan_host, printer.lan_port ?? 9100, bytes, options);
}
