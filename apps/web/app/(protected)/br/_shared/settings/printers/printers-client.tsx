"use client";

import { useState, useTransition } from "react";
import { AppSection } from "@/components/surface";
import { AppDialog } from "@/components/form";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { Switch } from "@comtammatu/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { ACTIONS_VI, BRANCH_VI, FORM_VI } from "@comtammatu/shared/messages";
import { confirm } from "@/components/confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { messages } from "@lib/messages";
import { deletePrinter, testPrintPrinter, upsertPrinter } from "./actions";

export type Branch = { id: number; name: string };

export type PrintType =
  | "receipt"
  | "provisional_bill"
  | "shift_close_report"
  | "kitchen_ticket"
  | "cancel_ticket";

export type Printer = {
  id: number;
  branch_id: number;
  role: string;
  name: string;
  lan_host: string | null;
  lan_port: number | null;
  paper_width_mm: number;
  is_active: boolean;
  print_types: string[];
  category_ids: number[];
};

export type Category = {
  id: number;
  name: string;
  type: string;
  sort_order: number;
};

export type Agent = {
  branch_id: number | null;
  agent_id: string | null;
  version: string | null;
  last_seen_at: string | null;
  is_online: boolean | null;
};

const PRINT_TYPE_ORDER: readonly PrintType[] = [
  "receipt",
  "provisional_bill",
  "shift_close_report",
  "kitchen_ticket",
  "cancel_ticket",
];

const PRINT_TYPE_LABEL: Record<PrintType, string> = {
  receipt: "Hóa đơn thanh toán",
  provisional_bill: "Phiếu tạm tính",
  shift_close_report: "Phiếu chốt ca",
  kitchen_ticket: "Phiếu bếp",
  cancel_ticket: "Phiếu hủy / giảm món",
};

const KITCHEN_PRINT_TYPES = new Set<PrintType>([
  "kitchen_ticket",
  "cancel_ticket",
]);

const PRINTER_COPY = {
  active: "Đang bật",
  inactive: "Tắt",
  emptyBranch: "Chưa có máy in nào",
  noPrintTypes: "Chưa chọn loại phiếu",
  noCategories: "Chưa gán danh mục món",
  addPrinter: "Thêm máy in",
  samplePrinterPlaceholder: "Ví dụ: Xprinter XP-T80A",
  lanPortHelp: "Mặc định 9100. Chỉ đổi khi máy in yêu cầu port khác.",
  paperWidthLabel: "Khổ giấy",
  printTypesLabel: "Loại phiếu in trên máy này",
  categoriesLabel: "Danh mục món in trên máy này",
  categoriesHint:
    "Mỗi danh mục chỉ gán cho một máy in bếp trong chi nhánh.",
  activeControlLabel: "Cho phép nhận lệnh in",
  testPrint: messages.settings.printers.testPrint,
  testPrintSent: messages.settings.printers.testPrintSent,
} as const;

const PRINTER_FORM_ID = "branch-printer-form";
const PRINTER_FIELD_IDS = {
  branch: "branch-printer-branch",
  name: "branch-printer-name",
  lanHost: "branch-printer-lan-host",
  lanPort: "branch-printer-lan-port",
  lanPortHelp: "branch-printer-lan-port-help",
  paperWidth: "branch-printer-paper-width",
  active: "branch-printer-active",
} as const;

function asPrintTypes(values: string[]): PrintType[] {
  return values.filter((value): value is PrintType =>
    PRINT_TYPE_ORDER.includes(value as PrintType),
  );
}

function showsCategoryRoutes(printTypes: readonly PrintType[]): boolean {
  return printTypes.some((type) => KITCHEN_PRINT_TYPES.has(type));
}

function formatLanEndpoint(
  host: string | null,
  port: number | null,
): string | null {
  const trimmed = host?.trim();
  if (!trimmed) return null;
  if (port && port !== 9100) return `${trimmed}:${port}`;
  return trimmed;
}

export function PrintersClient(props: {
  branches: Branch[];
  printers: Printer[];
  agents: Agent[];
  categories: Category[];
  embedded?: boolean;
}) {
  const { branches, printers, agents, categories, embedded = false } = props;
  const [editing, setEditing] = useState<Printer | null>(null);
  const [addingBranchId, setAddingBranchId] = useState<number | null>(null);
  const [testPendingId, setTestPendingId] = useState<number | null>(null);
  const [testPending, startTestPrint] = useTransition();

  const agentByBranch = new Map(agents.map((a) => [a.branch_id, a]));
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const handleTestPrint = (printerId: number) => {
    if (testPending) return;
    setTestPendingId(printerId);
    startTestPrint(async () => {
      const result = await testPrintPrinter({ printer_id: printerId });
      setTestPendingId(null);
      if (result.success) {
        toast.success(PRINTER_COPY.testPrintSent);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {branches.map((branch) => {
        const branchPrinters = printers
          .filter((p) => p.branch_id === branch.id)
          .toSorted((a, b) => a.name.localeCompare(b.name, "vi"));
        const agent = agentByBranch.get(branch.id);
        return (
          <AppSection
            key={branch.id}
            title={branch.name}
            badge={{
              children: `Agent: ${agent?.is_online ? "Đang kết nối" : "Mất kết nối"}`,
              variant: agent?.is_online ? "default" : "outline",
            }}
          >
            <ItemGroup className="gap-2">
              {branchPrinters.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {PRINTER_COPY.emptyBranch}
                </p>
              ) : (
                branchPrinters.map((printer) => {
                  const printTypes = asPrintTypes(printer.print_types);
                  const categoryIds = printer.category_ids;
                  const endpoint = formatLanEndpoint(
                    printer.lan_host,
                    printer.lan_port,
                  );
                  const canTestPrint =
                    printer.is_active && Boolean(printer.lan_host?.trim());
                  const isTesting =
                    testPending && testPendingId === printer.id;
                  return (
                    <Item
                      key={printer.id}
                      variant="outline"
                      className="items-start gap-3 sm:flex-nowrap sm:items-center"
                    >
                      <ItemContent className="min-w-0 gap-1.5">
                        <ItemHeader className="justify-start gap-2">
                          <ItemTitle
                            size="heading"
                            className="line-clamp-none w-full"
                          >
                            {printer.name}
                          </ItemTitle>
                          <Badge
                            variant={printer.is_active ? "default" : "outline"}
                          >
                            {printer.is_active
                              ? PRINTER_COPY.active
                              : PRINTER_COPY.inactive}
                          </Badge>
                        </ItemHeader>
                        <p className="break-words text-sm leading-5 text-muted-foreground">
                          {endpoint ?? "—"} · {printer.paper_width_mm}mm
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {printTypes.length > 0 ? (
                            printTypes.map((type) => (
                              <Badge key={type} variant="secondary">
                                {PRINT_TYPE_LABEL[type]}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {PRINTER_COPY.noPrintTypes}
                            </span>
                          )}
                        </div>
                        {showsCategoryRoutes(printTypes) ? (
                          <div className="flex flex-wrap gap-1">
                            {categoryIds.length > 0 ? (
                              categoryIds.map((categoryId) => (
                                <Badge key={categoryId} variant="outline">
                                  {categoryMap.get(categoryId) ??
                                    `#${categoryId}`}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                {PRINTER_COPY.noCategories}
                              </span>
                            )}
                          </div>
                        ) : null}
                      </ItemContent>
                      <ItemActions className="basis-full justify-start gap-2 pt-1 sm:ml-auto sm:basis-auto sm:justify-end sm:pt-0">
                        <Button
                          variant="outline"
                          size={embedded ? "touch" : "sm"}
                          className="w-full sm:w-auto"
                          disabled={!canTestPrint || testPending}
                          onClick={() => handleTestPrint(printer.id)}
                        >
                          {isTesting
                            ? `${PRINTER_COPY.testPrint}…`
                            : PRINTER_COPY.testPrint}
                        </Button>
                        <Button
                          variant="outline"
                          size={embedded ? "touch" : "sm"}
                          className="w-full sm:w-auto"
                          onClick={() => setEditing(printer)}
                        >
                          {ACTIONS_VI.edit}
                        </Button>
                      </ItemActions>
                    </Item>
                  );
                })
              )}
              <Button
                size={embedded ? "touch" : "sm"}
                className="w-full sm:w-auto"
                onClick={() => setAddingBranchId(branch.id)}
              >
                {PRINTER_COPY.addPrinter}
              </Button>
            </ItemGroup>
          </AppSection>
        );
      })}

      {(editing || addingBranchId != null) && (
        <PrinterForm
          branches={branches}
          initial={editing}
          branchId={editing?.branch_id ?? addingBranchId ?? 0}
          categories={categories}
          embedded={embedded}
          onClose={() => {
            setEditing(null);
            setAddingBranchId(null);
          }}
        />
      )}
    </div>
  );
}

function PrinterForm({
  branches,
  initial,
  branchId,
  categories,
  embedded,
  onClose,
}: {
  branches: Branch[];
  initial: Printer | null;
  branchId: number;
  categories: Category[];
  embedded: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    branch_id: branchId,
    name: initial?.name ?? "",
    lan_host: initial?.lan_host ?? "",
    lan_port: String(initial?.lan_port ?? 9100),
    paper_width_mm: (initial?.paper_width_mm ?? 80) as 58 | 80,
    is_active: initial?.is_active ?? true,
    print_types: asPrintTypes(initial?.print_types ?? []),
    category_ids: initial?.category_ids ?? [],
  });
  const canSwitchBranch = branches.length > 1;
  const controlSize = embedded ? "touch" : "field";
  const optionSize = embedded ? "touch" : "default";
  const categoryRoutingEnabled = showsCategoryRoutes(form.print_types);

  const togglePrintType = (type: PrintType, checked: boolean) => {
    const nextPrintTypes = checked
      ? Array.from(new Set([...form.print_types, type]))
      : form.print_types.filter((value) => value !== type);
    setForm({
      ...form,
      print_types: nextPrintTypes,
      category_ids: showsCategoryRoutes(nextPrintTypes)
        ? form.category_ids
        : [],
    });
  };

  const toggleCategory = (categoryId: number, checked: boolean) => {
    setForm({
      ...form,
      category_ids: checked
        ? Array.from(new Set([...form.category_ids, categoryId]))
        : form.category_ids.filter((value) => value !== categoryId),
    });
  };

  const save = () => {
    if (pending) return;
    setErr(null);
    if (!form.branch_id) {
      setErr("Vui lòng chọn chi nhánh");
      return;
    }
    const printTypes = asPrintTypes(form.print_types);
    startTransition(async () => {
      const res = await upsertPrinter({
        id: initial?.id,
        branch_id: form.branch_id,
        role: initial?.role ?? "custom",
        name: form.name,
        lan_host: form.lan_host,
        lan_port: form.lan_port ? Number(form.lan_port) : null,
        paper_width_mm: form.paper_width_mm,
        is_active: form.is_active,
        print_types: printTypes,
        category_ids: showsCategoryRoutes(printTypes)
          ? form.category_ids
          : [],
      });
      if (!res.success) {
        setErr(res.error ?? "Có lỗi xảy ra");
        return;
      }
      onClose();
    });
  };

  const remove = async () => {
    if (!initial) return;
    const ok = await confirm({
      title: "Xóa máy in này?",
      description: "Cấu hình máy in sẽ bị xóa và không thể khôi phục.",
      details: [
        { label: FORM_VI.name, value: initial.name },
        ...(initial.lan_host
          ? [{ label: "LAN host / IP", value: initial.lan_host }]
          : []),
      ],
      confirmText: "Xóa",
      variant: "destructive",
    });
    if (!ok) return;
    setErr(null);
    startTransition(async () => {
      const res = await deletePrinter(initial.id);
      if (!res.success) {
        setErr(res.error ?? "Có lỗi xảy ra");
        return;
      }
      onClose();
    });
  };

  return (
    <AppDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={initial ? "Sửa máy in" : PRINTER_COPY.addPrinter}
      description={initial ? initial.name : undefined}
      contentClassName="sm:max-w-md"
      bodyClassName="max-h-dvh-95 overflow-y-auto"
      footer={
        <>
          {initial ? (
            <Button
              type="button"
              variant="outline"
              size={embedded ? "touch" : "default"}
              className="w-full sm:w-auto"
              onClick={remove}
              disabled={pending}
            >
              {ACTIONS_VI.delete}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size={embedded ? "touch" : "default"}
            className="w-full sm:w-auto"
            onClick={onClose}
            disabled={pending}
          >
            {ACTIONS_VI.cancel}
          </Button>
          <Button
            type="submit"
            form={PRINTER_FORM_ID}
            size={embedded ? "touch" : "default"}
            className="w-full sm:w-auto"
            disabled={pending}
          >
            {pending ? "Đang lưu…" : "Lưu"}
          </Button>
        </>
      }
    >
      <form
        id={PRINTER_FORM_ID}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {canSwitchBranch ? (
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor={PRINTER_FIELD_IDS.branch}>
                {BRANCH_VI.long}
              </FieldLabel>
              {initial ? (
                <Input
                  id={PRINTER_FIELD_IDS.branch}
                  name="branch_id"
                  autoComplete="off"
                  controlSize={controlSize}
                  readOnly
                  value={
                    branches.find((branch) => branch.id === form.branch_id)
                      ?.name ?? `#${form.branch_id}`
                  }
                  className="bg-muted/50"
                />
              ) : (
                <Select
                  name="branch_id"
                  value={form.branch_id ? String(form.branch_id) : undefined}
                  onValueChange={(value) =>
                    setForm({ ...form, branch_id: Number(value) })
                  }
                >
                  <SelectTrigger
                    id={PRINTER_FIELD_IDS.branch}
                    size={controlSize}
                  >
                    <SelectValue placeholder={BRANCH_VI.select} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem
                        key={branch.id}
                        value={String(branch.id)}
                        size={optionSize}
                      >
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          ) : null}

          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={PRINTER_FIELD_IDS.name}>
              {FORM_VI.name}
            </FieldLabel>
            <Input
              id={PRINTER_FIELD_IDS.name}
              name="name"
              autoComplete="off"
              controlSize={controlSize}
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              placeholder={PRINTER_COPY.samplePrinterPlaceholder}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={PRINTER_FIELD_IDS.lanHost}>
              LAN host / IP
            </FieldLabel>
            <Input
              id={PRINTER_FIELD_IDS.lanHost}
              name="lan_host"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              controlSize={controlSize}
              value={form.lan_host}
              onChange={(event) =>
                setForm({ ...form, lan_host: event.target.value })
              }
              placeholder="192.168.1.50"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={PRINTER_FIELD_IDS.lanPort}>
              LAN port
            </FieldLabel>
            <Input
              id={PRINTER_FIELD_IDS.lanPort}
              name="lan_port"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min={1}
              max={65535}
              step={1}
              controlSize={controlSize}
              aria-describedby={PRINTER_FIELD_IDS.lanPortHelp}
              value={form.lan_port}
              onChange={(event) =>
                setForm({ ...form, lan_port: event.target.value })
              }
            />
            <FieldDescription id={PRINTER_FIELD_IDS.lanPortHelp}>
              {PRINTER_COPY.lanPortHelp}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={PRINTER_FIELD_IDS.paperWidth}>
              {PRINTER_COPY.paperWidthLabel}
            </FieldLabel>
            <Select
              name="paper_width_mm"
              value={String(form.paper_width_mm)}
              onValueChange={(value) =>
                setForm({ ...form, paper_width_mm: Number(value) as 58 | 80 })
              }
            >
              <SelectTrigger
                id={PRINTER_FIELD_IDS.paperWidth}
                size={controlSize}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="58" size={optionSize}>
                  58mm
                </SelectItem>
                <SelectItem value="80" size={optionSize}>
                  80mm
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field orientation="horizontal" className="items-center self-end pb-1">
            <Switch
              id={PRINTER_FIELD_IDS.active}
              name="is_active"
              size={embedded ? "touch" : "default"}
              checked={form.is_active}
              onCheckedChange={(checked) =>
                setForm({ ...form, is_active: checked })
              }
            />
            <FieldLabel htmlFor={PRINTER_FIELD_IDS.active}>
              {PRINTER_COPY.activeControlLabel}
            </FieldLabel>
          </Field>
        </div>

        <FieldSet>
          <FieldLegend variant="label">
            {PRINTER_COPY.printTypesLabel}
          </FieldLegend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {PRINT_TYPE_ORDER.map((type) => (
              <div
                key={type}
                className="flex min-h-11 items-center gap-2 rounded-md px-1"
              >
                <Checkbox
                  id={`print-type-${type}`}
                  name="print_types"
                  value={type}
                  size={embedded ? "touch" : "default"}
                  checked={form.print_types.includes(type)}
                  onCheckedChange={(checked) =>
                    togglePrintType(type, checked === true)
                  }
                />
                <Label
                  htmlFor={`print-type-${type}`}
                  className="w-full cursor-pointer text-sm font-normal"
                >
                  {PRINT_TYPE_LABEL[type]}
                </Label>
              </div>
            ))}
          </div>
        </FieldSet>

        {categoryRoutingEnabled ? (
          <FieldSet>
            <FieldLegend variant="label">
              {PRINTER_COPY.categoriesLabel}
            </FieldLegend>
            <FieldDescription>{PRINTER_COPY.categoriesHint}</FieldDescription>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex min-h-11 items-center gap-2 rounded-md px-1"
                >
                  <Checkbox
                    id={`print-category-${category.id}`}
                    name="category_ids"
                    value={String(category.id)}
                    size={embedded ? "touch" : "default"}
                    checked={form.category_ids.includes(category.id)}
                    onCheckedChange={(checked) =>
                      toggleCategory(category.id, checked === true)
                    }
                  />
                  <Label
                    htmlFor={`print-category-${category.id}`}
                    className="w-full cursor-pointer text-sm font-normal"
                  >
                    {category.name}
                  </Label>
                </div>
              ))}
            </div>
          </FieldSet>
        ) : null}

        {err ? (
          <p className="text-sm text-destructive" role="alert">
            {err}
          </p>
        ) : null}
      </form>
    </AppDialog>
  );
}
