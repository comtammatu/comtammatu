/**
 * captureScenario — chạy 1 scenario, screenshot, ghép iPhone frame +
 * annotations, ghi PNG vào docs/user-guides/<module>/mockups/<flowId>/.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Browser, Page } from "@playwright/test";
import { composeHtml } from "./frame";
import { CANVAS, mockupPath } from "./paths";
import type { Annotation, ResolvedAnnotation, Scenario } from "./types";

async function resolveAnnotation(
  page: Page,
  a: Annotation,
): Promise<ResolvedAnnotation | null> {
  if (a.type === "tap" || a.type === "highlight") {
    const box = await page.locator(a.selector).first().boundingBox();
    if (!box) {
      console.warn(`[guides] selector không match: ${a.selector}`);
      return null;
    }
    if (a.type === "tap") {
      return {
        type: "tap",
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        ...(a.label !== undefined ? { label: a.label } : {}),
      };
    }
    return {
      type: "highlight",
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
  }

  if (a.type === "callout") {
    const box = await page.locator(a.selector).first().boundingBox();
    if (!box) {
      console.warn(`[guides] callout selector không match: ${a.selector}`);
      return null;
    }
    let anchorX = box.x + box.width / 2;
    let anchorY = box.y + box.height / 2;
    switch (a.placement) {
      case "above":
        anchorY = box.y;
        break;
      case "below":
        anchorY = box.y + box.height;
        break;
      case "left":
        anchorX = box.x;
        break;
      case "right":
        anchorX = box.x + box.width;
        break;
    }
    return {
      type: "callout",
      anchorX,
      anchorY,
      placement: a.placement,
      text: a.text,
    };
  }

  // callout-coord
  return {
    type: "callout",
    anchorX: a.anchorX,
    anchorY: a.anchorY,
    placement: a.placement,
    text: a.text,
  };
}

/**
 * Hide chrome that polutes guide mockups:
 *   - Next.js dev "Rendering..." indicator (bottom-left bubble)
 *   - Skeleton placeholders that haven't finished animating
 *   - Anything tagged data-volatile=true (timestamps, counters)
 *
 * Inject CSS via addStyleTag — survives client-side re-renders within page.
 */
async function hideDevChrome(page: Page): Promise<void> {
  await page
    .addStyleTag({
      content: `
        nextjs-portal,
        [data-nextjs-toast],
        [data-nextjs-dialog-overlay],
        [data-nextjs-dialog],
        #__next-build-watcher,
        [data-volatile="true"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
        }
      `,
    })
    .catch(() => {
      // best-effort — page may have closed mid-call
    });
}

export async function captureScenario(
  page: Page,
  browser: Browser,
  scenario: Scenario,
): Promise<string> {
  await scenario.setup(page);

  // Hide Next dev overlay + skeleton noise BEFORE settle wait.
  await hideDevChrome(page);

  // Đợi fonts ready để tránh capture chữ FOUT (Flash of Unstyled Text).
  // Best-effort: nếu page đóng giữa chừng, bỏ qua và dùng screenshot ngay.
  try {
    await page.evaluate(() => document.fonts.ready);
  } catch {
    // page closed / fonts API unavailable
  }

  // Wait an extra beat for layout settle (animations, fonts).
  try {
    await page.waitForTimeout(400);
  } catch {
    // page closed
  }

  // Resolve annotations BEFORE screenshot (DOM positions stable).
  const resolved: ResolvedAnnotation[] = [];
  for (const a of scenario.annotations ?? []) {
    const r = await resolveAnnotation(page, a);
    if (r) resolved.push(r);
  }

  // Clean viewport screenshot (no overlay, no bezel).
  const shotBuf = await page.screenshot({ fullPage: false });
  const shotBase64 = shotBuf.toString("base64");

  // Compose iPhone frame + annotations in a 2nd page.
  // Explicit deviceScaleFactor:1 — Playwright Chromium khi DPR>1 sẽ
  // interpret viewport như device-px, làm body width:418px chỉ fill nửa
  // viewport. PNG output ở 1x (CSS px), đủ nét cho user-guide markdown.
  const composeContext = await browser.newContext({
    viewport: { width: CANVAS.width, height: CANVAS.height },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });
  const composePage = await composeContext.newPage();

  const composed = composeHtml({
    screenshotBase64: shotBase64,
    step: scenario.step,
    annotations: resolved,
  });

  // Set GUIDES_DUMP_HTML=1 để dump composed HTML cùng folder mockup —
  // debug khi annotation/frame render lệch. File hậu tố `.debug.html`.
  if (process.env.GUIDES_DUMP_HTML === "1") {
    const dumpPath = mockupPath(
      scenario.module,
      scenario.flowId,
      scenario.id,
    ).replace(/\.png$/, ".debug.html");
    await fs.writeFile(dumpPath, composed);
  }

  // waitUntil: "load" → đợi `load` event = mọi <img> (kể cả base64 inline)
  // đã decode xong.
  await composePage.setContent(composed, { waitUntil: "load" });

  const composedBuf = await composePage.screenshot({
    type: "png",
    fullPage: false,
  });
  await composeContext.close();

  const outPath = mockupPath(scenario.module, scenario.flowId, scenario.id);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, composedBuf);

  return outPath;
}
