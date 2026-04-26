/**
 * HTML template ghép iPhone bezel + annotation overlay quanh screenshot gốc.
 *
 * Output sẽ được render trong page thứ 2 (kích thước CANVAS), sau đó
 * Playwright screenshot toàn page → composed PNG cuối cùng.
 *
 * Toạ độ annotation (tap/highlight box, callout anchor) tính theo viewport
 * gốc (VIEWPORT.width × VIEWPORT.height). Template tự offset bằng
 * (CANVAS_PADDING + BEZEL) để map sang composed canvas.
 */

import {
  BEZEL,
  CANVAS,
  CANVAS_PADDING,
  HEADER_HEIGHT,
  VIEWPORT,
} from "./paths";
import type { ResolvedAnnotation } from "./types";

interface ComposeInput {
  /** PNG screenshot raw (Buffer) → encode base64 trong template. */
  screenshotBase64: string;
  step: { number: number; total: number; title: string };
  annotations: ResolvedAnnotation[];
}

const SCREEN_OFFSET_X = CANVAS_PADDING + BEZEL;
const SCREEN_OFFSET_Y = HEADER_HEIGHT + CANVAS_PADDING + BEZEL;

const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function renderAnnotation(a: ResolvedAnnotation): string {
  if (a.type === "tap") {
    const padding = 6;
    const x = a.x - padding;
    const y = a.y - padding;
    const w = a.width + padding * 2;
    const h = a.height + padding * 2;
    const labelEl = a.label
      ? `<g>
          <rect x="${String(x)}" y="${String(y - 22)}" rx="4" ry="4"
            width="${String(Math.max(40, a.label.length * 7 + 12))}" height="18"
            fill="#ef4444" />
          <text x="${String(x + 6)}" y="${String(y - 9)}"
            font-family="-apple-system, system-ui, sans-serif"
            font-size="11" font-weight="600" fill="white">${escapeHtml(a.label)}</text>
        </g>`
      : "";
    return `
      <rect x="${String(x)}" y="${String(y)}" width="${String(w)}" height="${String(h)}"
        rx="10" ry="10"
        fill="none" stroke="#ef4444" stroke-width="3" stroke-dasharray="0" />
      ${labelEl}
    `;
  }

  if (a.type === "highlight") {
    const padding = 4;
    return `
      <rect x="${String(a.x - padding)}" y="${String(a.y - padding)}"
        width="${String(a.width + padding * 2)}" height="${String(a.height + padding * 2)}"
        rx="8" ry="8"
        fill="rgba(250, 204, 21, 0.18)"
        stroke="#facc15" stroke-width="2" stroke-dasharray="6 4" />
    `;
  }

  // callout
  const charWidth = 6.6;
  const padX = 12;
  const padY = 8;
  const lines = a.text.split("\n");
  const longestLine = Math.max(...lines.map((l) => l.length));
  const boxW = Math.min(220, Math.max(80, longestLine * charWidth + padX * 2));
  const lineHeight = 16;
  const boxH = lines.length * lineHeight + padY * 2;

  let boxX = a.anchorX;
  let boxY = a.anchorY;
  const arrowSize = 8;
  let arrowPath = "";

  switch (a.placement) {
    case "above":
      boxX = a.anchorX - boxW / 2;
      boxY = a.anchorY - boxH - arrowSize;
      arrowPath = `M ${String(a.anchorX - arrowSize)},${String(a.anchorY - arrowSize)}
                   L ${String(a.anchorX)},${String(a.anchorY)}
                   L ${String(a.anchorX + arrowSize)},${String(a.anchorY - arrowSize)} Z`;
      break;
    case "below":
      boxX = a.anchorX - boxW / 2;
      boxY = a.anchorY + arrowSize;
      arrowPath = `M ${String(a.anchorX - arrowSize)},${String(a.anchorY + arrowSize)}
                   L ${String(a.anchorX)},${String(a.anchorY)}
                   L ${String(a.anchorX + arrowSize)},${String(a.anchorY + arrowSize)} Z`;
      break;
    case "left":
      boxX = a.anchorX - boxW - arrowSize;
      boxY = a.anchorY - boxH / 2;
      arrowPath = `M ${String(a.anchorX - arrowSize)},${String(a.anchorY - arrowSize)}
                   L ${String(a.anchorX)},${String(a.anchorY)}
                   L ${String(a.anchorX - arrowSize)},${String(a.anchorY + arrowSize)} Z`;
      break;
    case "right":
      boxX = a.anchorX + arrowSize;
      boxY = a.anchorY - boxH / 2;
      arrowPath = `M ${String(a.anchorX + arrowSize)},${String(a.anchorY - arrowSize)}
                   L ${String(a.anchorX)},${String(a.anchorY)}
                   L ${String(a.anchorX + arrowSize)},${String(a.anchorY + arrowSize)} Z`;
      break;
  }

  // Clamp box vào viewport
  boxX = Math.max(8, Math.min(VIEWPORT.width - boxW - 8, boxX));
  boxY = Math.max(8, Math.min(VIEWPORT.height - boxH - 8, boxY));

  const textEls = lines
    .map(
      (line, i) =>
        `<text x="${String(boxX + padX)}" y="${String(boxY + padY + (i + 1) * lineHeight - 4)}"
          font-family="-apple-system, system-ui, sans-serif"
          font-size="12" fill="white">${escapeHtml(line)}</text>`,
    )
    .join("");

  return `
    <path d="${arrowPath}" fill="#1e293b" />
    <rect x="${String(boxX)}" y="${String(boxY)}" width="${String(boxW)}" height="${String(boxH)}"
      rx="8" ry="8" fill="#1e293b" />
    ${textEls}
  `;
}

export function composeHtml(input: ComposeInput): string {
  const annotationsSvg = input.annotations.map(renderAnnotation).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${String(CANVAS.width)}px;
    height: ${String(CANVAS.height)}px;
    background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    overflow: hidden;
  }
  .header {
    position: absolute;
    top: ${String(CANVAS_PADDING - 4)}px;
    left: ${String(CANVAS_PADDING)}px;
    right: ${String(CANVAS_PADDING)}px;
    height: ${String(HEADER_HEIGHT)}px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .step-badge {
    flex-shrink: 0;
    padding: 6px 14px;
    background: #ef4444;
    color: white;
    font-size: 13px;
    font-weight: 700;
    border-radius: 999px;
    letter-spacing: 0.02em;
  }
  .step-title {
    flex: 1;
    text-align: right;
    color: #0f172a;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .iphone {
    position: absolute;
    top: ${String(HEADER_HEIGHT + CANVAS_PADDING)}px;
    left: ${String(CANVAS_PADDING)}px;
    width: ${String(VIEWPORT.width + BEZEL * 2)}px;
    height: ${String(VIEWPORT.height + BEZEL * 2)}px;
    background: #0f172a;
    border-radius: 48px;
    padding: ${String(BEZEL)}px;
    box-shadow:
      0 25px 50px rgba(15, 23, 42, 0.25),
      0 12px 24px rgba(15, 23, 42, 0.15);
  }
  .screen {
    position: relative;
    width: ${String(VIEWPORT.width)}px;
    height: ${String(VIEWPORT.height)}px;
    overflow: hidden;
    border-radius: 36px;
    background: white;
  }
  .screen img.shot {
    display: block;
    width: ${String(VIEWPORT.width)}px;
    height: ${String(VIEWPORT.height)}px;
  }
  .island {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 110px;
    height: 30px;
    background: #000;
    border-radius: 16px;
    z-index: 5;
    pointer-events: none;
  }
  .annotations {
    position: absolute;
    top: 0;
    left: 0;
    width: ${String(VIEWPORT.width)}px;
    height: ${String(VIEWPORT.height)}px;
    pointer-events: none;
  }
</style>
</head>
<body>
  <header class="header">
    <span class="step-badge">Bước ${String(input.step.number)}/${String(input.step.total)}</span>
    <span class="step-title">${escapeHtml(input.step.title)}</span>
  </header>
  <div class="iphone">
    <div class="screen">
      <img class="shot" src="data:image/png;base64,${input.screenshotBase64}" alt="" />
      <div class="island"></div>
      <svg class="annotations" viewBox="0 0 ${String(VIEWPORT.width)} ${String(VIEWPORT.height)}">
        ${annotationsSvg}
      </svg>
    </div>
  </div>
</body>
</html>`;
}

/** Re-export để guide spec không cần import paths riêng nếu chỉ cần offsets. */
export { SCREEN_OFFSET_X, SCREEN_OFFSET_Y };
