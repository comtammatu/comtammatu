/**
 * Scenario + annotation contract cho user-guide capture.
 *
 * Annotation toạ độ tính theo viewport gốc (390×844) — frame.ts tự offset
 * khi vẽ vào composed canvas.
 */

import type { Page } from "@playwright/test";

/** Annotation tap target — vẽ vòng tròn highlight + label tuỳ chọn. */
export interface AnnotationTap {
  type: "tap";
  /** CSS selector — capture.ts tự resolve sang toạ độ qua boundingBox(). */
  selector: string;
  label?: string;
}

/** Annotation highlight — viền nét đứt dùng để chỉ vùng quan trọng. */
export interface AnnotationHighlight {
  type: "highlight";
  selector: string;
}

/** Annotation callout — speech bubble có mũi tên trỏ. */
export interface AnnotationCalloutSelector {
  type: "callout";
  selector: string;
  /** Vị trí callout so với target. */
  placement: "above" | "below" | "left" | "right";
  text: string;
}

/** Annotation callout fixed coords — dùng khi không có selector ổn định. */
export interface AnnotationCalloutCoord {
  type: "callout-coord";
  /** Toạ độ điểm trỏ (mũi tên hướng đến). Trong toạ độ viewport gốc. */
  anchorX: number;
  anchorY: number;
  placement: "above" | "below" | "left" | "right";
  text: string;
}

export type Annotation =
  | AnnotationTap
  | AnnotationHighlight
  | AnnotationCalloutSelector
  | AnnotationCalloutCoord;

/** Annotation đã resolve (selector → coord) sẵn sàng đưa vào frame template. */
export type ResolvedAnnotation =
  | {
      type: "tap";
      x: number;
      y: number;
      width: number;
      height: number;
      label?: string;
    }
  | { type: "highlight"; x: number; y: number; width: number; height: number }
  | {
      type: "callout";
      anchorX: number;
      anchorY: number;
      placement: "above" | "below" | "left" | "right";
      text: string;
    };

export interface Scenario {
  /** Unique trong flow, ví dụ "step-01-form-empty". File ảnh sẽ là `<flowId>-<id>.png`. */
  id: string;
  /** Flow ID, ví dụ "pos-01". Map sang folder `docs/user-guides/<module>/mockups/<flowId>/`. */
  flowId: string;
  /** Module slug, ví dụ "pos". */
  module: string;
  step: {
    number: number;
    total: number;
    title: string;
  };
  /**
   * Setup chạy trước khi screenshot. Nhận `page` đã navigate sẵn về POS root
   * (hoặc bất kỳ URL nào nếu setup tự navigate).
   */
  setup: (page: Page) => Promise<void>;
  annotations?: Annotation[];
}
