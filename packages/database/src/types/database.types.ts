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
      accounting_periods: {
        Row: {
          closed_by: string | null
          hard_closed_at: string | null
          month: number
          soft_closed_at: string | null
          tenant_id: number
          year: number
        }
        Insert: {
          closed_by?: string | null
          hard_closed_at?: string | null
          month: number
          soft_closed_at?: string | null
          tenant_id: number
          year: number
        }
        Update: {
          closed_by?: string | null
          hard_closed_at?: string | null
          month?: number
          soft_closed_at?: string | null
          tenant_id?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "accounting_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      area_branches: {
        Row: {
          area_id: number
          branch_id: number
          created_at: string
          id: number
          tenant_id: number
        }
        Insert: {
          area_id: number
          branch_id: number
          created_at?: string
          id?: never
          tenant_id: number
        }
        Update: {
          area_id?: number
          branch_id?: number
          created_at?: string
          id?: never
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "area_branches_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_branches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          name: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          name: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          name?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
            foreignKeyName: "branch_attendance_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_daily_waste_cap: {
        Row: {
          avg_revenue_7d: number
          branch_id: number
          cap_vnd: number
          computed_at: string
        }
        Insert: {
          avg_revenue_7d: number
          branch_id: number
          cap_vnd: number
          computed_at?: string
        }
        Update: {
          avg_revenue_7d?: number
          branch_id?: number
          cap_vnd?: number
          computed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_daily_waste_cap_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_express_window: {
        Row: {
          branch_id: number
          enabled: boolean
          end_time: string
          start_time: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          branch_id: number
          enabled?: boolean
          end_time?: string
          start_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          branch_id?: number
          enabled?: boolean
          end_time?: string
          start_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_express_window_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
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
        ]
      }
      branch_override_attempts: {
        Row: {
          attempted_at: string
          branch_id: number
          id: number
          success: boolean
          user_id: string
        }
        Insert: {
          attempted_at?: string
          branch_id: number
          id?: never
          success: boolean
          user_id: string
        }
        Update: {
          attempted_at?: string
          branch_id?: number
          id?: never
          success?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_override_attempts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_override_codes: {
        Row: {
          branch_id: number
          code_hash: string
          rotated_at: string
          rotated_by: string | null
        }
        Insert: {
          branch_id: number
          code_hash: string
          rotated_at?: string
          rotated_by?: string | null
        }
        Update: {
          branch_id?: number
          code_hash?: string
          rotated_at?: string
          rotated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_override_codes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
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
      chart_of_accounts: {
        Row: {
          account_code: string
          account_name: string
          account_type: string
          created_at: string
          id: number
          is_active: boolean
          level: number
          parent_id: number | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          account_code: string
          account_name: string
          account_type: string
          created_at?: string
          id?: never
          is_active?: boolean
          level?: number
          parent_id?: number | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          account_code?: string
          account_name?: string
          account_type?: string
          created_at?: string
          id?: never
          is_active?: boolean
          level?: number
          parent_id?: number | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_tenant_id_fkey"
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
      employment_contracts: {
        Row: {
          contract_number: string
          contract_sequence: number
          contract_type: string
          created_at: string
          document_url: string | null
          employee_id: number
          end_date: string | null
          gross_salary: number
          id: number
          insurance_base_salary: number
          position: string
          probation_end_date: string | null
          signed_date: string
          start_date: string
          status: string
          tenant_id: number
          terminated_at: string | null
          termination_notice_date: string | null
          termination_reason: string | null
          updated_at: string
          work_location: string | null
        }
        Insert: {
          contract_number: string
          contract_sequence?: number
          contract_type: string
          created_at?: string
          document_url?: string | null
          employee_id: number
          end_date?: string | null
          gross_salary: number
          id?: never
          insurance_base_salary: number
          position: string
          probation_end_date?: string | null
          signed_date: string
          start_date: string
          status?: string
          tenant_id: number
          terminated_at?: string | null
          termination_notice_date?: string | null
          termination_reason?: string | null
          updated_at?: string
          work_location?: string | null
        }
        Update: {
          contract_number?: string
          contract_sequence?: number
          contract_type?: string
          created_at?: string
          document_url?: string | null
          employee_id?: number
          end_date?: string | null
          gross_salary?: number
          id?: never
          insurance_base_salary?: number
          position?: string
          probation_end_date?: string | null
          signed_date?: string
          start_date?: string
          status?: string
          tenant_id?: number
          terminated_at?: string | null
          termination_notice_date?: string | null
          termination_reason?: string | null
          updated_at?: string
          work_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employment_contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: number
          notes: string | null
          period_month: number
          period_year: number
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: never
          notes?: string | null
          period_month: number
          period_year: number
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: never
          notes?: string | null
          period_month?: number
          period_year?: number
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_periods_tenant_id_fkey"
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
          journal_entry_id: number | null
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
          journal_entry_id?: number | null
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
          journal_entry_id?: number | null
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
            foreignKeyName: "goods_received_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_received_notes_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_received_notes_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
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
      grn_baseline_pause: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          ingredient_id: number
          paused_until: string
          reason: string
          source_ref: Json | null
          supplier_id: number
          tenant_id: number
          uom: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          ingredient_id: number
          paused_until: string
          reason?: string
          source_ref?: Json | null
          supplier_id: number
          tenant_id: number
          uom: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          ingredient_id?: number
          paused_until?: string
          reason?: string
          source_ref?: Json | null
          supplier_id?: number
          tenant_id?: number
          uom?: string
        }
        Relationships: [
          {
            foreignKeyName: "grn_baseline_pause_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_baseline_pause_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_baseline_pause_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_express_extend_audit: {
        Row: {
          branch_id: number
          created_at: string
          extend_minutes: number
          extended_until: string
          id: number
          note: string
          tenant_id: number
          user_id: string
        }
        Insert: {
          branch_id: number
          created_at?: string
          extend_minutes: number
          extended_until: string
          id?: never
          note: string
          tenant_id: number
          user_id: string
        }
        Update: {
          branch_id?: number
          created_at?: string
          extend_minutes?: number
          extended_until?: string
          id?: never
          note?: string
          tenant_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grn_express_extend_audit_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_express_extend_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_hardblock_overrides: {
        Row: {
          baseline_avg_30d: number | null
          branch_id: number
          evidence_url: string
          grn_item_id: number
          id: number
          ingredient_id: number
          note: string
          overridden_at: string
          overridden_by: string
          reason_code: string
          submitted_price: number
          supplier_id: number
          tenant_id: number
          uom: string
          variance_pct: number
        }
        Insert: {
          baseline_avg_30d?: number | null
          branch_id: number
          evidence_url: string
          grn_item_id: number
          id?: never
          ingredient_id: number
          note: string
          overridden_at?: string
          overridden_by: string
          reason_code: string
          submitted_price: number
          supplier_id: number
          tenant_id: number
          uom: string
          variance_pct: number
        }
        Update: {
          baseline_avg_30d?: number | null
          branch_id?: number
          evidence_url?: string
          grn_item_id?: number
          id?: never
          ingredient_id?: number
          note?: string
          overridden_at?: string
          overridden_by?: string
          reason_code?: string
          submitted_price?: number
          supplier_id?: number
          tenant_id?: number
          uom?: string
          variance_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "grn_hardblock_overrides_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_hardblock_overrides_grn_item_id_fkey"
            columns: ["grn_item_id"]
            isOneToOne: false
            referencedRelation: "grn_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_hardblock_overrides_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_hardblock_overrides_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_hardblock_overrides_tenant_id_fkey"
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
      ingredient_abc_class: {
        Row: {
          branch_id: number
          class: string
          computed_at: string
          cumulative_share: number
          ingredient_id: number
          stock_value: number
          tenant_id: number
        }
        Insert: {
          branch_id: number
          class: string
          computed_at?: string
          cumulative_share?: number
          ingredient_id: number
          stock_value?: number
          tenant_id: number
        }
        Update: {
          branch_id?: number
          class?: string
          computed_at?: string
          cumulative_share?: number
          ingredient_id?: number
          stock_value?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_abc_class_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_abc_class_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_abc_class_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_category_review_policy: {
        Row: {
          category: string
          requires_manual_review: boolean
          tenant_id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          requires_manual_review?: boolean
          tenant_id: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          requires_manual_review?: boolean
          tenant_id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_category_review_policy_tenant_id_fkey"
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
      inventory_locations: {
        Row: {
          branch_id: number
          code: string
          created_at: string
          id: number
          is_active: boolean
          is_default_consumption: boolean
          is_default_issue: boolean
          is_default_receive: boolean
          location_kind: string
          name: string
          sort_order: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          code: string
          created_at?: string
          id?: never
          is_active?: boolean
          is_default_consumption?: boolean
          is_default_issue?: boolean
          is_default_receive?: boolean
          location_kind?: string
          name: string
          sort_order?: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          code?: string
          created_at?: string
          id?: never
          is_active?: boolean
          is_default_consumption?: boolean
          is_default_issue?: boolean
          is_default_receive?: boolean
          location_kind?: string
          name?: string
          sort_order?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_locations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_qc_settings: {
        Row: {
          alert_channel: string | null
          alert_webhook_url: string | null
          price_variance_review_pct: number
          price_variance_warn_pct: number
          qty_short_tolerance_pct: number
          reject_requires_photo: boolean
          tenant_id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_channel?: string | null
          alert_webhook_url?: string | null
          price_variance_review_pct?: number
          price_variance_warn_pct?: number
          qty_short_tolerance_pct?: number
          reject_requires_photo?: boolean
          tenant_id: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_channel?: string | null
          alert_webhook_url?: string | null
          price_variance_review_pct?: number
          price_variance_warn_pct?: number
          qty_short_tolerance_pct?: number
          reject_requires_photo?: boolean
          tenant_id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_qc_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_qc_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          branch_id: number | null
          created_at: string
          created_by: string | null
          description: string
          entry_date: string
          entry_number: string
          id: number
          posted_at: string | null
          posted_by: string | null
          reference_id: number | null
          reference_type: string
          status: string
          tenant_id: number
          updated_at: string
          voided_reason: string | null
        }
        Insert: {
          branch_id?: number | null
          created_at?: string
          created_by?: string | null
          description: string
          entry_date: string
          entry_number: string
          id?: never
          posted_at?: string | null
          posted_by?: string | null
          reference_id?: number | null
          reference_type?: string
          status?: string
          tenant_id: number
          updated_at?: string
          voided_reason?: string | null
        }
        Update: {
          branch_id?: number | null
          created_at?: string
          created_by?: string | null
          description?: string
          entry_date?: string
          entry_number?: string
          id?: never
          posted_at?: string | null
          posted_by?: string | null
          reference_id?: number | null
          reference_type?: string
          status?: string
          tenant_id?: number
          updated_at?: string
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: number
          created_at: string
          credit_amount: number
          debit_amount: number
          description: string | null
          id: number
          journal_entry_id: number
          tenant_id: number
        }
        Insert: {
          account_id: number
          created_at?: string
          credit_amount?: number
          debit_amount?: number
          description?: string | null
          id?: never
          journal_entry_id: number
          tenant_id: number
        }
        Update: {
          account_id?: number
          created_at?: string
          credit_amount?: number
          debit_amount?: number
          description?: string | null
          id?: never
          journal_entry_id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_tenant_id_fkey"
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
            foreignKeyName: "kds_tickets_bumped_by_fkey"
            columns: ["bumped_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      notification_outbox: {
        Row: {
          channel: string
          created_at: string
          id: number
          last_error: string | null
          payload: Json
          retries: number
          sent_at: string | null
          status: string
          tenant_id: number
          topic: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: never
          last_error?: string | null
          payload: Json
          retries?: number
          sent_at?: string | null
          status?: string
          tenant_id: number
          topic: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: never
          last_error?: string | null
          payload?: Json
          retries?: number
          sent_at?: string | null
          status?: string
          tenant_id?: number
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: number
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: number
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: number
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
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
          order_type: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          counter_date: string
          id?: never
          last_seq?: number
          order_type?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          counter_date?: string
          id?: never
          last_seq?: number
          order_type?: string
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
          id: number
          item_name: string
          menu_item_id: number
          modifiers: Json
          note: string | null
          order_id: number
          quantity: number
          sent_to_kitchen_at: string | null
          sides: Json
          status: string
          subtotal: number
          tenant_id: number
          unit_price: number
          updated_at: string
          variant_id: number | null
          variant_name: string | null
        }
        Insert: {
          cancel_reason?: string | null
          created_at?: string
          id?: never
          item_name: string
          menu_item_id: number
          modifiers?: Json
          note?: string | null
          order_id: number
          quantity: number
          sent_to_kitchen_at?: string | null
          sides?: Json
          status?: string
          subtotal: number
          tenant_id: number
          unit_price: number
          updated_at?: string
          variant_id?: number | null
          variant_name?: string | null
        }
        Update: {
          cancel_reason?: string | null
          created_at?: string
          id?: never
          item_name?: string
          menu_item_id?: number
          modifiers?: Json
          note?: string | null
          order_id?: number
          quantity?: number
          sent_to_kitchen_at?: string | null
          sides?: Json
          status?: string
          subtotal?: number
          tenant_id?: number
          unit_price?: number
          updated_at?: string
          variant_id?: number | null
          variant_name?: string | null
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
          id: number
          idempotency_key: string | null
          kitchen_send_count: number
          note: string | null
          order_number: string
          order_type: string
          payment_method: string | null
          payment_status: string | null
          pos_session_id: number | null
          service_charge: number
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
          id?: never
          idempotency_key?: string | null
          kitchen_send_count?: number
          note?: string | null
          order_number: string
          order_type?: string
          payment_method?: string | null
          payment_status?: string | null
          pos_session_id?: number | null
          service_charge?: number
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
          id?: never
          idempotency_key?: string | null
          kitchen_send_count?: number
          note?: string | null
          order_number?: string
          order_type?: string
          payment_method?: string | null
          payment_status?: string | null
          pos_session_id?: number | null
          service_charge?: number
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
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          journal_entry_id: number | null
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
          journal_entry_id?: number | null
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
          journal_entry_id?: number | null
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
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
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
          journal_entry_id: number | null
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
          journal_entry_id?: number | null
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
          journal_entry_id?: number | null
          paid_at?: string | null
          period_month?: number
          period_year?: number
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          at: string
          branch_id: number | null
          id: number
          metadata: Json
          permission_key: string
          source_template_id: number | null
          target_user_id: string
          tenant_id: number
        }
        Insert: {
          action: string
          actor_user_id: string
          at?: string
          branch_id?: number | null
          id?: never
          metadata?: Json
          permission_key: string
          source_template_id?: number | null
          target_user_id: string
          tenant_id: number
        }
        Update: {
          action?: string
          actor_user_id?: string
          at?: string
          branch_id?: number | null
          id?: never
          metadata?: Json
          permission_key?: string
          source_template_id?: number | null
          target_user_id?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "permission_audit_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_audit_log_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "role_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_audit_log_tenant_id_fkey"
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
          terminal_id: number
          updated_at: string
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
          terminal_id: number
          updated_at?: string
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
          terminal_id?: number
          updated_at?: string
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
          legacy_role_code: string
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
          legacy_role_code: string
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
          legacy_role_code?: string
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
      posting_rules: {
        Row: {
          created_at: string
          credit_account_code: string
          debit_account_code: string
          description: string
          id: number
          is_active: boolean
          rule_code: string
          tenant_id: number
          transaction_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_account_code: string
          debit_account_code: string
          description: string
          id?: never
          is_active?: boolean
          rule_code: string
          tenant_id: number
          transaction_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_account_code?: string
          debit_account_code?: string
          description?: string
          id?: never
          is_active?: boolean
          rule_code?: string
          tenant_id?: number
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posting_rules_tenant_id_fkey"
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
          transport: string
          version: string | null
        }
        Insert: {
          agent_id: string
          branch_id: number
          last_seen_at?: string
          tenant_id: number
          transport?: string
          version?: string | null
        }
        Update: {
          agent_id?: string
          branch_id?: number
          last_seen_at?: string
          tenant_id?: number
          transport?: string
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
          usb_product_id: string | null
          usb_vendor_id: string | null
        }
        Insert: {
          branch_id: number
          code_page?: string
          connection_type: string
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
          usb_product_id?: string | null
          usb_vendor_id?: string | null
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
          usb_product_id?: string | null
          usb_vendor_id?: string | null
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
            foreignKeyName: "printers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_items: {
        Row: {
          created_at: string
          finished_good_id: number
          id: number
          production_order_id: number
          quantity: number
          tenant_id: number
          unit: string
          unit_cost_at_production: number | null
        }
        Insert: {
          created_at?: string
          finished_good_id: number
          id?: never
          production_order_id: number
          quantity: number
          tenant_id: number
          unit: string
          unit_cost_at_production?: number | null
        }
        Update: {
          created_at?: string
          finished_good_id?: number
          id?: never
          production_order_id?: number
          quantity?: number
          tenant_id?: number
          unit?: string
          unit_cost_at_production?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_order_items_finished_good_id_fkey"
            columns: ["finished_good_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_items_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          branch_id: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: number
          journal_entry_id: number | null
          notes: string | null
          production_number: string
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          journal_entry_id?: number | null
          notes?: string | null
          production_number: string
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          journal_entry_id?: number | null
          notes?: string | null
          production_number?: string
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_recipes: {
        Row: {
          created_at: string
          finished_good_id: number
          id: number
          ingredient_id: number
          note: string | null
          quantity: number
          tenant_id: number
          unit: string
          updated_at: string
          yield_factor: number
        }
        Insert: {
          created_at?: string
          finished_good_id: number
          id?: never
          ingredient_id: number
          note?: string | null
          quantity: number
          tenant_id: number
          unit: string
          updated_at?: string
          yield_factor?: number
        }
        Update: {
          created_at?: string
          finished_good_id?: number
          id?: never
          ingredient_id?: number
          note?: string | null
          quantity?: number
          tenant_id?: number
          unit?: string
          updated_at?: string
          yield_factor?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_recipes_finished_good_id_fkey"
            columns: ["finished_good_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          area_id: number | null
          avatar_url: string | null
          branch_id: number | null
          created_at: string | null
          full_name: string
          id: string
          is_active: boolean | null
          phone: string | null
          position_id: number | null
          tenant_id: number
          updated_at: string | null
        }
        Insert: {
          area_id?: number | null
          avatar_url?: string | null
          branch_id?: number | null
          created_at?: string | null
          full_name: string
          id: string
          is_active?: boolean | null
          phone?: string | null
          position_id?: number | null
          tenant_id: number
          updated_at?: string | null
        }
        Update: {
          area_id?: number | null
          avatar_url?: string | null
          branch_id?: number | null
          created_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          position_id?: number | null
          tenant_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
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
      purchase_order_items: {
        Row: {
          id: number
          ingredient_id: number
          line_total: number | null
          po_id: number
          quantity: number
          tenant_id: number
          unit: string
          unit_price_est: number | null
        }
        Insert: {
          id?: never
          ingredient_id: number
          line_total?: number | null
          po_id: number
          quantity: number
          tenant_id: number
          unit: string
          unit_price_est?: number | null
        }
        Update: {
          id?: never
          ingredient_id?: number
          line_total?: number | null
          po_id?: number
          quantity?: number
          tenant_id?: number
          unit?: string
          unit_price_est?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          branch_id: number
          created_at: string
          created_by: string
          id: number
          notes: string | null
          ordered_at: string
          po_number: string
          status: string
          supplier_id: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          created_at?: string
          created_by: string
          id?: never
          notes?: string | null
          ordered_at?: string
          po_number: string
          status?: string
          supplier_id: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          created_at?: string
          created_by?: string
          id?: never
          notes?: string | null
          ordered_at?: string
          po_number?: string
          status?: string
          supplier_id?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          id: number
          ingredient_id: number
          menu_item_id: number
          note: string | null
          quantity: number
          tenant_id: number
          unit: string
          yield_factor: number
        }
        Insert: {
          created_at?: string
          id?: never
          ingredient_id: number
          menu_item_id: number
          note?: string | null
          quantity: number
          tenant_id: number
          unit: string
          yield_factor?: number
        }
        Update: {
          created_at?: string
          id?: never
          ingredient_id?: number
          menu_item_id?: number
          note?: string | null
          quantity?: number
          tenant_id?: number
          unit?: string
          yield_factor?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_templates: {
        Row: {
          created_at: string
          id: number
          is_system: boolean
          name: string
          permission_keys: string[]
          position_code: string | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_system?: boolean
          name: string
          permission_keys?: string[]
          position_code?: string | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          is_system?: boolean
          name?: string
          permission_keys?: string[]
          position_code?: string | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_templates_tenant_id_fkey"
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
            foreignKeyName: "staff_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permission_keys"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "staff_permissions_source_template_fkey"
            columns: ["source_template"]
            isOneToOne: false
            referencedRelation: "role_templates"
            referencedColumns: ["id"]
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
      stock_issue_items: {
        Row: {
          approval_required: boolean
          id: number
          ingredient_id: number
          issue_id: number
          photo_required: boolean
          photo_urls: string[]
          qty_ratio: number | null
          quantity: number
          reason: string | null
          reason_code: string | null
          rolling_15min_sum: number | null
          tenant_id: number
          total_cost: number | null
          unit: string
          unit_cost: number
          waste_tier: number | null
        }
        Insert: {
          approval_required?: boolean
          id?: never
          ingredient_id: number
          issue_id: number
          photo_required?: boolean
          photo_urls?: string[]
          qty_ratio?: number | null
          quantity: number
          reason?: string | null
          reason_code?: string | null
          rolling_15min_sum?: number | null
          tenant_id: number
          total_cost?: number | null
          unit: string
          unit_cost?: number
          waste_tier?: number | null
        }
        Update: {
          approval_required?: boolean
          id?: never
          ingredient_id?: number
          issue_id?: number
          photo_required?: boolean
          photo_urls?: string[]
          qty_ratio?: number | null
          quantity?: number
          reason?: string | null
          reason_code?: string | null
          rolling_15min_sum?: number | null
          tenant_id?: number
          total_cost?: number | null
          unit?: string
          unit_cost?: number
          waste_tier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_issue_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issue_items_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "stock_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issue_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_issues: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          branch_id: number
          created_at: string
          created_by: string | null
          id: number
          issue_number: string
          issue_type: string
          issued_at: string
          notes: string | null
          shift_key: string | null
          source_location_id: number | null
          source_ref: Json | null
          source_type: string
          status: string
          target_location_id: number | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          branch_id: number
          created_at?: string
          created_by?: string | null
          id?: never
          issue_number: string
          issue_type?: string
          issued_at?: string
          notes?: string | null
          shift_key?: string | null
          source_location_id?: number | null
          source_ref?: Json | null
          source_type?: string
          status?: string
          target_location_id?: number | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: number
          created_at?: string
          created_by?: string | null
          id?: never
          issue_number?: string
          issue_type?: string
          issued_at?: string
          notes?: string | null
          shift_key?: string | null
          source_location_id?: number | null
          source_ref?: Json | null
          source_type?: string
          status?: string
          target_location_id?: number | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_issues_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issues_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issues_target_location_id_fkey"
            columns: ["target_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issues_tenant_id_fkey"
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
          location_id: number
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
          location_id: number
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
          location_id?: number
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
            foreignKeyName: "stock_levels_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
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
          location_id: number
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
          location_id: number
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
          location_id?: number
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
            foreignKeyName: "stock_movements_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "stock_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
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
            foreignKeyName: "stock_movements_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          id: number
          ingredient_id: number
          quantity: number
          quantity_received: number | null
          receive_note: string | null
          tenant_id: number
          transfer_id: number
          unit: string
          unit_cost_at_ship: number | null
        }
        Insert: {
          id?: never
          ingredient_id: number
          quantity: number
          quantity_received?: number | null
          receive_note?: string | null
          tenant_id: number
          transfer_id: number
          unit: string
          unit_cost_at_ship?: number | null
        }
        Update: {
          id?: never
          ingredient_id?: number
          quantity?: number
          quantity_received?: number | null
          receive_note?: string | null
          tenant_id?: number
          transfer_id?: number
          unit?: string
          unit_cost_at_ship?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          created_at: string
          created_by: string
          from_branch_id: number
          from_location_id: number | null
          id: number
          journal_entry_id: number | null
          notes: string | null
          receive_started_at: string | null
          received_at: string | null
          shipped_at: string | null
          status: string
          tenant_id: number
          to_branch_id: number
          to_location_id: number | null
          transfer_number: string
          updated_at: string
          vehicle_info: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          from_branch_id: number
          from_location_id?: number | null
          id?: never
          journal_entry_id?: number | null
          notes?: string | null
          receive_started_at?: string | null
          received_at?: string | null
          shipped_at?: string | null
          status?: string
          tenant_id: number
          to_branch_id: number
          to_location_id?: number | null
          transfer_number: string
          updated_at?: string
          vehicle_info?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          from_branch_id?: number
          from_location_id?: number | null
          id?: never
          journal_entry_id?: number | null
          notes?: string | null
          receive_started_at?: string | null
          received_at?: string | null
          shipped_at?: string | null
          status?: string
          tenant_id?: number
          to_branch_id?: number
          to_location_id?: number | null
          transfer_number?: string
          updated_at?: string
          vehicle_info?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktake_conflicts: {
        Row: {
          client_payload: Json
          conflict_type: string
          id: number
          ingredient_id: number
          resolution: string | null
          resolution_note: string | null
          resolution_qty: number | null
          resolved_at: string | null
          resolved_by: string | null
          round_no: number
          server_payload: Json | null
          session_id: number
          submitted_at: string
          submitted_by: string | null
          tenant_id: number
        }
        Insert: {
          client_payload: Json
          conflict_type: string
          id?: never
          ingredient_id: number
          resolution?: string | null
          resolution_note?: string | null
          resolution_qty?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          round_no: number
          server_payload?: Json | null
          session_id: number
          submitted_at?: string
          submitted_by?: string | null
          tenant_id: number
        }
        Update: {
          client_payload?: Json
          conflict_type?: string
          id?: never
          ingredient_id?: number
          resolution?: string | null
          resolution_note?: string | null
          resolution_qty?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          round_no?: number
          server_payload?: Json | null
          session_id?: number
          submitted_at?: string
          submitted_by?: string | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_conflicts_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_conflicts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stocktake_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_conflicts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktake_drafts: {
        Row: {
          draft_counts: Json
          last_saved_at: string
          saved_by: string | null
          session_id: number
        }
        Insert: {
          draft_counts?: Json
          last_saved_at?: string
          saved_by?: string | null
          session_id: number
        }
        Update: {
          draft_counts?: Json
          last_saved_at?: string
          saved_by?: string | null
          session_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_drafts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "stocktake_sessions"
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
          location_id: number | null
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
          location_id?: number | null
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
          location_id?: number | null
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
            foreignKeyName: "stocktake_sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
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
      stocktake_zone_locks: {
        Row: {
          acquired_at: string
          expires_at: string
          id: number
          last_heartbeat_at: string
          locked_by: string
          session_id: number
          tenant_id: number
          zone_id: string
        }
        Insert: {
          acquired_at?: string
          expires_at: string
          id?: never
          last_heartbeat_at?: string
          locked_by: string
          session_id: number
          tenant_id: number
          zone_id: string
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          id?: never
          last_heartbeat_at?: string
          locked_by?: string
          session_id?: number
          tenant_id?: number
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_zone_locks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stocktake_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_zone_locks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_credit_notes: {
        Row: {
          amount: number
          applied_amount: number
          applied_at: string | null
          created_at: string
          created_by: string
          credit_number: string
          id: number
          invoice_id: number | null
          kind: string
          notes: string | null
          return_id: number
          status: string
          supplier_id: number
          tenant_id: number
        }
        Insert: {
          amount: number
          applied_amount?: number
          applied_at?: string | null
          created_at?: string
          created_by: string
          credit_number: string
          id?: never
          invoice_id?: number | null
          kind: string
          notes?: string | null
          return_id: number
          status?: string
          supplier_id: number
          tenant_id: number
        }
        Update: {
          amount?: number
          applied_amount?: number
          applied_at?: string | null
          created_at?: string
          created_by?: string
          credit_number?: string
          id?: never
          invoice_id?: number | null
          kind?: string
          notes?: string | null
          return_id?: number
          status?: string
          supplier_id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_credit_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credit_notes_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "supplier_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credit_notes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credit_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          created_at: string
          created_by: string
          credit_applied_amount: number
          due_date: string | null
          grn_id: number | null
          id: number
          invoice_date: string
          invoice_number: string
          journal_entry_id: number | null
          matching_notes: string | null
          matching_status: string
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
          credit_applied_amount?: number
          due_date?: string | null
          grn_id?: number | null
          id?: never
          invoice_date: string
          invoice_number: string
          journal_entry_id?: number | null
          matching_notes?: string | null
          matching_status?: string
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
          credit_applied_amount?: number
          due_date?: string | null
          grn_id?: number | null
          id?: never
          invoice_date?: string
          invoice_number?: string
          journal_entry_id?: number | null
          matching_notes?: string | null
          matching_status?: string
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
            foreignKeyName: "supplier_invoices_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
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
      supplier_items: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          ingredient_id: number
          is_active: boolean
          notes: string | null
          pack_size: number | null
          pack_uom: string | null
          supplier_id: number
          supplier_sku_code: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          ingredient_id: number
          is_active?: boolean
          notes?: string | null
          pack_size?: number | null
          pack_uom?: string | null
          supplier_id: number
          supplier_sku_code: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          ingredient_id?: number
          is_active?: boolean
          notes?: string | null
          pack_size?: number | null
          pack_uom?: string | null
          supplier_id?: number
          supplier_sku_code?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_items_tenant_id_fkey"
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
          journal_entry_id: number | null
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
          journal_entry_id?: number | null
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
          journal_entry_id?: number | null
          payment_date?: string
          payment_method?: string
          reference_note?: string | null
          supplier_invoice_id?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
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
      supplier_price_list: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          effective_to: string | null
          id: number
          ingredient_id: number
          lead_time_days: number | null
          min_order_qty: number | null
          priority: number
          source: string
          source_ref: Json | null
          supplier_id: number
          tenant_id: number
          unit_price: number
          uom: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: never
          ingredient_id: number
          lead_time_days?: number | null
          min_order_qty?: number | null
          priority?: number
          source: string
          source_ref?: Json | null
          supplier_id: number
          tenant_id: number
          unit_price: number
          uom: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: never
          ingredient_id?: number
          lead_time_days?: number | null
          min_order_qty?: number | null
          priority?: number
          source?: string
          source_ref?: Json | null
          supplier_id?: number
          tenant_id?: number
          unit_price?: number
          uom?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_price_list_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_list_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_price_list_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_return_items: {
        Row: {
          grn_item_id: number | null
          id: number
          ingredient_id: number
          photo_url: string | null
          quantity: number
          reason_detail: string | null
          return_id: number
          stock_movement_id: number | null
          tenant_id: number
          total_cost: number
          unit: string
          unit_cost: number
        }
        Insert: {
          grn_item_id?: number | null
          id?: never
          ingredient_id: number
          photo_url?: string | null
          quantity: number
          reason_detail?: string | null
          return_id: number
          stock_movement_id?: number | null
          tenant_id: number
          total_cost: number
          unit: string
          unit_cost: number
        }
        Update: {
          grn_item_id?: number | null
          id?: never
          ingredient_id?: number
          photo_url?: string | null
          quantity?: number
          reason_detail?: string | null
          return_id?: number
          stock_movement_id?: number | null
          tenant_id?: number
          total_cost?: number
          unit?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_return_items_grn_item_id_fkey"
            columns: ["grn_item_id"]
            isOneToOne: false
            referencedRelation: "grn_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_return_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "supplier_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_return_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_returns: {
        Row: {
          branch_id: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string
          grn_id: number | null
          id: number
          notes: string | null
          reason: string
          resolution: string
          return_number: string
          source: string
          status: string
          supplier_id: number
          tenant_id: number
          total_value: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by: string
          grn_id?: number | null
          id?: never
          notes?: string | null
          reason: string
          resolution?: string
          return_number: string
          source: string
          status?: string
          supplier_id: number
          tenant_id: number
          total_value?: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string
          grn_id?: number | null
          id?: never
          notes?: string | null
          reason?: string
          resolution?: string
          return_number?: string
          source?: string
          status?: string
          supplier_id?: number
          tenant_id?: number
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_returns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "goods_received_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_tenant_id_fkey"
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
      tax_invoices: {
        Row: {
          branch_id: number
          buyer_address: string | null
          buyer_name: string | null
          buyer_tax_code: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string
          id: number
          invoice_number: string | null
          issued_at: string | null
          order_id: number
          provider: string
          provider_data: Json | null
          provider_ref: string | null
          replaced_by: number | null
          status: string
          subtotal: number
          tenant_id: number
          total_amount: number
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          branch_id: number
          buyer_address?: string | null
          buyer_name?: string | null
          buyer_tax_code?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by: string
          id?: never
          invoice_number?: string | null
          issued_at?: string | null
          order_id: number
          provider?: string
          provider_data?: Json | null
          provider_ref?: string | null
          replaced_by?: number | null
          status?: string
          subtotal: number
          tenant_id: number
          total_amount: number
          updated_at?: string
          vat_amount: number
          vat_rate?: number
        }
        Update: {
          branch_id?: number
          buyer_address?: string | null
          buyer_name?: string | null
          buyer_tax_code?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string
          id?: never
          invoice_number?: string | null
          issued_at?: string | null
          order_id?: number
          provider?: string
          provider_data?: Json | null
          provider_ref?: string | null
          replaced_by?: number | null
          status?: string
          subtotal?: number
          tenant_id?: number
          total_amount?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
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
      user_trust_score: {
        Row: {
          branch_id: number
          grn_count_30d: number
          last_incident_at: string | null
          score: number
          tenant_id: number
          updated_at: string
          user_id: string
          variance_incidents_30d: number
        }
        Insert: {
          branch_id: number
          grn_count_30d?: number
          last_incident_at?: string | null
          score?: number
          tenant_id: number
          updated_at?: string
          user_id: string
          variance_incidents_30d?: number
        }
        Update: {
          branch_id?: number
          grn_count_30d?: number
          last_incident_at?: string | null
          score?: number
          tenant_id?: number
          updated_at?: string
          user_id?: string
          variance_incidents_30d?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_trust_score_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_trust_score_tenant_id_fkey"
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
          momo_revenue: number | null
          order_count: number | null
          tenant_id: number | null
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
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_food_cost: {
        Row: {
          branch_id: number | null
          food_cost_pct: number | null
          ingredient_cost: number | null
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
          location_id: number | null
          location_kind: string | null
          location_name: string | null
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
            foreignKeyName: "stock_levels_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
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
          transport: string | null
          version: string | null
        }
        Insert: {
          agent_id?: string | null
          branch_id?: number | null
          is_online?: never
          last_seen_at?: string | null
          tenant_id?: number | null
          transport?: string | null
          version?: string | null
        }
        Update: {
          agent_id?: string | null
          branch_id?: number | null
          is_online?: never
          last_seen_at?: string | null
          tenant_id?: number | null
          transport?: string | null
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
            foreignKeyName: "printer_agents_tenant_id_fkey"
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
      _auth_v2_is_tenant_wide_role: {
        Args: { p_role: string }
        Returns: boolean
      }
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
      acquire_zone_lock: {
        Args: {
          p_session_id: number
          p_ttl_seconds?: number
          p_zone_id: string
        }
        Returns: Json
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
      append_order_items: {
        Args: { p_items: Json; p_order_id: number }
        Returns: Json
      }
      apply_credit_note_to_invoice: {
        Args: { p_amount: number; p_credit_id: number; p_invoice_id: number }
        Returns: Json
      }
      apply_template_to_user: {
        Args: {
          p_branch_id: number
          p_target_user: string
          p_template_id: number
          p_valid_from?: string
          p_valid_until?: string
        }
        Returns: number
      }
      approve_waste: {
        Args: { p_decision: string; p_issue_id: number; p_note?: string }
        Returns: undefined
      }
      assign_auditor: {
        Args: {
          p_auditor_branch_id?: number
          p_auditor_id: string
          p_session_id: number
        }
        Returns: undefined
      }
      auth_area_id: { Args: never; Returns: number }
      auth_branch_id: { Args: never; Returns: number }
      auth_role: { Args: never; Returns: string }
      auth_tenant_id: { Args: never; Returns: number }
      auto_close_periods: { Args: never; Returns: number }
      auto_post_journal: {
        Args: {
          p_branch_id: number
          p_description: string
          p_entry_date?: string
          p_lines: Json
          p_posted_by?: string
          p_reference_id: number
          p_reference_type: string
          p_tenant_id: number
        }
        Returns: number
      }
      backfill_permissions_from_role: {
        Args: never
        Returns: {
          perm_rows_inserted: number
          positions_set: number
          total_profiles: number
        }[]
      }
      bump_kds_ticket: { Args: { p_ticket_id: number }; Returns: string }
      can_access_branch: { Args: { p_branch_id: number }; Returns: boolean }
      cancel_order: {
        Args: { p_order_id: number; p_reason: string }
        Returns: Json
      }
      cancel_production_order: { Args: { p_order_id: number }; Returns: Json }
      check_order_ready: { Args: { p_order_id: number }; Returns: undefined }
      claim_print_job: {
        Args: { p_agent_id: string; p_job_id: number }
        Returns: boolean
      }
      close_fiscal_period: {
        Args: {
          p_month: number
          p_notes?: string
          p_tenant_id: number
          p_year: number
        }
        Returns: Json
      }
      close_period_hard: {
        Args: { p_month: number; p_tenant_id: number; p_year: number }
        Returns: undefined
      }
      close_period_soft: {
        Args: { p_month: number; p_tenant_id: number; p_year: number }
        Returns: undefined
      }
      close_pos_session: {
        Args: { p_closing_cash: number; p_note?: string; p_session_id: number }
        Returns: Json
      }
      close_recount_round: {
        Args: { p_round_no: number; p_session_id: number }
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
      compute_branch_daily_waste_caps: { Args: never; Returns: number }
      compute_user_trust_score: {
        Args: { p_branch_id: number; p_user_id: string }
        Returns: number
      }
      configure_express_window: {
        Args: {
          p_branch_id: number
          p_enabled: boolean
          p_end_time?: string
          p_start_time?: string
        }
        Returns: undefined
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
      confirm_production_order: { Args: { p_order_id: number }; Returns: Json }
      confirm_stock_issue: { Args: { p_issue_id: number }; Returns: Json }
      confirm_supplier_return: { Args: { p_return_id: number }; Returns: Json }
      consume_stock_for_order: { Args: { p_order_id: number }; Returns: Json }
      consume_stock_for_order_service: {
        Args: { p_actor_id?: string; p_order_id: number }
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
      create_production_order: {
        Args: {
          p_branch_id: number
          p_items?: Json
          p_notes?: string
          p_production_number: string
        }
        Returns: Json
      }
      create_stock_transfer_draft: {
        Args: {
          p_from_branch_id: number
          p_from_location_id?: number
          p_lines?: Json
          p_notes?: string
          p_to_branch_id: number
          p_to_location_id?: number
          p_transfer_number: string
          p_vehicle_info?: string
        }
        Returns: Json
      }
      create_stocktake_session: {
        Args: { p_branch_id: number; p_location_id?: number }
        Returns: Json
      }
      create_supplier_payment: {
        Args: {
          p_amount: number
          p_payment_method: string
          p_reference_note?: string
          p_supplier_invoice_id: number
          p_tenant_id: number
        }
        Returns: Json
      }
      create_supplier_return_from_grn: {
        Args: {
          p_grn_id: number
          p_notes?: string
          p_reason?: string
          p_resolution?: string
        }
        Returns: Json
      }
      create_supplier_return_from_stock: {
        Args: {
          p_branch_id: number
          p_lines: Json
          p_notes: string
          p_reason: string
          p_resolution: string
          p_supplier_id: number
        }
        Returns: Json
      }
      create_waste_entry: {
        Args: {
          p_branch_id: number
          p_items: Json
          p_location_id: number
          p_notes?: string
          p_source_ref?: Json
          p_source_type?: string
        }
        Returns: Json
      }
      create_waste_from_order: {
        Args: {
          p_items: Json
          p_location_id: number
          p_note?: string
          p_order_id: number
          p_source_type: string
        }
        Returns: Json
      }
      current_position: { Args: never; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      enable_offline_for_session: {
        Args: { p_session_id: number }
        Returns: Json
      }
      enqueue_cancel_ticket_print: {
        Args: { p_order_item_id: number; p_reason: string }
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
      escalate_round_4: {
        Args: {
          p_final_qty: number
          p_ingredient_id: number
          p_note: string
          p_session_id: number
        }
        Returns: undefined
      }
      extend_express_window: {
        Args: { p_branch_id: number; p_minutes: number; p_note: string }
        Returns: string
      }
      finalize_paid_order: {
        Args: { p_actor_id?: string; p_order_id: number }
        Returns: undefined
      }
      finalize_stocktake: { Args: { p_session_id: number }; Returns: Json }
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
      get_grn_price_baseline: {
        Args: { p_ingredient_id: number; p_supplier_id: number; p_uom?: string }
        Returns: {
          avg_30d: number
          baseline_source: string
          last_seen_at: string
          sample_n: number
        }[]
      }
      get_ingredient_abc_class: {
        Args: { p_branch_id: number; p_ingredient_id: number }
        Returns: string
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
          location_id: number
          location_name: string
          reorder_point: number
          severity_rank: number
          shortage_ratio: number
        }[]
      }
      get_inventory_dashboard: { Args: { p_branch_id: number }; Returns: Json }
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
      gl_reconciliation: {
        Args: { p_month: number; p_tenant_id: number; p_year: number }
        Returns: Json
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
      grn_is_auto_approvable: { Args: { p_grn_id: number }; Returns: Json }
      has_permission: {
        Args: { p_branch_id: number; p_key: string }
        Returns: boolean
      }
      has_permission_any: { Args: { p_key: string }; Returns: boolean }
      has_position: { Args: { p_code: string }; Returns: boolean }
      heartbeat_zone_lock: {
        Args: {
          p_session_id: number
          p_ttl_seconds?: number
          p_zone_id: string
        }
        Returns: string
      }
      inventory_requires_manual_review: {
        Args: { p_ingredient_id: number }
        Returns: boolean
      }
      inventory_shift_key: {
        Args: { p_at?: string; p_branch_id: number }
        Returns: string
      }
      is_feature_enabled: {
        Args: { p_branch_id: number; p_flag_key: string }
        Returns: boolean
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      override_grn_hardblock: {
        Args: {
          p_evidence_url: string
          p_grn_item_id: number
          p_note: string
          p_reason_code: string
        }
        Returns: number
      }
      period_status_at: {
        Args: { p_at: string; p_tenant_id: number }
        Returns: string
      }
      pos_enrich_order_sides: {
        Args: { p_main_item_id: number; p_sides: Json; p_tenant_id: number }
        Returns: {
          enriched_sides: Json
          sides_sum: number
        }[]
      }
      post_payroll_journal: {
        Args: { p_payroll_period_id: number }
        Returns: number
      }
      recall_kds_ticket: { Args: { p_ticket_id: number }; Returns: string }
      recompute_supplier_invoice_matching: {
        Args: { p_invoice_id: number }
        Returns: Json
      }
      refresh_abc_classification: { Args: never; Returns: number }
      refresh_finance_views: { Args: never; Returns: undefined }
      refresh_inventory_dashboard: { Args: never; Returns: string }
      release_table: { Args: { p_table_id: number }; Returns: undefined }
      release_zone_lock: {
        Args: { p_session_id: number; p_zone_id: string }
        Returns: boolean
      }
      reopen_period: {
        Args: { p_month: number; p_tenant_id: number; p_year: number }
        Returns: undefined
      }
      resolve_po_price: {
        Args: { p_ingredient_id: number; p_supplier_id: number; p_uom: string }
        Returns: {
          effective_from: string
          lead_time_days: number
          min_order_qty: number
          source: string
          unit_price: number
        }[]
      }
      resolve_po_prices_batch: {
        Args: { p_items: Json; p_supplier_id: number }
        Returns: {
          effective_from: string
          ingredient_id: number
          lead_time_days: number
          min_order_qty: number
          source: string
          unit_price: number
          uom: string
        }[]
      }
      resolve_stocktake_conflict: {
        Args: {
          p_conflict_id: number
          p_manual_qty?: number
          p_note?: string
          p_resolution: string
        }
        Returns: Json
      }
      retry_print_job: { Args: { p_job_id: number }; Returns: boolean }
      revoke_permission: {
        Args: {
          p_branch_id: number
          p_permission_key: string
          p_target_user: string
        }
        Returns: number
      }
      rotate_branch_override_code: {
        Args: { p_branch_id: number; p_new_code: string }
        Returns: undefined
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
      seed_chart_of_accounts: {
        Args: { p_tenant_id: number }
        Returns: undefined
      }
      seed_posting_rules: { Args: { p_tenant_id: number }; Returns: undefined }
      set_branch_kind: {
        Args: { p_branch_id: number; p_kind?: string }
        Returns: undefined
      }
      start_stocktake: {
        Args: {
          p_auditor_id?: string
          p_blind_mode?: boolean
          p_branch_id: number
          p_location_id?: number
          p_mode?: string
          p_threshold_pct?: number
          p_threshold_vnd?: number
        }
        Returns: Json
      }
      stock_transfer_confirm_receive: {
        Args: { p_transfer_id: number }
        Returns: Json
      }
      stock_transfer_confirm_ship: {
        Args: { p_transfer_id: number }
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
      stock_transfer_mark_in_transit: {
        Args: { p_transfer_id: number }
        Returns: Json
      }
      stock_transfer_receive: {
        Args: { p_items?: Json; p_transfer_id: number }
        Returns: Json
      }
      submit_count_round: {
        Args: { p_counts: Json; p_round_no: number; p_session_id: number }
        Returns: Json
      }
      sync_insurance_base: {
        Args: { p_employee_id: number }
        Returns: undefined
      }
      sync_missing_permissions_from_template: {
        Args: never
        Returns: {
          rows_added: number
        }[]
      }
      toggle_category_active: { Args: { p_id: number }; Returns: boolean }
      toggle_item_active: { Args: { p_id: number }; Returns: boolean }
      toggle_profile_active: { Args: { p_target_id: string }; Returns: boolean }
      transfer_order_table: {
        Args: { p_new_table_id: number; p_order_id: number }
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
      transition_supplier_return: {
        Args: { p_notes?: string; p_return_id: number; p_target_status: string }
        Returns: Json
      }
      try_auto_approve_grn: { Args: { p_grn_id: number }; Returns: Json }
      update_my_profile: {
        Args: { p_avatar_url?: string; p_full_name?: string; p_phone?: string }
        Returns: undefined
      }
      update_pos_order_status: {
        Args: { p_new_status: string; p_order_id: number }
        Returns: Json
      }
      upsert_production_recipe_lines: {
        Args: { p_finished_good_id: number; p_lines: Json }
        Returns: Json
      }
      upsert_recipe_lines: {
        Args: { p_lines: Json; p_menu_item_id: number }
        Returns: Json
      }
      validate_journal_balance: {
        Args: { p_entry_id: number }
        Returns: boolean
      }
      verify_branch_override_code: {
        Args: { p_branch_id: number; p_code: string }
        Returns: boolean
      }
      void_order_item: {
        Args: { p_order_item_id: number; p_reason: string }
        Returns: Json
      }
      weekly_grn_override_report: { Args: never; Returns: number }
      weekly_waste_report: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
