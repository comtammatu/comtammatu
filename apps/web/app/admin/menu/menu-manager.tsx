"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, UtensilsCrossed, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent, CardHeader } from "@comtammatu/ui/components/card";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@comtammatu/ui/components/alert-dialog";
import { formatVND } from "@comtammatu/shared/format";
import type { Category, MenuItem } from "./actions";
import {
  deleteCategory,
  deleteMenuItem,
  getMenuItems,
} from "./actions";
import { CategoryForm } from "./category-form";
import { MenuItemForm } from "./menu-item-form";
import { ItemDetailPanel } from "./item-detail-panel";

interface Props {
  initialCategories: Category[];
  initialItems: MenuItem[];
}

export function MenuManager({ initialCategories, initialItems }: Props) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [items, setItems] = useState<MenuItem[]>(initialItems);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredItems = selectedCategoryId
    ? items.filter((item) => item.category_id === selectedCategoryId)
    : items;

  function handleCategoryCreated(cat: Category) {
    setCategories((prev) => [...prev, cat]);
    setCategoryFormOpen(false);
    setEditingCategory(null);
  }

  function handleCategoryUpdated(cat: Category) {
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? cat : c)));
    setCategoryFormOpen(false);
    setEditingCategory(null);
  }

  function handleDeleteCategory(id: number) {
    startTransition(async () => {
      const result = await deleteCategory(id);
      if (!result.success) {
        toast.error(result.error ?? "Không thể xóa danh mục");
        return;
      }
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setItems((prev) => prev.filter((i) => i.category_id !== id));
      if (selectedCategoryId === id) setSelectedCategoryId(null);
      toast.success("Đã xóa danh mục");
    });
  }

  function handleItemCreated(item: MenuItem) {
    setItems((prev) => [...prev, item]);
    setItemFormOpen(false);
    setEditingItem(null);
  }

  function handleItemUpdated(item: MenuItem) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    setItemFormOpen(false);
    setEditingItem(null);
  }

  function handleDeleteItem(id: number) {
    startTransition(async () => {
      const result = await deleteMenuItem(id);
      if (!result.success) {
        toast.error(result.error ?? "Không thể xóa món ăn");
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (detailItem?.id === id) setDetailItem(null);
      toast.success("Đã xóa món ăn");
    });
  }

  async function handleSelectCategory(id: number | null) {
    setSelectedCategoryId(id);
    if (id !== null) {
      const result = await getMenuItems(id);
      if (result.success && result.data) {
        // Merge: keep items not in this category, replace with fresh ones for this category
        setItems((prev) => [
          ...prev.filter((i) => i.category_id !== id),
          ...result.data!,
        ]);
      }
    }
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-12rem)]">
      {/* Left sidebar: categories */}
      <div className="w-64 flex-shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Danh mục
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => {
              setEditingCategory(null);
              setCategoryFormOpen(true);
            }}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-1 pr-2">
            <button
              type="button"
              onClick={() => handleSelectCategory(null)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selectedCategoryId === null
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              Tất cả ({items.length})
            </button>
            {categories.map((cat) => (
              <div
                key={cat.id}
                className={`group flex items-center justify-between px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                  selectedCategoryId === cat.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
                onClick={() => handleSelectCategory(cat.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{cat.name}</span>
                  {!cat.is_active && (
                    <Badge variant="secondary" className="text-xs shrink-0">
                      Ẩn
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    type="button"
                    className="p-0.5 rounded hover:bg-black/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCategory(cat);
                      setCategoryFormOpen(true);
                    }}
                  >
                    <Pencil className="size-3" />
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="p-0.5 rounded hover:bg-black/10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Xóa danh mục?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Thao tác này sẽ xóa danh mục &ldquo;{cat.name}&rdquo; và tất cả các món ăn trong danh mục. Không thể hoàn tác.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Hủy</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Xóa
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main content: items */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {filteredItems.length} món ăn
            {selectedCategoryId
              ? ` trong "${categories.find((c) => c.id === selectedCategoryId)?.name ?? ""}"`
              : ""}
          </span>
          <Button
            size="sm"
            onClick={() => {
              setEditingItem(null);
              setItemFormOpen(true);
            }}
          >
            <Plus className="size-4 mr-1.5" />
            Thêm món
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <UtensilsCrossed className="size-12 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">Chưa có món ăn nào</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  setEditingItem(null);
                  setItemFormOpen(true);
                }}
              >
                Thêm món đầu tiên
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 pr-2">
              {filteredItems.map((item) => (
                <Card
                  key={item.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setDetailItem(item)}
                >
                  <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-lg font-bold text-primary">
                        {formatVND(item.base_price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!item.is_active && (
                        <Badge variant="secondary" className="text-xs">Ẩn</Badge>
                      )}
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-muted"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingItem(item);
                          setItemFormOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-muted"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Xóa món ăn?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Xóa &ldquo;{item.name}&rdquo;? Thao tác không thể hoàn tác.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Hủy</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteItem(item.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Xóa
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {item.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                        {item.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {categories.find((c) => c.id === item.category_id)?.name ?? ""}
                      </span>
                      <ChevronRight className="size-3.5" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Dialogs & Sheet */}
      <CategoryForm
        open={categoryFormOpen}
        onOpenChange={(open) => {
          setCategoryFormOpen(open);
          if (!open) setEditingCategory(null);
        }}
        category={editingCategory}
        onCreated={handleCategoryCreated}
        onUpdated={handleCategoryUpdated}
      />

      <MenuItemForm
        open={itemFormOpen}
        onOpenChange={(open) => {
          setItemFormOpen(open);
          if (!open) setEditingItem(null);
        }}
        item={editingItem}
        categories={categories}
        defaultCategoryId={selectedCategoryId ?? undefined}
        onCreated={handleItemCreated}
        onUpdated={handleItemUpdated}
      />

      {detailItem && (
        <ItemDetailPanel
          item={detailItem}
          items={items}
          open={!!detailItem}
          onOpenChange={(open) => {
            if (!open) setDetailItem(null);
          }}
          onItemUpdated={(updated) => {
            setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
            setDetailItem(updated);
          }}
        />
      )}
    </div>
  );
}
