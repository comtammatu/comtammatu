"use client";

import { useState } from "react";
import { AppToolbar } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { Button } from "@comtammatu/ui/components/button";
import { Plus as IconPlus } from "lucide-react";
import { ZoneTable } from "./zone-table";
import { ZoneFormDialog } from "./zone-form-dialog";
import { DiningTableSettingsList } from "./table-table";
import { TableFormDialog } from "./table-form-dialog";
import type { ZoneRow } from "./zone-table";
import type { TableRow } from "./table-table";

import { messages } from "@lib/messages";
interface BranchOption {
  id: number;
  name: string;
  is_active: boolean | null;
}

interface TablesClientProps {
  branch: BranchOption;
  zones: ZoneRow[];
  tables: TableRow[];
  activeView: "zones" | "tables";
  zoneCount: number;
  tableCount: number;
  embedded?: boolean;
}

export function TablesClient({
  branch,
  zones,
  tables,
  activeView,
  zoneCount,
  tableCount,
  embedded = false,
}: TablesClientProps) {
  const copy = messages.settings.tables;
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);

  return (
    <>
      <AppPageTabs
        paramKey="view"
        defaultValue="zones"
        items={[
          { value: "zones", label: copy.zonesTab(zoneCount) },
          { value: "tables", label: copy.tablesTab(tableCount) },
        ]}
      >
        {activeView === "zones" ? (
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
            <ZoneTable zones={zones} />
          </TabsContent>
        ) : null}

        {activeView === "tables" ? (
          <TabsContent value="tables" className="flex flex-col gap-4">
            <AppToolbar
              variant={embedded ? "inline" : "card"}
              actions={
                <Button
                  size="touch"
                  className="w-full sm:w-auto"
                  onClick={() => setTableDialogOpen(true)}
                >
                  <IconPlus data-icon="inline-start" />
                  {copy.addTable}
                </Button>
              }
            />
            <DiningTableSettingsList tables={tables} zones={zones} />
          </TabsContent>
        ) : null}
      </AppPageTabs>

      {activeView === "zones" ? (
        <ZoneFormDialog
          open={zoneDialogOpen}
          onOpenChange={setZoneDialogOpen}
          branchId={branch.id}
        />
      ) : (
        <TableFormDialog
          open={tableDialogOpen}
          onOpenChange={setTableDialogOpen}
          branchId={branch.id}
          zones={zones}
        />
      )}
    </>
  );
}
