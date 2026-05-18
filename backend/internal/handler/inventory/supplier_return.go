package inventory

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

// registerSupplierReturnRoutes mounts supplier-return endpoints onto r.
func (h *Handler) registerSupplierReturnRoutes(r chi.Router) {
	r.Get("/supplier-returns", h.listSupplierReturns)
	r.Get("/supplier-returns/{id}", h.getSupplierReturnDetail)
	r.Post("/supplier-returns/from-grn", h.createSupplierReturnFromGRN)
	r.Post("/supplier-returns/from-stock", h.createSupplierReturnFromStock)
	r.Post("/supplier-returns/{id}/confirm", h.confirmSupplierReturn)
	r.Post("/supplier-returns/{id}/transition", h.transitionSupplierReturn)
}

// ─── GET /inventory/supplier-returns ─────────────────────────────────────────

func (h *Handler) listSupplierReturns(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	branchID := nullableIntQuery(r, "branch_id")

	const q = `
		SELECT sr.id, sr.return_number, sr.status, sr.source, sr.reason,
		       sr.resolution, sr.total_value, sr.created_at, sr.confirmed_at,
		       sr.branch_id, sr.supplier_id, sr.grn_id,
		       s.name AS supplier_name,
		       b.name AS branch_name,
		       g.grn_number
		FROM public.supplier_returns sr
		LEFT JOIN public.suppliers s ON s.id = sr.supplier_id
		LEFT JOIN public.branches b ON b.id = sr.branch_id
		LEFT JOIN public.goods_received_notes g ON g.id = sr.grn_id
		WHERE sr.tenant_id = $1
		  AND ($2::bigint IS NULL OR sr.branch_id = $2)
		ORDER BY sr.created_at DESC`

	rows, err := h.pool.Query(r.Context(), q, claims.TenantID, branchID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải phiếu trả hàng NCC.")
		return
	}
	defer rows.Close()

	type returnRow struct {
		ID           int64    `json:"id"`
		ReturnNumber string   `json:"return_number"`
		Status       string   `json:"status"`
		Source       string   `json:"source"`
		Reason       string   `json:"reason"`
		Resolution   string   `json:"resolution"`
		TotalValue   *float64 `json:"total_value"`
		CreatedAt    string   `json:"created_at"`
		ConfirmedAt  *string  `json:"confirmed_at"`
		BranchID     int64    `json:"branch_id"`
		SupplierID   int64    `json:"supplier_id"`
		GrnID        *int64   `json:"grn_id"`
		SupplierName string   `json:"supplier_name"`
		BranchName   string   `json:"branch_name"`
		GrnNumber    *string  `json:"grn_number"`
	}

	out := make([]returnRow, 0)
	for rows.Next() {
		var s returnRow
		if err := rows.Scan(
			&s.ID, &s.ReturnNumber, &s.Status, &s.Source, &s.Reason,
			&s.Resolution, &s.TotalValue, &s.CreatedAt, &s.ConfirmedAt,
			&s.BranchID, &s.SupplierID, &s.GrnID,
			&s.SupplierName, &s.BranchName, &s.GrnNumber,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read supplier return")
			return
		}
		out = append(out, s)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// ─── GET /inventory/supplier-returns/{id} ────────────────────────────────────

func (h *Handler) getSupplierReturnDetail(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	returnID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	row := h.pool.QueryRow(r.Context(),
		`SELECT sr.id, sr.return_number, sr.status, sr.source, sr.reason,
		        sr.resolution, sr.total_value, sr.notes, sr.created_at, sr.confirmed_at,
		        sr.branch_id, sr.supplier_id, sr.grn_id,
		        s.name AS supplier_name,
		        b.name AS branch_name,
		        g.grn_number
		 FROM public.supplier_returns sr
		 LEFT JOIN public.suppliers s ON s.id = sr.supplier_id
		 LEFT JOIN public.branches b ON b.id = sr.branch_id
		 LEFT JOIN public.goods_received_notes g ON g.id = sr.grn_id
		 WHERE sr.id = $1 AND sr.tenant_id = $2`,
		returnID, claims.TenantID,
	)

	var header struct {
		ID           int64    `json:"id"`
		ReturnNumber string   `json:"return_number"`
		Status       string   `json:"status"`
		Source       string   `json:"source"`
		Reason       string   `json:"reason"`
		Resolution   string   `json:"resolution"`
		TotalValue   *float64 `json:"total_value"`
		Notes        *string  `json:"notes"`
		CreatedAt    string   `json:"created_at"`
		ConfirmedAt  *string  `json:"confirmed_at"`
		BranchID     int64    `json:"branch_id"`
		SupplierID   int64    `json:"supplier_id"`
		GrnID        *int64   `json:"grn_id"`
		SupplierName string   `json:"supplier_name"`
		BranchName   string   `json:"branch_name"`
		GrnNumber    *string  `json:"grn_number"`
	}
	if err := row.Scan(
		&header.ID, &header.ReturnNumber, &header.Status, &header.Source, &header.Reason,
		&header.Resolution, &header.TotalValue, &header.Notes, &header.CreatedAt, &header.ConfirmedAt,
		&header.BranchID, &header.SupplierID, &header.GrnID,
		&header.SupplierName, &header.BranchName, &header.GrnNumber,
	); err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy phiếu trả hàng.")
		return
	}

	lineRows, err := h.pool.Query(r.Context(),
		`SELECT sri.id, sri.ingredient_id, ing.name AS ingredient_name,
		        sri.quantity, sri.unit_cost, sri.total_value,
		        sri.reason_detail, sri.photo_url
		 FROM public.supplier_return_items sri
		 JOIN public.ingredients ing ON ing.id = sri.ingredient_id
		 WHERE sri.return_id = $1 AND sri.tenant_id = $2
		 ORDER BY sri.id`,
		returnID, claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải dòng phiếu trả hàng.")
		return
	}
	defer lineRows.Close()

	type lineRow struct {
		ID             int64   `json:"id"`
		IngredientID   int64   `json:"ingredient_id"`
		IngredientName string  `json:"ingredient_name"`
		Quantity       float64 `json:"quantity"`
		UnitCost       float64 `json:"unit_cost"`
		TotalValue     float64 `json:"total_value"`
		ReasonDetail   *string `json:"reason_detail"`
		PhotoURL       *string `json:"photo_url"`
	}

	lines := make([]lineRow, 0)
	for lineRows.Next() {
		var l lineRow
		if err := lineRows.Scan(
			&l.ID, &l.IngredientID, &l.IngredientName,
			&l.Quantity, &l.UnitCost, &l.TotalValue,
			&l.ReasonDetail, &l.PhotoURL,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read return line")
			return
		}
		lines = append(lines, l)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"header": header, "lines": lines})
}

// ─── POST /inventory/supplier-returns/from-grn ───────────────────────────────
// RPC create_supplier_return_from_grn does NOT use auth.uid() — no WithAuthContext needed.

type fromGRNBody struct {
	GrnID      int64   `json:"grn_id"`
	Resolution string  `json:"resolution"`
	Reason     string  `json:"reason"`
	Notes      *string `json:"notes"`
}

func (h *Handler) createSupplierReturnFromGRN(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body fromGRNBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.GrnID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "grn_id không hợp lệ")
		return
	}
	if !isValidResolution(body.Resolution) {
		body.Resolution = "replacement"
	}
	if !isValidReturnReason(body.Reason) {
		body.Reason = "damaged"
	}

	var raw json.RawMessage
	err := h.pool.QueryRow(r.Context(),
		`SELECT public.create_supplier_return_from_grn($1, $2, $3, $4)`,
		body.GrnID, body.Resolution, body.Reason, body.Notes,
	).Scan(&raw)
	if err != nil {
		status, msg := mapReturnRPCError(err)
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, json.RawMessage(raw))
}

// ─── POST /inventory/supplier-returns/from-stock ──────────────────────────────
// RPC create_supplier_return_from_stock does NOT use auth.uid() — no WithAuthContext needed.

type fromStockLineBody struct {
	IngredientID int64   `json:"ingredient_id"`
	Quantity     float64 `json:"quantity"`
	UnitCost     float64 `json:"unit_cost"`
	ReasonDetail *string `json:"reason_detail"`
	PhotoURL     *string `json:"photo_url"`
}

type fromStockBody struct {
	BranchID   int64               `json:"branch_id"`
	SupplierID int64               `json:"supplier_id"`
	Resolution string              `json:"resolution"`
	Reason     string              `json:"reason"`
	Notes      string              `json:"notes"`
	Lines      []fromStockLineBody `json:"lines"`
}

func (h *Handler) createSupplierReturnFromStock(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body fromStockBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.BranchID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id không hợp lệ")
		return
	}
	if body.SupplierID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "supplier_id không hợp lệ")
		return
	}
	if len(body.Lines) == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "Phải có ít nhất 1 dòng để trả NCC.")
		return
	}
	if !isValidResolution(body.Resolution) {
		body.Resolution = "replacement"
	}
	if !isValidReturnReason(body.Reason) {
		body.Reason = "damaged"
	}

	type rpcLine struct {
		IngredientID int64   `json:"ingredient_id"`
		Quantity     float64 `json:"quantity"`
		UnitCost     float64 `json:"unit_cost"`
		ReasonDetail *string `json:"reason_detail"`
		PhotoURL     *string `json:"photo_url"`
	}
	rpcLines := make([]rpcLine, len(body.Lines))
	for i, l := range body.Lines {
		rpcLines[i] = rpcLine{
			IngredientID: l.IngredientID,
			Quantity:     l.Quantity,
			UnitCost:     l.UnitCost,
			ReasonDetail: l.ReasonDetail,
			PhotoURL:     l.PhotoURL,
		}
	}
	linesJSON, _ := json.Marshal(rpcLines)

	var raw json.RawMessage
	err := h.pool.QueryRow(r.Context(),
		`SELECT public.create_supplier_return_from_stock($1, $2, $3, $4, $5, $6::jsonb)`,
		body.BranchID, body.SupplierID, body.Resolution, body.Reason, body.Notes, linesJSON,
	).Scan(&raw)
	if err != nil {
		status, msg := mapReturnRPCError(err)
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, json.RawMessage(raw))
}

// ─── POST /inventory/supplier-returns/{id}/confirm ───────────────────────────
// RPC confirm_supplier_return uses auth.uid() → WithAuthContext.

func (h *Handler) confirmSupplierReturn(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	returnID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.confirm_supplier_return($1)`, returnID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapReturnRPCError(rpcErr)
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── POST /inventory/supplier-returns/{id}/transition ────────────────────────
// RPC transition_supplier_return does NOT use auth.uid().

type transitionReturnBody struct {
	TargetStatus string  `json:"target_status"`
	Notes        *string `json:"notes"`
}

func (h *Handler) transitionSupplierReturn(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	returnID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body transitionReturnBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.TargetStatus != "credited" && body.TargetStatus != "refunded" && body.TargetStatus != "cancelled" {
		httputil.WriteError(w, http.StatusBadRequest, "target_status phải là 'credited', 'refunded' hoặc 'cancelled'")
		return
	}

	var raw json.RawMessage
	err := h.pool.QueryRow(r.Context(),
		`SELECT public.transition_supplier_return($1, $2, $3)`,
		returnID, body.TargetStatus, body.Notes,
	).Scan(&raw)
	if err != nil {
		status, msg := mapTransitionReturnError(err)
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func isValidResolution(s string) bool {
	return s == "replacement" || s == "credit_note" || s == "cash_refund"
}

func isValidReturnReason(s string) bool {
	switch s {
	case "damaged", "wrong_item", "expired", "quality_fail", "short_delivery_credit", "other":
		return true
	}
	return false
}

// mapReturnRPCError mirrors mapReturnRpcError from supplier-return-actions.ts.
func mapReturnRPCError(err error) (int, string) {
	if err == nil {
		return http.StatusInternalServerError, "Không thể xử lý phiếu trả hàng NCC."
	}
	msg := err.Error()
	if strings.Contains(msg, "forbidden") {
		return http.StatusForbidden, "Không có quyền thực hiện thao tác này."
	}
	if strings.Contains(msg, "no_rejected_lines") {
		return http.StatusUnprocessableEntity, "GRN không có dòng nào bị từ chối — không thể tạo phiếu trả."
	}
	if strings.Contains(msg, "return_not_draft") {
		return http.StatusConflict, "Phiếu trả hàng đã được xác nhận trước đó."
	}
	if strings.Contains(msg, "insufficient_stock_for_return") {
		return http.StatusUnprocessableEntity, "Tồn kho không đủ để trả số lượng yêu cầu."
	}
	if strings.Contains(msg, "invalid_resolution") || strings.Contains(msg, "invalid_reason") {
		return http.StatusBadRequest, "Lý do hoặc cách xử lý không hợp lệ."
	}
	if strings.Contains(msg, "ingredient_not_found") {
		return http.StatusNotFound, "Không tìm thấy nguyên liệu."
	}
	if strings.Contains(msg, "no_lines") {
		return http.StatusBadRequest, "Phải có ít nhất 1 dòng trong phiếu trả."
	}
	return http.StatusInternalServerError, "Không thể xử lý phiếu trả hàng NCC."
}

// mapTransitionReturnError mirrors mapTransitionError from supplier-return-actions.ts.
func mapTransitionReturnError(err error) (int, string) {
	if err == nil {
		return http.StatusInternalServerError, "Không thể chuyển trạng thái phiếu trả."
	}
	msg := err.Error()
	if strings.Contains(msg, "forbidden") {
		return http.StatusForbidden, "Không có quyền thực hiện thao tác này."
	}
	if strings.Contains(msg, "cannot_cancel_after_credit") {
		return http.StatusConflict, "Không thể hủy phiếu đã ghi credit / hoàn tiền."
	}
	if strings.Contains(msg, "must_be_sent_before_credit") {
		return http.StatusUnprocessableEntity, "Phải xác nhận gửi NCC trước khi ghi credit / hoàn tiền."
	}
	if strings.Contains(msg, "resolution_mismatch_credit") {
		return http.StatusUnprocessableEntity, "Phiếu này không phải credit_note — không thể chuyển sang đã credit."
	}
	if strings.Contains(msg, "resolution_mismatch_refund") {
		return http.StatusUnprocessableEntity, "Phiếu này không phải cash_refund — không thể chuyển sang đã hoàn tiền."
	}
	if strings.Contains(msg, "invalid_target_status") {
		return http.StatusBadRequest, "Trạng thái đích không hợp lệ."
	}
	if strings.Contains(msg, "return_not_found") {
		return http.StatusNotFound, "Không tìm thấy phiếu trả."
	}
	return http.StatusInternalServerError, "Không thể chuyển trạng thái phiếu trả."
}
