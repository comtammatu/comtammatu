/**
 * Viewport + output path constants cho guide capture.
 *
 * Đổi VIEWPORT để switch sang iPad / Android tablet — frame.ts và composed
 * canvas tự co theo.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

/** Viewport mobile mặc định (iPhone 13/14). */
export const VIEWPORT = { width: 390, height: 844 } as const;

/** Padding bezel quanh screen (px mỗi cạnh). */
export const BEZEL = 14;

/** Khoảng trống cho header (step badge + title) phía trên iPhone. */
export const HEADER_HEIGHT = 48;

/** Padding tổng quanh iPhone trong composed canvas. */
export const CANVAS_PADDING = 24;

/** Kích thước composed canvas (đầu ra cuối cùng). */
export const CANVAS = {
  width: VIEWPORT.width + BEZEL * 2 + CANVAS_PADDING * 2,
  height:
    VIEWPORT.height + BEZEL * 2 + CANVAS_PADDING * 2 + HEADER_HEIGHT,
} as const;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Gốc repo (4 cấp lên từ apps/web/e2e/guides/_lib/). */
export const REPO_ROOT = path.resolve(__dirname, "../../../../..");

/** Thư mục chứa user guides. */
export const USER_GUIDES_ROOT = path.join(REPO_ROOT, "docs", "user-guides");

/**
 * Trả về đường dẫn tuyệt đối tới mockup PNG.
 * Ví dụ: ("pos", "pos-01", "step-01-form-empty") →
 *   docs/user-guides/pos/mockups/pos-01/pos-01-step-01-form-empty.png
 */
export function mockupPath(
  module: string,
  flowId: string,
  scenarioId: string,
): string {
  return path.join(
    USER_GUIDES_ROOT,
    module,
    "mockups",
    flowId,
    `${flowId}-${scenarioId}.png`,
  );
}
