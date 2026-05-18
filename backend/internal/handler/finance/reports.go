package finance

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

// ─── GET /finance/dashboard/summary ──────────────────────────────────────────
// RPC get_finance_dashboard_summary uses auth.uid() → WithAuthContext.

func (h *Handler) getDashboardSummary(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	if !isDate(startDate) || !isDate(endDate) || startDate > endDate {
		httputil.WriteError(w, http.StatusBadRequest, "Tham số dashboard không hợp lệ.")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_finance_dashboard_summary($1, $2::date, $3::date)`,
			branchID, startDate, endDate,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải chỉ số dashboard.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── GET /finance/branches ────────────────────────────────────────────────────
// Direct SELECT — returns branches the caller can access based on their role/area.

func (h *Handler) getAccessibleBranches(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	type branch struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
	}

	var rows []branch

	switch string(claims.UserRole) {
	case "owner", "super_manager":
		dbRows, err := h.pool.Query(r.Context(),
			`SELECT id, name FROM public.branches
			 WHERE tenant_id = $1 AND branch_kind = 'branch' AND is_active = true
			 ORDER BY name`,
			claims.TenantID,
		)
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách chi nhánh.")
			return
		}
		defer dbRows.Close()
		rows = make([]branch, 0)
		for dbRows.Next() {
			var b branch
			if err := dbRows.Scan(&b.ID, &b.Name); err != nil {
				httputil.WriteError(w, http.StatusInternalServerError, "failed to read branch")
				return
			}
			rows = append(rows, b)
		}

	case "area_manager":
		if claims.AreaID == nil {
			httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": []branch{}})
			return
		}
		dbRows, err := h.pool.Query(r.Context(),
			`SELECT b.id, b.name
			 FROM public.area_branches ab
			 JOIN public.branches b ON b.id = ab.branch_id AND b.tenant_id = ab.tenant_id
			 WHERE ab.tenant_id = $1 AND ab.area_id = $2
			   AND b.is_active = true AND b.branch_kind = 'branch'
			 ORDER BY b.name`,
			claims.TenantID, *claims.AreaID,
		)
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách chi nhánh.")
			return
		}
		defer dbRows.Close()
		rows = make([]branch, 0)
		for dbRows.Next() {
			var b branch
			if err := dbRows.Scan(&b.ID, &b.Name); err != nil {
				httputil.WriteError(w, http.StatusInternalServerError, "failed to read branch")
				return
			}
			rows = append(rows, b)
		}

	default:
		if claims.BranchID == nil {
			httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": []branch{}})
			return
		}
		var b branch
		err := h.pool.QueryRow(r.Context(),
			`SELECT id, name FROM public.branches
			 WHERE tenant_id = $1 AND id = $2 AND is_active = true`,
			claims.TenantID, *claims.BranchID,
		).Scan(&b.ID, &b.Name)
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": []branch{}})
			return
		}
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải chi nhánh.")
			return
		}
		rows = []branch{b}
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": rows})
}

// ─── POST /finance/views/refresh ─────────────────────────────────────────────
// refresh_finance_views is a maintenance RPC with no auth.uid() dependency.

func (h *Handler) refreshViews(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	if _, err := h.pool.Exec(r.Context(), `SELECT public.refresh_finance_views()`); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể làm mới dữ liệu báo cáo.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── GET /finance/food-cost ───────────────────────────────────────────────────
// RPC get_food_cost uses auth.uid() → WithAuthContext.

func (h *Handler) getFoodCost(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		var sArg, eArg *string
		if isDate(startDate) {
			sArg = &startDate
		}
		if isDate(endDate) {
			eArg = &endDate
		}
		return tx.QueryRow(r.Context(),
			`SELECT public.get_food_cost($1, $2::date, $3::date)`,
			branchID, sArg, eArg,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải dữ liệu food cost.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── GET /finance/invoices ────────────────────────────────────────────────────

func (h *Handler) listInvoices(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")

	const q = `
		SELECT
			ti.id, ti.invoice_number, ti.status, ti.buyer_name, ti.buyer_tax_code,
			ti.subtotal, ti.vat_rate, ti.vat_amount, ti.total_amount,
			ti.issued_at, ti.cancelled_at, ti.archived_at, ti.created_at,
			o.order_number
		FROM public.tax_invoices ti
		LEFT JOIN public.orders o ON o.id = ti.order_id AND o.tenant_id = ti.tenant_id
		WHERE ti.tenant_id = $1
		  AND ($2::bigint IS NULL OR ti.branch_id = $2)
		ORDER BY ti.created_at DESC`

	rows, err := h.pool.Query(r.Context(), q, claims.TenantID, branchID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách hóa đơn.")
		return
	}
	defer rows.Close()

	type invoiceRow struct {
		ID            int64           `json:"id"`
		InvoiceNumber *string         `json:"invoice_number"`
		Status        string          `json:"status"`
		BuyerName     *string         `json:"buyer_name"`
		BuyerTaxCode  *string         `json:"buyer_tax_code"`
		Subtotal      json.RawMessage `json:"subtotal"`
		VatRate       json.RawMessage `json:"vat_rate"`
		VatAmount     json.RawMessage `json:"vat_amount"`
		TotalAmount   json.RawMessage `json:"total_amount"`
		IssuedAt      *string         `json:"issued_at"`
		CancelledAt   *string         `json:"cancelled_at"`
		ArchivedAt    *string         `json:"archived_at"`
		CreatedAt     string          `json:"created_at"`
		OrderNumber   *string         `json:"order_number"`
	}

	out := make([]invoiceRow, 0)
	for rows.Next() {
		var inv invoiceRow
		var issuedAt, cancelledAt, archivedAt sql.NullTime
		var createdAt time.Time
		if err := rows.Scan(
			&inv.ID, &inv.InvoiceNumber, &inv.Status, &inv.BuyerName, &inv.BuyerTaxCode,
			&inv.Subtotal, &inv.VatRate, &inv.VatAmount, &inv.TotalAmount,
			&issuedAt, &cancelledAt, &archivedAt, &createdAt,
			&inv.OrderNumber,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read invoice")
			return
		}
		if issuedAt.Valid {
			s := issuedAt.Time.Format(time.RFC3339)
			inv.IssuedAt = &s
		}
		if cancelledAt.Valid {
			s := cancelledAt.Time.Format(time.RFC3339)
			inv.CancelledAt = &s
		}
		if archivedAt.Valid {
			s := archivedAt.Time.Format(time.RFC3339)
			inv.ArchivedAt = &s
		}
		inv.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, inv)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// ─── GET /finance/invoices/{id}/events ───────────────────────────────────────

func (h *Handler) listInvoiceEvents(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	invoiceID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	const q = `
		SELECT id, from_status, to_status, payload, note, actor_id, created_at
		FROM public.tax_invoice_events
		WHERE tax_invoice_id = $1 AND tenant_id = $2
		ORDER BY created_at DESC`

	rows, err := h.pool.Query(r.Context(), q, invoiceID, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải nhật ký hóa đơn.")
		return
	}
	defer rows.Close()

	type eventRow struct {
		ID         int64           `json:"id"`
		FromStatus *string         `json:"from_status"`
		ToStatus   string          `json:"to_status"`
		Payload    json.RawMessage `json:"payload"`
		Note       *string         `json:"note"`
		ActorID    *string         `json:"actor_id"`
		CreatedAt  string          `json:"created_at"`
	}

	out := make([]eventRow, 0)
	for rows.Next() {
		var ev eventRow
		var createdAt time.Time
		if err := rows.Scan(
			&ev.ID, &ev.FromStatus, &ev.ToStatus, &ev.Payload, &ev.Note, &ev.ActorID, &createdAt,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read event")
			return
		}
		ev.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, ev)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// ─── POST /finance/invoices/{id}/cancel ──────────────────────────────────────
// RPC transition_tax_invoice_state uses auth.uid() → WithAuthContext.

func (h *Handler) cancelInvoice(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	invoiceID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len([]rune(body.Reason)) < 20 {
		httputil.WriteError(w, http.StatusBadRequest, "Lý do hủy phải có ít nhất 20 ký tự")
		return
	}
	if len([]rune(body.Reason)) > 500 {
		httputil.WriteError(w, http.StatusBadRequest, "Lý do hủy quá dài")
		return
	}

	payload, _ := json.Marshal(map[string]string{"cancel_reason": body.Reason})
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(),
			`SELECT public.transition_tax_invoice_state($1, $2, $3::jsonb, $4)`,
			invoiceID, "cancelled", payload, body.Reason,
		)
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể hủy hóa đơn.")
		httputil.WriteError(w, status, msg)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── GET /finance/audit-logs ──────────────────────────────────────────────────

func (h *Handler) getAuditLogs(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	entityType := r.URL.Query().Get("entity_type")
	limitStr := r.URL.Query().Get("limit")
	limit := int64(100)
	if limitStr != "" {
		if n, err := strconv.ParseInt(limitStr, 10, 64); err == nil && n >= 1 && n <= 500 {
			limit = n
		}
	}

	var etArg *string
	if entityType != "" {
		etArg = &entityType
	}

	const q = `
		SELECT id, action, entity_type, entity_id, user_id, created_at
		FROM public.audit_logs
		WHERE tenant_id = $1
		  AND ($2::text IS NULL OR entity_type = $2)
		ORDER BY created_at DESC
		LIMIT $3`

	rows, err := h.pool.Query(r.Context(), q, claims.TenantID, etArg, limit)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải nhật ký hoạt động.")
		return
	}
	defer rows.Close()

	type logRow struct {
		ID         int64   `json:"id"`
		Action     string  `json:"action"`
		EntityType string  `json:"entity_type"`
		EntityID   *int64  `json:"entity_id"`
		UserID     *string `json:"user_id"`
		CreatedAt  string  `json:"created_at"`
	}

	out := make([]logRow, 0)
	for rows.Next() {
		var l logRow
		var createdAt time.Time
		if err := rows.Scan(&l.ID, &l.Action, &l.EntityType, &l.EntityID, &l.UserID, &createdAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read audit log")
			return
		}
		l.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, l)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}
