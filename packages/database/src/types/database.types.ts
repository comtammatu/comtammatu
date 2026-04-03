export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      branch_zones: {
        Row: {
          branch_id: number
          created_at: string
          id: number
          name: string
          sort_order: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          created_at?: string
          id?: never
          name: string
          sort_order?: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          created_at?: string
          id?: never
          name?: string
          sort_order?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_zones_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_zones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          created_at: string | null
          id: number
          is_active: boolean | null
          is_headquarters: boolean | null
          name: string
          phone: string | null
          tenant_id: number
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: never
          is_active?: boolean | null
          is_headquarters?: boolean | null
          name: string
          phone?: string | null
          tenant_id: number
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: never
          is_active?: boolean | null
          is_headquarters?: boolean | null
          name?: string
          phone?: string | null
          tenant_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: number
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: number
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_available_sides: {
        Row: {
          created_at: string
          id: number
          is_default: boolean
          main_item_id: number
          side_item_id: number
          tenant_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          is_default?: boolean
          main_item_id: number
          side_item_id: number
          tenant_id: number
        }
        Update: {
          created_at?: string
          id?: never
          is_default?: boolean
          main_item_id?: number
          side_item_id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_available_sides_main_item_id_fkey"
            columns: ["main_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_available_sides_side_item_id_fkey"
            columns: ["side_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_available_sides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_modifiers: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          item_id: number
          name: string
          price: number
          sort_order: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          item_id: number
          name: string
          price?: number
          sort_order?: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          item_id?: number
          name?: string
          price?: number
          sort_order?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_modifiers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_modifiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_variants: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          item_id: number
          name: string
          price_adjustment: number
          sort_order: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          item_id: number
          name: string
          price_adjustment?: number
          sort_order?: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          item_id?: number
          name?: string
          price_adjustment?: number
          sort_order?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_variants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          base_price: number
          category_id: number
          created_at: string
          description: string | null
          id: number
          image_url: string | null
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          base_price: number
          category_id: number
          created_at?: string
          description?: string | null
          id?: never
          image_url?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          base_price?: number
          category_id?: number
          created_at?: string
          description?: string | null
          id?: never
          image_url?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          branch_id: number | null
          created_at: string | null
          full_name: string
          id: string
          is_active: boolean | null
          phone: string | null
          role: Database["public"]["Enums"]["staff_role"]
          tenant_id: number
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          branch_id?: number | null
          created_at?: string | null
          full_name: string
          id: string
          is_active?: boolean | null
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          tenant_id: number
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          branch_id?: number | null
          created_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          tenant_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          id: number
          key: string
          tenant_id: number
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: never
          key: string
          tenant_id: number
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: never
          key?: string
          tenant_id?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          branch_id: number
          capacity: number
          created_at: string
          id: number
          number: number
          status: string
          tenant_id: number
          updated_at: string
          zone_id: number | null
        }
        Insert: {
          branch_id: number
          capacity?: number
          created_at?: string
          id?: never
          number: number
          status?: string
          tenant_id: number
          updated_at?: string
          zone_id?: number | null
        }
        Update: {
          branch_id?: number
          capacity?: number
          created_at?: string
          id?: never
          number?: number
          status?: string
          tenant_id?: number
          updated_at?: string
          zone_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tables_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "branch_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string | null
          id: number
          legal_address: string | null
          legal_name: string | null
          name: string
          representative: string | null
          settings: Json | null
          slug: string
          tax_code: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: never
          legal_address?: string | null
          legal_name?: string | null
          name: string
          representative?: string | null
          settings?: Json | null
          slug: string
          tax_code?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: never
          legal_address?: string | null
          legal_name?: string | null
          name?: string
          representative?: string | null
          settings?: Json | null
          slug?: string
          tax_code?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_update_profile:
        | {
            Args: {
              p_branch_id?: number
              p_is_active?: boolean
              p_role?: Database["public"]["Enums"]["staff_role"]
              p_target_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_branch_id?: number
              p_full_name?: string
              p_is_active?: boolean
              p_phone?: string
              p_role?: Database["public"]["Enums"]["staff_role"]
              p_target_id: string
            }
            Returns: undefined
          }
      auth_branch_id: { Args: never; Returns: number }
      auth_role: { Args: never; Returns: string }
      auth_tenant_id: { Args: never; Returns: number }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      save_item_modifiers: {
        Args: { p_item_id: number; p_modifiers: Json }
        Returns: undefined
      }
      save_item_sides: {
        Args: { p_main_item_id: number; p_sides: Json }
        Returns: undefined
      }
      save_item_variants: {
        Args: { p_item_id: number; p_variants: Json }
        Returns: undefined
      }
      set_headquarters: { Args: { p_branch_id: number }; Returns: undefined }
      toggle_category_active: { Args: { p_id: number }; Returns: boolean }
      toggle_item_active: { Args: { p_id: number }; Returns: boolean }
      toggle_profile_active: { Args: { p_target_id: string }; Returns: boolean }
      update_my_profile: {
        Args: { p_avatar_url?: string; p_full_name?: string; p_phone?: string }
        Returns: undefined
      }
    }
    Enums: {
      staff_role:
        | "owner"
        | "super_manager"
        | "area_manager"
        | "branch_manager"
        | "cashier"
        | "waiter"
        | "chef"
        | "office"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
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
} as const
