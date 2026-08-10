import { z } from "zod";
import { getStatusBadgeMeta } from "@/components/status-badge";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { INVENTORY_VI } from "@comtammatu/shared/messages";

export const ISSUE_TYPES = [
  { value: "consumption", label: INVENTORY_VI.issueTypeConsumption },
  { value: "writeoff", label: INVENTORY_VI.issueTypeWriteoff },
] as const;

export function issueTypeLabel(type: string, branchKind: string | null): string {
  void branchKind;
  return ISSUE_TYPES.find((o) => o.value === type)?.label ?? UNKNOWN_LABEL_VI;
}

export const STATE_FILTER_OPTIONS = ["draft", "confirmed", "cancelled"].map(
  (value) => ({
    value,
    label: getStatusBadgeMeta("inventory", value).label,
  }),
);

// Filter options show generic labels (no branch context at the filter level).
export const TYPE_FILTER_OPTIONS = [
  { value: "all", label: INVENTORY_VI.issueTypeFilterAll },
  { value: "consumption", label: INVENTORY_VI.issueTypeConsumption },
  { value: "writeoff", label: INVENTORY_VI.issueTypeWriteoff },
];

export const labelBranchExportSuffix = " xuất";
export const labelBranchExportPrefix = " xuất: ";

export const createIssueSchema = z.object({
  branchId: z
    .string()
    .min(1, { error: INVENTORY_VI.issueCreateBranchRequired }),
  issueType: z.enum(["consumption"]),
  notes: z.string().trim().optional(),
});

export type CreateIssueValues = z.infer<typeof createIssueSchema>;

export function csvCell(value: string | number): string {
  const raw = String(value);
  // Prevent spreadsheet formula injection on cells starting with =, +, -, @, tab, CR.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function toUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function buildListHref(listBasePath: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${listBasePath}?${query}` : listBasePath;
}

export function readListFilterParams(searchParams: URLSearchParams) {
  return {
    status: searchParams.get("status") ?? "all",
    type: searchParams.get("type") ?? "all",
    q: searchParams.get("q") ?? "",
  };
}

export function patchListFilterParams(
  searchParams: URLSearchParams,
  patch: { status?: string; type?: string; q?: string },
): URLSearchParams {
  const next = new URLSearchParams(searchParams.toString());
  for (const [key, value] of Object.entries(patch)) {
    const normalized = value?.trim() ?? "";
    if (!normalized || normalized === "all") {
      next.delete(key);
    } else {
      next.set(key, normalized);
    }
  }
  return next;
}

export function buildIssuesExportCsv(
  rows: Array<{
    code: string;
    type: string;
    branchKind: string | null;
    branchName: string;
    date: string;
    status: string;
  }>,
  labels: {
    issueCode: string;
    issueTypeLabel: string;
    branchLong: string;
    createdDate: string;
    status: string;
  },
): string {
  const header = [
    labels.issueCode,
    labels.issueTypeLabel,
    labels.branchLong,
    labels.createdDate,
    labels.status,
  ];
  const bodyRows = rows.map((row) => [
    row.code,
    issueTypeLabel(row.type, row.branchKind),
    row.branchName,
    row.date,
    row.status,
  ]);
  return [header, ...bodyRows]
    .map((line) => line.map((cell) => csvCell(cell)).join(","))
    .join("\n");
}

export function buildRecordedExportCsv(
  flatRows: Array<{
    orderNumber: string;
    recordedAtLabel: string;
    branchName: string;
    sourceLabel: string;
    line: {
      ingredientName: string;
      locationName: string;
      quantityLabel: string;
      unitCostLabel?: string | null;
      totalCostLabel?: string | null;
    };
  }>,
  header: string[],
): string {
  const rows = flatRows.map(
    ({ orderNumber, recordedAtLabel, branchName, sourceLabel, line }) => {
      const base = [
        orderNumber,
        recordedAtLabel,
        line.ingredientName,
        branchName,
        line.locationName,
        line.quantityLabel,
      ];
      const monetary =
        header.length > base.length + 1
          ? [line.unitCostLabel ?? "—", line.totalCostLabel ?? "—"]
          : [];
      return [...base, ...monetary, sourceLabel];
    },
  );
  return [header, ...rows]
    .map((line) => line.map((cell) => csvCell(cell)).join(","))
    .join("\n");
}

export function exportCsvStamp(): string {
  return new Date()
    .toISOString()
    .slice(0, 19)
    .replaceAll(":", "-")
    .replace("T", "-");
}
