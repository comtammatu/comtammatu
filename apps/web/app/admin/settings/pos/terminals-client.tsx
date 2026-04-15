"use client";

import { useState } from "react";
import Link from "next/link";
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
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { TerminalFormDialog } from "./terminal-form-dialog";
import { EmptyStatePanel } from "../../components/empty-state-panel";
import { StatusBadge } from "@/components/patterns";

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
      <EmptyStatePanel
        title="Chưa có chi nhánh nào"
        description="Tạo chi nhánh trước."
      />
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Chi nhánh:</label>
          <Select
            value={selectedBranchId?.toString() ?? ""}
            onValueChange={(v) => setSelectedBranchId(Number(v))}
          >
            <SelectTrigger className="w-60">
              <SelectValue placeholder="Chọn chi nhánh" />
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
              <ExternalLink className="mr-2 size-4" />
              Mở giao diện POS
            </Link>
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setEditTerminal(null);
              setDialogOpen(true);
            }}
            disabled={selectedBranchId === null}
          >
            <Plus className="mr-2 size-4" />
            Thêm máy POS
          </Button>
        </div>

        {filteredTerminals.length === 0 ? (
          <EmptyStatePanel
            className="py-8"
            title="Chưa có máy POS nào cho chi nhánh này"
          />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-50">Tên máy</TableHead>
                  <TableHead>Thiết bị (device_id)</TableHead>
                  <TableHead className="w-25 text-center">Trạng thái</TableHead>
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
                      <StatusBadge
                        tone={terminal.is_active ? "success" : "neutral"}
                        className="text-xs"
                      >
                        {terminal.is_active ? "Hoạt động" : "Tạm tắt"}
                      </StatusBadge>
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
                        <Pencil className="size-4" />
                        <span className="sr-only">Chỉnh sửa</span>
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
