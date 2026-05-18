package inventory

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

// registerPurchaseOrderRoutes mounts PO lifecycle endpoints onto r.
func (h *Handler) registerPurchaseOrderRoutes(r chi.Router) {
	r.Get("/purchase-orders", h.listPurchaseOrders)
	r.Post("/purchase-orders", h.createPurchaseOrder)
	r.Get("/purchase-orders/open-for-receiving", h.listOpenPurchaseOrdersForReceiving)
	r.Get("/purchase-orders/{id}", h.getPurchaseOrderDetail)
	r.Put("/purchase-orders/{id}/status", h.updatePurchaseOrderStatus)
	r.Put("/purchase-orders/{id}/lines", h.upsertPurchaseOrderLine)
	r.Delete("/purchase-orders/{id}/lines/{lineId}", h.deletePurchaseOrderLine)
}

// ─── GET /inventory/purchase-orders ─────────────────────────────────────────

func (h *Handler) listPurchaseOrders(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	branchID := nullableIntQuery(r, "branch_id")

	const q = `
		SELECT po.id, po.po_number, po.display_id, po.status, po.ordered_at,
		       po.notes, po.supplier_id, po.branch_id, po.created_by,
		       s.name AS supplier_name,
		       COALESCE(SUM(i.line_total), 0) AS total_est
		FROM public.purchase_orders po
		LEFT JOIN public.suppliers s ON s.id = po.supplier_id
		LEFT JOIN public.purchase_order_items i
		       ON i.po_id = po.id AND i.tenant_id = po.tenant_id
		WHERE po.tenant_id = $1
		  AND ($2::bigint IS NULL OR po.branch_id = $2)
		GROUP BY po.id, s.name
		ORDER BY po.ordered_at DESC
		LIMIT 500`

	rows, err := h.pool.Query(r.Context(), q, claims.TenantID, branchID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải đơn đặt hàng.")
		return
	}
	defer rows.Close()

	type poRow struct {
		ID           int64   `json:"id"`
		PoNumber     string  `json:"po_number"`
		DisplayID    string  `json:"display_id"`
		Status       string  `json:"status"`
		OrderedAt    *string `json:"ordered_at"`
		Notes        *string `json:"notes"`
		SupplierID   int64   `json:"supplier_id"`
		BranchID     int64   `json:"branch_id"`
		CreatedBy    *string `json:"created_by"`
		SupplierName string  `json:"supplier_name"`
		TotalEst     float64 `json:"total_est"`
	}

	out := make([]poRow, 0)
	for rows.Next() {
		var p poRow
		if err := rows.Scan(
			&p.ID, &p.PoNumber, &p.DisplayID, &p.Status, &p.OrderedAt,
			&p.Notes, &p.SupplierID, &p.BranchID, &p.CreatedBy,
			&p.SupplierName, &p.TotalEst,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read PO")
			return
		}
		out = append(out, p)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// ─── POST /inventory/purchase-orders ─────────────────────────────────────────

type createPOBody struct {
	SupplierID int64   `json:"supplier_id"`
	BranchID   int64   `json:"branch_id"`
	Notes      *string `json:"notes"`
}

func (h *Handler) createPurchaseOrder(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body createPOBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.SupplierID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "supplier_id không hợp lệ")
		return
	}
	if body.BranchID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id không hợp lệ")
		return
	}

	// Allocate per-tenant per-year sequential display ID via atomic RPC (F-017).
	var displayID string
	if err := h.pool.QueryRow(r.Context(),
		`SELECT public.next_po_display_id($1)`, claims.TenantID,
	).Scan(&displayID); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể cấp số PO.")
		return
	}

	var id int64
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO public.purchase_orders
		   (tenant_id, branch_id, supplier_id, po_number, display_id, status, notes, created_by)
		 VALUES ($1, $2, $3, $4, $4, 'draft', $5, $6)
		 RETURNING id`,
		claims.TenantID, body.BranchID, body.SupplierID, displayID, body.Notes, claims.UserUUID,
	).Scan(&id)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tạo đơn đặt hàng.")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"id": id, "display_id": displayID})
}

// ─── GET /inventory/purchase-orders/{id} ─────────────────────────────────────

func (h *Handler) getPurchaseOrderDetail(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	poID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || poID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "ID không hợp lệ")
		return
	}

	var po struct {
		ID           int64   `json:"id"`
		PoNumber     string  `json:"po_number"`
		DisplayID    string  `json:"display_id"`
		Status       string  `json:"status"`
		OrderedAt    *string `json:"ordered_at"`
		Notes        *string `json:"notes"`
		SupplierID   int64   `json:"supplier_id"`
		BranchID     int64   `json:"branch_id"`
		SupplierName string  `json:"supplier_name"`
	}
	err = h.pool.QueryRow(r.Context(),
		`SELECT po.id, po.po_number, po.display_id, po.status, po.ordered_at,
		        po.notes, po.supplier_id, po.branch_id, s.name
		 FROM public.purchase_orders po
		 JOIN public.suppliers s ON s.id = po.supplier_id
		 WHERE po.id = $1 AND po.tenant_id = $2`,
		poID, claims.TenantID,
	).Scan(&po.ID, &po.PoNumber, &po.DisplayID, &po.Status, &po.OrderedAt,
		&po.Notes, &po.SupplierID, &po.BranchID, &po.SupplierName)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy đơn đặt hàng.")
		return
	}

	lineRows, err := h.pool.Query(r.Context(),
		`SELECT i.id, i.ingredient_id, ing.name, i.quantity, i.unit, i.unit_price_est, i.line_total
		 FROM public.purchase_order_items i
		 JOIN public.ingredients ing ON ing.id = i.ingredient_id
		 WHERE i.po_id = $1 AND i.tenant_id = $2
		 ORDER BY i.id`,
		poID, claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải chi tiết đơn đặt hàng.")
		return
	}
	defer lineRows.Close()

	type lineRow struct {
		ID             int64    `json:"id"`
		IngredientID   int64    `json:"ingredient_id"`
		IngredientName string   `json:"ingredient_name"`
		Quantity       float64  `json:"quantity"`
		Unit           string   `json:"unit"`
		UnitPriceEst   *float64 `json:"unit_price_est"`
		LineTotal      *float64 `json:"line_total"`
	}

	lines := make([]lineRow, 0)
	for lineRows.Next() {
		var l lineRow
		if err := lineRows.Scan(&l.ID, &l.IngredientID, &l.IngredientName,
			&l.Quantity, &l.Unit, &l.UnitPriceEst, &l.LineTotal); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read PO line")
			return
		}
		lines = append(lines, l)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"po": po, "lines": lines})
}

// ─── PUT /inventory/purchase-orders/{id}/status ───────────────────────────────

type updatePOStatusBody struct {
	Status string `json:"status"`
}

func (h *Handler) updatePurchaseOrderStatus(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	poID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || poID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "ID không hợp lệ")
		return
	}

	var body updatePOStatusBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Status != "sent" && body.Status != "cancelled" {
		httputil.WriteError(w, http.StatusBadRequest, "status phải là 'sent' hoặc 'cancelled'")
		return
	}

	// Fetch current status for transition validation.
	var currentStatus string
	if err := h.pool.QueryRow(r.Context(),
		`SELECT status FROM public.purchase_orders WHERE id = $1 AND tenant_id = $2`,
		poID, claims.TenantID,
	).Scan(&currentStatus); err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy PO.")
		return
	}

	if body.Status == "sent" && currentStatus != "draft" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Chỉ gửi PO khi PO đang ở trạng thái nháp.")
		return
	}
	if body.Status == "cancelled" && currentStatus != "draft" && currentStatus != "sent" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Chỉ hủy PO nháp hoặc PO đã gửi nhưng chưa nhận hàng.")
		return
	}

	// For cancel of a sent PO, check no active GRNs exist.
	if body.Status == "cancelled" && currentStatus == "sent" {
		var grnCount int
		if err := h.pool.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM public.goods_received_notes
			 WHERE tenant_id = $1 AND po_id = $2 AND status <> 'cancelled'`,
			claims.TenantID, poID,
		).Scan(&grnCount); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "Không thể kiểm tra phiếu nhận hàng.")
			return
		}
		if grnCount > 0 {
			httputil.WriteError(w, http.StatusConflict,
				"PO đã có phiếu nhận hàng nên không thể hủy trực tiếp. Hãy xử lý bằng điều chỉnh/đối soát GRN.")
			return
		}
	}

	tag, dbErr := h.pool.Exec(r.Context(),
		`UPDATE public.purchase_orders SET status = $1
		 WHERE id = $2 AND tenant_id = $3 AND status = $4`,
		body.Status, poID, claims.TenantID, currentStatus,
	)
	if dbErr != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể cập nhật trạng thái PO.")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.WriteError(w, http.StatusConflict, "Trạng thái PO đã thay đổi. Vui lòng tải lại và thử lại.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
}

// ─── PUT /inventory/purchase-orders/{id}/lines ────────────────────────────────

type upsertPOLineBody struct {
	IngredientID int64    `json:"ingredient_id"`
	Quantity     float64  `json:"quantity"`
	Unit         string   `json:"unit"`
	UnitPriceEst *float64 `json:"unit_price_est"`
}

func (h *Handler) upsertPurchaseOrderLine(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	poID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || poID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "ID không hợp lệ")
		return
	}

	var body upsertPOLineBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Quantity <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "Số lượng phải lớn hơn 0")
		return
	}
	if body.Unit == "" {
		httputil.WriteError(w, http.StatusBadRequest, "Đơn vị không được để trống")
		return
	}

	// Validate PO exists and check status.
	var status string
	if err := h.pool.QueryRow(r.Context(),
		`SELECT status FROM public.purchase_orders WHERE id = $1 AND tenant_id = $2`,
		poID, claims.TenantID,
	).Scan(&status); err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy PO.")
		return
	}
	if status == "cancelled" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Không thể sửa PO đã hủy.")
		return
	}
	isOwner := string(claims.UserRole) == "owner"
	if !isOwner && status != "draft" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Chỉ chỉnh sửa dòng khi PO đang ở trạng thái nháp.")
		return
	}

	var lineTotal *float64
	if body.UnitPriceEst != nil {
		lt := body.Quantity * *body.UnitPriceEst
		lineTotal = &lt
	}

	var lineID int64
	dbErr := h.pool.QueryRow(r.Context(),
		`INSERT INTO public.purchase_order_items
		   (tenant_id, po_id, ingredient_id, quantity, unit, unit_price_est, line_total)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (po_id, ingredient_id, tenant_id)
		 DO UPDATE SET quantity       = EXCLUDED.quantity,
		               unit            = EXCLUDED.unit,
		               unit_price_est  = EXCLUDED.unit_price_est,
		               line_total      = EXCLUDED.line_total
		 RETURNING id`,
		claims.TenantID, poID, body.IngredientID, body.Quantity, body.Unit, body.UnitPriceEst, lineTotal,
	).Scan(&lineID)
	if dbErr != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể lưu dòng PO.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"id": lineID})
}

// ─── DELETE /inventory/purchase-orders/{id}/lines/{lineId} ───────────────────

func (h *Handler) deletePurchaseOrderLine(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	poID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || poID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "ID không hợp lệ")
		return
	}
	lineID, err := strconv.ParseInt(chi.URLParam(r, "lineId"), 10, 64)
	if err != nil || lineID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "lineId không hợp lệ")
		return
	}

	var status string
	if err := h.pool.QueryRow(r.Context(),
		`SELECT status FROM public.purchase_orders WHERE id = $1 AND tenant_id = $2`,
		poID, claims.TenantID,
	).Scan(&status); err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy PO.")
		return
	}
	if status == "cancelled" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Không thể sửa PO đã hủy.")
		return
	}
	isOwner := string(claims.UserRole) == "owner"
	if !isOwner && status != "draft" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Chỉ xóa dòng khi PO đang ở trạng thái nháp.")
		return
	}

	_, dbErr := h.pool.Exec(r.Context(),
		`DELETE FROM public.purchase_order_items
		 WHERE id = $1 AND po_id = $2 AND tenant_id = $3`,
		lineID, poID, claims.TenantID,
	)
	if dbErr != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể xóa dòng.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
}

// ─── GET /inventory/purchase-orders/open-for-receiving ───────────────────────

func (h *Handler) listOpenPurchaseOrdersForReceiving(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	branchID := nullableIntQuery(r, "branch_id")

	const q = `
		SELECT po.id, po.po_number, po.status, po.ordered_at,
		       po.supplier_id, s.name AS supplier_name,
		       COUNT(i.id) AS line_count,
		       CASE WHEN bool_and(i.line_total IS NOT NULL) THEN SUM(i.line_total) END AS total_est
		FROM public.purchase_orders po
		JOIN public.suppliers s ON s.id = po.supplier_id
		LEFT JOIN public.purchase_order_items i
		       ON i.po_id = po.id AND i.tenant_id = po.tenant_id
		WHERE po.tenant_id = $1
		  AND po.status IN ('sent', 'partially_received')
		  AND ($2::bigint IS NULL OR po.branch_id = $2)
		GROUP BY po.id, s.name
		HAVING COUNT(i.id) > 0
		ORDER BY po.ordered_at DESC`

	rows, err := h.pool.Query(r.Context(), q, claims.TenantID, branchID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải PO chờ nhận.")
		return
	}
	defer rows.Close()

	type openPORow struct {
		ID           int64    `json:"id"`
		PoNumber     string   `json:"po_number"`
		Status       string   `json:"status"`
		OrderedAt    *string  `json:"ordered_at"`
		SupplierID   int64    `json:"supplier_id"`
		SupplierName string   `json:"supplier_name"`
		LineCount    int      `json:"line_count"`
		TotalEst     *float64 `json:"total_est"`
	}

	out := make([]openPORow, 0)
	for rows.Next() {
		var p openPORow
		if err := rows.Scan(
			&p.ID, &p.PoNumber, &p.Status, &p.OrderedAt,
			&p.SupplierID, &p.SupplierName, &p.LineCount, &p.TotalEst,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read open PO")
			return
		}
		out = append(out, p)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}
