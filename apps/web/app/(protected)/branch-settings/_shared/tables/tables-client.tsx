"use client";

import { useState } from "react";
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
import { Plus as IconPlus } from "lucide-react";
import { ZoneTable } from "./zone-table";
import { ZoneFormDialog } from "./zone-form-dialog";
import { TableTable } from "./table-table";
import { TableFormDialog } from "./table-form-dialog";
import type { ZoneRow } from "./zone-table";
import type { TableRow } from "./table-table";

import { BRANCH_VI } from "@comtammatu/shared/messages";
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
}

export function TablesClient({ branches, zones, tables }: TablesClientProps) {
  const copy = messages.settings.tables;
  const commonCopy = messages.settings.common;
  const firstBranch = branches[0];
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    firstBranch?.id ?? null,
  );
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const canSwitchBranch = branches.length > 1;

  const filteredZones = zones.filter((z) => z.branch_id === selectedBranchId);
  const filteredTables = tables.filter((t) => t.branch_id === selectedBranchId);

  if (branches.length === 0) {
    return (
      <AppEmptyState
        title={commonCopy.noBranches}
        description={commonCopy.createBranchFirst}
      />
    );
  }

  return (
    <>
      {canSwitchBranch ? (
        <AppToolbar
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

      <Tabs defaultValue="zones">
        <TabsList>
          <TabsTrigger value="zones">
            {copy.zonesTab(filteredZones.length)}
          </TabsTrigger>
          <TabsTrigger value="tables">
            {copy.tablesTab(filteredTables.length)}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="zones" className="flex flex-col gap-4">
          <AppToolbar
            actions={
              <Button
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
            actions={
              <Button
                className="w-full sm:w-auto"
                onClick={() => setTableDialogOpen(true)}
              >
                <IconPlus data-icon="inline-start" />
                {copy.addTable}
              </Button>
            }
          />
          <TableTable tables={filteredTables} zones={filteredZones} />
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
        </>
      )}
    </>
  );
}
