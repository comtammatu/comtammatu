"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  DataTable,
} from "@/components/data-table/data-table";
import {
  AppListFrame,
  AppPage,
  AppPageHeader,
} from "@/components/surface";
import {
  RowActionsContextMenuItems,
} from "@/components/row-actions-menu";
import {
  attachSupplierInvoiceVatEvidence,
  acceptSupplierInvoiceDiscrepancy,
  allocateSupplierAdvance,
  createSupplierCreditAllocated,
  createSupplierInvoice,
  confirmSupplierInvoice,
  fetchSupplierInvoicesPage,
  getSupplierInvoiceValuationSummary,
  recordSupplierPayment,
  recomputeInvoiceMatching,
  verifyServiceSupplierInvoice,
  type SupplierAdvanceSummary,
  type SupplierInvoiceCursor,
  type SupplierInvoiceValuationSummary,
} from "../supplier-invoice-actions";
import { createClient } from "@comtammatu/database/supabase/client";
import {
  getSupplierInvoiceOutstandingAmount,
  mapSupplierInvoiceRow,
  resolveSupplierPaymentIntentKey,
  type SupplierInvoiceRow,
} from "./supplier-invoice-row";
import {
  getSupplierInvoiceGroupId,
  hasSupplierInvoiceListFilters,
  supplierInvoiceFiltersKey,
  type SupplierInvoiceGroup as SupplierInvoiceAggregateGroup,
  type SupplierInvoiceListFilters,
  type SupplierInvoiceViewMode,
} from "./supplier-invoice-list-model";
import {
  formatAccountingVND as formatVND,
  formatPercent,
} from "@comtammatu/shared/format";
import {
  addMoney,
  minorUnitsToCanonical,
  parseMoneyToMinorUnits,
} from "@comtammatu/shared/money";
import { messages } from "@lib/messages";
import {
  calculateSupplierInvoiceGrossLineTotal,
  calculateSupplierInvoiceNetLineTotal,
  resolveSupplierInvoiceVatAmount,
  type SupplierInvoiceVatRate,
} from "../_lib/supplier-invoice-money";
import {
  allocateSupplierMoney,
  ALL_FILTER_VALUE,
  canonicalMoney,
  createSupplierInvoiceDefaultValues,
  createSupplierPaymentDefaultValues,
  editSupplierInvoiceDefaultValues,
  getInvoiceAgingLabel,
  getPrimaryInvoice,
  isMissingMatchingEvidence,
  minimumMinorUnits,
  type GrnOption,
  type SupplierAdvanceFormValues,
  type SupplierCreditFormValues,
  type SupplierInvoiceFormValues,
  type SupplierInvoiceGroup,
  type SupplierInvoiceMode,
  type SupplierOption,
  type SupplierPaymentFormValues,
} from "./supplier-invoice-form-schema";
import { SupplierInvoiceDetailSheet } from "./supplier-invoice-detail-sheet";
import { SupplierInvoiceDialogs } from "./supplier-invoice-dialogs";
import { useSupplierInvoiceListUi } from "./supplier-invoice-list-ui";

export function SupplierInvoicesClient({
  invoices,
  suppliers,
  grns,
  initialHasMore = false,
  initialNextCursor = null,
  initialGroups,
  initialAdvances,
  initialTotalCount,
  filters,
  branchId,
  tenantId,
  grnBasePath = "/inventory/grn",
  canCreateInvoice = false,
  canPaySupplier = false,
  canAttachVatEvidence = false,
  canAcceptDiscrepancy = false,
}: {
  invoices: SupplierInvoiceRow[];
  suppliers: SupplierOption[];
  grns: GrnOption[];
  initialHasMore?: boolean;
  initialNextCursor?: SupplierInvoiceCursor | null;
  initialGroups: SupplierInvoiceAggregateGroup[];
  initialAdvances: SupplierAdvanceSummary[];
  initialTotalCount: number;
  filters: SupplierInvoiceListFilters;
  branchId?: number;
  tenantId: number;
  grnBasePath?: string;
  canCreateInvoice?: boolean;
  canPaySupplier?: boolean;
  canAttachVatEvidence?: boolean;
  canAcceptDiscrepancy?: boolean;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const invoiceIdParam = searchParams.get("invoiceId");
  const grnIdParam = searchParams.get("grnId");
  const modeParam = searchParams.get("mode");
  const preselectInvoiceId = invoiceIdParam ? Number(invoiceIdParam) : null;
  const preselectGrnId = grnIdParam ? Number(grnIdParam) : null;
  const requestedMode: SupplierInvoiceMode | null =
    modeParam === "view" ||
    modeParam === "create" ||
    modeParam === "edit" ||
    modeParam === "pay" ||
    modeParam === "credit" ||
    modeParam === "advance"
      ? modeParam
      : null;
  const invoiceMode: SupplierInvoiceMode | null =
    requestedMode === "create"
      ? "create"
      : preselectInvoiceId != null
        ? requestedMode === "edit" ||
          requestedMode === "pay" ||
          requestedMode === "credit" ||
          requestedMode === "advance"
          ? requestedMode
          : "view"
        : preselectGrnId != null
          ? "create"
          : null;

  const [rows, setRows] = useState(invoices);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<SupplierInvoiceCursor | null>(
    initialNextCursor,
  );
  const [aggregateGroups, setAggregateGroups] = useState(initialGroups);
  const [advances, setAdvances] = useState(initialAdvances);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState(filters.query);
  const supplierFilter =
    filters.supplierId != null ? String(filters.supplierId) : ALL_FILTER_VALUE;
  const matchStatusFilter = filters.matchStatus ?? ALL_FILTER_VALUE;
  const paymentStatusFilter = filters.paymentStatus ?? ALL_FILTER_VALUE;
  const viewMode: SupplierInvoiceViewMode = filters.viewMode;
  const showOnlyOverdue = filters.overdueOnly;
  const showOnlyMissingVat = filters.vatEvidence === "missing";
  const activeFilterCount = [
    filters.query,
    filters.supplierId,
    filters.matchStatus,
    filters.paymentStatus,
    filters.overdueOnly,
    filters.vatEvidence,
  ].filter(Boolean).length;
  const selectedInvoiceId = preselectInvoiceId;
  const detailOpen =
    selectedInvoiceId != null &&
    (invoiceMode === "view" ||
      (invoiceMode === "pay" && !canPaySupplier) ||
      (invoiceMode === "credit" && !canAcceptDiscrepancy) ||
      (invoiceMode === "advance" && !canPaySupplier));
  const createOpen =
    (invoiceMode === "create" || invoiceMode === "edit") && canCreateInvoice;
  const paymentOpen =
    invoiceMode === "pay" && selectedInvoiceId != null && canPaySupplier;
  const creditOpen =
    invoiceMode === "credit" &&
    selectedInvoiceId != null &&
    canAcceptDiscrepancy;
  const advanceOpen =
    invoiceMode === "advance" && selectedInvoiceId != null && canPaySupplier;
  const [acceptDiscrepancyOpen, setAcceptDiscrepancyOpen] = useState(false);
  const [acceptDiscrepancyReason, setAcceptDiscrepancyReason] = useState("");
  const [serviceVerificationOpen, setServiceVerificationOpen] = useState(false);
  const [serviceVerificationReason, setServiceVerificationReason] =
    useState("");
  const [vatUploading, setVatUploading] = useState(false);
  const [pendingCreateVatFile, setPendingCreateVatFile] = useState<File | null>(
    null,
  );
  const paymentIntentKeyRef = useRef<string | null>(null);
  const advanceIntentKeyRef = useRef<string | null>(null);
  const invoiceSaveIntentKeyRef = useRef<string | null>(null);
  const invoiceConfirmIntentKeyRef = useRef<string | null>(null);
  const createdInvoiceIdRef = useRef<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const copy = messages.inventory.supplierInvoices;
  const preselectGrnOptionKey =
    preselectGrnId != null
      ? (grns.find((option) => option.id === preselectGrnId)?.optionKey ?? null)
      : null;
  const createDefaultValues = useMemo(
    () => createSupplierInvoiceDefaultValues(preselectGrnOptionKey),
    [createOpen, preselectGrnOptionKey],
  );

  useEffect(() => {
    invoiceConfirmIntentKeyRef.current = null;
  }, [selectedInvoiceId]);
  const listKey = supplierInvoiceFiltersKey(filters);
  const actionFilters = useMemo(
    () => ({
      query: filters.query,
      supplierId: filters.supplierId ?? undefined,
      matchStatus: filters.matchStatus ?? undefined,
      paymentStatus: filters.paymentStatus ?? undefined,
      overdueOnly: filters.overdueOnly,
      vatEvidence: filters.vatEvidence ?? undefined,
      viewMode: filters.viewMode,
    }),
    [filters],
  );

  useEffect(() => {
    setRows(invoices);
    setHasMore(initialHasMore);
    setNextCursor(initialNextCursor);
    setAggregateGroups(initialGroups);
    setAdvances(initialAdvances);
    setTotalCount(initialTotalCount);
    setSearch(filters.query);
  }, [
    filters.query,
    initialGroups,
    initialAdvances,
    initialHasMore,
    initialNextCursor,
    initialTotalCount,
    invoices,
    listKey,
    preselectInvoiceId,
  ]);

  const updateListParams = useCallback(
    (
      updates: Record<string, string | null>,
      history: "push" | "replace" = "replace",
    ) => {
      const next = new URLSearchParams(searchParams.toString());
      if (!Object.hasOwn(updates, "q")) {
        const pendingQuery = search.trim().slice(0, 200);
        if (pendingQuery) next.set("q", pendingQuery);
        else next.delete("q");
      }
      for (const [key, value] of Object.entries(updates)) {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      startTransition(() => {
        const href = query ? `${pathname}?${query}` : pathname;
        if (history === "push") {
          router.push(href, { scroll: false });
        } else {
          router.replace(href, { scroll: false });
        }
      });
    },
    [pathname, router, search, searchParams, startTransition],
  );

  const replaceListParam = useCallback(
    (key: string, value: string | null) => {
      updateListParams({ [key]: value });
    },
    [updateListParams],
  );

  const openInvoiceDetail = useCallback(
    (invoiceId: number, history: "push" | "replace" = "push") => {
      updateListParams(
        {
          mode: "view",
          invoiceId: String(invoiceId),
          grnId: null,
        },
        history,
      );
    },
    [updateListParams],
  );

  function handleDetailOpenChange(open: boolean) {
    if (!open) {
      updateListParams({ mode: null, invoiceId: null, grnId: null });
    }
  }

  function openCreateDialog() {
    if (!canCreateInvoice) return;
    createdInvoiceIdRef.current = null;
    invoiceSaveIntentKeyRef.current = null;
    updateListParams({ mode: "create", invoiceId: null, grnId: null }, "push");
  }

  useEffect(() => {
    const normalized = search.trim().slice(0, 200);
    if (normalized === filters.query) return;

    const timeout = window.setTimeout(() => {
      replaceListParam("q", normalized || null);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [filters.query, replaceListParam, search]);

  const supplierOptions = useMemo(() => {
    return suppliers
      .filter((supplier) => supplier.id > 0 && supplier.name.trim().length > 0)
      .sort((left, right) => left.name.localeCompare(right.name, "vi"))
      .map((supplier) => ({
        label: supplier.name,
        value: String(supplier.id),
      }));
  }, [suppliers]);

  const allInvoiceGroups = useMemo<SupplierInvoiceGroup[]>(
    () =>
      aggregateGroups.map((group) => ({
        ...group,
        title:
          viewMode === "supplier"
            ? group.supplierName
            : (group.poCode ?? copy.noLinkedPo),
        subtitle:
          viewMode === "supplier"
            ? copy.invoiceGroupSummary(group.invoiceCount)
            : `${group.supplierName} · ${copy.invoiceGroupSummary(group.invoiceCount)}`,
      })),
    [aggregateGroups, copy, viewMode],
  );
  const loadedGroupIds = useMemo(
    () =>
      new Set(
        rows.map((invoice) => getSupplierInvoiceGroupId(invoice, viewMode)),
      ),
    [rows, viewMode],
  );
  const invoiceGroups = useMemo(
    () => allInvoiceGroups.filter((group) => loadedGroupIds.has(group.id)),
    [allInvoiceGroups, loadedGroupIds],
  );

  const selectedInvoice =
    (typeof selectedInvoiceId === "number"
      ? (rows.find((invoice) => invoice.id === selectedInvoiceId) ??
        allInvoiceGroups
          .flatMap((group) => group.invoices)
          .find((invoice) => invoice.id === selectedInvoiceId) ??
        allInvoiceGroups.find(
          (group) => group.primaryInvoice.id === selectedInvoiceId,
        )?.primaryInvoice)
      : null) ?? null;
  const [valuationSummary, setValuationSummary] =
    useState<SupplierInvoiceValuationSummary | null>(null);
  const [valuationSummaryLoading, setValuationSummaryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setValuationSummary(null);
    if (
      selectedInvoice == null ||
      selectedInvoice.documentStatus !== "confirmed"
    ) {
      setValuationSummaryLoading(false);
      return;
    }
    setValuationSummaryLoading(true);
    void getSupplierInvoiceValuationSummary(selectedInvoice.id).then(
      (result) => {
        if (cancelled) return;
        setValuationSummary(result.success ? (result.data ?? null) : null);
        setValuationSummaryLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedInvoice?.documentStatus, selectedInvoice?.id]);
  const invoiceFormDefaultValues = useMemo(
    () =>
      invoiceMode === "edit" && selectedInvoice
        ? editSupplierInvoiceDefaultValues(selectedInvoice, grns)
        : createDefaultValues,
    [createDefaultValues, grns, invoiceMode, selectedInvoice],
  );
  const selectedOutstandingAmount = selectedInvoice
    ? getSupplierInvoiceOutstandingAmount(selectedInvoice)
    : 0;
  const selectedMissingMatchingEvidence = selectedInvoice
    ? isMissingMatchingEvidence(selectedInvoice)
    : false;
  const selectedGroup =
    selectedInvoice != null
      ? (allInvoiceGroups.find(
          (group) =>
            group.id === getSupplierInvoiceGroupId(selectedInvoice, viewMode),
        ) ?? null)
      : null;
  const selectedGroupId = selectedGroup?.id ?? null;
  const invoicesInSelectedGroup = useMemo(() => {
    if (selectedGroup == null) return [];
    const rowById = new Map(rows.map((invoice) => [invoice.id, invoice]));
    return selectedGroup.invoices.map(
      (invoice) => rowById.get(invoice.id) ?? invoice,
    );
  }, [rows, selectedGroup]);
  const payableInvoicesInSelectedGroup = useMemo(
    () =>
      invoicesInSelectedGroup.filter(
        (invoice) =>
          invoice.documentStatus === "confirmed" &&
          invoice.matchStatus === "matched" &&
          invoice.vatInvoiceAttachmentPath != null &&
          getSupplierInvoiceOutstandingAmount(invoice) > 0,
      ),
    [invoicesInSelectedGroup],
  );
  const paymentOutstandingAmount = addMoney(
    payableInvoicesInSelectedGroup.map((invoice) =>
      canonicalMoney(getSupplierInvoiceOutstandingAmount(invoice)),
    ),
  );
  const paymentDefaultValues = useMemo(
    () =>
      createSupplierPaymentDefaultValues(
        selectedInvoice,
        paymentOutstandingAmount,
      ),
    [selectedInvoice?.id, paymentOutstandingAmount],
  );
  const selectedSupplierAdvances = useMemo(
    () =>
      selectedInvoice == null
        ? []
        : advances.filter(
            (advance) => advance.supplierId === selectedInvoice.supplierId,
          ),
    [advances, selectedInvoice],
  );
  const selectedSupplierAdvanceAmount = addMoney(
    selectedSupplierAdvances.map((advance) => advance.advanceAmount),
  );
  const advanceDefaultValues = useMemo<SupplierAdvanceFormValues>(
    () => ({
      paymentId: String(selectedSupplierAdvances[0]?.paymentId ?? ""),
      amount: minorUnitsToCanonical(
        minimumMinorUnits([
          parseMoneyToMinorUnits(selectedSupplierAdvanceAmount),
          parseMoneyToMinorUnits(paymentOutstandingAmount),
        ]),
      ),
    }),
    [
      paymentOutstandingAmount,
      selectedSupplierAdvanceAmount,
      selectedSupplierAdvances,
    ],
  );
  const creditDefaultValues = useMemo(
    () => ({
      creditNumber: "",
      amount: addMoney(
        invoicesInSelectedGroup.map((invoice) =>
          canonicalMoney(getSupplierInvoiceOutstandingAmount(invoice)),
        ),
      ),
      notes: "",
    }),
    [invoicesInSelectedGroup],
  );

  const showEmptyResults =
    totalCount === 0 && hasSupplierInvoiceListFilters(filters);

  async function reloadInvoices(nextSelectedId?: number | null) {
    const [again, exactSelected] = await Promise.all([
      fetchSupplierInvoicesPage({ branchId, ...actionFilters }),
      typeof nextSelectedId === "number"
        ? fetchSupplierInvoicesPage({
            branchId,
            invoiceId: nextSelectedId,
            pageSize: 1,
          })
        : Promise.resolve(null),
    ]);
    if (!again.success || !again.data) return false;

    const {
      items,
      hasMore: more,
      nextCursor: cursor,
      groups: nextGroups,
      totalCount: nextTotalCount,
      advances: nextAdvances,
    } = again.data;
    let nextRows = (items as Array<Record<string, unknown>>).map(
      mapSupplierInvoiceRow,
    );

    if (typeof nextSelectedId === "number") {
      const exactItem = (
        exactSelected?.success ? exactSelected.data?.items[0] : undefined
      ) as Record<string, unknown> | undefined;
      if (!exactItem || Number(exactItem.id) !== nextSelectedId) {
        toast.error(exactSelected?.error ?? copy.loadFailed);
        return false;
      }

      const exactRow = mapSupplierInvoiceRow(exactItem);
      nextRows = [
        exactRow,
        ...nextRows.filter((invoice) => invoice.id !== exactRow.id),
      ];
    }

    setRows(nextRows);
    // Fresh first page — restore keyset state from the paginated result,
    // mirroring how the SSR initial load wires hasMore/nextCursor.
    setHasMore(more);
    setNextCursor(cursor);
    setAggregateGroups(nextGroups);
    setAdvances(nextAdvances);
    setTotalCount(nextTotalCount);
    return true;
  }

  function handleLoadMore() {
    if (loadingMore || !hasMore || !nextCursor) return;
    setLoadingMore(true);
    startTransition(async () => {
      try {
        const result = await fetchSupplierInvoicesPage({
          branchId,
          ...actionFilters,
          before: nextCursor,
        });
        if (!result.success || !result.data) {
          toast.error(result.error ?? copy.loadMoreFailed);
          return;
        }
        const {
          items,
          hasMore: more,
          nextCursor: cursor,
          groups: nextGroups,
          totalCount: nextTotalCount,
          advances: nextAdvances,
        } = result.data;
        const mapped = (items as Array<Record<string, unknown>>).map(
          mapSupplierInvoiceRow,
        );
        setRows((prev) => {
          const seen = new Set(prev.map((row) => row.id));
          const next = mapped.filter((row) => !seen.has(row.id));
          return [...prev, ...next];
        });
        setHasMore(more);
        setNextCursor(cursor);
        setAggregateGroups(nextGroups);
        setAdvances(nextAdvances);
        setTotalCount(nextTotalCount);
      } finally {
        setLoadingMore(false);
      }
    });
  }

  async function uploadAndAttachVatEvidence(
    invoiceId: number,
    file: File,
  ): Promise<boolean> {
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isImage && !isPdf) {
      toast.error(copy.vatAttachmentHint);
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(copy.vatAttachmentHint);
      return false;
    }

    const supabase = createClient();
    const ext =
      file.name.includes(".") && file.name.lastIndexOf(".") >= 0
        ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
        : isPdf
          ? ".pdf"
          : ".jpg";
    const path = `${tenantId}/supplier-invoices/${invoiceId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("supplier-invoice-attachments")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
    if (uploadError) {
      toast.error(copy.vatAttachmentUploadFailed);
      return false;
    }

    const res = await attachSupplierInvoiceVatEvidence({
      invoiceId,
      storagePath: path,
    });
    if (!res.success) {
      toast.error(res.error ?? copy.vatAttachmentUploadFailed);
      return false;
    }

    return true;
  }

  async function handleCreateInvoice(values: SupplierInvoiceFormValues) {
    const selectedGrns =
      values.grnId === "none"
        ? []
        : grns.filter((option) =>
            values.grnId.split(",").includes(option.optionKey),
          );
    const selectedGrn = selectedGrns[0] ?? null;
    if (
      values.invoiceKind === "goods" &&
      selectedGrns.some((receipt) => receipt.poId == null)
    ) {
      return { success: false, error: copy.missingPoForReceipt };
    }
    const resolvedSupplierId =
      selectedGrn?.supplierId ?? Number(values.supplierId || 0);
    const pendingFile = pendingCreateVatFile;
    invoiceSaveIntentKeyRef.current ??= crypto.randomUUID();
    const res = await createSupplierInvoice({
      invoiceId:
        invoiceMode === "edit" ? (selectedInvoice?.id ?? undefined) : undefined,
      invoiceKind: values.invoiceKind,
      supplierId: resolvedSupplierId,
      invoiceDate: values.invoiceDate,
      documentDiscountAmount: canonicalMoney(values.documentDiscount),
      idempotencyKey: invoiceSaveIntentKeyRef.current,
      lines: values.lines.map((line) => {
        const quantity = String(line.quantity);
        const lineDiscount = canonicalMoney(line.lineDiscount);
        const unitPrice = canonicalMoney(line.unitPrice);
        const netLineTotal = calculateSupplierInvoiceNetLineTotal(
          quantity,
          line.unitPrice,
          lineDiscount,
        );
        const vatAmount = resolveSupplierInvoiceVatAmount(
          netLineTotal,
          line.vatRate as SupplierInvoiceVatRate,
          line.vatMode,
          line.vatAmount,
        );
        const grossLineTotal = calculateSupplierInvoiceGrossLineTotal(
          netLineTotal,
          vatAmount,
        );
        return {
          lineKey: line.key,
          ingredientId: line.ingredientId,
          description: line.description,
          quantity,
          unitId: line.unitId,
          unitPrice,
          grossLineTotal,
          lineDiscount,
          vatRate: line.vatRate,
          vatAmount,
          lineTotal: netLineTotal,
          allocations: line.allocations.map((allocation) => ({
            ...allocation,
            quantity: String(allocation.quantity),
          })),
        };
      }),
    });

    if (res.success && res.data) {
      const created = res.data as { id: number };
      invoiceSaveIntentKeyRef.current = null;
      setPendingCreateVatFile(null);

      if (pendingFile && canAttachVatEvidence) {
        const attached = await uploadAndAttachVatEvidence(
          created.id,
          pendingFile,
        );
        if (!attached) {
          toast.error(copy.vatAttachmentCreateFailed);
        } else {
          toast.success(copy.vatAttachmentUploaded);
        }
      } else if (canAttachVatEvidence) {
        toast.message(copy.vatAttachmentRemindAfterCreate);
      }

      if (await reloadInvoices(created.id)) {
        createdInvoiceIdRef.current = created.id;
      }
    }

    return res;
  }

  async function handleConfirmInvoice() {
    if (!selectedInvoice) return;
    invoiceConfirmIntentKeyRef.current ??= crypto.randomUUID();
    const result = await confirmSupplierInvoice({
      invoiceId: selectedInvoice.id,
      idempotencyKey: invoiceConfirmIntentKeyRef.current,
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    invoiceConfirmIntentKeyRef.current = null;
    const valuation = result.data?.valuation;
    if (valuation?.warning) {
      toast.warning(copy.valuation.warningToast);
    } else {
      toast.success(copy.valuation.confirmedToast);
    }
    setValuationSummary(valuation ?? null);
    await reloadInvoices(selectedInvoice.id);
  }

  async function handleRecordPayment(values: SupplierPaymentFormValues) {
    if (!selectedInvoice) {
      return { success: false, error: copy.noPaymentInvoice };
    }

    if (!selectedInvoice.vatInvoiceAttachmentPath) {
      return { success: false, error: copy.paymentBlockedNoVatAttachment };
    }

    const amount = canonicalMoney(values.amount);
    const allocations = allocateSupplierMoney(
      amount,
      payableInvoicesInSelectedGroup,
    );
    if (allocations.length === 0) {
      return { success: false, error: copy.noPaymentInvoice };
    }

    const idempotencyKey = resolveSupplierPaymentIntentKey(
      paymentIntentKeyRef.current,
      () => crypto.randomUUID(),
    );
    paymentIntentKeyRef.current = idempotencyKey;

    try {
      const res = await recordSupplierPayment({
        invoiceId: selectedInvoice.id,
        supplierId: selectedInvoice.supplierId,
        allocations,
        idempotencyKey,
        amount,
        paymentMethod: values.paymentMethod,
        referenceNote: values.referenceNote?.trim() || undefined,
      });

      if (res.success) {
        if (
          res.data?.advanceAmount &&
          parseMoneyToMinorUnits(res.data.advanceAmount) > 0n
        ) {
          toast.message(
            copy.paymentAdvanceRecorded(formatVND(res.data!.advanceAmount)),
          );
        }
        await reloadInvoices(selectedInvoice.id);
      }

      return res;
    } catch {
      return { success: false, error: copy.paymentRetrySameIntent };
    }
  }

  async function handleCreateCredit(values: SupplierCreditFormValues) {
    if (!selectedInvoice) {
      return { success: false, error: "Không tìm thấy hóa đơn NCC." };
    }
    const amount = canonicalMoney(values.amount);
    const allocations = allocateSupplierMoney(amount, invoicesInSelectedGroup);
    if (allocations.length === 0) {
      return { success: false, error: "Không còn công nợ để phân bổ." };
    }
    const result = await createSupplierCreditAllocated({
      supplierId: selectedInvoice.supplierId,
      creditNumber: values.creditNumber,
      amount,
      notes: values.notes,
      allocations,
    });
    if (result.success) await reloadInvoices(selectedInvoice.id);
    return result;
  }

  async function handleAllocateAdvance(values: SupplierAdvanceFormValues) {
    if (!selectedInvoice) {
      return { success: false, error: copy.noPaymentInvoice };
    }
    const selectedAdvance = selectedSupplierAdvances.find(
      (advance) => advance.paymentId === Number(values.paymentId),
    );
    if (!selectedAdvance) {
      return { success: false, error: copy.advanceNotFound };
    }
    const requestedAmount = canonicalMoney(values.amount);
    if (
      parseMoneyToMinorUnits(requestedAmount) >
      parseMoneyToMinorUnits(canonicalMoney(selectedAdvance.advanceAmount))
    ) {
      return { success: false, error: copy.advanceExceedsBalance };
    }

    const allocations = allocateSupplierMoney(
      requestedAmount,
      payableInvoicesInSelectedGroup,
    );
    if (allocations.length === 0) {
      return { success: false, error: copy.noPaymentInvoice };
    }

    const idempotencyKey = resolveSupplierPaymentIntentKey(
      advanceIntentKeyRef.current,
      () => crypto.randomUUID(),
    );
    advanceIntentKeyRef.current = idempotencyKey;
    const result = await allocateSupplierAdvance({
      paymentId: selectedAdvance.paymentId,
      idempotencyKey,
      allocations,
    });
    if (result.success) await reloadInvoices(selectedInvoice.id);
    return result;
  }

  async function handleVatAttachmentUpload(file: File) {
    if (!selectedInvoice) return;

    setVatUploading(true);
    try {
      const attached = await uploadAndAttachVatEvidence(
        selectedInvoice.id,
        file,
      );
      if (!attached) return;

      toast.success(copy.vatAttachmentUploaded);
      await reloadInvoices(selectedInvoice.id);
    } finally {
      setVatUploading(false);
    }
  }

  async function handleOpenVatAttachment() {
    const path = selectedInvoice?.vatInvoiceAttachmentPath;
    if (!path) return;

    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("supplier-invoice-attachments")
      .createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) {
      toast.error(copy.vatAttachmentOpenFailed);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function openSupplierPaymentDialog() {
    if (!selectedInvoice?.vatInvoiceAttachmentPath) {
      toast.error(copy.paymentBlockedNoVatAttachment);
      return;
    }
    paymentIntentKeyRef.current = crypto.randomUUID();
    updateListParams({ mode: "pay" });
  }

  function handlePaymentOpenChange(open: boolean) {
    if (open && paymentIntentKeyRef.current == null) {
      paymentIntentKeyRef.current = crypto.randomUUID();
    }
    if (!open) {
      paymentIntentKeyRef.current = null;
      updateListParams({ mode: "view" });
    }
  }

  function handleCreateOpenChange(open: boolean) {
    if (open && invoiceMode !== "edit") {
      openCreateDialog();
      return;
    }
    if (!open) {
      setPendingCreateVatFile(null);
    }
    const createdInvoiceId = createdInvoiceIdRef.current;
    createdInvoiceIdRef.current = null;
    if (createdInvoiceId != null) {
      openInvoiceDetail(createdInvoiceId, "replace");
      return;
    }
    updateListParams({ mode: null, invoiceId: null, grnId: null });
  }

  function openEditInvoiceDialog() {
    if (!selectedInvoice || selectedInvoice.documentStatus !== "draft") return;
    invoiceSaveIntentKeyRef.current = null;
    updateListParams({ mode: "edit", invoiceId: String(selectedInvoice.id) });
  }

  function openSupplierCreditDialog() {
    updateListParams({ mode: "credit" });
  }

  function handleCreditOpenChange(open: boolean) {
    if (!open) updateListParams({ mode: "view" });
  }

  function openSupplierAdvanceDialog() {
    advanceIntentKeyRef.current = crypto.randomUUID();
    updateListParams({ mode: "advance" });
  }

  function handleAdvanceOpenChange(open: boolean) {
    if (open && advanceIntentKeyRef.current == null) {
      advanceIntentKeyRef.current = crypto.randomUUID();
    }
    if (!open) {
      advanceIntentKeyRef.current = null;
      updateListParams({ mode: "view" });
    }
  }

  function handleRecomputeMatching() {
    if (!selectedInvoice) return;

    startTransition(async () => {
      const res = await recomputeInvoiceMatching(selectedInvoice.id);
      if (!res.success) {
        toast.error(res.error ?? copy.recomputeMatchingFailed);
        return;
      }
      toast.success(copy.recomputeMatchingSuccess);
      await reloadInvoices(selectedInvoice.id);
    });
  }

  function handleAcceptDiscrepancy() {
    if (!selectedInvoice) return;
    startTransition(async () => {
      const result = await acceptSupplierInvoiceDiscrepancy({
        invoiceId: selectedInvoice.id,
        reason: acceptDiscrepancyReason,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.acceptDiscrepancyFailed);
        return;
      }
      toast.success(copy.acceptDiscrepancySuccess);
      setAcceptDiscrepancyOpen(false);
      setAcceptDiscrepancyReason("");
      await reloadInvoices(selectedInvoice.id);
    });
  }

  function handleVerifyServiceInvoice() {
    if (!selectedInvoice) return;
    startTransition(async () => {
      const result = await verifyServiceSupplierInvoice({
        invoiceId: selectedInvoice.id,
        reason: serviceVerificationReason,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.serviceVerificationFailed);
        return;
      }
      toast.success(copy.serviceVerificationSuccess);
      setServiceVerificationOpen(false);
      setServiceVerificationReason("");
      await reloadInvoices(selectedInvoice.id);
    });
  }

  const {
    controlSize,
    renderInvoiceGroupCard,
    getSupplierInvoiceGroupRowActions,
    invoiceGroupColumns,
    listToolbar,
  } = useSupplierInvoiceListUi({
    copy,
    viewMode,
    detailOpen,
    selectedInvoice,
    supplierFilter,
    matchStatusFilter,
    paymentStatusFilter,
    showOnlyOverdue,
    showOnlyMissingVat,
    activeFilterCount,
    search,
    onSearchChange: setSearch,
    allInvoiceGroupsLength: allInvoiceGroups.length,
    totalCount,
    supplierOptions,
    replaceListParam,
    updateListParams,
    openInvoiceDetail,
  });

  const activeGroupId = selectedGroupId;
  const selectedAgingLabel = selectedInvoice
    ? getInvoiceAgingLabel(selectedInvoice, copy)
    : null;
  const missingVatAttachment =
    selectedInvoice != null && !selectedInvoice.vatInvoiceAttachmentPath;
  const canShowPayAction =
    canPaySupplier &&
    selectedInvoice != null &&
    selectedInvoice.documentStatus === "confirmed" &&
    selectedInvoice.matchStatus === "matched" &&
    selectedOutstandingAmount > 0;
  const payIsPrimary =
    canShowPayAction &&
    selectedInvoice != null &&
    selectedInvoice.vatInvoiceAttachmentPath != null;
  const uploadIsPrimary =
    canAttachVatEvidence &&
    missingVatAttachment &&
    selectedOutstandingAmount > 0;
  const showMatchProblem =
    selectedInvoice != null &&
    (selectedInvoice.matchStatus === "pending" ||
      selectedInvoice.matchStatus === "discrepancy");
  const vatSummaryLabel =
    selectedInvoice != null && selectedInvoice.vatBreakdown.length > 0
      ? selectedInvoice.vatBreakdown
          .map((line) =>
            copy.vatBucketSummary(
              formatPercent(line.vatRate, 0),
              messages.inventory.common.currencyCompact(
                formatVND(line.taxableAmount),
              ),
            ),
          )
          .join(" · ")
      : null;

  const detailTitle =
    selectedInvoice != null ? copy.invoiceDetailTitle : copy.noInvoiceSelected;

  const detailSubtitle =
    selectedInvoice != null
      ? [selectedInvoice.supplierName, selectedAgingLabel]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={messages.finance.supplierInvoicesPage.title}
        actions={
          canCreateInvoice ? (
            <Button type="button" size="touch" onClick={openCreateDialog}>
              {copy.createAction}
            </Button>
          ) : undefined
        }
      />

      <AppListFrame toolbar={listToolbar}>
        <DataTable
          columns={invoiceGroupColumns}
          data={invoiceGroups}
          getRowKey={(group) => group.id}
          pageSize={50}
          emptyTitle={
            showEmptyResults ? copy.emptyMatchedTitle : copy.emptyInitialTitle
          }
          emptyDescription={
            showEmptyResults
              ? copy.emptyMatchedDescription
              : copy.emptyInitialDescription
          }
          emptyMode={showEmptyResults ? "no-results" : "no-data"}
          onRowClick={(group) => {
            const primaryInvoice = getPrimaryInvoice(group);
            if (primaryInvoice) openInvoiceDetail(primaryInvoice.id);
          }}
          getRowAriaLabel={(group) =>
            `${copy.groupDetailAction}: ${group.title}`
          }
          getRowDataState={(group) =>
            group.id === activeGroupId && detailOpen ? "selected" : undefined
          }
          renderRowContextMenu={(group) => (
            <RowActionsContextMenuItems
              items={getSupplierInvoiceGroupRowActions(group)}
            />
          )}
          mobileCardRender={renderInvoiceGroupCard}
        />
        {hasMore ? (
          <div className="flex justify-center p-3">
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {copy.loadMore}
            </Button>
          </div>
        ) : null}
      </AppListFrame>

      <SupplierInvoiceDetailSheet
        open={detailOpen}
        onOpenChange={handleDetailOpenChange}
        detailTitle={detailTitle}
        detailSubtitle={detailSubtitle}
        selectedInvoice={selectedInvoice}
        invoicesInSelectedGroup={invoicesInSelectedGroup}
        selectedOutstandingAmount={selectedOutstandingAmount}
        selectedSupplierAdvanceAmount={selectedSupplierAdvanceAmount}
        paymentOutstandingAmount={paymentOutstandingAmount}
        valuationSummary={valuationSummary}
        valuationSummaryLoading={valuationSummaryLoading}
        missingVatAttachment={missingVatAttachment}
        canShowPayAction={canShowPayAction}
        canPaySupplier={canPaySupplier}
        canCreateInvoice={canCreateInvoice}
        canAttachVatEvidence={canAttachVatEvidence}
        canAcceptDiscrepancy={canAcceptDiscrepancy}
        payIsPrimary={payIsPrimary}
        uploadIsPrimary={uploadIsPrimary}
        showMatchProblem={showMatchProblem}
        selectedMissingMatchingEvidence={selectedMissingMatchingEvidence}
        vatSummaryLabel={vatSummaryLabel}
        selectedAgingLabel={selectedAgingLabel}
        copy={copy}
        controlSize={controlSize}
        grnBasePath={grnBasePath}
        isPending={isPending}
        vatUploading={vatUploading}
        onSelectInvoiceInGroup={(invoiceId) => openInvoiceDetail(invoiceId)}
        onVatAttachmentUpload={(file) => void handleVatAttachmentUpload(file)}
        onOpenVatAttachment={() => void handleOpenVatAttachment()}
        onConfirmInvoice={handleConfirmInvoice}
        onEditInvoice={openEditInvoiceDialog}
        onPay={openSupplierPaymentDialog}
        onAllocateAdvance={openSupplierAdvanceDialog}
        onVerifyService={() => setServiceVerificationOpen(true)}
        onAcceptDiscrepancy={() => setAcceptDiscrepancyOpen(true)}
        onCredit={openSupplierCreditDialog}
        onRecomputeMatching={handleRecomputeMatching}
      />

      <SupplierInvoiceDialogs
        copy={copy}
        acceptDiscrepancyOpen={acceptDiscrepancyOpen}
        onAcceptDiscrepancyOpenChange={setAcceptDiscrepancyOpen}
        acceptDiscrepancyReason={acceptDiscrepancyReason}
        onAcceptDiscrepancyReasonChange={setAcceptDiscrepancyReason}
        onAcceptDiscrepancy={handleAcceptDiscrepancy}
        serviceVerificationOpen={serviceVerificationOpen}
        onServiceVerificationOpenChange={setServiceVerificationOpen}
        serviceVerificationReason={serviceVerificationReason}
        onServiceVerificationReasonChange={setServiceVerificationReason}
        onVerifyServiceInvoice={handleVerifyServiceInvoice}
        isPending={isPending}
        createOpen={createOpen}
        onCreateOpenChange={handleCreateOpenChange}
        invoiceMode={invoiceMode}
        invoiceFormDefaultValues={invoiceFormDefaultValues}
        selectedInvoiceId={selectedInvoiceId}
        preselectGrnId={preselectGrnId}
        suppliers={suppliers}
        grns={grns}
        canAttachVatEvidence={canAttachVatEvidence}
        pendingCreateVatFile={pendingCreateVatFile}
        onPendingCreateVatFileChange={setPendingCreateVatFile}
        onCreateInvoice={handleCreateInvoice}
        paymentOpen={paymentOpen}
        onPaymentOpenChange={handlePaymentOpenChange}
        paymentDefaultValues={paymentDefaultValues}
        selectedInvoiceIdForPayment={selectedInvoice?.id}
        paymentOutstandingAmount={paymentOutstandingAmount}
        onRecordPayment={handleRecordPayment}
        creditOpen={creditOpen}
        onCreditOpenChange={handleCreditOpenChange}
        creditDefaultValues={creditDefaultValues}
        onCreateCredit={handleCreateCredit}
        advanceOpen={advanceOpen}
        onAdvanceOpenChange={handleAdvanceOpenChange}
        advanceDefaultValues={advanceDefaultValues}
        selectedSupplierAdvances={selectedSupplierAdvances}
        onAllocateAdvance={handleAllocateAdvance}
      />

    </AppPage>
  );
}
