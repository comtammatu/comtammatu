"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useController, useFieldArray, useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ACTIONS_VI, FORM_VI, PROMOTIONS_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import {
  formatVNClockTime,
  formatVNTime,
  getVNDateString,
} from "@comtammatu/shared/time";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  BusinessDateField,
  FormattedNumberInput,
  FormField,
  NumberField,
  SelectField,
  TextField,
  WholeVndField,
} from "@/components/form";
import { useFormControlSize } from "@/components/form/control-size";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { ReasonConfirmDialog } from "@/components/reason-confirm-dialog";
import {
  ResponsiveActionButton,
  ResponsiveBackButton,
} from "@/components/responsive-action-button";
import { StatusBadge } from "@/components/status-badge";
import {
  AppEmptyState,
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import {
  PROMOTION_DOW_LABELS,
  PROMOTION_KINDS,
  PROMOTION_STATUSES,
  promotionKindLabel,
  promotionStatusLabel,
  type PromotionKind,
  type PromotionStatus,
} from "@lib/promotions/kinds";
import {
  issuePromotionCodes,
  upsertPromotion,
  voidPromotionCode,
} from "./actions";

export type PromotionFormBranch = { id: number; name: string };
export type PromotionFormMenuItem = { id: number; name: string };
export type PromotionFormCode = {
  id: number;
  code: string;
  kind: string;
  status: string;
  faceValue: number | null;
};

export type PromotionFormValue = {
  id?: number;
  name: string;
  kind: PromotionKind;
  status: PromotionStatus;
  discountType: "pct" | "vnd" | null;
  discountValue: number | null;
  minSubtotal: number;
  maxDiscountAmount: number | null;
  stackWithItemDiscount: boolean;
  startsAt: string | null;
  endsAt: string | null;
  timeWindows: Array<{ dow: number; start: string; end: string }>;
  serviceModes: Array<"dine_in" | "takeaway">;
  bxgyBuyQty: number | null;
  bxgyGetQty: number | null;
  branchIds: number[];
  itemIds: number[];
  reusableCode: string;
};

const timeWindowSchema = z.object({
  dow: z.number().int().min(0).max(6),
  start: z.string().regex(/^\d{2}:\d{2}/, { error: "Giờ không hợp lệ" }),
  end: z.string().regex(/^\d{2}:\d{2}/, { error: "Giờ không hợp lệ" }),
});

const promotionFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: "Tên chiến dịch không được để trống" })
      .max(80, { error: "Tên tối đa 80 ký tự" }),
    kind: z.enum(PROMOTION_KINDS),
    status: z.enum(PROMOTION_STATUSES),
    discountType: z.enum(["pct", "vnd"]),
    discountValue: z.string(),
    minSubtotal: z.string(),
    maxDiscountAmount: z.string(),
    stackWithItemDiscount: z.boolean(),
    startsDate: z.string(),
    endsDate: z.string(),
    startsTime: z.string(),
    endsTime: z.string(),
    timeWindows: z.array(timeWindowSchema),
    serviceModes: z
      .array(z.enum(["dine_in", "takeaway"]))
      .min(1, { error: "Chọn ít nhất một hình thức phục vụ" }),
    bxgyBuyQty: z.string(),
    bxgyGetQty: z.string(),
    branchIds: z.array(z.number().int().positive()),
    itemIds: z.array(z.number().int().positive()),
    reusableCode: z.string(),
  })
  .superRefine((values, ctx) => {
    if (
      (values.kind === "order_pct" || values.kind === "order_vnd") &&
      values.reusableCode.trim() === ""
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reusableCode"],
        message: PROMOTIONS_VI.codeRequired,
      });
    }
  });

type PromotionFormValues = z.infer<typeof promotionFormSchema>;

function defaultDiscountType(kind: PromotionKind): "pct" | "vnd" {
  return kind === "order_pct" ? "pct" : "vnd";
}

function isoToBusinessDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return getVNDateString(iso);
}

function isoToVnClock(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  const clock = formatVNTime(iso, "");
  return clock === "" ? fallback : clock;
}

function combineVnDateTime(
  date: string,
  time: string,
  emptyClock: string,
): string | null {
  const day = date.trim();
  if (!day) return null;
  const clock = formatVNClockTime(time, "");
  const hhmm = clock === "" ? emptyClock : clock;
  return `${day}T${hhmm}:00+07:00`;
}

function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function clockHHmm(value: string): string {
  return formatVNClockTime(value.slice(0, 5), "00:00");
}

function toFormValues(initial: PromotionFormValue): PromotionFormValues {
  return {
    name: initial.name,
    kind: initial.kind,
    status: initial.status,
    discountType: initial.discountType ?? defaultDiscountType(initial.kind),
    discountValue:
      initial.discountValue != null ? String(initial.discountValue) : "",
    minSubtotal: String(initial.minSubtotal),
    maxDiscountAmount:
      initial.maxDiscountAmount != null
        ? String(initial.maxDiscountAmount)
        : "",
    stackWithItemDiscount: initial.stackWithItemDiscount,
    startsDate: isoToBusinessDate(initial.startsAt),
    endsDate: isoToBusinessDate(initial.endsAt),
    startsTime: isoToVnClock(initial.startsAt, "00:00"),
    endsTime: isoToVnClock(initial.endsAt, "23:59"),
    timeWindows: initial.timeWindows,
    serviceModes: initial.serviceModes,
    bxgyBuyQty: initial.bxgyBuyQty != null ? String(initial.bxgyBuyQty) : "2",
    bxgyGetQty: initial.bxgyGetQty != null ? String(initial.bxgyGetQty) : "1",
    branchIds: initial.branchIds,
    itemIds: initial.itemIds,
    reusableCode: initial.reusableCode,
  };
}

export function PromotionForm({
  title,
  initial,
  branches,
  menuItems,
  codes = [],
}: {
  title: string;
  initial: PromotionFormValue;
  branches: PromotionFormBranch[];
  menuItems: PromotionFormMenuItem[];
  codes?: PromotionFormCode[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [itemQuery, setItemQuery] = useState("");
  const [issueCount, setIssueCount] = useState("10");
  const [issueFace, setIssueFace] = useState(
    initial.discountValue != null ? String(initial.discountValue) : "",
  );
  const [voidReason, setVoidReason] = useState("");
  const [voidTarget, setVoidTarget] = useState<PromotionFormCode | null>(null);

  const form = useForm<PromotionFormValues, unknown, PromotionFormValues>({
    resolver: zodResolver(promotionFormSchema),
    defaultValues: toFormValues(initial),
  });
  const { control, handleSubmit, watch } = form;
  const kind = watch("kind");
  const discountType = watch("discountType");
  const { fields: windowFields, append, remove } = useFieldArray({
    control,
    name: "timeWindows",
  });

  const needsAmount = kind !== "bxgy";
  const needsCode = kind === "order_pct" || kind === "order_vnd";
  const needsWindows = kind === "auto_order";
  const needsBxgy = kind === "bxgy";
  const needsIssue = kind === "voucher_face" && initial.id != null;
  const controlSize = useFormControlSize("responsive");

  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return menuItems.slice(0, 40);
    return menuItems
      .filter((item) => item.name.toLowerCase().includes(q))
      .slice(0, 40);
  }, [menuItems, itemQuery]);

  function onValid(values: PromotionFormValues) {
    startTransition(async () => {
      const parsedValue = parseAmount(values.discountValue);
      const result = await upsertPromotion({
        id: initial.id ?? null,
        name: values.name,
        kind: values.kind,
        status: values.status,
        discountType: needsAmount ? values.discountType : null,
        discountValue: needsAmount ? parsedValue : null,
        minSubtotal: parseAmount(values.minSubtotal) ?? 0,
        maxDiscountAmount: parseAmount(values.maxDiscountAmount),
        stackWithItemDiscount: values.stackWithItemDiscount,
        startsAt: combineVnDateTime(
          values.startsDate,
          values.startsTime,
          "00:00",
        ),
        endsAt: combineVnDateTime(values.endsDate, values.endsTime, "23:59"),
        timeWindows: values.timeWindows.map((window) => ({
          dow: window.dow,
          start: clockHHmm(window.start),
          end: clockHHmm(window.end),
        })),
        serviceModes: values.serviceModes,
        bxgyBuyQty: needsBxgy ? parseAmount(values.bxgyBuyQty) : null,
        bxgyGetQty: needsBxgy ? parseAmount(values.bxgyGetQty) : null,
        branchIds: values.branchIds,
        items: values.itemIds.map((menu_item_id) => ({
          menu_item_id,
          item_role: "eligible" as const,
        })),
        reusableCode: needsCode ? values.reusableCode : "",
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data == null) return;
      toast.success(PROMOTIONS_VI.saved);
      router.push(`/promotions/${String(result.data.id)}`);
      router.refresh();
    });
  }

  function handleIssue() {
    const promotionId = initial.id;
    if (promotionId == null) return;
    startTransition(async () => {
      const result = await issuePromotionCodes({
        promotionId,
        count: Number(issueCount),
        faceValue: issueFace.trim() === "" ? null : Number(issueFace),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data == null) return;
      toast.success(PROMOTIONS_VI.issued(result.data.count));
      router.refresh();
    });
  }

  function handleVoid() {
    if (voidTarget == null) return;
    startTransition(async () => {
      const result = await voidPromotionCode({
        codeId: voidTarget.id,
        reason: voidReason,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(PROMOTIONS_VI.voided);
      setVoidReason("");
      setVoidTarget(null);
      router.refresh();
    });
  }

  const codeColumns: DataTableColumn<PromotionFormCode>[] = [
    {
      key: "code",
      header: PROMOTIONS_VI.codeLabel,
      className: "font-mono",
      render: (row) => row.code,
    },
    {
      key: "status",
      header: PROMOTIONS_VI.statusLabel,
      render: (row) => (
        <StatusBadge domain="promotion-code" value={row.status} />
      ),
    },
    {
      key: "face",
      header: PROMOTIONS_VI.issueFaceLabel,
      className: "font-mono tabular-nums",
      render: (row) =>
        row.faceValue != null ? formatVND(row.faceValue) : "—",
    },
    {
      key: "actions",
      header: <span className="sr-only">{FORM_VI.action}</span>,
      className: "w-28 text-right",
      render: (row) =>
        row.status === "active" ? (
          <ResponsiveActionButton
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() => setVoidTarget(row)}
          >
            {PROMOTIONS_VI.voidAction}
          </ResponsiveActionButton>
        ) : null,
    },
  ];

  return (
    <DocumentFormFrame
      width="wide"
      header={
        <AppPageHeader
          title={title}
          actions={
            <ResponsiveBackButton href="/promotions">
              {ACTIONS_VI.back}
            </ResponsiveBackButton>
          }
        />
      }
      footer={
        <ResponsiveActionButton
          type="submit"
          form="promotion-form"
          disabled={isPending}
        >
          {PROMOTIONS_VI.save}
        </ResponsiveActionButton>
      }
    >
      <form
        id="promotion-form"
        onSubmit={handleSubmit(onValid)}
        className="flex min-w-0 flex-col gap-4"
      >
        <AppSection title={PROMOTIONS_VI.identitySection}>
          <div className="flex flex-col gap-3">
            <TextField
              control={control}
              name="name"
              label={PROMOTIONS_VI.nameLabel}
              required
            />
            <SelectField
              control={control}
              name="kind"
              label={PROMOTIONS_VI.kindLabel}
              options={PROMOTION_KINDS.map((value) => ({
                value,
                label: promotionKindLabel(value),
              }))}
            />
            <SelectField
              control={control}
              name="status"
              label={PROMOTIONS_VI.statusLabel}
              options={PROMOTION_STATUSES.map((value) => ({
                value,
                label: promotionStatusLabel(value),
              }))}
            />
            {needsCode ? (
              <TextField
                control={control}
                name="reusableCode"
                label={PROMOTIONS_VI.codeLabel}
                placeholder={PROMOTIONS_VI.codePlaceholder}
                className="font-mono uppercase"
                required
              />
            ) : null}
          </div>
        </AppSection>

        <AppSection title={PROMOTIONS_VI.amountSection}>
          <div className="flex flex-col gap-3">
            {needsAmount && kind !== "order_pct" ? (
              <SelectField
                control={control}
                name="discountType"
                label={PROMOTIONS_VI.valueLabel}
                options={[
                  { value: "pct", label: PROMOTIONS_VI.kindOrderPct },
                  { value: "vnd", label: PROMOTIONS_VI.kindOrderVnd },
                ]}
              />
            ) : null}
            {needsAmount ? (
              <NumberField
                control={control}
                name="discountValue"
                label={PROMOTIONS_VI.valueLabel}
                maxFractionDigits={discountType === "pct" ? 2 : 0}
              />
            ) : null}
            {needsBxgy ? (
              <>
                <NumberField
                  control={control}
                  name="bxgyBuyQty"
                  label={PROMOTIONS_VI.bxgyBuyLabel}
                  maxFractionDigits={0}
                />
                <NumberField
                  control={control}
                  name="bxgyGetQty"
                  label={PROMOTIONS_VI.bxgyGetLabel}
                  maxFractionDigits={0}
                />
              </>
            ) : null}
            <WholeVndField
              control={control}
              name="minSubtotal"
              label={PROMOTIONS_VI.minSubtotalLabel}
            />
            {needsAmount ? (
              <WholeVndField
                control={control}
                name="maxDiscountAmount"
                label={PROMOTIONS_VI.maxDiscountLabel}
              />
            ) : null}
            <StackCheckbox control={control} />
          </div>
        </AppSection>

        <AppSection title={PROMOTIONS_VI.scheduleSection}>
          <div className="grid gap-3 sm:grid-cols-2">
            <BusinessDateField
              control={control}
              name="startsDate"
              label={PROMOTIONS_VI.startsLabel}
            />
            <BusinessDateField
              control={control}
              name="endsDate"
              label={PROMOTIONS_VI.endsLabel}
            />
          </div>
          {needsWindows ? (
            <div className="mt-3 flex flex-col gap-2">
              <FieldLabel>{PROMOTIONS_VI.timeWindowsLabel}</FieldLabel>
              {windowFields.map((window, index) => (
                <PromotionTimeWindowRow
                  key={window.id}
                  control={control}
                  index={index}
                  onRemove={() => remove(index)}
                />
              ))}
              <ResponsiveActionButton
                type="button"
                variant="outline"
                onClick={() =>
                  append({ dow: 1, start: "14:00", end: "17:00" })
                }
              >
                {PROMOTIONS_VI.addWindow}
              </ResponsiveActionButton>
            </div>
          ) : null}
        </AppSection>

        <AppSection title={PROMOTIONS_VI.scopeSection}>
          <div className="flex flex-col gap-3">
            <ServiceModeFields control={control} />
            <IdCheckboxList
              control={control}
              name="branchIds"
              label={PROMOTIONS_VI.branchesLabel}
              description={PROMOTIONS_VI.branchesAll}
              options={branches}
            />
            <FormField
              controlId="promo-item-search"
              label={PROMOTIONS_VI.itemsLabel}
            >
              <Input
                id="promo-item-search"
                value={itemQuery}
                onChange={(event) => setItemQuery(event.target.value)}
                placeholder={ACTIONS_VI.search}
                controlSize={controlSize}
              />
            </FormField>
            <IdCheckboxList
              control={control}
              name="itemIds"
              label={PROMOTIONS_VI.itemsLabel}
              options={filteredItems}
              hideLabel
            />
          </div>
        </AppSection>
      </form>

      {needsIssue ? (
        <AppSection title={PROMOTIONS_VI.codesTitle}>
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                controlId="promo-issue-count"
                label={PROMOTIONS_VI.issueCountLabel}
              >
                <FormattedNumberInput
                  id="promo-issue-count"
                  value={issueCount}
                  onValueChange={setIssueCount}
                  maxFractionDigits={0}
                />
              </FormField>
              <FormField
                controlId="promo-issue-face"
                label={PROMOTIONS_VI.issueFaceLabel}
              >
                <FormattedNumberInput
                  id="promo-issue-face"
                  value={issueFace}
                  onValueChange={setIssueFace}
                  maxFractionDigits={0}
                />
              </FormField>
            </div>
            <ResponsiveActionButton
              type="button"
              onClick={handleIssue}
              disabled={isPending}
            >
              {PROMOTIONS_VI.issueAction}
            </ResponsiveActionButton>
            {codes.length === 0 ? (
              <AppEmptyState
                compact
                mode="no-data"
                title={PROMOTIONS_VI.codesEmpty}
              />
            ) : (
              <DataTable
                columns={codeColumns}
                data={codes}
                getRowKey={(row) => row.id}
                emptyTitle={PROMOTIONS_VI.codesEmpty}
                mobileCardRender={(row) => (
                  <PromotionCodeMobileCard
                    row={row}
                    disabled={isPending}
                    onVoid={() => setVoidTarget(row)}
                  />
                )}
              />
            )}
          </div>
        </AppSection>
      ) : null}

      <ReasonConfirmDialog
        open={voidTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setVoidTarget(null);
            setVoidReason("");
          }
        }}
        title={PROMOTIONS_VI.voidConfirmTitle}
        description={
          voidTarget
            ? `${voidTarget.code}. ${PROMOTIONS_VI.voidConfirmDescription}`
            : PROMOTIONS_VI.voidConfirmDescription
        }
        reasonId="promo-void-reason"
        reason={voidReason}
        onReasonChange={setVoidReason}
        reasonLabel={PROMOTIONS_VI.voidReasonLabel}
        reasonPlaceholder={PROMOTIONS_VI.voidReasonPlaceholder}
        reasonMinLength={3}
        cancelLabel={ACTIONS_VI.cancel}
        confirmLabel={PROMOTIONS_VI.voidAction}
        confirmVariant="destructive"
        isPending={isPending}
        onConfirm={handleVoid}
      />
    </DocumentFormFrame>
  );
}

function StackCheckbox({
  control,
}: {
  control: Control<PromotionFormValues>;
}) {
  const { field } = useController({
    control,
    name: "stackWithItemDiscount",
  });
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={field.value}
        onCheckedChange={(value) => field.onChange(value === true)}
      />
      {PROMOTIONS_VI.stackItemLabel}
    </label>
  );
}

function ServiceModeFields({
  control,
}: {
  control: Control<PromotionFormValues>;
}) {
  const { field, fieldState } = useController({
    control,
    name: "serviceModes",
  });
  function toggle(mode: "dine_in" | "takeaway") {
    field.onChange(
      field.value.includes(mode)
        ? field.value.filter((value) => value !== mode)
        : [...field.value, mode],
    );
  }
  return (
    <Field data-invalid={!!fieldState.error}>
      <FieldLabel>{PROMOTIONS_VI.serviceModesLabel}</FieldLabel>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={field.value.includes("dine_in")}
            onCheckedChange={() => toggle("dine_in")}
          />
          {PROMOTIONS_VI.dineIn}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={field.value.includes("takeaway")}
            onCheckedChange={() => toggle("takeaway")}
          />
          {PROMOTIONS_VI.takeaway}
        </label>
      </div>
      {fieldState.error ? <FieldError errors={[fieldState.error]} /> : null}
    </Field>
  );
}

function IdCheckboxList({
  control,
  name,
  label,
  description,
  options,
  hideLabel = false,
}: {
  control: Control<PromotionFormValues>;
  name: "branchIds" | "itemIds";
  label: string;
  description?: string;
  options: Array<{ id: number; name: string }>;
  hideLabel?: boolean;
}) {
  const { field } = useController({ control, name });
  function toggle(id: number) {
    field.onChange(
      field.value.includes(id)
        ? field.value.filter((value) => value !== id)
        : [...field.value, id],
    );
  }
  return (
    <Field>
      {hideLabel ? null : <FieldLabel>{label}</FieldLabel>}
      {description && !hideLabel ? (
        <FieldDescription>{description}</FieldDescription>
      ) : null}
      <div className="grid max-h-56 gap-2 overflow-auto sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={field.value.includes(option.id)}
              onCheckedChange={() => toggle(option.id)}
            />
            {option.name}
          </label>
        ))}
      </div>
    </Field>
  );
}

function PromotionTimeWindowRow({
  control,
  index,
  onRemove,
}: {
  control: Control<PromotionFormValues>;
  index: number;
  onRemove: () => void;
}) {
  const dow = useController({ control, name: `timeWindows.${index}.dow` });
  const start = useController({ control, name: `timeWindows.${index}.start` });
  const end = useController({ control, name: `timeWindows.${index}.end` });
  const controlSize = useFormControlSize("responsive");

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field className="w-24">
        <FieldLabel className="sr-only">{PROMOTIONS_VI.dowLabel}</FieldLabel>
        <Select
          value={String(dow.field.value)}
          onValueChange={(value) => dow.field.onChange(Number(value))}
        >
          <SelectTrigger
            size={controlSize}
            aria-label={PROMOTIONS_VI.dowLabel}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROMOTION_DOW_LABELS.map((label, dowValue) => (
              <SelectItem
                key={label}
                value={String(dowValue)}
                size={controlSize === "touch" ? "touch" : "default"}
              >
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`promo-window-start-${String(index)}`}>
          {PROMOTIONS_VI.windowStart}
        </FieldLabel>
        <Input
          id={`promo-window-start-${String(index)}`}
          type="time"
          controlSize={controlSize}
          value={start.field.value}
          onChange={(event) =>
            start.field.onChange(event.target.value.slice(0, 5))
          }
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`promo-window-end-${String(index)}`}>
          {PROMOTIONS_VI.windowEnd}
        </FieldLabel>
        <Input
          id={`promo-window-end-${String(index)}`}
          type="time"
          controlSize={controlSize}
          value={end.field.value}
          onChange={(event) =>
            end.field.onChange(event.target.value.slice(0, 5))
          }
        />
      </Field>
      <ResponsiveActionButton
        type="button"
        variant="outline"
        onClick={onRemove}
      >
        {ACTIONS_VI.remove}
      </ResponsiveActionButton>
    </div>
  );
}

function PromotionCodeMobileCard({
  row,
  disabled,
  onVoid,
}: {
  row: PromotionFormCode;
  disabled: boolean;
  onVoid: () => void;
}) {
  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle className="font-mono">{row.code}</ItemTitle>
        <ItemDescription>
          {row.faceValue != null ? formatVND(row.faceValue) : "—"}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <StatusBadge domain="promotion-code" value={row.status} size="sm" />
        {row.status === "active" ? (
          <ResponsiveActionButton
            type="button"
            variant="destructive"
            disabled={disabled}
            onClick={onVoid}
          >
            {PROMOTIONS_VI.voidAction}
          </ResponsiveActionButton>
        ) : null}
      </ItemActions>
    </Item>
  );
}
