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

export async function captureScenario(
  page: Page,
  browser: Browser,
  scenario: Scenario,
): Promise<string> {
  await scenario.setup(page);

  // Wait an extra beat for layout settle (animations, fonts).
  await page.waitForTimeout(400);

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
  const composeContext = await browser.newContext({
    viewport: { width: CANVAS.width, height: CANVAS.height },
    deviceScaleFactor: 2,
  });
  const composePage = await composeContext.newPage();

  // waitUntil: "load" → đợi `load` event = mọi <img> (kể cả base64 inline)
  // đã decode xong. Không cần page.evaluate riêng để poll img.complete.
  await composePage.setContent(
    composeHtml({
      screenshotBase64: shotBase64,
      step: scenario.step,
      annotations: resolved,
    }),
    { waitUntil: "load" },
  );

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
