"use client";

import { useState, useTransition } from "react";
import {
  Download as IconDownload,
  Sheet as IconFileSpreadsheet,
  Upload as IconUpload,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { FileImportDialog } from "@/components/form";
import { downloadCsv, downloadXlsx } from "@/_lib/download-file";
import {
  downloadProductionRecipeTemplate,
  exportProductionRecipes,
  importProductionRecipes,
} from "./production-actions";

import { ACTIONS_VI, INVENTORY_VI, TOAST_VI } from "@comtammatu/shared/messages";
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
      toast.success(TOAST_VI.exportedBom);
    });
  }

  function handleTemplate() {
    startExport(async () => {
      const res = await downloadProductionRecipeTemplate();
      if (!res.success || !res.data) {
        toast.error(res.error ?? INVENTORY_VI.templateCreateFailed);
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
            {INVENTORY_VI.productionRecipeImportExport}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setImportOpen(true)}>
              <IconUpload data-icon="inline-start" />
              {INVENTORY_VI.importFromFile}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleTemplate}>
              <IconFileSpreadsheet data-icon="inline-start" />
              {INVENTORY_VI.downloadTemplate}
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
  return (
    <FileImportDialog
      open={open}
      onOpenChange={onOpenChange}
      title={INVENTORY_VI.importBomTitle}
      description={INVENTORY_VI.importBomDescription}
      inputId="production-recipe-import-file"
      chooseFileLabel={INVENTORY_VI.chooseFileLabel}
      selectedFileLabel={(fileName) => `Đã chọn: ${fileName}`}
      selectFileError={INVENTORY_VI.selectFile}
      resultTitle={INVENTORY_VI.importResultHeading}
      submitLabel="Import"
      closeLabel={ACTIONS_VI.close}
      importAction={importProductionRecipes}
      successMessage={(summary) =>
        INVENTORY_VI.productionRecipeImportSuccess(
          summary.recipes,
          summary.lines,
        )
      }
      renderSummary={(summary) =>
        INVENTORY_VI.productionRecipeImportSummary(
          summary.recipes,
          summary.lines,
        )
      }
      renderIssue={(issue) => `[dòng ${issue.row}] ${issue.message}`}
      onImported={onImported}
    />
  );
}
