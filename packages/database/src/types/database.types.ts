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
      annual_leave_entitlements: {
        Row: {
          created_at: string
          employee_id: number
          entitlement_days: number
          id: number
          notes: string | null
          tenant_id: number
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          employee_id: number
          entitlement_days?: number
          id?: never
          notes?: string | null
          tenant_id: number
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          employee_id?: number
          entitlement_days?: number
          id?: never
          notes?: string | null
          tenant_id?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "annual_leave_entitlements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annual_leave_entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
      attendance_checklist_items: {
        Row: {
          allows_photo: boolean
          attendance_record_id: number
          completed_at: string | null
          created_at: string
          done_definition: string
          id: number
          is_done: boolean
          is_required: boolean
          phase: string
          photo_path: string | null
          scope: string
          sort_order: number
          task_kind: string
          template_item_id: number | null
          tenant_id: number
          title: string
          updated_at: string
        }
        Insert: {
          allows_photo?: boolean
          attendance_record_id: number
          completed_at?: string | null
          created_at?: string
          done_definition?: string
          id?: never
          is_done?: boolean
          is_required?: boolean
          phase?: string
          photo_path?: string | null
          scope?: string
          sort_order: number
          task_kind?: string
          template_item_id?: number | null
          tenant_id: number
          title: string
          updated_at?: string
        }
        Update: {
          allows_photo?: boolean
          attendance_record_id?: number
          completed_at?: string | null
          created_at?: string
          done_definition?: string
          id?: never
          is_done?: boolean
          is_required?: boolean
          phase?: string
          photo_path?: string | null
          scope?: string
          sort_order?: number
          task_kind?: string
          template_item_id?: number | null
          tenant_id?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_checklist_items_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_checklist_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "shift_checklist_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_checklist_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_consumption_report_lines: {
        Row: {
          created_at: string
          default_item_id: number | null
          entry_unit_id: number
          id: number
          ingredient_id: number
          note: string | null
          quantity: number
          report_id: number
          sort_order: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_item_id?: number | null
          entry_unit_id: number
          id?: never
          ingredient_id: number
          note?: string | null
          quantity: number
          report_id: number
          sort_order?: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_item_id?: number | null
          entry_unit_id?: number
          id?: never
          ingredient_id?: number
          note?: string | null
          quantity?: number
          report_id?: number
          sort_order?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_consumption_report_lines_default_item_id_fkey"
            columns: ["default_item_id"]
            isOneToOne: false
            referencedRelation: "shift_checklist_consumption_default_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_consumption_report_lines_entry_unit_tenant_fkey"
            columns: ["entry_unit_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "attendance_consumption_report_lines_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_consumption_report_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "attendance_consumption_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_consumption_report_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_consumption_reports: {
        Row: {
          attendance_record_id: number
          branch_id: number
          created_at: string
          employee_id: number
          id: number
          no_consumption: boolean
          note: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          stock_issue_id: number | null
          submitted_at: string | null
          submitted_by: string | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          attendance_record_id: number
          branch_id: number
          created_at?: string
          employee_id: number
          id?: never
          no_consumption?: boolean
          note?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          stock_issue_id?: number | null
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          attendance_record_id?: number
          branch_id?: number
          created_at?: string
          employee_id?: number
          id?: never
          no_consumption?: boolean
          note?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          stock_issue_id?: number | null
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_consumption_reports_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_consumption_reports_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_consumption_reports_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "attendance_consumption_reports_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_consumption_reports_stock_issue_id_fkey"
            columns: ["stock_issue_id"]
            isOneToOne: false
            referencedRelation: "stock_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_consumption_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          branch_id: number | null
          check_in: string | null
          check_in_photo_path: string | null
          check_out: string | null
          checklist_template_id: number | null
          checkout_approval_note: string | null
          checkout_approval_target_roles: string[]
          checkout_approved_at: string | null
          checkout_approved_by: string | null
          checkout_requested_at: string | null
          checkout_requested_by_role: string | null
          created_at: string
          date: string
          employee_id: number
          id: number
          lat: number | null
          lng: number | null
          method: string | null
          note: string | null
          scheduled_end_at: string | null
          scheduled_start_at: string | null
          shift_assignment_id: number | null
          shift_id: number
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id?: number | null
          check_in?: string | null
          check_in_photo_path?: string | null
          check_out?: string | null
          checklist_template_id?: number | null
          checkout_approval_note?: string | null
          checkout_approval_target_roles?: string[]
          checkout_approved_at?: string | null
          checkout_approved_by?: string | null
          checkout_requested_at?: string | null
          checkout_requested_by_role?: string | null
          created_at?: string
          date: string
          employee_id: number
          id?: never
          lat?: number | null
          lng?: number | null
          method?: string | null
          note?: string | null
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          shift_assignment_id?: number | null
          shift_id: number
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number | null
          check_in?: string | null
          check_in_photo_path?: string | null
          check_out?: string | null
          checklist_template_id?: number | null
          checkout_approval_note?: string | null
          checkout_approval_target_roles?: string[]
          checkout_approved_at?: string | null
          checkout_approved_by?: string | null
          checkout_requested_at?: string | null
          checkout_requested_by_role?: string | null
          created_at?: string
          date?: string
          employee_id?: number
          id?: never
          lat?: number | null
          lng?: number | null
          method?: string | null
          note?: string | null
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          shift_assignment_id?: number | null
          shift_id?: number
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
            foreignKeyName: "attendance_records_checklist_template_id_fkey"
            columns: ["checklist_template_id"]
            isOneToOne: false
            referencedRelation: "shift_checklist_templates"
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
            foreignKeyName: "attendance_records_shift_assignment_id_fkey"
            columns: ["shift_assignment_id"]
            isOneToOne: false
            referencedRelation: "shift_assignments"
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
      auth_access_role_capabilities: {
        Row: {
          permission_key: string
          role_code: string
        }
        Insert: {
          permission_key: string
          role_code: string
        }
        Update: {
          permission_key?: string
          role_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_access_role_capabilities_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permission_keys"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "auth_access_role_capabilities_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "auth_access_roles"
            referencedColumns: ["code"]
          },
        ]
      }
      auth_access_roles: {
        Row: {
          allowed_scope: string
          code: string
          label_vi: string
        }
        Insert: {
          allowed_scope: string
          code: string
          label_vi: string
        }
        Update: {
          allowed_scope?: string
          code?: string
          label_vi?: string
        }
        Relationships: []
      }
      auth_role_binding_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          at: string
          branch_id: number | null
          id: number
          role_code: string
          scope_type: string
          target_user_id: string
          tenant_id: number
        }
        Insert: {
          action: string
          actor_user_id: string
          at?: string
          branch_id?: number | null
          id?: never
          role_code: string
          scope_type: string
          target_user_id: string
          tenant_id: number
        }
        Update: {
          action?: string
          actor_user_id?: string
          at?: string
          branch_id?: number | null
          id?: never
          role_code?: string
          scope_type?: string
          target_user_id?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "auth_role_binding_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_role_bindings: {
        Row: {
          branch_id: number | null
          granted_at: string
          granted_by: string | null
          id: number
          role_code: string
          scope_type: string
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
          role_code: string
          scope_type: string
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
          role_code?: string
          scope_type?: string
          tenant_id?: number
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auth_role_bindings_branch_tenant_fkey"
            columns: ["branch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "auth_role_bindings_branch_tenant_fkey"
            columns: ["branch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id", "tenant_id"]
          },
          {
            foreignKeyName: "auth_role_bindings_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "auth_access_roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "auth_role_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auth_role_bindings_user_tenant_fkey"
            columns: ["user_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      bank_transaction_expense_matches: {
        Row: {
          created_at: string
          created_by: string | null
          expense_id: number
          id: number
          tenant_id: number
          webhook_event_id: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expense_id: number
          id?: never
          tenant_id: number
          webhook_event_id: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expense_id?: number
          id?: never
          tenant_id?: number
          webhook_event_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "bank_transaction_expense_matches_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_expense_matches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_expense_matches_webhook_event_id_fkey"
            columns: ["webhook_event_id"]
            isOneToOne: false
            referencedRelation: "webhook_events"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transaction_reconciliation_matches: {
        Row: {
          bank_transaction_id: number
          created_at: string
          created_by: string | null
          expense_id: number | null
          id: number
          matched_amount: number
          payment_id: number | null
          refund_id: number | null
          supplier_payment_id: number | null
          tenant_id: number
        }
        Insert: {
          bank_transaction_id: number
          created_at?: string
          created_by?: string | null
          expense_id?: number | null
          id?: never
          matched_amount: number
          payment_id?: number | null
          refund_id?: number | null
          supplier_payment_id?: number | null
          tenant_id: number
        }
        Update: {
          bank_transaction_id?: number
          created_at?: string
          created_by?: string | null
          expense_id?: number | null
          id?: never
          matched_amount?: number
          payment_id?: number | null
          refund_id?: number | null
          supplier_payment_id?: number | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "bank_transaction_reconciliation_matche_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_reconciliation_matche_supplier_payment_id_fkey"
            columns: ["supplier_payment_id"]
            isOneToOne: false
            referencedRelation: "supplier_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_reconciliation_matches_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_reconciliation_matches_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_reconciliation_matches_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_reconciliation_matches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          account_number: string | null
          amount: number
          balance_after: number | null
          code: string | null
          content: string | null
          created_at: string
          id: number
          ingest_source: string
          occurred_at: string
          provider_transaction_id: string
          raw_payload: Json
          reference_code: string | null
          tenant_id: number
          transfer_type: string
          updated_at: string
          webhook_event_id: number | null
        }
        Insert: {
          account_number?: string | null
          amount: number
          balance_after?: number | null
          code?: string | null
          content?: string | null
          created_at?: string
          id?: never
          ingest_source: string
          occurred_at: string
          provider_transaction_id: string
          raw_payload: Json
          reference_code?: string | null
          tenant_id: number
          transfer_type: string
          updated_at?: string
          webhook_event_id?: number | null
        }
        Update: {
          account_number?: string | null
          amount?: number
          balance_after?: number | null
          code?: string | null
          content?: string | null
          created_at?: string
          id?: never
          ingest_source?: string
          occurred_at?: string
          provider_transaction_id?: string
          raw_payload?: Json
          reference_code?: string | null
          tenant_id?: number
          transfer_type?: string
          updated_at?: string
          webhook_event_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_webhook_event_id_fkey"
            columns: ["webhook_event_id"]
            isOneToOne: true
            referencedRelation: "webhook_events"
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
          {
            foreignKeyName: "branch_daily_waste_cap_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
        ]
      }
      branch_day_state: {
        Row: {
          branch_id: number
          business_date: string
          cash_recon: Json
          closed_at: string
          closed_by: string
          created_at: string
          id: number
          note: string | null
          opened_at: string | null
          status: string
          summary: Json
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          business_date: string
          cash_recon?: Json
          closed_at?: string
          closed_by: string
          created_at?: string
          id?: never
          note?: string | null
          opened_at?: string | null
          status?: string
          summary?: Json
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          business_date?: string
          cash_recon?: Json
          closed_at?: string
          closed_by?: string
          created_at?: string
          id?: never
          note?: string | null
          opened_at?: string | null
          status?: string
          summary?: Json
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_day_state_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_day_state_branch_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
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
      branch_menu_item_daily_holds: {
        Row: {
          branch_id: number
          committed_at: string | null
          created_at: string
          expires_at: string
          held_by: string
          hold_token: string
          id: number
          limit_date: string
          menu_item_id: number
          order_id: number | null
          quantity: number
          released_at: string | null
          source: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          committed_at?: string | null
          created_at?: string
          expires_at: string
          held_by: string
          hold_token: string
          id?: never
          limit_date?: string
          menu_item_id: number
          order_id?: number | null
          quantity: number
          released_at?: string | null
          source?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          committed_at?: string | null
          created_at?: string
          expires_at?: string
          held_by?: string
          hold_token?: string
          id?: never
          limit_date?: string
          menu_item_id?: number
          order_id?: number | null
          quantity?: number
          released_at?: string | null
          source?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_menu_item_daily_holds_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_menu_item_daily_holds_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "branch_menu_item_daily_holds_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_menu_item_daily_holds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_menu_item_daily_holds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
          stock_allowance_quantity: number | null
          stock_capacity: number | null
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
          stock_allowance_quantity?: number | null
          stock_capacity?: number | null
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
          stock_allowance_quantity?: number | null
          stock_capacity?: number | null
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
      branch_network_gate_bypasses: {
        Row: {
          activated_at: string
          activated_by: string
          bound_pos_session_id: number | null
          branch_id: number
          duration_kind: string
          expires_at: string
          id: number
          note: string | null
          revoked_at: string | null
          revoked_by: string | null
          tenant_id: number
        }
        Insert: {
          activated_at?: string
          activated_by: string
          bound_pos_session_id?: number | null
          branch_id: number
          duration_kind: string
          expires_at: string
          id?: never
          note?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id: number
        }
        Update: {
          activated_at?: string
          activated_by?: string
          bound_pos_session_id?: number | null
          branch_id?: number
          duration_kind?: string
          expires_at?: string
          id?: never
          note?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "branch_network_gate_bypasses_activated_by_fkey"
            columns: ["activated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_network_gate_bypasses_bound_pos_session_id_fkey"
            columns: ["bound_pos_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_network_gate_bypasses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_network_gate_bypasses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "branch_network_gate_bypasses_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_network_gate_bypasses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_revenue_targets: {
        Row: {
          branch_id: number
          created_at: string
          id: number
          reward_tiers: Json
          target_amount: number
          tenant_id: number
          updated_at: string
          updated_by: string | null
          year_month: string
        }
        Insert: {
          branch_id: number
          created_at?: string
          id?: number
          reward_tiers?: Json
          target_amount: number
          tenant_id: number
          updated_at?: string
          updated_by?: string | null
          year_month: string
        }
        Update: {
          branch_id?: number
          created_at?: string
          id?: number
          reward_tiers?: Json
          target_amount?: number
          tenant_id?: number
          updated_at?: string
          updated_by?: string | null
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_revenue_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_revenue_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "branch_revenue_targets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_trusted_egress_ips: {
        Row: {
          branch_id: number
          created_at: string
          first_seen_at: string
          id: number
          ip_address: unknown
          last_seen_at: string
          registered_by_agent_id: string | null
          registered_by_user: string | null
          registered_via: string
          revoked_at: string | null
          revoked_by_user: string | null
          tenant_id: number
        }
        Insert: {
          branch_id: number
          created_at?: string
          first_seen_at?: string
          id?: never
          ip_address: unknown
          last_seen_at?: string
          registered_by_agent_id?: string | null
          registered_by_user?: string | null
          registered_via: string
          revoked_at?: string | null
          revoked_by_user?: string | null
          tenant_id: number
        }
        Update: {
          branch_id?: number
          created_at?: string
          first_seen_at?: string
          id?: never
          ip_address?: unknown
          last_seen_at?: string
          registered_by_agent_id?: string | null
          registered_by_user?: string | null
          registered_via?: string
          revoked_at?: string | null
          revoked_by_user?: string | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "branch_trusted_egress_ips_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_trusted_egress_ips_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "branch_trusted_egress_ips_registered_by_user_fkey"
            columns: ["registered_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_trusted_egress_ips_revoked_by_user_fkey"
            columns: ["revoked_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_trusted_egress_ips_tenant_id_fkey"
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
      employee_weekly_schedules: {
        Row: {
          created_at: string
          effective_from: string
          employee_id: number
          friday_shift_id: number | null
          id: number
          monday_shift_id: number | null
          saturday_shift_id: number | null
          sunday_shift_id: number | null
          tenant_id: number
          thursday_shift_id: number | null
          tuesday_shift_id: number | null
          updated_at: string
          updated_by: string | null
          wednesday_shift_id: number | null
        }
        Insert: {
          created_at?: string
          effective_from: string
          employee_id: number
          friday_shift_id?: number | null
          id?: never
          monday_shift_id?: number | null
          saturday_shift_id?: number | null
          sunday_shift_id?: number | null
          tenant_id: number
          thursday_shift_id?: number | null
          tuesday_shift_id?: number | null
          updated_at?: string
          updated_by?: string | null
          wednesday_shift_id?: number | null
        }
        Update: {
          created_at?: string
          effective_from?: string
          employee_id?: number
          friday_shift_id?: number | null
          id?: never
          monday_shift_id?: number | null
          saturday_shift_id?: number | null
          sunday_shift_id?: number | null
          tenant_id?: number
          thursday_shift_id?: number | null
          tuesday_shift_id?: number | null
          updated_at?: string
          updated_by?: string | null
          wednesday_shift_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_weekly_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_weekly_schedules_friday_shift_id_fkey"
            columns: ["friday_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_weekly_schedules_monday_shift_id_fkey"
            columns: ["monday_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_weekly_schedules_saturday_shift_id_fkey"
            columns: ["saturday_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_weekly_schedules_sunday_shift_id_fkey"
            columns: ["sunday_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_weekly_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_weekly_schedules_thursday_shift_id_fkey"
            columns: ["thursday_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_weekly_schedules_tuesday_shift_id_fkey"
            columns: ["tuesday_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_weekly_schedules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_weekly_schedules_wednesday_shift_id_fkey"
            columns: ["wednesday_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
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
          default_checklist_template_id: number | null
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
          default_checklist_template_id?: number | null
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
          default_checklist_template_id?: number | null
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
            foreignKeyName: "employees_default_checklist_template_id_fkey"
            columns: ["default_checklist_template_id"]
            isOneToOne: false
            referencedRelation: "shift_checklist_templates"
            referencedColumns: ["id"]
          },
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
          pay_basis: string
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
          pay_basis?: string
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
          pay_basis?: string
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
      expenses: {
        Row: {
          amount: number
          branch_id: number | null
          category: string
          created_at: string
          created_by: string | null
          expense_date: string
          id: number
          invoice_attachment_url: string | null
          note: string | null
          paid_at: string | null
          payment_method: string
          subtotal: number
          tenant_id: number
          transfer_content: string | null
          updated_at: string
          vat_amount: number
          vat_breakdown: Json
          vendor_name: string | null
        }
        Insert: {
          amount: number
          branch_id?: number | null
          category: string
          created_at?: string
          created_by?: string | null
          expense_date: string
          id?: never
          invoice_attachment_url?: string | null
          note?: string | null
          paid_at?: string | null
          payment_method?: string
          subtotal: number
          tenant_id: number
          transfer_content?: string | null
          updated_at?: string
          vat_amount: number
          vat_breakdown?: Json
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          branch_id?: number | null
          category?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: never
          invoice_attachment_url?: string | null
          note?: string | null
          paid_at?: string | null
          payment_method?: string
          subtotal?: number
          tenant_id?: number
          transfer_content?: string | null
          updated_at?: string
          vat_amount?: number
          vat_breakdown?: Json
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_qr_codes: {
        Row: {
          branch_id: number
          created_at: string
          created_by: string | null
          id: number
          is_active: boolean
          label: string
          rotated_at: string | null
          table_id: number | null
          tenant_id: number
          token: string
          updated_at: string
        }
        Insert: {
          branch_id: number
          created_at?: string
          created_by?: string | null
          id?: never
          is_active?: boolean
          label: string
          rotated_at?: string | null
          table_id?: number | null
          tenant_id: number
          token: string
          updated_at?: string
        }
        Update: {
          branch_id?: number
          created_at?: string
          created_by?: string | null
          id?: never
          is_active?: boolean
          label?: string
          rotated_at?: string | null
          table_id?: number | null
          tenant_id?: number
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_qr_codes_branch_tenant_fkey"
            columns: ["branch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "feedback_qr_codes_branch_tenant_fkey"
            columns: ["branch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id", "tenant_id"]
          },
          {
            foreignKeyName: "feedback_qr_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_qr_codes_table_scope_fkey"
            columns: ["table_id", "tenant_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id", "tenant_id", "branch_id"]
          },
          {
            foreignKeyName: "feedback_qr_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_rate_buckets: {
        Row: {
          created_at: string
          expires_at: string
          hits: number
          scope_hash: string
          scope_type: string
          updated_at: string
          window_start: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          hits: number
          scope_hash: string
          scope_type: string
          updated_at?: string
          window_start: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          hits?: number
          scope_hash?: string
          scope_type?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      feedbacks: {
        Row: {
          branch_id: number
          client_submission_id: string
          comment: string | null
          created_at: string
          id: number
          qr_code_id: number
          rating: number
          tenant_id: number
        }
        Insert: {
          branch_id: number
          client_submission_id: string
          comment?: string | null
          created_at?: string
          id?: never
          qr_code_id: number
          rating: number
          tenant_id: number
        }
        Update: {
          branch_id?: number
          client_submission_id?: string
          comment?: string | null
          created_at?: string
          id?: never
          qr_code_id?: number
          rating?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_branch_tenant_fkey"
            columns: ["branch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "feedbacks_branch_tenant_fkey"
            columns: ["branch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id", "tenant_id"]
          },
          {
            foreignKeyName: "feedbacks_qr_code_id_fkey"
            columns: ["qr_code_id"]
            isOneToOne: false
            referencedRelation: "feedback_qr_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_fund_entries: {
        Row: {
          bank_delta: number
          cash_delta: number
          created_at: string
          created_by: string
          effective_at: string
          entry_type: string
          id: number
          idempotency_key: string
          reason: string
          tenant_id: number
        }
        Insert: {
          bank_delta?: number
          cash_delta?: number
          created_at?: string
          created_by: string
          effective_at: string
          entry_type: string
          id?: number
          idempotency_key: string
          reason: string
          tenant_id: number
        }
        Update: {
          bank_delta?: number
          cash_delta?: number
          created_at?: string
          created_by?: string
          effective_at?: string
          entry_type?: string
          id?: number
          idempotency_key?: string
          reason?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "finance_fund_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_fund_entries_tenant_id_fkey"
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
          creation_idempotency_key: string | null
          expected_receive_date: string | null
          grn_number: string
          id: number
          location_id: number | null
          notes: string | null
          po_id: number | null
          received_by: string | null
          received_date: string | null
          status: string
          supplier_id: number | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          created_at?: string
          created_by: string
          creation_idempotency_key?: string | null
          expected_receive_date?: string | null
          grn_number: string
          id?: never
          location_id?: number | null
          notes?: string | null
          po_id?: number | null
          received_by?: string | null
          received_date?: string | null
          status?: string
          supplier_id?: number | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          created_at?: string
          created_by?: string
          creation_idempotency_key?: string | null
          expected_receive_date?: string | null
          grn_number?: string
          id?: never
          location_id?: number | null
          notes?: string | null
          po_id?: number | null
          received_by?: string | null
          received_date?: string | null
          status?: string
          supplier_id?: number | null
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
            foreignKeyName: "goods_received_notes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
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
      grn_items: {
        Row: {
          cost_pending: boolean
          entry_to_base_factor: number | null
          entry_unit_code: string | null
          entry_unit_id: number | null
          grn_id: number
          id: number
          ingredient_id: number
          po_applied_quantity: number
          provisional_cost_source: string | null
          purchase_order_item_id: number | null
          received_quantity: number
          rejected_photo_url: string | null
          rejected_quantity: number
          rejection_reason: string | null
          supplier_id: number
          tenant_id: number
          total_cost: number
          unit_cost: number
        }
        Insert: {
          cost_pending?: boolean
          entry_to_base_factor?: number | null
          entry_unit_code?: string | null
          entry_unit_id?: number | null
          grn_id: number
          id?: never
          ingredient_id: number
          po_applied_quantity?: number
          provisional_cost_source?: string | null
          purchase_order_item_id?: number | null
          received_quantity: number
          rejected_photo_url?: string | null
          rejected_quantity?: number
          rejection_reason?: string | null
          supplier_id: number
          tenant_id: number
          total_cost?: number
          unit_cost?: number
        }
        Update: {
          cost_pending?: boolean
          entry_to_base_factor?: number | null
          entry_unit_code?: string | null
          entry_unit_id?: number | null
          grn_id?: number
          id?: never
          ingredient_id?: number
          po_applied_quantity?: number
          provisional_cost_source?: string | null
          purchase_order_item_id?: number | null
          received_quantity?: number
          rejected_photo_url?: string | null
          rejected_quantity?: number
          rejection_reason?: string | null
          supplier_id?: number
          tenant_id?: number
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "grn_items_entry_unit_id_fkey"
            columns: ["entry_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "grn_items_purchase_order_item_tenant_fkey"
            columns: ["purchase_order_item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "grn_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
            foreignKeyName: "ingredient_abc_class_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
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
      ingredient_categories: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: number
          tone_class: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: number
          tone_class?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: number
          tone_class?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_units: {
        Row: {
          anchor_factor: number | null
          anchor_unit_id: number | null
          created_at: string
          id: number
          ingredient_id: number
          is_active: boolean
          is_base: boolean
          sort_order: number
          tenant_id: number
          to_base_factor: number
          unit_id: number
          updated_at: string
        }
        Insert: {
          anchor_factor?: number | null
          anchor_unit_id?: number | null
          created_at?: string
          id?: never
          ingredient_id: number
          is_active?: boolean
          is_base?: boolean
          sort_order?: number
          tenant_id: number
          to_base_factor?: number
          unit_id: number
          updated_at?: string
        }
        Update: {
          anchor_factor?: number | null
          anchor_unit_id?: number | null
          created_at?: string
          id?: never
          ingredient_id?: number
          is_active?: boolean
          is_base?: boolean
          sort_order?: number
          tenant_id?: number
          to_base_factor?: number
          unit_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_units_anchor_unit_id_fkey"
            columns: ["anchor_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_units_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_units_ingredient_tenant_fkey"
            columns: ["ingredient_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ingredient_units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_units_unit_tenant_fkey"
            columns: ["unit_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      ingredients: {
        Row: {
          category: string | null
          category_id: number | null
          created_at: string
          default_fulfill_site_kind: string | null
          id: number
          is_active: boolean
          issue_unit_id: number | null
          item_kind: string
          max_stock_level: number | null
          min_stock_level: number
          name: string
          production_unit_id: number | null
          receipt_unit_id: number | null
          reorder_point: number | null
          shelf_life_days: number | null
          sku: string | null
          storage_type: string
          tenant_id: number
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          category_id?: number | null
          created_at?: string
          default_fulfill_site_kind?: string | null
          id?: never
          is_active?: boolean
          issue_unit_id?: number | null
          item_kind?: string
          max_stock_level?: number | null
          min_stock_level?: number
          name: string
          production_unit_id?: number | null
          receipt_unit_id?: number | null
          reorder_point?: number | null
          shelf_life_days?: number | null
          sku?: string | null
          storage_type?: string
          tenant_id: number
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          category_id?: number | null
          created_at?: string
          default_fulfill_site_kind?: string | null
          id?: never
          is_active?: boolean
          issue_unit_id?: number | null
          item_kind?: string
          max_stock_level?: number | null
          min_stock_level?: number
          name?: string
          production_unit_id?: number | null
          receipt_unit_id?: number | null
          reorder_point?: number | null
          shelf_life_days?: number | null
          sku?: string | null
          storage_type?: string
          tenant_id?: number
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ingredient_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_category_tenant_fkey"
            columns: ["category_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ingredient_categories"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ingredients_issue_unit_fkey"
            columns: ["issue_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_production_unit_fkey"
            columns: ["production_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_receipt_unit_fkey"
            columns: ["receipt_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_cost_close_snapshots: {
        Row: {
          attention_count: number
          closed_at: string
          closed_by: string
          ending_inventory: number
          food_cost: number
          id: number
          idempotency_key: string
          invoice_revaluation: number
          month: number
          opening_inventory: number
          receipt_value: number
          tenant_id: number
          transfer_loss: number
          waiver_reason: string | null
          waste_value: number
          year: number
        }
        Insert: {
          attention_count?: number
          closed_at?: string
          closed_by: string
          ending_inventory: number
          food_cost: number
          id?: never
          idempotency_key: string
          invoice_revaluation: number
          month: number
          opening_inventory: number
          receipt_value: number
          tenant_id: number
          transfer_loss: number
          waiver_reason?: string | null
          waste_value: number
          year: number
        }
        Update: {
          attention_count?: number
          closed_at?: string
          closed_by?: string
          ending_inventory?: number
          food_cost?: number
          id?: never
          idempotency_key?: string
          invoice_revaluation?: number
          month?: number
          opening_inventory?: number
          receipt_value?: number
          tenant_id?: number
          transfer_loss?: number
          waiver_reason?: string | null
          waste_value?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_cost_close_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_cost_origins: {
        Row: {
          cost_status: string
          created_at: string
          effective_at: string
          finalized_quantity: number
          finalized_value: number
          grn_item_id: number | null
          id: number
          ingredient_id: number
          original_quantity: number
          provisional_value: number
          source_id: number
          source_kind: string
          tenant_id: number
        }
        Insert: {
          cost_status?: string
          created_at?: string
          effective_at: string
          finalized_quantity?: number
          finalized_value?: number
          grn_item_id?: number | null
          id?: never
          ingredient_id: number
          original_quantity: number
          provisional_value: number
          source_id: number
          source_kind: string
          tenant_id: number
        }
        Update: {
          cost_status?: string
          created_at?: string
          effective_at?: string
          finalized_quantity?: number
          finalized_value?: number
          grn_item_id?: number | null
          id?: never
          ingredient_id?: number
          original_quantity?: number
          provisional_value?: number
          source_id?: number
          source_kind?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_cost_origins_grn_item_id_fkey"
            columns: ["grn_item_id"]
            isOneToOne: false
            referencedRelation: "grn_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_cost_origins_ingredient_id_tenant_id_fkey"
            columns: ["ingredient_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "inventory_cost_origins_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_assignments: {
        Row: {
          assigned_by: string
          branch_id: number
          created_at: string
          employee_id: number
          id: number
          ingredient_id: number
          is_active: boolean
          location_id: number
          shift_id: number | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          assigned_by: string
          branch_id: number
          created_at?: string
          employee_id: number
          id?: never
          ingredient_id: number
          is_active?: boolean
          location_id: number
          shift_id?: number | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          assigned_by?: string
          branch_id?: number
          created_at?: string
          employee_id?: number
          id?: never
          ingredient_id?: number
          is_active?: boolean
          location_id?: number
          shift_id?: number | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_assignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_assignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "inventory_count_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_assignments_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_slip_lines: {
        Row: {
          counted_quantity: number
          entry_unit_id: number | null
          id: number
          ingredient_id: number
          note: string | null
          slip_id: number
          system_quantity: number
          tenant_id: number
          variance: number | null
        }
        Insert: {
          counted_quantity: number
          entry_unit_id?: number | null
          id?: never
          ingredient_id: number
          note?: string | null
          slip_id: number
          system_quantity: number
          tenant_id: number
          variance?: number | null
        }
        Update: {
          counted_quantity?: number
          entry_unit_id?: number | null
          id?: never
          ingredient_id?: number
          note?: string | null
          slip_id?: number
          system_quantity?: number
          tenant_id?: number
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_slip_lines_entry_unit_id_fkey"
            columns: ["entry_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_slip_lines_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_slip_lines_slip_id_fkey"
            columns: ["slip_id"]
            isOneToOne: false
            referencedRelation: "inventory_count_slips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_slip_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_slips: {
        Row: {
          branch_id: number
          count_date: string
          created_at: string
          employee_id: number
          id: number
          location_id: number
          note: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shift_id: number | null
          slip_number: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          count_date: string
          created_at?: string
          employee_id: number
          id?: never
          location_id: number
          note?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_id?: number | null
          slip_number: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          count_date?: string
          created_at?: string
          employee_id?: number
          id?: never
          location_id?: number
          note?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_id?: number | null
          slip_number?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_slips_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_slips_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "inventory_count_slips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_slips_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_slips_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_slips_tenant_id_fkey"
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
            foreignKeyName: "inventory_locations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "inventory_locations_branch_tenant_fkey"
            columns: ["branch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "inventory_locations_branch_tenant_fkey"
            columns: ["branch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id", "tenant_id"]
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
      inventory_origin_balances: {
        Row: {
          book_value: number
          holder_id: number | null
          holder_kind: string
          id: number
          origin_id: number
          quantity: number
          tenant_id: number
          updated_at: string
          valuation_account_id: number | null
        }
        Insert: {
          book_value?: number
          holder_id?: number | null
          holder_kind: string
          id?: never
          origin_id: number
          quantity?: number
          tenant_id: number
          updated_at?: string
          valuation_account_id?: number | null
        }
        Update: {
          book_value?: number
          holder_id?: number | null
          holder_kind?: string
          id?: never
          origin_id?: number
          quantity?: number
          tenant_id?: number
          updated_at?: string
          valuation_account_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_origin_balances_origin_id_tenant_id_fkey"
            columns: ["origin_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inventory_cost_origins"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "inventory_origin_balances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_origin_balances_valuation_account_id_tenant_id_fkey"
            columns: ["valuation_account_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation_accounts"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      inventory_valuation_accounts: {
        Row: {
          book_value: number
          branch_id: number
          id: number
          ingredient_id: number
          location_id: number
          quantity: number
          tenant_id: number
          updated_at: string
          valuation_version: number
        }
        Insert: {
          book_value?: number
          branch_id: number
          id?: never
          ingredient_id: number
          location_id: number
          quantity?: number
          tenant_id: number
          updated_at?: string
          valuation_version?: number
        }
        Update: {
          book_value?: number
          branch_id?: number
          id?: never
          ingredient_id?: number
          location_id?: number
          quantity?: number
          tenant_id?: number
          updated_at?: string
          valuation_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_valuation_accounts_branch_id_tenant_id_fkey"
            columns: ["branch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "inventory_valuation_accounts_branch_id_tenant_id_fkey"
            columns: ["branch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id", "tenant_id"]
          },
          {
            foreignKeyName: "inventory_valuation_accounts_ingredient_id_tenant_id_fkey"
            columns: ["ingredient_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "inventory_valuation_accounts_location_id_tenant_id_fkey"
            columns: ["location_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "inventory_valuation_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_valuation_cutovers: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          cutoff_at: string | null
          idempotency_key: string | null
          opening_quantity: number
          opening_value: number
          prepared_at: string | null
          prepared_by: string | null
          reconciliation_hash: string | null
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          cutoff_at?: string | null
          idempotency_key?: string | null
          opening_quantity?: number
          opening_value?: number
          prepared_at?: string | null
          prepared_by?: string | null
          reconciliation_hash?: string | null
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          cutoff_at?: string | null
          idempotency_key?: string | null
          opening_quantity?: number
          opening_value?: number
          prepared_at?: string | null
          prepared_by?: string | null
          reconciliation_hash?: string | null
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_valuation_cutovers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_valuation_events: {
        Row: {
          created_by: string | null
          effective_at: string
          event_type: string
          from_account_id: number | null
          grn_item_id: number | null
          id: number
          idempotency_key: string
          ingredient_id: number
          metadata: Json
          posted_at: string
          posting_month: number
          posting_year: number
          quantity_delta: number
          reversal_of_event_id: number | null
          source_invoice_id: number | null
          source_invoice_line_id: number | null
          stock_movement_id: number | null
          tenant_id: number
          terminal_bucket: string | null
          to_account_id: number | null
          value_delta: number
        }
        Insert: {
          created_by?: string | null
          effective_at: string
          event_type: string
          from_account_id?: number | null
          grn_item_id?: number | null
          id?: never
          idempotency_key: string
          ingredient_id: number
          metadata?: Json
          posted_at?: string
          posting_month: number
          posting_year: number
          quantity_delta?: number
          reversal_of_event_id?: number | null
          source_invoice_id?: number | null
          source_invoice_line_id?: number | null
          stock_movement_id?: number | null
          tenant_id: number
          terminal_bucket?: string | null
          to_account_id?: number | null
          value_delta?: number
        }
        Update: {
          created_by?: string | null
          effective_at?: string
          event_type?: string
          from_account_id?: number | null
          grn_item_id?: number | null
          id?: never
          idempotency_key?: string
          ingredient_id?: number
          metadata?: Json
          posted_at?: string
          posting_month?: number
          posting_year?: number
          quantity_delta?: number
          reversal_of_event_id?: number | null
          source_invoice_id?: number | null
          source_invoice_line_id?: number | null
          stock_movement_id?: number | null
          tenant_id?: number
          terminal_bucket?: string | null
          to_account_id?: number | null
          value_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_valuation_events_from_account_id_tenant_id_fkey"
            columns: ["from_account_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation_accounts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "inventory_valuation_events_grn_item_id_fkey"
            columns: ["grn_item_id"]
            isOneToOne: false
            referencedRelation: "grn_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_valuation_events_ingredient_id_tenant_id_fkey"
            columns: ["ingredient_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "inventory_valuation_events_reversal_of_event_id_fkey"
            columns: ["reversal_of_event_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_valuation_events_source_invoice_id_fkey"
            columns: ["source_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_valuation_events_source_invoice_line_id_fkey"
            columns: ["source_invoice_line_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_valuation_events_stock_movement_id_fkey"
            columns: ["stock_movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_valuation_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_valuation_events_to_account_id_tenant_id_fkey"
            columns: ["to_account_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation_accounts"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      inventory_valuation_settings: {
        Row: {
          created_at: string
          tenant_id: number
          updated_at: string
          variance_warning_amount: number
          variance_warning_percent: number
        }
        Insert: {
          created_at?: string
          tenant_id: number
          updated_at?: string
          variance_warning_amount?: number
          variance_warning_percent?: number
        }
        Update: {
          created_at?: string
          tenant_id?: number
          updated_at?: string
          variance_warning_amount?: number
          variance_warning_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_valuation_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_value_allocations: {
        Row: {
          allocated_quantity: number
          allocated_value: number
          allocation_bucket: string
          allocation_fraction: number | null
          created_at: string
          derived_origin_id: number | null
          from_balance_id: number | null
          id: number
          source_origin_id: number | null
          tenant_id: number
          to_balance_id: number | null
          valuation_event_id: number
        }
        Insert: {
          allocated_quantity?: number
          allocated_value?: number
          allocation_bucket?: string
          allocation_fraction?: number | null
          created_at?: string
          derived_origin_id?: number | null
          from_balance_id?: number | null
          id?: never
          source_origin_id?: number | null
          tenant_id: number
          to_balance_id?: number | null
          valuation_event_id: number
        }
        Update: {
          allocated_quantity?: number
          allocated_value?: number
          allocation_bucket?: string
          allocation_fraction?: number | null
          created_at?: string
          derived_origin_id?: number | null
          from_balance_id?: number | null
          id?: never
          source_origin_id?: number | null
          tenant_id?: number
          to_balance_id?: number | null
          valuation_event_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_value_allocations_derived_origin_id_tenant_id_fkey"
            columns: ["derived_origin_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inventory_cost_origins"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "inventory_value_allocations_from_balance_id_tenant_id_fkey"
            columns: ["from_balance_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inventory_origin_balances"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "inventory_value_allocations_source_origin_id_tenant_id_fkey"
            columns: ["source_origin_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inventory_cost_origins"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "inventory_value_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_value_allocations_to_balance_id_tenant_id_fkey"
            columns: ["to_balance_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inventory_origin_balances"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "inventory_value_allocations_valuation_event_id_tenant_id_fkey"
            columns: ["valuation_event_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation_events"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      invoice_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          invoice_series: string
          provider: string
          retired_at: string | null
          seller_tax_code: string | null
          status: string
          template_code: string
          tenant_id: number
          valid_from: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          invoice_series: string
          provider: string
          retired_at?: string | null
          seller_tax_code?: string | null
          status?: string
          template_code: string
          tenant_id: number
          valid_from: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          invoice_series?: string
          provider?: string
          retired_at?: string | null
          seller_tax_code?: string | null
          status?: string
          template_code?: string
          tenant_id?: number
          valid_from?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_profiles_tenant_id_fkey"
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
      kds_ticket_events: {
        Row: {
          actor_id: string | null
          branch_id: number
          context: Json
          event_type: string
          from_status: string | null
          id: number
          item_snapshot: Json
          kitchen_send_batch_id: number | null
          occurred_at: string
          order_id: number
          order_item_id: number
          reason: string | null
          station_id: number
          tenant_id: number
          ticket_id: number
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          branch_id: number
          context?: Json
          event_type: string
          from_status?: string | null
          id?: never
          item_snapshot: Json
          kitchen_send_batch_id?: number | null
          occurred_at?: string
          order_id: number
          order_item_id: number
          reason?: string | null
          station_id: number
          tenant_id: number
          ticket_id: number
          to_status: string
        }
        Update: {
          actor_id?: string | null
          branch_id?: number
          context?: Json
          event_type?: string
          from_status?: string | null
          id?: never
          item_snapshot?: Json
          kitchen_send_batch_id?: number | null
          occurred_at?: string
          order_id?: number
          order_item_id?: number
          reason?: string | null
          station_id?: number
          tenant_id?: number
          ticket_id?: number
          to_status?: string
        }
        Relationships: []
      }
      kds_tickets: {
        Row: {
          branch_id: number
          bumped_at: string | null
          bumped_by: string | null
          created_at: string
          first_ready_at: string | null
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
          first_ready_at?: string | null
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
          first_ready_at?: string | null
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
      kitchen_daily_counters: {
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
            foreignKeyName: "kitchen_daily_counters_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_daily_counters_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "kitchen_daily_counters_tenant_id_fkey"
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
      leave_requests: {
        Row: {
          branch_id: number | null
          created_at: string
          employee_id: number
          end_date: string
          id: number
          leave_type: string
          reason: string | null
          rejected_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id?: number | null
          created_at?: string
          employee_id: number
          end_date: string
          id?: never
          leave_type?: string
          reason?: string | null
          rejected_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number | null
          created_at?: string
          employee_id?: number
          end_date?: string
          id?: never
          leave_type?: string
          reason?: string | null
          rejected_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_tenant_id_fkey"
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
          vat_rate: number
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
      mv_refresh_log: {
        Row: {
          refreshed_at: string
          view_name: string
        }
        Insert: {
          refreshed_at?: string
          view_name: string
        }
        Update: {
          refreshed_at?: string
          view_name?: string
        }
        Relationships: []
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
          category_snapshot_source: string | null
          category_type_snapshot: string | null
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
          category_snapshot_source?: string | null
          category_type_snapshot?: string | null
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
          vat_rate: number
        }
        Update: {
          cancel_reason?: string | null
          category_snapshot_source?: string | null
          category_type_snapshot?: string | null
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
          order_discount_amount: number
          order_number: string
          order_type: string
          payment_code: string
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
          order_discount_amount?: number
          order_number: string
          order_type?: string
          payment_code?: string
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
          order_discount_amount?: number
          order_number?: string
          order_type?: string
          payment_code?: string
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
          stock_consumed_status: string | null
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
          stock_consumed_status?: string | null
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
          stock_consumed_status?: string | null
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
      payroll_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          effective_month: string
          employee_id: number
          id: number
          kind: string
          note: string | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          effective_month: string
          employee_id: number
          id?: never
          kind: string
          note?: string | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          effective_month?: string
          employee_id?: number
          id?: never
          kind?: string
          note?: string | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_adjustments_tenant_id_fkey"
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
          paid_leave_days: number
          pay_basis: string
          payable_days: number
          payroll_period_id: number
          personal_deduction: number
          pit_tax: number
          standard_days: number
          tax_exempt_allowances: number
          taxable_income: number
          tenant_id: number
          total_insurance_employee: number
          total_insurance_employer: number
          unpaid_leave_days: number
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
          paid_leave_days?: number
          pay_basis?: string
          payable_days?: number
          payroll_period_id: number
          personal_deduction?: number
          pit_tax: number
          standard_days: number
          tax_exempt_allowances?: number
          taxable_income: number
          tenant_id: number
          total_insurance_employee: number
          total_insurance_employer: number
          unpaid_leave_days?: number
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
          paid_leave_days?: number
          pay_basis?: string
          payable_days?: number
          payroll_period_id?: number
          personal_deduction?: number
          pit_tax?: number
          standard_days?: number
          tax_exempt_allowances?: number
          taxable_income?: number
          tenant_id?: number
          total_insurance_employee?: number
          total_insurance_employer?: number
          unpaid_leave_days?: number
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
          standard_days: number
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
          standard_days?: number
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
          standard_days?: number
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
            foreignKeyName: "permission_audit_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
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
          is_delegable_to_staff: boolean
          key: string
          module: string
          scope: string
        }
        Insert: {
          created_at?: string
          description: string
          is_delegable_to_staff?: boolean
          key: string
          module: string
          scope: string
        }
        Update: {
          created_at?: string
          description?: string
          is_delegable_to_staff?: boolean
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
          variance_resolution_type: string | null
          variance_resolved_at: string | null
          variance_settlement_amount: number | null
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
          variance_resolution_type?: string | null
          variance_resolved_at?: string | null
          variance_settlement_amount?: number | null
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
          variance_resolution_type?: string | null
          variance_resolved_at?: string | null
          variance_settlement_amount?: number | null
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
      pos_void_requests: {
        Row: {
          branch_id: number
          created_at: string
          id: number
          order_id: number
          payout_method: string
          reason: string
          requested_by: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          created_at?: string
          id?: never
          order_id: number
          payout_method: string
          reason: string
          requested_by: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          created_at?: string
          id?: never
          order_id?: number
          payout_method?: string
          reason?: string
          requested_by?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_void_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_void_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "pos_void_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_void_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      position_shift_tasks: {
        Row: {
          allows_photo: boolean
          applicability: string
          created_at: string
          done_definition: string
          id: number
          is_active: boolean
          is_required: boolean
          kind: string
          phase: string
          position_id: number
          sort_order: number
          tenant_id: number
          title: string
          updated_at: string
        }
        Insert: {
          allows_photo?: boolean
          applicability?: string
          created_at?: string
          done_definition?: string
          id?: never
          is_active?: boolean
          is_required?: boolean
          kind?: string
          phase?: string
          position_id: number
          sort_order: number
          tenant_id: number
          title: string
          updated_at?: string
        }
        Update: {
          allows_photo?: boolean
          applicability?: string
          created_at?: string
          done_definition?: string
          id?: never
          is_active?: boolean
          is_required?: boolean
          kind?: string
          phase?: string
          position_id?: number
          sort_order?: number
          tenant_id?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_shift_tasks_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_shift_tasks_tenant_id_fkey"
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
          default_checklist_template_id: number | null
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
          default_checklist_template_id?: number | null
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
          default_checklist_template_id?: number | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          label_en?: string | null
          label_vi?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "positions_default_checklist_template_id_fkey"
            columns: ["default_checklist_template_id"]
            isOneToOne: false
            referencedRelation: "shift_checklist_templates"
            referencedColumns: ["id"]
          },
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
      print_template_versions: {
        Row: {
          branch_id: number | null
          content: Json
          created_at: string
          created_by: string | null
          font_profile: string
          id: number
          is_active: boolean
          kind: string
          name: string
          paper_width_mm: number
          tenant_id: number | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          branch_id?: number | null
          content: Json
          created_at?: string
          created_by?: string | null
          font_profile?: string
          id?: never
          is_active?: boolean
          kind: string
          name: string
          paper_width_mm?: number
          tenant_id?: number | null
          updated_at?: string
          updated_by?: string | null
          version: number
        }
        Update: {
          branch_id?: number | null
          content?: Json
          created_at?: string
          created_by?: string | null
          font_profile?: string
          id?: never
          is_active?: boolean
          kind?: string
          name?: string
          paper_width_mm?: number
          tenant_id?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "print_template_versions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_template_versions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "print_template_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_template_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_template_versions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      printer_agent_presence_tokens: {
        Row: {
          agent_id: string
          branch_id: number
          created_at: string
          id: number
          last_attempt_at: string | null
          last_used_at: string | null
          revoked_at: string | null
          tenant_id: number
          token_sha256: string
        }
        Insert: {
          agent_id: string
          branch_id: number
          created_at?: string
          id?: never
          last_attempt_at?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          tenant_id: number
          token_sha256: string
        }
        Update: {
          agent_id?: string
          branch_id?: number
          created_at?: string
          id?: never
          last_attempt_at?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          tenant_id?: number
          token_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "printer_agent_presence_tokens_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printer_agent_presence_tokens_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "printer_agent_presence_tokens_tenant_id_fkey"
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
      printer_menu_categories: {
        Row: {
          branch_id: number
          category_id: number
          created_at: string
          id: number
          printer_id: number
          tenant_id: number
        }
        Insert: {
          branch_id: number
          category_id: number
          created_at?: string
          id?: never
          printer_id: number
          tenant_id: number
        }
        Update: {
          branch_id?: number
          category_id?: number
          created_at?: string
          id?: never
          printer_id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "printer_menu_categories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printer_menu_categories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "printer_menu_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printer_menu_categories_printer_id_tenant_id_branch_id_fkey"
            columns: ["printer_id", "tenant_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id", "tenant_id", "branch_id"]
          },
          {
            foreignKeyName: "printer_menu_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      printer_print_types: {
        Row: {
          branch_id: number
          created_at: string
          id: number
          print_type: string
          printer_id: number
          tenant_id: number
        }
        Insert: {
          branch_id: number
          created_at?: string
          id?: never
          print_type: string
          printer_id: number
          tenant_id: number
        }
        Update: {
          branch_id?: number
          created_at?: string
          id?: never
          print_type?: string
          printer_id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "printer_print_types_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printer_print_types_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "printer_print_types_printer_id_tenant_id_branch_id_fkey"
            columns: ["printer_id", "tenant_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id", "tenant_id", "branch_id"]
          },
          {
            foreignKeyName: "printer_print_types_tenant_id_fkey"
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
          sort_order: number
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
          sort_order?: number
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
          sort_order?: number
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
      production_recipe_specs: {
        Row: {
          created_at: string
          created_by: string | null
          finished_good_id: number
          id: number
          output_quantity: number
          output_to_base_factor: number | null
          output_unit_code: string | null
          output_unit_id: number | null
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finished_good_id: number
          id?: never
          output_quantity: number
          output_to_base_factor?: number | null
          output_unit_code?: string | null
          output_unit_id?: number | null
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finished_good_id?: number
          id?: never
          output_quantity?: number
          output_to_base_factor?: number | null
          output_unit_code?: string | null
          output_unit_id?: number | null
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_recipe_specs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_recipe_specs_finished_good_id_fkey"
            columns: ["finished_good_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_recipe_specs_output_unit_id_fkey"
            columns: ["output_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_recipe_specs_output_unit_tenant_fkey"
            columns: ["output_unit_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "production_recipe_specs_tenant_id_fkey"
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
          entry_to_base_factor: number | null
          entry_unit_code: string | null
          entry_unit_id: number
          finished_good_id: number
          id: number
          ingredient_id: number
          note: string | null
          output_quantity: number
          quantity: number
          recipe_spec_id: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          entry_to_base_factor?: number | null
          entry_unit_code?: string | null
          entry_unit_id: number
          finished_good_id: number
          id?: never
          ingredient_id: number
          note?: string | null
          output_quantity: number
          quantity: number
          recipe_spec_id: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          entry_to_base_factor?: number | null
          entry_unit_code?: string | null
          entry_unit_id?: number
          finished_good_id?: number
          id?: never
          ingredient_id?: number
          note?: string | null
          output_quantity?: number
          quantity?: number
          recipe_spec_id?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_recipes_entry_unit_id_fkey"
            columns: ["entry_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_recipes_finished_good_id_fkey"
            columns: ["finished_good_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_recipes_ingredient_entry_unit_fkey"
            columns: ["ingredient_id", "entry_unit_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ingredient_units"
            referencedColumns: ["ingredient_id", "unit_id", "tenant_id"]
          },
          {
            foreignKeyName: "production_recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_recipes_recipe_spec_fkey"
            columns: ["recipe_spec_id"]
            isOneToOne: false
            referencedRelation: "production_recipe_specs"
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
      production_run_lines: {
        Row: {
          actual_quantity: number | null
          created_at: string
          entry_to_base_factor: number
          entry_unit_code: string
          entry_unit_id: number
          id: number
          ingredient_id: number
          planned_quantity: number
          production_run_id: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          actual_quantity?: number | null
          created_at?: string
          entry_to_base_factor: number
          entry_unit_code: string
          entry_unit_id: number
          id?: never
          ingredient_id: number
          planned_quantity: number
          production_run_id: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          actual_quantity?: number | null
          created_at?: string
          entry_to_base_factor?: number
          entry_unit_code?: string
          entry_unit_id?: number
          id?: never
          ingredient_id?: number
          planned_quantity?: number
          production_run_id?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_run_lines_entry_unit_id_fkey"
            columns: ["entry_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_run_lines_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_run_lines_ingredient_unit_fkey"
            columns: ["ingredient_id", "entry_unit_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ingredient_units"
            referencedColumns: ["ingredient_id", "unit_id", "tenant_id"]
          },
          {
            foreignKeyName: "production_run_lines_production_run_id_fkey"
            columns: ["production_run_id"]
            isOneToOne: false
            referencedRelation: "production_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_run_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_runs: {
        Row: {
          actual_quantity: number | null
          branch_id: number
          cancel_reason: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          entry_to_base_factor: number | null
          entry_unit_code: string | null
          entry_unit_id: number
          finished_good_id: number
          id: number
          ingredients_override: Json | null
          notes: string | null
          planned_quantity: number
          production_number: string
          recipe_output_quantity: number | null
          recipe_spec_id: number | null
          source_location_id: number
          started_at: string | null
          status: string
          target_branch_id: number
          target_location_id: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          actual_quantity?: number | null
          branch_id: number
          cancel_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          entry_to_base_factor?: number | null
          entry_unit_code?: string | null
          entry_unit_id: number
          finished_good_id: number
          id?: never
          ingredients_override?: Json | null
          notes?: string | null
          planned_quantity: number
          production_number: string
          recipe_output_quantity?: number | null
          recipe_spec_id?: number | null
          source_location_id: number
          started_at?: string | null
          status?: string
          target_branch_id: number
          target_location_id: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          actual_quantity?: number | null
          branch_id?: number
          cancel_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          entry_to_base_factor?: number | null
          entry_unit_code?: string | null
          entry_unit_id?: number
          finished_good_id?: number
          id?: never
          ingredients_override?: Json | null
          notes?: string | null
          planned_quantity?: number
          production_number?: string
          recipe_output_quantity?: number | null
          recipe_spec_id?: number | null
          source_location_id?: number
          started_at?: string | null
          status?: string
          target_branch_id?: number
          target_location_id?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_runs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_runs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "production_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_runs_entry_unit_id_fkey"
            columns: ["entry_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_runs_finished_good_id_fkey"
            columns: ["finished_good_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_runs_recipe_spec_id_fkey"
            columns: ["recipe_spec_id"]
            isOneToOne: false
            referencedRelation: "production_recipe_specs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_runs_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_runs_target_branch_id_fkey"
            columns: ["target_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_runs_target_branch_id_fkey"
            columns: ["target_branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "production_runs_target_location_id_fkey"
            columns: ["target_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_runs_tenant_id_fkey"
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
          birth_date: string | null
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
          birth_date?: string | null
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
          birth_date?: string | null
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
      purchase_order_items: {
        Row: {
          entry_to_base_factor: number | null
          entry_unit_code: string | null
          entry_unit_id: number | null
          id: number
          ingredient_id: number
          line_total: number | null
          po_id: number
          purchase_request_item_id: number | null
          quantity: number
          tenant_id: number
          unit_price_est: number | null
        }
        Insert: {
          entry_to_base_factor?: number | null
          entry_unit_code?: string | null
          entry_unit_id?: number | null
          id?: never
          ingredient_id: number
          line_total?: number | null
          po_id: number
          purchase_request_item_id?: number | null
          quantity: number
          tenant_id: number
          unit_price_est?: number | null
        }
        Update: {
          entry_to_base_factor?: number | null
          entry_unit_code?: string | null
          entry_unit_id?: number | null
          id?: never
          ingredient_id?: number
          line_total?: number | null
          po_id?: number
          purchase_request_item_id?: number | null
          quantity?: number
          tenant_id?: number
          unit_price_est?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_entry_unit_id_fkey"
            columns: ["entry_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "purchase_order_items_request_item_tenant_fkey"
            columns: ["purchase_request_item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_request_items"
            referencedColumns: ["id", "tenant_id"]
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
          cancelled_at: string | null
          closed_at: string | null
          created_at: string
          created_by: string
          display_id: string | null
          expected_delivery_date: string | null
          group_save_idempotency_key: string | null
          group_sequence: number | null
          id: number
          notes: string | null
          ordered_at: string
          po_number: string
          purchase_group_code: string | null
          purchase_group_key: string | null
          purchase_request_id: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          save_idempotency_key: string | null
          source_grn_id: number | null
          status: string
          status_reason: string | null
          submitted_at: string | null
          submitted_by: string | null
          supplier_id: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          cancelled_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by: string
          display_id?: string | null
          expected_delivery_date?: string | null
          group_save_idempotency_key?: string | null
          group_sequence?: number | null
          id?: never
          notes?: string | null
          ordered_at?: string
          po_number: string
          purchase_group_code?: string | null
          purchase_group_key?: string | null
          purchase_request_id?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          save_idempotency_key?: string | null
          source_grn_id?: number | null
          status?: string
          status_reason?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          supplier_id: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          cancelled_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string
          display_id?: string | null
          expected_delivery_date?: string | null
          group_save_idempotency_key?: string | null
          group_sequence?: number | null
          id?: never
          notes?: string | null
          ordered_at?: string
          po_number?: string
          purchase_group_code?: string | null
          purchase_group_key?: string | null
          purchase_request_id?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          save_idempotency_key?: string | null
          source_grn_id?: number | null
          status?: string
          status_reason?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
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
            foreignKeyName: "purchase_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_purchase_request_tenant_fkey"
            columns: ["purchase_request_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_orders_source_grn_id_fkey"
            columns: ["source_grn_id"]
            isOneToOne: false
            referencedRelation: "goods_received_notes"
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
      purchase_request_allocations: {
        Row: {
          created_at: string
          created_by: string
          id: number
          purchase_request_id: number
          purchase_request_item_id: number
          quantity: number
          supplier_id: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: never
          purchase_request_id: number
          purchase_request_item_id: number
          quantity: number
          supplier_id: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: never
          purchase_request_id?: number
          purchase_request_item_id?: number
          quantity?: number
          supplier_id?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_request_allocations_purchase_request_id_tenant_id_fkey"
            columns: ["purchase_request_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_request_allocations_purchase_request_item_id_tena_fkey"
            columns: ["purchase_request_item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_request_items"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_request_allocations_supplier_id_tenant_id_fkey"
            columns: ["supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      purchase_request_items: {
        Row: {
          created_at: string
          entry_unit_id: number
          id: number
          ingredient_id: number
          notes: string | null
          purchase_request_id: number
          quantity: number
          tenant_id: number
        }
        Insert: {
          created_at?: string
          entry_unit_id: number
          id?: never
          ingredient_id: number
          notes?: string | null
          purchase_request_id: number
          quantity: number
          tenant_id: number
        }
        Update: {
          created_at?: string
          entry_unit_id?: number
          id?: never
          ingredient_id?: number
          notes?: string | null
          purchase_request_id?: number
          quantity?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_request_items_entry_unit_id_fkey"
            columns: ["entry_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_request_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_request_items_purchase_request_id_tenant_id_fkey"
            columns: ["purchase_request_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      purchase_requests: {
        Row: {
          allocation_save_idempotency_key: string | null
          branch_id: number
          cancelled_at: string | null
          closed_at: string | null
          created_at: string
          created_by: string
          creation_idempotency_key: string | null
          id: number
          needed_by: string | null
          notes: string | null
          request_number: string
          status: string
          status_reason: string | null
          submitted_at: string | null
          submitted_by: string | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          allocation_save_idempotency_key?: string | null
          branch_id: number
          cancelled_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by: string
          creation_idempotency_key?: string | null
          id?: never
          needed_by?: string | null
          notes?: string | null
          request_number: string
          status?: string
          status_reason?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          allocation_save_idempotency_key?: string | null
          branch_id?: number
          cancelled_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string
          creation_idempotency_key?: string | null
          id?: never
          needed_by?: string | null
          notes?: string | null
          request_number?: string
          status?: string
          status_reason?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "purchase_requests_tenant_id_fkey"
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
          entry_unit_id: number | null
          id: number
          ingredient_id: number
          menu_item_id: number
          note: string | null
          quantity: number
          tenant_id: number
          yield_factor: number
        }
        Insert: {
          created_at?: string
          entry_unit_id?: number | null
          id?: never
          ingredient_id: number
          menu_item_id: number
          note?: string | null
          quantity: number
          tenant_id: number
          yield_factor?: number
        }
        Update: {
          created_at?: string
          entry_unit_id?: number | null
          id?: never
          ingredient_id?: number
          menu_item_id?: number
          note?: string | null
          quantity?: number
          tenant_id?: number
          yield_factor?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipes_entry_unit_id_fkey"
            columns: ["entry_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
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
          payout_method: string | null
          reason: string
          status: string
          tax_invoice_id: number | null
          tenant_id: number
          updated_at: string
          webhook_event_id: number | null
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
          payout_method?: string | null
          reason: string
          status?: string
          tax_invoice_id?: number | null
          tenant_id: number
          updated_at?: string
          webhook_event_id?: number | null
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
          payout_method?: string | null
          reason?: string
          status?: string
          tax_invoice_id?: number | null
          tenant_id?: number
          updated_at?: string
          webhook_event_id?: number | null
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
            foreignKeyName: "refunds_tax_invoice_id_fkey"
            columns: ["tax_invoice_id"]
            isOneToOne: false
            referencedRelation: "tax_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_webhook_event_id_fkey"
            columns: ["webhook_event_id"]
            isOneToOne: false
            referencedRelation: "webhook_events"
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
      self_order_payment_requests: {
        Row: {
          amount_snapshot: number
          branch_id: number
          cancel_reason: string | null
          cancelled_at: string | null
          client_op_id: string
          completed_at: string | null
          created_at: string
          expired_at: string | null
          expires_at: string | null
          id: number
          invoice_payload: Json
          method: string
          order_id: number
          payment_code_snapshot: string | null
          payment_id: number | null
          qr_payload_snapshot: string | null
          request_fingerprint: string
          request_fingerprint_version: string
          status: string
          table_id: number
          tenant_id: number
          updated_at: string
          vietqr_config_snapshot: Json
        }
        Insert: {
          amount_snapshot: number
          branch_id: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_op_id: string
          completed_at?: string | null
          created_at?: string
          expired_at?: string | null
          expires_at?: string | null
          id?: never
          invoice_payload?: Json
          method: string
          order_id: number
          payment_code_snapshot?: string | null
          payment_id?: number | null
          qr_payload_snapshot?: string | null
          request_fingerprint: string
          request_fingerprint_version: string
          status: string
          table_id: number
          tenant_id: number
          updated_at?: string
          vietqr_config_snapshot?: Json
        }
        Update: {
          amount_snapshot?: number
          branch_id?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_op_id?: string
          completed_at?: string | null
          created_at?: string
          expired_at?: string | null
          expires_at?: string | null
          id?: never
          invoice_payload?: Json
          method?: string
          order_id?: number
          payment_code_snapshot?: string | null
          payment_id?: number | null
          qr_payload_snapshot?: string | null
          request_fingerprint?: string
          request_fingerprint_version?: string
          status?: string
          table_id?: number
          tenant_id?: number
          updated_at?: string
          vietqr_config_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "self_order_payment_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_order_payment_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "self_order_payment_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_order_payment_requests_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_order_payment_requests_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_order_payment_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      self_order_rate_buckets: {
        Row: {
          created_at: string
          expires_at: string
          hits: number
          purpose: string
          scope_hash: string
          scope_type: string
          updated_at: string
          window_start: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          hits: number
          purpose: string
          scope_hash: string
          scope_type: string
          updated_at?: string
          window_start: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          hits?: number
          purpose?: string
          scope_hash?: string
          scope_type?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      self_order_request_operations: {
        Row: {
          cart_payload: Json
          client_op_id: string
          created_at: string
          customer_note: string | null
          request_id: number
          tenant_id: number
        }
        Insert: {
          cart_payload: Json
          client_op_id: string
          created_at?: string
          customer_note?: string | null
          request_id: number
          tenant_id: number
        }
        Update: {
          cart_payload?: Json
          client_op_id?: string
          created_at?: string
          customer_note?: string | null
          request_id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "self_order_request_operations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "self_order_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_order_request_operations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      self_order_requests: {
        Row: {
          branch_id: number
          cart_payload: Json
          client_op_id: string
          created_at: string
          customer_note: string | null
          decided_at: string | null
          decided_by: string | null
          id: number
          order_id: number | null
          status: string
          table_id: number
          tenant_id: number
        }
        Insert: {
          branch_id: number
          cart_payload: Json
          client_op_id: string
          created_at?: string
          customer_note?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: never
          order_id?: number | null
          status?: string
          table_id: number
          tenant_id: number
        }
        Update: {
          branch_id?: number
          cart_payload?: Json
          client_op_id?: string
          created_at?: string
          customer_note?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: never
          order_id?: number | null
          status?: string
          table_id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "self_order_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_order_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "self_order_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_order_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_order_requests_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_order_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          branch_id: number | null
          created_at: string
          employee_id: number
          id: number
          is_shift_leader: boolean
          shift_id: number | null
          source: string
          tenant_id: number
          updated_at: string
          work_date: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          branch_id?: number | null
          created_at?: string
          employee_id: number
          id?: never
          is_shift_leader?: boolean
          shift_id?: number | null
          source?: string
          tenant_id: number
          updated_at?: string
          work_date: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          branch_id?: number | null
          created_at?: string
          employee_id?: number
          id?: never
          is_shift_leader?: boolean
          shift_id?: number | null
          source?: string
          tenant_id?: number
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      shift_checklist_consumption_default_items: {
        Row: {
          created_at: string
          id: number
          ingredient_id: number
          is_active: boolean
          note: string | null
          position_task_id: number | null
          sort_order: number
          template_item_id: number | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          ingredient_id: number
          is_active?: boolean
          note?: string | null
          position_task_id?: number | null
          sort_order?: number
          template_item_id?: number | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          ingredient_id?: number
          is_active?: boolean
          note?: string | null
          position_task_id?: number | null
          sort_order?: number
          template_item_id?: number | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_checklist_consumption_default_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_checklist_consumption_default_items_position_task_id_fkey"
            columns: ["position_task_id"]
            isOneToOne: false
            referencedRelation: "position_shift_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_checklist_consumption_default_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "shift_checklist_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_checklist_consumption_default_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_checklist_template_items: {
        Row: {
          created_at: string
          done_definition: string
          id: number
          is_active: boolean
          is_required: boolean
          phase: string
          scope: string
          sort_order: number
          task_kind: string
          template_id: number
          tenant_id: number
          title: string
        }
        Insert: {
          created_at?: string
          done_definition?: string
          id?: never
          is_active?: boolean
          is_required?: boolean
          phase?: string
          scope?: string
          sort_order: number
          task_kind?: string
          template_id: number
          tenant_id: number
          title: string
        }
        Update: {
          created_at?: string
          done_definition?: string
          id?: never
          is_active?: boolean
          is_required?: boolean
          phase?: string
          scope?: string
          sort_order?: number
          task_kind?: string
          template_id?: number
          tenant_id?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "shift_checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_checklist_template_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_checklist_templates: {
        Row: {
          branch_id: number | null
          created_at: string
          employee_id: number | null
          id: number
          is_active: boolean
          name: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id?: number | null
          created_at?: string
          employee_id?: number | null
          id?: never
          is_active?: boolean
          name?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number | null
          created_at?: string
          employee_id?: number | null
          id?: never
          is_active?: boolean
          name?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_checklist_templates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_checklist_templates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "shift_checklist_templates_employee_tenant_fkey"
            columns: ["employee_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shift_checklist_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          branch_id: number | null
          created_at: string
          end_time: string
          id: number
          is_active: boolean
          is_closing: boolean
          is_opening: boolean
          name: string
          start_time: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id?: number | null
          created_at?: string
          end_time: string
          id?: never
          is_active?: boolean
          is_closing?: boolean
          is_opening?: boolean
          name: string
          start_time: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number | null
          created_at?: string
          end_time?: string
          id?: never
          is_active?: boolean
          is_closing?: boolean
          is_opening?: boolean
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
          entry_to_base_factor: number | null
          entry_unit_code: string | null
          entry_unit_id: number
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
          unit_cost: number
          waste_tier: number | null
        }
        Insert: {
          approval_required?: boolean
          entry_to_base_factor?: number | null
          entry_unit_code?: string | null
          entry_unit_id: number
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
          unit_cost?: number
          waste_tier?: number | null
        }
        Update: {
          approval_required?: boolean
          entry_to_base_factor?: number | null
          entry_unit_code?: string | null
          entry_unit_id?: number
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
          unit_cost?: number
          waste_tier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_issue_items_entry_unit_id_fkey"
            columns: ["entry_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "stock_issues_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
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
          correction_idempotency_key: string | null
          created_at: string
          created_by: string
          entry_quantity: number | null
          entry_to_base_factor: number | null
          entry_unit_code: string | null
          entry_unit_id: number
          grn_id: number | null
          grn_item_id: number | null
          id: number
          ingredient_id: number
          issue_id: number | null
          location_id: number
          movement_subtype: string | null
          order_id: number | null
          production_run_id: number | null
          quantity_change: number
          reason: string | null
          tenant_id: number
          transfer_id: number | null
          type: string
          unit_cost: number | null
        }
        Insert: {
          branch_id: number
          correction_idempotency_key?: string | null
          created_at?: string
          created_by: string
          entry_quantity?: number | null
          entry_to_base_factor?: number | null
          entry_unit_code?: string | null
          entry_unit_id: number
          grn_id?: number | null
          grn_item_id?: number | null
          id?: never
          ingredient_id: number
          issue_id?: number | null
          location_id: number
          movement_subtype?: string | null
          order_id?: number | null
          production_run_id?: number | null
          quantity_change: number
          reason?: string | null
          tenant_id: number
          transfer_id?: number | null
          type: string
          unit_cost?: number | null
        }
        Update: {
          branch_id?: number
          correction_idempotency_key?: string | null
          created_at?: string
          created_by?: string
          entry_quantity?: number | null
          entry_to_base_factor?: number | null
          entry_unit_code?: string | null
          entry_unit_id?: number
          grn_id?: number | null
          grn_item_id?: number | null
          id?: never
          ingredient_id?: number
          issue_id?: number | null
          location_id?: number
          movement_subtype?: string | null
          order_id?: number | null
          production_run_id?: number | null
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
            foreignKeyName: "stock_movements_entry_unit_id_fkey"
            columns: ["entry_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
            foreignKeyName: "stock_movements_grn_item_id_fkey"
            columns: ["grn_item_id"]
            isOneToOne: false
            referencedRelation: "grn_items"
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
            foreignKeyName: "stock_movements_production_run_id_fkey"
            columns: ["production_run_id"]
            isOneToOne: false
            referencedRelation: "production_runs"
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
      stock_request_items: {
        Row: {
          created_at: string
          entry_unit_id: number
          fulfill_site_kind: string
          id: number
          ingredient_id: number
          notes: string | null
          quantity: number
          request_id: number
          status: string
          tenant_id: number
          transfer_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entry_unit_id: number
          fulfill_site_kind: string
          id?: number
          ingredient_id: number
          notes?: string | null
          quantity: number
          request_id: number
          status?: string
          tenant_id: number
          transfer_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entry_unit_id?: number
          fulfill_site_kind?: string
          id?: number
          ingredient_id?: number
          notes?: string | null
          quantity?: number
          request_id?: number
          status?: string
          tenant_id?: number
          transfer_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_request_items_entry_unit_id_fkey"
            columns: ["entry_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_request_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "stock_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_request_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_request_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_requests: {
        Row: {
          branch_id: number
          cancelled_at: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          creation_idempotency_key: string | null
          id: number
          needed_at: string | null
          notes: string | null
          request_number: string
          status: string
          status_reason: string | null
          submitted_at: string | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          branch_id: number
          cancelled_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          creation_idempotency_key?: string | null
          id?: number
          needed_at?: string | null
          notes?: string | null
          request_number: string
          status?: string
          status_reason?: string | null
          submitted_at?: string | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          branch_id?: number
          cancelled_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          creation_idempotency_key?: string | null
          id?: number
          needed_at?: string | null
          notes?: string | null
          request_number?: string
          status?: string
          status_reason?: string | null
          submitted_at?: string | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "stock_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          entry_to_base_factor: number | null
          entry_unit_code: string | null
          entry_unit_id: number
          id: number
          ingredient_id: number
          quantity: number
          quantity_received: number | null
          receive_note: string | null
          tenant_id: number
          transfer_id: number
          unit_cost_at_ship: number | null
        }
        Insert: {
          entry_to_base_factor?: number | null
          entry_unit_code?: string | null
          entry_unit_id: number
          id?: never
          ingredient_id: number
          quantity: number
          quantity_received?: number | null
          receive_note?: string | null
          tenant_id: number
          transfer_id: number
          unit_cost_at_ship?: number | null
        }
        Update: {
          entry_to_base_factor?: number | null
          entry_unit_code?: string | null
          entry_unit_id?: number
          id?: never
          ingredient_id?: number
          quantity?: number
          quantity_received?: number | null
          receive_note?: string | null
          tenant_id?: number
          transfer_id?: number
          unit_cost_at_ship?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_entry_unit_id_fkey"
            columns: ["entry_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
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
          cancelled_at: string | null
          created_at: string
          created_by: string
          from_branch_id: number
          from_location_id: number | null
          id: number
          notes: string | null
          receive_started_at: string | null
          received_at: string | null
          shipped_at: string | null
          status: string
          status_reason: string | null
          stock_request_id: number | null
          tenant_id: number
          to_branch_id: number
          to_location_id: number | null
          transfer_number: string
          updated_at: string
          vehicle_info: string | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          created_by: string
          from_branch_id: number
          from_location_id?: number | null
          id?: never
          notes?: string | null
          receive_started_at?: string | null
          received_at?: string | null
          shipped_at?: string | null
          status?: string
          status_reason?: string | null
          stock_request_id?: number | null
          tenant_id: number
          to_branch_id: number
          to_location_id?: number | null
          transfer_number: string
          updated_at?: string
          vehicle_info?: string | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          created_by?: string
          from_branch_id?: number
          from_location_id?: number | null
          id?: never
          notes?: string | null
          receive_started_at?: string | null
          received_at?: string | null
          shipped_at?: string | null
          status?: string
          status_reason?: string | null
          stock_request_id?: number | null
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
            foreignKeyName: "stock_transfers_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "stock_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_request_tenant_fkey"
            columns: ["stock_request_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stock_requests"
            referencedColumns: ["id", "tenant_id"]
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
            foreignKeyName: "stock_transfers_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
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
          entry_unit_id: number
          id: number
          ingredient_id: number
          is_final: boolean
          needs_recount: boolean
          offline_created_at: string | null
          reason_code: string | null
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
          entry_unit_id: number
          id?: never
          ingredient_id: number
          is_final?: boolean
          needs_recount?: boolean
          offline_created_at?: string | null
          reason_code?: string | null
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
          entry_unit_id?: number
          id?: never
          ingredient_id?: number
          is_final?: boolean
          needs_recount?: boolean
          offline_created_at?: string | null
          reason_code?: string | null
          round_no?: number
          session_id?: number
          system_quantity?: number
          tenant_id?: number
          variance?: number | null
          variance_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_lines_entry_unit_id_fkey"
            columns: ["entry_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
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
          session_number: string
          started_at: string
          status: string
          tenant_id: number
          updated_at: string
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
          session_number: string
          started_at?: string
          status?: string
          tenant_id: number
          updated_at?: string
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
          session_number?: string
          started_at?: string
          status?: string
          tenant_id?: number
          updated_at?: string
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
      supplier_credit_allocations: {
        Row: {
          amount: number
          created_at: string
          id: number
          supplier_credit_note_id: number
          supplier_invoice_id: number
          tenant_id: number
        }
        Insert: {
          amount: number
          created_at?: string
          id?: never
          supplier_credit_note_id: number
          supplier_invoice_id: number
          tenant_id: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: never
          supplier_credit_note_id?: number
          supplier_invoice_id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_credit_allocations_supplier_credit_note_id_tenant_fkey"
            columns: ["supplier_credit_note_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_credit_notes"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_credit_allocations_supplier_invoice_id_tenant_id_fkey"
            columns: ["supplier_invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id", "tenant_id"]
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
          return_id: number | null
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
          return_id?: number | null
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
          return_id?: number | null
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
      supplier_ingredient_price_history: {
        Row: {
          confirmed_at: string
          created_by: string
          effective_net_unit_price: number
          id: number
          ingredient_id: number
          supplier_id: number
          supplier_invoice_id: number
          supplier_invoice_line_id: number
          tenant_id: number
          unit_id: number
          unit_price: number
        }
        Insert: {
          confirmed_at: string
          created_by: string
          effective_net_unit_price: number
          id?: never
          ingredient_id: number
          supplier_id: number
          supplier_invoice_id: number
          supplier_invoice_line_id: number
          tenant_id: number
          unit_id: number
          unit_price: number
        }
        Update: {
          confirmed_at?: string
          created_by?: string
          effective_net_unit_price?: number
          id?: never
          ingredient_id?: number
          supplier_id?: number
          supplier_invoice_id?: number
          supplier_invoice_line_id?: number
          tenant_id?: number
          unit_id?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_ingredient_price_his_supplier_invoice_id_tenant_i_fkey"
            columns: ["supplier_invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_ingredient_price_his_supplier_invoice_line_id_ten_fkey"
            columns: ["supplier_invoice_line_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_lines"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_ingredient_price_history_ingredient_id_tenant_id_fkey"
            columns: ["ingredient_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_ingredient_price_history_supplier_id_tenant_id_fkey"
            columns: ["supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_ingredient_price_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ingredient_price_history_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_lines: {
        Row: {
          allocated_document_discount: number
          created_at: string
          description: string
          gross_line_total: number | null
          id: number
          ingredient_id: number | null
          line_discount_amount: number
          line_total: number
          quantity: number
          source_line_key: string | null
          supplier_invoice_id: number
          tenant_id: number
          unit_id: number | null
          unit_price: number
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          allocated_document_discount?: number
          created_at?: string
          description: string
          gross_line_total?: number | null
          id?: never
          ingredient_id?: number | null
          line_discount_amount?: number
          line_total: number
          quantity: number
          source_line_key?: string | null
          supplier_invoice_id: number
          tenant_id: number
          unit_id?: number | null
          unit_price: number
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          allocated_document_discount?: number
          created_at?: string
          description?: string
          gross_line_total?: number | null
          id?: never
          ingredient_id?: number | null
          line_discount_amount?: number
          line_total?: number
          quantity?: number
          source_line_key?: string | null
          supplier_invoice_id?: number
          tenant_id?: number
          unit_id?: number | null
          unit_price?: number
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_lines_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_lines_supplier_invoice_id_tenant_id_fkey"
            columns: ["supplier_invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_invoice_lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_receipt_allocations: {
        Row: {
          accepted_discrepancy: boolean
          billed_quantity: number
          confirmed_net_inventory_amount: number | null
          created_at: string
          discrepancy_reason: string | null
          grn_id: number
          grn_item_id: number | null
          id: number
          invoice_line_id: number | null
          matched_quantity: number
          po_id: number
          purchase_order_item_id: number | null
          supplier_invoice_id: number
          tenant_id: number
          unplanned_billed_quantity: number
          valuation_event_id: number | null
          valuation_status: string
        }
        Insert: {
          accepted_discrepancy?: boolean
          billed_quantity: number
          confirmed_net_inventory_amount?: number | null
          created_at?: string
          discrepancy_reason?: string | null
          grn_id: number
          grn_item_id?: number | null
          id?: never
          invoice_line_id?: number | null
          matched_quantity: number
          po_id: number
          purchase_order_item_id?: number | null
          supplier_invoice_id: number
          tenant_id: number
          unplanned_billed_quantity?: number
          valuation_event_id?: number | null
          valuation_status?: string
        }
        Update: {
          accepted_discrepancy?: boolean
          billed_quantity?: number
          confirmed_net_inventory_amount?: number | null
          created_at?: string
          discrepancy_reason?: string | null
          grn_id?: number
          grn_item_id?: number | null
          id?: never
          invoice_line_id?: number | null
          matched_quantity?: number
          po_id?: number
          purchase_order_item_id?: number | null
          supplier_invoice_id?: number
          tenant_id?: number
          unplanned_billed_quantity?: number
          valuation_event_id?: number | null
          valuation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_receipt_allo_purchase_order_item_id_tenan_fkey"
            columns: ["purchase_order_item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_invoice_receipt_allo_supplier_invoice_id_tenant_i_fkey"
            columns: ["supplier_invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_invoice_receipt_allocat_invoice_line_id_tenant_id_fkey"
            columns: ["invoice_line_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoice_lines"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_invoice_receipt_allocations_grn_id_tenant_id_fkey"
            columns: ["grn_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "goods_received_notes"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_invoice_receipt_allocations_grn_item_id_fkey"
            columns: ["grn_item_id"]
            isOneToOne: false
            referencedRelation: "grn_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_receipt_allocations_po_id_tenant_id_fkey"
            columns: ["po_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_invoice_receipt_allocations_valuation_event_fkey"
            columns: ["valuation_event_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation_events"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string
          credit_applied_amount: number
          discrepancy_accepted_at: string | null
          discrepancy_accepted_by: string | null
          discrepancy_reason: string | null
          document_discount_amount: number
          document_status: string
          due_date: string | null
          grn_id: number | null
          id: number
          invoice_date: string
          invoice_kind: string
          matching_difference_amount: number | null
          matching_expected_amount: number | null
          matching_notes: string | null
          matching_reason_code: string | null
          matching_received_amount: number | null
          matching_status: string
          paid_amount: number
          paid_at: string | null
          payment_status: string
          po_id: number | null
          save_idempotency_key: string | null
          service_verification_reason: string | null
          service_verified_at: string | null
          service_verified_by: string | null
          subtotal: number
          supplier_id: number
          tenant_id: number
          total_amount: number
          updated_at: string
          vat_amount: number
          vat_breakdown: Json
          vat_invoice_attachment_path: string | null
          vat_rate: number | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by: string
          credit_applied_amount?: number
          discrepancy_accepted_at?: string | null
          discrepancy_accepted_by?: string | null
          discrepancy_reason?: string | null
          document_discount_amount?: number
          document_status?: string
          due_date?: string | null
          grn_id?: number | null
          id?: never
          invoice_date: string
          invoice_kind?: string
          matching_difference_amount?: number | null
          matching_expected_amount?: number | null
          matching_notes?: string | null
          matching_reason_code?: string | null
          matching_received_amount?: number | null
          matching_status?: string
          paid_amount?: number
          paid_at?: string | null
          payment_status?: string
          po_id?: number | null
          save_idempotency_key?: string | null
          service_verification_reason?: string | null
          service_verified_at?: string | null
          service_verified_by?: string | null
          subtotal: number
          supplier_id: number
          tenant_id: number
          total_amount: number
          updated_at?: string
          vat_amount: number
          vat_breakdown?: Json
          vat_invoice_attachment_path?: string | null
          vat_rate?: number | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string
          credit_applied_amount?: number
          discrepancy_accepted_at?: string | null
          discrepancy_accepted_by?: string | null
          discrepancy_reason?: string | null
          document_discount_amount?: number
          document_status?: string
          due_date?: string | null
          grn_id?: number | null
          id?: never
          invoice_date?: string
          invoice_kind?: string
          matching_difference_amount?: number | null
          matching_expected_amount?: number | null
          matching_notes?: string | null
          matching_reason_code?: string | null
          matching_received_amount?: number | null
          matching_status?: string
          paid_amount?: number
          paid_at?: string | null
          payment_status?: string
          po_id?: number | null
          save_idempotency_key?: string | null
          service_verification_reason?: string | null
          service_verified_at?: string | null
          service_verified_by?: string | null
          subtotal?: number
          supplier_id?: number
          tenant_id?: number
          total_amount?: number
          updated_at?: string
          vat_amount?: number
          vat_breakdown?: Json
          vat_invoice_attachment_path?: string | null
          vat_rate?: number | null
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
          is_preferred: boolean
          notes: string | null
          pack_size: number | null
          pack_uom: string | null
          supplier_id: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          ingredient_id: number
          is_active?: boolean
          is_preferred?: boolean
          notes?: string | null
          pack_size?: number | null
          pack_uom?: string | null
          supplier_id: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          ingredient_id?: number
          is_active?: boolean
          is_preferred?: boolean
          notes?: string | null
          pack_size?: number | null
          pack_uom?: string | null
          supplier_id?: number
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
      supplier_payment_allocations: {
        Row: {
          allocation_intent_key: string
          amount: number
          created_at: string
          id: number
          supplier_invoice_id: number
          supplier_payment_id: number
          tenant_id: number
        }
        Insert: {
          allocation_intent_key: string
          amount: number
          created_at?: string
          id?: never
          supplier_invoice_id: number
          supplier_payment_id: number
          tenant_id: number
        }
        Update: {
          allocation_intent_key?: string
          amount?: number
          created_at?: string
          id?: never
          supplier_invoice_id?: number
          supplier_payment_id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payment_allocations_supplier_invoice_id_tenant_id_fkey"
            columns: ["supplier_invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payment_allocations_supplier_payment_id_tenant_id_fkey"
            columns: ["supplier_payment_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_payments"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: number
          idempotency_key: string | null
          idempotency_result_status: string | null
          payment_date: string
          payment_method: string
          reference_note: string | null
          supplier_id: number
          supplier_invoice_id: number | null
          tenant_id: number
          updated_at: string
          webhook_event_id: number | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: never
          idempotency_key?: string | null
          idempotency_result_status?: string | null
          payment_date?: string
          payment_method: string
          reference_note?: string | null
          supplier_id: number
          supplier_invoice_id?: number | null
          tenant_id: number
          updated_at?: string
          webhook_event_id?: number | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: never
          idempotency_key?: string | null
          idempotency_result_status?: string | null
          payment_date?: string
          payment_method?: string
          reference_note?: string | null
          supplier_id?: number
          supplier_invoice_id?: number | null
          tenant_id?: number
          updated_at?: string
          webhook_event_id?: number | null
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
            foreignKeyName: "supplier_payments_supplier_tenant_fkey"
            columns: ["supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_webhook_event_id_fkey"
            columns: ["webhook_event_id"]
            isOneToOne: false
            referencedRelation: "webhook_events"
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
          entry_unit_id: number
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
          unit_cost: number
        }
        Insert: {
          entry_unit_id: number
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
          unit_cost: number
        }
        Update: {
          entry_unit_id?: number
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
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_return_items_entry_unit_tenant_fkey"
            columns: ["entry_unit_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id", "tenant_id"]
          },
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
            foreignKeyName: "supplier_returns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
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
          self_order_enabled: boolean
          self_order_token: string | null
          self_order_token_rotated_at: string | null
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
          self_order_enabled?: boolean
          self_order_token?: string | null
          self_order_token_rotated_at?: string | null
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
          self_order_enabled?: boolean
          self_order_token?: string | null
          self_order_token_rotated_at?: string | null
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
      tax_invoice_buyer_requests: {
        Row: {
          branch_id: number
          close_reason: string | null
          closed_at: string | null
          created_at: string
          expires_at: string
          id: number
          order_id: number
          status: string
          submitted_at: string | null
          submitted_payload: Json | null
          tenant_id: number
          token_hash: string
          updated_at: string
        }
        Insert: {
          branch_id: number
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          expires_at: string
          id?: never
          order_id: number
          status?: string
          submitted_at?: string | null
          submitted_payload?: Json | null
          tenant_id: number
          token_hash: string
          updated_at?: string
        }
        Update: {
          branch_id?: number
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: never
          order_id?: number
          status?: string
          submitted_at?: string | null
          submitted_payload?: Json | null
          tenant_id?: number
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_invoice_buyer_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoice_buyer_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "tax_invoice_buyer_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoice_buyer_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      tax_invoice_issue_jobs: {
        Row: {
          attempt_count: number
          available_at: string
          branch_id: number
          created_at: string
          id: number
          invoice_payload: Json
          last_error: string | null
          locked_until: string | null
          operation: string
          order_id: number
          payment_id: number | null
          status: string
          submission_snapshot: Json | null
          tax_invoice_id: number | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          branch_id: number
          created_at?: string
          id?: never
          invoice_payload: Json
          last_error?: string | null
          locked_until?: string | null
          operation?: string
          order_id: number
          payment_id?: number | null
          status?: string
          submission_snapshot?: Json | null
          tax_invoice_id?: number | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          branch_id?: number
          created_at?: string
          id?: never
          invoice_payload?: Json
          last_error?: string | null
          locked_until?: string | null
          operation?: string
          order_id?: number
          payment_id?: number | null
          status?: string
          submission_snapshot?: Json | null
          tax_invoice_id?: number | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_invoice_issue_jobs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoice_issue_jobs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "v_print_agent_fleet"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "tax_invoice_issue_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoice_issue_jobs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoice_issue_jobs_tax_invoice_id_fkey"
            columns: ["tax_invoice_id"]
            isOneToOne: false
            referencedRelation: "tax_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoice_issue_jobs_tenant_id_fkey"
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
          buyer_email: string | null
          buyer_name: string | null
          buyer_tax_code: string | null
          cancelled_at: string | null
          cqt_code: string | null
          created_at: string
          created_by: string | null
          id: number
          invoice_kind: string
          invoice_number: string | null
          invoice_profile_id: number | null
          invoice_profile_version: number | null
          invoice_series: string | null
          invoice_snapshot: Json | null
          invoice_time: string | null
          issued_at: string | null
          order_id: number | null
          pdf_sha256: string | null
          pdf_url: string | null
          provider: string
          provider_data: Json | null
          provider_ref: string | null
          replaced_by: number | null
          replaced_for: number | null
          seller_address: string | null
          seller_name: string | null
          seller_tax_code: string | null
          signing_started_at: string | null
          status: string
          subtotal: number
          summary_date: string | null
          summary_orders_count: number | null
          template_code: string | null
          tenant_id: number
          total_amount: number
          updated_at: string
          vat_amount: number
          vat_rate: number | null
          xml_sha256: string | null
          xml_url: string | null
        }
        Insert: {
          archive_attempts?: number
          archive_last_error?: string | null
          archived_at?: string | null
          branch_id: number
          buyer_address?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_tax_code?: string | null
          cancelled_at?: string | null
          cqt_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          invoice_kind?: string
          invoice_number?: string | null
          invoice_profile_id?: number | null
          invoice_profile_version?: number | null
          invoice_series?: string | null
          invoice_snapshot?: Json | null
          invoice_time?: string | null
          issued_at?: string | null
          order_id?: number | null
          pdf_sha256?: string | null
          pdf_url?: string | null
          provider?: string
          provider_data?: Json | null
          provider_ref?: string | null
          replaced_by?: number | null
          replaced_for?: number | null
          seller_address?: string | null
          seller_name?: string | null
          seller_tax_code?: string | null
          signing_started_at?: string | null
          status?: string
          subtotal: number
          summary_date?: string | null
          summary_orders_count?: number | null
          template_code?: string | null
          tenant_id: number
          total_amount: number
          updated_at?: string
          vat_amount: number
          vat_rate?: number | null
          xml_sha256?: string | null
          xml_url?: string | null
        }
        Update: {
          archive_attempts?: number
          archive_last_error?: string | null
          archived_at?: string | null
          branch_id?: number
          buyer_address?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_tax_code?: string | null
          cancelled_at?: string | null
          cqt_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          invoice_kind?: string
          invoice_number?: string | null
          invoice_profile_id?: number | null
          invoice_profile_version?: number | null
          invoice_series?: string | null
          invoice_snapshot?: Json | null
          invoice_time?: string | null
          issued_at?: string | null
          order_id?: number | null
          pdf_sha256?: string | null
          pdf_url?: string | null
          provider?: string
          provider_data?: Json | null
          provider_ref?: string | null
          replaced_by?: number | null
          replaced_for?: number | null
          seller_address?: string | null
          seller_name?: string | null
          seller_tax_code?: string | null
          signing_started_at?: string | null
          status?: string
          subtotal?: number
          summary_date?: string | null
          summary_orders_count?: number | null
          template_code?: string | null
          tenant_id?: number
          total_amount?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number | null
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
            foreignKeyName: "tax_invoices_invoice_profile_id_fkey"
            columns: ["invoice_profile_id"]
            isOneToOne: false
            referencedRelation: "invoice_profiles"
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
      tenant_inventory_doc_counters: {
        Row: {
          doc_kind: string
          next_seq: number
          tenant_id: number
          updated_at: string
          year: number
        }
        Insert: {
          doc_kind: string
          next_seq?: number
          tenant_id: number
          updated_at?: string
          year: number
        }
        Update: {
          doc_kind?: string
          next_seq?: number
          tenant_id?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_inventory_doc_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_po_counters: {
        Row: {
          next_seq: number
          tenant_id: number
          updated_at: string
          year: number
        }
        Insert: {
          next_seq?: number
          tenant_id: number
          updated_at?: string
          year: number
        }
        Update: {
          next_seq?: number
          tenant_id?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_po_counters_tenant_id_fkey"
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
      units: {
        Row: {
          code: string
          created_at: string
          dimension: string | null
          id: number
          is_active: boolean
          is_standard: boolean
          name: string
          standard_factor: number | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          dimension?: string | null
          id?: never
          is_active?: boolean
          is_standard?: boolean
          name: string
          standard_factor?: number | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          dimension?: string | null
          id?: never
          is_active?: boolean
          is_standard?: boolean
          name?: string
          standard_factor?: number | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          error_code: string | null
          expense_id: number | null
          http_status: number | null
          id: number
          order_id: number | null
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
          expense_id?: number | null
          http_status?: number | null
          id?: never
          order_id?: number | null
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
          expense_id?: number | null
          http_status?: number | null
          id?: never
          order_id?: number | null
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
            foreignKeyName: "webhook_events_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "payments_tenant_id_fkey"
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
      _compute_vat_breakdown: {
        Args: { p_order_ids: number[] }
        Returns: {
          line_gross: number
          line_subtotal: number
          line_vat: number
          vat_rate: number
        }[]
      }
      _post_writeoff_movements: {
        Args: { p_issue_id: number }
        Returns: undefined
      }
      accept_supplier_invoice_discrepancy: {
        Args: { p_invoice_id: number; p_reason: string }
        Returns: Json
      }
      acquire_zone_lock: {
        Args: {
          p_session_id: number
          p_ttl_seconds?: number
          p_zone_id: string
        }
        Returns: Json
      }
      activate_inventory_valuation_cutover: {
        Args: { p_idempotency_key: string }
        Returns: Json
      }
      activate_invoice_profile: { Args: never; Returns: number }
      adjust_stock_exception:
        | {
            Args: {
              p_branch_id: number
              p_entry_quantity: number
              p_entry_unit_id: number
              p_ingredient_id: number
              p_reason: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_branch_id: number
              p_ingredient_id: number
              p_quantity_change: number
              p_reason: string
            }
            Returns: Json
          }
      aggregate_daily_b2c_invoice: {
        Args: { p_actor?: string; p_branch_id: number; p_summary_date: string }
        Returns: Json
      }
      aggregate_daily_b2c_invoice_vat_line_name: {
        Args: { p_vat_rate: number }
        Returns: string
      }
      allocate_supplier_advance: {
        Args: {
          p_allocations: Json
          p_idempotency_key: string
          p_payment_id: number
        }
        Returns: Json
      }
      amend_grn_line: {
        Args: {
          p_grn_id: number
          p_line_id: number
          p_reason: string
          p_received_quantity: number
          p_rejected_photo_url: string
          p_rejected_quantity: number
          p_rejection_reason: string
        }
        Returns: Json
      }
      append_order_items: {
        Args: { p_idempotency_key?: string; p_items: Json; p_order_id: number }
        Returns: Json
      }
      append_order_items_with_daily_limit_hold: {
        Args: {
          p_daily_limit_hold_token?: string
          p_idempotency_key?: string
          p_items: Json
          p_order_id: number
        }
        Returns: Json
      }
      apply_credit_note_to_invoice: {
        Args: { p_amount: number; p_credit_id: number; p_invoice_id: number }
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
      approve_employee_clock_out: {
        Args: { p_attendance_id: number; p_note?: string }
        Returns: {
          branch_id: number
          check_out: string
        }[]
      }
      approve_inventory_count_slip: {
        Args: { p_slip_id: number }
        Returns: Json
      }
      approve_leave_request: {
        Args: { p_request_id: number }
        Returns: undefined
      }
      approve_waste: {
        Args: { p_decision: string; p_issue_id: number; p_note?: string }
        Returns: undefined
      }
      assert_bank_deposit_evidence: {
        Args: { p_expense_id: number; p_tenant_id: number }
        Returns: undefined
      }
      assert_refund_webhook_allocation: {
        Args: { p_event_id: number }
        Returns: undefined
      }
      assert_sepay_expense_match_evidence: {
        Args: { p_event_id: number; p_tenant_id: number }
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
      attach_print_document_to_payload: {
        Args: {
          p_branch_id: number
          p_kind: string
          p_payload: Json
          p_tenant_id: number
        }
        Returns: Json
      }
      attach_supplier_invoice_vat_evidence: {
        Args: { p_invoice_id: number; p_storage_path: string }
        Returns: undefined
      }
      attendance_shift_workdays: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_scheduled_end: string
          p_scheduled_start: string
        }
        Returns: number
      }
      auth_branch_id: { Args: never; Returns: number }
      auth_is_owner: { Args: { p_user: string }; Returns: boolean }
      auth_role: { Args: never; Returns: string }
      auth_tenant_id: { Args: never; Returns: number }
      auto_close_periods: { Args: never; Returns: number }
      bill_line_items: { Args: { p_order_id: number }; Returns: Json }
      bill_tax_breakdowns: { Args: { p_order_id: number }; Returns: Json }
      branch_business_date: {
        Args: { p_at?: string; p_branch_id: number }
        Returns: string
      }
      branch_business_day_bounds: {
        Args: { p_branch_id: number; p_business_date: string }
        Returns: {
          day_end: string
          day_start: string
        }[]
      }
      branch_manager_approve_consumption_report: {
        Args: { p_report_id: number; p_tenant_id: number }
        Returns: Json
      }
      branch_manager_request_consumption_adjustment: {
        Args: {
          p_report_id: number
          p_review_note: string
          p_tenant_id: number
        }
        Returns: number
      }
      branch_menu_limit_availability: {
        Args: {
          p_branch_id: number
          p_exclude_hold_tokens?: string[]
          p_limit_date: string
          p_stock_gate_enabled?: boolean
          p_tenant_id: number
        }
        Returns: {
          active_hold_demand: number
          available_to_sell: number
          base_price: number
          category_id: number
          category_name: string
          is_disabled: boolean
          item_name: string
          limit_date: string
          limit_id: number
          manual_limit_quantity: number
          menu_item_id: number
          pending_unfinalized_demand: number
          sold_today: number
          stock_allowance_quantity: number
          stock_capacity: number
        }[]
      }
      bulk_create_supplier_items: {
        Args: { p_items: Json; p_supplier_id: number }
        Returns: number
      }
      bulk_import_ingredients: { Args: { p_rows: Json }; Returns: Json }
      bulk_import_production_recipe_specs: {
        Args: { p_groups: Json }
        Returns: Json
      }
      bulk_import_production_recipes: {
        Args: { p_groups: Json }
        Returns: Json
      }
      can_read_branch_ops: { Args: { p_branch_id: number }; Returns: boolean }
      can_read_inventory_monetary: { Args: { p_key: string }; Returns: boolean }
      cancel_expense: { Args: { p_expense_id: number }; Returns: Json }
      cancel_goods_receipt_note: {
        Args: { p_grn_id: number; p_reason: string }
        Returns: Json
      }
      cancel_leave_request: {
        Args: { p_request_id: number }
        Returns: undefined
      }
      cancel_order: {
        Args: { p_order_id: number; p_reason: string }
        Returns: Json
      }
      cancel_pending_payment: {
        Args: { p_branch_id: number; p_payment_id: number; p_tenant_id: number }
        Returns: undefined
      }
      cancel_production_run:
        | { Args: { p_run_id: number }; Returns: Json }
        | {
            Args: { p_branch_id: number; p_reason?: string; p_run_id: number }
            Returns: Json
          }
      cancel_purchase_order: {
        Args: { p_po_id: number; p_reason: string }
        Returns: Json
      }
      cancel_purchase_request: {
        Args: { p_reason: string; p_request_id: number }
        Returns: Json
      }
      cancel_staff_user_provisioning: {
        Args: { p_token: string }
        Returns: undefined
      }
      cancel_stock_request:
        | { Args: { p_request_id: number }; Returns: Json }
        | { Args: { p_reason: string; p_request_id: number }; Returns: Json }
      cancel_stock_transfer: {
        Args: { p_reason: string; p_transfer_id: number }
        Returns: Json
      }
      check_cron_jobs_health: { Args: never; Returns: undefined }
      check_order_ready: { Args: { p_order_id: number }; Returns: undefined }
      claim_print_job: {
        Args: { p_agent_id: string; p_job_id: number }
        Returns: boolean
      }
      claim_tax_invoice_issue_job: {
        Args: { p_job_id: number; p_lease_seconds?: number }
        Returns: {
          attempt_count: number
          branch_id: number
          id: number
          invoice_payload: Json
          order_id: number
          payment_id: number
          tax_invoice_id: number
          tenant_id: number
        }[]
      }
      claim_tax_invoice_issue_jobs: {
        Args: { p_lease_seconds?: number; p_limit?: number }
        Returns: {
          attempt_count: number
          branch_id: number
          id: number
          invoice_payload: Json
          order_id: number
          payment_id: number
          tax_invoice_id: number
          tenant_id: number
        }[]
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
      clear_employee_shift_task_override: {
        Args: { p_employee_id: number }
        Returns: boolean
      }
      clear_order_discount: { Args: { p_order_id: number }; Returns: Json }
      clear_order_item_discount: {
        Args: { p_order_item_id: number; p_reason: string }
        Returns: Json
      }
      close_branch_day: {
        Args: {
          p_branch_id: number
          p_business_date: string
          p_cash_recon?: Json
          p_note?: string
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
        Args: {
          p_closing_cash: number
          p_note?: string
          p_session_id: number
          p_variance_note?: string
        }
        Returns: Json
      }
      close_purchase_order: {
        Args: { p_po_id: number; p_reason: string }
        Returns: Json
      }
      close_purchase_request: {
        Args: { p_reason: string; p_request_id: number }
        Returns: Json
      }
      close_recount_round: {
        Args: { p_round_no: number; p_session_id: number }
        Returns: Json
      }
      close_stock_request: {
        Args: { p_reason: string; p_request_id: number }
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
      complete_production_run: {
        Args: {
          p_actual_ingredients: Json
          p_actual_quantity: number
          p_branch_id: number
          p_run_id: number
        }
        Returns: Json
      }
      complete_stocktake: { Args: { p_session_id: number }; Returns: Json }
      compute_branch_daily_waste_caps: { Args: never; Returns: number }
      compute_discount_amount: {
        Args: { p_subtotal: number; p_type: string; p_value: number }
        Returns: number
      }
      compute_menu_item_stock_capacity: {
        Args: {
          p_branch_id: number
          p_menu_item_id: number
          p_tenant_id: number
        }
        Returns: number
      }
      confirm_cash_payment: {
        Args: { p_cash_received: number; p_order_id: number }
        Returns: Json
      }
      confirm_cash_payment_with_invoice_binding:
        | {
            Args: { p_cash_received: number; p_order_id: number }
            Returns: Json
          }
        | {
            Args: {
              p_cash_received: number
              p_invoice_payload: Json
              p_order_id: number
            }
            Returns: Json
          }
      confirm_goods_receipt_note: { Args: { p_grn_id: number }; Returns: Json }
      confirm_production_run: {
        Args: {
          p_actual_ingredients?: Json
          p_actual_quantity?: number
          p_run_id: number
        }
        Returns: Json
      }
      confirm_sepay_payment: {
        Args: {
          p_account_number: string
          p_bank_reference: string
          p_order_id: number
          p_provider_data: Json
          p_provider_ref: string
          p_tenant_id: number
          p_transfer_amount: number
        }
        Returns: Json
      }
      confirm_stock_issue: { Args: { p_issue_id: number }; Returns: Json }
      confirm_supplier_invoice: {
        Args: { p_idempotency_key: string; p_invoice_id: number }
        Returns: Json
      }
      confirm_supplier_return: { Args: { p_return_id: number }; Returns: Json }
      copy_shift_assignments_week: {
        Args: {
          p_branch_id: number
          p_source_week_start: string
          p_target_week_start: string
          p_tenant_id: number
        }
        Returns: Json
      }
      correct_attendance_record: {
        Args: {
          p_attendance_id: number
          p_check_in: string
          p_check_out: string
          p_reason: string
        }
        Returns: Json
      }
      correct_payment_method: {
        Args: { p_new_method: string; p_payment_id: number; p_reason: string }
        Returns: Json
      }
      count_unread_notifications: { Args: never; Returns: number }
      count_unread_notifications_by_target: {
        Args: never
        Returns: {
          action_url: string
          kind: string
          unread_count: number
        }[]
      }
      create_expense_transfer_intent: {
        Args: {
          p_branch_id: number
          p_category: string
          p_expense_date: string
          p_invoice_attachment_url?: string
          p_note?: string
          p_vat_breakdown: Json
          p_vendor_name?: string
        }
        Returns: {
          expense_id: number
          transfer_content: string
        }[]
      }
      create_expiry_writeoff: {
        Args: {
          p_branch_id: number
          p_grn_item_id?: number
          p_ingredient_id: number
          p_location_id: number
          p_note?: string
          p_photo_urls?: string[]
          p_quantity: number
        }
        Returns: Json
      }
      create_finance_fund_adjustment: {
        Args: {
          p_bank_delta: number
          p_cash_delta: number
          p_idempotency_key: string
          p_reason: string
        }
        Returns: Json
      }
      create_grn_draft_from_po: {
        Args: { p_idempotency_key: string; p_po_id: number }
        Returns: Json
      }
      create_grn_from_approved_po: { Args: { p_po_id: number }; Returns: Json }
      create_inventory_document_correction: {
        Args: {
          p_branch_id: number
          p_document_id: number
          p_document_type: string
          p_idempotency_key: string
          p_ingredient_id: number
          p_quantity_change: number
          p_reason: string
        }
        Returns: Json
      }
      create_order: {
        Args: {
          p_branch_id: number
          p_created_by: string
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
      create_order_with_daily_limit_hold: {
        Args: {
          p_branch_id: number
          p_created_by: string
          p_daily_limit_hold_token?: string
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
      create_production_run:
        | {
            Args: {
              p_branch_id: number
              p_entry_unit_id: number
              p_finished_good_id: number
              p_ingredients_override?: Json
              p_notes?: string
              p_planned_quantity: number
              p_target_branch_id?: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_branch_id: number
              p_notes?: string
              p_planned_quantity: number
              p_recipe_spec_id: number
              p_source_location_id?: number
              p_target_location_id?: number
            }
            Returns: Json
          }
      create_production_run_with_locations: {
        Args: {
          p_branch_id: number
          p_entry_unit_id: number
          p_finished_good_id: number
          p_ingredients_override?: Json
          p_notes?: string
          p_planned_quantity: number
          p_source_location_id?: number
          p_target_branch_id?: number
          p_target_location_id?: number
        }
        Returns: Json
      }
      create_purchase_order_from_request: {
        Args: {
          p_expected_delivery_date: string
          p_lines: Json
          p_notes: string
          p_request_id: number
          p_supplier_id: number
        }
        Returns: Json
      }
      create_purchase_orders_from_grn: {
        Args: { p_grn_id: number }
        Returns: Json
      }
      create_refund: {
        Args: { p_amount: number; p_payment_id: number; p_reason: string }
        Returns: Json
      }
      create_refund_with_payout: {
        Args: {
          p_amount: number
          p_payment_id: number
          p_payout_method: string
          p_reason: string
        }
        Returns: Json
      }
      create_remote_payment_intent: {
        Args: {
          p_amount: number
          p_branch_id: number
          p_created_by: string
          p_method: string
          p_order_id: number
          p_provider_data: Json
          p_provider_ref: string
          p_tenant_id: number
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
      create_supplier_credit_allocated: {
        Args: {
          p_allocations: Json
          p_amount: number
          p_credit_number: string
          p_notes: string
          p_supplier_id: number
        }
        Returns: Json
      }
      create_supplier_invoice_with_allocations:
        | {
            Args: {
              p_document_discount_amount: number
              p_due_date: string
              p_invoice_date: string
              p_invoice_number: string
              p_matching_notes: string
              p_receipts: Json
              p_supplier_id: number
              p_vat_breakdown: Json
            }
            Returns: number
          }
        | {
            Args: {
              p_document_discount_amount: number
              p_due_date: string
              p_invoice_date: string
              p_invoice_kind: string
              p_invoice_number: string
              p_matching_notes: string
              p_receipts: Json
              p_supplier_id: number
              p_vat_breakdown: Json
            }
            Returns: number
          }
      create_supplier_invoice_with_vat_breakdown: {
        Args: {
          p_due_date: string
          p_grn_id: number
          p_invoice_date: string
          p_invoice_number: string
          p_matching_notes: string
          p_po_id: number
          p_supplier_id: number
          p_vat_breakdown: Json
        }
        Returns: number
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
      delete_branch_revenue_target: {
        Args: { p_branch_id: number; p_year_month: string }
        Returns: Json
      }
      delete_payroll_adjustment: {
        Args: { p_adjustment_id: number }
        Returns: undefined
      }
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
      employee_clock_in_with_checklist: {
        Args: {
          p_branch_id: number
          p_business_date: string
          p_employee_id: number
          p_photo_path: string
          p_shift_id: number
          p_tenant_id: number
        }
        Returns: number
      }
      employee_clock_out_with_code: {
        Args: {
          p_attendance_id: number
          p_employee_id: number
          p_tenant_id: number
        }
        Returns: string
      }
      employee_request_clock_out: {
        Args: {
          p_attendance_id: number
          p_employee_id: number
          p_tenant_id: number
        }
        Returns: string
      }
      employee_submit_consumption_report: {
        Args: {
          p_attendance_id: number
          p_lines: Json
          p_no_consumption?: boolean
          p_note?: string
          p_tenant_id: number
        }
        Returns: number
      }
      enable_offline_for_session: {
        Args: { p_session_id: number }
        Returns: Json
      }
      enqueue_cancel_ticket_print: {
        Args: { p_order_item_id: number; p_reason: string }
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
      enqueue_partial_cancel_ticket_print: {
        Args: {
          p_new_quantity: number
          p_old_quantity: number
          p_order_item_id: number
          p_reason: string
        }
        Returns: Json
      }
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
      ensure_branch_inventory_location_defaults: {
        Args: { p_branch_id: number; p_tenant_id: number }
        Returns: undefined
      }
      ensure_order_payment_code: {
        Args: { p_branch_id: number; p_order_id: number; p_tenant_id: number }
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
      expire_stuck_print_jobs: {
        Args: { p_stale_after_seconds?: number }
        Returns: number
      }
      feedback_take_rate_bucket: {
        Args: {
          p_limit: number
          p_scope_hash: string
          p_scope_type: string
          p_window_seconds: number
        }
        Returns: number
      }
      fetch_tax_invoice_issue_attention: { Args: never; Returns: Json }
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
      finish_tax_invoice_issue_job_as_system: {
        Args: { p_job_id: number; p_last_error?: string; p_status: string }
        Returns: Json
      }
      force_close_stale_attendance: {
        Args: {
          p_approved_by: string
          p_attendance_id: number
          p_branch_id: number
          p_note?: string
          p_tenant_id: number
        }
        Returns: string
      }
      fulfill_stock_request_lines: {
        Args: {
          p_from_branch_id: number
          p_from_location_id: number
          p_fulfill_site_kind: string
          p_item_ids: number[]
          p_request_id: number
        }
        Returns: Json
      }
      generate_order_payment_code: { Args: never; Returns: string }
      get_ap_aging: {
        Args: never
        Returns: {
          buckets: Json
          supplier_id: number
          supplier_name: string
          total_outstanding: number
        }[]
      }
      get_bank_ledger_movement_since: {
        Args: { p_since: string }
        Returns: Json
      }
      get_branch_day_summary: {
        Args: { p_branch_id: number; p_business_date: string }
        Returns: Json
      }
      get_branch_menu_daily_limits_for_pos: {
        Args: { p_branch_id: number; p_exclude_hold_tokens?: string[] }
        Returns: {
          active_hold_demand: number
          available_to_sell: number
          is_disabled: boolean
          manual_limit_quantity: number
          menu_item_id: number
          pending_unfinalized_demand: number
          sold_today: number
          stock_allowance_quantity: number
          stock_capacity: number
        }[]
      }
      get_branch_menu_stock_capacity: {
        Args: { p_branch_id: number }
        Returns: {
          menu_item_id: number
          stock_capacity: number
        }[]
      }
      get_branch_revenue_target_progress: {
        Args: { p_branch_id: number; p_year_month?: string }
        Returns: {
          branch_id: number
          gap_amount: number
          net_revenue_mtd: number
          net_revenue_today: number
          progress_pct: number
          reward_tiers: Json
          target_amount: number
          year_month: string
        }[]
      }
      get_cash_ledger_movement_since: {
        Args: { p_since: string }
        Returns: Json
      }
      get_cash_variance_action_target: {
        Args: { p_branch_id: number; p_end_date: string; p_start_date: string }
        Returns: {
          branch_id: number
          cash_difference: number
          session_id: number
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
      get_checkout_review_queue: {
        Args: { p_branch_id: number; p_include_rows?: boolean }
        Returns: {
          pending_count: number
          rows: Json
        }[]
      }
      get_daily_revenue: {
        Args: { p_branch_id: number; p_end_date: string; p_start_date: string }
        Returns: {
          branch_id: number
          cash_revenue: number
          date: string
          order_count: number
          tenant_id: number
          total_revenue: number
          total_tax: number
          vietqr_revenue: number
        }[]
      }
      get_finance_current_funds: { Args: never; Returns: Json }
      get_finance_dashboard_summary: {
        Args: { p_branch_id?: number; p_end_date: string; p_start_date: string }
        Returns: {
          failed_webhook_count: number
          invoice_attention_count: number
          invoice_issued_count: number
          invoice_not_required_count: number
        }[]
      }
      get_finance_reconciliation_attention: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          missing_vietqr_amount: number
          missing_vietqr_count: number
          unmatched_bank_amount: number
          unmatched_bank_count: number
          unmatched_money_in_count: number
          unmatched_money_out_count: number
        }[]
      }
      get_food_cost: {
        Args: {
          p_branch_id?: number
          p_end_date?: string
          p_start_date?: string
        }
        Returns: {
          branch_id: number
          food_cost_pct: number
          ingredient_cost: number
          item_name: string
          menu_item_id: number
          period_end: string
          period_start: string
          quantity_sold: number
          revenue: number
          tenant_id: number
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
      get_inventory_valuation_bootstrap_readiness: {
        Args: never
        Returns: Json
      }
      get_inventory_valuation_period_value: {
        Args: { p_branch_id?: number; p_end_date: string; p_start_date: string }
        Returns: {
          branch_id: number
          closing_value: number
          opening_value: number
        }[]
      }
      get_inventory_valuation_reconciliation: {
        Args: { p_branch_id?: number; p_month: number; p_year: number }
        Returns: Json
      }
      get_inventory_value_period: {
        Args: { p_branch_id?: number; p_end_date: string; p_start_date: string }
        Returns: {
          branch_id: number
          closing_value: number
          opening_value: number
        }[]
      }
      get_invoice_buyer_request_as_system: {
        Args: { p_token_hash: string }
        Returns: Json
      }
      get_kds_ticket_history: {
        Args: {
          p_before_at?: string
          p_before_id?: number
          p_branch_id: number
          p_event_type?: string
          p_from?: string
          p_limit?: number
          p_order_id?: number
          p_to?: string
        }
        Returns: {
          actor_id: string
          actor_name: string
          context: Json
          event_id: number
          event_type: string
          from_status: string
          item_snapshot: Json
          kitchen_send_batch_id: number
          occurred_at: string
          order_id: number
          order_item_id: number
          print_jobs: Json
          reason: string
          station_id: number
          ticket_id: number
          to_status: string
        }[]
      }
      get_leave_review_queue: {
        Args: { p_branch_id: number; p_include_rows?: boolean }
        Returns: {
          pending_count: number
          rows: Json
        }[]
      }
      get_menu_item_sales_agg: {
        Args: {
          p_branch_id?: number
          p_from?: string
          p_order_statuses?: string[]
          p_to?: string
        }
        Returns: {
          branch_id: number
          item_name: string
          menu_item_id: number
          quantity_sold: number
          revenue: number
        }[]
      }
      get_my_count_slip: {
        Args: { p_slip_id: number }
        Returns: {
          counted_quantity: number
          entry_unit_id: number
          ingredient_id: number
          note: string
        }[]
      }
      get_operating_cash_movement_for_period: {
        Args: { p_branch_id?: number; p_end_date: string; p_start_date: string }
        Returns: Json
      }
      get_order_operational_trace: {
        Args: { p_order_id: number }
        Returns: Json
      }
      get_orders_for_day_v2: {
        Args: { p_branch_id: number; p_date: string }
        Returns: {
          audit_event_count: number
          branch_id: number
          branch_name: string
          completed_payment_count: number
          discount_amount: number
          included_side_quantity: number
          invoice_evidence: Json
          invoice_kind: string
          invoice_number: string
          invoice_provider_ref: string
          invoice_status: string
          item_count: number
          item_row_count: number
          kds_completed_item_quantity: number
          kds_completed_ticket_count: number
          kds_legacy_completed_item_quantity: number
          kds_legacy_completed_ticket_count: number
          kds_ticket_count: number
          legacy_current_main_dish_quantity: number
          legacy_current_side_dish_quantity: number
          legacy_unclassified_quantity: number
          main_dish_quantity: number
          order_id: number
          order_number: string
          order_payment_state_mismatch: boolean
          order_payment_status: string
          order_status: string
          order_total_amount: number
          order_type: string
          paid_at: string
          paid_hour: number
          payment_attempt_count: number
          payment_attempts: Json
          payment_id: number
          payment_method: string
          pos_session_id: number
          print_failed_count: number
          print_job_count: number
          printed_job_count: number
          reconciliation_status: string
          served_item_quantity: number
          side_dish_quantity: number
          subtotal: number
          tax_amount: number
          total_amount: number
        }[]
      }
      get_orders_paid_summary: {
        Args: {
          p_branch_id?: number
          p_date_from?: string
          p_date_to?: string
          p_status?: string
        }
        Returns: {
          paid_count: number
          paid_revenue: number
        }[]
      }
      get_orders_summary: {
        Args: {
          p_branch_id?: number
          p_from?: string
          p_status?: string
          p_to?: string
        }
        Returns: {
          in_progress_count: number
          paid_count: number
          paid_revenue: number
          total_count: number
        }[]
      }
      get_pos_session_report: { Args: { p_session_id: number }; Returns: Json }
      get_pos_session_report_legacy_20260725: {
        Args: { p_session_id: number }
        Returns: Json
      }
      get_production_recipe_context: {
        Args: { p_branch_id: number; p_finished_good_id: number }
        Returns: Json
      }
      get_production_recipe_context_for_location: {
        Args: {
          p_branch_id: number
          p_finished_good_id: number
          p_source_location_id?: number
        }
        Returns: Json
      }
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
          net_revenue: number
          order_count: number
          refreshed_at: string
          subtotal_revenue: number
          takeaway_revenue: number
          total_covers: number
          total_tax: number
          vat_by_rate: Json
          vat_total: number
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
      get_stock_movement_report: {
        Args: { p_branch_id?: number; p_end_date: string; p_start_date: string }
        Returns: {
          adjustment: number
          closing: number
          consumption: number
          grn_receipt: number
          ingredient_id: number
          ingredient_name: string
          opening: number
          production_consumption: number
          production_output: number
          transfer_in: number
          transfer_out: number
          unit: string
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
      get_supplier_invoice_valuation_summary: {
        Args: { p_invoice_id: number }
        Returns: Json
      }
      get_tax_invoice_submission_snapshot_as_system: {
        Args: { p_job_id: number }
        Returns: Json
      }
      get_theoretical_consumption: {
        Args: {
          p_branch_id?: number
          p_from?: string
          p_order_statuses?: string[]
          p_to?: string
        }
        Returns: {
          ingredient_id: number
          theoretical_qty: number
        }[]
      }
      get_top_items:
        | {
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
        | {
            Args: {
              p_branch_id: number
              p_end_date: string
              p_limit?: number
              p_start_date: string
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
      heartbeat_zone_lock: {
        Args: {
          p_session_id: number
          p_ttl_seconds?: number
          p_zone_id: string
        }
        Returns: string
      }
      import_sepay_bank_transactions: { Args: { p_rows: Json }; Returns: Json }
      initialize_finance_funds: {
        Args: {
          p_bank_opening: number
          p_cash_opening: number
          p_effective_at: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: Json
      }
      inv_catalog_unit_to_base: {
        Args: { p_all_units: Json; p_base_unit_id: number; p_unit: Json }
        Returns: number
      }
      inv_derive_to_base_factor: {
        Args: {
          p_all_units: Json
          p_anchor_factor: number
          p_anchor_unit_id: number
          p_base_unit_id: number
          p_is_base: boolean
          p_unit_id: number
        }
        Returns: number
      }
      inv_to_base: {
        Args: { p_ingredient_id: number; p_qty: number; p_unit_id: number }
        Returns: number
      }
      inv_to_base_for_tenant: {
        Args: {
          p_ingredient_id: number
          p_qty: number
          p_tenant_id: number
          p_unit_id: number
        }
        Returns: number
      }
      inventory_entry_unit_code: {
        Args: {
          p_entry_unit_id?: number
          p_ingredient_id: number
          p_tenant_id: number
        }
        Returns: string
      }
      inventory_shift_key: {
        Args: { p_at?: string; p_branch_id: number }
        Returns: string
      }
      is_feature_enabled: {
        Args: { p_branch_id: number; p_flag_key: string }
        Returns: boolean
      }
      is_inventory_production_operator: { Args: never; Returns: boolean }
      link_sepay_transaction_to_payment: {
        Args: { p_event_id: number; p_payment_id: number }
        Returns: Json
      }
      list_branch_menu_daily_limits: {
        Args: { p_branch_id: number; p_limit_date?: string }
        Returns: {
          active_hold_demand: number
          available_to_sell: number
          base_price: number
          category_id: number
          category_name: string
          is_disabled: boolean
          item_name: string
          limit_date: string
          limit_id: number
          manual_limit_quantity: number
          menu_item_id: number
          pending_unfinalized_demand: number
          sold_today: number
          stock_allowance_quantity: number
          stock_capacity: number
        }[]
      }
      list_branch_revenue_target_progress: {
        Args: { p_year_month: string }
        Returns: {
          branch_id: number
          branch_name: string
          gap_amount: number
          net_revenue: number
          progress_pct: number
          target_amount: number
          year_month: string
        }[]
      }
      list_branch_revenue_target_reward_tiers: {
        Args: { p_year_month: string }
        Returns: {
          branch_id: number
          reward_tiers: Json
        }[]
      }
      list_branch_revenue_targets: {
        Args: { p_year_month: string }
        Returns: {
          branch_id: number
          branch_name: string
          prior_month_net_revenue: number
          target_amount: number
          year_month: string
        }[]
      }
      list_goods_receipt_notes: {
        Args: {
          p_branch_id?: number
          p_date_field?: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_offset?: number
          p_po_id?: number
          p_purchase_request_id?: number
          p_query?: string
          p_status?: string
          p_supplier_id?: number
        }
        Returns: Json
      }
      list_notifications: {
        Args: {
          p_before?: string
          p_include_expired?: boolean
          p_limit?: number
          p_unread_only?: boolean
        }
        Returns: {
          action_url: string
          body: string
          created_at: string
          entity_id: number
          entity_type: string
          expires_at: string
          id: number
          kind: string
          meta: Json
          read_at: string
          severity: string
          target_branch_id: number
          target_roles: string[]
          tenant_id: number
          title: string
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
      match_sepay_transaction_expenses: {
        Args: { p_event_id: number; p_expense_ids: number[] }
        Returns: Json
      }
      match_sepay_transaction_refunds: {
        Args: { p_event_id: number; p_refund_ids: number[] }
        Returns: Json
      }
      match_sepay_transaction_supplier_payments: {
        Args: { p_event_id: number; p_supplier_payment_ids: number[] }
        Returns: Json
      }
      match_sepay_transfer_intent_event: {
        Args: { p_event_id: number }
        Returns: Json
      }
      materialize_employee_weekly_schedules: { Args: never; Returns: number }
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
      next_inventory_doc_number: {
        Args: { p_doc_kind: string; p_tenant_id: number }
        Returns: string
      }
      next_po_display_id: { Args: { p_tenant_id: number }; Returns: string }
      order_payment_code_is_exposed: {
        Args: {
          p_branch_id: number
          p_order_id: number
          p_payment_code: string
          p_tenant_id: number
        }
        Returns: boolean
      }
      period_status_at: {
        Args: { p_at: string; p_tenant_id: number }
        Returns: string
      }
      pos_daily_limit_item_quantities: {
        Args: { p_items: Json }
        Returns: {
          menu_item_id: number
          quantity: number
        }[]
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
      post_pos_cancelled_ready_waste: {
        Args: { p_actor_id?: string; p_order_id: number; p_reason?: string }
        Returns: Json
      }
      post_pos_sale_consumption_if_ready: {
        Args: { p_actor_id?: string; p_order_id: number }
        Returns: Json
      }
      post_pos_sale_refund_restore: {
        Args: { p_actor_id?: string; p_order_id: number }
        Returns: Json
      }
      prepare_inventory_valuation_cutover: {
        Args: { p_idempotency_key: string }
        Returns: Json
      }
      prepare_staff_user_provisioning: {
        Args: {
          p_branch_id: number
          p_email: string
          p_full_name: string
          p_position_code: string
          p_provisioned_by: string
          p_tenant_id: number
          p_token: string
        }
        Returns: undefined
      }
      prepare_tax_invoice_issue_job_as_system:
        | {
            Args: {
              p_job_id: number
              p_provider_ref: string
              p_tax_invoice_id: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_job_id: number
              p_provider_ref: string
              p_submission_snapshot: Json
              p_subtotal: number
              p_tax_invoice_id: number
              p_total_amount: number
              p_vat_amount: number
            }
            Returns: Json
          }
      prepare_tax_invoice_provider_submission: {
        Args: { p_provider_ref: string; p_tax_invoice_id: number }
        Returns: Json
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
      print_vietqr_ascii: {
        Args: { p_max: number; p_value: string }
        Returns: string
      }
      print_vietqr_bank_bin: { Args: { p_bank_code: string }; Returns: string }
      print_vietqr_crc16: { Args: { p_input: string }; Returns: string }
      print_vietqr_emvco: {
        Args: {
          p_account_name: string
          p_account_no: string
          p_amount: number
          p_bank_code: string
          p_description: string
        }
        Returns: string
      }
      queue_tax_invoice_issue_job_for_completed_order: {
        Args: { p_invoice_payload: Json; p_order_id: number }
        Returns: Json
      }
      recall_kds_ticket: { Args: { p_ticket_id: number }; Returns: string }
      recompute_supplier_invoice_matching: {
        Args: { p_invoice_id: number }
        Returns: Json
      }
      reconcile_bank_transaction_targets: {
        Args: {
          p_bank_transaction_id: number
          p_target_ids: number[]
          p_target_type: string
        }
        Returns: Json
      }
      reconcile_sepay_order_evidence: {
        Args: { p_event_id: number; p_payment_code: string }
        Returns: Json
      }
      reconcile_sepay_order_evidence_core: {
        Args: { p_event_id: number; p_payment_code: string }
        Returns: Json
      }
      reconcile_shift_assignments_week: {
        Args: {
          p_assignments: Json
          p_branch_id: number
          p_tenant_id: number
          p_week_start: string
        }
        Returns: Json
      }
      reconcile_tax_invoice_provider_issued: {
        Args: {
          p_cqt_code?: string
          p_invoice_number: string
          p_issued_at?: string
          p_provider_data?: Json
          p_provider_ref: string
          p_tax_invoice_id: number
          p_trigger_source?: string
        }
        Returns: Json
      }
      record_bank_transaction_cash_deposit: {
        Args: { p_bank_transaction_id: number }
        Returns: Json
      }
      record_production_run: {
        Args: {
          p_actual_ingredients?: Json
          p_actual_quantity: number
          p_branch_id: number
          p_entry_unit_id: number
          p_finished_good_id: number
          p_notes?: string
          p_planned_quantity: number
          p_source_location_id?: number
          p_target_branch_id?: number
          p_target_location_id?: number
        }
        Returns: Json
      }
      record_sepay_cash_deposit_as_system: {
        Args: { p_event_id: number }
        Returns: Json
      }
      record_supplier_payment: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_payment_method: string
          p_reference_note?: string
          p_supplier_invoice_id: number
          p_tenant_id: number
        }
        Returns: Json
      }
      record_supplier_payment_allocated: {
        Args: {
          p_allocations: Json
          p_amount: number
          p_idempotency_key: string
          p_payment_method: string
          p_reference_note: string
          p_supplier_id: number
          p_tenant_id: number
        }
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
      refresh_abc_classification: { Args: never; Returns: number }
      refresh_finance_views: { Args: never; Returns: undefined }
      refresh_inventory_dashboard: { Args: never; Returns: string }
      refund_paid_order: {
        Args: { p_order_id: number; p_reason: string }
        Returns: Json
      }
      refund_paid_order_with_payout: {
        Args: { p_order_id: number; p_payout_method: string; p_reason: string }
        Returns: Json
      }
      register_branch_presence: {
        Args: {
          p_agent_id: string
          p_branch_id: number
          p_ip_address: unknown
          p_tenant_id: number
          p_token_sha256: string
        }
        Returns: {
          ip: string
          ok: boolean
          skipped: boolean
          status: string
        }[]
      }
      reject_employee_clock_out: {
        Args: { p_attendance_id: number; p_note?: string }
        Returns: {
          branch_id: number
          rejected: boolean
        }[]
      }
      reject_leave_request: {
        Args: { p_reason?: string; p_request_id: number }
        Returns: undefined
      }
      reject_refund: { Args: { p_refund_id: number }; Returns: Json }
      reject_stock_request_lines: {
        Args: {
          p_fulfill_site_kind: string
          p_item_ids: number[]
          p_reason: string
          p_request_id: number
        }
        Returns: Json
      }
      release_branch_menu_daily_holds: {
        Args: { p_branch_id: number; p_hold_token: string }
        Returns: Json
      }
      release_table: { Args: { p_table_id: number }; Returns: undefined }
      release_zone_lock: {
        Args: { p_session_id: number; p_zone_id: string }
        Returns: boolean
      }
      reopen_period: {
        Args: { p_month: number; p_tenant_id: number; p_year: number }
        Returns: undefined
      }
      replay_signed_sepay_payment_evidence: {
        Args: {
          p_actor_id: string
          p_event_id: number
          p_payment_code: string
          p_payment_id: number
        }
        Returns: Json
      }
      request_inventory_count_recount: {
        Args: { p_note?: string; p_slip_id: number }
        Returns: undefined
      }
      request_pos_void_after_paid: {
        Args: { p_order_id: number; p_payout_method: string; p_reason: string }
        Returns: Json
      }
      requeue_tax_invoice_issue_job: {
        Args: { p_job_id: number }
        Returns: Json
      }
      reserve_branch_menu_daily_holds: {
        Args: {
          p_branch_id: number
          p_hold_token: string
          p_items: Json
          p_source?: string
          p_ttl_seconds?: number
        }
        Returns: Json
      }
      reserve_tax_invoice_replacement: {
        Args: {
          p_agreement_date: string
          p_agreement_ref: string
          p_buyer_address: string
          p_buyer_kind?: string
          p_buyer_name: string
          p_buyer_tax_code: string
          p_old_id: number
          p_reason: string
        }
        Returns: number
      }
      resolve_branch_printer_for_type: {
        Args: { p_branch_id: number; p_print_type: string; p_tenant_id: number }
        Returns: number
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
      resolve_pos_session_variance: {
        Args: {
          p_note: string
          p_resolution_type: string
          p_session_id: number
        }
        Returns: Json
      }
      resolve_pos_void_request: {
        Args: {
          p_decision: string
          p_request_id: number
          p_resolution_note?: string
        }
        Returns: Json
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
      reverse_payment_and_post: { Args: { p_refund_id: number }; Returns: Json }
      review_completed_vietqr_bank_webhook: {
        Args: { p_payment_id: number; p_status: string }
        Returns: Json
      }
      review_purchase_demand: {
        Args: {
          p_action: string
          p_allocations?: Json
          p_demand_id: number
          p_idempotency_key?: string
          p_reason?: string
        }
        Returns: Json
      }
      review_purchase_order: {
        Args: { p_action: string; p_po_id: number; p_reason?: string }
        Returns: Json
      }
      revoke_permission: {
        Args: {
          p_branch_id: number
          p_permission_key: string
          p_target_user: string
        }
        Returns: number
      }
      rotate_table_self_order_qr: {
        Args: { p_table_id: number }
        Returns: Json
      }
      route_order_to_kds: { Args: { p_order_id: number }; Returns: undefined }
      run_inventory_valuation_reconciliation: { Args: never; Returns: Json }
      save_employee_shift_task_override: {
        Args: { p_employee_id: number; p_tasks: Json }
        Returns: number
      }
      save_employee_weekly_schedule: {
        Args: { p_days: Json; p_effective_from: string; p_employee_id: number }
        Returns: Json
      }
      save_goods_receipt_note: {
        Args: {
          p_grn_id: number
          p_lines: Json
          p_notes: string
          p_received_date: string
        }
        Returns: Json
      }
      save_ingredient_catalog: {
        Args: {
          p_category_id: number
          p_default_fulfill_site_kind: string
          p_ingredient_id: number
          p_issue_unit_id: number
          p_item_kind: string
          p_max_stock_level: number
          p_min_stock_level: number
          p_name: string
          p_production_unit_id: number
          p_receipt_unit_id: number
          p_reorder_point: number
          p_shelf_life_days: number
          p_sku: string
          p_storage_type: string
          p_units: Json
        }
        Returns: number
      }
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
      save_print_template_version: {
        Args: {
          p_content: Json
          p_kind: string
          p_name: string
          p_paper_width_mm: number
        }
        Returns: Json
      }
      save_purchase_demand: {
        Args: {
          p_branch_id: number
          p_demand_id: number
          p_idempotency_key?: string
          p_lines: Json
          p_needed_by: string
          p_notes: string
          p_submit?: boolean
        }
        Returns: Json
      }
      save_purchase_demand_allocations: {
        Args: {
          p_allocations: Json
          p_demand_id: number
          p_idempotency_key: string
        }
        Returns: Json
      }
      save_purchase_order_group: {
        Args: {
          p_branch_id: number
          p_expected_delivery_date: string
          p_group_key: string
          p_idempotency_key?: string
          p_lines: Json
          p_notes: string
          p_submit?: boolean
        }
        Returns: Json
      }
      save_purchase_request: {
        Args: {
          p_branch_id: number
          p_idempotency_key?: string
          p_lines: Json
          p_needed_by: string
          p_notes: string
          p_request_id: number
          p_submit?: boolean
        }
        Returns: Json
      }
      save_station_categories: {
        Args: { p_category_ids: number[]; p_station_id: number }
        Returns: undefined
      }
      save_stock_issue_line: {
        Args: {
          p_entry_unit_id: number
          p_ingredient_id: number
          p_issue_id: number
          p_photo_urls?: string[]
          p_quantity: number
          p_reason?: string
        }
        Returns: Json
      }
      save_stock_request: {
        Args: {
          p_branch_id: number
          p_idempotency_key?: string
          p_lines: Json
          p_needed_at: string
          p_notes: string
          p_request_id: number
          p_submit?: boolean
        }
        Returns: Json
      }
      save_supplier_invoice_draft: {
        Args: {
          p_allocations: Json
          p_idempotency_key: string
          p_invoice: Json
          p_invoice_id: number
          p_lines: Json
        }
        Returns: Json
      }
      save_supplier_invoice_draft_unchecked: {
        Args: {
          p_allocations: Json
          p_idempotency_key: string
          p_invoice: Json
          p_invoice_id: number
          p_lines: Json
        }
        Returns: Json
      }
      scan_inventory_alerts: { Args: never; Returns: number }
      scan_order_delay_sla: { Args: never; Returns: number }
      self_order_accept_request: {
        Args: { p_request_id: number; p_target_order_id?: number }
        Returns: Json
      }
      self_order_active_payment_lock: {
        Args: { p_order_id: number }
        Returns: number
      }
      self_order_branch_has_open_pos_session: {
        Args: { p_branch_id: number; p_tenant_id: number }
        Returns: boolean
      }
      self_order_cancel_payment_request: {
        Args: { p_reason?: string; p_request_id: number }
        Returns: Json
      }
      self_order_cancel_pending_payment_and_add: {
        Args: {
          p_client_op_id: string
          p_customer_note?: string
          p_items: Json
          p_token: string
        }
        Returns: Json
      }
      self_order_cancel_vietqr_payment: {
        Args: { p_client_op_id: string; p_token: string }
        Returns: Json
      }
      self_order_canonicalize_cart: {
        Args: { p_items: Json; p_tenant_id: number }
        Returns: Json
      }
      self_order_consume_rate_limits: {
        Args: {
          p_ip_hash: string
          p_purpose: string
          p_table_id: number
          p_tenant_id: number
          p_token: string
        }
        Returns: Json
      }
      self_order_create_payment_request: {
        Args: {
          p_client_op_id: string
          p_invoice_payload?: Json
          p_method: string
          p_token: string
        }
        Returns: Json
      }
      self_order_expire_payment_request: {
        Args: { p_request_id: number }
        Returns: boolean
      }
      self_order_get_payment_request_status: {
        Args: { p_client_op_id: string; p_token: string }
        Returns: Json
      }
      self_order_get_snapshot:
        | { Args: { p_token: string }; Returns: Json }
        | { Args: { p_client_op_id: string; p_token: string }; Returns: Json }
      self_order_menu_payload: { Args: { p_tenant_id: number }; Returns: Json }
      self_order_normalize_invoice_payload: {
        Args: { p_payload: Json }
        Returns: Json
      }
      self_order_payment_request_fingerprint: {
        Args: { p_invoice_payload: Json; p_method: string }
        Returns: string
      }
      self_order_payment_request_public_payload: {
        Args: { p_request_id: number }
        Returns: Json
      }
      self_order_reconcile_expired_payment_requests: {
        Args: { p_branch_id: number; p_tenant_id: number }
        Returns: number
      }
      self_order_reject_request: {
        Args: { p_request_id: number }
        Returns: Json
      }
      self_order_scope_hash: { Args: { p_value: string }; Returns: string }
      self_order_set_actor_claims: {
        Args: { p_actor: string; p_tenant_id: number }
        Returns: undefined
      }
      self_order_submit: {
        Args: {
          p_client_op_id: string
          p_customer_note: string
          p_items: Json
          p_token: string
        }
        Returns: Json
      }
      self_order_take_rate_bucket: {
        Args: {
          p_limit: number
          p_purpose: string
          p_scope_hash: string
          p_scope_type: string
          p_window_seconds: number
        }
        Returns: number
      }
      self_service_attach_task_photo: {
        Args: { p_item_id: number; p_photo_path: string }
        Returns: undefined
      }
      self_service_cancel_checkout: {
        Args: { p_attendance_id: number }
        Returns: undefined
      }
      self_service_clock_in: {
        Args: {
          p_branch_id: number
          p_business_date: string
          p_photo_path: string
          p_shift_id: number
        }
        Returns: number
      }
      self_service_request_checkout: {
        Args: { p_attendance_id: number }
        Returns: string
      }
      self_service_toggle_task: {
        Args: { p_done: boolean; p_item_id: number }
        Returns: undefined
      }
      send_purchase_order: { Args: { p_po_id: number }; Returns: Json }
      set_auth_role_binding: {
        Args: {
          p_active?: boolean
          p_branch_id?: number
          p_role_code: string
          p_target_user_id: string
        }
        Returns: Json
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
      set_branch_menu_stock_allowance: {
        Args: {
          p_branch_id: number
          p_menu_item_id: number
          p_stock_allowance_quantity: number
        }
        Returns: Json
      }
      set_inventory_count_assignments: {
        Args: {
          p_branch_id: number
          p_employee_id: number
          p_ingredient_ids: number[]
          p_location_id: number
          p_shift_id?: number
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
      set_production_recipe_status: {
        Args: { p_recipe_spec_id: number; p_status: string }
        Returns: Json
      }
      set_shift_assignment_leader: {
        Args: { p_assignment_id: number; p_is_leader: boolean }
        Returns: Json
      }
      set_supplier_item_preferred: {
        Args: { p_is_preferred: boolean; p_item_id: number }
        Returns: Json
      }
      snapshot_payroll_calculation: {
        Args: {
          p_entries: Json
          p_period_month: number
          p_period_year: number
          p_standard_days: number
        }
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
      start_production_run:
        | { Args: { p_run_id: number }; Returns: Json }
        | { Args: { p_branch_id: number; p_run_id: number }; Returns: Json }
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
      stock_ledger_reconciliation: {
        Args: { p_branch_id: number; p_location_id?: number }
        Returns: {
          drift: number
          drift_pct: number
          ingredient_id: number
          ingredient_name: string
          ledger_sum: number
          location_id: number
          stock_levels_qty: number
        }[]
      }
      stock_request_actor_can_read: {
        Args: { p_item_fulfill_site_kind?: string; p_request_id: number }
        Returns: boolean
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
      submit_feedback: {
        Args: {
          p_client_submission_id: string
          p_comment: string
          p_ip_hash: string
          p_rating: number
          p_token: string
        }
        Returns: Json
      }
      submit_inventory_count_slip: {
        Args: {
          p_branch_id: number
          p_lines: Json
          p_location_id: number
          p_shift_id?: number
        }
        Returns: number
      }
      submit_invoice_buyer_request_as_system: {
        Args: { p_invoice_payload: Json; p_token_hash: string }
        Returns: Json
      }
      submit_leave_request: {
        Args: {
          p_branch_id: number
          p_end_date: string
          p_leave_type?: string
          p_reason?: string
          p_start_date: string
        }
        Returns: number
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
      transition_expense_payment: {
        Args: { p_expense_id: number; p_target_method: string }
        Returns: {
          expense_id: number
          paid_at: string
          payment_method: string
          transfer_content: string
        }[]
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
        Args: {
          p_avatar_url?: string
          p_birth_date?: string
          p_full_name?: string
          p_phone?: string
        }
        Returns: undefined
      }
      update_operating_expense: {
        Args: {
          p_branch_id: number
          p_category: string
          p_expense_date: string
          p_expense_id: number
          p_invoice_attachment_url: string
          p_note: string
          p_vat_breakdown: Json
        }
        Returns: Json
      }
      update_pos_order_status: {
        Args: { p_new_status: string; p_order_id: number }
        Returns: Json
      }
      update_purchase_order_prices: {
        Args: { p_lines: Json; p_po_id: number }
        Returns: Json
      }
      update_purchase_order_prices_protected: {
        Args: { p_lines: Json; p_po_id: number }
        Returns: Json
      }
      update_staff_profile: {
        Args: {
          p_branch_id?: number
          p_full_name?: string
          p_is_active?: boolean
          p_phone?: string
          p_position_code?: string
          p_target_id: string
        }
        Returns: undefined
      }
      update_tenant_identity: {
        Args: {
          p_legal_address: string
          p_legal_name: string
          p_representative: string
          p_tax_code: string
        }
        Returns: undefined
      }
      upsert_branch_revenue_targets: {
        Args: { p_rows: Json; p_year_month: string }
        Returns: Json
      }
      upsert_payroll_adjustment: {
        Args: {
          p_adjustment_id?: number
          p_amount?: number
          p_effective_month?: string
          p_employee_id?: number
          p_kind?: string
          p_note?: string
        }
        Returns: number
      }
      upsert_payroll_calculation: {
        Args: { p_entries: Json; p_period_id: number }
        Returns: Json
      }
      upsert_position_shift_tasks: {
        Args: { p_position_id: number; p_tasks: Json }
        Returns: number
      }
      upsert_printer_with_routes: {
        Args: {
          p_branch_id?: number
          p_category_ids?: number[]
          p_code_page?: string
          p_is_active?: boolean
          p_lan_host?: string
          p_lan_port?: number
          p_name?: string
          p_paper_width_mm?: number
          p_print_types?: string[]
          p_printer_id?: number
          p_role?: string
        }
        Returns: number
      }
      upsert_production_recipe_lines:
        | {
            Args: {
              p_finished_good_id: number
              p_lines: Json
              p_old_finished_good_id?: number
              p_output_quantity: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_finished_good_id: number
              p_lines: Json
              p_output_quantity: number
              p_output_unit_id: number
            }
            Returns: Json
          }
      upsert_recipe_lines: {
        Args: {
          p_lines: Json
          p_menu_item_id: number
          p_old_menu_item_id?: number
        }
        Returns: Json
      }
      upsert_shift_checklist_template: {
        Args: {
          p_branch_id: number
          p_items: Json
          p_name: string
          p_template_id: number
          p_tenant_id: number
        }
        Returns: number
      }
      upsert_station_with_categories: {
        Args: {
          p_branch_id?: number
          p_category_ids?: number[]
          p_is_active?: boolean
          p_name?: string
          p_position?: number
          p_station_id?: number
        }
        Returns: number
      }
      verify_service_supplier_invoice: {
        Args: { p_invoice_id: number; p_reason: string }
        Returns: Json
      }
      vietqr_payment_code_prefix: { Args: never; Returns: string }
      void_order_item: {
        Args: { p_order_item_id: number; p_reason: string }
        Returns: Json
      }
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
