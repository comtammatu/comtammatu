/**
 * PNG preview renderer — composes the same render ops the printer receives
 * into one tall image. Text lines are drawn by the exact bitmap routine used
 * for ESC/POS rasters, so the preview is pixel-identical to paper layout.
 *
 * Only the QR module differs: paper uses the printer's native GS ( k
 * drawing, the preview rasterizes the same content with the `qrcode`
 * library — identical scan result, marginally different module styling.
 */

import { Bitmap, encodePNGToStream } from "pureimage";
import { PassThrough } from "node:stream";
import QRCode from "qrcode";
import {
  DOTS_WIDTH,
  LINE_HEIGHT_NORMAL,
  drawLineBitmap,
  drawRuleBitmap,
  ensureFontsLoaded,
} from "./render-bitmap";
import type { PrintDocument } from "./print-document";
import type { PrintPayload } from "./payloads";
import {
  renderDocumentToOps,
  resolveDocument,
  type RenderOp,
} from "./document-render";

const QR_PAD = LINE_HEIGHT_NORMAL; // breathing room above/below, like paper
const BOTTOM_FEED = 60; // visual stand-in for the trailing paper feed

type Placed =
  | { kind: "bitmap"; bitmap: Bitmap; height: number }
  | { kind: "white"; height: number }
  | { kind: "qr"; matrixSize: number; scale: number; height: number; content: string };

function measure(op: RenderOp): Placed {
  switch (op.kind) {
    case "line": {
      const bitmap = drawLineBitmap(op.text, op.opts);
      return { kind: "bitmap", bitmap, height: bitmap.height };
    }
    case "rule": {
      const bitmap = drawRuleBitmap(op.thickness);
      return { kind: "bitmap", bitmap, height: bitmap.height };
    }
    case "blank":
      return { kind: "white", height: op.height };
    case "qr": {
      const matrix = QRCode.create(op.content, {
        errorCorrectionLevel: "M",
      }).modules;
      const scale = Math.max(2, op.dotSize);
      const height = matrix.size * scale + QR_PAD * 2;
      return {
        kind: "qr",
        matrixSize: matrix.size,
        scale,
        height,
        content: op.content,
      };
    }
  }
}

/** Render ops to a PNG buffer (576px wide, white background). */
export async function renderOpsToPng(opsList: RenderOp[]): Promise<Buffer> {
  await ensureFontsLoaded();

  const placed = opsList.map(measure);
  const totalHeight =
    placed.reduce((sum, p) => sum + p.height, 0) + BOTTOM_FEED;

  const page = new Bitmap(DOTS_WIDTH, Math.max(totalHeight, 1));
  const ctx = page.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, DOTS_WIDTH, page.height);

  let y = 0;
  for (const item of placed) {
    if (item.kind === "bitmap") {
      // Widths match (576) → copy raw RGBA rows directly.
      page.data.set(item.bitmap.data, y * DOTS_WIDTH * 4);
    } else if (item.kind === "qr") {
      const matrix = QRCode.create(item.content, {
        errorCorrectionLevel: "M",
      }).modules;
      const qrDim = item.matrixSize * item.scale;
      const x0 = Math.floor((DOTS_WIDTH - qrDim) / 2);
      const y0 = y + QR_PAD;
      ctx.fillStyle = "black";
      for (let row = 0; row < matrix.size; row += 1) {
        for (let col = 0; col < matrix.size; col += 1) {
          if (matrix.get(row, col)) {
            ctx.fillRect(
              x0 + col * item.scale,
              y0 + row * item.scale,
              item.scale,
              item.scale,
            );
          }
        }
      }
    }
    y += item.height;
  }

  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on("data", (chunk: Buffer) => chunks.push(chunk));
  await encodePNGToStream(page, stream);
  return Buffer.concat(chunks);
}

/** Render a print document to a PNG buffer. */
export async function renderDocumentToPng(
  document: PrintDocument,
): Promise<Buffer> {
  return renderOpsToPng(renderDocumentToOps(document));
}

/** Render a payload (document or fallback) to a PNG buffer. */
export async function renderPayloadToPng(
  payload: PrintPayload,
): Promise<Buffer> {
  return renderDocumentToPng(resolveDocument(payload));
}
