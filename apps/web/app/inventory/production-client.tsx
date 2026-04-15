"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  CheckCircle2,
  CircleSlash,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { cn } from "@comtammatu/ui";
import { toast } from "@comtammatu/ui/components/sonner";
import { EmptyStatePanel as EmptyState } from "@/components/v2/patterns";
import { SectionCard } from "@/components/v2/patterns";
import { createIngredient } from "./actions";
import {
  cancelProductionOrder,
  confirmProductionOrder,
  createProductionOrder,
  deleteProductionRecipeGroup,
  deleteProductionRecipe,
  upsertProductionRecipe,
  type ProductionOrderRow,
  type ProductionRecipeRow,
} from "./production-actions";

type BranchOption = {
  id: number;
  name: string;
};

type IngredientOption = {
  id: number;
  name: string;
  unit: string;
  item_kind: string;
};

type FinishedGoodOption = {
  id: number;
  name: string;
  unit: string;
};

type RawIngredientOption = {
  id: number;
  name: string;
  unit: string;
};

interface ProductionHubClientProps {
  branchKindSchemaAvailable: boolean;
  centralKitchenBranches: BranchOption[];
  ingredients: IngredientOption[];
  finishedGoods: FinishedGoodOption[];
  orders: ProductionOrderRow[];
  recipes: ProductionRecipeRow[];
}

type DraftLine = {
  finishedGoodId: number;
  quantity: string;
  unit: string;
};

type ProductionRecipeGroup = {
  finishedGoodId: number;
  finishedGoodName: string;
  lines: ProductionRecipeRow[];
};

type QuickFinishedGoodDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (good: FinishedGoodOption) => void;
};

type QuickRawIngredientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (ingredient: RawIngredientOption) => void;
};

function sortFinishedGoods(items: FinishedGoodOption[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

function sortRawIngredients(items: RawIngredientOption[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

function QuickFinishedGoodDialog({
  open,
  onOpenChange,
  onCreated,
}: QuickFinishedGoodDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("Bếp trung tâm");
  const [storageType, setStorageType] = useState("ambient");

  useEffect(() => {
    if (open) return;
    setError(null);
    setName("");
    setUnit("");
    setCategory("Bếp trung tâm");
    setStorageType("ambient");
  }, [open]);

  function handleSubmit() {
    startTransition(async () => {
      setError(null);
      const trimmedName = name.trim();
      const trimmedUnit = unit.trim();
      const trimmedCategory = category.trim();

      const result = await createIngredient({
        name: trimmedName,
        unit: trimmedUnit,
        category: trimmedCategory || undefined,
        item_kind: "finished_good",
        storage_type: storageType as "ambient" | "refrigerated" | "frozen",
        min_stock_level: 0,
      });

      if (!result.success) {
        setError(result.error ?? "Không thể tạo thành phẩm");
        return;
      }

      const createdId = Number(
        (result.data as { id?: number | string } | null)?.id,
      );

      if (!Number.isFinite(createdId) || createdId <= 0) {
        setError("Đã tạo thành phẩm nhưng không đọc được mã mới.");
        return;
      }

      onCreated({
        id: createdId,
        name: trimmedName,
        unit: trimmedUnit,
      });
      toast.success("Đã thêm thành phẩm mới");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm thành phẩm mới</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Danh sách trong BOM sản xuất lấy từ danh mục nguyên liệu có loại
            <strong> Thành phẩm</strong>. Tạo mới ở đây để dùng ngay cho công
            thức.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quickFinishedGoodName">Tên thành phẩm</Label>
              <Input
                id="quickFinishedGoodName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Sườn nướng sơ chế"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickFinishedGoodUnit">Đơn vị</Label>
              <Input
                id="quickFinishedGoodUnit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="khay, kg, lít..."
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quickFinishedGoodCategory">Danh mục</Label>
              <Input
                id="quickFinishedGoodCategory"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Bếp trung tâm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickFinishedGoodStorage">Kiểu lưu trữ</Label>
              <Select value={storageType} onValueChange={setStorageType}>
                <SelectTrigger id="quickFinishedGoodStorage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ambient">Thường</SelectItem>
                  <SelectItem value="refrigerated">Lạnh</SelectItem>
                  <SelectItem value="frozen">Đông lạnh</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              isPending || name.trim().length === 0 || unit.trim().length === 0
            }
          >
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Tạo thành phẩm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickRawIngredientDialog({
  open,
  onOpenChange,
  onCreated,
}: QuickRawIngredientDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("Nguyên liệu sản xuất");
  const [storageType, setStorageType] = useState("ambient");

  useEffect(() => {
    if (open) return;
    setError(null);
    setName("");
    setUnit("");
    setCategory("Nguyên liệu sản xuất");
    setStorageType("ambient");
  }, [open]);

  function handleSubmit() {
    startTransition(async () => {
      setError(null);
      const trimmedName = name.trim();
      const trimmedUnit = unit.trim();
      const trimmedCategory = category.trim();

      const result = await createIngredient({
        name: trimmedName,
        unit: trimmedUnit,
        category: trimmedCategory || undefined,
        item_kind: "raw_material",
        storage_type: storageType as "ambient" | "refrigerated" | "frozen",
        min_stock_level: 0,
      });

      if (!result.success) {
        setError(result.error ?? "Không thể tạo nguyên liệu");
        return;
      }

      const createdId = Number(
        (result.data as { id?: number | string } | null)?.id,
      );

      if (!Number.isFinite(createdId) || createdId <= 0) {
        setError("Đã tạo nguyên liệu nhưng không đọc được mã mới.");
        return;
      }

      onCreated({
        id: createdId,
        name: trimmedName,
        unit: trimmedUnit,
      });
      toast.success("Đã thêm nguyên liệu mới");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm nguyên liệu mới</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Dòng BOM chỉ nhận các bản ghi loại <strong>Nguyên liệu</strong>. Tạo
            mới ở đây để bổ sung đầu vào ngay trong lúc lập công thức.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quickRawIngredientName">Tên nguyên liệu</Label>
              <Input
                id="quickRawIngredientName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Sườn cốt lết"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickRawIngredientUnit">Đơn vị</Label>
              <Input
                id="quickRawIngredientUnit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="kg, g, lít..."
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quickRawIngredientCategory">Danh mục</Label>
              <Input
                id="quickRawIngredientCategory"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Nguyên liệu sản xuất"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickRawIngredientStorage">Kiểu lưu trữ</Label>
              <Select value={storageType} onValueChange={setStorageType}>
                <SelectTrigger id="quickRawIngredientStorage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ambient">Thường</SelectItem>
                  <SelectItem value="refrigerated">Lạnh</SelectItem>
                  <SelectItem value="frozen">Đông lạnh</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              isPending || name.trim().length === 0 || unit.trim().length === 0
            }
          >
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Tạo nguyên liệu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function defaultProductionNumber() {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PRD-${stamp}-${suffix}`;
}

function orderStatusLabel(status: string) {
  if (status === "draft") return "Nháp";
  if (status === "completed") return "Đã hoàn tất";
  if (status === "cancelled") return "Đã hủy";
  return status;
}

function orderStatusTone(
  status: string,
): "neutral" | "warning" | "success" | "danger" {
  if (status === "completed") return "success";
  if (status === "cancelled") return "danger";
  return "warning";
}

function badgeVariantFromTone(
  tone: "neutral" | "warning" | "success" | "danger",
) {
  if (tone === "success") return "success" as const;
  if (tone === "warning") return "warning" as const;
  if (tone === "danger") return "destructive" as const;
  return "secondary" as const;
}

export function ProductionHubClient({
  branchKindSchemaAvailable,
  centralKitchenBranches,
  ingredients,
  finishedGoods,
  orders,
  recipes,
}: ProductionHubClientProps) {
  const router = useRouter();
  const [finishedGoodsOptions, setFinishedGoodsOptions] = useState<
    FinishedGoodOption[]
  >(() => sortFinishedGoods(finishedGoods));
  const [rawIngredientsOptions, setRawIngredientsOptions] = useState<
    RawIngredientOption[]
  >(() =>
    sortRawIngredients(
      ingredients
        .filter((ingredient) => ingredient.item_kind === "raw_material")
        .map((ingredient) => ({
          id: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
        })),
    ),
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [quickFinishedGoodDialogOpen, setQuickFinishedGoodDialogOpen] =
    useState(false);
  const [quickRawIngredientDialogOpen, setQuickRawIngredientDialogOpen] =
    useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState(
    centralKitchenBranches[0]?.id ? String(centralKitchenBranches[0].id) : "",
  );
  const [productionNumber, setProductionNumber] = useState(
    defaultProductionNumber(),
  );
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    {
      finishedGoodId: finishedGoods[0]?.id ?? 0,
      quantity: "1",
      unit: finishedGoods[0]?.unit ?? "",
    },
  ]);
  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const [editingRecipe, setEditingRecipe] =
    useState<ProductionRecipeRow | null>(null);
  const [recipeGroupToDelete, setRecipeGroupToDelete] =
    useState<ProductionRecipeGroup | null>(null);
  const [recipeFinishedGoodId, setRecipeFinishedGoodId] = useState(
    finishedGoodsOptions[0]?.id ? String(finishedGoodsOptions[0].id) : "",
  );
  const [recipeIngredientId, setRecipeIngredientId] = useState("");
  const [recipeQuantity, setRecipeQuantity] = useState("1");
  const [recipeUnit, setRecipeUnit] = useState("");
  const [recipeYieldFactor, setRecipeYieldFactor] = useState("1");
  const [recipeNote, setRecipeNote] = useState("");

  useEffect(() => {
    setFinishedGoodsOptions(sortFinishedGoods(finishedGoods));
  }, [finishedGoods]);

  useEffect(() => {
    setRawIngredientsOptions(
      sortRawIngredients(
        ingredients
          .filter((ingredient) => ingredient.item_kind === "raw_material")
          .map((ingredient) => ({
            id: ingredient.id,
            name: ingredient.name,
            unit: ingredient.unit,
          })),
      ),
    );
  }, [ingredients]);

  useEffect(() => {
    if (!isDialogOpen) return;
    if (!branchId && centralKitchenBranches[0]) {
      setBranchId(String(centralKitchenBranches[0].id));
    }
    if (lines.length === 0 && finishedGoodsOptions[0]) {
      setLines([
        {
          finishedGoodId: finishedGoodsOptions[0].id,
          quantity: "1",
          unit: finishedGoodsOptions[0].unit,
        },
      ]);
    }
  }, [
    branchId,
    centralKitchenBranches,
    finishedGoodsOptions,
    isDialogOpen,
    lines.length,
  ]);

  const totals = useMemo(() => {
    const draft = orders.filter((order) => order.status === "draft").length;
    const completed = orders.filter(
      (order) => order.status === "completed",
    ).length;
    const cancelled = orders.filter(
      (order) => order.status === "cancelled",
    ).length;
    return { draft, completed, cancelled };
  }, [orders]);

  const groupedRecipes = useMemo<ProductionRecipeGroup[]>(() => {
    const groups = new Map<number, ProductionRecipeGroup>();

    for (const recipe of recipes) {
      const current = groups.get(recipe.finished_good_id);

      if (current) {
        current.lines.push(recipe);
        continue;
      }

      groups.set(recipe.finished_good_id, {
        finishedGoodId: recipe.finished_good_id,
        finishedGoodName: recipe.finished_good_name,
        lines: [recipe],
      });
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.finishedGoodName.localeCompare(b.finishedGoodName, "vi"),
    );
  }, [recipes]);
  const readinessMessage = !branchKindSchemaAvailable
    ? "Màn Bếp trung tâm đang chờ migration `branch_kind`, nên tất cả thao tác tạo/sửa/xác nhận lệnh hiện bị khóa."
    : centralKitchenBranches.length === 0
      ? "Chưa có bếp trung tâm nào được cấu hình."
      : finishedGoodsOptions.length === 0
        ? "Chưa có thành phẩm nào được gắn `item_kind = finished_good`, nên chưa thể tạo lệnh sản xuất."
        : rawIngredientsOptions.length === 0
          ? "Chưa có nguyên liệu nào được gắn `item_kind = raw_material`, nên chưa thể lập công thức."
          : null;
  const actionsEnabled =
    branchKindSchemaAvailable &&
    centralKitchenBranches.length > 0 &&
    finishedGoodsOptions.length > 0 &&
    rawIngredientsOptions.length > 0;

  function handleFinishedGoodCreated(good: FinishedGoodOption) {
    setFinishedGoodsOptions((prev) => {
      if (prev.some((item) => item.id === good.id)) {
        return prev;
      }
      return sortFinishedGoods([...prev, good]);
    });
    setRecipeFinishedGoodId(String(good.id));
    setLines((prev) => {
      if (prev.length === 0) {
        return [
          {
            finishedGoodId: good.id,
            quantity: "1",
            unit: good.unit,
          },
        ];
      }

      return prev.map((line, index) =>
        index === prev.length - 1
          ? {
              ...line,
              finishedGoodId: good.id,
              unit: good.unit,
            }
          : line,
      );
    });
    router.refresh();
  }

  function handleRawIngredientCreated(ingredient: RawIngredientOption) {
    setRawIngredientsOptions((prev) => {
      if (prev.some((item) => item.id === ingredient.id)) {
        return prev;
      }
      return sortRawIngredients([...prev, ingredient]);
    });
    setRecipeIngredientId(String(ingredient.id));
    setRecipeUnit(ingredient.unit);
    router.refresh();
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    const fallback = finishedGoodsOptions[0];
    setLines((prev) => [
      ...prev,
      {
        finishedGoodId: fallback?.id ?? 0,
        quantity: "1",
        unit: fallback?.unit ?? "",
      },
    ]);
  }

  function removeLine(index: number) {
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    );
  }

  function resetDialog() {
    setCreateError(null);
    setProductionNumber(defaultProductionNumber());
    setNotes("");
    setLines([
      {
        finishedGoodId: finishedGoodsOptions[0]?.id ?? 0,
        quantity: "1",
        unit: finishedGoodsOptions[0]?.unit ?? "",
      },
    ]);
    if (centralKitchenBranches[0]) {
      setBranchId(String(centralKitchenBranches[0].id));
    }
  }

  function resetRecipeForm() {
    setRecipeError(null);
    setEditingRecipe(null);
    setRecipeFinishedGoodId(
      finishedGoodsOptions[0]?.id ? String(finishedGoodsOptions[0].id) : "",
    );
    setRecipeIngredientId("");
    setRecipeQuantity("1");
    setRecipeUnit("");
    setRecipeYieldFactor("1");
    setRecipeNote("");
  }

  function openRecipeDialog(finishedGoodId?: number) {
    setRecipeError(null);
    setEditingRecipe(null);
    setRecipeFinishedGoodId(
      finishedGoodId != null
        ? String(finishedGoodId)
        : finishedGoodsOptions[0]?.id
          ? String(finishedGoodsOptions[0].id)
          : "",
    );
    setRecipeIngredientId("");
    setRecipeQuantity("1");
    setRecipeUnit("");
    setRecipeYieldFactor("1");
    setRecipeNote("");
    setRecipeDialogOpen(true);
  }

  useEffect(() => {
    if (!editingRecipe) return;
    setRecipeFinishedGoodId(String(editingRecipe.finished_good_id));
    setRecipeIngredientId(String(editingRecipe.ingredient_id));
    setRecipeQuantity(String(editingRecipe.quantity));
    setRecipeUnit(editingRecipe.unit);
    setRecipeYieldFactor(String(editingRecipe.yield_factor));
    setRecipeNote(editingRecipe.note ?? "");
    setRecipeDialogOpen(true);
  }, [editingRecipe]);

  function handleCreate() {
    const parsedBranchId = Number(branchId);
    const payloadLines = lines
      .map((line) => ({
        finishedGoodId: line.finishedGoodId,
        quantity: Number(line.quantity),
        unit: line.unit.trim(),
      }))
      .filter(
        (line) =>
          Number.isFinite(line.finishedGoodId) &&
          line.finishedGoodId > 0 &&
          Number.isFinite(line.quantity) &&
          line.quantity > 0 &&
          line.unit.length > 0,
      );

    if (payloadLines.length === 0) {
      setCreateError("Cần ít nhất một thành phẩm hợp lệ.");
      return;
    }

    startTransition(async () => {
      setCreateError(null);
      const result = await createProductionOrder({
        branchId: parsedBranchId,
        productionNumber: productionNumber.trim(),
        notes: notes.trim() || undefined,
        items: payloadLines,
      });
      if (!result.success) {
        setCreateError(result.error ?? "Không thể tạo lệnh sản xuất");
        return;
      }
      toast.success("Đã tạo lệnh sản xuất");
      setIsDialogOpen(false);
      resetDialog();
      router.refresh();
    });
  }

  function handleRecipeSubmit() {
    const parsedFinishedGoodId = Number(recipeFinishedGoodId);
    const parsedIngredientId = Number(recipeIngredientId);
    const parsedQuantity = Number(recipeQuantity);
    const parsedYieldFactor = Number(recipeYieldFactor);

    startTransition(async () => {
      setRecipeError(null);
      const result = await upsertProductionRecipe({
        finishedGoodId: parsedFinishedGoodId,
        ingredientId: parsedIngredientId,
        quantity: parsedQuantity,
        unit: recipeUnit.trim(),
        yieldFactor: parsedYieldFactor,
        note: recipeNote.trim() || undefined,
      });
      if (!result.success) {
        setRecipeError(result.error ?? "Không thể lưu công thức");
        return;
      }
      toast.success("Đã lưu công thức");
      setRecipeDialogOpen(false);
      resetRecipeForm();
      router.refresh();
    });
  }

  function handleRecipeDelete(recipeId: number) {
    startTransition(async () => {
      const result = await deleteProductionRecipe(recipeId);
      if (!result.success) {
        toast.error(result.error ?? "Không thể xóa công thức");
        return;
      }
      toast.success("Đã xóa công thức");
      router.refresh();
    });
  }

  function handleRecipeGroupDelete() {
    if (!recipeGroupToDelete) return;

    startTransition(async () => {
      const result = await deleteProductionRecipeGroup(
        recipeGroupToDelete.finishedGoodId,
      );
      if (!result.success) {
        toast.error(result.error ?? "Không thể xóa công thức cũ");
        return;
      }
      toast.success("Đã xóa toàn bộ công thức cũ của thành phẩm");
      setRecipeGroupToDelete(null);
      router.refresh();
    });
  }

  function handleConfirm(orderId: number) {
    startTransition(async () => {
      const result = await confirmProductionOrder(orderId);
      if (!result.success) {
        toast.error(result.error ?? "Không thể xác nhận");
        return;
      }
      toast.success("Đã xác nhận lệnh sản xuất");
      router.refresh();
    });
  }

  function handleCancel(orderId: number) {
    startTransition(async () => {
      const result = await cancelProductionOrder(orderId);
      if (!result.success) {
        toast.error(result.error ?? "Không thể hủy");
        return;
      }
      toast.success("Đã hủy lệnh sản xuất");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {readinessMessage && (
        <SectionCard
          className="rounded-lg border-warning/20 bg-warning/10"
          density="compact"
        >
          {readinessMessage}
        </SectionCard>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Lệnh nháp
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {totals.draft}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Đã hoàn tất
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {totals.completed}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Đã hủy
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {totals.cancelled}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
        <div className="text-sm text-muted-foreground">
          {centralKitchenBranches.length > 0
            ? `Có ${centralKitchenBranches.length} bếp trung tâm đang hoạt động`
            : branchKindSchemaAvailable
              ? "Chưa có bếp trung tâm nào được cấu hình"
              : "Chưa thể đọc danh sách bếp trung tâm vì thiếu migration"}
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetDialog();
          }}
        >
          <DialogTrigger asChild>
            <Button disabled={!actionsEnabled}>
              <Plus className="mr-2 size-4" />
              Tạo lệnh sản xuất
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-screen overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Tạo lệnh sản xuất</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="productionNumber">Số lệnh</Label>
                  <Input
                    id="productionNumber"
                    value={productionNumber}
                    onChange={(e) => setProductionNumber(e.target.value)}
                    placeholder="PRD-20260414-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branchId">Bếp trung tâm</Label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger id="branchId">
                      <SelectValue placeholder="Chọn bếp trung tâm" />
                    </SelectTrigger>
                    <SelectContent>
                      {centralKitchenBranches.map((branch) => (
                        <SelectItem key={branch.id} value={String(branch.id)}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Ghi chú</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú lô sản xuất, ca làm việc, yêu cầu đóng gói..."
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Thành phẩm</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLine}
                  >
                    Thêm dòng
                  </Button>
                </div>

                <div className="space-y-3">
                  {lines.map((line, index) => (
                    <div
                      key={`${index}-${line.finishedGoodId}`}
                      className="grid gap-3 md:grid-cols-[1fr_120px_120px_auto]"
                    >
                      <Select
                        value={String(line.finishedGoodId)}
                        onValueChange={(value) => {
                          const option = finishedGoodsOptions.find(
                            (g) => g.id === Number(value),
                          );
                          updateLine(index, {
                            finishedGoodId: Number(value),
                            unit: option?.unit ?? line.unit,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn thành phẩm" />
                        </SelectTrigger>
                        <SelectContent>
                          {finishedGoodsOptions.map((good) => (
                            <SelectItem key={good.id} value={String(good.id)}>
                              {good.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        step={0.001}
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(index, { quantity: e.target.value })
                        }
                        placeholder="Số lượng"
                      />
                      <Input
                        value={line.unit}
                        onChange={(e) =>
                          updateLine(index, { unit: e.target.value })
                        }
                        placeholder="ĐVT"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(index)}
                        disabled={lines.length === 1}
                        className="self-start"
                      >
                        <CircleSlash className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {createError && (
                <p className="text-sm text-destructive" role="alert">
                  {createError}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isPending}
              >
                Hủy
              </Button>
              <Button
                type="button"
                onClick={handleCreate}
                disabled={isPending || !actionsEnabled}
              >
                {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Tạo lệnh
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <SectionCard className="overflow-hidden rounded-lg" density="compact">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Số lệnh</TableHead>
              <TableHead>Bếp trung tâm</TableHead>
              <TableHead>Thành phẩm</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Tổng chi phí</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  Chưa có lệnh sản xuất nào
                </TableCell>
              </TableRow>
            )}
            {orders.map((order) => (
              <TableRow
                key={order.id}
                className={cn(isPending ? "opacity-70" : "")}
              >
                <TableCell className="font-medium">
                  <div>{order.production_number}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString("vi-VN")}
                  </div>
                </TableCell>
                <TableCell>{order.branch_name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {order.items.map((item) => (
                      <Badge
                        key={item.id}
                        variant={badgeVariantFromTone("neutral")}
                        className="px-2 py-1 text-xs"
                      >
                        {item.finished_good_name} x {item.quantity} {item.unit}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={badgeVariantFromTone(
                      orderStatusTone(order.status),
                    )}
                  >
                    {orderStatusLabel(order.status)}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {order.total_cost.toLocaleString("vi-VN")} ₫
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    {order.status === "draft" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleConfirm(order.id)}
                          disabled={isPending || !branchKindSchemaAvailable}
                        >
                          <CheckCircle2 className="mr-2 size-4" />
                          Xác nhận
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancel(order.id)}
                          disabled={isPending || !branchKindSchemaAvailable}
                        >
                          Hủy
                        </Button>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Công thức sản xuất</h3>
            <p className="text-sm text-muted-foreground">
              Mỗi thành phẩm có thể gồm nhiều nguyên liệu. Mỗi lần lưu là một
              dòng nguyên liệu trong BOM của thành phẩm đó.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => openRecipeDialog()}
            disabled={
              !branchKindSchemaAvailable || finishedGoodsOptions.length === 0
            }
          >
            <Plus className="mr-2 size-4" />
            Thêm dòng BOM
          </Button>
        </div>

        <Dialog
          open={recipeDialogOpen}
          onOpenChange={(open) => {
            setRecipeDialogOpen(open);
            if (!open) resetRecipeForm();
          }}
        >
          <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingRecipe
                  ? "Chỉnh sửa dòng nguyên liệu"
                  : "Thêm dòng nguyên liệu"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Một thành phẩm có thể có nhiều dòng nguyên liệu. Mỗi dòng bên
                dưới tương ứng với một nguyên liệu trong BOM sản xuất.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="recipeFinishedGood">Thành phẩm</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setQuickFinishedGoodDialogOpen(true)}
                      disabled={!branchKindSchemaAvailable}
                    >
                      <Plus className="mr-2 size-4" />
                      Tạo thành phẩm
                    </Button>
                  </div>
                  <Select
                    value={recipeFinishedGoodId}
                    onValueChange={setRecipeFinishedGoodId}
                    disabled={editingRecipe != null}
                  >
                    <SelectTrigger id="recipeFinishedGood">
                      <SelectValue placeholder="Chọn thành phẩm" />
                    </SelectTrigger>
                    <SelectContent>
                      {finishedGoodsOptions.map((good) => (
                        <SelectItem key={good.id} value={String(good.id)}>
                          {good.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Nếu chưa thấy món cần lập BOM, tạo thêm một bản ghi loại
                    <strong> Thành phẩm</strong> ngay tại đây.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="recipeIngredient">Nguyên liệu</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setQuickRawIngredientDialogOpen(true)}
                      disabled={!branchKindSchemaAvailable}
                    >
                      <Plus className="mr-2 size-4" />
                      Tạo nguyên liệu
                    </Button>
                  </div>
                  <Select
                    value={recipeIngredientId}
                    onValueChange={(value) => {
                      setRecipeIngredientId(value);
                      const ing = rawIngredientsOptions.find(
                        (item) => item.id === Number(value),
                      );
                      if (ing) setRecipeUnit(ing.unit);
                    }}
                    disabled={editingRecipe != null}
                  >
                    <SelectTrigger id="recipeIngredient">
                      <SelectValue placeholder="Chọn nguyên liệu" />
                    </SelectTrigger>
                    <SelectContent>
                      {rawIngredientsOptions.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!editingRecipe && (
                    <p className="text-xs text-muted-foreground">
                      Nếu thiếu nguyên liệu đầu vào, tạo mới ngay tại đây rồi
                      chọn lại dòng BOM.
                    </p>
                  )}
                  {editingRecipe && (
                    <p className="text-xs text-muted-foreground">
                      Muốn đổi thành phẩm hoặc nguyên liệu, hãy xóa dòng cũ và
                      tạo dòng mới để tránh ghi đè sai BOM.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="recipeQuantity">Số lượng</Label>
                  <Input
                    id="recipeQuantity"
                    type="number"
                    min={0}
                    step={0.001}
                    value={recipeQuantity}
                    onChange={(e) => setRecipeQuantity(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recipeUnit">Đơn vị</Label>
                  <Input
                    id="recipeUnit"
                    value={recipeUnit}
                    onChange={(e) => setRecipeUnit(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recipeYieldFactor">Yield</Label>
                  <Input
                    id="recipeYieldFactor"
                    type="number"
                    min={0}
                    step={0.001}
                    value={recipeYieldFactor}
                    onChange={(e) => setRecipeYieldFactor(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recipeNote">Ghi chú</Label>
                <Textarea
                  id="recipeNote"
                  value={recipeNote}
                  onChange={(e) => setRecipeNote(e.target.value)}
                  placeholder="Tỷ lệ ước tính, lưu ý hao hụt..."
                />
              </div>

              {recipeError && (
                <p className="text-sm text-destructive" role="alert">
                  {recipeError}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRecipeDialogOpen(false)}
                disabled={isPending}
              >
                Hủy
              </Button>
              <Button
                type="button"
                onClick={handleRecipeSubmit}
                disabled={isPending}
              >
                {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Lưu dòng BOM
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <QuickFinishedGoodDialog
          open={quickFinishedGoodDialogOpen}
          onOpenChange={setQuickFinishedGoodDialogOpen}
          onCreated={handleFinishedGoodCreated}
        />
        <QuickRawIngredientDialog
          open={quickRawIngredientDialogOpen}
          onOpenChange={setQuickRawIngredientDialogOpen}
          onCreated={handleRawIngredientCreated}
        />
        <AlertDialog
          open={recipeGroupToDelete != null}
          onOpenChange={(open) => {
            if (!open) setRecipeGroupToDelete(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa toàn bộ BOM?</AlertDialogTitle>
              <AlertDialogDescription>
                {recipeGroupToDelete
                  ? `Thao tác này sẽ xóa toàn bộ ${recipeGroupToDelete.lines.length} dòng BOM của "${recipeGroupToDelete.finishedGoodName}".`
                  : "Thao tác này sẽ xóa toàn bộ BOM của thành phẩm đã chọn."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Hủy</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRecipeGroupDelete}
                disabled={isPending}
              >
                {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Xóa toàn bộ BOM
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {groupedRecipes.length === 0 ? (
          <EmptyState
            title="Chưa có BOM nào"
            description="Hãy thêm ít nhất một dòng nguyên liệu để bắt đầu cấu hình công thức cho thành phẩm."
            className="min-h-40 border border-dashed"
          />
        ) : (
          <div className="space-y-4">
            {groupedRecipes.map((group) => (
              <SectionCard
                key={group.finishedGoodId}
                className="group/recipe overflow-hidden rounded-lg"
                density="compact"
              >
                <div
                  className={cn(
                    "-m-4 flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3 transition-colors md:-m-5 md:px-5",
                    "group-hover/recipe:bg-muted/35 group-focus-within/recipe:bg-muted/35",
                  )}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold">
                        {group.finishedGoodName}
                      </h4>
                      <Badge variant={badgeVariantFromTone("neutral")}>
                        {group.lines.length} nguyên liệu
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Mỗi dòng bên dưới là một nguyên liệu cấu thành thành phẩm
                      này.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openRecipeDialog(group.finishedGoodId)}
                      disabled={!branchKindSchemaAvailable}
                    >
                      <Plus className="mr-2 size-4" />
                      Thêm nguyên liệu
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setRecipeGroupToDelete(group)}
                      disabled={!branchKindSchemaAvailable}
                      className={cn(
                        "transition-opacity md:opacity-0 md:group-hover/recipe:opacity-100 md:group-focus-within/recipe:opacity-100",
                        "md:pointer-events-none md:group-hover/recipe:pointer-events-auto md:group-focus-within/recipe:pointer-events-auto",
                      )}
                    >
                      <Trash2 className="mr-2 size-4" />
                      Xóa toàn bộ BOM
                    </Button>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nguyên liệu</TableHead>
                      <TableHead>Số lượng</TableHead>
                      <TableHead>Yield</TableHead>
                      <TableHead>Ghi chú</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.lines.map((recipe) => (
                      <TableRow key={recipe.id}>
                        <TableCell>
                          <div className="font-medium">
                            {recipe.ingredient_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {recipe.unit}
                          </div>
                        </TableCell>
                        <TableCell>
                          {recipe.quantity} {recipe.unit}
                        </TableCell>
                        <TableCell>{recipe.yield_factor}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {recipe.note ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingRecipe(recipe)}
                              disabled={!branchKindSchemaAvailable}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRecipeDelete(recipe.id)}
                              disabled={!branchKindSchemaAvailable}
                              aria-label={`Xóa dòng BOM ${recipe.ingredient_name}`}
                              title="Xóa dòng BOM"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </SectionCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
