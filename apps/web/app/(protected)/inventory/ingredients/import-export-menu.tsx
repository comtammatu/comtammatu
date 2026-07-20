"use client";

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
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { FileImportDialog } from "@/components/form";
import { downloadCsv, downloadXlsx } from "@/_lib/download-file";
import {
  downloadIngredientTemplate,
  exportIngredients,
  importIngredients,
} from "../ingredient-actions";

import {
  ACTIONS_VI,
  INVENTORY_VI,
  TOAST_VI,
} from "@comtammatu/shared/messages";
export function IngredientImportExportMenu({
  onImported,
}: {
  onImported?: () => void;
}) {
  const [isExporting, startExport] = useTransition();
  const [importOpen, setImportOpen] = useState(false);
  const isTouchLayout = useIsMobile(1024);

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
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size={isTouchLayout ? "touch" : "default"}
              disabled={isExporting}
            >
              {isExporting ? (
                <Spinner className="mr-2" />
              ) : (
                <IconFileSpreadsheet className="mr-2 size-4" />
              )}
              Import / Export
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            size={isTouchLayout ? "touch" : "default"}
            onClick={() => setImportOpen(true)}
          >
            <IconUpload className="mr-2 size-4" />
            {INVENTORY_VI.importFromFile}
          </DropdownMenuItem>
          <DropdownMenuItem
            size={isTouchLayout ? "touch" : "default"}
            onClick={handleTemplate}
          >
            <IconFileSpreadsheet className="mr-2 size-4" />
            {INVENTORY_VI.downloadTemplate}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            size={isTouchLayout ? "touch" : "default"}
            onClick={() => handleExport("xlsx")}
          >
            <IconDownload className="mr-2 size-4" />
            {INVENTORY_VI.exportXlsx}
          </DropdownMenuItem>
          <DropdownMenuItem
            size={isTouchLayout ? "touch" : "default"}
            onClick={() => handleExport("csv")}
          >
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
          {INVENTORY_VI.importIngredientsHintPrefix}{" "}
          <strong>{INVENTORY_VI.importIngredientsHintField}</strong>{" "}
          {INVENTORY_VI.importIngredientsHintSuffix}
        </>
      }
      inputId="ing-import-file"
      chooseFileLabel={INVENTORY_VI.chooseFileLabel}
      selectedFileLabel={(fileName) =>
        INVENTORY_VI.importSelectedFile(fileName)
      }
      selectFileError={INVENTORY_VI.selectFile}
      resultTitle={INVENTORY_VI.importResultHeading}
      submitLabel="Import"
      closeLabel={ACTIONS_VI.close}
      importAction={importIngredients}
      successMessage={(summary) =>
        INVENTORY_VI.importIngredientsSuccess(summary.inserted, summary.updated)
      }
      renderSummary={(summary) =>
        INVENTORY_VI.importIngredientsSummary(summary.inserted, summary.updated)
      }
      renderIssue={(issue) =>
        INVENTORY_VI.importIssueLine(issue.row, issue.message)
      }
      onImported={onImported}
    />
  );
}
