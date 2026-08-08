type PrintTypeRow = { printer_id: number; print_type: string };
type CategoryRouteRow = { printer_id: number; category_id: number };

type PrinterBase = {
  id: number;
  branch_id: number;
  role: string;
  name: string;
  lan_host: string | null;
  lan_port: number | null;
  paper_width_mm: number;
  is_active: boolean;
};

export type PrinterWithRouting = PrinterBase & {
  print_types: string[];
  category_ids: number[];
};

function groupBy<Row, Value>(
  rows: readonly Row[],
  key: (row: Row) => number,
  value: (row: Row) => Value,
): Map<number, Value[]> {
  const map = new Map<number, Value[]>();
  for (const row of rows) {
    const id = key(row);
    const list = map.get(id) ?? [];
    list.push(value(row));
    map.set(id, list);
  }
  return map;
}

export function attachPrinterRouting(
  printers: readonly PrinterBase[],
  printTypeRows: readonly PrintTypeRow[],
  categoryRouteRows: readonly CategoryRouteRow[],
): PrinterWithRouting[] {
  const printTypesByPrinter = groupBy(
    printTypeRows,
    (row) => row.printer_id,
    (row) => row.print_type,
  );
  const categoryIdsByPrinter = groupBy(
    categoryRouteRows,
    (row) => row.printer_id,
    (row) => row.category_id,
  );

  return printers.map((printer) => ({
    ...printer,
    print_types: printTypesByPrinter.get(printer.id) ?? [],
    category_ids: categoryIdsByPrinter.get(printer.id) ?? [],
  }));
}
