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
import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Switch } from "@comtammatu/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { updatePostingRule } from "../posting-rules-actions";
import type { PostingRuleRow, AccountOption } from "./page";

interface Props {
  rules: PostingRuleRow[];
  accounts: AccountOption[];
}

const TYPE_LABELS: Record<string, string> = {
  sale: "Bán hàng",
  purchase: "Mua hàng",
  payroll: "Lương",
  transfer: "Chuyển kho",
  production: "Sản xuất",
};

export function PostingRulesClient({ rules: initial, accounts }: Props) {
  const [rules, setRules] = useState(initial);
  const [isPending, startTransition] = useTransition();

  const activeAccounts = accounts.filter((a) => a.is_active);

  function handleAccountChange(
    ruleId: number,
    field: "debitAccountCode" | "creditAccountCode",
    value: string,
  ) {
    startTransition(async () => {
      const res = await updatePostingRule({ id: ruleId, [field]: value });
      if (res.success) {
        setRules((prev) =>
          prev.map((r) =>
            r.id === ruleId
              ? {
                  ...r,
                  [field === "debitAccountCode"
                    ? "debit_account_code"
                    : "credit_account_code"]: value,
                }
              : r,
          ),
        );
      }
    });
  }

  function handleToggle(ruleId: number, isActive: boolean) {
    startTransition(async () => {
      const res = await updatePostingRule({ id: ruleId, isActive });
      if (res.success) {
        setRules((prev) =>
          prev.map((r) =>
            r.id === ruleId ? { ...r, is_active: isActive } : r,
          ),
        );
      }
    });
  }

  // Group by transaction_type
  const grouped = rules.reduce<Record<string, PostingRuleRow[]>>((acc, r) => {
    const key = r.transaction_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="grid gap-6">
      {Object.entries(grouped).map(([type, typeRules]) => (
        <Card key={type} className="overflow-hidden">
          <div className="border-b px-4 py-2.5">
            <Badge variant="outline" className="text-xs">
              {TYPE_LABELS[type] ?? type}
            </Badge>
          </div>
          <CardContent className="overflow-x-auto px-4 sm:px-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Mã quy tắc</TableHead>
                  <TableHead>Mô tả</TableHead>
                  <TableHead className="w-48">TK Nợ</TableHead>
                  <TableHead className="w-48">TK Có</TableHead>
                  <TableHead className="w-20 text-center">Bật</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typeRules.map((rule) => (
                  <TableRow
                    key={rule.id}
                    className={rule.is_active ? "" : "opacity-50"}
                  >
                    <TableCell className="font-mono text-xs">
                      {rule.rule_code}
                    </TableCell>
                    <TableCell className="max-w-md text-sm">
                      <span className="line-clamp-2 break-words">
                        {rule.description}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={rule.debit_account_code}
                        onValueChange={(v: string) =>
                          handleAccountChange(rule.id, "debitAccountCode", v)
                        }
                        disabled={isPending}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {activeAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.code}>
                              {a.code} — {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={rule.credit_account_code}
                        onValueChange={(v: string) =>
                          handleAccountChange(rule.id, "creditAccountCode", v)
                        }
                        disabled={isPending}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {activeAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.code}>
                              {a.code} — {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(checked: boolean) =>
                          handleToggle(rule.id, checked)
                        }
                        disabled={isPending}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
