"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowDownLeft as IconArrowDownLeft,
  ArrowUpRight as IconArrowUpRight,
  Coins as IconCoins,
  Plus as IconPlus,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui/lib/utils";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import {
  BusinessDateField,
  dateToBusinessDate,
  formatBusinessDate,
  MoneyVndField,
  SelectField,
  TextareaField,
} from "@/components/form";
import { messages } from "@lib/messages";
import { createCashEntry } from "../cash-book-actions";
import {
  cashCategoryLabel,
  cashEntrySchema,
  categoriesFor,
  type CashEntryRow,
} from "../_lib/cash-book";

const cashCopy = messages.finance.cashBook;

type AccessibleBranch = { id: number; name: string };

interface CashBookClientProps {
  entries: CashEntryRow[];
  branches: AccessibleBranch[];
  defaultBranchId: number | null;
  totalIn: number;
  totalOut: number;
}

// Form schema = canonical schema with branchId/entryDate adapted for the form:
// branchId is a Select string (converted on submit), entryDate is required
// with a today default.
const cashEntryFormSchema = cashEntrySchema
  .omit({ branchId: true, entryDate: true })
  .extend({
    branchId: z.string().min(1, { error: "Chọn chi nhánh" }),
    entryDate: z.string().date(),
  });

type CashEntryFormValues = z.infer<typeof cashEntryFormSchema>;

const DIRECTION_OPTIONS = [
  { value: "out", label: cashCopy.directionOut },
  { value: "in", label: cashCopy.directionIn },
] as const;

function makeDefaults(branchValue: string): CashEntryFormValues {
  return {
    branchId: branchValue,
    direction: "out",
    amount: "",
    category: "",
    note: "",
    entryDate: dateToBusinessDate(new Date()),
  };
}

function SummaryCard({
  title,
  value,
  tone,
  icon,
}: {
  title: string;
  value: string;
  tone: "in" | "out" | "neutral";
  icon: React.ReactNode;
}) {
  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-muted-foreground">{icon}</span>
          <CardTitle className="truncate">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "truncate font-mono text-2xl font-semibold tabular-nums",
            tone === "in" && "text-success",
            tone === "out" && "text-destructive",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export function CashBookClient({
  entries,
  branches,
  defaultBranchId,
  totalIn,
  totalOut,
}: CashBookClientProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const soleBranchId = branches.length === 1 ? branches[0]?.id : undefined;
  const initialBranchValue =
    defaultBranchId != null
      ? String(defaultBranchId)
      : soleBranchId != null
        ? String(soleBranchId)
        : "";

  const branchOptions = branches.map((b) => ({
    value: String(b.id),
    label: b.name,
  }));

  const form = useForm<CashEntryFormValues>({
    resolver: zodResolver(cashEntryFormSchema),
    defaultValues: makeDefaults(initialBranchValue),
  });

  const direction = form.watch("direction");

  // Categories differ per direction — reset the picker whenever it flips so a
  // stale (wrong-direction) category can't be submitted.
  useEffect(() => {
    form.setValue("category", "");
  }, [direction, form]);

  useEffect(() => {
    if (open) {
      form.reset(makeDefaults(initialBranchValue));
      setServerError(null);
    }
  }, [open, form, initialBranchValue]);

  function onValid(values: CashEntryFormValues) {
    startTransition(async () => {
      setServerError(null);
      const result = await createCashEntry({
        branchId: Number(values.branchId),
        direction: values.direction,
        amount: values.amount,
        category: values.category,
        note: values.note || undefined,
        entryDate: values.entryDate,
      });

      if (!result.success) {
        setServerError(result.error ?? ERRORS_VI.fallback);
        return;
      }

      toast.success(cashCopy.success);
      setOpen(false);
      router.refresh();
    });
  }

  const balance = totalIn - totalOut;
  const categoryOptions = categoriesFor(direction);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          title={cashCopy.totals.in}
          value={formatVND(totalIn)}
          tone="in"
          icon={<IconArrowDownLeft className="size-4" />}
        />
        <SummaryCard
          title={cashCopy.totals.out}
          value={formatVND(totalOut)}
          tone="out"
          icon={<IconArrowUpRight className="size-4" />}
        />
        <SummaryCard
          title={cashCopy.totals.balance}
          value={formatVND(balance)}
          tone="neutral"
          icon={<IconCoins className="size-4" />}
        />
      </div>

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <IconPlus data-icon="inline-start" />
          {cashCopy.addEntry}
        </Button>
      </div>

      {entries.length === 0 ? (
        <Empty className="py-12">
          <EmptyMedia variant="icon">
            <IconCoins aria-hidden />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{cashCopy.empty}</EmptyTitle>
            <EmptyDescription>{cashCopy.emptyHint}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{cashCopy.table.date}</TableHead>
                <TableHead>{cashCopy.table.direction}</TableHead>
                <TableHead>{cashCopy.table.category}</TableHead>
                <TableHead className="text-right">
                  {cashCopy.table.amount}
                </TableHead>
                <TableHead>{cashCopy.table.note}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const isIn = entry.direction === "in";
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatBusinessDate(entry.entry_date)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          isIn
                            ? "bg-success/10 text-success"
                            : "bg-destructive/10 text-destructive",
                        )}
                      >
                        {isIn ? cashCopy.badgeIn : cashCopy.badgeOut}
                      </span>
                    </TableCell>
                    <TableCell>{cashCategoryLabel(entry.category)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono font-medium tabular-nums",
                        isIn ? "text-success" : "text-destructive",
                      )}
                    >
                      {isIn ? "+" : "−"}
                      {formatVND(Number(entry.amount))}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {entry.note ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{cashCopy.dialogTitle}</DialogTitle>
            <DialogDescription>{cashCopy.dialogDescription}</DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onValid)} noValidate>
            <FieldGroup>
              {branches.length > 1 ? (
                <SelectField
                  control={form.control}
                  name="branchId"
                  label={cashCopy.fields.branch}
                  options={branchOptions}
                  placeholder={cashCopy.fields.branch}
                  required
                />
              ) : null}

              <SelectField
                control={form.control}
                name="direction"
                label={cashCopy.fields.direction}
                options={DIRECTION_OPTIONS}
                required
              />

              <SelectField
                control={form.control}
                name="category"
                label={cashCopy.fields.category}
                options={categoryOptions}
                placeholder={cashCopy.fields.category}
                required
              />

              <MoneyVndField
                control={form.control}
                name="amount"
                label={cashCopy.fields.amount}
                placeholder="0"
                required
              />

              <BusinessDateField
                control={form.control}
                name="entryDate"
                label={cashCopy.fields.date}
                required
              />

              <TextareaField
                control={form.control}
                name="note"
                label={cashCopy.fields.note}
                placeholder={cashCopy.notePlaceholder}
                rows={2}
              />

              {serverError && (
                <p className="text-sm text-destructive" role="alert">
                  {serverError}
                </p>
              )}
            </FieldGroup>

            <DialogFooter className="pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                {ACTIONS_VI.cancel}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Spinner className="mr-2" />}
                {cashCopy.addEntry}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
