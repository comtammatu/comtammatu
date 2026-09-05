"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useController, useFieldArray, useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Download as IconDownload,
  Pause as IconPause,
  Play as IconPlay,
  Search as IconSearch,
  Sparkles as IconSparkles,
  Trash2 as IconTrash2,
  X as IconX,
} from "lucide-react";
import { z } from "zod";
import { ACTIONS_VI, FORM_VI, PROMOTIONS_VI } from "@comtammatu/shared/messages";
import { formatPercent, formatVND } from "@comtammatu/shared/format";
import {
  formatVNClockTime,
  formatVNTime,
  getVNDateString,
} from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
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
import { confirm } from "@/components/confirm-dialog";
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
import { buildSemicolonCsv, downloadSemicolonCsv } from "@/_lib/export-csv";
import {
  PROMOTION_DOW_LABELS,
  PROMOTION_KINDS,
  PROMOTION_STATUSES,
  promotionCodeStatusLabel,
  promotionKindLabel,
  promotionStatusLabel,
  type PromotionKind,
  type PromotionStatus,
} from "@lib/promotions/kinds";
import {
  deletePromotion,
  issuePromotionCodes,
  setPromotionStatus,
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

export type PromotionFormItemRole = "eligible" | "buy" | "get";

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
  serviceModes: Array<"dine_in" | "takeaway" | "delivery">;
  bxgyBuyQty: number | null;
  bxgyGetQty: number | null;
  freeSideQty: number | null;
  freeItemQty: number | null;
  allowCode: boolean;
  allowAuto: boolean;
  branchIds: number[];
  itemIds: number[];
  buyItemIds: number[];
  getItemIds: number[];
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
      .array(z.enum(["dine_in", "takeaway", "delivery"]))
      .min(1, { error: "Chọn ít nhất một hình thức phục vụ" }),
    bxgyBuyQty: z.string(),
    bxgyGetQty: z.string(),
    freeSideQty: z.string(),
    freeItemQty: z.string(),
    allowCode: z.boolean(),
    allowAuto: z.boolean(),
    branchIds: z.array(z.number().int().positive()),
    itemIds: z.array(z.number().int().positive()),
    buyItemIds: z.array(z.number().int().positive()),
    getItemIds: z.array(z.number().int().positive()),
    reusableCode: z.string(),
  })
  .superRefine((values, ctx) => {
    const needsReusable =
      values.kind === "order_pct" ||
      values.kind === "order_vnd" ||
      (values.kind === "free_side" && values.allowCode) ||
      values.kind === "free_item";
    if (needsReusable && values.reusableCode.trim() === "") {
      ctx.addIssue({
        code: "custom",
        path: ["reusableCode"],
        message: PROMOTIONS_VI.codeRequired,
      });
    }
    if (values.kind === "free_side") {
      if (!values.allowCode && !values.allowAuto) {
        ctx.addIssue({
          code: "custom",
          path: ["allowCode"],
          message: "Chọn ít nhất một cách kích hoạt",
        });
      }
      if ((parseAmount(values.freeSideQty) ?? 0) < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["freeSideQty"],
          message: "Số phần tặng phải từ 1",
        });
      }
      if (values.buyItemIds.length < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["buyItemIds"],
          message: "Chọn món chính điều kiện",
        });
      }
      if (values.getItemIds.length < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["getItemIds"],
          message: "Chọn ăn kèm được tặng",
        });
      }
    }
    if (values.kind === "free_item") {
      const freeItemQty = parseAmount(values.freeItemQty);
      if (freeItemQty != null && freeItemQty < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["freeItemQty"],
          message: "Số phần tối đa phải từ 1, hoặc để trống nếu không giới hạn",
        });
      }
      if (values.getItemIds.length < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["getItemIds"],
          message: "Chọn món được tặng",
        });
      }
    }
    if (values.kind === "bxgy") {
      if (values.buyItemIds.length < 1 && values.itemIds.length < 1) {
        // empty buy+get+eligible allowed historically; keep soft
      }
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
    freeSideQty:
      initial.freeSideQty != null ? String(initial.freeSideQty) : "1",
    freeItemQty:
      initial.freeItemQty != null ? String(initial.freeItemQty) : "",
    allowCode: initial.allowCode,
    allowAuto: initial.allowAuto,
    branchIds: initial.branchIds,
    itemIds: initial.itemIds,
    buyItemIds: initial.buyItemIds,
    getItemIds: initial.getItemIds,
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
  const [buyQuery, setBuyQuery] = useState("");
  const [getQuery, setGetQuery] = useState("");
  const [issueCount, setIssueCount] = useState("10");
  const [issueFace, setIssueFace] = useState(
    initial.discountValue != null ? String(initial.discountValue) : "",
  );
  const [voidReason, setVoidReason] = useState("");
  const [voidTarget, setVoidTarget] = useState<PromotionFormCode | null>(null);
  const [codeSearch, setCodeSearch] = useState("");
  const [codeStatusFilter, setCodeStatusFilter] = useState<string>("all");

  const form = useForm<PromotionFormValues, unknown, PromotionFormValues>({
    resolver: zodResolver(promotionFormSchema),
    defaultValues: toFormValues(initial),
  });
  const { control, handleSubmit, watch, setValue } = form;
  const kind = watch("kind");
  const discountType = watch("discountType");
  const allowCode = watch("allowCode");
  const { fields: windowFields, append, remove } = useFieldArray({
    control,
    name: "timeWindows",
  });
  const kindRef = useRef(kind);

  async function handleHeaderDelete() {
    if (initial.id == null) return;
    const ok = await confirm({
      title: PROMOTIONS_VI.deleteConfirmTitle,
      description: PROMOTIONS_VI.deleteConfirmDesc,
      variant: "destructive",
      confirmText: PROMOTIONS_VI.deleteAction,
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await deletePromotion({ id: initial.id! });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data?.action === "ended") {
        toast.success(PROMOTIONS_VI.archiveSuccess);
      } else {
        toast.success(PROMOTIONS_VI.deleteSuccess);
      }
      router.push("/promotions");
      router.refresh();
    });
  }

  function handleQuickToggleStatus() {
    if (initial.id == null) return;
    const currentStatus = watch("status");
    const nextStatus = currentStatus === "active" ? "paused" : "active";
    setValue("status", nextStatus, { shouldDirty: true });
    startTransition(async () => {
      const result = await setPromotionStatus({
        id: initial.id!,
        status: nextStatus,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(PROMOTIONS_VI.saved);
      router.refresh();
    });
  }

  function applyPreset(
    type: "happy_hour" | "order_vnd" | "bxgy" | "free_side",
  ) {
    if (type === "happy_hour") {
      setValue("name", "Happy Hour 14h - 17h", { shouldDirty: true });
      setValue("kind", "auto_order", { shouldDirty: true });
      setValue("discountType", "pct", { shouldDirty: true });
      setValue("discountValue", "15", { shouldDirty: true });
      setValue("maxDiscountAmount", "50000", { shouldDirty: true });
      setValue("minSubtotal", "0", { shouldDirty: true });
      setValue("allowAuto", true, { shouldDirty: true });
      setValue("allowCode", false, { shouldDirty: true });
      setValue("reusableCode", "", { shouldDirty: true });
      setValue(
        "timeWindows",
        [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "14:00", end: "17:00" })),
        { shouldDirty: true },
      );
    } else if (type === "order_vnd") {
      setValue("name", "Giảm 20.000đ đơn từ 100.000đ", { shouldDirty: true });
      setValue("kind", "order_vnd", { shouldDirty: true });
      setValue("discountType", "vnd", { shouldDirty: true });
      setValue("discountValue", "20000", { shouldDirty: true });
      setValue("minSubtotal", "100000", { shouldDirty: true });
      setValue("reusableCode", "GIAM20K", { shouldDirty: true });
      setValue("allowCode", true, { shouldDirty: true });
    } else if (type === "bxgy") {
      setValue("name", "Mua 2 Tặng 1 Cùng Loại", { shouldDirty: true });
      setValue("kind", "bxgy", { shouldDirty: true });
      setValue("bxgyBuyQty", "2", { shouldDirty: true });
      setValue("bxgyGetQty", "1", { shouldDirty: true });
      setValue("reusableCode", "MUA2TANG1", { shouldDirty: true });
      setValue("allowCode", true, { shouldDirty: true });
    } else if (type === "free_side") {
      setValue("name", "Tặng Món Ăn Kèm Canh / Trứng", { shouldDirty: true });
      setValue("kind", "free_side", { shouldDirty: true });
      setValue("freeSideQty", "1", { shouldDirty: true });
      setValue("allowAuto", true, { shouldDirty: true });
      setValue("allowCode", true, { shouldDirty: true });
      setValue("reusableCode", "TANGAN", { shouldDirty: true });
    }
  }

  useEffect(() => {
    if (kindRef.current === kind) return;
    kindRef.current = kind;
    setValue("discountType", defaultDiscountType(kind));
    if (kind === "free_side") {
      setValue("allowCode", true);
      setValue("allowAuto", true);
      setValue("freeSideQty", "1");
    }
    if (kind === "free_item") {
      setValue("allowCode", true);
      setValue("allowAuto", false);
      setValue("freeItemQty", "");
    }
  }, [kind, setValue]);

  const needsAmount =
    kind === "order_pct" ||
    kind === "order_vnd" ||
    kind === "voucher_face" ||
    kind === "auto_order";
  const needsCode =
    kind === "order_pct" ||
    kind === "order_vnd" ||
    (kind === "free_side" && allowCode) ||
    kind === "free_item";
  const needsWindows = kind === "auto_order";
  const needsBxgy = kind === "bxgy";
  const needsFreeSide = kind === "free_side";
  const needsFreeItem = kind === "free_item";
  const needsSplitItems = kind === "bxgy" || kind === "free_side";
  const needsEligibleItems = !needsSplitItems && !needsFreeItem;
  const needsIssue = kind === "voucher_face" && initial.id != null;
  const controlSize = useFormControlSize("responsive");

  function filterMenu(query: string) {
    const q = query.trim().toLowerCase();
    const list = !q
      ? menuItems
      : menuItems.filter((item) => item.name.toLowerCase().includes(q));
    return list.slice(0, 60);
  }

  const filteredItems = useMemo(
    () => filterMenu(itemQuery),
    [menuItems, itemQuery],
  );
  const filteredBuy = useMemo(
    () => filterMenu(buyQuery),
    [menuItems, buyQuery],
  );
  const filteredGet = useMemo(
    () => filterMenu(getQuery),
    [menuItems, getQuery],
  );

  const filteredCodes = useMemo(() => {
    let list = codes;
    if (codeStatusFilter !== "all") {
      list = list.filter((c) => c.status === codeStatusFilter);
    }
    if (codeSearch.trim()) {
      const q = codeSearch.trim().toLowerCase();
      list = list.filter((c) => c.code.toLowerCase().includes(q));
    }
    return list;
  }, [codes, codeStatusFilter, codeSearch]);

  function buildItems(values: PromotionFormValues) {
    if (values.kind === "free_side" || values.kind === "bxgy") {
      return [
        ...values.buyItemIds.map((menu_item_id) => ({
          menu_item_id,
          item_role: "buy" as const,
        })),
        ...values.getItemIds.map((menu_item_id) => ({
          menu_item_id,
          item_role: "get" as const,
        })),
        ...(values.kind === "bxgy"
          ? values.itemIds.map((menu_item_id) => ({
              menu_item_id,
              item_role: "eligible" as const,
            }))
          : []),
      ];
    }
    if (values.kind === "free_item") {
      return values.getItemIds.map((menu_item_id) => ({
        menu_item_id,
        item_role: "get" as const,
      }));
    }
    return values.itemIds.map((menu_item_id) => ({
      menu_item_id,
      item_role: "eligible" as const,
    }));
  }

  function onValid(values: PromotionFormValues) {
    startTransition(async () => {
      const parsedValue = parseAmount(values.discountValue);
      const result = await upsertPromotion({
        id: initial.id ?? null,
        name: values.name,
        kind: values.kind,
        status: values.status,
        discountType: needsAmount
          ? values.kind === "order_pct"
            ? "pct"
            : values.discountType
          : null,
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
        freeSideQty: needsFreeSide ? parseAmount(values.freeSideQty) : null,
        freeItemQty: needsFreeItem ? parseAmount(values.freeItemQty) : null,
        allowCode: needsFreeSide ? values.allowCode : true,
        allowAuto: needsFreeSide ? values.allowAuto : false,
        branchIds: values.branchIds,
        items: buildItems(values),
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

  function handleExportCsv() {
    if (codes.length === 0) return;
    const sanitizedName = (initial.name ?? "voucher")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const filename = `voucher-${sanitizedName}-${getVNDateString()}`;
    const csv = buildSemicolonCsv({
      signatureLines: [`Chiến dịch: ${initial.name ?? ""}`],
      header: ["STT", "Mã voucher", "Loại", "Mệnh giá", "Trạng thái"],
      rows: codes.map((c, idx) => [
        idx + 1,
        c.code,
        c.kind,
        c.faceValue ?? 0,
        promotionCodeStatusLabel(c.status),
      ]),
    });
    downloadSemicolonCsv(filename, csv);
    toast.success(PROMOTIONS_VI.exportSuccess);
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
            <div className="flex items-center gap-2">
              <ResponsiveBackButton href="/promotions">
                {ACTIONS_VI.back}
              </ResponsiveBackButton>
              {initial.id != null ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size={controlSize === "touch" ? "touch" : "default"}
                    disabled={isPending}
                    onClick={handleQuickToggleStatus}
                  >
                    {watch("status") === "active" ? (
                      <>
                        <IconPause
                          data-icon="inline-start"
                          className="size-4"
                        />
                        {PROMOTIONS_VI.pause}
                      </>
                    ) : (
                      <>
                        <IconPlay data-icon="inline-start" className="size-4" />
                        {PROMOTIONS_VI.activate}
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size={controlSize === "touch" ? "touch" : "default"}
                    disabled={isPending}
                    onClick={handleHeaderDelete}
                  >
                    <IconTrash2 data-icon="inline-start" className="size-4" />
                    {PROMOTIONS_VI.deleteAction}
                  </Button>
                </>
              ) : null}
            </div>
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
      <div className="flex flex-col gap-4">
        {initial.id == null ? (
          <Frame className="flex flex-col gap-3 bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <IconSparkles className="size-4 text-primary" />
              <span>{PROMOTIONS_VI.presetsTitle}</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <InteractiveCard
                padding="compact"
                role="button"
                tabIndex={0}
                onClick={() => applyPreset("happy_hour")}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") &&
                  applyPreset("happy_hour")
                }
                className="flex cursor-pointer flex-col gap-1 text-left hover:border-primary"
              >
                <span className="text-xs font-semibold text-foreground">
                  {PROMOTIONS_VI.presetHappyHourTitle}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {PROMOTIONS_VI.presetHappyHourDesc}
                </span>
              </InteractiveCard>

              <InteractiveCard
                padding="compact"
                role="button"
                tabIndex={0}
                onClick={() => applyPreset("order_vnd")}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") &&
                  applyPreset("order_vnd")
                }
                className="flex cursor-pointer flex-col gap-1 text-left hover:border-primary"
              >
                <span className="text-xs font-semibold text-foreground">
                  {PROMOTIONS_VI.presetOrderVndTitle}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {PROMOTIONS_VI.presetOrderVndDesc}
                </span>
              </InteractiveCard>

              <InteractiveCard
                padding="compact"
                role="button"
                tabIndex={0}
                onClick={() => applyPreset("bxgy")}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && applyPreset("bxgy")
                }
                className="flex cursor-pointer flex-col gap-1 text-left hover:border-primary"
              >
                <span className="text-xs font-semibold text-foreground">
                  {PROMOTIONS_VI.presetBxgyTitle}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {PROMOTIONS_VI.presetBxgyDesc}
                </span>
              </InteractiveCard>

              <InteractiveCard
                padding="compact"
                role="button"
                tabIndex={0}
                onClick={() => applyPreset("free_side")}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") &&
                  applyPreset("free_side")
                }
                className="flex cursor-pointer flex-col gap-1 text-left hover:border-primary"
              >
                <span className="text-xs font-semibold text-foreground">
                  {PROMOTIONS_VI.presetFreeSideTitle}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {PROMOTIONS_VI.presetFreeSideDesc}
                </span>
              </InteractiveCard>
            </div>
          </Frame>
        ) : null}

        <PromotionLiveMockup
          name={watch("name")}
          kind={kind}
          status={watch("status")}
          discountType={discountType}
          discountValue={watch("discountValue")}
          maxDiscountAmount={watch("maxDiscountAmount")}
          minSubtotal={watch("minSubtotal")}
          reusableCode={watch("reusableCode")}
          bxgyBuyQty={watch("bxgyBuyQty")}
          bxgyGetQty={watch("bxgyGetQty")}
          freeSideQty={watch("freeSideQty")}
          freeItemQty={watch("freeItemQty")}
        />

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
          </div>
        </AppSection>

        <AppSection title={PROMOTIONS_VI.kindConfigSection}>
          <div className="flex flex-col gap-4">
            {kind === "order_pct" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  control={control}
                  name="discountValue"
                  label={PROMOTIONS_VI.pctValueLabel}
                  placeholder="10"
                  maxFractionDigits={2}
                  required
                />
                <WholeVndField
                  control={control}
                  name="maxDiscountAmount"
                  label={PROMOTIONS_VI.maxDiscountLabel}
                  placeholder={PROMOTIONS_VI.maxDiscountPlaceholder}
                  description={PROMOTIONS_VI.maxDiscountHint}
                />
              </div>
            ) : null}

            {kind === "order_vnd" ? (
              <WholeVndField
                control={control}
                name="discountValue"
                label={PROMOTIONS_VI.vndValueLabel}
                placeholder="20.000"
                required
              />
            ) : null}

            {kind === "voucher_face" ? (
              <WholeVndField
                control={control}
                name="discountValue"
                label={PROMOTIONS_VI.voucherFaceValueLabel}
                placeholder="50.000"
                required
              />
            ) : null}

            {kind === "auto_order" ? (
              <div className="flex flex-col gap-3">
                <SelectField
                  control={control}
                  name="discountType"
                  label={PROMOTIONS_VI.discountTypeLabel}
                  options={[
                    { value: "pct", label: PROMOTIONS_VI.kindOrderPct },
                    { value: "vnd", label: PROMOTIONS_VI.kindOrderVnd },
                  ]}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField
                    control={control}
                    name="discountValue"
                    label={
                      discountType === "pct"
                        ? PROMOTIONS_VI.pctValueLabel
                        : PROMOTIONS_VI.vndValueLabel
                    }
                    placeholder={discountType === "pct" ? "10" : "20.000"}
                    maxFractionDigits={discountType === "pct" ? 2 : 0}
                    required
                  />
                  {discountType === "pct" ? (
                    <WholeVndField
                      control={control}
                      name="maxDiscountAmount"
                      label={PROMOTIONS_VI.maxDiscountLabel}
                      placeholder={PROMOTIONS_VI.maxDiscountPlaceholder}
                      description={PROMOTIONS_VI.maxDiscountHint}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            {needsBxgy ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  control={control}
                  name="bxgyBuyQty"
                  label={PROMOTIONS_VI.bxgyBuyLabel}
                  placeholder="2"
                  maxFractionDigits={0}
                  required
                />
                <NumberField
                  control={control}
                  name="bxgyGetQty"
                  label={PROMOTIONS_VI.bxgyGetLabel}
                  placeholder="1"
                  maxFractionDigits={0}
                  required
                />
              </div>
            ) : null}

            {needsFreeSide ? (
              <div className="flex flex-col gap-3">
                <NumberField
                  control={control}
                  name="freeSideQty"
                  label={PROMOTIONS_VI.freeSideQtyLabel}
                  placeholder="1"
                  maxFractionDigits={0}
                  required
                />
                <ActivationFields control={control} />
              </div>
            ) : null}

            {needsFreeItem ? (
              <NumberField
                control={control}
                name="freeItemQty"
                label={PROMOTIONS_VI.freeItemQtyLabel}
                description={PROMOTIONS_VI.freeItemQtyHint}
                maxFractionDigits={0}
              />
            ) : null}

            {needsCode ? (
              <TextField
                control={control}
                name="reusableCode"
                label={PROMOTIONS_VI.codeLabel}
                placeholder={PROMOTIONS_VI.codePlaceholder}
                description={PROMOTIONS_VI.codeHint}
                className="font-mono uppercase"
                required
              />
            ) : null}

            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <WholeVndField
                control={control}
                name="minSubtotal"
                label={PROMOTIONS_VI.minSubtotalLabel}
                placeholder="0"
                description={PROMOTIONS_VI.minSubtotalHint}
              />
              <StackCheckbox control={control} />
            </div>

            {needsEligibleItems ? (
              <div className="border-t border-border pt-3">
                <MenuItemPicker
                  control={control}
                  name="itemIds"
                  label={PROMOTIONS_VI.itemsLabel}
                  description={PROMOTIONS_VI.itemsAllMenuHint}
                  query={itemQuery}
                  onQueryChange={setItemQuery}
                  options={filteredItems}
                  allItems={menuItems}
                />
              </div>
            ) : null}

            {needsSplitItems ? (
              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <MenuItemPicker
                  control={control}
                  name="buyItemIds"
                  label={
                    needsFreeSide
                      ? PROMOTIONS_VI.freeSideBuyLabel
                      : PROMOTIONS_VI.bxgyBuyItemsLabel
                  }
                  query={buyQuery}
                  onQueryChange={setBuyQuery}
                  options={filteredBuy}
                  allItems={menuItems}
                />
                <MenuItemPicker
                  control={control}
                  name="getItemIds"
                  label={
                    needsFreeSide
                      ? PROMOTIONS_VI.freeSideGetLabel
                      : PROMOTIONS_VI.bxgyGetItemsLabel
                  }
                  query={getQuery}
                  onQueryChange={setGetQuery}
                  options={filteredGet}
                  allItems={menuItems}
                />
              </div>
            ) : null}

            {needsFreeItem ? (
              <div className="border-t border-border pt-3">
                <MenuItemPicker
                  control={control}
                  name="getItemIds"
                  label={PROMOTIONS_VI.freeItemGetLabel}
                  query={getQuery}
                  onQueryChange={setGetQuery}
                  options={filteredGet}
                  allItems={menuItems}
                />
              </div>
            ) : null}

            <PromotionRuleSummary
              kind={kind}
              discountType={discountType}
              discountValue={watch("discountValue")}
              maxDiscountAmount={watch("maxDiscountAmount")}
              minSubtotal={watch("minSubtotal")}
              reusableCode={watch("reusableCode")}
              itemIds={watch("itemIds")}
              bxgyBuyQty={watch("bxgyBuyQty")}
              bxgyGetQty={watch("bxgyGetQty")}
              freeSideQty={watch("freeSideQty")}
              freeItemQty={watch("freeItemQty")}
              allowCode={watch("allowCode")}
              allowAuto={watch("allowAuto")}
            />
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
            <FormField
              controlId="promo-starts-time"
              label={PROMOTIONS_VI.startsTimeLabel}
            >
              <Input
                id="promo-starts-time"
                type="time"
                controlSize={controlSize}
                value={watch("startsTime")}
                onChange={(event) =>
                  setValue("startsTime", event.target.value.slice(0, 5))
                }
              />
            </FormField>
            <FormField
              controlId="promo-ends-time"
              label={PROMOTIONS_VI.endsTimeLabel}
            >
              <Input
                id="promo-ends-time"
                type="time"
                controlSize={controlSize}
                value={watch("endsTime")}
                onChange={(event) =>
                  setValue("endsTime", event.target.value.slice(0, 5))
                }
              />
            </FormField>
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
          </div>
        </AppSection>
      </form>

      {needsIssue || codes.length > 0 ? (
        <AppSection title={PROMOTIONS_VI.codesTitle}>
          <div className="flex flex-col gap-3">
            {needsIssue ? (
              <>
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
                <div className="flex flex-wrap gap-2">
                  <ResponsiveActionButton
                    type="button"
                    onClick={handleIssue}
                    disabled={isPending}
                  >
                    {PROMOTIONS_VI.issueAction}
                  </ResponsiveActionButton>
                </div>
              </>
            ) : null}

            {codes.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-y py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <InputGroup
                    size={controlSize === "touch" ? "touch" : "default"}
                    className="w-full sm:w-60"
                  >
                    <InputGroupAddon>
                      <IconSearch className="size-4" />
                    </InputGroupAddon>
                    <InputGroupInput
                      type="search"
                      placeholder={PROMOTIONS_VI.searchCodesPlaceholder}
                      value={codeSearch}
                      onChange={(e) => setCodeSearch(e.target.value)}
                    />
                  </InputGroup>
                  <Tabs
                    value={codeStatusFilter}
                    onValueChange={setCodeStatusFilter}
                  >
                    <TabsList
                      size={controlSize === "touch" ? "touch" : "default"}
                      className="flex-wrap"
                    >
                      <TabsTrigger value="all">
                        {PROMOTIONS_VI.filterCodeStatusAll}
                      </TabsTrigger>
                      <TabsTrigger value="active">
                        {PROMOTIONS_VI.filterCodeStatusActive}
                      </TabsTrigger>
                      <TabsTrigger value="redeemed">
                        {PROMOTIONS_VI.filterCodeStatusRedeemed}
                      </TabsTrigger>
                      <TabsTrigger value="void">
                        {PROMOTIONS_VI.filterCodeStatusVoid}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <ResponsiveActionButton
                  type="button"
                  variant="outline"
                  onClick={handleExportCsv}
                  disabled={isPending}
                >
                  <IconDownload data-icon="inline-start" />
                  {PROMOTIONS_VI.exportCsvAction}
                </ResponsiveActionButton>
              </div>
            ) : null}

            {codes.length === 0 ? (
              <AppEmptyState
                compact
                mode="no-data"
                title={PROMOTIONS_VI.codesEmpty}
              />
            ) : (
              <DataTable
                columns={codeColumns}
                data={filteredCodes}
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
      </div>
    </DocumentFormFrame>
  );
}

function ActivationFields({
  control,
}: {
  control: Control<PromotionFormValues>;
}) {
  const allowCode = useController({ control, name: "allowCode" });
  const allowAuto = useController({ control, name: "allowAuto" });
  return (
    <Field>
      <FieldLabel>{PROMOTIONS_VI.activationLabel}</FieldLabel>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={allowCode.field.value}
            onCheckedChange={(value) =>
              allowCode.field.onChange(value === true)
            }
          />
          {PROMOTIONS_VI.activationCode}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={allowAuto.field.value}
            onCheckedChange={(value) =>
              allowAuto.field.onChange(value === true)
            }
          />
          {PROMOTIONS_VI.activationAuto}
        </label>
      </div>
    </Field>
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
  function toggle(mode: "dine_in" | "takeaway" | "delivery") {
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
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={field.value.includes("delivery")}
            onCheckedChange={() => toggle("delivery")}
          />
          {PROMOTIONS_VI.delivery}
        </label>
      </div>
      {fieldState.error ? <FieldError errors={[fieldState.error]} /> : null}
    </Field>
  );
}

function MenuItemPicker({
  control,
  name,
  label,
  description,
  query,
  onQueryChange,
  options,
  allItems,
}: {
  control: Control<PromotionFormValues>;
  name: "itemIds" | "buyItemIds" | "getItemIds";
  label: string;
  description?: string;
  query: string;
  onQueryChange: (value: string) => void;
  options: PromotionFormMenuItem[];
  allItems: PromotionFormMenuItem[];
}) {
  const { field, fieldState } = useController({ control, name });
  const controlSize = useFormControlSize("responsive");
  const selected = allItems.filter((item) => field.value.includes(item.id));

  function toggle(id: number) {
    field.onChange(
      field.value.includes(id)
        ? field.value.filter((value) => value !== id)
        : [...field.value, id],
    );
  }

  return (
    <Field data-invalid={!!fieldState.error}>
      <FieldLabel>{label}</FieldLabel>
      {description ? (
        <FieldDescription>{description}</FieldDescription>
      ) : null}
      {selected.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <Badge
              key={item.id}
              variant="secondary"
              className="cursor-pointer gap-1"
              onClick={() => toggle(item.id)}
            >
              <span>{item.name}</span>
              <IconX className="size-3" aria-hidden />
            </Badge>
          ))}
        </div>
      ) : (
        <FieldDescription className="italic">
          {name === "itemIds"
            ? PROMOTIONS_VI.itemsAllMenuSelected
            : `${PROMOTIONS_VI.itemsSelectedLabel}: 0`}
        </FieldDescription>
      )}
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={PROMOTIONS_VI.itemsSearchPlaceholder}
        controlSize={controlSize}
      />
      <div className="mt-2 grid max-h-56 gap-2 overflow-auto sm:grid-cols-2">
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
      {fieldState.error ? <FieldError errors={[fieldState.error]} /> : null}
    </Field>
  );
}

function PromotionRuleSummary({
  kind,
  discountType,
  discountValue,
  maxDiscountAmount,
  minSubtotal,
  reusableCode,
  itemIds,
  bxgyBuyQty,
  bxgyGetQty,
  freeSideQty,
  freeItemQty,
  allowCode,
  allowAuto,
}: {
  kind: PromotionKind;
  discountType: "pct" | "vnd" | null;
  discountValue: string;
  maxDiscountAmount: string;
  minSubtotal: string;
  reusableCode: string;
  itemIds: number[];
  bxgyBuyQty: string;
  bxgyGetQty: string;
  freeSideQty: string;
  freeItemQty: string;
  allowCode: boolean;
  allowAuto: boolean;
}) {
  const codeDisplay = reusableCode.trim()
    ? reusableCode.trim().toUpperCase()
    : "…";
  const minNum = parseAmount(minSubtotal) ?? 0;
  const minText =
    minNum > 0
      ? PROMOTIONS_VI.summaryOrderFrom(formatVND(minNum))
      : PROMOTIONS_VI.summaryAllOrders;
  const itemsText =
    itemIds.length > 0
      ? PROMOTIONS_VI.summarySelectedItems(itemIds.length)
      : PROMOTIONS_VI.summaryAllMenu;

  let summary = "";

  if (kind === "order_pct") {
    const val = parseAmount(discountValue) ?? 0;
    const maxNum = parseAmount(maxDiscountAmount);
    const maxText =
      maxNum != null && maxNum > 0
        ? PROMOTIONS_VI.summaryMaxLimit(formatVND(maxNum))
        : "";
    summary = PROMOTIONS_VI.summaryOrderPct(
      codeDisplay,
      formatPercent(val),
      maxText,
      itemsText,
      minText,
    );
  } else if (kind === "order_vnd") {
    const val = parseAmount(discountValue) ?? 0;
    summary = PROMOTIONS_VI.summaryOrderVnd(
      codeDisplay,
      formatVND(val),
      itemsText,
      minText,
    );
  } else if (kind === "voucher_face") {
    const val = parseAmount(discountValue) ?? 0;
    const faceText =
      val > 0 ? formatVND(val) : PROMOTIONS_VI.summaryVoucherPerCode;
    summary = PROMOTIONS_VI.summaryVoucherFace(faceText, minText);
  } else if (kind === "auto_order") {
    const val = parseAmount(discountValue) ?? 0;
    const isPct = discountType === "pct";
    const maxNum = parseAmount(maxDiscountAmount);
    const maxText =
      isPct && maxNum != null && maxNum > 0
        ? PROMOTIONS_VI.summaryMaxAuto(formatVND(maxNum))
        : "";
    const valText = isPct ? formatPercent(val) : formatVND(val);
    summary = PROMOTIONS_VI.summaryAutoOrder(valText, maxText, minText);
  } else if (kind === "bxgy") {
    summary = PROMOTIONS_VI.summaryBxgy(
      bxgyBuyQty || "2",
      bxgyGetQty || "1",
      minText,
    );
  } else if (kind === "free_side") {
    const actParts = [
      allowCode ? PROMOTIONS_VI.summaryActCode(codeDisplay) : null,
      allowAuto ? PROMOTIONS_VI.summaryActAuto : null,
    ].filter(Boolean);
    const actText =
      actParts.length > 0
        ? actParts.join(PROMOTIONS_VI.summaryOr)
        : PROMOTIONS_VI.summaryActNone;
    summary = PROMOTIONS_VI.summaryFreeSide(
      freeSideQty || "1",
      actText,
      minText,
    );
  } else if (kind === "free_item") {
    summary = PROMOTIONS_VI.summaryFreeItem(
      freeItemQty,
      codeDisplay,
      minText,
    );
  }

  return (
    <NoteCallout label={PROMOTIONS_VI.summaryTitle} tone="muted">
      {summary}
    </NoteCallout>
  );
}

function IdCheckboxList({
  control,
  name,
  label,
  description,
  options,
}: {
  control: Control<PromotionFormValues>;
  name: "branchIds";
  label: string;
  description?: string;
  options: Array<{ id: number; name: string }>;
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
      <FieldLabel>{label}</FieldLabel>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
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

function PromotionLiveMockup({
  name,
  kind,
  status,
  discountType,
  discountValue,
  maxDiscountAmount,
  minSubtotal,
  reusableCode,
  bxgyBuyQty,
  bxgyGetQty,
  freeSideQty,
  freeItemQty,
}: {
  name: string;
  kind: string;
  status: string;
  discountType: string | null;
  discountValue: string;
  maxDiscountAmount: string;
  minSubtotal: string;
  reusableCode: string;
  bxgyBuyQty: string;
  bxgyGetQty: string;
  freeSideQty: string;
  freeItemQty: string;
}) {
  const dVal = parseAmount(discountValue);
  const maxVal = parseAmount(maxDiscountAmount);
  const minVal = parseAmount(minSubtotal) ?? 0;
  const buyQty = parseAmount(bxgyBuyQty) ?? 2;
  const getQty = parseAmount(bxgyGetQty) ?? 1;
  const sideQty = parseAmount(freeSideQty) ?? 1;
  const itemQty = parseAmount(freeItemQty);

  let benefit = "—";
  if (kind === "order_pct") {
    benefit = PROMOTIONS_VI.benefitOrderPct(
      formatPercent(dVal ?? 0),
      maxVal ? formatVND(maxVal) : undefined,
    );
  } else if (kind === "order_vnd" || kind === "voucher_face") {
    benefit = PROMOTIONS_VI.benefitOrderVnd(formatVND(dVal ?? 0));
  } else if (kind === "auto_order") {
    const isPct = discountType === "pct";
    const valText = isPct ? formatPercent(dVal ?? 0) : formatVND(dVal ?? 0);
    const maxText = isPct && maxVal ? formatVND(maxVal) : undefined;
    benefit = PROMOTIONS_VI.benefitAutoOrder(valText, maxText);
  } else if (kind === "bxgy") {
    benefit = PROMOTIONS_VI.benefitBxgy(buyQty, getQty);
  } else if (kind === "free_side") {
    benefit = PROMOTIONS_VI.benefitFreeSide(sideQty);
  } else if (kind === "free_item") {
    benefit = PROMOTIONS_VI.benefitFreeItem(itemQty);
  }

  return (
    <Frame className="relative overflow-hidden border border-dashed border-primary/20 bg-gradient-to-br from-primary/10 via-background to-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-primary/20 text-xs font-semibold text-primary"
            >
              {PROMOTIONS_VI.voucherMockupTitle}
            </Badge>
            <StatusBadge domain="promotion" value={status} size="sm" />
          </div>
          <h4 className="text-base font-semibold text-foreground">
            {name.trim() || PROMOTIONS_VI.nameLabel}
          </h4>
          <p className="text-xs text-muted-foreground">
            {promotionKindLabel(kind)}
          </p>
        </div>
        {reusableCode.trim() ? (
          <Badge
            variant="secondary"
            className="font-mono text-xs uppercase tracking-wider"
          >
            {reusableCode.trim()}
          </Badge>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-dashed border-primary/20 pt-2">
        <span className="text-sm font-semibold text-primary">{benefit}</span>
        {minVal > 0 ? (
          <span className="text-xs text-muted-foreground">
            {PROMOTIONS_VI.minOrderCond(formatVND(minVal))}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {PROMOTIONS_VI.rulesTitle}
          </span>
        )}
      </div>
    </Frame>
  );
}

