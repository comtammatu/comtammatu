"use client";

import { useState, useTransition } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
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
  routingCount: (printTypes: number, categories: number) =>
    `${printTypes} loại phiếu · ${categories} danh mục`,
  back: "Quay lại",
  next: "Tiếp tục",
  saving: "Đang lưu...",
  save: "Lưu",
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
  branch: Branch;
  printers: Printer[];
  categories: Category[];
}) {
  const { branch, printers, categories } = props;
  const [editing, setEditing] = useState<Printer | null>(null);
  const [adding, setAdding] = useState<{
    branch_id: number;
    role: PrinterRole;
  } | null>(null);

  const byRole = new Map(
    printers
      .filter((printer) => printer.branch_id === branch.id)
      .map((printer) => [printer.role, printer]),
  );

  return (
    <div className="flex flex-col gap-3">
      <ItemGroup className="gap-2">
        {ROLE_ORDER.map((role) => {
          const printer = byRole.get(role);
          const printTypes = asPrintTypes(printer?.print_types ?? []);
          const categoryIds = printer?.category_ids ?? [];
          return (
            <Item
              key={role}
              variant="outline"
              className="min-h-20 items-center gap-3"
            >
              <ItemContent className="min-w-0">
                <ItemHeader className="justify-start gap-2">
                  <ItemTitle size="heading" className="line-clamp-none w-full">
                    {ROLE_LABEL[role]}
                  </ItemTitle>
                  {printer?.is_active ? (
                    <Badge variant="default">{PRINTER_COPY.active}</Badge>
                  ) : printer ? (
                    <Badge variant="outline">{PRINTER_COPY.inactive}</Badge>
                  ) : (
                    <Badge variant="outline">{PRINTER_COPY.unconfigured}</Badge>
                  )}
                </ItemHeader>
                {printer ? (
                  <>
                    <ItemDescription className="line-clamp-1">
                      {printer.name} · {printer.lan_host ?? "—"}
                    </ItemDescription>
                    <ItemDescription className="line-clamp-1">
                      {PRINTER_COPY.routingCount(
                        printTypes.length,
                        categoryIds.length,
                      )}
                    </ItemDescription>
                  </>
                ) : null}
              </ItemContent>
              <ItemActions className="basis-full justify-start pt-1 sm:ml-auto sm:basis-auto sm:justify-end sm:pt-0">
                {printer ? (
                  <Button
                    variant="outline"
                    size="touch"
                    onClick={() => setEditing(printer)}
                  >
                    {ACTIONS_VI.edit}
                  </Button>
                ) : (
                  <Button
                    size="touch"
                    onClick={() => setAdding({ branch_id: branch.id, role })}
                  >
                    {ACTIONS_VI.add}
                  </Button>
                )}
              </ItemActions>
            </Item>
          );
        })}
      </ItemGroup>

      {(editing || adding) && (
        <PrinterForm
          branch={branch}
          initial={editing}
          preset={adding}
          categories={categories}
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
  branch,
  initial,
  preset,
  categories,
  onClose,
}: {
  branch: Branch;
  initial: Printer | null;
  preset: { branch_id: number; role: PrinterRole } | null;
  categories: Category[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<"connection" | "routing">("connection");

  const initialRole = (initial?.role ??
    preset?.role ??
    "receipt") as PrinterRole;
  const [form, setForm] = useState({
    branch_id: branch.id,
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
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="flex max-h-dvh-95 flex-col overflow-hidden p-0"
      >
        <SheetHeader className="shrink-0 px-4 pt-4">
          <SheetTitle>{initial ? "Sửa máy in" : "Thêm máy in"}</SheetTitle>
          <SheetDescription>
            {step === "connection"
              ? `${branch.name} · Kết nối máy in`
              : `${ROLE_LABEL[form.role]} · Phân luồng phiếu`}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {step === "connection" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>{PRINTER_COPY.slotLabel}</Label>
                {initial ? (
                  <Input
                    readOnly
                    value={ROLE_LABEL[form.role]}
                    className="bg-muted/50"
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
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder={PRINTER_COPY.samplePrinterPlaceholder}
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label>LAN host / IP</Label>
                <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                  <Input
                    value={form.lan_host}
                    onChange={(event) =>
                      setForm({ ...form, lan_host: event.target.value })
                    }
                    placeholder="192.168.1.50"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={form.lan_port}
                    onChange={(event) =>
                      setForm({ ...form, lan_port: Number(event.target.value) })
                    }
                    aria-label="LAN port"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {PRINTER_COPY.lanPortHelp}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label>{PRINTER_COPY.paperWidthLabel}</Label>
                <Select
                  value={String(form.paper_width_mm)}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      paper_width_mm: Number(value) as 58 | 80,
                    })
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
              <Item variant="muted" className="items-center sm:col-span-2">
                <Checkbox
                  id="printer-active"
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, is_active: checked === true })
                  }
                />
                <Label htmlFor="printer-active" className="cursor-pointer">
                  {PRINTER_COPY.active}
                </Label>
              </Item>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
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

              {initial ? (
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  onClick={remove}
                  disabled={pending}
                >
                  {ACTIONS_VI.delete}
                </Button>
              ) : null}
            </div>
          )}

          {err ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {err}
            </p>
          ) : null}
        </div>

        <SheetFooter className="workflow-safe-pb shrink-0 flex-row border-t bg-background/95 px-4 pt-3 backdrop-blur">
          {step === "routing" ? (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="flex-1"
              onClick={() => setStep("connection")}
              disabled={pending}
            >
              {PRINTER_COPY.back}
            </Button>
          ) : null}
          <Button
            type="button"
            size="touch-lg"
            className="flex-1"
            onClick={step === "connection" ? () => setStep("routing") : save}
            disabled={pending}
          >
            {step === "connection"
              ? PRINTER_COPY.next
              : pending
                ? PRINTER_COPY.saving
                : PRINTER_COPY.save}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
