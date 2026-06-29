export type ModifierTone = "negation" | "addition" | "neutral";

/** Classify a modifier label by Vietnamese prefix conventions. */
export function classifyModifier(label: string): ModifierTone {
  const trimmed = label.trim().toLowerCase();
  if (trimmed.startsWith("không ") || trimmed.startsWith("bỏ ")) {
    return "negation";
  }
  if (trimmed.startsWith("thêm ") || trimmed.startsWith("extra ")) {
    return "addition";
  }
  return "neutral";
}
