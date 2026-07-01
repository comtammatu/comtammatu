"use client";

import { useState } from "react";
import Link from "next/link";
import { AppEmptyState, AppToolbar } from "@/components/surface";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Badge } from "@comtammatu/ui/components/badge";
import { Label } from "@comtammatu/ui/components/label";
import {
  ExternalLink as IconExternalLink,
  Pencil as IconPencil,
  Plus as IconPlus,
} from "lucide-react";
import { TerminalFormDialog } from "./terminal-form-dialog";
import { messages } from "@lib/messages";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";

import { BRANCH_VI, FORM_VI } from "@comtammatu/shared/messages";
export interface TerminalRow {
  id: number;
  name: string;
  branch_id: number;
  device_id: string | null;
  is_active: boolean;
}

export interface BranchOption {
  id: number;
  name: string;
  is_active: boolean | null;
}

interface TerminalsClientProps {
  branches: BranchOption[];
  terminals: TerminalRow[];
}

export function TerminalsClient({ branches, terminals }: TerminalsClientProps) {
  const firstBranch = branches[0];
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    firstBranch?.id ?? null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTerminal, setEditTerminal] = useState<TerminalRow | null>(null);

  const filteredTerminals = terminals.filter(
    (t) => t.branch_id === selectedBranchId,
  );

  function TerminalActions({ terminal }: { terminal: TerminalRow }) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          setEditTerminal(terminal);
          setDialogOpen(true);
        }}
      >
        <IconPencil className="size-4" />
        <span className="sr-only">{messages.settings.common.edit}</span>
      </Button>
    );
  }

  const columns: DataTableColumn<TerminalRow>[] = [
    {
      key: "name",
      header: messages.settings.pos.terminalName,
      className: "font-medium",
      render: (terminal) => terminal.name,
    },
    {
      key: "device_id",
      header: messages.settings.pos.deviceId,
      className: "text-muted-foreground",
      render: (terminal) => terminal.device_id ?? "—",
    },
    {
      key: "status",
      header: FORM_VI.status,
      className: "text-center",
      render: (terminal) => (
        <Badge variant={terminal.is_active ? "success" : "secondary"}>
          {terminal.is_active
            ? messages.settings.common.active
            : messages.settings.common.inactive}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (terminal) => <TerminalActions terminal={terminal} />,
    },
  ];

  if (branches.length === 0) {
    return (
      <AppEmptyState
        title={messages.settings.common.noBranches}
        description={messages.settings.common.createBranchFirst}
      />
    );
  }

  return (
    <>
      <AppToolbar
        filters={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Label htmlFor="branch-select" className="text-sm font-medium">
              {messages.settings.common.branchLabel}
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
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {selectedBranchId !== null && (
              <Button
                variant="outline"
                size="sm"
                asChild
                className="w-full sm:w-auto"
              >
                <Link href={`/br/${selectedBranchId}/pos`}>
                  <IconExternalLink data-icon="inline-start" />
                  {messages.settings.pos.openPosUi}
                </Link>
              </Button>
            )}
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                setEditTerminal(null);
                setDialogOpen(true);
              }}
              disabled={selectedBranchId === null}
            >
              <IconPlus data-icon="inline-start" />
              {messages.settings.pos.addTerminal}
            </Button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={filteredTerminals}
        getRowKey={(terminal) => terminal.id}
        emptyTitle={messages.settings.pos.emptyForBranch}
        mobileCardRender={(terminal) => (
          <Item variant="outline">
            <ItemContent className="min-w-0">
              <ItemTitle className="line-clamp-none w-full text-sm font-semibold">
                {terminal.name}
              </ItemTitle>
              <ItemDescription className="line-clamp-none text-sm leading-6">
                {terminal.device_id ?? "—"}
              </ItemDescription>
              <div>
                <Badge variant={terminal.is_active ? "success" : "secondary"}>
                  {terminal.is_active
                    ? messages.settings.common.active
                    : messages.settings.common.inactive}
                </Badge>
              </div>
            </ItemContent>
            <ItemActions className="self-center">
              <TerminalActions terminal={terminal} />
            </ItemActions>
          </Item>
        )}
      />

      {selectedBranchId !== null && (
        <TerminalFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          branchId={selectedBranchId}
          terminal={editTerminal}
        />
      )}
    </>
  );
}
