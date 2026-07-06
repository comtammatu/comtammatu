import type { Database, SupabaseClient } from "@comtammatu/database";

export type TenantSupabase = SupabaseClient<Database>;

export interface IngredientUnitRow {
  id: number;
  unit_id: number;
  unit_code: string;
  unit_name?: string | null;
  to_base_factor: number;
  is_base: boolean;
  anchor_unit_id?: number | null;
  anchor_factor?: number | null;
  is_active: boolean;
  allow_purchase: boolean;
  allow_issue: boolean;
  allow_production: boolean;
  sort_order: number;
}

export interface IngredientRow {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  purchase_unit: string;
  measure_unit: string;
  purchase_to_measure_factor: number;
  category: string | null;
  category_id: number | null;
  category_name?: string | null;
  item_kind: string;
  unit_cost: number | null;
  min_stock_level: number | null;
  max_stock_level: number | null;
  reorder_point: number | null;
  storage_type: string | null;
  is_active: boolean;
  updated_at: string | null;
  units?: IngredientUnitRow[];
}

export interface UnitOption {
  id: number;
  code: string;
  name: string;
  dimension: "mass" | "volume" | null;
  is_standard: boolean;
  standard_factor: number | null;
}

export interface CategoryOption {
  id: number;
  name: string;
  tone_class: string | null;
}

export interface BranchOption {
  id: number;
  name: string;
  is_active: boolean;
  branch_kind?: string | null;
}

export interface ReorderAlertRow {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  current_quantity: number;
  reorder_point: number;
  max_stock_level: number | null;
  suggested_order_qty: number;
  branch_id: number;
  branch_name: string;
}
