"use client";

import { Controller } from "react-hook-form";
import { z } from "zod";
import {
  FormDialog,
  SelectField,
  TextField,
  TextareaField,
  WholeVndField,
  valuesToFormData,
} from "@/components/form";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import { createItem, updateItem } from "./actions";
import { MenuImageInput } from "./menu-image-input";
import { ItemChannelPricesFields } from "./item-channel-prices-fields";
import type { CategoryRow } from "./category-table";
import type { ItemRow } from "./item-table";

import { ACTIONS_VI, MENU_VI } from "@comtammatu/shared/messages";
const itemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: MENU_VI.itemNameRequired })
    .max(100, { error: MENU_VI.itemNameMax }),
  category_id: z.string().min(1, { error: MENU_VI.categoryRequired }),
  base_price: z
    .string()
    .trim()
    .min(1, { error: MENU_VI.priceRequired })
    .refine((v) => Number(v) >= 0, { error: MENU_VI.priceInvalid }),
  vat_rate: z.enum(["0", "5", "8", "10"]),
  description: z
    .string()
    .max(500, { error: MENU_VI.descriptionMax })
    .optional(),
  image_url: z.string().nullable().optional(),
});

type ItemFormValues = z.infer<typeof itemSchema>;

function toFormValues(item: ItemRow | null | undefined): ItemFormValues {
  return {
    name: item?.name ?? "",
    category_id: item?.category_id != null ? String(item.category_id) : "",
    base_price: item?.base_price != null ? String(item.base_price) : "",
    vat_rate:
      item?.vat_rate != null
        ? (String(item.vat_rate) as ItemFormValues["vat_rate"])
        : ("" as ItemFormValues["vat_rate"]),
    description: item?.description ?? "",
    image_url: item?.image_url ?? null,
  };
}

interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ItemRow | null;
  categories: CategoryRow[];
  tenantId: number;
}

export function ItemFormDialog({
  open,
  onOpenChange,
  item,
  categories,
  tenantId,
}: ItemFormDialogProps) {
  const isEdit = !!item;
  const activeCategories = categories.filter(
    (c) => c.is_active || c.id === item?.category_id,
  );

  const categoryOptions = activeCategories.map((cat) => ({
    value: cat.id.toString(),
    label: cat.name,
  }));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={itemSchema}
      defaultValues={toFormValues(item)}
      entityKey={item?.id ?? "new"}
      title={isEdit ? MENU_VI.editItemTitle : MENU_VI.addItemTitle}
      successMessage={isEdit ? MENU_VI.itemUpdated : MENU_VI.itemCreated}
      submitLabel={isEdit ? ACTIONS_VI.update : ACTIONS_VI.create}
      onSubmit={async (values) => {
        const fd = valuesToFormData(values);
        // valuesToFormData skips null/empty — set explicitly so server can clear it.
        fd.set("image_url", values.image_url ?? "");
        if (isEdit && item) {
          fd.set("id", String(item.id));
          return updateItem(null, fd);
        }
        return createItem(null, fd);
      }}
    >
      {(form) => (
        <>
          <TextField
            control={form.control}
            name="name"
            label={MENU_VI.itemNameLabel}
            placeholder={MENU_VI.itemNamePlaceholder}
            required
          />
          <SelectField
            control={form.control}
            name="category_id"
            label="Danh mục"
            options={categoryOptions}
            placeholder={MENU_VI.selectCategoryPlaceholder}
            required
          />
          <WholeVndField
            control={form.control}
            name="base_price"
            label={MENU_VI.basePriceLabel}
            placeholder="35.000"
            required
          />
          <SelectField
            control={form.control}
            name="vat_rate"
            label={MENU_VI.vatRateLabel}
            description={MENU_VI.vatRateDescription}
            placeholder={MENU_VI.selectVatRatePlaceholder}
            options={[
              { value: "0", label: "0%" },
              { value: "5", label: "5%" },
              { value: "8", label: "8%" },
              { value: "10", label: "10%" },
            ]}
            required
          />
          <TextareaField
            control={form.control}
            name="description"
            label={MENU_VI.descriptionLabel}
            rows={2}
            placeholder={MENU_VI.descriptionPlaceholder}
          />
          <Controller
            control={form.control}
            name="image_url"
            render={({ field }) => (
              <Field>
                <FieldLabel>{MENU_VI.itemImageLabel}</FieldLabel>
                <MenuImageInput
                  tenantId={tenantId}
                  value={field.value ?? null}
                  onChange={(url) => field.onChange(url)}
                />
              </Field>
            )}
          />
          {isEdit && item ? (
            <ItemChannelPricesFields
              menuItemId={item.id}
              basePrice={item.base_price}
              open={open}
            />
          ) : null}
        </>
      )}
    </FormDialog>
  );
}
