"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: baseline inline Vietnamese copy in menu import dialog */

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
  downloadMenuTemplate,
  exportMenu,
  importMenu,
  type ImportIssue,
  type ImportMenuSummary,
} from "./actions";

import {
  ACTIONS_VI,
  INVENTORY_VI,
  MENU_VI,
  TOAST_VI,
} from "@comtammatu/shared/messages";
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
      toast.success(TOAST_VI.exported);
    });
  }

  function handleTemplate() {
    startExport(async () => {
      const res = await downloadMenuTemplate();
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
        <DropdownMenuTrigger
          render={
            <Button variant="outline" disabled={isExporting}>
              {isExporting ? (
                <Spinner className="mr-2" />
              ) : (
                <IconFileSpreadsheet className="mr-2 size-4" />
              )}
              {MENU_VI.importExport}
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setImportDialogOpen(true)}>
            <IconUpload className="mr-2 size-4" />
            {MENU_VI.importMenuItem}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleTemplate}>
            <IconFileSpreadsheet className="mr-2 size-4" />
            {INVENTORY_VI.downloadTemplate}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleExport("xlsx")}>
            <IconDownload className="mr-2 size-4" />
            {MENU_VI.exportXlsxFull}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("csv")}>
            <IconDownload className="mr-2 size-4" />
            {MENU_VI.exportCsvItems}
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
  return (
    <FileImportDialog<ImportMenuSummary, ImportIssue>
      open={open}
      onOpenChange={onOpenChange}
      title={MENU_VI.importDialogTitle}
      description={
        <>
          Hỗ trợ file .xlsx với 2 sheet: <strong>Danh muc</strong> và{" "}
          <strong>Mon an</strong>. Tên trùng sẽ được cập nhật.
        </>
      }
      inputId="menu-import-file"
      chooseFileLabel={INVENTORY_VI.chooseFileLabel}
      selectedFileLabel={(fileName) => `Đã chọn: ${fileName}`}
      selectFileError={INVENTORY_VI.selectFile}
      resultTitle={INVENTORY_VI.importResultHeading}
      submitLabel="Nhập dữ liệu"
      closeLabel={ACTIONS_VI.close}
      importAction={importMenu}
      successMessage={() => MENU_VI.importSuccess}
      renderSummary={(summary) => (
        <ul className="flex flex-col gap-1">
          <li>
            Danh mục: +{summary.categoriesInserted} tạo mới,{" "}
            {summary.categoriesUpdated} cập nhật
          </li>
          <li>
            Món ăn: +{summary.itemsInserted} tạo mới, {summary.itemsUpdated} cập
            nhật
          </li>
          {summary.variantsItemsReplaced > 0 ? (
            <li>Biến thể: {summary.variantsItemsReplaced} món được thay thế</li>
          ) : null}
          {summary.modifiersItemsReplaced > 0 ? (
            <li>Topping: {summary.modifiersItemsReplaced} món được thay thế</li>
          ) : null}
          {summary.sidesItemsReplaced > 0 ? (
            <li>Món phụ: {summary.sidesItemsReplaced} món được thay thế</li>
          ) : null}
        </ul>
      )}
      renderIssue={(issue) => `[${issue.sheet}:${issue.row}] ${issue.message}`}
      onImported={() => window.location.reload()}
    />
  );
}
