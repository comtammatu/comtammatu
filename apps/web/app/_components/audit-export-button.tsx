"use client";

import { Download } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui/lib/utils";
import {
  buildSemicolonCsv,
  downloadSemicolonCsv,
} from "@/_lib/export-csv";

export function AuditExportButton({
  filename,
  signatureLines,
  header,
  rows,
  label,
  disabled,
  className,
}: {
  filename: string;
  signatureLines: string[];
  header: string[];
  rows: Array<Array<string | number>>;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const isTouchLayout = useIsMobile(1024);
  const isDisabled = Boolean(disabled) || rows.length === 0;

  return (
    <Button
      type="button"
      variant="outline"
      size={isTouchLayout ? "touch" : "sm"}
      className={cn(className)}
      disabled={isDisabled}
      onClick={() => {
        const csv = buildSemicolonCsv({ signatureLines, header, rows });
        downloadSemicolonCsv(filename, csv);
      }}
    >
      <Download aria-hidden />
      {label}
    </Button>
  );
}
