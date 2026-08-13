export type InvoiceBuyerVatRate = 0 | 5 | 8 | 10;

export type InvoiceBuyerOrderLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  vatRate: InvoiceBuyerVatRate;
};

export type InvoiceBuyerOrderSummary = {
  totalAmount: number;
  serviceCharge: number;
  discountAmount: number;
  items: InvoiceBuyerOrderLine[];
};
