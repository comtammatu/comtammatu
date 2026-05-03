/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import { type ChangeEvent, useState, useTransition } from "react";
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
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { ACTIONS_VI, ERRORS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { Plus as IconPlus } from "lucide-react";
import { createAccount, updateAccount } from "../accounting-actions";
import type { AccountRow } from "./page";

const ACCOUNT_TYPES = [
  { value: "asset", label: "Tài sản" },
  { value: "liability", label: "Nợ phải trả" },
  { value: "equity", label: "Vốn chủ sở hữu" },
  { value: "revenue", label: "Doanh thu" },
  { value: "expense", label: "Chi phí" },
];

interface Props {
  accounts: AccountRow[];
}

export function ChartOfAccountsClient({ accounts: initial }: Props) {
  const [accounts, setAccounts] = useState(initial);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [form, setForm] = useState({
    code: "",
    name: "",
    accountType: "asset",
    parentId: "",
  });

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await createAccount({
        code: form.code,
        name: form.name,
        accountType: form.accountType,
        parentId: form.parentId ? Number(form.parentId) : undefined,
      });
      if (!res.success) {
        setError(res.error ?? ERRORS_VI.unknown);
        return;
      }
      // Optimistic: reload by adding the new account
      const newAccount = res.data as AccountRow;
      setAccounts((prev) =>
        [...prev, newAccount].sort((a, b) => a.code.localeCompare(b.code)),
      );
      setOpen(false);
      setForm({ code: "", name: "", accountType: "asset", parentId: "" });
    });
  }

  function handleToggleActive(id: number, current: boolean) {
    startTransition(async () => {
      await updateAccount({ id, isActive: !current });
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_active: !current } : a)),
      );
    });
  }

  const typeLabel = (t: string) =>
    ACCOUNT_TYPES.find((x) => x.value === t)?.label ?? t;

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} size="sm">
          <IconPlus className="mr-1.5 size-4" />
          Thêm tài khoản
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="overflow-x-auto px-4 sm:px-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Mã TK</TableHead>
                <TableHead>Tên tài khoản</TableHead>
                <TableHead className="w-36">{FORM_VI.type}</TableHead>
                <TableHead className="w-24">{FORM_VI.status}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-muted-foreground"
                  >
                    Chưa có tài khoản nào. Thêm tài khoản đầu tiên.
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono font-medium">
                      {a.code}
                    </TableCell>
                    <TableCell>{a.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {typeLabel(a.account_type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {a.is_active ? (
                        <Badge variant="success">
                          {ACTIVE_STATE_LABELS_VI.active}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          {ACTIVE_STATE_LABELS_VI.inactive}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleToggleActive(a.id, a.is_active)}
                      >
                        {a.is_active
                          ? ACTIVE_STATE_LABELS_VI.inactive
                          : "Kích hoạt"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm tài khoản kế toán</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Mã tài khoản</Label>
              <Input
                placeholder="VD: 111, 131, 511"
                value={form.code}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setForm((f) => ({ ...f, code: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Tên tài khoản</Label>
              <Input
                placeholder="VD: Tiền mặt"
                value={form.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Loại tài khoản</Label>
              <Select
                value={form.accountType}
                onValueChange={(v: string) =>
                  setForm((f) => ({ ...f, accountType: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Tài khoản cha (tùy chọn)</Label>
              <Select
                value={form.parentId}
                onValueChange={(v: string) =>
                  setForm((f) => ({ ...f, parentId: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Không có" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending || !form.code || !form.name}
            >
              {ACTIONS_VI.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
