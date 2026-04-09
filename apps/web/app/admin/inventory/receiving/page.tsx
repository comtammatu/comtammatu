import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  FileText,
  PackageSearch,
  Plus,
} from "lucide-react";
import {
  fetchPurchaseOrders,
  fetchGrns,
  fetchSupplierInvoices,
} from "../procurement-actions";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Button } from "@comtammatu/ui/components/button";
import { PageHeader } from "@/components/foundation/ui-patterns";

export default async function ReceivingPage() {
  const [poRes, grnRes, invoiceRes] = await Promise.all([
    fetchPurchaseOrders(),
    fetchGrns(),
    fetchSupplierInvoices(),
  ]);

  // Count by status
  const pos = (poRes.success ? (poRes.data ?? []) : []) as Array<{
    status: string;
  }>;
  const grns = (grnRes.success ? (grnRes.data ?? []) : []) as Array<{
    status: string;
  }>;
  const invoices = (
    invoiceRes.success ? (invoiceRes.data ?? []) : []
  ) as Array<{ matching_status: string }>;

  const activePOs = pos.filter(
    (p) => p.status === "draft" || p.status === "sent",
  ).length;
  const draftGRNs = grns.filter((g) => g.status === "draft").length;
  const pendingInvoices = invoices.filter(
    (i) =>
      i.matching_status === "pending" || i.matching_status === "discrepancy",
  ).length;

  const steps = [
    {
      step: 1,
      label: "Đơn đặt hàng",
      sublabel: "Tạo PO cho NCC",
      icon: ClipboardList,
      href: "/admin/inventory/purchase-orders",
      count: activePOs,
      countLabel: "đang xử lý",
    },
    {
      step: 2,
      label: "Nhận hàng",
      sublabel: "Kiểm đếm & nhập kho",
      icon: PackageSearch,
      href: "/admin/inventory/grn",
      count: draftGRNs,
      countLabel: "phiếu nháp",
    },
    {
      step: 3,
      label: "Đối soát",
      sublabel: "Khớp HĐ với PO & GRN",
      icon: FileText,
      href: "/admin/inventory/supplier-invoices",
      count: pendingInvoices,
      countLabel: "chờ đối soát",
    },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhập kho"
        description="Quy trình mua hàng: Đặt hàng → Nhận hàng → Đối soát hóa đơn"
        actions={
          <Button asChild size="sm">
            <Link href="/admin/inventory/purchase-orders/new">
              <Plus className="mr-1.5 size-4" />
              Tạo PO
            </Link>
          </Button>
        }
      />

      {/* Flow Stepper */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {steps.map((s, idx) => {
          const Icon = s.icon;
          return (
            <Link key={s.step} href={s.href} className="group">
              <Card className="relative transition-shadow hover:shadow-md">
                <CardContent className="pt-6">
                  {/* Step connector line (desktop only) */}
                  {idx < steps.length - 1 && (
                    <div className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 md:block">
                      <ArrowRight className="size-4 text-muted-foreground/50" />
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {s.step}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <h3 className="font-semibold">{s.label}</h3>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {s.sublabel}
                      </p>
                      {s.count > 0 && (
                        <p className="mt-2 text-sm">
                          <span className="font-semibold tabular-nums text-primary">
                            {s.count}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {s.countLabel}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Quick links to sub-pages */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <QuickLink
          href="/admin/inventory/purchase-orders"
          label="Xem tất cả đơn đặt hàng"
        />
        <QuickLink
          href="/admin/inventory/grn"
          label="Xem tất cả phiếu nhập kho"
        />
        <QuickLink
          href="/admin/inventory/supplier-invoices"
          label="Xem tất cả hóa đơn NCC"
        />
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-md border px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {label}
      <ArrowRight className="size-4 shrink-0" />
    </Link>
  );
}
