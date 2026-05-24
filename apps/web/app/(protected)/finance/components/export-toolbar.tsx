"use client";

import { useState } from "react";
import { Copy, Download } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { cn } from "@comtammatu/ui/lib/utils";
import { messages } from "@lib/messages";
import { formatVNDateTime } from "@/_lib/format-datetime";

const exportCopy = messages.finance.exportToolbar;

// CSV export with explicit filter signature (Critic R8: snapshot the
// active filters at click time so the downloaded file's totals match
// what the owner saw on screen). Filter signature appears on row 1 as
// a comment-style line; row 2 is the data header.
//
// Locale rules:
//   • semicolon separator (Excel VN locale parses comma as decimal)
//   • UTF-8 BOM so Excel keeps Vietnamese diacritics
//   • Numbers as raw integers (no thousand separator) — Excel formats

export interface CsvFilterSignature {
  /** "branch=all", "branch=Cơ Cao Thắng" */
  branchLabel: string;
  /** "MTD · 2026-05-01 → 2026-05-06" */
  rangeLabel: string;
  /** "Theo ngày", "Theo tuần", "Theo tháng" */
  granularityLabel: string;
  /** Optional extra dimensions e.g. "Cash only" */
  extra?: string[];
}

export interface CsvSection {
  /** Optional section title (rendered as its own row) */
  title?: string;
  /** Header row */
  header: string[];
  /** Body rows (each item is a row of cell values) */
  rows: Array<Array<string | number>>;
  /** Optional footer/total row */
  footer?: Array<string | number>;
}

interface ExportToolbarProps {
  filename: string;
  signature: CsvFilterSignature;
  sections: CsvSection[];
  className?: string;
  /** Disable when there's nothing to export */
  disabled?: boolean;
}

const SEP = ";";

function escape(value: string | number): string {
  const s = String(value);
  return s.includes(SEP) || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function buildCsv(
  signature: CsvFilterSignature,
  sections: CsvSection[],
): string {
  const lines: string[] = [];
  // Filter signature lines — owner can re-apply filters from the file.
  lines.push(escape(exportCopy.headerBranch(signature.branchLabel)));
  lines.push(escape(exportCopy.headerRange(signature.rangeLabel)));
  lines.push(escape(exportCopy.headerGranularity(signature.granularityLabel)));
  if (signature.extra && signature.extra.length > 0) {
    lines.push(escape(exportCopy.headerExtra(signature.extra.join(" · "))));
  }
  lines.push(
    escape(exportCopy.headerExportedAt(formatVNDateTime(new Date()))),
  );
  lines.push("");

  for (const section of sections) {
    if (section.title) {
      lines.push(escape(`## ${section.title}`));
    }
    lines.push(section.header.map(escape).join(SEP));
    for (const row of section.rows) {
      lines.push(row.map(escape).join(SEP));
    }
    if (section.footer) {
      lines.push(section.footer.map(escape).join(SEP));
    }
    lines.push("");
  }

  // UTF-8 BOM keeps Excel happy with VN diacritics.
  return "﻿" + lines.join("\n");
}

type CopyState = "idle" | "ok" | "error";

export function ExportToolbar({
  filename,
  signature,
  sections,
  className,
  disabled,
}: ExportToolbarProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  function handleDownload() {
    const csv = buildCsv(signature, sections);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleCopy() {
    const csv = buildCsv(signature, sections);
    try {
      await navigator.clipboard.writeText(csv);
      setCopyState("ok");
    } catch {
      setCopyState("error");
    }
    setTimeout(() => setCopyState("idle"), 2000);
  }

  const isDisabled = disabled || sections.every((s) => s.rows.length === 0);

  const copyLabel =
    copyState === "ok"
      ? exportCopy.copyOk
      : copyState === "error"
        ? exportCopy.copyError
        : exportCopy.copy;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
        disabled={isDisabled}
        className="gap-1.5"
      >
        <Copy className="size-3.5" aria-hidden />
        {copyLabel}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={isDisabled}
        className="gap-1.5"
      >
        <Download className="size-3.5" aria-hidden />
        {exportCopy.download}
      </Button>
    </div>
  );
}
