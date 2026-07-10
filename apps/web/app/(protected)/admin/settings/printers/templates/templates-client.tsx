"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppSection } from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { FormDialog, SelectField, TextField, FormattedNumberInput } from "@/components/form";
import {
  ChevronDown as IconChevronDown,
  ChevronUp as IconChevronUp,
  Printer as IconPrinter,
  RotateCcw as IconRotateCcw,
  Save as IconSave,
  X as IconX,
} from "lucide-react";
import {
  DEFAULT_TEMPLATE_CONTENT,
  type PrintKind,
  type TemplateBlock,
} from "@comtammatu/print-render/templates";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import {
  previewPrintTemplate,
  restorePrintTemplateDefault,
  savePrintTemplate,
  testPrintTemplate,
} from "./actions";

const copy = messages.settings.printTemplates;

const saveTemplateSchema = z.object({
  name: z.string().trim().min(1, { error: ERRORS_VI.validationFailed }),
  paperWidth: z.enum(["58", "80"]),
});

type SaveTemplateValues = z.infer<typeof saveTemplateSchema>;

const PAPER_WIDTH_OPTIONS = [
  { value: "80", label: copy.paperWidth80 },
  { value: "58", label: copy.paperWidth58 },
];

export type BranchOption = { id: number; name: string };

export type KindTemplate = {
  kind: PrintKind;
  blocks: TemplateBlock[];
  paperWidth: 58 | 80;
  source: "custom" | "default";
  versionLabel: string | null;
};

const KIND_LABEL: Record<PrintKind, string> = {
  receipt: "Hóa đơn",
  provisional_bill: "Tạm tính",
  kitchen_ticket: "Phiếu bếp",
  cancel_ticket: "Phiếu hủy",
  shift_close_report: "Chốt ca",
};

const BLOCK_LABEL: Record<string, string> = {
  text: "Dòng chữ",
  row: "Dòng 2 cột",
  divider: "Đường kẻ",
  spacer: "Dòng trống",
  brandHeader: "Logo thương hiệu",
  branchInfo: "Thông tin chi nhánh",
  billMeta: "Thông tin đơn",
  paymentMethod: "Phương thức thanh toán",
  itemsTable: "Bảng món",
  totals: "Tổng tiền",
  cashChange: "Tiền nhận / trả khách",
  note: "Ghi chú đơn",
  paymentQr: "QR thanh toán",
  footer: "Chân phiếu",
  kitchenItems: "Danh sách món (bếp)",
  cancelItems: "Danh sách món hủy",
  shiftOrderSummary: "Tổng kết ca",
  shiftItemBreakdown: "Số lượng bán theo món",
  shiftCashReconciliation: "Đối soát két tiền mặt",
  paymentBreakdown: "Cơ cấu đã thu",
  shiftVarianceNotice: "Lưu ý lệch két",
  shiftSignature: "Ký nhận bàn giao",
};

/** Blocks whose content comes from order data — position/remove only. */
const SYSTEM_BLOCK_TYPES = new Set([
  "branchInfo",
  "billMeta",
  "paymentMethod",
  "itemsTable",
  "totals",
  "cashChange",
  "kitchenItems",
  "cancelItems",
  "shiftOrderSummary",
  "shiftItemBreakdown",
  "shiftCashReconciliation",
  "paymentBreakdown",
  "shiftVarianceNotice",
  "shiftSignature",
]);

const FREE_BLOCK_TYPES = ["text", "row", "divider", "spacer"] as const;

const MAX_BLOCKS = 160;

function blockLabel(type: string): string {
  return BLOCK_LABEL[type] ?? type;
}

function hasCondition(block: TemplateBlock): boolean {
  return Boolean(block.when_field);
}

export function TemplatesClient({
  templates,
  branches,
}: {
  templates: KindTemplate[];
  branches: BranchOption[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<PrintKind>(templates[0]?.kind ?? "receipt");
  const [blocksByKind, setBlocksByKind] = useState<
    Record<string, TemplateBlock[]>
  >(() => Object.fromEntries(templates.map((t) => [t.kind, t.blocks])));
  const [dirtyKinds, setDirtyKinds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, startPreview] = useTransition();
  const [actionPending, startAction] = useTransition();
  const [saveOpen, setSaveOpen] = useState(false);
  const [testBranch, setTestBranch] = useState<string>(
    branches[0] ? String(branches[0].id) : "",
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = useMemo(
    () => templates.find((t) => t.kind === kind),
    [templates, kind],
  );
  const blocks = blocksByKind[kind] ?? [];
  const saveDefaultValues = useMemo<SaveTemplateValues>(
    () => ({
      name: "",
      paperWidth: String(
        current?.paperWidth ?? 80,
      ) as SaveTemplateValues["paperWidth"],
    }),
    [current?.paperWidth],
  );

  const setBlocks = (next: TemplateBlock[]) => {
    setBlocksByKind((prev) => ({ ...prev, [kind]: next }));
    setDirtyKinds((prev) => new Set(prev).add(kind));
  };

  const patchBlock = (index: number, patch: Record<string, unknown>) => {
    setBlocks(
      blocks.map((b, i) =>
        i === index ? ({ ...b, ...patch } as TemplateBlock) : b,
      ),
    );
  };

  const moveBlock = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const removed = next.splice(index, 1)[0];
    if (!removed) return;
    next.splice(target, 0, removed);
    setBlocks(next);
  };

  const removeBlock = (index: number) => {
    setBlocks(blocks.filter((_, i) => i !== index));
  };

  const addBlock = (type: string) => {
    if (blocks.length >= MAX_BLOCKS) return;
    const base: Record<string, unknown> = { type };
    if (type === "text") base.text = "Dòng chữ mới";
    if (type === "row") {
      base.left = "Nhãn:";
      base.right = "Giá trị";
    }
    if (type === "divider") base.char = "-";
    if (type === "spacer") base.lines = 1;
    setBlocks([...blocks, base as TemplateBlock]);
  };

  const missingSystemBlocks = useMemo(() => {
    const present = new Set(blocks.map((b) => b.type));
    return DEFAULT_TEMPLATE_CONTENT[kind].blocks
      .map((b) => b.type)
      .filter(
        (type, i, all) =>
          all.indexOf(type) === i &&
          !FREE_BLOCK_TYPES.includes(type as never) &&
          !present.has(type),
      );
  }, [blocks, kind]);

  // Pixel preview — debounce edits, render server-side with the exact
  // printer rasterizer.
  const blocksJson = JSON.stringify(blocks);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startPreview(async () => {
        const result = await previewPrintTemplate({
          kind,
          content: { blocks: JSON.parse(blocksJson) },
        });
        if (result.success && result.data) {
          setPreview(result.data.png);
          setPreviewError(null);
        } else {
          setPreviewError(result.error ?? copy.previewFailed);
        }
      });
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [kind, blocksJson]);

  const handleSave = async (values: SaveTemplateValues) =>
    savePrintTemplate({
      kind,
      name: values.name,
      paper_width_mm: values.paperWidth === "58" ? 58 : 80,
      content: { blocks: JSON.parse(blocksJson) },
    });

  const handleRestore = async () => {
    const ok = await confirm({
      title: copy.restoreTitle,
      description: copy.restoreDescription(KIND_LABEL[kind]),
      confirmText: copy.restoreConfirm,
      cancelText: copy.restoreCancel,
      variant: "destructive",
    });
    if (!ok) return;

    startAction(async () => {
      const result = await restorePrintTemplateDefault(kind);
      if (result.success) {
        setBlocksByKind((prev) => ({
          ...prev,
          [kind]: DEFAULT_TEMPLATE_CONTENT[kind].blocks,
        }));
        toast.success(copy.restoredToast(KIND_LABEL[kind]));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleTestPrint = () => {
    const branchId = Number(testBranch);
    if (!Number.isFinite(branchId) || branchId <= 0) {
      toast.error(copy.testPrintMissingBranch);
      return;
    }
    startAction(async () => {
      const result = await testPrintTemplate({
        kind,
        branch_id: branchId,
        content: { blocks: JSON.parse(blocksJson) },
      });
      if (result.success) {
        toast.success(copy.testPrintSent);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={kind} onValueChange={(v) => setKind(v as PrintKind)}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {templates.map((t) => (
            <TabsTrigger key={t.kind} value={t.kind} className="gap-1.5">
              {KIND_LABEL[t.kind]}
              {dirtyKinds.has(t.kind) ? (
                <span aria-hidden className="text-warning">
                  •
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={current?.source === "custom" ? "default" : "secondary"}>
          {current?.source === "custom"
            ? copy.sourceCustom(current.versionLabel ?? "")
            : copy.sourceDefault}
        </Badge>
        {dirtyKinds.has(kind) ? (
          <Badge variant="outline">{copy.unsavedBadge}</Badge>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <AppSection
          title={copy.layoutTitle}
          description={copy.layoutDescription}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {FREE_BLOCK_TYPES.map((type) => (
              <Button
                key={type}
                type="button"
                variant="outline"
                size="sm"
                disabled={blocks.length >= MAX_BLOCKS}
                onClick={() => addBlock(type)}
              >
                + {blockLabel(type)}
              </Button>
            ))}
            {missingSystemBlocks.length > 0 ? (
              <Select value="" onValueChange={addBlock}>
                <SelectTrigger size="sm" className="w-56">
                  <SelectValue placeholder={copy.addSystemBlockPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {missingSystemBlocks.map((type) => (
                    <SelectItem key={type} value={type}>
                      {blockLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          <ItemGroup className="gap-2">
            {blocks.map((block, index) => (
              <Item key={`${block.type}-${index}`} variant="outline" size="sm">
                <ItemHeader>
                  <ItemTitle className="flex items-center gap-2">
                    {blockLabel(block.type)}
                    {SYSTEM_BLOCK_TYPES.has(block.type) ? (
                      <Badge variant="secondary">{copy.systemBadge}</Badge>
                    ) : null}
                    {hasCondition(block) ? (
                      <Badge variant="outline">{copy.conditionalBadge}</Badge>
                    ) : null}
                  </ItemTitle>
                  <ItemActions>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={copy.moveUp}
                      disabled={index === 0}
                      onClick={() => moveBlock(index, -1)}
                    >
                      <IconChevronUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={copy.moveDown}
                      disabled={index === blocks.length - 1}
                      onClick={() => moveBlock(index, 1)}
                    >
                      <IconChevronDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={copy.removeBlock}
                      onClick={() => removeBlock(index)}
                    >
                      <IconX className="size-4" />
                    </Button>
                  </ItemActions>
                </ItemHeader>
                <BlockFields
                  block={block}
                  onPatch={(patch) => patchBlock(index, patch)}
                />
              </Item>
            ))}
          </ItemGroup>
        </AppSection>

        <div className="flex flex-col gap-4">
          <AppSection
            title={copy.previewTitle}
            description={copy.previewDescription}
          >
            <Frame className="relative overflow-auto bg-muted/30 p-3">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL preview rendered server-side
                <img
                  src={preview}
                  alt={copy.previewAlt(KIND_LABEL[kind])}
                  className="mx-auto w-72 max-w-full border bg-white"
                />
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {previewError ?? copy.previewLoading}
                </p>
              )}
              {previewPending ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                  <Spinner className="size-5" />
                </div>
              ) : null}
            </Frame>
            {previewError && preview ? (
              <p className="mt-2 text-sm text-destructive">{previewError}</p>
            ) : null}
          </AppSection>

          <AppSection title={copy.actionsTitle}>
            <div className="flex flex-col gap-3">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                  <Label htmlFor="test-branch">{copy.testBranchLabel}</Label>
                  <Select value={testBranch} onValueChange={setTestBranch}>
                    <SelectTrigger id="test-branch">
                      <SelectValue placeholder={copy.testBranchPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1"
                  disabled={actionPending || !testBranch}
                  onClick={handleTestPrint}
                >
                  <IconPrinter className="size-4" />
                  {copy.testPrint}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="gap-1"
                  onClick={() => setSaveOpen(true)}
                >
                  <IconSave className="size-4" />
                  {copy.saveButton}
                </Button>
                <FormDialog
                  open={saveOpen}
                  onOpenChange={setSaveOpen}
                  schema={saveTemplateSchema}
                  defaultValues={saveDefaultValues}
                  entityKey={kind}
                  title={copy.saveTitle(KIND_LABEL[kind])}
                  description={copy.saveDescription}
                  submitLabel={copy.saveConfirm}
                  onSubmit={handleSave}
                  onSuccess={(result) => {
                    const data = result.data as
                      | { version?: number }
                      | undefined;
                    toast.success(
                      copy.savedToast(
                        KIND_LABEL[kind],
                        String(data?.version ?? "?"),
                      ),
                    );
                    setDirtyKinds((prev) => {
                      const next = new Set(prev);
                      next.delete(kind);
                      return next;
                    });
                    router.refresh();
                  }}
                  contentClassName="sm:max-w-sm"
                >
                  {(form) => (
                    <>
                      <TextField
                        control={form.control}
                        name="name"
                        label={copy.saveNameLabel}
                        placeholder={copy.saveNamePlaceholder(KIND_LABEL[kind])}
                        required
                      />
                      <SelectField
                        control={form.control}
                        name="paperWidth"
                        label={copy.paperWidthLabel}
                        options={PAPER_WIDTH_OPTIONS}
                      />
                    </>
                  )}
                </FormDialog>

                <Button
                  type="button"
                  variant="outline"
                  className="gap-1"
                  disabled={actionPending}
                  onClick={() => void handleRestore()}
                >
                  <IconRotateCcw className="size-4" />
                  {copy.restoreButton}
                </Button>
              </div>
            </div>
          </AppSection>
        </div>
      </div>
    </div>
  );
}

function BlockFields({
  block,
  onPatch,
}: {
  block: TemplateBlock;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  switch (block.type) {
    case "text":
      return (
        <ItemContent className="flex flex-col gap-2">
          <Textarea
            value={(block.text as string) ?? ""}
            onChange={(e) => onPatch({ text: e.target.value })}
            rows={2}
            maxLength={512}
          />
          <div className="flex flex-wrap items-center gap-4">
            <StyleToggles block={block} onPatch={onPatch} />
            <AlignSelect block={block} onPatch={onPatch} />
          </div>
        </ItemContent>
      );
    case "row":
      return (
        <ItemContent className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={(block.left as string) ?? ""}
              onChange={(e) => onPatch({ left: e.target.value })}
              placeholder={copy.rowLeftPlaceholder}
              maxLength={512}
            />
            <Input
              value={(block.right as string) ?? ""}
              onChange={(e) => onPatch({ right: e.target.value })}
              placeholder={copy.rowRightPlaceholder}
              maxLength={512}
            />
          </div>
          <StyleToggles block={block} onPatch={onPatch} />
        </ItemContent>
      );
    case "divider":
      return (
        <ItemContent>
          <div className="flex items-center gap-2">
            <Label className="text-muted-foreground">
              {copy.dividerCharLabel}
            </Label>
            <Input
              value={(block.char as string) ?? "-"}
              onChange={(e) => onPatch({ char: e.target.value.slice(0, 1) })}
              className="w-16 text-center"
              maxLength={1}
            />
          </div>
        </ItemContent>
      );
    case "spacer":
      return (
        <ItemContent>
          <div className="flex items-center gap-2">
            <Label className="text-muted-foreground">
              {copy.spacerLinesLabel}
            </Label>
            <FormattedNumberInput
              maxFractionDigits={0}
              allowNegative={false}
              value={String(block.lines ?? 1)}
              onValueChange={(val) => {
                const num = Number(val) || 1;
                onPatch({
                  lines: Math.max(1, Math.min(5, num)),
                });
              }}
              className="w-20"
            />
          </div>
        </ItemContent>
      );
    case "brandHeader":
      return (
        <ItemContent className="grid gap-2 sm:grid-cols-3">
          <Input
            value={(block.eyebrow as string) ?? ""}
            onChange={(e) => onPatch({ eyebrow: e.target.value })}
            placeholder={copy.brandEyebrowPlaceholder}
            maxLength={512}
          />
          <Input
            value={(block.name as string) ?? ""}
            onChange={(e) => onPatch({ name: e.target.value })}
            placeholder={copy.brandNamePlaceholder}
            maxLength={512}
          />
          <Input
            value={(block.tagline as string) ?? ""}
            onChange={(e) => onPatch({ tagline: e.target.value })}
            placeholder={copy.brandTaglinePlaceholder}
            maxLength={512}
          />
        </ItemContent>
      );
    case "note":
      return (
        <ItemContent>
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-muted-foreground">
              {copy.noteLabel}
            </Label>
            <Input
              value={(block.prefix as string) ?? "Ghi chú: "}
              onChange={(e) => onPatch({ prefix: e.target.value })}
              maxLength={512}
            />
          </div>
        </ItemContent>
      );
    case "paymentQr":
      return (
        <ItemContent>
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-muted-foreground">
              {copy.qrHeadingLabel}
            </Label>
            <Input
              value={(block.heading as string) ?? "QUÉT QR THANH TOÁN"}
              onChange={(e) => onPatch({ heading: e.target.value })}
              maxLength={512}
            />
          </div>
        </ItemContent>
      );
    case "footer": {
      const lines = Array.isArray(block.lines) ? (block.lines as string[]) : [];
      return (
        <ItemContent>
          <Textarea
            value={lines.join("\n")}
            onChange={(e) =>
              onPatch({ lines: e.target.value.split("\n").slice(0, 10) })
            }
            rows={2}
            placeholder={copy.footerPlaceholder}
          />
        </ItemContent>
      );
    }
    default:
      return (
        <ItemContent>
          <p className="text-sm text-muted-foreground">
            {copy.systemBlockHint}
          </p>
        </ItemContent>
      );
  }
}

function StyleToggles({
  block,
  onPatch,
}: {
  block: TemplateBlock;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-1.5">
        <Checkbox
          id="toggle-style-bold"
          checked={Boolean(block.bold)}
          onCheckedChange={(v) => onPatch({ bold: v === true })}
        />
        <Label
          htmlFor="toggle-style-bold"
          className="text-sm font-normal cursor-pointer"
        >
          {copy.styleBold}
        </Label>
      </div>
      <div className="flex items-center gap-1.5">
        <Checkbox
          id="toggle-style-double"
          checked={Boolean(block.double)}
          onCheckedChange={(v) => onPatch({ double: v === true })}
        />
        <Label
          htmlFor="toggle-style-double"
          className="text-sm font-normal cursor-pointer"
        >
          {copy.styleDouble}
        </Label>
      </div>
    </div>
  );
}

function AlignSelect({
  block,
  onPatch,
}: {
  block: TemplateBlock;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  return (
    <Select
      value={(block.align as string) ?? "left"}
      onValueChange={(v) => onPatch({ align: v })}
    >
      <SelectTrigger size="sm" className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="left">{copy.alignLeft}</SelectItem>
        <SelectItem value="center">{copy.alignCenter}</SelectItem>
        <SelectItem value="right">{copy.alignRight}</SelectItem>
      </SelectContent>
    </Select>
  );
}
