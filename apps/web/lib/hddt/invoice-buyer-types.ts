export type InvoiceBuyerOrderLine = {
  name: string;
  quantity: number;
  amount: number;
};

export type InvoiceBuyerOrderSummary = {
  totalAmount: number;
  serviceCharge: number;
  discountAmount: number;
  items: InvoiceBuyerOrderLine[];
};
