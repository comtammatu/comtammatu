"use client";

import { useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
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
} from "../actions";

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
      toast.success("Đã xuất file");
    });
  }

  function handleTemplate() {
    startExport(async () => {
      const res = await downloadIngredientTemplate();
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không tạo được template");
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
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 size-4" />
            )}
            Import / Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 size-4" />
            Import từ file
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleTemplate}>
            <FileSpreadsheet className="mr-2 size-4" />
            Tải template (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleExport("xlsx")}>
            <Download className="mr-2 size-4" />
            Export .xlsx
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("csv")}>
            <Download className="mr-2 size-4" />
            Export .csv
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
      setError("Vui lòng chọn file");
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
          <DialogTitle>Import nguyên liệu từ file</DialogTitle>
          <DialogDescription>
            Hỗ trợ .xlsx và .csv. Dòng trùng <strong>tên nguyên liệu</strong>{" "}
            sẽ được cập nhật.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="ing-import-file"
              className="text-sm font-medium"
            >
              Chọn file (.xlsx, .csv)
            </label>
            <input
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
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted/70"
            />
            {fileName ? (
              <p className="text-xs text-muted-foreground">
                Đã chọn: {fileName}
              </p>
            ) : null}
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          ) : null}

          {issues.length > 0 ? (
            <div className="max-h-52 overflow-auto rounded-md border bg-muted/30 p-2 text-sm">
              <ul className="space-y-1">
                {issues.slice(0, 50).map((iss, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      [dòng {iss.row}]
                    </span>
                    <span>{iss.message}</span>
                  </li>
                ))}
                {issues.length > 50 ? (
                  <li className="text-xs text-muted-foreground">
                    …và {issues.length - 50} lỗi khác
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {summary ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-medium">Kết quả</p>
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
              Đóng
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
