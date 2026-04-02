/**
 * Supabase generated types — manually maintained until `pnpm db:types` is wired to a live project.
 * Reflects all migrations applied as of Sprint 1.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: number;
          name: string;
          slug: string;
          legal_name: string | null;
          tax_code: string | null;
          legal_address: string | null;
          representative: string | null;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          name: string;
          slug: string;
          legal_name?: string | null;
          tax_code?: string | null;
          legal_address?: string | null;
          representative?: string | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          name?: string;
          slug?: string;
          legal_name?: string | null;
          tax_code?: string | null;
          legal_address?: string | null;
          representative?: string | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      branches: {
        Row: {
          id: number;
          tenant_id: number;
          name: string;
          address: string | null;
          phone: string | null;
          is_active: boolean;
          is_headquarters: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          name: string;
          address?: string | null;
          phone?: string | null;
          is_active?: boolean;
          is_headquarters?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          name?: string;
          address?: string | null;
          phone?: string | null;
          is_active?: boolean;
          is_headquarters?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          tenant_id: number;
          branch_id: number | null;
          role: "owner" | "super_manager" | "area_manager" | "branch_manager" | "cashier" | "waiter" | "chef" | "office";
          full_name: string;
          phone: string | null;
          avatar_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          tenant_id: number;
          branch_id?: number | null;
          role?: "owner" | "super_manager" | "area_manager" | "branch_manager" | "cashier" | "waiter" | "chef" | "office";
          full_name: string;
          phone?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: number;
          branch_id?: number | null;
          role?: "owner" | "super_manager" | "area_manager" | "branch_manager" | "cashier" | "waiter" | "chef" | "office";
          full_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      system_settings: {
        Row: {
          id: number;
          tenant_id: number;
          key: string;
          value: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          key: string;
          value?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          key?: string;
          value?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "system_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      branch_zones: {
        Row: {
          id: number;
          tenant_id: number;
          branch_id: number;
          name: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          branch_id: number;
          name: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          branch_id?: number;
          name?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branch_zones_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branch_zones_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      tables: {
        Row: {
          id: number;
          tenant_id: number;
          branch_id: number;
          zone_id: number | null;
          name: string;
          capacity: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          branch_id: number;
          zone_id?: number | null;
          name: string;
          capacity?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          branch_id?: number;
          zone_id?: number | null;
          name?: string;
          capacity?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tables_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tables_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tables_zone_id_fkey";
            columns: ["zone_id"];
            referencedRelation: "branch_zones";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_categories: {
        Row: {
          id: number;
          tenant_id: number;
          name: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          name: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          name?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_items: {
        Row: {
          id: number;
          tenant_id: number;
          category_id: number;
          name: string;
          description: string | null;
          base_price: number;
          image_url: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          category_id: number;
          name: string;
          description?: string | null;
          base_price?: number;
          image_url?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          category_id?: number;
          name?: string;
          description?: string | null;
          base_price?: number;
          image_url?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_items_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_items_category_id_fkey";
            columns: ["category_id"];
            referencedRelation: "menu_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_item_variants: {
        Row: {
          id: number;
          tenant_id: number;
          menu_item_id: number;
          name: string;
          price_adjustment: number;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          menu_item_id: number;
          name: string;
          price_adjustment?: number;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          menu_item_id?: number;
          name?: string;
          price_adjustment?: number;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_item_variants_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_item_variants_menu_item_id_fkey";
            columns: ["menu_item_id"];
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_item_modifiers: {
        Row: {
          id: number;
          tenant_id: number;
          menu_item_id: number;
          name: string;
          price: number;
          is_default: boolean;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          menu_item_id: number;
          name: string;
          price?: number;
          is_default?: boolean;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          menu_item_id?: number;
          name?: string;
          price?: number;
          is_default?: boolean;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_item_modifiers_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_item_modifiers_menu_item_id_fkey";
            columns: ["menu_item_id"];
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_item_available_sides: {
        Row: {
          id: number;
          tenant_id: number;
          menu_item_id: number;
          side_item_id: number;
          created_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          menu_item_id: number;
          side_item_id: number;
          created_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          menu_item_id?: number;
          side_item_id?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_item_available_sides_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_item_available_sides_menu_item_id_fkey";
            columns: ["menu_item_id"];
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_item_available_sides_side_item_id_fkey";
            columns: ["side_item_id"];
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      admin_update_profile: {
        Args: {
          p_target_id: string;
          p_role?: "owner" | "super_manager" | "area_manager" | "branch_manager" | "cashier" | "waiter" | "chef" | "office" | null;
          p_branch_id?: number | null;
          p_is_active?: boolean | null;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
