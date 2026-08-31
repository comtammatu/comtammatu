"use client";

import type { ComponentProps, ReactNode } from "react";
import { useRef, useState } from "react";
import { Printer as IconPrinter } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppDialog } from "@/components/form";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { printDocumentElement } from "@lib/printing/print-document";

const copy = messages.inventory.documentPrint;

export type InventoryA4PrintColumn = {
  key: string;
  label: ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
};

export type InventoryA4PrintRow = {
  key: string | number;
  cells: Record<string, ReactNode>;
};

export type InventoryA4PrintMeta = {
  label: string;
  value: ReactNode;
  wide?: boolean;
};

export type InventoryA4PrintSummary = {
  label: string;
  value: ReactNode;
  emphasis?: boolean;
};

type InventoryA4PrintDialogProps = {
  previewTitle: string;
  previewDescription: string;
  documentTitle: string;
  documentNumber: string;
  branchName: string;
  metadata: InventoryA4PrintMeta[];
  columns: InventoryA4PrintColumn[];
  rows: InventoryA4PrintRow[];
  summaries: InventoryA4PrintSummary[];
  signatures: string[];
  note?: string | null;
  buttonLabel?: string;
  buttonVariant?: ComponentProps<typeof Button>["variant"];
  buttonSize?: ComponentProps<typeof Button>["size"];
};

function alignmentClass(align: InventoryA4PrintColumn["align"]): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

export function InventoryA4PrintDialog({
  previewTitle,
  previewDescription,
  documentTitle,
  documentNumber,
  branchName,
  metadata,
  columns,
  rows,
  summaries,
  signatures,
  note,
  buttonLabel = copy.printButton,
  buttonVariant = "outline",
  buttonSize = "default",
}: InventoryA4PrintDialogProps) {
  const [open, setOpen] = useState(false);
  const printRef = useRef<HTMLElement>(null);
  const printedAt = formatVNDateTime(new Date());

  const tableColumns: DataTableColumn<InventoryA4PrintRow>[] = columns.map(
    (col) => ({
      key: col.key,
      header: col.label,
      className: cn(
        alignmentClass(col.align),
        col.key !== "item" && "font-mono tabular-nums",
        col.className,
      ),
      render: (row) => row.cells[col.key] ?? "—",
    }),
  );

  return (
    <>
      <Button
        type="button"
        variant={buttonVariant}
        size={buttonSize}
        onClick={() => setOpen(true)}
      >
        <IconPrinter className="size-4" />
        {buttonLabel}
      </Button>

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        variant="document"
        title={previewTitle}
        description={previewDescription}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {copy.close}
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={() => printDocumentElement(printRef.current)}
            >
              <IconPrinter className="size-4" />
              {copy.printNow}
            </Button>
          </div>
        }
      >
        {open ? (
          <div className="overflow-x-auto bg-muted p-3">
            <article
              ref={printRef}
              className="inventory-a4-sheet mx-auto w-full bg-card p-4 text-sm text-card-foreground shadow-xs"
            >
              <header className="flex items-start justify-between gap-4 border-b border-border pb-3 text-xs leading-relaxed">
                <div className="min-w-0">
                  <p className="font-semibold uppercase tracking-wider">
                    {copy.companyName}
                  </p>
                  <p className="font-semibold text-foreground">
                    {copy.brandTitle} — {copy.brandSlogan}
                  </p>
                  <p className="mt-1 break-words">
                    <span className="text-muted-foreground">
                      {copy.branchLabel}
                    </span>{" "}
                    <span className="font-semibold">{branchName}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono font-semibold">{documentNumber}</p>
                  <p className="text-muted-foreground">
                    {copy.printedAt} {printedAt}
                  </p>
                </div>
              </header>

              <div className="my-4 text-center">
                <p className="font-heading text-lg font-semibold uppercase tracking-wide sm:text-xl">
                  {documentTitle}
                </p>
                <p className="mt-1 font-mono text-xs font-semibold">
                  {copy.documentNumberLabel} {documentNumber}
                </p>
              </div>

              <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 bg-muted p-3 text-xs">
                {metadata.map((item) => (
                  <div
                    key={`${item.label}-${String(item.value)}`}
                    className={cn("min-w-0", item.wide && "col-span-2")}
                  >
                    <dt className="inline text-muted-foreground">
                      {item.label}
                    </dt>{" "}
                    <dd className="inline break-words font-semibold">
                      {item.value || "—"}
                    </dd>
                  </div>
                ))}
              </dl>

              <DataTable
                columns={tableColumns}
                data={rows}
                getRowKey={(row) => String(row.key)}
                emptyTitle={copy.emptyLines}
              />

              <div className="inventory-a4-avoid-break ml-auto mt-4 flex max-w-md flex-col gap-2 border-t border-border pt-3 text-xs">
                {summaries.map((summary) => (
                  <div
                    key={summary.label}
                    className={cn(
                      "flex items-baseline justify-between gap-4",
                      summary.emphasis && "text-base font-semibold",
                    )}
                  >
                    <span>{summary.label}</span>
                    <span className="font-mono font-semibold tabular-nums">
                      {summary.value}
                    </span>
                  </div>
                ))}
              </div>

              {note ? (
                <div className="inventory-a4-avoid-break mt-4 border border-border p-3 text-xs">
                  <span className="font-semibold">{copy.noteLabel}</span>{" "}
                  <span className="break-words">{note}</span>
                </div>
              ) : null}

              <div className="inventory-a4-avoid-break mt-8 grid grid-cols-3 gap-4 text-center text-xs">
                {signatures.map((signature) => (
                  <div key={signature}>
                    <p className="font-semibold uppercase tracking-wide">
                      {signature}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {copy.signatureHint}
                    </p>
                    <div className="h-16" />
                    <p className="border-t border-dotted border-border pt-1 text-muted-foreground">
                      {copy.fullNameHint}
                    </p>
                  </div>
                ))}
              </div>

              <footer className="inventory-a4-avoid-break mt-4 border-t border-border pt-2 text-center text-xs text-muted-foreground">
                {copy.footerSystem}
              </footer>
            </article>
          </div>
        ) : null}
      </AppDialog>
    </>
  );
}
