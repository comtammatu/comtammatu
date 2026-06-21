export * from "./payloads";
export * from "./print-document";
export {
  PRINT_KINDS,
  DEFAULT_TEMPLATE_CONTENT,
  TEMPLATE_VARIABLES,
  type PrintKind,
  type TemplateBlock,
  type TemplateCompositeType,
  type TemplateCondition,
  type TemplateContent,
} from "./template-content";
export {
  blockVisible,
  interpolate,
  materializeDocument,
  payloadText,
  type MaterializeMeta,
} from "./materialize";
export { buildFallbackDocument } from "./fallback-document";
export {
  renderDocumentToOps,
  resolveDocument,
  type RenderOp,
} from "./document-render";
export {
  encodeOpsToEscpos,
  renderPayloadBitmap,
} from "./escpos-encode";
export {
  CHARS_PER_LINE_DOUBLE,
  CHARS_PER_LINE_NORMAL,
  DOTS_WIDTH,
  blankLine,
  drawLineBitmap,
  ensureFontsLoaded,
  lineSpacingDefault,
  lineSpacingZero,
  renderLineRaster,
  type RenderOpts,
} from "./render-bitmap";
export {
  extractOrderSequence,
  formatOrderHeaderLabel,
} from "./order-display";
export { sideTotalQuantity } from "./quantity";
export { SAMPLE_PAYLOADS } from "./samples";
