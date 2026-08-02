"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { Field, FieldError, FieldLabel } from "@comtammatu/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  QuantityInput,
  FormDialog,
  TextareaField,
} from "@/components/form";
import { messages } from "@lib/messages";
import {
  clampIssueEntryQuantity,
  formatIssueMaxEntryQuantity,
  getDefaultIssueUnit,
  getIssueBaseQuantity,
  getIssueMaxEntryQuantity,
  getIssueUnitOptions,
  type IssueUnitOption,
} from "../_lib/issue-units";
import { createStockIssueDraft, upsertStockIssueLine } from "../issue-actions";
import { formatQty } from "@lib/inventory/format";
import type { StockIngredient } from "@lib/inventory/stock-on-hand-model";

const stockCopy = messages.inventory.stock;

export type QuickIssueType = "consumption" | "writeoff" | "other";

const quickIssueTypeOptions: {
  value: QuickIssueType;
  label: string;
  reasonPlaceholder: string;
}[] = [
  {
    value: "consumption",
    label: stockCopy.quickIssue.options.consumption,
    reasonPlaceholder: stockCopy.quickIssue.placeholders.consumption,
  },
  {
    value: "writeoff",
    label: stockCopy.quickIssue.options.writeoff,
    reasonPlaceholder: stockCopy.quickIssue.placeholders.writeoff,
  },
  {
    value: "other",
    label: stockCopy.quickIssue.options.other,
    reasonPlaceholder: stockCopy.quickIssue.placeholders.other,
  },
];

function createQuickIssueSchema(
  maxBaseQuantity: number,
  issueUnitOptions: IssueUnitOption[],
) {
  return z
    .object({
      issueType: z.enum(["consumption", "writeoff", "other"]),
      quantity: z.string().refine((value) => Number(value) > 0, {
        error: stockCopy.quickIssue.quantityPositive,
      }),
      entryUnitId: z.string().optional(),
      reason: z
        .string()
        .trim()
        .min(1, { error: stockCopy.quickIssue.reasonRequired }),
    })
    .refine(
      (value) => {
        const issueUnit = issueUnitOptions.find(
          (option) => String(option.unitId) === value.entryUnitId,
        );
        return (
          getIssueBaseQuantity(Number(value.quantity), issueUnit) <=
          maxBaseQuantity + 1e-9
        );
      },
      {
        path: ["quantity"],
        error: stockCopy.quickIssue.quantityExceedsStock,
      },
    );
}

type QuickIssueFormValues = z.infer<ReturnType<typeof createQuickIssueSchema>>;

export interface QuickStockIssueDialogProps {
  branchId: number;
  open: boolean;
  target: {
    ingredient: StockIngredient;
    issueType: QuickIssueType;
  };
  issueBasePath?: string;
  onOpenChange: (open: boolean) => void;
}

export function QuickStockIssueDialog({
  branchId,
  open,
  target,
  issueBasePath = "/inventory/consumption",
  onOpenChange,
}: QuickStockIssueDialogProps) {
  const router = useRouter();
  const issueUnitOptions = useMemo(
    () => getIssueUnitOptions(target.ingredient),
    [target.ingredient],
  );
  const defaultIssueUnit = useMemo(
    () => getDefaultIssueUnit(target.ingredient),
    [target.ingredient],
  );
  const schema = useMemo(
    () => createQuickIssueSchema(target.ingredient.qty, issueUnitOptions),
    [issueUnitOptions, target.ingredient.qty],
  );
  const defaultValues = useMemo<QuickIssueFormValues>(
    () => ({
      issueType: target.issueType,
      quantity: "",
      entryUnitId: defaultIssueUnit ? String(defaultIssueUnit.unitId) : "",
      reason: "",
    }),
    [defaultIssueUnit, target.issueType],
  );
  const title =
    target.issueType === "writeoff"
      ? stockCopy.quickIssue.writeoffTitle
      : stockCopy.quickIssue.issueTitle;
  const activeIssueType = quickIssueTypeOptions.find(
    (option) => option.value === target.issueType,
  );

  async function handleSubmit(values: QuickIssueFormValues) {
    const selectedIssueUnit = issueUnitOptions.find(
      (option) => String(option.unitId) === values.entryUnitId,
    );
    const draftRes = await createStockIssueDraft({
      branchId,
      issueType: values.issueType,
      notes: stockCopy.quickIssue.draftNotes(target.ingredient.name),
    });
    if (!draftRes.success || !draftRes.data) {
      return {
        success: false,
        error: draftRes.error ?? stockCopy.quickIssue.createDraftFailed,
      };
    }

    const issueId = Number((draftRes.data as { id: number }).id);
    const lineRes = await upsertStockIssueLine({
      issueId,
      ingredientId: target.ingredient.id,
      quantity: Number(values.quantity),
      entryUnitId: selectedIssueUnit?.unitId ?? null,
      reason: values.reason.trim(),
    });
    if (!lineRes.success) {
      return {
        success: false,
        error: lineRes.error ?? stockCopy.quickIssue.addLineFailed,
      };
    }

    router.push(`${issueBasePath}/${issueId}`);
    return { success: true };
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      schema={schema}
      defaultValues={defaultValues}
      entityKey={`${target.ingredient.id}-${target.issueType}`}
      onSubmit={handleSubmit}
      successMessage={stockCopy.quickIssue.created(target.ingredient.name)}
      submitLabel={stockCopy.quickIssue.createSlip}
      cancelLabel={ACTIONS_VI.cancel}
      contentClassName="sm:max-w-md"
    >
      {(form) => {
        const quantityError = form.formState.errors.quantity;
        const entryUnitId = form.watch("entryUnitId");
        const selectedIssueUnit = issueUnitOptions.find(
          (option) => String(option.unitId) === entryUnitId,
        );
        const maxEntryQuantity = getIssueMaxEntryQuantity(
          target.ingredient.qty,
          selectedIssueUnit,
        );
        const maxQuantityValue = formatIssueMaxEntryQuantity(maxEntryQuantity);
        return (
          <>
            <input type="hidden" {...form.register("issueType")} />
            <Item variant="outline" size="sm">
              <ItemContent className="min-w-0 flex-1">
                <ItemTitle className="text-sm font-medium">
                  {target.ingredient.name}
                </ItemTitle>
                <ItemDescription className="text-xs text-muted-foreground">
                  {stockCopy.quickIssue.stockLine(
                    target.ingredient.sku,
                    target.ingredient.category,
                    formatQty(target.ingredient.qty),
                    target.ingredient.unit,
                  )}
                </ItemDescription>
              </ItemContent>
            </Item>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={!!quantityError}>
                <FieldLabel htmlFor="quick-issue-quantity">
                  {FORM_VI.quantity} *
                </FieldLabel>
                <InputGroup className="h-10">
                  <QuantityInput
                    id="quick-issue-quantity"
                    maxFractionDigits={3}
                    value={form.watch("quantity")}
                    onValueChange={(value) =>
                      form.setValue(
                        "quantity",
                        clampIssueEntryQuantity(value, maxEntryQuantity),
                        { shouldValidate: true },
                      )
                    }
                    placeholder="0"
                    className="h-full"
                  />
                  {maxQuantityValue ? (
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        type="button"
                        onClick={() =>
                          form.setValue("quantity", maxQuantityValue, {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: true,
                          })
                        }
                      >
                        {FORM_VI.max}
                      </InputGroupButton>
                    </InputGroupAddon>
                  ) : null}
                </InputGroup>
                {quantityError ? <FieldError errors={[quantityError]} /> : null}
              </Field>
              {issueUnitOptions.length > 0 ? (
                <Field>
                  <FieldLabel htmlFor="quick-issue-unit">
                    {FORM_VI.unit} *
                  </FieldLabel>
                  <Select
                    value={entryUnitId ?? ""}
                    onValueChange={(value) => {
                      form.setValue("entryUnitId", value, {
                        shouldValidate: true,
                      });
                      const nextIssueUnit = issueUnitOptions.find(
                        (option) => String(option.unitId) === value,
                      );
                      const nextMaxEntryQuantity = getIssueMaxEntryQuantity(
                        target.ingredient.qty,
                        nextIssueUnit,
                      );
                      form.setValue(
                        "quantity",
                        clampIssueEntryQuantity(
                          form.watch("quantity"),
                          nextMaxEntryQuantity,
                        ),
                        { shouldValidate: true },
                      );
                    }}
                  >
                    <SelectTrigger id="quick-issue-unit" className="h-10">
                      <SelectValue placeholder={FORM_VI.unit} />
                    </SelectTrigger>
                    <SelectContent>
                      {issueUnitOptions.map((option) => (
                        <SelectItem
                          key={option.unitId}
                          value={String(option.unitId)}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">{FORM_VI.unit}</span>
                  <Select disabled value="">
                    <SelectTrigger>
                      <SelectValue placeholder={FORM_VI.unit} />
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </div>
              )}
            </div>

            <TextareaField
              control={form.control}
              name="reason"
              label={FORM_VI.reason}
              rows={3}
              placeholder={activeIssueType?.reasonPlaceholder}
              required
            />
          </>
        );
      }}
    </FormDialog>
  );
}
