/**
 * ESC/POS encoder — turns render ops into printer bytes. Text lines become
 * GS v 0 rasters; QR codes use the printer's native GS ( k commands.
 */

import {
  blankLine,
  ensureFontsLoaded,
  lineSpacingDefault,
  lineSpacingZero,
  renderLineRaster,
  renderRuleRaster,
} from "./render-bitmap";
import type { PrintDocument } from "./print-document";
import type { PrintPayload } from "./payloads";
import { renderDocumentToOps, resolveDocument, type RenderOp } from "./document-render";

const ESC = 0x1b;
const GS = 0x1d;
const buf = (arr: number[]) => new Uint8Array(arr);
const concat = (parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};

const init = () => buf([ESC, 0x40]);
const cutPartial = () => buf([GS, 0x56, 0x01]);
const feed = (n: number) => buf([ESC, 0x64, n]);
const alignCenter = () => buf([ESC, 0x61, 0x01]);
const alignLeft = () => buf([ESC, 0x61, 0x00]);

// QR commands (GS ( k). Supported by most 80mm thermal printers.
const qrSetModel = () =>
  buf([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
const qrSetSize = (n: number) =>
  buf([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.max(1, Math.min(16, n))]);
const qrSetErrorCorrection = () =>
  buf([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x49]);
const qrStoreData = (s: string): Uint8Array => {
  const bytes = new TextEncoder().encode(s);
  const len = bytes.length + 3;
  const pL = len & 0xff;
  const pH = (len >> 8) & 0xff;
  const header = buf([GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]);
  return concat([header, bytes]);
};
const qrPrint = () => buf([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);
const qrBlock = (data: string, dotSize: number): Uint8Array =>
  concat([
    qrSetModel(),
    qrSetSize(dotSize),
    qrSetErrorCorrection(),
    qrStoreData(data),
    qrPrint(),
  ]);

/** Encode ops as a complete ESC/POS job (init … feed + partial cut). */
export function encodeOpsToEscpos(opsList: RenderOp[]): Uint8Array {
  const parts: Uint8Array[] = [init(), lineSpacingZero()];
  for (const op of opsList) {
    switch (op.kind) {
      case "line":
        parts.push(renderLineRaster(op.text, op.opts));
        break;
      case "rule":
        parts.push(renderRuleRaster(op.thickness));
        break;
      case "blank":
        parts.push(blankLine(op.height));
        break;
      case "qr":
        // Native QR prints with normal spacing, centered; restore raster
        // spacing afterwards.
        parts.push(lineSpacingDefault());
        parts.push(alignCenter());
        parts.push(qrBlock(op.content, op.dotSize));
        parts.push(alignLeft());
        parts.push(lineSpacingZero());
        break;
    }
  }
  parts.push(lineSpacingDefault(), feed(6), cutPartial());
  return concat(parts);
}

/** Render a print document to ESC/POS bytes. */
export async function renderDocumentToEscpos(
  document: PrintDocument,
): Promise<Uint8Array> {
  await ensureFontsLoaded();
  return encodeOpsToEscpos(renderDocumentToOps(document));
}

/**
 * Render any payload to ESC/POS bytes. Prefers the server-materialized
 * document and falls back to a locally built block list.
 */
export async function renderPayloadToEscpos(
  payload: PrintPayload,
): Promise<Uint8Array> {
  return renderDocumentToEscpos(resolveDocument(payload));
}
