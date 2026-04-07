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
  public: {
    Tables: {
      area_branches: {
        Row: {
          id: number;
          tenant_id: number;
          area_id: number;
          branch_id: number;
          created_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          area_id: number;
          branch_id: number;
          created_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          area_id?: number;
          branch_id?: number;
          created_at?: string;
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
          id: number;
          tenant_id: number;
          name: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          name: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          name?: string;
          is_active?: boolean;
          created_at?: string;
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
      kds_station_categories: {
        Row: {
          id: number;
          tenant_id: number;
          station_id: number;
          category_id: number;
          created_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          station_id: number;
          category_id: number;
          created_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          station_id?: number;
          category_id?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kds_station_categories_station_id_fkey";
            columns: ["station_id"];
            isOneToOne: false;
            referencedRelation: "kds_stations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kds_station_categories_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "menu_categories";
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
          id: number;
          tenant_id: number;
          branch_id: number;
          name: string;
          position: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          branch_id: number;
          name: string;
          position?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          branch_id?: number;
          name?: string;
          position?: number;
          is_active?: boolean;
          created_at?: string;
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
      payments: {
        Row: {
          id: number;
          tenant_id: number;
          branch_id: number;
          order_id: number;
          method: string;
          amount: number;
          status: string;
          provider_ref: string | null;
          provider_data: Json | null;
          paid_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          branch_id: number;
          order_id: number;
          method: string;
          amount: number;
          status?: string;
          provider_ref?: string | null;
          provider_data?: Json | null;
          paid_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          branch_id?: number;
          order_id?: number;
          method?: string;
          amount?: number;
          status?: string;
          provider_ref?: string | null;
          provider_data?: Json | null;
          paid_at?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ingredients: {
        Row: {
          id: number;
          tenant_id: number;
          name: string;
          sku: string | null;
          unit: string;
          unit_cost: number | null;
          category: string | null;
          min_stock_level: number;
          max_stock_level: number | null;
          reorder_point: number | null;
          storage_type: string;
          shelf_life_days: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          name: string;
          sku?: string | null;
          unit: string;
          unit_cost?: number | null;
          category?: string | null;
          min_stock_level?: number;
          max_stock_level?: number | null;
          reorder_point?: number | null;
          storage_type?: string;
          shelf_life_days?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          name?: string;
          sku?: string | null;
          unit?: string;
          unit_cost?: number | null;
          category?: string | null;
          min_stock_level?: number;
          max_stock_level?: number | null;
          reorder_point?: number | null;
          storage_type?: string;
          shelf_life_days?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stock_levels: {
        Row: {
          id: number;
          tenant_id: number;
          branch_id: number;
          ingredient_id: number;
          current_quantity: number;
          last_counted_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          branch_id: number;
          ingredient_id: number;
          current_quantity?: number;
          last_counted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          branch_id?: number;
          ingredient_id?: number;
          current_quantity?: number;
          last_counted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          id: number;
          tenant_id: number;
          branch_id: number;
          ingredient_id: number;
          type: string;
          quantity_change: number;
          reason: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          branch_id: number;
          ingredient_id: number;
          type: string;
          quantity_change: number;
          reason?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          branch_id?: number;
          ingredient_id?: number;
          type?: string;
          quantity_change?: number;
          reason?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      employees: {
        Row: {
          id: number;
          tenant_id: number;
          profile_id: string;
          employee_code: string | null;
          id_number: string | null;
          bank_account: string | null;
          bank_name: string | null;
          base_salary: number | null;
          start_date: string | null;
          contract_type: string | null;
          dependents_count: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          profile_id: string;
          employee_code?: string | null;
          id_number?: string | null;
          bank_account?: string | null;
          bank_name?: string | null;
          base_salary?: number | null;
          start_date?: string | null;
          contract_type?: string | null;
          dependents_count?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          profile_id?: string;
          employee_code?: string | null;
          id_number?: string | null;
          bank_account?: string | null;
          bank_name?: string | null;
          base_salary?: number | null;
          start_date?: string | null;
          contract_type?: string | null;
          dependents_count?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shifts: {
        Row: {
          id: number;
          tenant_id: number;
          branch_id: number;
          name: string;
          start_time: string;
          end_time: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          branch_id: number;
          name: string;
          start_time: string;
          end_time: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          branch_id?: number;
          name?: string;
          start_time?: string;
          end_time?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shift_assignments: {
        Row: {
          id: number;
          tenant_id: number;
          branch_id: number;
          employee_id: number;
          shift_id: number;
          date: string;
          created_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          branch_id: number;
          employee_id: number;
          shift_id: number;
          date: string;
          created_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          branch_id?: number;
          employee_id?: number;
          shift_id?: number;
          date?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      attendance_records: {
        Row: {
          id: number;
          tenant_id: number;
          branch_id: number;
          employee_id: number;
          shift_id: number | null;
          date: string;
          check_in: string | null;
          check_out: string | null;
          status: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          branch_id: number;
          employee_id: number;
          shift_id?: number | null;
          date: string;
          check_in?: string | null;
          check_out?: string | null;
          status?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          branch_id?: number;
          employee_id?: number;
          shift_id?: number | null;
          date?: string;
          check_in?: string | null;
          check_out?: string | null;
          status?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tax_invoices: {
        Row: {
          id: number;
          tenant_id: number;
          branch_id: number;
          order_id: number;
          invoice_number: string | null;
          status: string;
          buyer_name: string | null;
          buyer_tax_code: string | null;
          buyer_address: string | null;
          subtotal: number;
          vat_rate: number;
          vat_amount: number;
          total_amount: number;
          provider: string;
          provider_ref: string | null;
          provider_data: Json | null;
          issued_at: string | null;
          cancelled_at: string | null;
          replaced_by: number | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          tenant_id: number;
          branch_id: number;
          order_id: number;
          invoice_number?: string | null;
          status?: string;
          buyer_name?: string | null;
          buyer_tax_code?: string | null;
          buyer_address?: string | null;
          subtotal: number;
          vat_rate?: number;
          vat_amount: number;
          total_amount: number;
          provider?: string;
          provider_ref?: string | null;
          provider_data?: Json | null;
          issued_at?: string | null;
          cancelled_at?: string | null;
          replaced_by?: number | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          tenant_id?: number;
          branch_id?: number;
          order_id?: number;
          invoice_number?: string | null;
          status?: string;
          buyer_name?: string | null;
          buyer_tax_code?: string | null;
          buyer_address?: string | null;
          subtotal?: number;
          vat_rate?: number;
          vat_amount?: number;
          total_amount?: number;
          provider?: string;
          provider_ref?: string | null;
          provider_data?: Json | null;
          issued_at?: string | null;
          cancelled_at?: string | null;
          replaced_by?: number | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      mv_daily_revenue: {
        Row: {
          date: string;
          branch_id: number;
          tenant_id: number;
          order_count: number;
          total_revenue: number | null;
          total_tax: number | null;
          cash_revenue: number | null;
          vietqr_revenue: number | null;
          momo_revenue: number | null;
        };
        Insert: {
          date: string;
          branch_id: number;
          tenant_id: number;
          order_count: number;
          total_revenue?: number | null;
          total_tax?: number | null;
          cash_revenue?: number | null;
          vietqr_revenue?: number | null;
          momo_revenue?: number | null;
        };
        Update: {
          date?: string;
          branch_id?: number;
          tenant_id?: number;
          order_count?: number;
          total_revenue?: number | null;
          total_tax?: number | null;
          cash_revenue?: number | null;
          vietqr_revenue?: number | null;
          momo_revenue?: number | null;
        };
        Relationships: [];
      };
      mv_top_items: {
        Row: {
          period_start: string;
          period_end: string;
          branch_id: number;
          tenant_id: number;
          menu_item_id: number;
          item_name: string;
          quantity_sold: number;
          revenue: number;
        };
        Insert: {
          period_start: string;
          period_end: string;
          branch_id: number;
          tenant_id: number;
          menu_item_id: number;
          item_name: string;
          quantity_sold: number;
          revenue: number;
        };
        Update: {
          period_start?: string;
          period_end?: string;
          branch_id?: number;
          tenant_id?: number;
          menu_item_id?: number;
          item_name?: string;
          quantity_sold?: number;
          revenue?: number;
        };
        Relationships: [];
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
      [_ in never]: never;
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
      auth_area_id: { Args: never; Returns: number };
      auth_branch_id: { Args: never; Returns: number };
      auth_role: { Args: never; Returns: string };
      auth_tenant_id: { Args: never; Returns: number };
      close_pos_session: {
        Args: { p_closing_cash: number; p_note?: string; p_session_id: number };
        Returns: Json;
      };
      create_order: {
        Args: {
          p_branch_id: number;
          p_created_by: string;
          p_customer_count?: number;
          p_items: Json;
          p_note?: string;
          p_order_type?: string;
          p_pos_session_id?: number;
          p_table_id?: number;
          p_tenant_id: number;
        };
        Returns: Json;
      };
      custom_access_token_hook: { Args: { event: Json }; Returns: Json };
      release_table: { Args: { p_table_id: number }; Returns: undefined };
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
      set_headquarters: { Args: { p_branch_id: number }; Returns: undefined };
      toggle_category_active: { Args: { p_id: number }; Returns: boolean };
      toggle_item_active: { Args: { p_id: number }; Returns: boolean };
      toggle_profile_active: {
        Args: { p_target_id: string };
        Returns: boolean;
      };
      transition_order_item_status: {
        Args: {
          p_item_id: number;
          p_new_status: string;
          p_expected_status: string;
        };
        Returns: Json;
      };
      transition_order_status: {
        Args: {
          p_order_id: number;
          p_new_status: string;
          p_expected_status: string;
          p_note?: string;
        };
        Returns: Json;
      };
      update_my_profile: {
        Args: { p_avatar_url?: string; p_full_name?: string; p_phone?: string };
        Returns: undefined;
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
