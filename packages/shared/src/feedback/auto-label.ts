/**
 * Auto-generate a human-readable label for QR codes (D5 spec).
 * Format: "{branch_name} — Bàn {table_label}" or "{branch_name} — Chung"
 */
export function buildQrLabel(args: {
  branch_name: string;
  /** null = general QR (not tied to a specific table) */
  table_label: string | null;
}): string {
  const branch = args.branch_name.trim();
  if (args.table_label === null || args.table_label.trim().length === 0) {
    return `${branch} — Chung`;
  }
  return `${branch} — Bàn ${args.table_label.trim()}`;
}
