import {
  fetchPurchaseOrders,
  fetchGrns,
  fetchSupplierInvoices,
} from "../procurement-actions";
import { ReceivingClient } from "./receiving-client";

export default async function ReceivingPage() {
  const [poRes, grnRes, invoiceRes] = await Promise.all([
    fetchPurchaseOrders(),
    fetchGrns(),
    fetchSupplierInvoices(),
  ]);

  const poCount =
    poRes.success && poRes.data
      ? (poRes.data as Array<{ status: string }>).filter(
          (po) => po.status === "draft" || po.status === "sent",
        ).length
      : 0;

  const grnCount =
    grnRes.success && grnRes.data
      ? (grnRes.data as Array<{ status: string }>).filter(
          (g) => g.status === "draft" || g.status === "pending",
        ).length
      : 0;

  const invoiceCount =
    invoiceRes.success && invoiceRes.data
      ? (invoiceRes.data as Array<{ matching_status: string }>).filter(
          (inv) =>
            inv.matching_status === "pending" ||
            inv.matching_status === "discrepancy",
        ).length
      : 0;

  return (
    <ReceivingClient
      poCount={poCount}
      grnCount={grnCount}
      invoiceCount={invoiceCount}
    />
  );
}
