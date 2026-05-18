package inventory

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

func (h *Handler) registerTransferRoutes(r chi.Router) {
	r.Get("/transfers", h.listStockTransfers)
	r.Get("/transfers/{id}", h.getStockTransferDetail)
	r.Post("/transfers", h.createStockTransfer)
	r.Put("/transfers/{id}/lines", h.upsertTransferLine)
	r.Post("/transfers/{id}/confirm-ship", h.transferConfirmShip)
	r.Post("/transfers/{id}/mark-in-transit", h.transferMarkInTransit)
	r.Post("/transfers/{id}/confirm-receive", h.transferConfirmReceive)
	r.Post("/transfers/{id}/receive", h.transferReceive)
	r.Get("/transfers/branches", h.listBranchesForTransfer)
}

// GET /inventory/transfers
func (h *Handler) listStockTransfers(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var raw json.RawMessage
	err := h.pool.QueryRow(r.Context(),
		`SELECT public.stock_transfer_list($1, $2)`, claims.TenantID, claims.BranchID,
	).Scan(&raw)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải phiếu chuyển.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// GET /inventory/transfers/{id}
func (h *Handler) getStockTransferDetail(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	transferID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	// Fetch transfer
	type transferRow struct {
		ID             int64   `json:"id"`
		TransferNumber *string `json:"transfer_number"`
		TenantID       int64   `json:"tenant_id"`
		FromBranchID   int64   `json:"from_branch_id"`
		ToBranchID     int64   `json:"to_branch_id"`
		FromLocationID *int64  `json:"from_location_id"`
		ToLocationID   *int64  `json:"to_location_id"`
		Status         string  `json:"status"`
		Notes          *string `json:"notes"`
		VehicleInfo    *string `json:"vehicle_info"`
		ShippedAt      *string `json:"shipped_at"`
		ReceivedAt     *string `json:"received_at"`
		CreatedAt      string  `json:"created_at"`
	}

	var tr transferRow
	err := h.pool.QueryRow(r.Context(),
		`SELECT id, transfer_number, tenant_id, from_branch_id, to_branch_id,
		        from_location_id, to_location_id, status, notes, vehicle_info,
		        shipped_at, received_at, created_at
		 FROM public.stock_transfers
		 WHERE id = $1 AND tenant_id = $2`,
		transferID, claims.TenantID,
	).Scan(
		&tr.ID, &tr.TransferNumber, &tr.TenantID, &tr.FromBranchID, &tr.ToBranchID,
		&tr.FromLocationID, &tr.ToLocationID, &tr.Status, &tr.Notes, &tr.VehicleInfo,
		&tr.ShippedAt, &tr.ReceivedAt, &tr.CreatedAt,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy phiếu chuyển.")
		return
	}

	// Fetch lines
	rows, err := h.pool.Query(r.Context(),
		`SELECT sti.id, sti.ingredient_id, i.name, i.unit, i.purchase_unit,
		        sti.quantity, sti.received_quantity, sti.unit
		 FROM public.stock_transfer_items sti
		 JOIN public.ingredients i ON i.id = sti.ingredient_id
		 WHERE sti.transfer_id = $1 AND sti.tenant_id = $2`,
		transferID, claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không tải được dòng chuyển.")
		return
	}
	defer rows.Close()

	type lineRow struct {
		ID               int64    `json:"id"`
		IngredientID     int64    `json:"ingredient_id"`
		IngredientName   string   `json:"ingredient_name"`
		Unit             string   `json:"unit"`
		PurchaseUnit     *string  `json:"purchase_unit"`
		Quantity         float64  `json:"quantity"`
		ReceivedQuantity *float64 `json:"received_quantity"`
		TransferUnit     string   `json:"transfer_unit"`
	}

	lines := make([]lineRow, 0)
	for rows.Next() {
		var l lineRow
		if err := rows.Scan(
			&l.ID, &l.IngredientID, &l.IngredientName, &l.Unit, &l.PurchaseUnit,
			&l.Quantity, &l.ReceivedQuantity, &l.TransferUnit,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read line")
			return
		}
		lines = append(lines, l)
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"transfer": tr, "lines": lines})
}

// POST /inventory/transfers
// Intra-branch: commit_intra_branch_transfer (uses auth.uid()).
// Inter-branch: create_stock_transfer_draft (uses auth.uid()).
func (h *Handler) createStockTransfer(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body struct {
		FromBranchID   int64           `json:"from_branch_id"`
		ToBranchID     int64           `json:"to_branch_id"`
		FromLocationID *int64          `json:"from_location_id"`
		ToLocationID   *int64          `json:"to_location_id"`
		Notes          *string         `json:"notes"`
		VehicleInfo    *string         `json:"vehicle_info"`
		Lines          json.RawMessage `json:"lines"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.FromBranchID <= 0 || body.ToBranchID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "from_branch_id / to_branch_id không hợp lệ")
		return
	}

	isIntraBranch := body.FromBranchID == body.ToBranchID
	if isIntraBranch {
		if body.FromLocationID == nil || body.ToLocationID == nil {
			httputil.WriteError(w, http.StatusBadRequest, "Chuyển nội bộ cần chọn vị trí kho gửi và nhận.")
			return
		}
		if *body.FromLocationID == *body.ToLocationID {
			httputil.WriteError(w, http.StatusBadRequest, "Vị trí gửi và nhận phải khác nhau.")
			return
		}
	}

	var raw json.RawMessage
	var rpcErr error

	if isIntraBranch {
		rpcErr = db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(),
				`SELECT public.commit_intra_branch_transfer($1, $2, $3, $4, $5, $6)`,
				body.FromBranchID, body.FromLocationID, body.ToLocationID,
				nil, body.Notes, body.Lines,
			).Scan(&raw)
		})
	} else {
		rpcErr = db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(),
				`SELECT public.create_stock_transfer_draft($1, $2, $3, $4, $5, $6, $7, $8)`,
				body.FromBranchID, body.ToBranchID, body.FromLocationID, body.ToLocationID,
				nil, body.Notes, body.VehicleInfo, body.Lines,
			).Scan(&raw)
		})
	}

	if rpcErr != nil {
		status, msg := mapTransferError(rpcErr, isIntraBranch)
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, json.RawMessage(raw))
}

// PUT /inventory/transfers/{id}/lines
func (h *Handler) upsertTransferLine(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	transferID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body struct {
		IngredientID int64   `json:"ingredient_id"`
		Quantity     float64 `json:"quantity"`
		Unit         string  `json:"unit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.IngredientID <= 0 || body.Quantity <= 0 || body.Unit == "" {
		httputil.WriteError(w, http.StatusBadRequest, "Dữ liệu dòng chuyển không hợp lệ")
		return
	}

	// Verify transfer is in draft status
	var status string
	err := h.pool.QueryRow(r.Context(),
		`SELECT status FROM public.stock_transfers WHERE id = $1 AND tenant_id = $2`,
		transferID, claims.TenantID,
	).Scan(&status)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy phiếu chuyển.")
		return
	}
	if status != "draft" {
		httputil.WriteError(w, http.StatusConflict, "Chỉ được sửa dòng khi phiếu còn nháp.")
		return
	}

	_, err = h.pool.Exec(r.Context(),
		`INSERT INTO public.stock_transfer_items (tenant_id, transfer_id, ingredient_id, quantity, unit)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (transfer_id, ingredient_id, tenant_id)
		 DO UPDATE SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit`,
		claims.TenantID, transferID, body.IngredientID, body.Quantity, body.Unit,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể lưu dòng chuyển.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
}

// POST /inventory/transfers/{id}/confirm-ship
// RPC stock_transfer_confirm_ship uses auth.uid() → WithAuthContext.
func (h *Handler) transferConfirmShip(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	transferID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), `SELECT public.stock_transfer_confirm_ship($1)`, transferID)
		return err
	})
	if rpcErr != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể xác nhận xuất (kiểm tra tồn kho gửi).")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
}

// POST /inventory/transfers/{id}/mark-in-transit
// RPC stock_transfer_mark_in_transit uses auth.uid() → WithAuthContext.
func (h *Handler) transferMarkInTransit(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	transferID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), `SELECT public.stock_transfer_mark_in_transit($1)`, transferID)
		return err
	})
	if rpcErr != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể chuyển trạng thái vận chuyển.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
}

// POST /inventory/transfers/{id}/confirm-receive
// RPC stock_transfer_confirm_receive uses auth.uid() → WithAuthContext.
func (h *Handler) transferConfirmReceive(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	transferID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), `SELECT public.stock_transfer_confirm_receive($1)`, transferID)
		return err
	})
	if rpcErr != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể bắt đầu kiểm nhận (phiếu phải đang vận chuyển).")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
}

// POST /inventory/transfers/{id}/receive
// RPC stock_transfer_receive uses auth.uid() → WithAuthContext.
func (h *Handler) transferReceive(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	transferID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body struct {
		Items json.RawMessage `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(),
			`SELECT public.stock_transfer_receive($1, $2::jsonb)`,
			transferID, body.Items,
		)
		return err
	})
	if rpcErr != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể xác nhận nhập kho đích.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
}

// GET /inventory/transfers/branches
func (h *Handler) listBranchesForTransfer(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var raw json.RawMessage
	err := h.pool.QueryRow(r.Context(),
		`SELECT public.stock_transfer_list_branches()`,
	).Scan(&raw)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách kho.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// mapTransferError maps Postgres errors for transfer RPCs.
func mapTransferError(err error, isIntraBranch bool) (int, string) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "42501":
			if isIntraBranch {
				return http.StatusForbidden, "Không có quyền tạo Cấp bếp."
			}
			return http.StatusForbidden, "Không có quyền tạo phiếu chuyển."
		case "23514", "22P02":
			if isIntraBranch {
				return http.StatusUnprocessableEntity, "Cấp bếp cần gửi từ kho chi nhánh sang một vị trí bếp cùng chi nhánh. Kiểm tra cấu hình kho/bếp."
			}
			return http.StatusUnprocessableEntity, "Thông tin kho luân chuyển không hợp lệ."
		}
	}
	if isIntraBranch {
		return http.StatusInternalServerError, "Không thể tạo Cấp bếp."
	}
	return http.StatusInternalServerError, "Không thể tạo phiếu chuyển."
}
