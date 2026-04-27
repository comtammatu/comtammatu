"use client";

import { useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { CircleAlert as IconAlertCircle, Download as IconDownload, Sheet as IconFileSpreadsheet, Upload as IconUpload } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { downloadCsv, downloadXlsx } from "@/_lib/download-file";
import {
  downloadProductionRecipeTemplate,
  exportProductionRecipes,
  importProductionRecipes,
  type ImportProductionRecipeIssue,
  type ImportProductionRecipeSummary,
} from "./production-actions";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
export function ProductionRecipeImportExportMenu({
  onImported,
}: {
  onImported?: () => void;
}) {
  const [isExporting, startExport] = useTransition();
  const [importOpen, setImportOpen] = useState(false);

  function handleExport(format: "xlsx" | "csv") {
    startExport(async () => {
      const res = await exportProductionRecipes(format);
      if (!res.success) {
        toast.error(res.error);
        return;
      }

      if (format === "csv") {
        downloadCsv(res.data.base64, res.data.filename);
      } else {
        downloadXlsx(res.data.base64, res.data.filename);
      }
      toast.success("Đã xuất file BOM sản xuất");
    });
  }

  function handleTemplate() {
    startExport(async () => {
      const res = await downloadProductionRecipeTemplate();
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không tạo được template");
        return;
      }
      downloadXlsx(res.data.base64, res.data.filename);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={isExporting}>
            {isExporting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconFileSpreadsheet data-icon="inline-start" />
            )}
            Import / Export BOM
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setImportOpen(true)}>
              <IconUpload data-icon="inline-start" />
              Import từ file
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleTemplate}>
              <IconFileSpreadsheet data-icon="inline-start" />
              Tải template (.xlsx)
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => handleExport("xlsx")}>
              <IconDownload data-icon="inline-start" />
              Export .xlsx
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("csv")}>
              <IconDownload data-icon="inline-start" />
              Export .csv
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProductionRecipeImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={onImported}
      />
    </>
  );
}

function ProductionRecipeImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [issues, setIssues] = useState<ImportProductionRecipeIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportProductionRecipeSummary | null>(
    null,
  );
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setIssues([]);
    setError(null);
    setSummary(null);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
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

      const res = await importProductionRecipes(fd);
      if (!res.success) {
        setError(res.error);
        if (res.issues) setIssues(res.issues);
        return;
      }

      setSummary(res.data.summary);
      toast.success(
        `Đã import ${res.data.summary.recipes} BOM / ${res.data.summary.lines} dòng`,
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
          <DialogTitle>Import BOM sản xuất từ file</DialogTitle>
          <DialogDescription>
            Hỗ trợ .xlsx và .csv. Mỗi thành phẩm xuất hiện trong file sẽ được
            thay thế toàn bộ dòng nguyên liệu trong BOM.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field data-invalid={!!error && !fileName}>
              <FieldLabel htmlFor="production-recipe-import-file">
                Chọn file (.xlsx, .csv)
              </FieldLabel>
              <Input
                id="production-recipe-import-file"
                ref={fileRef}
                type="file"
                accept=".xlsx,.xlsm,.csv"
                required
                aria-invalid={!!error && !fileName}
                onChange={(event) => {
                  setFileName(event.currentTarget.files?.[0]?.name ?? "");
                  setError(null);
                  setIssues([]);
                }}
              />
              {fileName ? (
                <FieldDescription>Đã chọn: {fileName}</FieldDescription>
              ) : null}
            </Field>
          </FieldGroup>

          {error ? (
            <Alert variant="destructive">
              <IconAlertCircle />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          ) : null}

          {issues.length > 0 ? (
            <Alert>
              <AlertTitle>Chi tiết dòng lỗi</AlertTitle>
              <AlertDescription>
                <ul className="flex max-h-52 flex-col gap-1 overflow-auto">
                  {issues.slice(0, 50).map((issue, idx) => (
                    <li key={idx}>
                      [dòng {issue.row}] {issue.message}
                    </li>
                  ))}
                  {issues.length > 50 ? (
                    <li>...và {issues.length - 50} lỗi khác</li>
                  ) : null}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {summary ? (
            <Alert>
              <AlertTitle>Kết quả</AlertTitle>
              <AlertDescription>
                Đã cập nhật {summary.recipes} BOM sản xuất / {summary.lines}{" "}
                dòng nguyên liệu.
              </AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={isPending}
            >
              {ACTIONS_VI.close}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner data-icon="inline-start" />}
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
