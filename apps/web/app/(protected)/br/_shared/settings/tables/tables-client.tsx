"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { AppEmptyState, AppToolbar } from "@/components/surface";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import { confirm } from "@/components/confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Plus as IconPlus,
  QrCode as IconQrCode,
  Rows3 as IconRows3,
} from "lucide-react";
import { ZoneTable } from "./zone-table";
import { ZoneFormDialog } from "./zone-form-dialog";
import { DiningTableSettingsList } from "./table-table";
import { TableFormDialog } from "./table-form-dialog";
import { BulkTableFormDialog } from "./bulk-table-form-dialog";
import { bulkCreateTableSelfOrderQr } from "./actions";
import type { ZoneRow } from "./zone-table";
import type { TableRow } from "./table-table";

import { ACTIONS_VI, BRANCH_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
interface BranchOption {
  id: number;
  name: string;
  is_active: boolean | null;
}

interface TablesClientProps {
  branches: BranchOption[];
  zones: ZoneRow[];
  tables: TableRow[];
  embedded?: boolean;
}

export function TablesClient({
  branches,
  zones,
  tables,
  embedded = false,
}: TablesClientProps) {
  const router = useRouter();
  const copy = messages.settings.tables;
  const commonCopy = messages.settings.common;
  const firstBranch = branches[0];
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    firstBranch?.id ?? null,
  );
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [bulkTableDialogOpen, setBulkTableDialogOpen] = useState(false);
  const [bulkQrPending, setBulkQrPending] = useState(false);
  const canSwitchBranch = branches.length > 1;

  const filteredZones = zones.filter((z) => z.branch_id === selectedBranchId);
  const filteredTables = tables.filter((t) => t.branch_id === selectedBranchId);
  const tablesMissingQr = filteredTables.filter((t) => !t.self_order_token);

  async function handleBulkCreateQr() {
    if (selectedBranchId === null || tablesMissingQr.length === 0) return;

    const ok = await confirm({
      title: copy.bulkCreateQrTitle,
      description: copy.bulkCreateQrDescription(tablesMissingQr.length),
      confirmText: copy.bulkCreateQrConfirm,
      cancelText: ACTIONS_VI.cancel,
    });
    if (!ok) return;

    setBulkQrPending(true);
    try {
      const result = await bulkCreateTableSelfOrderQr({
        branch_id: selectedBranchId,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? copy.bulkCreateQrFailed);
        return;
      }
      if (result.data.created === 0) {
        toast.message(copy.bulkCreateQrNone);
        return;
      }
      toast.success(copy.bulkCreateQrSuccess(result.data.created));
      router.refresh();
    } catch (error) {
      console.error("[table-settings] bulk create self-order QR failed", error);
      toast.error(copy.bulkCreateQrFailed);
    } finally {
      setBulkQrPending(false);
    }
  }

  if (branches.length === 0) {
    return (
      <AppEmptyState
        title={commonCopy.noBranches}
        description={commonCopy.createBranchFirst}
        symbol="roof"
      />
    );
  }

  return (
    <>
      {canSwitchBranch ? (
        <AppToolbar
          variant={embedded ? "inline" : "card"}
          filters={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Label htmlFor="branch-select" className="text-sm font-medium">
                {commonCopy.branchLabel}
              </Label>
              <Select
                value={selectedBranchId?.toString() ?? ""}
                onValueChange={(v) => setSelectedBranchId(Number(v))}
              >
                <SelectTrigger id="branch-select" className="w-full sm:w-60">
                  <SelectValue placeholder={BRANCH_VI.select} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />
      ) : null}

      <Tabs defaultValue="tables">
        <TabsList size="touch" layout="equal">
          <TabsTrigger value="zones">
            {copy.zonesTab(filteredZones.length)}
          </TabsTrigger>
          <TabsTrigger value="tables">
            {copy.tablesTab(filteredTables.length)}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="zones" className="flex flex-col gap-4">
          <AppToolbar
            variant={embedded ? "inline" : "card"}
            actions={
              <Button
                size="touch"
                className="w-full sm:w-auto"
                onClick={() => setZoneDialogOpen(true)}
              >
                <IconPlus data-icon="inline-start" />
                {copy.addZone}
              </Button>
            }
          />
          <ZoneTable zones={filteredZones} />
        </TabsContent>

        <TabsContent value="tables" className="flex flex-col gap-4">
          <AppToolbar
            variant={embedded ? "inline" : "card"}
            actions={
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button
                  size="touch"
                  className="w-full sm:w-auto"
                  onClick={() => setTableDialogOpen(true)}
                >
                  <IconPlus data-icon="inline-start" />
                  {copy.addTable}
                </Button>
                <Button
                  size="touch"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setBulkTableDialogOpen(true)}
                >
                  <IconRows3 data-icon="inline-start" />
                  {copy.addTableBulk}
                </Button>
                {tablesMissingQr.length > 0 ? (
                  <Button
                    size="touch"
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={bulkQrPending}
                    onClick={() => void handleBulkCreateQr()}
                  >
                    <IconQrCode data-icon="inline-start" />
                    {copy.bulkCreateQr(tablesMissingQr.length)}
                  </Button>
                ) : null}
              </div>
            }
          />
          <DiningTableSettingsList
            tables={filteredTables}
            zones={filteredZones}
          />
        </TabsContent>
      </Tabs>

      {selectedBranchId !== null && (
        <>
          <ZoneFormDialog
            open={zoneDialogOpen}
            onOpenChange={setZoneDialogOpen}
            branchId={selectedBranchId}
          />
          <TableFormDialog
            open={tableDialogOpen}
            onOpenChange={setTableDialogOpen}
            branchId={selectedBranchId}
            zones={filteredZones}
          />
          <BulkTableFormDialog
            open={bulkTableDialogOpen}
            onOpenChange={setBulkTableDialogOpen}
            branchId={selectedBranchId}
            zones={filteredZones}
          />
        </>
      )}
    </>
  );
}
