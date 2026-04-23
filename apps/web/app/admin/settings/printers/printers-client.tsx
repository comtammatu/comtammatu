"use client";

import { useState, useTransition } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { upsertPrinter, deletePrinter } from "./actions";

export type Branch = { id: number; name: string };

export type Printer = {
  id: number;
  branch_id: number;
  role: string;
  name: string;
  connection_type: string;
  lan_host: string | null;
  lan_port: number | null;
  usb_vendor_id: string | null;
  usb_product_id: string | null;
  paper_width_mm: number;
  code_page: string;
  is_active: boolean;
};

export type Agent = {
  branch_id: number | null;
  agent_id: string | null;
  version: string | null;
  last_seen_at: string | null;
  is_online: boolean | null;
};

type PrinterRole = "receipt" | "kitchen_1" | "kitchen_2";
type ConnectionType = "lan" | "usb";

const ROLE_LABEL: Record<PrinterRole, string> = {
  receipt: "Hoá đơn",
  kitchen_1: "Bếp 1",
  kitchen_2: "Bếp 2",
};

const ROLE_ORDER: PrinterRole[] = ["receipt", "kitchen_1", "kitchen_2"];

export function PrintersClient(props: {
  branches: Branch[];
  printers: Printer[];
  agents: Agent[];
}) {
  const { branches, printers, agents } = props;
  const [editing, setEditing] = useState<Printer | null>(null);
  const [adding, setAdding] = useState<{
    branch_id: number;
    role: PrinterRole;
  } | null>(null);

  const agentByBranch = new Map(agents.map((a) => [a.branch_id, a]));

  return (
    <div className="space-y-6">
      {branches.map((b) => {
        const byRole = new Map(
          printers.filter((p) => p.branch_id === b.id).map((p) => [p.role, p]),
        );
        const agent = agentByBranch.get(b.id);
        return (
          <Card key={b.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{b.name}</CardTitle>
              <Badge variant={agent?.is_online ? "default" : "outline"}>
                Agent: {agent?.is_online ? "Online" : "Offline"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {ROLE_ORDER.map((role) => {
                const p = byRole.get(role);
                return (
                  <div
                    key={role}
                    className="flex items-center justify-between rounded border border-border/70 p-3"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{ROLE_LABEL[role]}</span>
                        {p?.is_active ? (
                          <Badge variant="default">Đang bật</Badge>
                        ) : p ? (
                          <Badge variant="outline">Tắt</Badge>
                        ) : (
                          <Badge variant="outline">Chưa cấu hình</Badge>
                        )}
                      </div>
                      {p ? (
                        <span className="text-sm text-muted-foreground">
                          {p.name} ·{" "}
                          {p.connection_type === "lan"
                            ? `${p.lan_host}:${p.lan_port ?? 9100}`
                            : `USB ${p.usb_vendor_id}${p.usb_product_id ? `/${p.usb_product_id}` : ""}`}{" "}
                          · {p.paper_width_mm}mm · {p.code_page}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      {p ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(p)}
                        >
                          Sửa
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() =>
                            setAdding({ branch_id: b.id, role })
                          }
                        >
                          Thêm
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {(editing || adding) && (
        <PrinterForm
          initial={editing}
          preset={adding}
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
  initial,
  preset,
  onClose,
}: {
  initial: Printer | null;
  preset: { branch_id: number; role: PrinterRole } | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    branch_id: initial?.branch_id ?? preset?.branch_id ?? 0,
    role: (initial?.role ?? preset?.role ?? "receipt") as PrinterRole,
    name: initial?.name ?? "",
    connection_type: (initial?.connection_type ?? "lan") as ConnectionType,
    lan_host: initial?.lan_host ?? "",
    lan_port: initial?.lan_port ?? 9100,
    usb_vendor_id: initial?.usb_vendor_id ?? "",
    usb_product_id: initial?.usb_product_id ?? "",
    paper_width_mm: (initial?.paper_width_mm ?? 80) as 58 | 80,
    code_page: initial?.code_page ?? "CP1258",
    is_active: initial?.is_active ?? true,
  });

  const save = () => {
    setErr(null);
    startTransition(async () => {
      const res = await upsertPrinter({
        id: initial?.id,
        branch_id: form.branch_id,
        role: form.role,
        name: form.name,
        connection_type: form.connection_type,
        lan_host: form.lan_host || null,
        lan_port: form.lan_port || null,
        usb_vendor_id: form.usb_vendor_id || null,
        usb_product_id: form.usb_product_id || null,
        paper_width_mm: form.paper_width_mm,
        code_page: form.code_page,
        is_active: form.is_active,
      });
      if (!res.success) {
        setErr(res.error ?? "Có lỗi xảy ra");
        return;
      }
      onClose();
    });
  };

  const remove = () => {
    if (!initial) return;
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
    <Card>
      <CardHeader>
        <CardTitle>
          {initial ? "Sửa máy in" : "Thêm máy in"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Tên</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ví dụ: Xprinter XP-T80A"
            />
          </div>
          <div className="space-y-2">
            <Label>Kết nối</Label>
            <Select
              value={form.connection_type}
              onValueChange={(v) =>
                setForm({ ...form, connection_type: v as ConnectionType })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lan">LAN (Ethernet)</SelectItem>
                <SelectItem value="usb">USB</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.connection_type === "lan" ? (
            <>
              <div className="space-y-2">
                <Label>LAN host / IP</Label>
                <Input
                  value={form.lan_host}
                  onChange={(e) =>
                    setForm({ ...form, lan_host: e.target.value })
                  }
                  placeholder="192.168.1.50"
                />
              </div>
              <div className="space-y-2">
                <Label>LAN port</Label>
                <Input
                  type="number"
                  value={form.lan_port}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      lan_port: Number(e.target.value || 9100),
                    })
                  }
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>USB Vendor ID</Label>
                <Input
                  value={form.usb_vendor_id}
                  onChange={(e) =>
                    setForm({ ...form, usb_vendor_id: e.target.value })
                  }
                  placeholder="0x04b8"
                />
              </div>
              <div className="space-y-2">
                <Label>USB Product ID</Label>
                <Input
                  value={form.usb_product_id}
                  onChange={(e) =>
                    setForm({ ...form, usb_product_id: e.target.value })
                  }
                  placeholder="0x0202"
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Khổ giấy</Label>
            <Select
              value={String(form.paper_width_mm)}
              onValueChange={(v) =>
                setForm({ ...form, paper_width_mm: Number(v) as 58 | 80 })
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

          <div className="space-y-2">
            <Label>Code page</Label>
            <Input
              value={form.code_page}
              onChange={(e) => setForm({ ...form, code_page: e.target.value })}
              placeholder="CP1258"
            />
          </div>
        </div>

        {err ? (
          <p className="text-sm text-destructive">{err}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          {initial ? (
            <Button variant="outline" onClick={remove} disabled={pending}>
              Xoá
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Huỷ
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
