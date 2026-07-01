"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: legacy inline Vietnamese copy in ingredient import/export dialog */

import { useRef, useState, useTransition } from "react";
import {
  CircleAlert as IconAlertCircle,
  Download as IconDownload,
  Sheet as IconFileSpreadsheet,
  Upload as IconUpload,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { toast } from "@comtammatu/ui/components/sonner";
import { downloadCsv, downloadXlsx } from "@/_lib/download-file";
import {
  downloadIngredientTemplate,
  exportIngredients,
  importIngredients,
  type ImportIngredientIssue,
  type ImportIngredientSummary,
} from "../ingredient-actions";

import { ACTIONS_VI, INVENTORY_VI, TOAST_VI } from "@comtammatu/shared/messages";
export function IngredientImportExportMenu({
  onImported,
}: {
  onImported?: () => void;
}) {
  const [isExporting, startExport] = useTransition();
  const [importOpen, setImportOpen] = useState(false);

  function handleExport(format: "xlsx" | "csv") {
    startExport(async () => {
      const res = await exportIngredients(format);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      if (format === "csv") {
        downloadCsv(res.data.base64, res.data.filename);
      } else {
        downloadXlsx(res.data.base64, res.data.filename);
      }
      toast.success(TOAST_VI.exported);
    });
  }

  function handleTemplate() {
    startExport(async () => {
      const res = await downloadIngredientTemplate();
      if (!res.success || !res.data) {
        toast.error(res.error ?? INVENTORY_VI.templateCreateFailed);
        return;
      }
      const data = res.data as { base64: string; filename: string };
      downloadXlsx(data.base64, data.filename);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={isExporting}>
            {isExporting ? (
              <Spinner className="mr-2" />
            ) : (
              <IconFileSpreadsheet className="mr-2 size-4" />
            )}
            Import / Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setImportOpen(true)}>
            <IconUpload className="mr-2 size-4" />
            {INVENTORY_VI.importFromFile}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleTemplate}>
            <IconFileSpreadsheet className="mr-2 size-4" />
            {INVENTORY_VI.downloadTemplate}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleExport("xlsx")}>
            <IconDownload className="mr-2 size-4" />
            {INVENTORY_VI.exportXlsx}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("csv")}>
            <IconDownload className="mr-2 size-4" />
            {INVENTORY_VI.exportCsv}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <IngredientImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={onImported}
      />
    </>
  );
}

function IngredientImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [issues, setIssues] = useState<ImportIngredientIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportIngredientSummary | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setIssues([]);
    setError(null);
    setSummary(null);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(INVENTORY_VI.selectFile);
      return;
    }
    const fd = new FormData();
    fd.append("file", file);

    startTransition(async () => {
      setError(null);
      setIssues([]);
      setSummary(null);
      const res = await importIngredients(fd);
      if (!res.success) {
        setError(res.error);
        if (res.issues) setIssues(res.issues);
        return;
      }
      setSummary(res.data.summary);
      toast.success(
        `Đã import: +${res.data.summary.inserted} / ${res.data.summary.updated} cập nhật`,
      );
      onImported?.();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{INVENTORY_VI.importIngredientsTitle}</DialogTitle>
          <DialogDescription>
            Hỗ trợ .xlsx và .csv. Dòng trùng <strong>tên nguyên liệu</strong> sẽ
            được cập nhật.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ing-import-file" className="text-sm font-medium">
              {INVENTORY_VI.chooseFileLabel}
            </Label>
            <Input
              id="ing-import-file"
              ref={fileRef}
              type="file"
              accept=".xlsx,.xlsm,.csv"
              required
              onChange={(e) => {
                setFileName(e.currentTarget.files?.[0]?.name ?? "");
                setError(null);
                setIssues([]);
              }}
              className="w-full file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted/70 h-auto"
            />
            {fileName ? (
              <p className="text-xs text-muted-foreground">
                Đã chọn: {fileName}
              </p>
            ) : null}
          </div>

          {error ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <IconAlertCircle className="size-4 shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          ) : null}

          {issues.length > 0 ? (
            <div className="max-h-52 overflow-auto rounded-md border bg-muted/30 p-2 text-sm">
              <ItemGroup className="flex flex-col gap-1 p-0 rounded-none border-0">
                {issues.slice(0, 50).map((iss, idx) => (
                  <Item key={idx} className="flex gap-2 p-0 rounded-none border-0 min-h-0">
                    <span className="font-mono text-xs text-muted-foreground">
                      [dòng {iss.row}]
                    </span>
                    <span>{iss.message}</span>
                  </Item>
                ))}
                {issues.length > 50 ? (
                  <Item className="text-xs text-muted-foreground p-0 rounded-none border-0 min-h-0">
                    …và {issues.length - 50} lỗi khác
                  </Item>
                ) : null}
              </ItemGroup>
            </div>
          ) : null}

          {summary ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-medium">{INVENTORY_VI.importResultHeading}</p>
              <p className="mt-1 text-muted-foreground">
                Tạo mới {summary.inserted} · Cập nhật {summary.updated}
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isPending}
            >
              {ACTIONS_VI.close}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner className="mr-2" />}
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
