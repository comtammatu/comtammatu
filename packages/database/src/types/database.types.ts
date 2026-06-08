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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      archive_run_log: {
        Row: {
          attempt_number: number
          branch_id: number
          created_at: string
          error: string | null
          id: number
          outcome: string
          pdf_bytes: number | null
          pdf_sha256: string | null
          tax_invoice_id: number
          tenant_id: number
          trigger_source: string
          triggered_by: string | null
          xml_bytes: number | null
          xml_sha256: string | null
        }
        Insert: {
          attempt_number: number
          branch_id: number
          created_at?: string
          error?: string | null
          id?: never
          outcome: string
          pdf_bytes?: number | null
          pdf_sha256?: string | null
          tax_invoice_id: number
          tenant_id: number
          trigger_source: string
          triggered_by?: string | null
          xml_bytes?: number | null
          xml_sha256?: string | null
        }
        Update: {
          attempt_number?: number
          branch_id?: number
          created_at?: string
          error?: string | null
          id?: never
          outcome?: string
          pdf_bytes?: number | null
          pdf_sha256?: string | null
          tax_invoice_id?: number
          tenant_id?: number
          trigger_source?: string
          triggered_by?: string | null
          xml_bytes?: number | null
          xml_sha256?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "archive_run_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_run_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "archive_run_log_tax_invoice_id_fkey"
            columns: ["tax_invoice_id"]
            isOneToOne: false
            referencedRelation: "tax_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_run_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_run_log_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          branch_id: number
          check_in: string | null
          check_out: string | null
          code_verified: boolean | null
          created_at: string
          date: string
          employee_id: number
          id: number
          lat: number | null
          lng: number | null
          method: string | null
          note: string | null
          shift_id: number | null
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          check_in?: string | null
          check_out?: string | null
          code_verified?: boolean | null
          created_at?: string
          date: string
          employee_id: number
          id?: never
          lat?: number | null
          lng?: number | null
          method?: string | null
          note?: string | null
          shift_id?: number | null
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          check_in?: string | null
          check_out?: string | null
          code_verified?: boolean | null
          created_at?: string
          date?: string
          employee_id?: number
          id?: never
          lat?: number | null
          lng?: number | null
          method?: string | null
          note?: string | null
          shift_id?: number | null
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: number | null
          entity_type: string
          id: number
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          tenant_id: number
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: number | null
          entity_type: string
          id?: never
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          tenant_id: number
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: number | null
          entity_type?: string
          id?: never
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          tenant_id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_attendance_config: {
        Row: {
          attendance_secret: string
          branch_id: number
          created_at: string
          id: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          attendance_secret: string
          branch_id: number
          created_at?: string
          id?: never
          tenant_id: number
          updated_at?: string
        }
        Update: {
          attendance_secret?: string
          branch_id?: number
          created_at?: string
          id?: never
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_attendance_config_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_attendance_config_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "branch_attendance_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_feature_flags: {
        Row: {
          branch_id: number
          created_at: string
          disabled_at: string | null
          enabled: boolean
          enabled_at: string | null
          enabled_by: string | null
          flag_key: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          branch_id: number
          created_at?: string
          disabled_at?: string | null
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          flag_key: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: number
          created_at?: string
          disabled_at?: string | null
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          flag_key?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_feature_flags_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_feature_flags_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
        ]
      }
      branch_menu_item_daily_limits: {
        Row: {
          branch_id: number
          created_at: string
          id: number
          is_disabled: boolean
          limit_date: string
          limit_quantity: number | null
          menu_item_id: number
          sold_today: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          created_at?: string
          id?: never
          is_disabled?: boolean
          limit_date?: string
          limit_quantity?: number | null
          menu_item_id: number
          sold_today?: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          created_at?: string
          id?: never
          is_disabled?: boolean
          limit_date?: string
          limit_quantity?: number | null
          menu_item_id?: number
          sold_today?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_menu_item_daily_limits_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_menu_item_daily_limits_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "branch_menu_item_daily_limits_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_menu_item_daily_limits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
            foreignKeyName: "branch_zones_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
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
          branch_kind: string
          code: string | null
          created_at: string | null
          id: number
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          tenant_id: number
          timezone: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          branch_kind?: string
          code?: string | null
          created_at?: string | null
          id?: never
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          tenant_id: number
          timezone?: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          branch_kind?: string
          code?: string | null
          created_at?: string | null
          id?: never
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          tenant_id?: number
          timezone?: string
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
      cash_entries: {
        Row: {
          amount: number
          branch_id: number
          category: string | null
          created_at: string
          created_by: string | null
          direction: string
          entry_date: string
          id: number
          note: string | null
          tenant_id: number
        }
        Insert: {
          amount: number
          branch_id: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          direction: string
          entry_date?: string
          id?: never
          note?: string | null
          tenant_id: number
        }
        Update: {
          amount?: number
          branch_id?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          entry_date?: string
          id?: never
          note?: string | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "cash_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          bank_account: string | null
          bank_name: string | null
          base_salary: number | null
          contract_type: string | null
          created_at: string
          dependents_count: number
          employee_code: string | null
          id: number
          id_number: string | null
          insurance_base_salary: number
          is_active: boolean
          profile_id: string
          start_date: string | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          bank_account?: string | null
          bank_name?: string | null
          base_salary?: number | null
          contract_type?: string | null
          created_at?: string
          dependents_count?: number
          employee_code?: string | null
          id?: never
          id_number?: string | null
          insurance_base_salary?: number
          is_active?: boolean
          profile_id: string
          start_date?: string | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          bank_account?: string | null
          bank_name?: string | null
          base_salary?: number | null
          contract_type?: string | null
          created_at?: string
          dependents_count?: number
          employee_code?: string | null
          id?: never
          id_number?: string | null
          insurance_base_salary?: number
          is_active?: boolean
          profile_id?: string
          start_date?: string | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_received_notes: {
        Row: {
          branch_id: number
          created_at: string
          created_by: string
          express_approved: boolean | null
          grn_number: string
          id: number
          notes: string | null
          po_id: number | null
          received_by: string | null
          received_date: string
          status: string
          supplier_id: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          created_at?: string
          created_by: string
          express_approved?: boolean | null
          grn_number: string
          id?: never
          notes?: string | null
          po_id?: number | null
          received_by?: string | null
          received_date?: string
          status?: string
          supplier_id: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          created_at?: string
          created_by?: string
          express_approved?: boolean | null
          grn_number?: string
          id?: never
          notes?: string | null
          po_id?: number | null
          received_by?: string | null
          received_date?: string
          status?: string
          supplier_id?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_received_notes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_received_notes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "goods_received_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_received_notes_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_received_notes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_received_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_items: {
        Row: {
          baseline_sample_n: number | null
          baseline_source: string | null
          baseline_variance_pct: number | null
          batch_number: string | null
          expiry_date: string | null
          grn_id: number
          id: number
          ingredient_id: number
          is_hard_blocked: boolean
          po_quantity: number | null
          po_unit_price: number | null
          price_override_note: string | null
          price_override_photo_url: string | null
          price_variance_pct: number | null
          quality_status: string
          received_quantity: number
          receiving_temperature: number | null
          rejected_photo_url: string | null
          rejected_quantity: number
          rejection_reason: string | null
          requires_review: boolean
          short_delivery_action: string | null
          tenant_id: number
          total_cost: number
          unit: string
          unit_cost: number
          variance_tier: number | null
        }
        Insert: {
          baseline_sample_n?: number | null
          baseline_source?: string | null
          baseline_variance_pct?: number | null
          batch_number?: string | null
          expiry_date?: string | null
          grn_id: number
          id?: never
          ingredient_id: number
          is_hard_blocked?: boolean
          po_quantity?: number | null
          po_unit_price?: number | null
          price_override_note?: string | null
          price_override_photo_url?: string | null
          price_variance_pct?: number | null
          quality_status?: string
          received_quantity: number
          receiving_temperature?: number | null
          rejected_photo_url?: string | null
          rejected_quantity?: number
          rejection_reason?: string | null
          requires_review?: boolean
          short_delivery_action?: string | null
          tenant_id: number
          total_cost: number
          unit: string
          unit_cost: number
          variance_tier?: number | null
        }
        Update: {
          baseline_sample_n?: number | null
          baseline_source?: string | null
          baseline_variance_pct?: number | null
          batch_number?: string | null
          expiry_date?: string | null
          grn_id?: number
          id?: never
          ingredient_id?: number
          is_hard_blocked?: boolean
          po_quantity?: number | null
          po_unit_price?: number | null
          price_override_note?: string | null
          price_override_photo_url?: string | null
          price_variance_pct?: number | null
          quality_status?: string
          received_quantity?: number
          receiving_temperature?: number | null
          rejected_photo_url?: string | null
          rejected_quantity?: number
          rejection_reason?: string | null
          requires_review?: boolean
          short_delivery_action?: string | null
          tenant_id?: number
          total_cost?: number
          unit?: string
          unit_cost?: number
          variance_tier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_items_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "goods_received_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          category: string | null
          created_at: string
          id: number
          is_active: boolean
          item_kind: string
          max_stock_level: number | null
          measure_unit: string
          min_stock_level: number
          name: string
          purchase_to_measure_factor: number
          purchase_unit: string
          reorder_point: number | null
          review_override: boolean | null
          shelf_life_days: number | null
          sku: string | null
          storage_type: string
          tenant_id: number
          unit: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          item_kind?: string
          max_stock_level?: number | null
          measure_unit: string
          min_stock_level?: number
          name: string
          purchase_to_measure_factor?: number
          purchase_unit: string
          reorder_point?: number | null
          review_override?: boolean | null
          shelf_life_days?: number | null
          sku?: string | null
          storage_type?: string
          tenant_id: number
          unit: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          item_kind?: string
          max_stock_level?: number | null
          measure_unit?: string
          min_stock_level?: number
          name?: string
          purchase_to_measure_factor?: number
          purchase_unit?: string
          reorder_point?: number | null
          review_override?: boolean | null
          shelf_life_days?: number | null
          sku?: string | null
          storage_type?: string
          tenant_id?: number
          unit?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kds_station_categories: {
        Row: {
          category_id: number
          id: number
          station_id: number
          tenant_id: number
        }
        Insert: {
          category_id: number
          id?: never
          station_id: number
          tenant_id: number
        }
        Update: {
          category_id?: number
          id?: never
          station_id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "kds_station_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_station_categories_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "kds_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_station_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kds_stations: {
        Row: {
          branch_id: number
          created_at: string
          id: number
          is_active: boolean
          name: string
          position: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          created_at?: string
          id?: never
          is_active?: boolean
          name: string
          position?: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          created_at?: string
          id?: never
          is_active?: boolean
          name?: string
          position?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kds_stations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_stations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "kds_stations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kds_tickets: {
        Row: {
          branch_id: number
          bumped_at: string | null
          bumped_by: string | null
          created_at: string
          id: number
          kitchen_send_batch_id: number | null
          order_id: number
          order_item_id: number
          station_id: number
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          bumped_at?: string | null
          bumped_by?: string | null
          created_at?: string
          id?: never
          kitchen_send_batch_id?: number | null
          order_id: number
          order_item_id: number
          station_id: number
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          bumped_at?: string | null
          bumped_by?: string | null
          created_at?: string
          id?: never
          kitchen_send_batch_id?: number | null
          order_id?: number
          order_item_id?: number
          station_id?: number
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kds_tickets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_tickets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "kds_tickets_bumped_by_fkey"
            columns: ["bumped_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_tickets_kitchen_send_batch_id_fkey"
            columns: ["kitchen_send_batch_id"]
            isOneToOne: false
            referencedRelation: "kitchen_send_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_tickets_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_tickets_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "kds_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_send_batches: {
        Row: {
          branch_id: number
          counter_date: string
          created_at: string
          created_by: string | null
          id: number
          kind: string
          kitchen_ticket_number: string
          order_id: number
          send_seq: number
          tenant_id: number
          ticket_seq: number
        }
        Insert: {
          branch_id: number
          counter_date: string
          created_at?: string
          created_by?: string | null
          id?: never
          kind?: string
          kitchen_ticket_number: string
          order_id: number
          send_seq: number
          tenant_id: number
          ticket_seq: number
        }
        Update: {
          branch_id?: number
          counter_date?: string
          created_at?: string
          created_by?: string | null
          id?: never
          kind?: string
          kitchen_ticket_number?: string
          order_id?: number
          send_seq?: number
          tenant_id?: number
          ticket_seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_send_batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_send_batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "kitchen_send_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_send_batches_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_send_batches_tenant_id_fkey"
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
          kitchen_printer: number
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
          kitchen_printer?: number
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
          kitchen_printer?: number
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
          vat_rate: number
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
          vat_rate?: number
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
          vat_rate?: number
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
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          dedup_key: string | null
          entity_id: number | null
          entity_type: string | null
          expires_at: string | null
          id: number
          kind: string
          meta: Json
          read_at: string | null
          severity: string
          target_branch_id: number | null
          target_roles: string[]
          tenant_id: number
          title: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          dedup_key?: string | null
          entity_id?: number | null
          entity_type?: string | null
          expires_at?: string | null
          id?: never
          kind: string
          meta?: Json
          read_at?: string | null
          severity?: string
          target_branch_id?: number | null
          target_roles: string[]
          tenant_id: number
          title: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          dedup_key?: string | null
          entity_id?: number | null
          entity_type?: string | null
          expires_at?: string | null
          id?: never
          kind?: string
          meta?: Json
          read_at?: string | null
          severity?: string
          target_branch_id?: number | null
          target_roles?: string[]
          tenant_id?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_target_branch_id_fkey"
            columns: ["target_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_target_branch_id_fkey"
            columns: ["target_branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_daily_counters: {
        Row: {
          branch_id: number
          counter_date: string
          id: number
          last_seq: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          counter_date: string
          id?: never
          last_seq?: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          counter_date?: string
          id?: never
          last_seq?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_daily_counters_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_daily_counters_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "order_daily_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          cancel_reason: string | null
          created_at: string
          discount_amount: number
          discount_note: string | null
          discount_type: string | null
          discount_value: number | null
          id: number
          is_priority: boolean
          item_name: string
          menu_item_id: number
          modifiers: Json
          note: string | null
          order_id: number
          priority_marked_at: string | null
          priority_marked_by: string | null
          priority_note: string | null
          quantity: number
          request_key: string | null
          sent_to_kitchen_at: string | null
          sides: Json
          status: string
          subtotal: number
          tenant_id: number
          unit_price: number
          updated_at: string
          variant_id: number | null
          variant_name: string | null
          vat_rate: number
        }
        Insert: {
          cancel_reason?: string | null
          created_at?: string
          discount_amount?: number
          discount_note?: string | null
          discount_type?: string | null
          discount_value?: number | null
          id?: never
          is_priority?: boolean
          item_name: string
          menu_item_id: number
          modifiers?: Json
          note?: string | null
          order_id: number
          priority_marked_at?: string | null
          priority_marked_by?: string | null
          priority_note?: string | null
          quantity: number
          request_key?: string | null
          sent_to_kitchen_at?: string | null
          sides?: Json
          status?: string
          subtotal: number
          tenant_id: number
          unit_price: number
          updated_at?: string
          variant_id?: number | null
          variant_name?: string | null
          vat_rate?: number
        }
        Update: {
          cancel_reason?: string | null
          created_at?: string
          discount_amount?: number
          discount_note?: string | null
          discount_type?: string | null
          discount_value?: number | null
          id?: never
          is_priority?: boolean
          item_name?: string
          menu_item_id?: number
          modifiers?: Json
          note?: string | null
          order_id?: number
          priority_marked_at?: string | null
          priority_marked_by?: string | null
          priority_note?: string | null
          quantity?: number
          request_key?: string | null
          sent_to_kitchen_at?: string | null
          sides?: Json
          status?: string
          subtotal?: number
          tenant_id?: number
          unit_price?: number
          updated_at?: string
          variant_id?: number | null
          variant_name?: string | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_priority_marked_by_fkey"
            columns: ["priority_marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "menu_item_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string
          created_at: string
          from_status: string | null
          id: number
          note: string | null
          order_id: number
          tenant_id: number
          to_status: string
        }
        Insert: {
          changed_by: string
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          order_id: number
          tenant_id: number
          to_status: string
        }
        Update: {
          changed_by?: string
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          order_id?: number
          tenant_id?: number
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          branch_id: number
          cash_change: number | null
          cash_received: number | null
          created_at: string
          created_by: string
          customer_count: number
          discount_amount: number
          discount_note: string | null
          discount_type: string | null
          discount_value: number | null
          id: number
          idempotency_key: string | null
          is_priority: boolean
          item_discount_amount: number
          kitchen_send_count: number
          last_transfer_idempotency_key: string | null
          merge_request_key: string | null
          merged_into_order_id: number | null
          note: string | null
          order_number: string
          order_type: string
          payment_method: string | null
          payment_status: string | null
          pos_session_id: number | null
          priority_marked_at: string | null
          priority_marked_by: string | null
          priority_note: string | null
          service_charge: number
          split_from_order_id: number | null
          status: string
          subtotal: number
          table_id: number | null
          tax_amount: number
          tenant_id: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          cash_change?: number | null
          cash_received?: number | null
          created_at?: string
          created_by: string
          customer_count?: number
          discount_amount?: number
          discount_note?: string | null
          discount_type?: string | null
          discount_value?: number | null
          id?: never
          idempotency_key?: string | null
          is_priority?: boolean
          item_discount_amount?: number
          kitchen_send_count?: number
          last_transfer_idempotency_key?: string | null
          merge_request_key?: string | null
          merged_into_order_id?: number | null
          note?: string | null
          order_number: string
          order_type?: string
          payment_method?: string | null
          payment_status?: string | null
          pos_session_id?: number | null
          priority_marked_at?: string | null
          priority_marked_by?: string | null
          priority_note?: string | null
          service_charge?: number
          split_from_order_id?: number | null
          status?: string
          subtotal?: number
          table_id?: number | null
          tax_amount?: number
          tenant_id: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          cash_change?: number | null
          cash_received?: number | null
          created_at?: string
          created_by?: string
          customer_count?: number
          discount_amount?: number
          discount_note?: string | null
          discount_type?: string | null
          discount_value?: number | null
          id?: never
          idempotency_key?: string | null
          is_priority?: boolean
          item_discount_amount?: number
          kitchen_send_count?: number
          last_transfer_idempotency_key?: string | null
          merge_request_key?: string | null
          merged_into_order_id?: number | null
          note?: string | null
          order_number?: string
          order_type?: string
          payment_method?: string | null
          payment_status?: string | null
          pos_session_id?: number | null
          priority_marked_at?: string | null
          priority_marked_by?: string | null
          priority_note?: string | null
          service_charge?: number
          split_from_order_id?: number | null
          status?: string
          subtotal?: number
          table_id?: number | null
          tax_amount?: number
          tenant_id?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_merged_into_order_id_fkey"
            columns: ["merged_into_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pos_session_id_fkey"
            columns: ["pos_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_priority_marked_by_fkey"
            columns: ["priority_marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_split_from_order_id_fkey"
            columns: ["split_from_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          branch_id: number
          created_at: string
          created_by: string
          id: number
          method: string
          order_id: number
          paid_at: string | null
          provider_data: Json | null
          provider_ref: string | null
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          amount: number
          branch_id: number
          created_at?: string
          created_by: string
          id?: never
          method: string
          order_id: number
          paid_at?: string | null
          provider_data?: Json | null
          provider_ref?: string | null
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: number
          created_at?: string
          created_by?: string
          id?: never
          method?: string
          order_id?: number
          paid_at?: string | null
          provider_data?: Json | null
          provider_ref?: string | null
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_entries: {
        Row: {
          advance_deduction: number
          allowances: number
          base_salary: number
          bhtn_employee: number
          bhtn_employer: number
          bhxh_employee: number
          bhxh_employer: number
          bhyt_employee: number
          bhyt_employer: number
          bonus: number
          charity_deduction: number
          created_at: string
          dependent_count: number
          dependent_deduction: number
          employee_id: number
          gross_total: number
          id: number
          insurance_base: number
          net_salary: number
          notes: string | null
          other_deductions: number
          overtime_hours: number
          overtime_pay: number
          payroll_period_id: number
          personal_deduction: number
          pit_tax: number
          standard_days: number
          tax_exempt_allowances: number
          taxable_income: number
          tenant_id: number
          total_insurance_employee: number
          total_insurance_employer: number
          updated_at: string
          working_days: number
        }
        Insert: {
          advance_deduction?: number
          allowances?: number
          base_salary: number
          bhtn_employee: number
          bhtn_employer: number
          bhxh_employee: number
          bhxh_employer: number
          bhyt_employee: number
          bhyt_employer: number
          bonus?: number
          charity_deduction?: number
          created_at?: string
          dependent_count?: number
          dependent_deduction?: number
          employee_id: number
          gross_total: number
          id?: never
          insurance_base: number
          net_salary: number
          notes?: string | null
          other_deductions?: number
          overtime_hours?: number
          overtime_pay?: number
          payroll_period_id: number
          personal_deduction?: number
          pit_tax: number
          standard_days: number
          tax_exempt_allowances?: number
          taxable_income: number
          tenant_id: number
          total_insurance_employee: number
          total_insurance_employer: number
          updated_at?: string
          working_days: number
        }
        Update: {
          advance_deduction?: number
          allowances?: number
          base_salary?: number
          bhtn_employee?: number
          bhtn_employer?: number
          bhxh_employee?: number
          bhxh_employer?: number
          bhyt_employee?: number
          bhyt_employer?: number
          bonus?: number
          charity_deduction?: number
          created_at?: string
          dependent_count?: number
          dependent_deduction?: number
          employee_id?: number
          gross_total?: number
          id?: never
          insurance_base?: number
          net_salary?: number
          notes?: string | null
          other_deductions?: number
          overtime_hours?: number
          overtime_pay?: number
          payroll_period_id?: number
          personal_deduction?: number
          pit_tax?: number
          standard_days?: number
          tax_exempt_allowances?: number
          taxable_income?: number
          tenant_id?: number
          total_insurance_employee?: number
          total_insurance_employer?: number
          updated_at?: string
          working_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: number
          paid_at: string | null
          period_month: number
          period_year: number
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: never
          paid_at?: string | null
          period_month: number
          period_year: number
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: never
          paid_at?: string | null
          period_month?: number
          period_year?: number
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_keys: {
        Row: {
          created_at: string
          description: string
          key: string
          module: string
          scope: string
        }
        Insert: {
          created_at?: string
          description: string
          key: string
          module: string
          scope: string
        }
        Update: {
          created_at?: string
          description?: string
          key?: string
          module?: string
          scope?: string
        }
        Relationships: []
      }
      pos_sessions: {
        Row: {
          branch_id: number
          cash_difference: number | null
          closed_at: string | null
          closed_by: string | null
          closing_cash: number | null
          created_at: string
          expected_cash: number | null
          id: number
          note: string | null
          opened_at: string
          opened_by: string
          opening_cash: number
          status: string
          tenant_id: number
          terminal_id: number | null
          updated_at: string
          variance_approval_note: string | null
          variance_approver_user_id: string | null
        }
        Insert: {
          branch_id: number
          cash_difference?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: never
          note?: string | null
          opened_at?: string
          opened_by: string
          opening_cash?: number
          status?: string
          tenant_id: number
          terminal_id?: number | null
          updated_at?: string
          variance_approval_note?: string | null
          variance_approver_user_id?: string | null
        }
        Update: {
          branch_id?: number
          cash_difference?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: never
          note?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash?: number
          status?: string
          tenant_id?: number
          terminal_id?: number | null
          updated_at?: string
          variance_approval_note?: string | null
          variance_approver_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "pos_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sessions_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "pos_terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sessions_variance_approver_user_id_fkey"
            columns: ["variance_approver_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_terminals: {
        Row: {
          branch_id: number
          created_at: string
          device_id: string | null
          id: number
          is_active: boolean
          name: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          created_at?: string
          device_id?: string | null
          id?: never
          is_active?: boolean
          name: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          created_at?: string
          device_id?: string | null
          id?: never
          is_active?: boolean
          name?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_terminals_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_terminals_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "pos_terminals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          code: string
          created_at: string
          id: number
          is_active: boolean
          is_system: boolean
          label_en: string | null
          label_vi: string
          tenant_id: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          label_en?: string | null
          label_vi: string
          tenant_id: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          label_en?: string | null
          label_vi?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          attempts: number
          branch_id: number
          claimed_at: string | null
          claimed_by_agent: string | null
          created_at: string
          created_by: string | null
          id: number
          idempotency_key: string
          job_type: string
          last_error: string | null
          last_retried_at: string | null
          last_retried_by: string | null
          order_id: number | null
          payload: Json
          printed_at: string | null
          printer_id: number
          reprinted_from_id: number | null
          retry_count: number
          status: string
          tenant_id: number
        }
        Insert: {
          attempts?: number
          branch_id: number
          claimed_at?: string | null
          claimed_by_agent?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          idempotency_key: string
          job_type: string
          last_error?: string | null
          last_retried_at?: string | null
          last_retried_by?: string | null
          order_id?: number | null
          payload: Json
          printed_at?: string | null
          printer_id: number
          reprinted_from_id?: number | null
          retry_count?: number
          status?: string
          tenant_id: number
        }
        Update: {
          attempts?: number
          branch_id?: number
          claimed_at?: string | null
          claimed_by_agent?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          idempotency_key?: string
          job_type?: string
          last_error?: string | null
          last_retried_at?: string | null
          last_retried_by?: string | null
          order_id?: number | null
          payload?: Json
          printed_at?: string | null
          printer_id?: number
          reprinted_from_id?: number | null
          retry_count?: number
          status?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "print_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_last_retried_by_fkey"
            columns: ["last_retried_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_reprinted_from_id_fkey"
            columns: ["reprinted_from_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      printer_agents: {
        Row: {
          agent_id: string
          branch_id: number
          last_seen_at: string
          tenant_id: number
          version: string | null
        }
        Insert: {
          agent_id: string
          branch_id: number
          last_seen_at?: string
          tenant_id: number
          version?: string | null
        }
        Update: {
          agent_id?: string
          branch_id?: number
          last_seen_at?: string
          tenant_id?: number
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "printer_agents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printer_agents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "printer_agents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      printers: {
        Row: {
          branch_id: number
          code_page: string
          connection_type: string
          created_at: string
          id: number
          is_active: boolean
          lan_host: string | null
          lan_port: number | null
          name: string
          paper_width_mm: number
          role: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          code_page?: string
          connection_type?: string
          created_at?: string
          id?: never
          is_active?: boolean
          lan_host?: string | null
          lan_port?: number | null
          name: string
          paper_width_mm?: number
          role: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          code_page?: string
          connection_type?: string
          created_at?: string
          id?: never
          is_active?: boolean
          lan_host?: string | null
          lan_port?: number | null
          name?: string
          paper_width_mm?: number
          role?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "printers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "printers_tenant_id_fkey"
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
          position_id: number
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
          position_id: number
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
          position_id?: number
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
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "profiles_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
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
      reconcile_run_log: {
        Row: {
          after_status: string | null
          attempt_age_seconds: number
          before_status: string
          branch_id: number
          created_at: string
          error: string | null
          id: number
          outcome: string
          provider_returned: string | null
          tax_invoice_id: number
          tenant_id: number
          trigger_source: string
          triggered_by: string | null
        }
        Insert: {
          after_status?: string | null
          attempt_age_seconds: number
          before_status: string
          branch_id: number
          created_at?: string
          error?: string | null
          id?: never
          outcome: string
          provider_returned?: string | null
          tax_invoice_id: number
          tenant_id: number
          trigger_source: string
          triggered_by?: string | null
        }
        Update: {
          after_status?: string | null
          attempt_age_seconds?: number
          before_status?: string
          branch_id?: number
          created_at?: string
          error?: string | null
          id?: never
          outcome?: string
          provider_returned?: string | null
          tax_invoice_id?: number
          tenant_id?: number
          trigger_source?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconcile_run_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconcile_run_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "reconcile_run_log_tax_invoice_id_fkey"
            columns: ["tax_invoice_id"]
            isOneToOne: false
            referencedRelation: "tax_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconcile_run_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconcile_run_log_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          branch_id: number
          created_at: string
          created_by: string
          id: number
          order_id: number
          payment_id: number
          reason: string
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          branch_id: number
          created_at?: string
          created_by: string
          id?: never
          order_id: number
          payment_id: number
          reason: string
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: number
          created_at?: string
          created_by?: string
          id?: never
          order_id?: number
          payment_id?: number
          reason?: string
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_assignments: {
        Row: {
          branch_id: number
          created_at: string
          date: string
          employee_id: number
          id: number
          shift_id: number
          tenant_id: number
        }
        Insert: {
          branch_id: number
          created_at?: string
          date: string
          employee_id: number
          id?: never
          shift_id: number
          tenant_id: number
        }
        Update: {
          branch_id?: number
          created_at?: string
          date?: string
          employee_id?: number
          id?: never
          shift_id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "shift_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_requests: {
        Row: {
          assignment_id: number | null
          branch_id: number
          created_at: string
          date: string
          employee_id: number
          id: number
          note: string | null
          rejected_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shift_id: number
          status: Database["public"]["Enums"]["shift_request_status"]
          tenant_id: number
          updated_at: string
        }
        Insert: {
          assignment_id?: number | null
          branch_id: number
          created_at?: string
          date: string
          employee_id: number
          id?: never
          note?: string | null
          rejected_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_id: number
          status?: Database["public"]["Enums"]["shift_request_status"]
          tenant_id: number
          updated_at?: string
        }
        Update: {
          assignment_id?: number | null
          branch_id?: number
          created_at?: string
          date?: string
          employee_id?: number
          id?: never
          note?: string | null
          rejected_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_id?: number
          status?: Database["public"]["Enums"]["shift_request_status"]
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_requests_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "shift_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_requests_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          branch_id: number
          created_at: string
          end_time: string
          id: number
          is_active: boolean
          name: string
          start_time: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          created_at?: string
          end_time: string
          id?: never
          is_active?: boolean
          name: string
          start_time: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          created_at?: string
          end_time?: string
          id?: never
          is_active?: boolean
          name?: string
          start_time?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_permissions: {
        Row: {
          branch_id: number | null
          granted_at: string
          granted_by: string | null
          id: number
          permission_key: string
          source_template: number | null
          tenant_id: number
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          branch_id?: number | null
          granted_at?: string
          granted_by?: string | null
          id?: never
          permission_key: string
          source_template?: number | null
          tenant_id: number
          user_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          branch_id?: number | null
          granted_at?: string
          granted_by?: string | null
          id?: never
          permission_key?: string
          source_template?: number | null
          tenant_id?: number
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_permissions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_permissions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "staff_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permission_keys"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "staff_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_levels: {
        Row: {
          avg_unit_cost: number | null
          branch_id: number
          current_quantity: number
          id: number
          ingredient_id: number
          last_counted_at: string | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          avg_unit_cost?: number | null
          branch_id: number
          current_quantity?: number
          id?: never
          ingredient_id: number
          last_counted_at?: string | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          avg_unit_cost?: number | null
          branch_id?: number
          current_quantity?: number
          id?: never
          ingredient_id?: number
          last_counted_at?: string | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "stock_levels_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          branch_id: number
          created_at: string
          created_by: string
          grn_id: number | null
          id: number
          ingredient_id: number
          issue_id: number | null
          movement_subtype: string | null
          order_id: number | null
          production_order_id: number | null
          quantity_change: number
          reason: string | null
          tenant_id: number
          transfer_id: number | null
          type: string
          unit_cost: number | null
        }
        Insert: {
          branch_id: number
          created_at?: string
          created_by: string
          grn_id?: number | null
          id?: never
          ingredient_id: number
          issue_id?: number | null
          movement_subtype?: string | null
          order_id?: number | null
          production_order_id?: number | null
          quantity_change: number
          reason?: string | null
          tenant_id: number
          transfer_id?: number | null
          type: string
          unit_cost?: number | null
        }
        Update: {
          branch_id?: number
          created_at?: string
          created_by?: string
          grn_id?: number | null
          id?: never
          ingredient_id?: number
          issue_id?: number | null
          movement_subtype?: string | null
          order_id?: number | null
          production_order_id?: number | null
          quantity_change?: number
          reason?: string | null
          tenant_id?: number
          transfer_id?: number | null
          type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "goods_received_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktake_lines: {
        Row: {
          abc_class: string | null
          client_op_id: string | null
          counted_at: string | null
          counted_by: string | null
          counted_quantity: number | null
          created_at: string
          id: number
          ingredient_id: number
          is_final: boolean
          needs_recount: boolean
          offline_created_at: string | null
          round_no: number
          session_id: number
          system_quantity: number
          tenant_id: number
          variance: number | null
          variance_reason: string | null
        }
        Insert: {
          abc_class?: string | null
          client_op_id?: string | null
          counted_at?: string | null
          counted_by?: string | null
          counted_quantity?: number | null
          created_at?: string
          id?: never
          ingredient_id: number
          is_final?: boolean
          needs_recount?: boolean
          offline_created_at?: string | null
          round_no?: number
          session_id: number
          system_quantity: number
          tenant_id: number
          variance?: number | null
          variance_reason?: string | null
        }
        Update: {
          abc_class?: string | null
          client_op_id?: string | null
          counted_at?: string | null
          counted_by?: string | null
          counted_quantity?: number | null
          created_at?: string
          id?: never
          ingredient_id?: number
          is_final?: boolean
          needs_recount?: boolean
          offline_created_at?: string | null
          round_no?: number
          session_id?: number
          system_quantity?: number
          tenant_id?: number
          variance?: number | null
          variance_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_lines_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_lines_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stocktake_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktake_sessions: {
        Row: {
          abc_snapshot_at: string | null
          auditor_branch_id: number | null
          auditor_id: string | null
          blind_mode: boolean
          branch_id: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_round: number
          id: number
          is_unaudited: boolean
          mode: string
          notes: string | null
          offline_enabled: boolean
          offline_enabled_at: string | null
          offline_enabled_by: string | null
          started_at: string
          status: string
          tenant_id: number
          variance_threshold_pct: number
          variance_threshold_pct_class_a: number
          variance_threshold_vnd: number
          variance_threshold_vnd_class_a: number
        }
        Insert: {
          abc_snapshot_at?: string | null
          auditor_branch_id?: number | null
          auditor_id?: string | null
          blind_mode?: boolean
          branch_id: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_round?: number
          id?: never
          is_unaudited?: boolean
          mode?: string
          notes?: string | null
          offline_enabled?: boolean
          offline_enabled_at?: string | null
          offline_enabled_by?: string | null
          started_at?: string
          status?: string
          tenant_id: number
          variance_threshold_pct?: number
          variance_threshold_pct_class_a?: number
          variance_threshold_vnd?: number
          variance_threshold_vnd_class_a?: number
        }
        Update: {
          abc_snapshot_at?: string | null
          auditor_branch_id?: number | null
          auditor_id?: string | null
          blind_mode?: boolean
          branch_id?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_round?: number
          id?: never
          is_unaudited?: boolean
          mode?: string
          notes?: string | null
          offline_enabled?: boolean
          offline_enabled_at?: string | null
          offline_enabled_by?: string | null
          started_at?: string
          status?: string
          tenant_id?: number
          variance_threshold_pct?: number
          variance_threshold_pct_class_a?: number
          variance_threshold_vnd?: number
          variance_threshold_vnd_class_a?: number
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_sessions_auditor_branch_id_fkey"
            columns: ["auditor_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_sessions_auditor_branch_id_fkey"
            columns: ["auditor_branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "stocktake_sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "stocktake_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      summary_run_queue: {
        Row: {
          attempt_count: number
          branch_id: number
          created_at: string
          finished_at: string | null
          id: number
          last_error: string | null
          started_at: string | null
          status: string
          summary_date: string
          tax_invoice_id: number | null
          tenant_id: number
          trigger_source: string
          triggered_by: string | null
        }
        Insert: {
          attempt_count?: number
          branch_id: number
          created_at?: string
          finished_at?: string | null
          id?: never
          last_error?: string | null
          started_at?: string | null
          status?: string
          summary_date: string
          tax_invoice_id?: number | null
          tenant_id: number
          trigger_source: string
          triggered_by?: string | null
        }
        Update: {
          attempt_count?: number
          branch_id?: number
          created_at?: string
          finished_at?: string | null
          id?: never
          last_error?: string | null
          started_at?: string | null
          status?: string
          summary_date?: string
          tax_invoice_id?: number | null
          tenant_id?: number
          trigger_source?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "summary_run_queue_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "summary_run_queue_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "summary_run_queue_tax_invoice_id_fkey"
            columns: ["tax_invoice_id"]
            isOneToOne: false
            referencedRelation: "tax_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "summary_run_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "summary_run_queue_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          created_at: string
          created_by: string
          due_date: string | null
          grn_id: number | null
          id: number
          invoice_date: string
          invoice_number: string
          matching_notes: string | null
          paid_amount: number
          paid_at: string | null
          payment_status: string
          po_id: number | null
          subtotal: number
          supplier_id: number
          tenant_id: number
          total_amount: number
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          created_at?: string
          created_by: string
          due_date?: string | null
          grn_id?: number | null
          id?: never
          invoice_date: string
          invoice_number: string
          matching_notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          payment_status?: string
          po_id?: number | null
          subtotal: number
          supplier_id: number
          tenant_id: number
          total_amount: number
          updated_at?: string
          vat_amount: number
          vat_rate?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          due_date?: string | null
          grn_id?: number | null
          id?: never
          invoice_date?: string
          invoice_number?: string
          matching_notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          payment_status?: string
          po_id?: number | null
          subtotal?: number
          supplier_id?: number
          tenant_id?: number
          total_amount?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "goods_received_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: number
          payment_date: string
          payment_method: string
          reference_note: string | null
          supplier_invoice_id: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: never
          payment_date?: string
          payment_method: string
          reference_note?: string | null
          supplier_invoice_id: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: never
          payment_date?: string
          payment_method?: string
          reference_note?: string | null
          supplier_invoice_id?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          id: number
          is_active: boolean
          name: string
          notes: string | null
          payment_terms_days: number | null
          payment_terms_note: string | null
          phone: string | null
          tax_code: string | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          name: string
          notes?: string | null
          payment_terms_days?: number | null
          payment_terms_note?: string | null
          phone?: string | null
          tax_code?: string | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          name?: string
          notes?: string | null
          payment_terms_days?: number | null
          payment_terms_note?: string | null
          phone?: string | null
          tax_code?: string | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
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
            foreignKeyName: "tables_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
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
      tax_invoice_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: string | null
          id: number
          note: string | null
          payload: Json | null
          tax_invoice_id: number
          tenant_id: number
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          payload?: Json | null
          tax_invoice_id: number
          tenant_id: number
          to_status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          payload?: Json | null
          tax_invoice_id?: number
          tenant_id?: number
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_invoice_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoice_events_tax_invoice_id_fkey"
            columns: ["tax_invoice_id"]
            isOneToOne: false
            referencedRelation: "tax_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoice_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_invoice_orders: {
        Row: {
          branch_id: number
          created_at: string
          line_subtotal: number
          line_vat_amount: number
          order_id: number
          tax_invoice_id: number
          tenant_id: number
          vat_rate: number
        }
        Insert: {
          branch_id: number
          created_at?: string
          line_subtotal: number
          line_vat_amount: number
          order_id: number
          tax_invoice_id: number
          tenant_id: number
          vat_rate: number
        }
        Update: {
          branch_id?: number
          created_at?: string
          line_subtotal?: number
          line_vat_amount?: number
          order_id?: number
          tax_invoice_id?: number
          tenant_id?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_invoice_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoice_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "tax_invoice_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoice_orders_tax_invoice_id_fkey"
            columns: ["tax_invoice_id"]
            isOneToOne: false
            referencedRelation: "tax_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoice_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_invoices: {
        Row: {
          archive_attempts: number
          archive_last_error: string | null
          archived_at: string | null
          branch_id: number
          buyer_address: string | null
          buyer_name: string | null
          buyer_tax_code: string | null
          cancelled_at: string | null
          cqt_code: string | null
          created_at: string
          created_by: string | null
          id: number
          invoice_kind: string
          invoice_number: string | null
          invoice_series: string | null
          issued_at: string | null
          order_id: number | null
          pdf_sha256: string | null
          pdf_url: string | null
          provider: string
          provider_data: Json | null
          provider_ref: string | null
          replaced_by: number | null
          replaced_for: number | null
          signing_started_at: string | null
          status: string
          subtotal: number
          summary_date: string | null
          summary_orders_count: number | null
          tenant_id: number
          total_amount: number
          updated_at: string
          vat_amount: number
          vat_rate: number
          xml_sha256: string | null
          xml_url: string | null
        }
        Insert: {
          archive_attempts?: number
          archive_last_error?: string | null
          archived_at?: string | null
          branch_id: number
          buyer_address?: string | null
          buyer_name?: string | null
          buyer_tax_code?: string | null
          cancelled_at?: string | null
          cqt_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          invoice_kind?: string
          invoice_number?: string | null
          invoice_series?: string | null
          issued_at?: string | null
          order_id?: number | null
          pdf_sha256?: string | null
          pdf_url?: string | null
          provider?: string
          provider_data?: Json | null
          provider_ref?: string | null
          replaced_by?: number | null
          replaced_for?: number | null
          signing_started_at?: string | null
          status?: string
          subtotal: number
          summary_date?: string | null
          summary_orders_count?: number | null
          tenant_id: number
          total_amount: number
          updated_at?: string
          vat_amount: number
          vat_rate?: number
          xml_sha256?: string | null
          xml_url?: string | null
        }
        Update: {
          archive_attempts?: number
          archive_last_error?: string | null
          archived_at?: string | null
          branch_id?: number
          buyer_address?: string | null
          buyer_name?: string | null
          buyer_tax_code?: string | null
          cancelled_at?: string | null
          cqt_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          invoice_kind?: string
          invoice_number?: string | null
          invoice_series?: string | null
          issued_at?: string | null
          order_id?: number | null
          pdf_sha256?: string | null
          pdf_url?: string | null
          provider?: string
          provider_data?: Json | null
          provider_ref?: string | null
          replaced_by?: number | null
          replaced_for?: number | null
          signing_started_at?: string | null
          status?: string
          subtotal?: number
          summary_date?: string | null
          summary_orders_count?: number | null
          tenant_id?: number
          total_amount?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          xml_sha256?: string | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "tax_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoices_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "tax_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoices_replaced_for_fkey"
            columns: ["replaced_for"]
            isOneToOne: false
            referencedRelation: "tax_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          owner_user_id: string
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
          owner_user_id: string
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
          owner_user_id?: string
          representative?: string | null
          settings?: Json | null
          slug?: string
          tax_code?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          error_code: string | null
          http_status: number | null
          id: number
          payload: Json
          payment_id: number | null
          processed_at: string | null
          processing_status: string
          provider: string
          request_id: string
          signature_valid: boolean
          tenant_id: number
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          http_status?: number | null
          id?: never
          payload: Json
          payment_id?: number | null
          processed_at?: string | null
          processing_status?: string
          provider: string
          request_id: string
          signature_valid?: boolean
          tenant_id: number
        }
        Update: {
          created_at?: string
          error_code?: string | null
          http_status?: number | null
          id?: never
          payload?: Json
          payment_id?: number | null
          processed_at?: string | null
          processing_status?: string
          provider?: string
          request_id?: string
          signature_valid?: boolean
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mv_daily_revenue: {
        Row: {
          branch_id: number | null
          cash_revenue: number | null
          date: string | null
          dine_in_revenue: number | null
          discount_amount: number | null
          momo_revenue: number | null
          order_count: number | null
          subtotal_revenue: number | null
          takeaway_revenue: number | null
          tenant_id: number | null
          total_covers: number | null
          total_revenue: number | null
          total_tax: number | null
          vietqr_revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_grn_price_baseline: {
        Row: {
          avg_30d: number | null
          ingredient_id: number | null
          last_seen_at: string | null
          sample_n: number | null
          supplier_id: number | null
          tenant_id: number | null
          uom: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_received_notes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_received_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_inventory_stock_current: {
        Row: {
          avg_unit_cost: number | null
          branch_id: number | null
          current_quantity: number | null
          ingredient_category: string | null
          ingredient_id: number | null
          ingredient_is_active: boolean | null
          ingredient_name: string | null
          item_kind: string | null
          last_counted_at: string | null
          max_stock_level: number | null
          min_stock_level: number | null
          reorder_point: number | null
          shelf_life_days: number | null
          stock_value: number | null
          tenant_id: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "stock_levels_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_inventory_value_ranking: {
        Row: {
          branch_id: number | null
          ingredient_id: number | null
          tenant_id: number | null
          total_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "stock_levels_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_top_items: {
        Row: {
          branch_id: number | null
          item_name: string | null
          menu_item_id: number | null
          period_end: string | null
          period_start: string | null
          quantity_sold: number | null
          revenue: number | null
          tenant_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      printer_agent_status: {
        Row: {
          agent_id: string | null
          branch_id: number | null
          is_online: boolean | null
          last_seen_at: string | null
          tenant_id: number | null
          version: string | null
        }
        Insert: {
          agent_id?: string | null
          branch_id?: number | null
          is_online?: never
          last_seen_at?: string | null
          tenant_id?: number | null
          version?: string | null
        }
        Update: {
          agent_id?: string | null
          branch_id?: number | null
          is_online?: never
          last_seen_at?: string | null
          tenant_id?: number | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "printer_agents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printer_agents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "printer_agents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_print_agent_fleet: {
        Row: {
          agent_id: string | null
          branch_id: number | null
          branch_name: string | null
          last_seen_at: string | null
          seconds_since_seen: number | null
          status: string | null
          tenant_id: number | null
          version: string | null
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
    }
    Functions: {
      _auth_v2_is_owner: { Args: { p_user: string }; Returns: boolean }
      _auth_v2_position_id_from_role: {
        Args: { p_role: string; p_tenant: number }
        Returns: number
      }
      _auth_v2_role_to_position: { Args: { p_role: string }; Returns: string }
      _compute_grn_price_baseline: {
        Args: {
          p_ingredient_id: number
          p_supplier_id: number
          p_tenant_id: number
          p_uom?: string
        }
        Returns: {
          avg_30d: number
          baseline_source: string
          last_seen_at: string
          sample_n: number
        }[]
      }
      _compute_vat_breakdown: {
        Args: { p_order_ids: number[] }
        Returns: {
          line_gross: number
          line_subtotal: number
          line_vat: number
          vat_rate: number
        }[]
      }
      admin_update_profile: {
        Args: {
          p_branch_id?: number
          p_full_name?: string
          p_is_active?: boolean
          p_phone?: string
          p_role?: string
          p_target_id: string
        }
        Returns: undefined
      }
      aggregate_daily_b2c_invoice: {
        Args: { p_actor?: string; p_branch_id: number; p_summary_date: string }
        Returns: Json
      }
      amend_grn_line: {
        Args: {
          p_grn_id: number
          p_line_id: number
          p_reason: string
          p_received_quantity: number
          p_rejected_quantity?: number
          p_unit_cost: number
        }
        Returns: Json
      }
      append_order_items: {
        Args: { p_idempotency_key?: string; p_items: Json; p_order_id: number }
        Returns: Json
      }
      apply_order_discount: {
        Args: {
          p_note: string
          p_order_id: number
          p_type: string
          p_value: number
        }
        Returns: Json
      }
      apply_order_item_discount: {
        Args: {
          p_note: string
          p_order_item_id: number
          p_type: string
          p_value: number
        }
        Returns: Json
      }
      approve_shift_request: { Args: { p_request_id: number }; Returns: number }
      assign_auditor: {
        Args: {
          p_auditor_branch_id?: number
          p_auditor_id: string
          p_session_id: number
        }
        Returns: undefined
      }
      attach_print_document_to_payload: {
        Args: {
          p_branch_id: number
          p_kind: string
          p_payload: Json
          p_tenant_id: number
        }
        Returns: Json
      }
      auth_branch_id: { Args: never; Returns: number }
      auth_role: { Args: never; Returns: string }
      auth_tenant_id: { Args: never; Returns: number }
      bump_kds_ticket: { Args: { p_ticket_id: number }; Returns: string }
      can_access_branch: { Args: { p_branch_id: number }; Returns: boolean }
      cancel_order: {
        Args: { p_order_id: number; p_reason: string }
        Returns: Json
      }
      cancel_pending_payment: {
        Args: { p_branch_id: number; p_payment_id: number; p_tenant_id: number }
        Returns: undefined
      }
      cancel_shift_request: {
        Args: { p_request_id: number }
        Returns: undefined
      }
      check_order_ready: { Args: { p_order_id: number }; Returns: undefined }
      claim_print_job: {
        Args: { p_agent_id: string; p_job_id: number }
        Returns: boolean
      }
      cleanup_abandoned_payments: {
        Args: { p_threshold?: string }
        Returns: number
      }
      cleanup_kds_tickets_as_system: {
        Args: { p_older_than: string; p_reset_before_local_date?: string }
        Returns: Json
      }
      clear_branch_menu_daily_limit: {
        Args: { p_branch_id: number; p_menu_item_id: number }
        Returns: Json
      }
      clear_order_discount: { Args: { p_order_id: number }; Returns: Json }
      clear_order_item_discount: {
        Args: { p_note: string; p_order_item_id: number }
        Returns: Json
      }
      close_pos_session: {
        Args: {
          p_closing_cash: number
          p_note?: string
          p_session_id: number
          p_variance_note?: string
        }
        Returns: Json
      }
      close_recount_round: {
        Args: { p_round_no: number; p_session_id: number }
        Returns: Json
      }
      complete_kds_tickets: {
        Args: { p_branch_id: number; p_ticket_ids: number[] }
        Returns: Json
      }
      complete_payment_and_consume_stock: {
        Args: {
          p_actor_id?: string
          p_expected_amount?: number
          p_payment_id: number
          p_provider_data?: Json
        }
        Returns: {
          detail: string
          order_id: number
          payment_id: number
          status: string
          stock_consumed: boolean
        }[]
      }
      complete_print_job: {
        Args: { p_error?: string; p_job_id: number; p_success: boolean }
        Returns: undefined
      }
      complete_stocktake: { Args: { p_session_id: number }; Returns: Json }
      compute_discount_amount: {
        Args: { p_subtotal: number; p_type: string; p_value: number }
        Returns: number
      }
      confirm_cash_payment: {
        Args: { p_cash_received: number; p_order_id: number }
        Returns: Json
      }
      confirm_goods_receipt_note: { Args: { p_grn_id: number }; Returns: Json }
      confirm_payment_and_post: {
        Args: {
          p_branch_id: number
          p_payment_id: number
          p_provider_ref?: string
          p_tenant_id: number
        }
        Returns: Json
      }
      confirm_vietqr_payment: {
        Args: {
          p_amount: number
          p_branch_id: number
          p_created_by: string
          p_order_id: number
          p_tenant_id: number
        }
        Returns: Json
      }
      count_unread_notifications: { Args: never; Returns: number }
      create_order: {
        Args: {
          p_branch_id: number
          p_created_by: string
          p_customer_count?: number
          p_idempotency_key?: string
          p_items: Json
          p_note?: string
          p_order_type?: string
          p_pos_session_id?: number
          p_table_id?: number
          p_tenant_id: number
        }
        Returns: Json
      }
      create_payment: {
        Args: {
          p_amount: number
          p_branch_id: number
          p_created_by: string
          p_method: string
          p_order_id: number
          p_provider_ref?: string
          p_status?: string
          p_tenant_id: number
        }
        Returns: Json
      }
      create_refund: {
        Args: { p_amount: number; p_payment_id: number; p_reason: string }
        Returns: Json
      }
      create_stocktake_session: { Args: { p_branch_id: number }; Returns: Json }
      current_position: { Args: never; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      edit_pending_order_item: {
        Args: {
          p_modifiers: Json
          p_note: string
          p_order_item_id: number
          p_quantity: number
          p_sides: Json
          p_unit_price: number
          p_variant_id: number
          p_variant_name: string
        }
        Returns: Json
      }
      enable_offline_for_session: {
        Args: { p_session_id: number }
        Returns: Json
      }
      enqueue_edit_pending_order_item_quantity_print: {
        Args: {
          p_new_quantity: number
          p_old_quantity: number
          p_order_item_id: number
          p_reason?: string
        }
        Returns: Json
      }
      enqueue_kitchen_print: { Args: { p_order_id: number }; Returns: Json }
      enqueue_provisional_bill: {
        Args: {
          p_order_id: number
          p_qr_content?: string
          p_qr_header_label?: string
        }
        Returns: Json
      }
      enqueue_receipt_print: {
        Args: {
          p_cash_change?: number
          p_cash_received?: number
          p_order_id: number
        }
        Returns: Json
      }
      enqueue_shift_close_print: {
        Args: { p_session_id: number }
        Returns: Json
      }
      ensure_journal_write_permission: {
        Args: { p_branch_id?: number }
        Returns: undefined
      }
      escalate_round_4: {
        Args: {
          p_final_qty: number
          p_ingredient_id: number
          p_note: string
          p_session_id: number
        }
        Returns: undefined
      }
      expire_stuck_print_jobs: {
        Args: { p_stale_after_seconds?: number }
        Returns: number
      }
      feedback_validate_categories: {
        Args: { p_cats: string[] }
        Returns: boolean
      }
      finalize_paid_order: {
        Args: { p_actor_id?: string; p_order_id: number }
        Returns: undefined
      }
      finalize_stocktake: { Args: { p_session_id: number }; Returns: Json }
      finance_views_last_refresh: {
        Args: never
        Returns: {
          last_run: string
          status: string
        }[]
      }
      find_payment_order_desync: {
        Args: { p_since?: string }
        Returns: {
          age_minutes: number
          amount: number
          branch_id: number
          order_created_at: string
          order_id: number
          order_payment_status: string
          order_status: string
          payment_id: number
          payment_method: string
          payment_paid_at: string
          payment_status: string
          tenant_id: number
        }[]
      }
      get_branch_menu_daily_limits_for_pos: {
        Args: { p_branch_id: number }
        Returns: {
          is_disabled: boolean
          limit_quantity: number
          menu_item_id: number
          sold_today: number
        }[]
      }
      get_cash_variance_summary: {
        Args: { p_branch_id: number; p_end_date: string; p_start_date: string }
        Returns: {
          abs_variance_total: number
          over_count: number
          over_total: number
          session_count: number
          short_count: number
          short_total: number
          total_variance: number
          worst_cashiers: Json
        }[]
      }
      get_daily_revenue: {
        Args: { p_branch_id: number; p_end_date: string; p_start_date: string }
        Returns: {
          branch_id: number
          cash_revenue: number
          date: string
          momo_revenue: number
          order_count: number
          tenant_id: number
          total_revenue: number
          total_tax: number
          vietqr_revenue: number
        }[]
      }
      get_finance_dashboard_summary: {
        Args: { p_branch_id?: number; p_end_date: string; p_start_date: string }
        Returns: {
          failed_webhook_count: number
          invoice_attention_count: number
          invoice_issued_count: number
          invoice_not_required_count: number
          journal_draft_count: number
          journal_posted_count: number
        }[]
      }
      get_grn_price_baseline: {
        Args: { p_ingredient_id: number; p_supplier_id: number; p_uom?: string }
        Returns: {
          avg_30d: number
          baseline_source: string
          last_seen_at: string
          sample_n: number
        }[]
      }
      get_inventory_alerts: {
        Args: {
          p_branch_id: number
          p_limit?: number
          p_offset?: number
          p_types?: string[]
        }
        Returns: {
          alert_type: string
          current_quantity: number
          ingredient_id: number
          ingredient_name: string
          reorder_point: number
          severity_rank: number
          shortage_ratio: number
        }[]
      }
      get_inventory_dashboard: { Args: { p_branch_id: number }; Returns: Json }
      get_orders_for_day: {
        Args: { p_branch_id: number; p_date: string }
        Returns: {
          branch_id: number
          branch_name: string
          customer_count: number
          discount_amount: number
          invoice_number: string
          invoice_status: string
          item_count: number
          order_id: number
          order_number: string
          order_type: string
          paid_at: string
          paid_hour: number
          payment_method: string
          subtotal: number
          tax_amount: number
          total_amount: number
        }[]
      }
      get_pos_session_report: { Args: { p_session_id: number }; Returns: Json }
      get_revenue_by_cashier: {
        Args: {
          p_branch_id?: number
          p_end_date?: string
          p_start_date?: string
        }
        Returns: {
          cash_revenue: number
          cashier_id: string
          cashier_name: string
          net_revenue: number
          order_count: number
          qr_revenue: number
        }[]
      }
      get_revenue_by_hour: {
        Args: {
          p_branch_id?: number
          p_end_date?: string
          p_start_date?: string
        }
        Returns: {
          dow: number
          hour: number
          net_revenue: number
          order_count: number
        }[]
      }
      get_revenue_kpis: {
        Args: { p_branch_id: number; p_end_date: string; p_start_date: string }
        Returns: {
          cash_revenue: number
          dine_in_revenue: number
          discount_amount: number
          momo_revenue: number
          net_revenue: number
          order_count: number
          refreshed_at: string
          subtotal_revenue: number
          takeaway_revenue: number
          total_covers: number
          total_tax: number
          vat_10_amount: number
          vat_8_amount: number
          vietqr_revenue: number
          voided_amount: number
          voided_count: number
        }[]
      }
      get_revenue_rollup: {
        Args: {
          p_branch_id: number
          p_end_date: string
          p_granularity: string
          p_start_date: string
        }
        Returns: {
          branch_id: number
          cash_revenue: number
          dine_in_revenue: number
          discount_amount: number
          momo_revenue: number
          order_count: number
          period_end: string
          period_label: string
          period_start: string
          subtotal_revenue: number
          takeaway_revenue: number
          total_covers: number
          total_revenue: number
          total_tax: number
          vietqr_revenue: number
        }[]
      }
      get_stocktake_lines_blind: {
        Args: { p_session_id: number }
        Returns: {
          abc_class: string
          counted_at: string
          counted_by: string
          counted_quantity: number
          ingredient_id: number
          ingredient_name: string
          is_final: boolean
          line_id: number
          needs_recount: boolean
          round_no: number
          unit: string
        }[]
      }
      get_top_items: {
        Args: {
          p_branch_id?: number
          p_limit?: number
          p_period_start?: string
        }
        Returns: {
          branch_id: number
          item_name: string
          menu_item_id: number
          period_end: string
          period_start: string
          quantity_sold: number
          revenue: number
          tenant_id: number
        }[]
      }
      grant_permission: {
        Args: {
          p_branch_id: number
          p_permission_key: string
          p_source_template?: number
          p_target_user: string
          p_valid_from?: string
          p_valid_until?: string
        }
        Returns: number
      }
      has_permission: {
        Args: { p_branch_id: number; p_key: string }
        Returns: boolean
      }
      has_permission_any: { Args: { p_key: string }; Returns: boolean }
      has_position: { Args: { p_code: string }; Returns: boolean }
      inventory_shift_key: {
        Args: { p_at?: string; p_branch_id: number }
        Returns: string
      }
      is_feature_enabled: {
        Args: { p_branch_id: number; p_flag_key: string }
        Returns: boolean
      }
      is_inventory_production_operator: { Args: never; Returns: boolean }
      list_branch_menu_daily_limits: {
        Args: { p_branch_id: number; p_limit_date?: string }
        Returns: {
          base_price: number
          category_id: number
          category_name: string
          is_disabled: boolean
          item_name: string
          limit_date: string
          limit_id: number
          limit_quantity: number
          menu_item_id: number
          sold_today: number
        }[]
      }
      log_audit: {
        Args: {
          p_action: string
          p_entity_id?: number
          p_entity_type: string
          p_new?: Json
          p_old?: Json
        }
        Returns: number
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_kds_item_out_of_stock: {
        Args: {
          p_disable_for_day?: boolean
          p_reason?: string
          p_ticket_id: number
        }
        Returns: Json
      }
      mark_order_item_served: { Args: { p_item_id: number }; Returns: Json }
      materialize_print_document: {
        Args: {
          p_content: Json
          p_font_profile: string
          p_kind: string
          p_paper_width_mm: number
          p_payload: Json
          p_template_id: number
          p_template_version: number
        }
        Returns: Json
      }
      merge_orders: {
        Args: {
          p_idempotency_key?: string
          p_source_order_id: number
          p_target_order_id: number
        }
        Returns: Json
      }
      pos_enrich_order_sides: {
        Args: { p_main_item_id: number; p_sides: Json; p_tenant_id: number }
        Returns: {
          enriched_sides: Json
          sides_sum: number
        }[]
      }
      pos_order_modifier_sum: {
        Args: { p_main_item_id: number; p_modifiers: Json; p_tenant_id: number }
        Returns: number
      }
      print_template_block_visible: {
        Args: { p_block: Json; p_payload: Json }
        Returns: boolean
      }
      print_template_datetime: { Args: { p_iso: string }; Returns: string }
      print_template_default_content: {
        Args: { p_kind: string }
        Returns: Json
      }
      print_template_diff_sign: { Args: { p_value: number }; Returns: string }
      print_template_divider_block: { Args: { p_char?: string }; Returns: Json }
      print_template_duration: {
        Args: { p_closed_at: string; p_opened_at: string }
        Returns: string
      }
      print_template_hhmm: { Args: { p_iso: string }; Returns: string }
      print_template_interpolate: {
        Args: { p_payload: Json; p_text: string }
        Returns: string
      }
      print_template_kitchen_item_blocks: {
        Args: { p_payload: Json; p_strikethrough?: boolean }
        Returns: Json
      }
      print_template_money: { Args: { p_value: number }; Returns: string }
      print_template_order_destination: {
        Args: { p_payload: Json }
        Returns: string
      }
      print_template_order_header: {
        Args: { p_payload: Json }
        Returns: string
      }
      print_template_payload_number: {
        Args: { p_field: string; p_payload: Json }
        Returns: number
      }
      print_template_payload_text: {
        Args: { p_field: string; p_payload: Json }
        Returns: string
      }
      print_template_payment_breakdown_blocks: {
        Args: { p_payload: Json }
        Returns: Json
      }
      print_template_payment_label: {
        Args: { p_full?: boolean; p_method: string }
        Returns: string
      }
      print_template_row_block: {
        Args: {
          p_bold?: boolean
          p_double?: boolean
          p_left: string
          p_right?: string
          p_strikethrough?: boolean
        }
        Returns: Json
      }
      print_template_shift_cash_blocks: {
        Args: { p_payload: Json }
        Returns: Json
      }
      print_template_shift_item_breakdown_blocks: {
        Args: { p_payload: Json }
        Returns: Json
      }
      print_template_shift_signature_blocks: { Args: never; Returns: Json }
      print_template_shift_summary_blocks: {
        Args: { p_payload: Json }
        Returns: Json
      }
      print_template_shift_variance_notice_blocks: {
        Args: { p_payload: Json }
        Returns: Json
      }
      print_template_spacer_block: { Args: { p_lines?: number }; Returns: Json }
      print_template_text_block: {
        Args: {
          p_align?: string
          p_bold?: boolean
          p_double?: boolean
          p_inverse?: boolean
          p_strikethrough?: boolean
          p_text: string
        }
        Returns: Json
      }
      print_template_variance_approval_blocks: {
        Args: { p_payload: Json }
        Returns: Json
      }
      recall_kds_ticket: { Args: { p_ticket_id: number }; Returns: string }
      recompute_supplier_invoice_matching: {
        Args: { p_invoice_id: number }
        Returns: Json
      }
      reduce_order_item_quantity: {
        Args: {
          p_new_quantity: number
          p_order_item_id: number
          p_reason: string
        }
        Returns: Json
      }
      refresh_inventory_dashboard: { Args: never; Returns: string }
      reject_shift_request: {
        Args: { p_reason?: string; p_request_id: number }
        Returns: undefined
      }
      release_table: { Args: { p_table_id: number }; Returns: undefined }
      replace_tax_invoice: {
        Args: {
          p_agreement_date: string
          p_agreement_ref: string
          p_buyer_address: string
          p_buyer_name: string
          p_buyer_tax_code: string
          p_old_id: number
          p_provider: string
          p_reason: string
          p_subtotal: number
          p_total_amount: number
          p_vat_amount: number
          p_vat_rate: number
        }
        Returns: number
      }
      resolve_branch_printer_for_type: {
        Args: { p_branch_id: number; p_print_type: string; p_tenant_id: number }
        Returns: number
      }
      resolve_print_template_version: {
        Args: { p_branch_id: number; p_kind: string; p_tenant_id: number }
        Returns: {
          content: Json
          font_profile: string
          paper_width_mm: number
          template_id: number
          template_version: number
        }[]
      }
      retry_print_job: { Args: { p_job_id: number }; Returns: boolean }
      reverse_payment_and_post: { Args: { p_refund_id: number }; Returns: Json }
      revoke_permission: {
        Args: {
          p_branch_id: number
          p_permission_key: string
          p_target_user: string
        }
        Returns: number
      }
      route_order_to_kds: { Args: { p_order_id: number }; Returns: undefined }
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
      save_station_categories: {
        Args: { p_category_ids: number[]; p_station_id: number }
        Returns: undefined
      }
      scan_inventory_alerts: {
        Args: never
        Returns: {
          expiry_count: number
          low_stock_count: number
        }[]
      }
      set_branch_kind: {
        Args: { p_branch_id: number; p_kind?: string }
        Returns: undefined
      }
      set_branch_menu_daily_limit: {
        Args: {
          p_branch_id: number
          p_is_disabled: boolean
          p_limit_quantity: number
          p_menu_item_id: number
        }
        Returns: Json
      }
      set_order_service_charge: {
        Args: { p_amount: number; p_note: string; p_order_id: number }
        Returns: Json
      }
      set_pos_order_item_priority: {
        Args: {
          p_is_priority: boolean
          p_note?: string
          p_order_item_id: number
        }
        Returns: Json
      }
      set_pos_order_priority: {
        Args: { p_is_priority: boolean; p_note?: string; p_order_id: number }
        Returns: Json
      }
      split_order: {
        Args: {
          p_idempotency_key?: string
          p_item_partials: Json
          p_source_order_id: number
        }
        Returns: Json
      }
      start_stocktake: {
        Args: {
          p_auditor_id?: string
          p_blind_mode?: boolean
          p_branch_id: number
          p_mode?: string
          p_threshold_pct?: number
          p_threshold_vnd?: number
        }
        Returns: Json
      }
      stock_transfer_list_branches: {
        Args: never
        Returns: {
          branch_kind: string
          id: number
          is_active: boolean
          name: string
        }[]
      }
      submit_count_round: {
        Args: { p_counts: Json; p_round_no: number; p_session_id: number }
        Returns: Json
      }
      submit_shift_request: {
        Args: {
          p_branch_id: number
          p_date: string
          p_note?: string
          p_shift_id: number
        }
        Returns: number
      }
      toggle_category_active: { Args: { p_id: number }; Returns: boolean }
      toggle_ingredient_active: { Args: { p_id: number }; Returns: boolean }
      toggle_item_active: { Args: { p_id: number }; Returns: boolean }
      toggle_profile_active: { Args: { p_target_id: string }; Returns: boolean }
      transfer_order_table: {
        Args: {
          p_idempotency_key?: string
          p_new_table_id: number
          p_order_id: number
        }
        Returns: Json
      }
      transition_order_item_status: {
        Args: {
          p_expected_status: string
          p_item_id: number
          p_new_status: string
        }
        Returns: Json
      }
      transition_order_status: {
        Args: {
          p_expected_status: string
          p_new_status: string
          p_note?: string
          p_order_id: number
        }
        Returns: Json
      }
      transition_tax_invoice_state: {
        Args: {
          p_note?: string
          p_payload?: Json
          p_tax_invoice_id: number
          p_to_status: string
        }
        Returns: Json
      }
      transition_tax_invoice_state_as_system: {
        Args: {
          p_actor?: string
          p_note?: string
          p_payload?: Json
          p_tax_invoice_id: number
          p_to_status: string
        }
        Returns: Json
      }
      update_ingredient_thresholds_bulk: {
        Args: { p_payload: Json }
        Returns: Json
      }
      update_my_dependents_count: {
        Args: { p_count: number }
        Returns: undefined
      }
      update_my_profile: {
        Args: { p_avatar_url?: string; p_full_name?: string; p_phone?: string }
        Returns: undefined
      }
      update_pos_order_status: {
        Args: { p_new_status: string; p_order_id: number }
        Returns: Json
      }
      void_order_item: {
        Args: { p_order_item_id: number; p_reason: string }
        Returns: Json
      }
    }
    Enums: {
      shift_request_status: "pending" | "approved" | "rejected" | "cancelled"
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
      shift_request_status: ["pending", "approved", "rejected", "cancelled"],
    },
  },
} as const
