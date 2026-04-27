// Replace `{placeholder}` tokens in a template string. Unknown keys are
// preserved as-is so missing values are visible in UI instead of silently empty.
export function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = vars[key];
    return val === undefined ? `{${key}}` : String(val);
  });
}
