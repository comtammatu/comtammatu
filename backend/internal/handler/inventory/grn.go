package inventory

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

// registerGRNRoutes mounts GRN, supplier-invoice, and menu-recipe endpoints onto r.
func (h *Handler) registerGRNRoutes(r chi.Router) {
	// GRN lifecycle
	r.Get("/grn", h.listGRNs)
	r.Post("/grn", h.createGRNDraft)
	r.Get("/grn/for-po/{poId}", h.listGRNsForPO)
	r.Post("/grn/from-po", h.createGRNFromPO)
	r.Get("/grn/{id}", h.getGRNDetail)
	r.Put("/grn/{id}/lines", h.upsertGRNLine)
	r.Delete("/grn/{id}/lines/{lineId}", h.deleteGRNLine)
	r.Post("/grn/{id}/confirm", h.confirmGRN)
	r.Post("/grn/{id}/amend-line", h.amendGRNLine)

	// Supplier invoices
	r.Get("/supplier-invoices", h.listSupplierInvoices)
	r.Post("/supplier-invoices", h.createSupplierInvoice)
	r.Post("/supplier-invoices/{id}/recompute-matching", h.recomputeInvoiceMatching)

	// Menu-item recipes (BOM for sale items — distinct from production-recipes in recipes.go)
	r.Get("/menu-recipes", h.listMenuRecipes)
	r.Post("/menu-recipes", h.upsertMenuRecipeLines)
	r.Get("/menu-recipes/menu-items", h.listMenuItemsForRecipes)
	r.Get("/stock/central-kitchen-wac", h.getCentralKitchenWAC)

	// Spreadsheet export/import for menu-item recipes — stubbed (R2 deferred to Phase E).
	r.Get("/menu-recipes/export", h.exportMenuRecipesStub)
	r.Post("/menu-recipes/import", h.importMenuRecipesStub)
	r.Get("/menu-recipes/template", h.downloadMenuRecipeTemplateStub)
}

// ─── GET /inventory/grn ───────────────────────────────────────────────────────

func (h *Handler) listGRNs(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	branchID := nullableIntQuery(r, "branch_id")

	const q = `
		SELECT g.id, g.grn_number, g.status, g.received_date, g.notes,
		       g.supplier_id, g.branch_id, g.po_id,
		       s.name AS supplier_name,
		       po.po_number
		FROM public.goods_received_notes g
		LEFT JOIN public.suppliers s ON s.id = g.supplier_id
		LEFT JOIN public.purchase_orders po ON po.id = g.po_id
		WHERE g.tenant_id = $1
		  AND ($2::bigint IS NULL OR g.branch_id = $2)
		ORDER BY g.received_date DESC
		LIMIT 500`

	rows, err := h.pool.Query(r.Context(), q, claims.TenantID, branchID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải phiếu nhập.")
		return
	}
	defer rows.Close()

	type grnRow struct {
		ID           int64   `json:"id"`
		GrnNumber    string  `json:"grn_number"`
		Status       string  `json:"status"`
		ReceivedDate *string `json:"received_date"`
		Notes        *string `json:"notes"`
		SupplierID   int64   `json:"supplier_id"`
		BranchID     int64   `json:"branch_id"`
		PoID         *int64  `json:"po_id"`
		SupplierName string  `json:"supplier_name"`
		PoNumber     *string `json:"po_number"`
	}

	out := make([]grnRow, 0)
	for rows.Next() {
		var g grnRow
		if err := rows.Scan(
			&g.ID, &g.GrnNumber, &g.Status, &g.ReceivedDate, &g.Notes,
			&g.SupplierID, &g.BranchID, &g.PoID,
			&g.SupplierName, &g.PoNumber,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read GRN")
			return
		}
		out = append(out, g)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// ─── POST /inventory/grn ──────────────────────────────────────────────────────

type createGRNDraftBody struct {
	SupplierID int64   `json:"supplier_id"`
	BranchID   int64   `json:"branch_id"`
	PoID       *int64  `json:"po_id"`
	Notes      *string `json:"notes"`
}

func (h *Handler) createGRNDraft(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body createGRNDraftBody
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

	// ON CONFLICT upserts to avoid orphan drafts (mirrors Sprint 6 #3 race-friendly logic).
	var id int64
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO public.goods_received_notes
		   (tenant_id, branch_id, supplier_id, po_id, grn_number, status, notes, created_by)
		 VALUES ($1, $2, $3, $4,
		         'GRN-' || substring(gen_random_uuid()::text, 1, 8),
		         'draft', $5, $6)
		 ON CONFLICT ON CONSTRAINT uq_grn_active_draft_per_user_supplier
		 DO UPDATE SET updated_at = NOW()
		 RETURNING id`,
		claims.TenantID, body.BranchID, body.SupplierID, body.PoID, body.Notes, claims.UserUUID,
	).Scan(&id)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tạo phiếu nhập.")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"id": id})
}

// ─── GET /inventory/grn/{id} ──────────────────────────────────────────────────

func (h *Handler) getGRNDetail(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	grnID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var grn struct {
		ID           int64   `json:"id"`
		GrnNumber    string  `json:"grn_number"`
		Status       string  `json:"status"`
		ReceivedDate *string `json:"received_date"`
		Notes        *string `json:"notes"`
		SupplierID   int64   `json:"supplier_id"`
		BranchID     int64   `json:"branch_id"`
		PoID         *int64  `json:"po_id"`
		SupplierName string  `json:"supplier_name"`
		BranchName   string  `json:"branch_name"`
		BranchKind   string  `json:"branch_kind"`
		PoNumber     *string `json:"po_number"`
	}
	err := h.pool.QueryRow(r.Context(),
		`SELECT g.id, g.grn_number, g.status, g.received_date, g.notes,
		        g.supplier_id, g.branch_id, g.po_id,
		        s.name, b.name, b.branch_kind,
		        po.po_number
		 FROM public.goods_received_notes g
		 LEFT JOIN public.suppliers s ON s.id = g.supplier_id
		 LEFT JOIN public.branches b ON b.id = g.branch_id
		 LEFT JOIN public.purchase_orders po ON po.id = g.po_id
		 WHERE g.id = $1 AND g.tenant_id = $2`,
		grnID, claims.TenantID,
	).Scan(
		&grn.ID, &grn.GrnNumber, &grn.Status, &grn.ReceivedDate, &grn.Notes,
		&grn.SupplierID, &grn.BranchID, &grn.PoID,
		&grn.SupplierName, &grn.BranchName, &grn.BranchKind, &grn.PoNumber,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy phiếu nhập.")
		return
	}

	lineRows, err := h.pool.Query(r.Context(),
		`SELECT gi.id, gi.ingredient_id, ing.name, ing.unit, ing.purchase_unit,
		        gi.received_quantity, gi.rejected_quantity, gi.unit_cost, gi.total_cost,
		        gi.quality_status, gi.receiving_temperature, gi.batch_number, gi.expiry_date,
		        gi.rejection_reason, gi.rejected_photo_url,
		        gi.price_override_note, gi.short_delivery_action
		 FROM public.grn_items gi
		 JOIN public.ingredients ing ON ing.id = gi.ingredient_id
		 WHERE gi.grn_id = $1 AND gi.tenant_id = $2
		 ORDER BY gi.id`,
		grnID, claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải chi tiết phiếu nhập.")
		return
	}
	defer lineRows.Close()

	type lineRow struct {
		ID                  int64    `json:"id"`
		IngredientID        int64    `json:"ingredient_id"`
		IngredientName      string   `json:"ingredient_name"`
		Unit                string   `json:"unit"`
		PurchaseUnit        *string  `json:"purchase_unit"`
		ReceivedQuantity    float64  `json:"received_quantity"`
		RejectedQuantity    *float64 `json:"rejected_quantity"`
		UnitCost            float64  `json:"unit_cost"`
		TotalCost           float64  `json:"total_cost"`
		QualityStatus       string   `json:"quality_status"`
		ReceivingTemp       *float64 `json:"receiving_temperature"`
		BatchNumber         *string  `json:"batch_number"`
		ExpiryDate          *string  `json:"expiry_date"`
		RejectionReason     *string  `json:"rejection_reason"`
		RejectedPhotoURL    *string  `json:"rejected_photo_url"`
		PriceOverrideNote   *string  `json:"price_override_note"`
		ShortDeliveryAction *string  `json:"short_delivery_action"`
	}

	lines := make([]lineRow, 0)
	for lineRows.Next() {
		var l lineRow
		if err := lineRows.Scan(
			&l.ID, &l.IngredientID, &l.IngredientName, &l.Unit, &l.PurchaseUnit,
			&l.ReceivedQuantity, &l.RejectedQuantity, &l.UnitCost, &l.TotalCost,
			&l.QualityStatus, &l.ReceivingTemp, &l.BatchNumber, &l.ExpiryDate,
			&l.RejectionReason, &l.RejectedPhotoURL,
			&l.PriceOverrideNote, &l.ShortDeliveryAction,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read GRN line")
			return
		}
		lines = append(lines, l)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"grn": grn, "lines": lines})
}

// ─── PUT /inventory/grn/{id}/lines ────────────────────────────────────────────

type upsertGRNLineBody struct {
	IngredientID          int64    `json:"ingredient_id"`
	ReceivedQuantity      float64  `json:"received_quantity"`
	Unit                  string   `json:"unit"`
	UnitCost              float64  `json:"unit_cost"`
	QualityStatus         string   `json:"quality_status"`
	ReceivingTemperature  *float64 `json:"receiving_temperature"`
	BatchNumber           *string  `json:"batch_number"`
	ExpiryDate            *string  `json:"expiry_date"`
	RejectedQuantity      *float64 `json:"rejected_quantity"`
	RejectionReason       *string  `json:"rejection_reason"`
	RejectedPhotoURL      *string  `json:"rejected_photo_url"`
	PriceOverrideNote     *string  `json:"price_override_note"`
	PriceOverridePhotoURL *string  `json:"price_override_photo_url"`
	ShortDeliveryAction   *string  `json:"short_delivery_action"`
}

func (h *Handler) upsertGRNLine(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	grnID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body upsertGRNLineBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.ReceivedQuantity < 0 {
		httputil.WriteError(w, http.StatusBadRequest, "received_quantity phải >= 0")
		return
	}
	if body.Unit == "" {
		httputil.WriteError(w, http.StatusBadRequest, "unit không được để trống")
		return
	}

	var status string
	if err := h.pool.QueryRow(r.Context(),
		`SELECT status FROM public.goods_received_notes WHERE id = $1 AND tenant_id = $2`,
		grnID, claims.TenantID,
	).Scan(&status); err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy phiếu nhập.")
		return
	}
	if status != "draft" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Chỉ chỉnh sửa dòng khi phiếu nhập đang ở trạng thái nháp.")
		return
	}

	// Auto-set rejected = received when quality_status = "rejected".
	rejected := body.RejectedQuantity
	if body.QualityStatus == "rejected" {
		rejected = &body.ReceivedQuantity
	}
	if rejected != nil && *rejected > 0 && (body.RejectionReason == nil || *body.RejectionReason == "") {
		httputil.WriteError(w, http.StatusBadRequest, "Phải nhập lý do khi có hàng từ chối nhập.")
		return
	}
	if rejected != nil && *rejected > body.ReceivedQuantity {
		httputil.WriteError(w, http.StatusBadRequest, "Số trả NCC không được vượt số đã giao.")
		return
	}

	totalCost := body.ReceivedQuantity * body.UnitCost

	var lineID int64
	dbErr := h.pool.QueryRow(r.Context(),
		`INSERT INTO public.grn_items
		   (tenant_id, grn_id, ingredient_id, received_quantity, unit, unit_cost, total_cost,
		    quality_status, receiving_temperature, batch_number, expiry_date,
		    rejected_quantity, rejection_reason, rejected_photo_url,
		    price_override_note, price_override_photo_url, short_delivery_action)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
		 ON CONFLICT (grn_id, ingredient_id, tenant_id)
		 DO UPDATE SET
		   received_quantity        = EXCLUDED.received_quantity,
		   unit                     = EXCLUDED.unit,
		   unit_cost                = EXCLUDED.unit_cost,
		   total_cost               = EXCLUDED.total_cost,
		   quality_status           = EXCLUDED.quality_status,
		   receiving_temperature    = EXCLUDED.receiving_temperature,
		   batch_number             = EXCLUDED.batch_number,
		   expiry_date              = EXCLUDED.expiry_date,
		   rejected_quantity        = EXCLUDED.rejected_quantity,
		   rejection_reason         = EXCLUDED.rejection_reason,
		   rejected_photo_url       = EXCLUDED.rejected_photo_url,
		   price_override_note      = EXCLUDED.price_override_note,
		   price_override_photo_url = EXCLUDED.price_override_photo_url,
		   short_delivery_action    = EXCLUDED.short_delivery_action
		 RETURNING id`,
		claims.TenantID, grnID, body.IngredientID,
		body.ReceivedQuantity, body.Unit, body.UnitCost, totalCost,
		body.QualityStatus, body.ReceivingTemperature, body.BatchNumber, body.ExpiryDate,
		rejected, body.RejectionReason, body.RejectedPhotoURL,
		body.PriceOverrideNote, body.PriceOverridePhotoURL, body.ShortDeliveryAction,
	).Scan(&lineID)
	if dbErr != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể lưu dòng phiếu nhập.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"id": lineID})
}

// ─── DELETE /inventory/grn/{id}/lines/{lineId} ───────────────────────────────

func (h *Handler) deleteGRNLine(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	grnID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	lineID, ok := requirePathInt(w, chi.URLParam(r, "lineId"))
	if !ok {
		return
	}

	var status string
	if err := h.pool.QueryRow(r.Context(),
		`SELECT status FROM public.goods_received_notes WHERE id = $1 AND tenant_id = $2`,
		grnID, claims.TenantID,
	).Scan(&status); err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy phiếu nhập.")
		return
	}
	if status != "draft" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Chỉ xóa dòng khi phiếu nhập đang ở trạng thái nháp.")
		return
	}

	_, dbErr := h.pool.Exec(r.Context(),
		`DELETE FROM public.grn_items WHERE id = $1 AND grn_id = $2 AND tenant_id = $3`,
		lineID, grnID, claims.TenantID,
	)
	if dbErr != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể xóa dòng.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
}

// ─── POST /inventory/grn/{id}/confirm ────────────────────────────────────────
// RPC confirm_goods_receipt_note uses auth.uid() → WithAuthContext.

func (h *Handler) confirmGRN(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	grnID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.confirm_goods_receipt_note($1)`, grnID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapGRNRPCError(rpcErr)
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── POST /inventory/grn/{id}/amend-line ─────────────────────────────────────
// RPC amend_grn_line uses auth.uid() → WithAuthContext.

type amendGRNLineBody struct {
	LineID           int64    `json:"line_id"`
	ReceivedQuantity float64  `json:"received_quantity"`
	RejectedQuantity *float64 `json:"rejected_quantity"`
	UnitCost         float64  `json:"unit_cost"`
	Reason           string   `json:"reason"`
}

func (h *Handler) amendGRNLine(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	grnID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body amendGRNLineBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.LineID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "line_id không hợp lệ")
		return
	}
	if len([]rune(body.Reason)) < 5 {
		httputil.WriteError(w, http.StatusBadRequest, "Lý do tối thiểu 5 ký tự")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.amend_grn_line($1, $2, $3, $4, $5, $6)`,
			grnID, body.LineID, body.ReceivedQuantity, body.UnitCost, body.Reason, body.RejectedQuantity,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapGRNRPCError(rpcErr)
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── GET /inventory/grn/for-po/{poId} ────────────────────────────────────────

func (h *Handler) listGRNsForPO(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	poID, ok := requirePathInt(w, chi.URLParam(r, "poId"))
	if !ok {
		return
	}

	rows, err := h.pool.Query(r.Context(),
		`SELECT id, grn_number, status, received_date
		 FROM public.goods_received_notes
		 WHERE po_id = $1 AND tenant_id = $2
		 ORDER BY received_date DESC`,
		poID, claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải phiếu nhập.")
		return
	}
	defer rows.Close()

	type linkedGRN struct {
		ID           int64   `json:"id"`
		GrnNumber    string  `json:"grn_number"`
		Status       string  `json:"status"`
		ReceivedDate *string `json:"received_date"`
	}

	out := make([]linkedGRN, 0)
	for rows.Next() {
		var g linkedGRN
		if err := rows.Scan(&g.ID, &g.GrnNumber, &g.Status, &g.ReceivedDate); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read GRN")
			return
		}
		out = append(out, g)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// ─── POST /inventory/grn/from-po ─────────────────────────────────────────────
// RPC create_grn_from_po uses auth.uid() → WithAuthContext.

type createGRNFromPOBody struct {
	PoID int64 `json:"po_id"`
}

func (h *Handler) createGRNFromPO(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body createGRNFromPOBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.PoID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "po_id không hợp lệ")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.create_grn_from_po($1)`, body.PoID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapGRNFromPORPCError(rpcErr)
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, json.RawMessage(raw))
}

// ─── Supplier Invoices ────────────────────────────────────────────────────────

// GET /inventory/supplier-invoices

func (h *Handler) listSupplierInvoices(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	branchID := nullableIntQuery(r, "branch_id")

	const q = `
		SELECT si.id, si.invoice_number, si.invoice_date, si.total_amount,
		       si.matching_status, si.subtotal, si.supplier_id, si.grn_id,
		       si.due_date, si.payment_status, si.paid_amount, si.paid_at,
		       s.name AS supplier_name,
		       g.grn_number
		FROM public.supplier_invoices si
		LEFT JOIN public.suppliers s ON s.id = si.supplier_id
		LEFT JOIN public.goods_received_notes g ON g.id = si.grn_id
		WHERE si.tenant_id = $1
		  AND ($2::bigint IS NULL OR g.branch_id = $2)
		ORDER BY si.invoice_date DESC
		LIMIT 500`

	rows, err := h.pool.Query(r.Context(), q, claims.TenantID, branchID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải hóa đơn NCC.")
		return
	}
	defer rows.Close()

	type invoiceRow struct {
		ID             int64    `json:"id"`
		InvoiceNumber  string   `json:"invoice_number"`
		InvoiceDate    string   `json:"invoice_date"`
		TotalAmount    float64  `json:"total_amount"`
		MatchingStatus string   `json:"matching_status"`
		Subtotal       float64  `json:"subtotal"`
		SupplierID     int64    `json:"supplier_id"`
		GrnID          *int64   `json:"grn_id"`
		DueDate        *string  `json:"due_date"`
		PaymentStatus  string   `json:"payment_status"`
		PaidAmount     *float64 `json:"paid_amount"`
		PaidAt         *string  `json:"paid_at"`
		SupplierName   string   `json:"supplier_name"`
		GrnNumber      *string  `json:"grn_number"`
	}

	out := make([]invoiceRow, 0)
	for rows.Next() {
		var inv invoiceRow
		if err := rows.Scan(
			&inv.ID, &inv.InvoiceNumber, &inv.InvoiceDate, &inv.TotalAmount,
			&inv.MatchingStatus, &inv.Subtotal, &inv.SupplierID, &inv.GrnID,
			&inv.DueDate, &inv.PaymentStatus, &inv.PaidAmount, &inv.PaidAt,
			&inv.SupplierName, &inv.GrnNumber,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read invoice")
			return
		}
		out = append(out, inv)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// POST /inventory/supplier-invoices

type createInvoiceBody struct {
	SupplierID    int64   `json:"supplier_id"`
	GrnID         *int64  `json:"grn_id"`
	PoID          *int64  `json:"po_id"`
	InvoiceNumber string  `json:"invoice_number"`
	InvoiceDate   string  `json:"invoice_date"`
	Subtotal      float64 `json:"subtotal"`
	VatRate       float64 `json:"vat_rate"`
	VatAmount     float64 `json:"vat_amount"`
	TotalAmount   float64 `json:"total_amount"`
	MatchingNotes *string `json:"matching_notes"`
	DueDate       *string `json:"due_date"`
}

func (h *Handler) createSupplierInvoice(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body createInvoiceBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.InvoiceNumber == "" {
		httputil.WriteError(w, http.StatusBadRequest, "invoice_number không được để trống")
		return
	}

	// Auto-compute due_date from supplier payment_terms_days if not provided.
	dueDate := body.DueDate
	if dueDate == nil {
		var termsDays *int
		_ = h.pool.QueryRow(r.Context(),
			`SELECT payment_terms_days FROM public.suppliers WHERE id = $1 AND tenant_id = $2`,
			body.SupplierID, claims.TenantID,
		).Scan(&termsDays)
		if termsDays != nil && *termsDays > 0 {
			// Arithmetic in SQL to avoid timezone edge cases.
			var computed string
			_ = h.pool.QueryRow(r.Context(),
				`SELECT ($1::date + $2::integer)::text`, body.InvoiceDate, *termsDays,
			).Scan(&computed)
			if computed != "" {
				dueDate = &computed
			}
		}
	}

	var id int64
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO public.supplier_invoices
		   (tenant_id, supplier_id, grn_id, po_id, invoice_number, invoice_date,
		    subtotal, vat_rate, vat_amount, total_amount, matching_notes,
		    created_by, due_date, payment_status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'unpaid')
		 RETURNING id`,
		claims.TenantID, body.SupplierID, body.GrnID, body.PoID,
		body.InvoiceNumber, body.InvoiceDate,
		body.Subtotal, body.VatRate, body.VatAmount, body.TotalAmount, body.MatchingNotes,
		claims.UserUUID, dueDate,
	).Scan(&id)
	if err != nil {
		status, msg := mapRPCError(err, "Không thể tạo hóa đơn NCC.")
		if status == http.StatusConflict {
			httputil.WriteError(w, status, "Số hóa đơn đã tồn tại cho NCC này.")
			return
		}
		httputil.WriteError(w, status, msg)
		return
	}

	// Auto-trigger 3-way matching (non-fatal — invoice creation still succeeds).
	_, _ = h.pool.Exec(r.Context(),
		`SELECT public.recompute_supplier_invoice_matching($1)`, id,
	)

	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"id": id})
}

// POST /inventory/supplier-invoices/{id}/recompute-matching

func (h *Handler) recomputeInvoiceMatching(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	invoiceID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var raw json.RawMessage
	err := h.pool.QueryRow(r.Context(),
		`SELECT public.recompute_supplier_invoice_matching($1)`, invoiceID,
	).Scan(&raw)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tính khớp.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── Menu-item Recipes ────────────────────────────────────────────────────────
// These are sale-item BOMs (menu_items → recipes table), distinct from
// production-recipes (finished-goods BOM in recipes.go).

// GET /inventory/menu-recipes

func (h *Handler) listMenuRecipes(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	const q = `
		SELECT mi.id, mi.name, mi.updated_at,
		       mc.name AS category_name,
		       COALESCE(
		         json_agg(
		           json_build_object(
		             'ingredient_id',   rec.ingredient_id,
		             'quantity',        rec.quantity,
		             'unit',            rec.unit,
		             'note',            rec.note,
		             'yield_factor',    rec.yield_factor,
		             'ingredient_name', ing.name,
		             'ingredient_unit', ing.unit,
		             'purchase_unit',   ing.purchase_unit,
		             'unit_cost',       ing.unit_cost
		           )
		         ) FILTER (WHERE rec.ingredient_id IS NOT NULL),
		         '[]'::json
		       ) AS recipe_lines
		FROM public.menu_items mi
		LEFT JOIN public.menu_categories mc ON mc.id = mi.category_id
		LEFT JOIN public.recipes rec
		       ON rec.menu_item_id = mi.id AND rec.tenant_id = mi.tenant_id
		LEFT JOIN public.ingredients ing ON ing.id = rec.ingredient_id
		WHERE mi.tenant_id = $1 AND mi.is_active = true
		GROUP BY mi.id, mc.name
		ORDER BY mi.name`

	rows, err := h.pool.Query(r.Context(), q, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải định mức món bán.")
		return
	}
	defer rows.Close()

	type recipeItem struct {
		ID           int64           `json:"id"`
		Name         string          `json:"name"`
		UpdatedAt    string          `json:"updated_at"`
		CategoryName *string         `json:"category_name"`
		RecipeLines  json.RawMessage `json:"recipe_lines"`
	}

	out := make([]recipeItem, 0)
	for rows.Next() {
		var item recipeItem
		if err := rows.Scan(&item.ID, &item.Name, &item.UpdatedAt,
			&item.CategoryName, &item.RecipeLines); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read recipe")
			return
		}
		out = append(out, item)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// POST /inventory/menu-recipes

type menuRecipeLine struct {
	IngredientID int64   `json:"ingredient_id"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit"`
	Note         *string `json:"note"`
	YieldFactor  float64 `json:"yield_factor"`
}

type upsertMenuRecipeLinesBody struct {
	MenuItemID int64            `json:"menu_item_id"`
	Lines      []menuRecipeLine `json:"lines"`
}

func (h *Handler) upsertMenuRecipeLines(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body upsertMenuRecipeLinesBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.MenuItemID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "menu_item_id không hợp lệ")
		return
	}

	type rpcLine struct {
		IngredientID int64   `json:"ingredient_id"`
		Quantity     float64 `json:"quantity"`
		Unit         string  `json:"unit"`
		Note         *string `json:"note"`
		YieldFactor  float64 `json:"yield_factor"`
	}
	rpcLines := make([]rpcLine, len(body.Lines))
	for i, l := range body.Lines {
		yf := l.YieldFactor
		if yf == 0 {
			yf = 1.0
		}
		rpcLines[i] = rpcLine{
			IngredientID: l.IngredientID,
			Quantity:     l.Quantity,
			Unit:         l.Unit,
			Note:         l.Note,
			YieldFactor:  yf,
		}
	}
	linesJSON, _ := json.Marshal(rpcLines)

	_, err := h.pool.Exec(r.Context(),
		`SELECT public.upsert_recipe_lines($1, $2::jsonb)`,
		body.MenuItemID, linesJSON,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể lưu định mức món bán.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
}

// GET /inventory/menu-recipes/menu-items

func (h *Handler) listMenuItemsForRecipes(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	rows, err := h.pool.Query(r.Context(),
		`SELECT id, name, is_active FROM public.menu_items
		 WHERE tenant_id = $1 ORDER BY name`,
		claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải món.")
		return
	}
	defer rows.Close()

	type menuItem struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		IsActive bool   `json:"is_active"`
	}

	out := make([]menuItem, 0)
	for rows.Next() {
		var m menuItem
		if err := rows.Scan(&m.ID, &m.Name, &m.IsActive); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read menu item")
			return
		}
		out = append(out, m)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// GET /inventory/stock/central-kitchen-wac

func (h *Handler) getCentralKitchenWAC(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	rows, err := h.pool.Query(r.Context(),
		`SELECT sl.ingredient_id, AVG(sl.avg_unit_cost) AS wac
		 FROM public.stock_levels sl
		 JOIN public.branches b ON b.id = sl.branch_id
		 WHERE sl.tenant_id = $1
		   AND b.branch_kind = 'central_kitchen'
		   AND sl.avg_unit_cost IS NOT NULL
		 GROUP BY sl.ingredient_id`,
		claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải WAC bếp trung tâm.")
		return
	}
	defer rows.Close()

	wacMap := map[string]float64{}
	for rows.Next() {
		var ingredientID int64
		var wac float64
		if err := rows.Scan(&ingredientID, &wac); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read WAC")
			return
		}
		wacMap[strconv.FormatInt(ingredientID, 10)] = wac
	}
	httputil.WriteJSON(w, http.StatusOK, wacMap)
}

// ─── Stub endpoints (R2 / xlsx generation deferred to Phase E) ───────────────

// exportMenuRecipesStub returns 501 — xlsx/csv generation requires R2 (Phase E).
func (h *Handler) exportMenuRecipesStub(w http.ResponseWriter, _ *http.Request) {
	httputil.WriteError(w, http.StatusNotImplemented,
		"Menu-recipe export via spreadsheet is not yet implemented (R2 deferred to Phase E).")
}

// importMenuRecipesStub returns 501 — multipart file parsing + R2 deferred.
func (h *Handler) importMenuRecipesStub(w http.ResponseWriter, _ *http.Request) {
	httputil.WriteError(w, http.StatusNotImplemented,
		"Menu-recipe import via spreadsheet is not yet implemented (R2 deferred to Phase E).")
}

// downloadMenuRecipeTemplateStub returns 501 — xlsx generation deferred.
func (h *Handler) downloadMenuRecipeTemplateStub(w http.ResponseWriter, _ *http.Request) {
	httputil.WriteError(w, http.StatusNotImplemented,
		"Menu-recipe template download is not yet implemented (R2 deferred to Phase E).")
}

// ─── error mappers ────────────────────────────────────────────────────────────

// mapGRNRPCError maps known amend_grn_line / confirm_goods_receipt_note errors.
func mapGRNRPCError(err error) (int, string) {
	if err == nil {
		return http.StatusInternalServerError, "Không thể xử lý phiếu nhập."
	}
	msg := err.Error()
	if strings.Contains(msg, "forbidden_owner_only") {
		return http.StatusForbidden, "Chỉ Owner được sửa phiếu đã chốt."
	}
	if strings.Contains(msg, "grn_not_confirmed_use_upsert") {
		return http.StatusUnprocessableEntity, "Chỉ áp dụng cho phiếu nhập đã chốt."
	}
	if strings.Contains(msg, "has_active_supplier_return") {
		return http.StatusConflict, "Dòng đã có phiếu trả NCC liên kết — không thể sửa trực tiếp."
	}
	if strings.Contains(msg, "has_paid_invoice") {
		return http.StatusConflict, "Phiếu đã có hóa đơn NCC đang/đã thanh toán — không thể sửa trực tiếp."
	}
	if strings.Contains(msg, "negative_stock") {
		return http.StatusUnprocessableEntity, "Sửa làm tồn kho âm — không cho phép."
	}
	if strings.Contains(msg, "rejected_exceeds_received") {
		return http.StatusBadRequest, "Số trả NCC không được vượt số đã giao."
	}
	if strings.Contains(msg, "reason_required_min_5_chars") {
		return http.StatusBadRequest, "Lý do tối thiểu 5 ký tự."
	}
	if strings.Contains(msg, "invalid_amount") {
		return http.StatusBadRequest, "Số lượng/đơn giá không hợp lệ."
	}
	if strings.Contains(msg, "grn_line_not_found") {
		return http.StatusNotFound, "Không tìm thấy dòng phiếu nhập."
	}
	return http.StatusInternalServerError, "Không thể xử lý phiếu nhập."
}

// mapGRNFromPORPCError mirrors PG_ERR_TO_VI from grn-actions.ts createGrnFromPo.
func mapGRNFromPORPCError(err error) (int, string) {
	if err == nil {
		return http.StatusInternalServerError, "Không thể tạo phiếu nhập."
	}
	msg := err.Error()
	if strings.Contains(msg, "insufficient_privilege") {
		return http.StatusForbidden, "Bạn không có quyền tạo phiếu nhập từ PO này."
	}
	if strings.Contains(msg, "no_data_found") {
		return http.StatusNotFound, "PO không tồn tại hoặc đã nhận đủ hàng."
	}
	if strings.Contains(msg, "check_violation") {
		return http.StatusUnprocessableEntity, "PO không đủ điều kiện (trạng thái, kho nhận, hoặc NCC không hợp lệ)."
	}
	if strings.Contains(msg, "invalid_parameter_value") {
		return http.StatusBadRequest, "Tham số đầu vào không hợp lệ."
	}
	return http.StatusInternalServerError, "Không thể tạo phiếu nhập."
}
