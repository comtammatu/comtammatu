export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      area_branches: {
        Row: {
          area_id: number;
          branch_id: number;
          created_at: string;
          id: number;
          tenant_id: number;
        };
        Insert: {
          area_id: number;
          branch_id: number;
          created_at?: string;
          id?: never;
          tenant_id: number;
        };
        Update: {
          area_id?: number;
          branch_id?: number;
          created_at?: string;
          id?: never;
          tenant_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "area_branches_area_id_fkey";
            columns: ["area_id"];
            isOneToOne: false;
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "area_branches_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "area_branches_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      areas: {
        Row: {
          created_at: string;
          id: number;
          is_active: boolean;
          name: string;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          is_active?: boolean;
          name: string;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          is_active?: boolean;
          name?: string;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "areas_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_records: {
        Row: {
          branch_id: number;
          check_in: string | null;
          check_out: string | null;
          created_at: string;
          date: string;
          employee_id: number;
          id: number;
          note: string | null;
          shift_id: number | null;
          status: string;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          branch_id: number;
          check_in?: string | null;
          check_out?: string | null;
          created_at?: string;
          date: string;
          employee_id: number;
          id?: never;
          note?: string | null;
          shift_id?: number | null;
          status?: string;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          branch_id?: number;
          check_in?: string | null;
          check_out?: string | null;
          created_at?: string;
          date?: string;
          employee_id?: number;
          id?: never;
          note?: string | null;
          shift_id?: number | null;
          status?: string;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_records_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      branch_ingredients: {
        Row: {
          branch_id: number;
          created_at: string;
          id: number;
          ingredient_id: number;
          tenant_id: number;
        };
        Insert: {
          branch_id: number;
          created_at?: string;
          id?: never;
          ingredient_id: number;
          tenant_id: number;
        };
        Update: {
          branch_id?: number;
          created_at?: string;
          id?: never;
          ingredient_id?: number;
          tenant_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "branch_ingredients_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branch_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branch_ingredients_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      branch_zones: {
        Row: {
          branch_id: number;
          created_at: string;
          id: number;
          name: string;
          sort_order: number;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          branch_id: number;
          created_at?: string;
          id?: never;
          name: string;
          sort_order?: number;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          branch_id?: number;
          created_at?: string;
          id?: never;
          name?: string;
          sort_order?: number;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branch_zones_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branch_zones_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      branches: {
        Row: {
          address: string | null;
          created_at: string | null;
          id: number;
          is_active: boolean | null;
          is_headquarters: boolean | null;
          name: string;
          phone: string | null;
          tenant_id: number;
          updated_at: string | null;
        };
        Insert: {
          address?: string | null;
          created_at?: string | null;
          id?: never;
          is_active?: boolean | null;
          is_headquarters?: boolean | null;
          name: string;
          phone?: string | null;
          tenant_id: number;
          updated_at?: string | null;
        };
        Update: {
          address?: string | null;
          created_at?: string | null;
          id?: never;
          is_active?: boolean | null;
          is_headquarters?: boolean | null;
          name?: string;
          phone?: string | null;
          tenant_id?: number;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      employees: {
        Row: {
          bank_account: string | null;
          bank_name: string | null;
          base_salary: number | null;
          contract_type: string | null;
          created_at: string;
          dependents_count: number;
          employee_code: string | null;
          id: number;
          id_number: string | null;
          is_active: boolean;
          profile_id: string;
          start_date: string | null;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          bank_account?: string | null;
          bank_name?: string | null;
          base_salary?: number | null;
          contract_type?: string | null;
          created_at?: string;
          dependents_count?: number;
          employee_code?: string | null;
          id?: never;
          id_number?: string | null;
          is_active?: boolean;
          profile_id: string;
          start_date?: string | null;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          bank_account?: string | null;
          bank_name?: string | null;
          base_salary?: number | null;
          contract_type?: string | null;
          created_at?: string;
          dependents_count?: number;
          employee_code?: string | null;
          id?: never;
          id_number?: string | null;
          is_active?: boolean;
          profile_id?: string;
          start_date?: string | null;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employees_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      goods_received_notes: {
        Row: {
          branch_id: number;
          created_at: string;
          created_by: string;
          grn_number: string;
          id: number;
          notes: string | null;
          po_id: number | null;
          received_by: string | null;
          received_date: string;
          status: string;
          supplier_id: number;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          branch_id: number;
          created_at?: string;
          created_by: string;
          grn_number: string;
          id?: never;
          notes?: string | null;
          po_id?: number | null;
          received_by?: string | null;
          received_date?: string;
          status?: string;
          supplier_id: number;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          branch_id?: number;
          created_at?: string;
          created_by?: string;
          grn_number?: string;
          id?: never;
          notes?: string | null;
          po_id?: number | null;
          received_by?: string | null;
          received_date?: string;
          status?: string;
          supplier_id?: number;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goods_received_notes_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goods_received_notes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goods_received_notes_po_id_fkey";
            columns: ["po_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goods_received_notes_received_by_fkey";
            columns: ["received_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goods_received_notes_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goods_received_notes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      grn_items: {
        Row: {
          batch_number: string | null;
          expiry_date: string | null;
          grn_id: number;
          id: number;
          ingredient_id: number;
          po_quantity: number | null;
          quality_status: string;
          received_quantity: number;
          rejected_quantity: number;
          rejection_reason: string | null;
          tenant_id: number;
          total_cost: number;
          unit: string;
          unit_cost: number;
        };
        Insert: {
          batch_number?: string | null;
          expiry_date?: string | null;
          grn_id: number;
          id?: never;
          ingredient_id: number;
          po_quantity?: number | null;
          quality_status?: string;
          received_quantity: number;
          rejected_quantity?: number;
          rejection_reason?: string | null;
          tenant_id: number;
          total_cost: number;
          unit: string;
          unit_cost: number;
        };
        Update: {
          batch_number?: string | null;
          expiry_date?: string | null;
          grn_id?: number;
          id?: never;
          ingredient_id?: number;
          po_quantity?: number | null;
          quality_status?: string;
          received_quantity?: number;
          rejected_quantity?: number;
          rejection_reason?: string | null;
          tenant_id?: number;
          total_cost?: number;
          unit?: string;
          unit_cost?: number;
        };
        Relationships: [
          {
            foreignKeyName: "grn_items_grn_id_fkey";
            columns: ["grn_id"];
            isOneToOne: false;
            referencedRelation: "goods_received_notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grn_items_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grn_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredients: {
        Row: {
          category: string | null;
          created_at: string;
          id: number;
          is_active: boolean;
          max_stock_level: number | null;
          min_stock_level: number;
          name: string;
          reorder_point: number | null;
          shelf_life_days: number | null;
          sku: string | null;
          storage_type: string;
          tenant_id: number;
          unit: string;
          unit_cost: number | null;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          id?: never;
          is_active?: boolean;
          max_stock_level?: number | null;
          min_stock_level?: number;
          name: string;
          reorder_point?: number | null;
          shelf_life_days?: number | null;
          sku?: string | null;
          storage_type?: string;
          tenant_id: number;
          unit: string;
          unit_cost?: number | null;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          id?: never;
          is_active?: boolean;
          max_stock_level?: number | null;
          min_stock_level?: number;
          name?: string;
          reorder_point?: number | null;
          shelf_life_days?: number | null;
          sku?: string | null;
          storage_type?: string;
          tenant_id?: number;
          unit?: string;
          unit_cost?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ingredients_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      kds_station_categories: {
        Row: {
          category_id: number;
          id: number;
          station_id: number;
          tenant_id: number;
        };
        Insert: {
          category_id: number;
          id?: never;
          station_id: number;
          tenant_id: number;
        };
        Update: {
          category_id?: number;
          id?: never;
          station_id?: number;
          tenant_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "kds_station_categories_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "menu_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kds_station_categories_station_id_fkey";
            columns: ["station_id"];
            isOneToOne: false;
            referencedRelation: "kds_stations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kds_station_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      kds_stations: {
        Row: {
          branch_id: number;
          created_at: string;
          id: number;
          is_active: boolean;
          name: string;
          position: number;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          branch_id: number;
          created_at?: string;
          id?: never;
          is_active?: boolean;
          name: string;
          position?: number;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          branch_id?: number;
          created_at?: string;
          id?: never;
          is_active?: boolean;
          name?: string;
          position?: number;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kds_stations_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kds_stations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      kds_tickets: {
        Row: {
          branch_id: number;
          bumped_at: string | null;
          bumped_by: string | null;
          created_at: string;
          id: number;
          order_id: number;
          order_item_id: number;
          station_id: number;
          status: string;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          branch_id: number;
          bumped_at?: string | null;
          bumped_by?: string | null;
          created_at?: string;
          id?: never;
          order_id: number;
          order_item_id: number;
          station_id: number;
          status?: string;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          branch_id?: number;
          bumped_at?: string | null;
          bumped_by?: string | null;
          created_at?: string;
          id?: never;
          order_id?: number;
          order_item_id?: number;
          station_id?: number;
          status?: string;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kds_tickets_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kds_tickets_bumped_by_fkey";
            columns: ["bumped_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kds_tickets_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kds_tickets_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kds_tickets_station_id_fkey";
            columns: ["station_id"];
            isOneToOne: false;
            referencedRelation: "kds_stations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kds_tickets_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_categories: {
        Row: {
          created_at: string;
          id: number;
          is_active: boolean;
          name: string;
          sort_order: number;
          tenant_id: number;
          type: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          tenant_id: number;
          type?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          tenant_id?: number;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_item_available_sides: {
        Row: {
          created_at: string;
          id: number;
          is_default: boolean;
          main_item_id: number;
          side_item_id: number;
          tenant_id: number;
        };
        Insert: {
          created_at?: string;
          id?: never;
          is_default?: boolean;
          main_item_id: number;
          side_item_id: number;
          tenant_id: number;
        };
        Update: {
          created_at?: string;
          id?: never;
          is_default?: boolean;
          main_item_id?: number;
          side_item_id?: number;
          tenant_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "menu_item_available_sides_main_item_id_fkey";
            columns: ["main_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_item_available_sides_side_item_id_fkey";
            columns: ["side_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_item_available_sides_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_item_modifiers: {
        Row: {
          created_at: string;
          id: number;
          is_active: boolean;
          item_id: number;
          name: string;
          price: number;
          sort_order: number;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          is_active?: boolean;
          item_id: number;
          name: string;
          price?: number;
          sort_order?: number;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          is_active?: boolean;
          item_id?: number;
          name?: string;
          price?: number;
          sort_order?: number;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_item_modifiers_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_item_modifiers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_item_variants: {
        Row: {
          created_at: string;
          id: number;
          is_active: boolean;
          item_id: number;
          name: string;
          price_adjustment: number;
          sort_order: number;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          is_active?: boolean;
          item_id: number;
          name: string;
          price_adjustment?: number;
          sort_order?: number;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          is_active?: boolean;
          item_id?: number;
          name?: string;
          price_adjustment?: number;
          sort_order?: number;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_item_variants_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_item_variants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_items: {
        Row: {
          base_price: number;
          category_id: number;
          created_at: string;
          description: string | null;
          id: number;
          image_url: string | null;
          is_active: boolean;
          name: string;
          sort_order: number;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          base_price: number;
          category_id: number;
          created_at?: string;
          description?: string | null;
          id?: never;
          image_url?: string | null;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          base_price?: number;
          category_id?: number;
          created_at?: string;
          description?: string | null;
          id?: never;
          image_url?: string | null;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "menu_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      order_daily_counters: {
        Row: {
          branch_id: number;
          counter_date: string;
          id: number;
          last_seq: number;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          branch_id: number;
          counter_date: string;
          id?: never;
          last_seq?: number;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          branch_id?: number;
          counter_date?: string;
          id?: never;
          last_seq?: number;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_daily_counters_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_daily_counters_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          created_at: string;
          id: number;
          item_name: string;
          menu_item_id: number;
          modifiers: Json;
          note: string | null;
          order_id: number;
          quantity: number;
          sides: Json;
          status: string;
          subtotal: number;
          tenant_id: number;
          unit_price: number;
          updated_at: string;
          variant_id: number | null;
          variant_name: string | null;
        };
        Insert: {
          created_at?: string;
          id?: never;
          item_name: string;
          menu_item_id: number;
          modifiers?: Json;
          note?: string | null;
          order_id: number;
          quantity: number;
          sides?: Json;
          status?: string;
          subtotal: number;
          tenant_id: number;
          unit_price: number;
          updated_at?: string;
          variant_id?: number | null;
          variant_name?: string | null;
        };
        Update: {
          created_at?: string;
          id?: never;
          item_name?: string;
          menu_item_id?: number;
          modifiers?: Json;
          note?: string | null;
          order_id?: number;
          quantity?: number;
          sides?: Json;
          status?: string;
          subtotal?: number;
          tenant_id?: number;
          unit_price?: number;
          updated_at?: string;
          variant_id?: number | null;
          variant_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey";
            columns: ["menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "menu_item_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      order_status_history: {
        Row: {
          changed_by: string;
          created_at: string;
          from_status: string | null;
          id: number;
          note: string | null;
          order_id: number;
          tenant_id: number;
          to_status: string;
        };
        Insert: {
          changed_by: string;
          created_at?: string;
          from_status?: string | null;
          id?: never;
          note?: string | null;
          order_id: number;
          tenant_id: number;
          to_status: string;
        };
        Update: {
          changed_by?: string;
          created_at?: string;
          from_status?: string | null;
          id?: never;
          note?: string | null;
          order_id?: number;
          tenant_id?: number;
          to_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_status_history_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          branch_id: number;
          created_at: string;
          created_by: string;
          customer_count: number;
          discount_amount: number;
          id: number;
          idempotency_key: string | null;
          note: string | null;
          order_number: string;
          order_type: string;
          payment_method: string | null;
          payment_status: string | null;
          pos_session_id: number | null;
          service_charge: number;
          status: string;
          subtotal: number;
          table_id: number | null;
          tax_amount: number;
          tenant_id: number;
          total_amount: number;
          updated_at: string;
        };
        Insert: {
          branch_id: number;
          created_at?: string;
          created_by: string;
          customer_count?: number;
          discount_amount?: number;
          id?: never;
          idempotency_key?: string | null;
          note?: string | null;
          order_number: string;
          order_type?: string;
          payment_method?: string | null;
          payment_status?: string | null;
          pos_session_id?: number | null;
          service_charge?: number;
          status?: string;
          subtotal?: number;
          table_id?: number | null;
          tax_amount?: number;
          tenant_id: number;
          total_amount?: number;
          updated_at?: string;
        };
        Update: {
          branch_id?: number;
          created_at?: string;
          created_by?: string;
          customer_count?: number;
          discount_amount?: number;
          id?: never;
          idempotency_key?: string | null;
          note?: string | null;
          order_number?: string;
          order_type?: string;
          payment_method?: string | null;
          payment_status?: string | null;
          pos_session_id?: number | null;
          service_charge?: number;
          status?: string;
          subtotal?: number;
          table_id?: number | null;
          tax_amount?: number;
          tenant_id?: number;
          total_amount?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_pos_session_id_fkey";
            columns: ["pos_session_id"];
            isOneToOne: false;
            referencedRelation: "pos_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          branch_id: number;
          created_at: string;
          created_by: string;
          id: number;
          method: string;
          order_id: number;
          paid_at: string | null;
          provider_data: Json | null;
          provider_ref: string | null;
          status: string;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          amount: number;
          branch_id: number;
          created_at?: string;
          created_by: string;
          id?: never;
          method: string;
          order_id: number;
          paid_at?: string | null;
          provider_data?: Json | null;
          provider_ref?: string | null;
          status?: string;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          branch_id?: number;
          created_at?: string;
          created_by?: string;
          id?: never;
          method?: string;
          order_id?: number;
          paid_at?: string | null;
          provider_data?: Json | null;
          provider_ref?: string | null;
          status?: string;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      pos_sessions: {
        Row: {
          branch_id: number;
          cash_difference: number | null;
          closed_at: string | null;
          closed_by: string | null;
          closing_cash: number | null;
          created_at: string;
          expected_cash: number | null;
          id: number;
          note: string | null;
          opened_at: string;
          opened_by: string;
          opening_cash: number;
          status: string;
          tenant_id: number;
          terminal_id: number;
          updated_at: string;
        };
        Insert: {
          branch_id: number;
          cash_difference?: number | null;
          closed_at?: string | null;
          closed_by?: string | null;
          closing_cash?: number | null;
          created_at?: string;
          expected_cash?: number | null;
          id?: never;
          note?: string | null;
          opened_at?: string;
          opened_by: string;
          opening_cash?: number;
          status?: string;
          tenant_id: number;
          terminal_id: number;
          updated_at?: string;
        };
        Update: {
          branch_id?: number;
          cash_difference?: number | null;
          closed_at?: string | null;
          closed_by?: string | null;
          closing_cash?: number | null;
          created_at?: string;
          expected_cash?: number | null;
          id?: never;
          note?: string | null;
          opened_at?: string;
          opened_by?: string;
          opening_cash?: number;
          status?: string;
          tenant_id?: number;
          terminal_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pos_sessions_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pos_sessions_closed_by_fkey";
            columns: ["closed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pos_sessions_opened_by_fkey";
            columns: ["opened_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pos_sessions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pos_sessions_terminal_id_fkey";
            columns: ["terminal_id"];
            isOneToOne: false;
            referencedRelation: "pos_terminals";
            referencedColumns: ["id"];
          },
        ];
      };
      pos_terminals: {
        Row: {
          branch_id: number;
          created_at: string;
          device_id: string | null;
          id: number;
          is_active: boolean;
          name: string;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          branch_id: number;
          created_at?: string;
          device_id?: string | null;
          id?: never;
          is_active?: boolean;
          name: string;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          branch_id?: number;
          created_at?: string;
          device_id?: string | null;
          id?: never;
          is_active?: boolean;
          name?: string;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pos_terminals_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pos_terminals_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      printer_configs: {
        Row: {
          branch_id: number;
          connection_type: string;
          created_at: string;
          id: number;
          ip_address: string | null;
          is_active: boolean;
          is_default: boolean;
          name: string;
          paper_width: number;
          port: number | null;
          tenant_id: number;
          type: string;
          updated_at: string;
        };
        Insert: {
          branch_id: number;
          connection_type: string;
          created_at?: string;
          id?: never;
          ip_address?: string | null;
          is_active?: boolean;
          is_default?: boolean;
          name: string;
          paper_width?: number;
          port?: number | null;
          tenant_id: number;
          type: string;
          updated_at?: string;
        };
        Update: {
          branch_id?: number;
          connection_type?: string;
          created_at?: string;
          id?: never;
          ip_address?: string | null;
          is_active?: boolean;
          is_default?: boolean;
          name?: string;
          paper_width?: number;
          port?: number | null;
          tenant_id?: number;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "printer_configs_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "printer_configs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          area_id: number | null;
          avatar_url: string | null;
          branch_id: number | null;
          created_at: string | null;
          full_name: string;
          id: string;
          is_active: boolean | null;
          phone: string | null;
          role: Database["public"]["Enums"]["staff_role"];
          tenant_id: number;
          updated_at: string | null;
        };
        Insert: {
          area_id?: number | null;
          avatar_url?: string | null;
          branch_id?: number | null;
          created_at?: string | null;
          full_name: string;
          id: string;
          is_active?: boolean | null;
          phone?: string | null;
          role?: Database["public"]["Enums"]["staff_role"];
          tenant_id: number;
          updated_at?: string | null;
        };
        Update: {
          area_id?: number | null;
          avatar_url?: string | null;
          branch_id?: number | null;
          created_at?: string | null;
          full_name?: string;
          id?: string;
          is_active?: boolean | null;
          phone?: string | null;
          role?: Database["public"]["Enums"]["staff_role"];
          tenant_id?: number;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_area_id_fkey";
            columns: ["area_id"];
            isOneToOne: false;
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_order_items: {
        Row: {
          id: number;
          ingredient_id: number;
          line_total: number | null;
          po_id: number;
          quantity: number;
          tenant_id: number;
          unit: string;
          unit_price_est: number | null;
        };
        Insert: {
          id?: never;
          ingredient_id: number;
          line_total?: number | null;
          po_id: number;
          quantity: number;
          tenant_id: number;
          unit: string;
          unit_price_est?: number | null;
        };
        Update: {
          id?: never;
          ingredient_id?: number;
          line_total?: number | null;
          po_id?: number;
          quantity?: number;
          tenant_id?: number;
          unit?: string;
          unit_price_est?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_order_items_po_id_fkey";
            columns: ["po_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_order_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_orders: {
        Row: {
          branch_id: number;
          created_at: string;
          created_by: string;
          id: number;
          notes: string | null;
          ordered_at: string;
          po_number: string;
          status: string;
          supplier_id: number;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          branch_id: number;
          created_at?: string;
          created_by: string;
          id?: never;
          notes?: string | null;
          ordered_at?: string;
          po_number: string;
          status?: string;
          supplier_id: number;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          branch_id?: number;
          created_at?: string;
          created_by?: string;
          id?: never;
          notes?: string | null;
          ordered_at?: string;
          po_number?: string;
          status?: string;
          supplier_id?: number;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_orders_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      recipes: {
        Row: {
          created_at: string;
          id: number;
          ingredient_id: number;
          menu_item_id: number;
          note: string | null;
          quantity: number;
          tenant_id: number;
          unit: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          ingredient_id: number;
          menu_item_id: number;
          note?: string | null;
          quantity: number;
          tenant_id: number;
          unit: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          ingredient_id?: number;
          menu_item_id?: number;
          note?: string | null;
          quantity?: number;
          tenant_id?: number;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipes_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipes_menu_item_id_fkey";
            columns: ["menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      shift_assignments: {
        Row: {
          branch_id: number;
          created_at: string;
          date: string;
          employee_id: number;
          id: number;
          shift_id: number;
          tenant_id: number;
        };
        Insert: {
          branch_id: number;
          created_at?: string;
          date: string;
          employee_id: number;
          id?: never;
          shift_id: number;
          tenant_id: number;
        };
        Update: {
          branch_id?: number;
          created_at?: string;
          date?: string;
          employee_id?: number;
          id?: never;
          shift_id?: number;
          tenant_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "shift_assignments_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_assignments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      shifts: {
        Row: {
          branch_id: number;
          created_at: string;
          end_time: string;
          id: number;
          is_active: boolean;
          name: string;
          start_time: string;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          branch_id: number;
          created_at?: string;
          end_time: string;
          id?: never;
          is_active?: boolean;
          name: string;
          start_time: string;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          branch_id?: number;
          created_at?: string;
          end_time?: string;
          id?: never;
          is_active?: boolean;
          name?: string;
          start_time?: string;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shifts_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shifts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_levels: {
        Row: {
          avg_unit_cost: number | null;
          branch_id: number;
          current_quantity: number;
          id: number;
          ingredient_id: number;
          last_counted_at: string | null;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          avg_unit_cost?: number | null;
          branch_id: number;
          current_quantity?: number;
          id?: never;
          ingredient_id: number;
          last_counted_at?: string | null;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          avg_unit_cost?: number | null;
          branch_id?: number;
          current_quantity?: number;
          id?: never;
          ingredient_id?: number;
          last_counted_at?: string | null;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_levels_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_levels_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_levels_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_movements: {
        Row: {
          branch_id: number;
          created_at: string;
          created_by: string;
          grn_id: number | null;
          id: number;
          ingredient_id: number;
          order_id: number | null;
          quantity_change: number;
          reason: string | null;
          tenant_id: number;
          transfer_id: number | null;
          type: string;
          unit_cost: number | null;
        };
        Insert: {
          branch_id: number;
          created_at?: string;
          created_by: string;
          grn_id?: number | null;
          id?: never;
          ingredient_id: number;
          order_id?: number | null;
          quantity_change: number;
          reason?: string | null;
          tenant_id: number;
          transfer_id?: number | null;
          type: string;
          unit_cost?: number | null;
        };
        Update: {
          branch_id?: number;
          created_at?: string;
          created_by?: string;
          grn_id?: number | null;
          id?: never;
          ingredient_id?: number;
          order_id?: number | null;
          quantity_change?: number;
          reason?: string | null;
          tenant_id?: number;
          transfer_id?: number | null;
          type?: string;
          unit_cost?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_grn_id_fkey";
            columns: ["grn_id"];
            isOneToOne: false;
            referencedRelation: "goods_received_notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_transfer_id_fkey";
            columns: ["transfer_id"];
            isOneToOne: false;
            referencedRelation: "stock_transfers";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_transfer_items: {
        Row: {
          id: number;
          ingredient_id: number;
          quantity: number;
          quantity_received: number | null;
          tenant_id: number;
          transfer_id: number;
          unit: string;
          unit_cost_at_ship: number | null;
        };
        Insert: {
          id?: never;
          ingredient_id: number;
          quantity: number;
          quantity_received?: number | null;
          tenant_id: number;
          transfer_id: number;
          unit: string;
          unit_cost_at_ship?: number | null;
        };
        Update: {
          id?: never;
          ingredient_id?: number;
          quantity?: number;
          quantity_received?: number | null;
          tenant_id?: number;
          transfer_id?: number;
          unit?: string;
          unit_cost_at_ship?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_transfer_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey";
            columns: ["transfer_id"];
            isOneToOne: false;
            referencedRelation: "stock_transfers";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_transfers: {
        Row: {
          created_at: string;
          created_by: string;
          from_branch_id: number;
          id: number;
          notes: string | null;
          receive_started_at: string | null;
          received_at: string | null;
          shipped_at: string | null;
          status: string;
          tenant_id: number;
          to_branch_id: number;
          transfer_number: string;
          updated_at: string;
          vehicle_info: string | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          from_branch_id: number;
          id?: never;
          notes?: string | null;
          receive_started_at?: string | null;
          received_at?: string | null;
          shipped_at?: string | null;
          status?: string;
          tenant_id: number;
          to_branch_id: number;
          transfer_number: string;
          updated_at?: string;
          vehicle_info?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          from_branch_id?: number;
          id?: never;
          notes?: string | null;
          receive_started_at?: string | null;
          received_at?: string | null;
          shipped_at?: string | null;
          status?: string;
          tenant_id?: number;
          to_branch_id?: number;
          transfer_number?: string;
          updated_at?: string;
          vehicle_info?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_transfers_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_transfers_from_branch_id_fkey";
            columns: ["from_branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_transfers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_transfers_to_branch_id_fkey";
            columns: ["to_branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      supplier_invoices: {
        Row: {
          created_at: string;
          created_by: string;
          grn_id: number | null;
          id: number;
          invoice_date: string;
          invoice_number: string;
          matching_notes: string | null;
          matching_status: string;
          po_id: number | null;
          subtotal: number;
          supplier_id: number;
          tenant_id: number;
          total_amount: number;
          updated_at: string;
          vat_amount: number;
          vat_rate: number;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          grn_id?: number | null;
          id?: never;
          invoice_date: string;
          invoice_number: string;
          matching_notes?: string | null;
          matching_status?: string;
          po_id?: number | null;
          subtotal: number;
          supplier_id: number;
          tenant_id: number;
          total_amount: number;
          updated_at?: string;
          vat_amount: number;
          vat_rate?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          grn_id?: number | null;
          id?: never;
          invoice_date?: string;
          invoice_number?: string;
          matching_notes?: string | null;
          matching_status?: string;
          po_id?: number | null;
          subtotal?: number;
          supplier_id?: number;
          tenant_id?: number;
          total_amount?: number;
          updated_at?: string;
          vat_amount?: number;
          vat_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_invoices_grn_id_fkey";
            columns: ["grn_id"];
            isOneToOne: false;
            referencedRelation: "goods_received_notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_invoices_po_id_fkey";
            columns: ["po_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_invoices_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          address: string | null;
          created_at: string;
          id: number;
          is_active: boolean;
          name: string;
          notes: string | null;
          phone: string | null;
          tax_code: string | null;
          tenant_id: number;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          id?: never;
          is_active?: boolean;
          name: string;
          notes?: string | null;
          phone?: string | null;
          tax_code?: string | null;
          tenant_id: number;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          id?: never;
          is_active?: boolean;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          tax_code?: string | null;
          tenant_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      system_settings: {
        Row: {
          created_at: string;
          description: string | null;
          id: number;
          key: string;
          tenant_id: number;
          updated_at: string;
          value: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: never;
          key: string;
          tenant_id: number;
          updated_at?: string;
          value: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: never;
          key?: string;
          tenant_id?: number;
          updated_at?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "system_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tables: {
        Row: {
          branch_id: number;
          capacity: number;
          created_at: string;
          id: number;
          number: number;
          status: string;
          tenant_id: number;
          updated_at: string;
          zone_id: number | null;
        };
        Insert: {
          branch_id: number;
          capacity?: number;
          created_at?: string;
          id?: never;
          number: number;
          status?: string;
          tenant_id: number;
          updated_at?: string;
          zone_id?: number | null;
        };
        Update: {
          branch_id?: number;
          capacity?: number;
          created_at?: string;
          id?: never;
          number?: number;
          status?: string;
          tenant_id?: number;
          updated_at?: string;
          zone_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "tables_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tables_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tables_zone_id_fkey";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "branch_zones";
            referencedColumns: ["id"];
          },
        ];
      };
      tax_invoices: {
        Row: {
          branch_id: number;
          buyer_address: string | null;
          buyer_name: string | null;
          buyer_tax_code: string | null;
          cancelled_at: string | null;
          created_at: string;
          created_by: string;
          id: number;
          invoice_number: string | null;
          issued_at: string | null;
          order_id: number;
          provider: string;
          provider_data: Json | null;
          provider_ref: string | null;
          replaced_by: number | null;
          status: string;
          subtotal: number;
          tenant_id: number;
          total_amount: number;
          updated_at: string;
          vat_amount: number;
          vat_rate: number;
        };
        Insert: {
          branch_id: number;
          buyer_address?: string | null;
          buyer_name?: string | null;
          buyer_tax_code?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          created_by: string;
          id?: never;
          invoice_number?: string | null;
          issued_at?: string | null;
          order_id: number;
          provider?: string;
          provider_data?: Json | null;
          provider_ref?: string | null;
          replaced_by?: number | null;
          status?: string;
          subtotal: number;
          tenant_id: number;
          total_amount: number;
          updated_at?: string;
          vat_amount: number;
          vat_rate?: number;
        };
        Update: {
          branch_id?: number;
          buyer_address?: string | null;
          buyer_name?: string | null;
          buyer_tax_code?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          created_by?: string;
          id?: never;
          invoice_number?: string | null;
          issued_at?: string | null;
          order_id?: number;
          provider?: string;
          provider_data?: Json | null;
          provider_ref?: string | null;
          replaced_by?: number | null;
          status?: string;
          subtotal?: number;
          tenant_id?: number;
          total_amount?: number;
          updated_at?: string;
          vat_amount?: number;
          vat_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tax_invoices_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tax_invoices_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tax_invoices_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tax_invoices_replaced_by_fkey";
            columns: ["replaced_by"];
            isOneToOne: false;
            referencedRelation: "tax_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tax_invoices_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          created_at: string | null;
          id: number;
          legal_address: string | null;
          legal_name: string | null;
          name: string;
          representative: string | null;
          settings: Json | null;
          slug: string;
          tax_code: string | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: never;
          legal_address?: string | null;
          legal_name?: string | null;
          name: string;
          representative?: string | null;
          settings?: Json | null;
          slug: string;
          tax_code?: string | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: never;
          legal_address?: string | null;
          legal_name?: string | null;
          name?: string;
          representative?: string | null;
          settings?: Json | null;
          slug?: string;
          tax_code?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      mv_daily_revenue: {
        Row: {
          branch_id: number | null;
          cash_revenue: number | null;
          date: string | null;
          momo_revenue: number | null;
          order_count: number | null;
          tenant_id: number | null;
          total_revenue: number | null;
          total_tax: number | null;
          vietqr_revenue: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      mv_top_items: {
        Row: {
          branch_id: number | null;
          item_name: string | null;
          menu_item_id: number | null;
          period_end: string | null;
          period_start: string | null;
          quantity_sold: number | null;
          revenue: number | null;
          tenant_id: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey";
            columns: ["menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      admin_update_profile:
        | {
            Args: {
              p_branch_id?: number;
              p_full_name?: string;
              p_phone?: string;
              p_role?: string;
              p_target_id: string;
            };
            Returns: undefined;
          }
        | {
            Args: {
              p_branch_id?: number;
              p_full_name?: string;
              p_is_active?: boolean;
              p_phone?: string;
              p_role?: Database["public"]["Enums"]["staff_role"];
              p_target_id: string;
            };
            Returns: undefined;
          };
      append_order_items: {
        Args: { p_items: Json; p_order_id: number };
        Returns: Json;
      };
      auth_area_id: { Args: never; Returns: number };
      auth_branch_id: { Args: never; Returns: number };
      auth_role: { Args: never; Returns: string };
      auth_tenant_id: { Args: never; Returns: number };
      bump_kds_ticket: { Args: { p_ticket_id: number }; Returns: string };
      cancel_order: {
        Args: { p_order_id: number; p_reason: string };
        Returns: Json;
      };
      check_order_ready: { Args: { p_order_id: number }; Returns: undefined };
      close_pos_session: {
        Args: { p_closing_cash: number; p_note?: string; p_session_id: number };
        Returns: Json;
      };
      confirm_goods_receipt_note: { Args: { p_grn_id: number }; Returns: Json };
      consume_stock_for_order: { Args: { p_order_id: number }; Returns: Json };
      create_order: {
        Args: {
          p_branch_id: number;
          p_created_by: string;
          p_customer_count?: number;
          p_idempotency_key?: string;
          p_items: Json;
          p_note?: string;
          p_order_type?: string;
          p_pos_session_id?: number;
          p_table_id?: number;
          p_tenant_id: number;
        };
        Returns: Json;
      };
      create_payment: {
        Args: {
          p_amount: number;
          p_branch_id: number;
          p_created_by: string;
          p_method: string;
          p_order_id: number;
          p_provider_ref?: string;
          p_status?: string;
          p_tenant_id: number;
        };
        Returns: Json;
      };
      custom_access_token_hook: { Args: { event: Json }; Returns: Json };
      recall_kds_ticket: { Args: { p_ticket_id: number }; Returns: string };
      recompute_supplier_invoice_matching: {
        Args: { p_invoice_id: number };
        Returns: Json;
      };
      release_table: { Args: { p_table_id: number }; Returns: undefined };
      route_order_to_kds: { Args: { p_order_id: number }; Returns: undefined };
      save_item_modifiers: {
        Args: { p_item_id: number; p_modifiers: Json };
        Returns: undefined;
      };
      save_item_sides: {
        Args: { p_main_item_id: number; p_sides: Json };
        Returns: undefined;
      };
      save_item_variants: {
        Args: { p_item_id: number; p_variants: Json };
        Returns: undefined;
      };
      save_station_categories: {
        Args: { p_category_ids: number[]; p_station_id: number };
        Returns: undefined;
      };
      set_headquarters: { Args: { p_branch_id: number }; Returns: undefined };
      stock_transfer_confirm_receive: {
        Args: { p_transfer_id: number };
        Returns: Json;
      };
      stock_transfer_confirm_ship: {
        Args: { p_transfer_id: number };
        Returns: Json;
      };
      stock_transfer_list_branches: {
        Args: never;
        Returns: {
          id: number;
          is_active: boolean;
          is_headquarters: boolean;
          name: string;
        }[];
      };
      stock_transfer_mark_in_transit: {
        Args: { p_transfer_id: number };
        Returns: Json;
      };
      stock_transfer_receive: {
        Args: { p_items?: Json; p_transfer_id: number };
        Returns: Json;
      };
      toggle_category_active: { Args: { p_id: number }; Returns: boolean };
      toggle_item_active: { Args: { p_id: number }; Returns: boolean };
      toggle_profile_active: {
        Args: { p_target_id: string };
        Returns: boolean;
      };
      transfer_order_table: {
        Args: { p_new_table_id: number; p_order_id: number };
        Returns: Json;
      };
      transition_order_item_status: {
        Args: {
          p_expected_status: string;
          p_item_id: number;
          p_new_status: string;
        };
        Returns: Json;
      };
      transition_order_status: {
        Args: {
          p_expected_status: string;
          p_new_status: string;
          p_note?: string;
          p_order_id: number;
        };
        Returns: Json;
      };
      update_my_profile: {
        Args: { p_avatar_url?: string; p_full_name?: string; p_phone?: string };
        Returns: undefined;
      };
      update_pos_order_status: {
        Args: { p_new_status: string; p_order_id: number };
        Returns: Json;
      };
      void_order_item: {
        Args: { p_order_item_id: number; p_reason: string };
        Returns: Json;
      };
    };
    Enums: {
      staff_role:
        | "owner"
        | "super_manager"
        | "area_manager"
        | "branch_manager"
        | "cashier"
        | "waiter"
        | "chef"
        | "office";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      staff_role: [
        "owner",
        "super_manager",
        "area_manager",
        "branch_manager",
        "cashier",
        "waiter",
        "chef",
        "office",
      ],
    },
  },
} as const;
