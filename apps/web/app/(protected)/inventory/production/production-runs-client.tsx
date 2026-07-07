/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus as IconPlus } from "lucide-react";
import { formatVNDate } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { AppSection, AppToolbar } from "@/components/surface";
import type { ProductionRunRow } from "../production-run-actions";

interface ProductionRunsClientProps {
  initial: ProductionRunRow[];
  branchId?: number;
  basePath: string;
  embedded?: boolean;
}

export function ProductionRunsClient({
  initial,
  branchId,
  basePath,
  embedded,
}: ProductionRunsClientProps) {
  const [items] = useState<ProductionRunRow[]>(initial);

  const columns = useMemo<DataTableColumn<ProductionRunRow>[]>(() => {
    return [
      {
        key: "production_number",
        header: "Mã Lệnh",
        render: (row) => (
          <Link
            href={`${basePath}/${row.id}`}
            className="font-medium hover:underline text-primary"
          >
            {row.production_number}
          </Link>
        ),
      },
      {
        key: "created_at",
        header: "Ngày tạo",
        render: (row) => formatVNDate(row.created_at),
      },
      {
        key: "branch",
        header: "Chi nhánh",
        render: (row) => row.branch_name,
      },
      {
        key: "finished_good",
        header: "Thành phẩm",
        render: (row) => row.finished_good_name,
      },
      {
        key: "planned_quantity",
        header: "SL Dự kiến",
        render: (row) => {
            const unit = row.entry_unit_name || "";
            return `${row.planned_quantity} ${unit}`;
        }
      },
      {
        key: "status",
        header: "Trạng thái",
        render: (row) => {
            return <StatusBadge domain="inventory" value={row.status} />;
        },
      },
    ];
  }, [basePath]);

  return (
    <AppSection>
      <AppToolbar>
        <div className="flex-1" />
        <Button asChild>
          <Link href={`${basePath}/new${branchId ? `?branchId=${branchId}` : ""}`}>
            <IconPlus className="h-4 w-4 mr-2" />
            Tạo Lệnh
          </Link>
        </Button>
      </AppToolbar>

      <DataTable
        data={items}
        columns={columns}
        getRowKey={(row) => row.id.toString()}
        mobileCardRender={(row) => (
          <div className="flex flex-col gap-1 text-sm">
            <span>{row.production_number}</span>
            <span className="font-semibold">{row.finished_good_name}</span>
          </div>
        )}
      />
    </AppSection>
  );
}
