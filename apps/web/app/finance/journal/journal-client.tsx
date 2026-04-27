"use client";

import React, { useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Plus as IconPlus, Trash as IconTrash } from "lucide-react";
import { ACTIONS_VI, ERRORS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { FormattedNumberInput } from "@/components/form";
import { createJournalEntry } from "../accounting-actions";
import type { JournalEntryRow, AccountOption } from "./page";

interface Props {
  entries: JournalEntryRow[];
  accounts: AccountOption[];
}

interface LineForm {
  accountId: string;
  debit: string;
  credit: string;
}

const emptyLine = (): LineForm => ({ accountId: "", debit: "", credit: "" });

export function JournalClient({ entries: initial, accounts }: Props) {
  const [entries, setEntries] = useState(initial);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [form, setForm] = useState({
    entryDate: new Date().toISOString().slice(0, 10),
    description: "",
    refType: "",
    refId: "",
  });
  const [lines, setLines] = useState<LineForm[]>([emptyLine(), emptyLine()]);

  function addLine() {
    setLines((l) => [...l, emptyLine()]);
  }

  function removeLine(i: number) {
    setLines((l) => l.filter((_, idx) => idx !== i));
  }

  function updateLine(i: number, field: keyof LineForm, value: string) {
    setLines((l) =>
      l.map((line, idx) => (idx === i ? { ...line, [field]: value } : line)),
    );
  }

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const parsedLines = lines
        .filter((l) => l.accountId)
        .map((l) => ({
          accountId: Number(l.accountId),
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        }));

      const res = await createJournalEntry({
        entryDate: form.entryDate,
        description: form.description,
        refType: form.refType || undefined,
        refId: form.refId ? Number(form.refId) : undefined,
        lines: parsedLines,
      });

      if (!res.success) {
        setError(res.error ?? ERRORS_VI.unknown);
        return;
      }

      // Prepend optimistic entry
      const newEntry: JournalEntryRow = {
        id: (res.data as { id: number }).id,
        entry_number:
          (res.data as { id: number; entry_number?: string }).entry_number ??
          "JE-pending",
        entry_date: form.entryDate,
        description: form.description,
        ref_type: form.refType || null,
        ref_id: form.refId ? Number(form.refId) : null,
        status: "posted",
        created_at: new Date().toISOString(),
        journal_entry_lines: parsedLines.map((l, idx) => ({
          id: idx,
          account_id: l.accountId,
          debit: l.debit,
          credit: l.credit,
          description: null,
        })),
      };
      setEntries((prev) => [newEntry, ...prev]);
      setOpen(false);
      setForm({
        entryDate: new Date().toISOString().slice(0, 10),
        description: "",
        refType: "",
        refId: "",
      });
      setLines([emptyLine(), emptyLine()]);
    });
  }

  const statusBadge = (s: string, entryNumber?: string) => {
    const isAuto = entryNumber?.startsWith("AUTO-");
    if (s === "posted") {
      return (
        <span className="flex items-center gap-1.5">
          <Badge variant="success">Đã ghi sổ</Badge>
          {isAuto && (
            <Badge variant="outline" className="text-xs">
              Tự động
            </Badge>
          )}
        </span>
      );
    }
    return <Badge variant="secondary">{s}</Badge>;
  };

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} size="sm">
          <IconPlus className="mr-1.5 size-4" />
          Tạo bút toán
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="px-4 sm:px-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Ngày</TableHead>
                <TableHead>{FORM_VI.description}</TableHead>
                <TableHead className="w-24">Tham chiếu</TableHead>
                <TableHead className="w-24">{FORM_VI.status}</TableHead>
                <TableHead className="w-32 text-right">Tổng nợ (₫)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-muted-foreground"
                  >
                    Chưa có bút toán nào.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e) => {
                  const totalDr = e.journal_entry_lines.reduce(
                    (s, l) => s + l.debit,
                    0,
                  );
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="tabular-nums">
                        {e.entry_date}
                      </TableCell>
                      <TableCell className="max-w-sm">
                        <span className="line-clamp-2 break-words">
                          {e.description}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {e.ref_type ? `${e.ref_type}#${e.ref_id}` : "—"}
                      </TableCell>
                      <TableCell>
                        {statusBadge(e.status, e.entry_number)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {totalDr.toLocaleString("vi-VN")}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tạo bút toán</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Ngày hạch toán</Label>
                <Input
                  type="date"
                  value={form.entryDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm((f) => ({ ...f, entryDate: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{FORM_VI.description}</Label>
                <Input
                  placeholder="Mô tả nghiệp vụ"
                  value={form.description}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Loại tham chiếu</Label>
                <Input
                  placeholder="VD: order, invoice"
                  value={form.refType}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm((f) => ({ ...f, refType: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label>ID tham chiếu</Label>
                <Input
                  type="number"
                  placeholder="ID"
                  value={form.refId}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm((f) => ({ ...f, refId: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Lines */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Dòng bút toán</Label>
                <Button variant="ghost" size="sm" onClick={addLine}>
                  <IconPlus className="size-4" /> Thêm dòng
                </Button>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tài khoản</TableHead>
                      <TableHead className="w-32 text-right">Nợ (₫)</TableHead>
                      <TableHead className="w-32 text-right">Có (₫)</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, i) => (
                      <TableRow key={i}>
                        <TableCell className="py-1.5">
                          <Select
                            value={line.accountId}
                            onValueChange={(v: string) =>
                              updateLine(i, "accountId", v)
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Chọn tài khoản" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts
                                .filter((a) => a.is_active)
                                .map((a) => (
                                  <SelectItem key={a.id} value={String(a.id)}>
                                    {a.code} — {a.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <FormattedNumberInput
                            className="h-8 text-right"
                            maxFractionDigits={0}
                            value={line.debit}
                            onValueChange={(value) =>
                              updateLine(i, "debit", value)
                            }
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <FormattedNumberInput
                            className="h-8 text-right"
                            maxFractionDigits={0}
                            value={line.credit}
                            onValueChange={(value) =>
                              updateLine(i, "credit", value)
                            }
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          {lines.length > 2 && (
                            <Button
                              variant="ghost"
                              size="icon-lg"
                              onClick={() => removeLine(i)}
                            >
                              <IconTrash className="size-3.5 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40">
                      <TableCell className="font-medium">{FORM_VI.totalAmount}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {totalDebit.toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {totalCredit.toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              {!isBalanced && totalDebit + totalCredit > 0 && (
                <p className="text-sm text-destructive">
                  Bút toán mất cân đối: chênh lệch{" "}
                  {Math.abs(totalDebit - totalCredit).toLocaleString("vi-VN")} ₫
                </p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                isPending ||
                !form.description ||
                !isBalanced ||
                lines.filter((l) => l.accountId).length < 2
              }
            >
              Ghi sổ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
