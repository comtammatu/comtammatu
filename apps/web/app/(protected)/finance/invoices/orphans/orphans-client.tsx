"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { AlertTriangle as IconAlert, FileText as IconFileText } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import type { ActionResult } from "@comtammatu/shared/types";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { AppSection } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { FormDialog, TextField } from "@/components/form";
import { messages } from "@lib/messages";
import { createTaxInvoice } from "../../actions";
import type { OrphanOrderRow } from "../../_lib/orphan-orders";

const copy = messages.finance.orphansPage;
const MST_REGEX = /^\d{10}(-\d{3})?$/;

const orphanBuyerSchema = z.object({
  buyerName: z.string().trim().max(200).optional(),
  buyerTaxCode: z
    .string()
    .trim()
    .regex(MST_REGEX, { error: copy.form.buyerTaxCode })
    .or(z.literal(""))
    .optional(),
  buyerAddress: z.string().trim().max(500).optional(),
  buyerEmail: z.email({ error: copy.form.buyerEmail }).or(z.literal("")).optional(),
});

type OrphanBuyerValues = z.infer<typeof orphanBuyerSchema>;

const EMPTY_BUYER: OrphanBuyerValues = {
  buyerName: "",
  buyerTaxCode: "",
  buyerAddress: "",
  buyerEmail: "",
};

interface Props {
  rows: OrphanOrderRow[];
}

export function OrphansClient({ rows }: Props) {
  const router = useRouter();
  const [target, setTarget] = useState<OrphanOrderRow | null>(null);

  async function onSubmit(values: OrphanBuyerValues): Promise<ActionResult> {
    if (!target) return { success: false, error: copy.issueFailed };
    const result = await createTaxInvoice({
      orderId: target.id,
      buyerName: values.buyerName || undefined,
      buyerTaxCode: values.buyerTaxCode || undefined,
      buyerAddress: values.buyerAddress || undefined,
      buyerEmail: values.buyerEmail || undefined,
    });
    if (result.success) {
      router.refresh();
    }
    return result;
  }

  const columns: DataTableColumn<OrphanOrderRow>[] = [
    {
      key: "order",
      header: copy.table.order,
      className: "font-mono tabular-nums",
      render: (row) => row.order_number,
    },
    {
      key: "day",
      header: copy.table.day,
      className: "w-28 font-mono tabular-nums text-muted-foreground",
      render: (row) => row.order_day,
    },
    {
      key: "amount",
      header: copy.table.amount,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatVND(row.total_amount),
    },
    {
      key: "action",
      header: "",
      className: "w-28",
      render: (row) => (
        <Button size="sm" onClick={() => setTarget(row)}>
          <IconFileText data-icon="inline-start" />
          {copy.issue}
        </Button>
      ),
    },
  ];

  return (
    <>
      <NoteCallout tone="warning" icon={<IconAlert />}>
        {copy.caution}
      </NoteCallout>

      <AppSection contentFlush contentScroll>
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(row) => row.id}
          emptyMode="no-data"
          emptyTitle={copy.empty.title}
          emptyDescription={copy.empty.description}
          mobileCardRender={(row) => (
            <Item variant="outline">
              <ItemHeader>
                <ItemContent>
                  <ItemTitle className="font-mono tabular-nums">
                    {row.order_number}
                  </ItemTitle>
                  <ItemDescription>{row.order_day}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button size="sm" onClick={() => setTarget(row)}>
                    <IconFileText data-icon="inline-start" />
                    {copy.issue}
                  </Button>
                </ItemActions>
              </ItemHeader>
              <ItemFooter>
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {formatVND(row.total_amount)}
                </span>
              </ItemFooter>
            </Item>
          )}
        />
      </AppSection>

      {target ? (
        <FormDialog
          open={target !== null}
          onOpenChange={(open) => {
            if (!open) setTarget(null);
          }}
          title={copy.form.title(target.order_number)}
          description={copy.form.description}
          schema={orphanBuyerSchema}
          defaultValues={EMPTY_BUYER}
          entityKey={target.id}
          onSubmit={onSubmit}
          successMessage={copy.issueSuccess}
          submitLabel={copy.form.submit}
        >
          {(form) => (
            <>
              <TextField
                control={form.control}
                name="buyerName"
                label={copy.form.buyerName}
                placeholder={copy.form.buyerNamePlaceholder}
                maxLength={200}
              />
              <TextField
                control={form.control}
                name="buyerTaxCode"
                label={copy.form.buyerTaxCode}
                placeholder={copy.form.buyerTaxCodePlaceholder}
                maxLength={14}
              />
              <TextField
                control={form.control}
                name="buyerAddress"
                label={copy.form.buyerAddress}
                maxLength={500}
              />
              <TextField
                control={form.control}
                name="buyerEmail"
                type="email"
                label={copy.form.buyerEmail}
                placeholder={copy.form.buyerEmailPlaceholder}
                maxLength={200}
              />
            </>
          )}
        </FormDialog>
      ) : null}
    </>
  );
}
