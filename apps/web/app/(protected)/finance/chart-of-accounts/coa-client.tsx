"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { ERRORS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import {
  CircleOff as IconCircleOff,
  Plus as IconPlus,
  RefreshCw as IconRefresh,
} from "lucide-react";
import { AppEmptyState, AppToolbar } from "@/components/surface";
import { TableEmptyStateRow } from "@/components/table-empty-state-row";
import { messages } from "@lib/messages";
import type { AccountRow } from "./page";
import {
  seedChartOfAccounts,
  fetchChartOfAccounts,
  toggleAccountActive,
} from "../chart-of-accounts-actions";

const TYPE_LABELS: Record<string, string> = messages.finance.coa.typeLabels;

const CASHFLOW_LABELS: Record<string, string> =
  messages.finance.coa.cashflowLabels;

const TYPE_COLORS: Record<
  string,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  asset: "info",
  liability: "danger",
  equity: "info",
  revenue: "success",
  expense: "warning",
};

const INDENT_CLASS_BY_LEVEL: Record<number, string> = {
  1: "pl-0",
  2: "pl-4",
  3: "pl-8",
  4: "pl-12",
  5: "pl-16",
};

function indentClassForLevel(level: number): string {
  return INDENT_CLASS_BY_LEVEL[level] ?? "pl-16";
}

interface ChartOfAccountsClientProps {
  initialAccounts: AccountRow[];
}

export function ChartOfAccountsClient({
  initialAccounts,
}: ChartOfAccountsClientProps) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [cashflowFilter, setCashflowFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        account.account_code.toLowerCase().includes(normalizedQuery) ||
        account.account_name.toLowerCase().includes(normalizedQuery);
      const matchesType =
        typeFilter === "all" || account.account_type === typeFilter;
      const matchesCashflow =
        cashflowFilter === "all" || account.cashflow_section === cashflowFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && account.is_active) ||
        (statusFilter === "inactive" && !account.is_active);
      return matchesQuery && matchesType && matchesCashflow && matchesStatus;
    });
  }, [accounts, cashflowFilter, query, statusFilter, typeFilter]);

  function handleSeed() {
    startTransition(async () => {
      const result = await seedChartOfAccounts();
      if (result.success) {
        toast.success(messages.finance.coa.seedSuccess);
        // Reload accounts
        const reload = await fetchChartOfAccounts();
        if (reload.success) {
          setAccounts((reload.data ?? []) as AccountRow[]);
        }
      } else {
        toast.error(result.error ?? messages.finance.coa.seedError);
      }
    });
  }

  function handleToggle(accountId: number) {
    startTransition(async () => {
      const result = await toggleAccountActive({ id: accountId });
      if (result.success) {
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === accountId
              ? {
                  ...a,
                  is_active:
                    (result.data as { is_active: boolean })?.is_active ??
                    !a.is_active,
                }
              : a,
          ),
        );
      } else {
        toast.error(result.error ?? ERRORS_VI.fallback);
      }
    });
  }

  if (accounts.length === 0) {
    return (
      <AppEmptyState
        icon={<IconCircleOff />}
        title={messages.finance.coa.emptyTitle}
        description={messages.finance.coa.emptyDescription}
      >
        <Button onClick={handleSeed} disabled={isPending}>
          {isPending ? (
            <Spinner className="mr-2" />
          ) : (
            <IconPlus className="mr-2 size-4" />
          )}
          {messages.finance.coa.seedAction}
        </Button>
      </AppEmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <AppToolbar className="items-end">
        <div className="grid min-w-56 gap-1.5">
          <Label htmlFor="coa-search" className="text-xs">
            {messages.finance.coa.searchLabel}
          </Label>
          <Input
            id="coa-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={messages.finance.coa.searchPlaceholder}
          />
        </div>
        <div className="grid min-w-44 gap-1.5">
          <Label className="text-xs">{FORM_VI.type}</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {messages.finance.coa.allTypes}
              </SelectItem>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-56 gap-1.5">
          <Label className="text-xs">{messages.finance.coa.cashflow}</Label>
          <Select value={cashflowFilter} onValueChange={setCashflowFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {messages.finance.coa.allCashflows}
              </SelectItem>
              {Object.entries(CASHFLOW_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-40 gap-1.5">
          <Label className="text-xs">{FORM_VI.status}</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {messages.finance.coa.allStatuses}
              </SelectItem>
              <SelectItem value="active">
                {ACTIVE_STATE_LABELS_VI.active}
              </SelectItem>
              <SelectItem value="inactive">
                {ACTIVE_STATE_LABELS_VI.inactive}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {messages.finance.coa.accountCount(
              filteredAccounts.length,
              accounts.length,
            )}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSeed}
            disabled={isPending}
          >
            <IconRefresh className="mr-2 size-4" />
            {messages.finance.coa.checkMissing}
          </Button>
        </div>
      </AppToolbar>

      <Card className="overflow-hidden rounded-lg">
        <CardContent scroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">
                  {messages.finance.coa.code}
                </TableHead>
                <TableHead>{messages.finance.coa.accountName}</TableHead>
                <TableHead className="w-32">{FORM_VI.type}</TableHead>
                <TableHead className="w-44">
                  {messages.finance.coa.cashflow}
                </TableHead>
                <TableHead className="w-24 text-center">
                  {FORM_VI.status}
                </TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAccounts.length === 0 ? (
                <TableEmptyStateRow
                  colSpan={6}
                  mode="no-results"
                  title={messages.finance.coa.noResultsTitle}
                  description={messages.finance.coa.noResultsDescription}
                  paddingClassName="py-8"
                />
              ) : null}
              {filteredAccounts.map((account) => (
                <TableRow
                  key={account.id}
                  className={!account.is_active ? "opacity-50" : undefined}
                >
                  <TableCell className="font-mono font-medium">
                    <span className={indentClassForLevel(account.level)}>
                      {account.account_code}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={indentClassForLevel(account.level)}>
                      {account.account_name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        TYPE_COLORS[account.account_type] === "success"
                          ? "success"
                          : TYPE_COLORS[account.account_type] === "warning"
                            ? "warning"
                            : TYPE_COLORS[account.account_type] === "danger"
                              ? "destructive"
                              : TYPE_COLORS[account.account_type] === "info"
                                ? "info"
                                : "secondary"
                      }
                    >
                      {TYPE_LABELS[account.account_type] ??
                        account.account_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {CASHFLOW_LABELS[account.cashflow_section] ??
                        account.cashflow_section}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={account.is_active ? "success" : "secondary"}
                    >
                      {account.is_active
                        ? ACTIVE_STATE_LABELS_VI.active
                        : ACTIVE_STATE_LABELS_VI.inactive}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(account.id)}
                      disabled={isPending}
                    >
                      {account.is_active
                        ? ACTIVE_STATE_LABELS_VI.inactive
                        : messages.finance.coa.activate}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
