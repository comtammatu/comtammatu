"use client";

import { useState, useTransition } from "react";
import { AppSection } from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { ACTIONS_VI, BRANCH_VI, FORM_VI } from "@comtammatu/shared/messages";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { deletePrinter, upsertPrinter } from "./actions";

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
  code_page: string;
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

type PrinterRole = "receipt" | "kitchen_1" | "kitchen_2";

const ROLE_LABEL: Record<PrinterRole, string> = {
  receipt: "Máy in thu ngân",
  kitchen_1: "Máy in bếp 1",
  kitchen_2: "Máy in bếp 2",
};

const ROLE_ORDER: PrinterRole[] = ["receipt", "kitchen_1", "kitchen_2"];

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

const PRINTER_COPY = {
  active: "Đang bật",
  inactive: "Tắt",
  unconfigured: "Chưa cấu hình",
  noPrintTypes: "Chưa chọn loại phiếu",
  noCategories: "Chưa gán danh mục món",
  slotLabel: "Vị trí máy in",
  samplePrinterPlaceholder: "Ví dụ: Xprinter XP-T80A",
  lanPortHelp:
    "Mặc định port 9100 (ESC/POS raw). Chỉ đổi khi máy in yêu cầu port khác.",
  paperWidthLabel: "Khổ giấy",
  printTypesLabel: "Loại phiếu in trên máy này",
  categoriesLabel: "Danh mục món in trên máy này",
} as const;

const DEFAULT_PRINT_TYPES: Record<PrinterRole, readonly PrintType[]> = {
  receipt: ["receipt", "provisional_bill", "shift_close_report"],
  kitchen_1: ["kitchen_ticket", "cancel_ticket"],
  kitchen_2: ["kitchen_ticket", "cancel_ticket"],
};

function asPrintTypes(values: string[]): PrintType[] {
  return values.filter((value): value is PrintType =>
    PRINT_TYPE_ORDER.includes(value as PrintType),
  );
}

function defaultPrintTypesForRole(role: PrinterRole): PrintType[] {
  return [...DEFAULT_PRINT_TYPES[role]];
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
  const [adding, setAdding] = useState<{
    branch_id: number;
    role: PrinterRole;
  } | null>(null);

  const agentByBranch = new Map(agents.map((a) => [a.branch_id, a]));
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="flex flex-col gap-4">
      {branches.map((branch) => {
        const byRole = new Map(
          printers
            .filter((p) => p.branch_id === branch.id)
            .map((p) => [p.role, p]),
        );
        const agent = agentByBranch.get(branch.id);
        return (
          <AppSection
            key={branch.id}
            title={branch.name}
            badge={{
              children: `Agent: ${agent?.is_online ? "Online" : "Offline"}`,
              variant: agent?.is_online ? "default" : "outline",
            }}
          >
            <ItemGroup className="gap-3">
              {ROLE_ORDER.map((role) => {
                const printer = byRole.get(role);
                const printTypes = asPrintTypes(printer?.print_types ?? []);
                const categoryIds = printer?.category_ids ?? [];
                return (
                  <Item
                    key={role}
                    variant="outline"
                    className="items-start gap-3 bg-card p-3 sm:flex-nowrap sm:items-center"
                  >
                    <ItemContent className="min-w-0">
                      <ItemHeader className="justify-start gap-2">
                        <ItemTitle className="line-clamp-none w-full text-sm font-semibold">
                          {ROLE_LABEL[role]}
                        </ItemTitle>
                        {printer?.is_active ? (
                          <Badge variant="default">{PRINTER_COPY.active}</Badge>
                        ) : printer ? (
                          <Badge variant="outline">
                            {PRINTER_COPY.inactive}
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            {PRINTER_COPY.unconfigured}
                          </Badge>
                        )}
                      </ItemHeader>
                      {printer ? (
                        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                          <p className="break-words leading-6">
                            {printer.name} · {printer.lan_host}
                            {printer.lan_port && printer.lan_port !== 9100
                              ? `:${printer.lan_port}`
                              : ""}{" "}
                            · {printer.paper_width_mm}mm · {printer.code_page}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {printTypes.length > 0 ? (
                              printTypes.map((type) => (
                                <Badge key={type} variant="secondary">
                                  {PRINT_TYPE_LABEL[type]}
                                </Badge>
                              ))
                            ) : (
                              <span>{PRINTER_COPY.noPrintTypes}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {categoryIds.length > 0 ? (
                              categoryIds.map((categoryId) => (
                                <Badge key={categoryId} variant="outline">
                                  {categoryMap.get(categoryId) ??
                                    `#${categoryId}`}
                                </Badge>
                              ))
                            ) : (
                              <span>{PRINTER_COPY.noCategories}</span>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </ItemContent>
                    <ItemActions className="basis-full justify-start pt-1 sm:ml-auto sm:basis-auto sm:justify-end sm:pt-0">
                      {printer ? (
                        <Button
                          variant="outline"
                          size={embedded ? "touch" : "sm"}
                          className="w-full sm:w-auto"
                          onClick={() => setEditing(printer)}
                        >
                          {ACTIONS_VI.edit}
                        </Button>
                      ) : (
                        <Button
                          size={embedded ? "touch" : "sm"}
                          className="w-full sm:w-auto"
                          onClick={() =>
                            setAdding({ branch_id: branch.id, role })
                          }
                        >
                          {ACTIONS_VI.add}
                        </Button>
                      )}
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          </AppSection>
        );
      })}

      {(editing || adding) && (
        <PrinterForm
          branches={branches}
          initial={editing}
          preset={adding}
          categories={categories}
          embedded={embedded}
          onClose={() => {
            setEditing(null);
            setAdding(null);
          }}
        />
      )}
    </div>
  );
}

function PrinterForm({
  branches,
  initial,
  preset,
  categories,
  embedded,
  onClose,
}: {
  branches: Branch[];
  initial: Printer | null;
  preset: { branch_id: number; role: PrinterRole } | null;
  categories: Category[];
  embedded: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const initialRole = (initial?.role ??
    preset?.role ??
    "receipt") as PrinterRole;
  const [form, setForm] = useState({
    branch_id: initial?.branch_id ?? preset?.branch_id ?? 0,
    role: initialRole,
    name: initial?.name ?? "",
    lan_host: initial?.lan_host ?? "",
    lan_port: initial?.lan_port ?? 9100,
    paper_width_mm: (initial?.paper_width_mm ?? 80) as 58 | 80,
    code_page: initial?.code_page ?? "CP1258",
    is_active: initial?.is_active ?? true,
    print_types:
      initial != null
        ? asPrintTypes(initial.print_types)
        : defaultPrintTypesForRole(initialRole),
    category_ids: initial?.category_ids ?? [],
  });
  const canSwitchBranch = branches.length > 1;

  const setRole = (role: PrinterRole) => {
    setForm({
      ...form,
      role,
      print_types: initial ? form.print_types : defaultPrintTypesForRole(role),
      category_ids: form.category_ids,
    });
  };

  const togglePrintType = (type: PrintType, checked: boolean) => {
    setForm({
      ...form,
      print_types: checked
        ? Array.from(new Set([...form.print_types, type]))
        : form.print_types.filter((value) => value !== type),
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
        role: form.role,
        name: form.name,
        lan_host: form.lan_host,
        lan_port: form.lan_port || null,
        paper_width_mm: form.paper_width_mm,
        code_page: form.code_page,
        is_active: form.is_active,
        print_types: printTypes,
        category_ids: form.category_ids,
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
        { label: PRINTER_COPY.slotLabel, value: ROLE_LABEL[initialRole] },
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
    <AppSection
      title={initial ? "Sửa máy in" : "Thêm máy in"}
      contentClassName="gap-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {canSwitchBranch ? (
          <div className="flex flex-col gap-2">
            <Label>{BRANCH_VI.long}</Label>
            {initial ? (
              <Input
                readOnly
                value={
                  branches.find((branch) => branch.id === form.branch_id)?.name ??
                  `#${form.branch_id}`
                }
                className="bg-muted/40"
              />
            ) : (
              <Select
                value={form.branch_id ? String(form.branch_id) : undefined}
                onValueChange={(value) =>
                  setForm({ ...form, branch_id: Number(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={BRANCH_VI.select} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={String(branch.id)}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label>{PRINTER_COPY.slotLabel}</Label>
          {initial ? (
            <Input
              readOnly
              value={ROLE_LABEL[form.role]}
              className="bg-muted/40"
            />
          ) : (
            <Select
              value={form.role}
              onValueChange={(value) => setRole(value as PrinterRole)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_ORDER.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label>{FORM_VI.name}</Label>
          <Input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder={PRINTER_COPY.samplePrinterPlaceholder}
          />
        </div>
        <div className="flex flex-col gap-2 md:col-span-2">
          <Label>LAN host / IP</Label>
          <Input
            value={form.lan_host}
            onChange={(event) =>
              setForm({ ...form, lan_host: event.target.value })
            }
            placeholder="192.168.1.50"
          />
          <p className="text-xs text-muted-foreground">
            {PRINTER_COPY.lanPortHelp}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label>{PRINTER_COPY.paperWidthLabel}</Label>
          <Select
            value={String(form.paper_width_mm)}
            onValueChange={(value) =>
              setForm({ ...form, paper_width_mm: Number(value) as 58 | 80 })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="58">58mm</SelectItem>
              <SelectItem value="80">80mm</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Code page</Label>
          <Input
            value={form.code_page}
            onChange={(event) =>
              setForm({ ...form, code_page: event.target.value })
            }
            placeholder="CP1258"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{PRINTER_COPY.printTypesLabel}</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {PRINT_TYPE_ORDER.map((type) => (
            <Item
              key={type}
              variant="outline"
              className="flex cursor-pointer items-center gap-2 p-3"
            >
              <Checkbox
                id={`print-type-${type}`}
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
            </Item>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{PRINTER_COPY.categoriesLabel}</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {categories.map((category) => (
            <Item
              key={category.id}
              variant="outline"
              className="flex cursor-pointer items-center gap-2 p-3"
            >
              <Checkbox
                id={`print-category-${category.id}`}
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
            </Item>
          ))}
        </div>
      </div>

      {err ? <p className="text-sm text-destructive">{err}</p> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {initial ? (
          <Button
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
          variant="outline"
          size={embedded ? "touch" : "default"}
          className="w-full sm:w-auto"
          onClick={onClose}
          disabled={pending}
        >
          {ACTIONS_VI.cancel}
        </Button>
        <Button
          size={embedded ? "touch" : "default"}
          className="w-full sm:w-auto"
          onClick={save}
          disabled={pending}
        >
          {pending ? "Đang lưu..." : "Lưu"}
        </Button>
      </div>
    </AppSection>
  );
}
