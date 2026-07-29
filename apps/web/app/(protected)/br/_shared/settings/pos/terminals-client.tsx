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
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Badge } from "@comtammatu/ui/components/badge";
import { Label } from "@comtammatu/ui/components/label";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
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
  embedded?: boolean;
}

export function TerminalsClient({
  branches,
  terminals,
  embedded = false,
}: TerminalsClientProps) {
  const copy = messages.settings.pos;
  const firstBranch = branches[0];
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    firstBranch?.id ?? null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTerminal, setEditTerminal] = useState<TerminalRow | null>(null);
  const canSwitchBranch = branches.length > 1;

  const filteredTerminals = terminals.filter(
    (t) => t.branch_id === selectedBranchId,
  );
  const hasActiveTerminal = filteredTerminals.some((t) => t.is_active);

  function openCreateDialog() {
    setEditTerminal(null);
    setDialogOpen(true);
  }

  function TerminalActions({ terminal }: { terminal: TerminalRow }) {
    return (
      <Button
        variant="ghost"
        size="icon-touch"
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
      header: copy.terminalName,
      className: "font-medium",
      render: (terminal) => terminal.name,
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
      <NoteCallout tone="muted" className="mb-3">
        {copy.registrationIntro}
      </NoteCallout>

      <AppToolbar
        variant={embedded ? "inline" : "card"}
        filters={
          canSwitchBranch ? (
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
          ) : undefined
        }
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {selectedBranchId !== null && hasActiveTerminal ? (
              <Button
                variant="outline"
                size="touch"
                className="w-full sm:w-auto"
                render={<Link href={`/br/${selectedBranchId}/pos`} />}
              >
                <IconExternalLink data-icon="inline-start" />
                {copy.openPosUi}
              </Button>
            ) : null}
            <Button
              size="touch"
              className="w-full sm:w-auto"
              onClick={openCreateDialog}
              disabled={selectedBranchId === null}
            >
              <IconPlus data-icon="inline-start" />
              {copy.addTerminal}
            </Button>
          </div>
        }
      />

      {filteredTerminals.length === 0 ? (
        <AppEmptyState
          title={copy.emptyForBranch}
          description={copy.emptyForBranchDescription}
        >
          <Button size="touch" onClick={openCreateDialog}>
            <IconPlus data-icon="inline-start" />
            {copy.addTerminal}
          </Button>
        </AppEmptyState>
      ) : (
        <DataTable
          columns={columns}
          data={filteredTerminals}
          getRowKey={(terminal) => terminal.id}
          mobileBreakpoint={1024}
          mobileCardRender={(terminal) => (
            <Item variant="outline">
              <ItemContent className="min-w-0">
              <ItemTitle size="heading" className="line-clamp-none w-full">
                {terminal.name}
              </ItemTitle>
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
      )}

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
