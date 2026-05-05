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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Badge } from "@comtammatu/ui/components/badge";
import { ExternalLink as IconExternalLink, Pencil as IconPencil, Plus as IconPlus } from "lucide-react";
import { TerminalFormDialog } from "./terminal-form-dialog";
import { messages } from "@lib/messages";

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
      <AppToolbar>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">
            {messages.settings.common.branchLabel}
          </label>
          <Select
            value={selectedBranchId?.toString() ?? ""}
            onValueChange={(v) => setSelectedBranchId(Number(v))}
          >
            <SelectTrigger className="w-60">
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
        {selectedBranchId !== null && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/br/${selectedBranchId}/pos`}>
              <IconExternalLink className="mr-2 size-4" />
              {messages.settings.pos.openPosUi}
            </Link>
          </Button>
        )}

        <div className="ml-auto">
          <Button
            onClick={() => {
              setEditTerminal(null);
              setDialogOpen(true);
            }}
            disabled={selectedBranchId === null}
          >
            <IconPlus className="mr-2 size-4" />
            {messages.settings.pos.addTerminal}
          </Button>
        </div>
      </AppToolbar>

      <div>
        {filteredTerminals.length === 0 ? (
          <AppEmptyState
            className="py-8"
            title={messages.settings.pos.emptyForBranch}
            compact
          />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-50">
                    {messages.settings.pos.terminalName}
                  </TableHead>
                  <TableHead>{messages.settings.pos.deviceId}</TableHead>
                  <TableHead className="w-25 text-center">{FORM_VI.status}</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTerminals.map((terminal) => (
                  <TableRow key={terminal.id}>
                    <TableCell className="font-medium">
                      {terminal.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {terminal.device_id ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={terminal.is_active ? "success" : "secondary"}
                        className="text-xs"
                      >
                        {terminal.is_active
                          ? messages.settings.common.active
                          : messages.settings.common.inactive}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditTerminal(terminal);
                          setDialogOpen(true);
                        }}
                      >
                        <IconPencil className="size-4" />
                        <span className="sr-only">
                          {messages.settings.common.edit}
                        </span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

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
