"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: baseline inline Vietnamese copy in ingredient import/export dialog */

import { useState, useTransition } from "react";
import {
  Download as IconDownload,
  Sheet as IconFileSpreadsheet,
  Upload as IconUpload,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { toast } from "@comtammatu/ui/components/sonner";
import { FileImportDialog } from "@/components/form";
import { downloadCsv, downloadXlsx } from "@/_lib/download-file";
import {
  downloadIngredientTemplate,
  exportIngredients,
  importIngredients,
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
  return (
    <FileImportDialog
      open={open}
      onOpenChange={onOpenChange}
      title={INVENTORY_VI.importIngredientsTitle}
      description={
        <>
          Hỗ trợ .xlsx và .csv. Dòng trùng <strong>tên nguyên liệu</strong> sẽ
          được cập nhật.
        </>
      }
      inputId="ing-import-file"
      chooseFileLabel={INVENTORY_VI.chooseFileLabel}
      selectedFileLabel={(fileName) => `Đã chọn: ${fileName}`}
      selectFileError={INVENTORY_VI.selectFile}
      resultTitle={INVENTORY_VI.importResultHeading}
      submitLabel="Import"
      closeLabel={ACTIONS_VI.close}
      importAction={importIngredients}
      successMessage={(summary) =>
        `Đã import: +${summary.inserted} / ${summary.updated} cập nhật`
      }
      renderSummary={(summary) =>
        `Tạo mới ${summary.inserted} · Cập nhật ${summary.updated}`
      }
      renderIssue={(issue) => `[dòng ${issue.row}] ${issue.message}`}
      onImported={onImported}
    />
  );
}
