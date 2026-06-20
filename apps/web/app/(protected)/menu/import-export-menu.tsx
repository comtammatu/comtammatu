"use client";

import { useRef, useState, useTransition } from "react";
import {
  CircleAlert as IconAlertCircle,
  Download as IconDownload,
  Sheet as IconFileSpreadsheet,
  Upload as IconUpload,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
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
  downloadMenuTemplate,
  exportMenu,
  importMenu,
  type ImportIssue,
  type ImportMenuSummary,
} from "./actions";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
export function MenuImportExportMenu() {
  const [isExporting, startExport] = useTransition();
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  function handleExport(format: "xlsx" | "csv") {
    startExport(async () => {
      const res = await exportMenu(format);
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
      const res = await downloadMenuTemplate();
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
              <Spinner className="mr-2" />
            ) : (
              <IconFileSpreadsheet className="mr-2 size-4" />
            )}
            Import / Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setImportDialogOpen(true)}>
            <IconUpload className="mr-2 size-4" />
            Import từ file
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleTemplate}>
            <IconFileSpreadsheet className="mr-2 size-4" />
            Tải template (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleExport("xlsx")}>
            <IconDownload className="mr-2 size-4" />
            Export .xlsx (đầy đủ)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("csv")}>
            <IconDownload className="mr-2 size-4" />
            Export .csv (món ăn)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MenuImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />
    </>
  );
}

function MenuImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportMenuSummary | null>(null);
  const [fileName, setFileName] = useState<string>("");
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
      const res = await importMenu(fd);
      if (!res.success) {
        setError(res.error);
        if (res.issues) setIssues(res.issues);
        return;
      }
      setSummary(res.data.summary);
      toast.success("Import thành công");
      window.location.reload();
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
          <DialogTitle>Import Menu từ file</DialogTitle>
          <DialogDescription>
            Hỗ trợ file .xlsx với 2 sheet: <strong>Danh muc</strong> và{" "}
            <strong>Mon an</strong>. Tên trùng sẽ được cập nhật.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="menu-import-file" className="text-sm font-medium">
              Chọn file (.xlsx, .csv)
            </label>
            <input
              id="menu-import-file"
              ref={fileRef}
              type="file"
              accept=".xlsx,.xlsm,.csv"
              required
              onChange={(e) => {
                setFileName(e.currentTarget.files?.[0]?.name ?? "");
                setError(null);
                setIssues([]);
              }}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted/70"
            />
            {fileName ? (
              <p className="text-xs text-muted-foreground">
                Đã chọn: {fileName}
              </p>
            ) : null}
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <IconAlertCircle className="size-4 shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          ) : null}

          {issues.length > 0 ? (
            <div className="max-h-52 overflow-auto rounded-md border bg-muted/30 p-2 text-sm">
              <ul className="flex flex-col gap-1">
                {issues.slice(0, 50).map((iss, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      [{iss.sheet}:{iss.row}]
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
              <ul className="mt-1 flex flex-col gap-1 text-muted-foreground">
                <li>
                  Danh mục: +{summary.categoriesInserted} tạo mới,{" "}
                  {summary.categoriesUpdated} cập nhật
                </li>
                <li>
                  Món ăn: +{summary.itemsInserted} tạo mới,{" "}
                  {summary.itemsUpdated} cập nhật
                </li>
                {summary.variantsItemsReplaced > 0 ? (
                  <li>
                    Biến thể: {summary.variantsItemsReplaced} món được thay thế
                  </li>
                ) : null}
                {summary.modifiersItemsReplaced > 0 ? (
                  <li>
                    Topping: {summary.modifiersItemsReplaced} món được thay thế
                  </li>
                ) : null}
                {summary.sidesItemsReplaced > 0 ? (
                  <li>
                    Món phụ: {summary.sidesItemsReplaced} món được thay thế
                  </li>
                ) : null}
              </ul>
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
