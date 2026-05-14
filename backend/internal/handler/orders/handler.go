package orders

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// Handler handles order-related HTTP endpoints.
type Handler struct {
	pool    *pgxpool.Pool
	checker middleware.PermissionChecker
}

// New returns a new Handler. checker may be nil (skips ABAC — legacy mode).
func New(pool *pgxpool.Pool, checker middleware.PermissionChecker) *Handler {
	return &Handler{pool: pool, checker: checker}
}

// perm returns a RequirePermission middleware when a checker is configured,
// or a pass-through middleware when checker is nil.
func (h *Handler) perm(key string) func(http.Handler) http.Handler {
	if h.checker == nil {
		return func(next http.Handler) http.Handler { return next }
	}
	return middleware.RequirePermission(h.checker, key)
}

// Routes returns a chi.Router wired with all order endpoints.
// Mount at /br/{branchId}/orders.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(h.perm("orders:read")).Get("/", h.listOrders)
	r.With(h.perm("pos:use")).Post("/", h.createOrder)
	r.With(h.perm("orders:read")).Get("/{id}", h.getOrder)
	r.With(h.perm("pos:void_order")).Delete("/{id}", h.voidOrder)
	r.With(h.perm("pos:use")).Post("/{id}/items", h.appendItems)
	r.With(h.perm("pos:use")).Patch("/{id}/items/{itemId}/serve", h.serveItem)
	r.With(h.perm("pos:confirm_payment")).Post("/{id}/payment", h.confirmPayment)
	return r
}

func parseID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
}

func parseBranchID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "branchId"), 10, 64)
}

func (h *Handler) listOrders(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	branchID, err := parseBranchID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid branch id")
		return
	}
	const q = `SELECT id, tenant_id, branch_id, table_id, order_number, order_type,
		status, subtotal, total_amount, payment_method, payment_status,
		customer_count, note, created_by, created_at
		FROM public.orders
		WHERE tenant_id = $1 AND branch_id = $2
		ORDER BY created_at DESC
		LIMIT 100`
	rows, err := h.pool.Query(r.Context(), q, claims.TenantID, branchID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch orders")
		return
	}
	defer rows.Close()
	result := make([]Order, 0)
	for rows.Next() {
		o, scanErr := scanOrder(rows)
		if scanErr != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read orders")
			return
		}
		result = append(result, o)
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) getOrder(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	branchID, err := parseBranchID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid branch id")
		return
	}
	id, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	const q = `SELECT id, tenant_id, branch_id, table_id, order_number, order_type,
		status, subtotal, total_amount, payment_method, payment_status,
		customer_count, note, created_by, created_at
		FROM public.orders
		WHERE id = $1 AND tenant_id = $2 AND branch_id = $3`
	row := h.pool.QueryRow(r.Context(), q, id, claims.TenantID, branchID)
	o, err := scanOrderRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "order not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch order")
		return
	}

	// Fetch items
	const itemsQ = `SELECT id, order_id, menu_item_id, variant_id,
		item_name, variant_name, quantity, unit_price, subtotal, note, status
		FROM public.order_items
		WHERE order_id = $1 AND tenant_id = $2
		ORDER BY id`
	itemRows, err := h.pool.Query(r.Context(), itemsQ, id, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch order items")
		return
	}
	defer itemRows.Close()
	for itemRows.Next() {
		item, scanErr := scanItem(itemRows)
		if scanErr != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read order items")
			return
		}
		o.Items = append(o.Items, item)
	}
	httputil.WriteJSON(w, http.StatusOK, o)
}

func (h *Handler) createOrder(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	branchID, err := parseBranchID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid branch id")
		return
	}
	var req CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Items) == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "items must not be empty")
		return
	}
	if req.OrderType == "" {
		req.OrderType = "dine_in"
	}
	if req.CustomerCount <= 0 {
		req.CustomerCount = 1
	}

	// Build items JSONB for the RPC
	itemsJSON, err := json.Marshal(req.Items)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to encode items")
		return
	}

	// Use create_order RPC for atomic order + items + status history + table status.
	// Run inside WithAuthContext so auth.uid() resolves to the caller's UUID.
	const q = `SELECT public.create_order($1, $2, $3::UUID, $4::JSONB, $5, $6, $7, $8, $9)`
	var resultJSON []byte
	err = db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), q,
			claims.TenantID,
			branchID,
			claims.UserUUID,
			string(itemsJSON),
			req.OrderType,
			req.TableID,
			req.PosSessionID,
			req.CustomerCount,
			req.Note,
		).Scan(&resultJSON)
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create order")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, json.RawMessage(resultJSON))
}

func (h *Handler) voidOrder(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	branchID, err := parseBranchID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid branch id")
		return
	}
	id, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	const q = `UPDATE public.orders SET status = 'cancelled', updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND branch_id = $3
		AND status NOT IN ('completed', 'cancelled')`
	tag, err := h.pool.Exec(r.Context(), q, id, claims.TenantID, branchID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to void order")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.WriteError(w, http.StatusNotFound, "order not found or already completed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) appendItems(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	branchID, err := parseBranchID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid branch id")
		return
	}
	orderID, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req AppendItemsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Items) == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "items must not be empty")
		return
	}

	// Verify order exists, belongs to branch, and is in an appendable state
	var status string
	err = h.pool.QueryRow(r.Context(),
		`SELECT status FROM public.orders WHERE id = $1 AND tenant_id = $2 AND branch_id = $3`,
		orderID, claims.TenantID, branchID,
	).Scan(&status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "order not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch order")
		return
	}
	if status == "completed" || status == "cancelled" {
		httputil.WriteError(w, http.StatusConflict, "order is not open for new items")
		return
	}

	// Batch insert items
	batch := &pgx.Batch{}
	for _, item := range req.Items {
		batch.Queue(
			`INSERT INTO public.order_items
				(tenant_id, order_id, menu_item_id, variant_id,
				 item_name, variant_name, quantity, unit_price, subtotal, note)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			claims.TenantID, orderID, item.MenuItemID, item.VariantID,
			item.ItemName, item.VariantName, item.Quantity, item.UnitPrice, item.Subtotal, item.Note,
		)
	}
	br := h.pool.SendBatch(r.Context(), batch)
	defer br.Close()
	for range req.Items {
		if _, err := br.Exec(); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to append items")
			return
		}
	}
	if err := br.Close(); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to flush items")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) serveItem(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orderID, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid order id")
		return
	}
	itemID, err := strconv.ParseInt(chi.URLParam(r, "itemId"), 10, 64)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid item id")
		return
	}
	const q = `UPDATE public.order_items SET status = 'served', updated_at = now()
		WHERE id = $1 AND order_id = $2 AND tenant_id = $3 AND status != 'cancelled'`
	tag, err := h.pool.Exec(r.Context(), q, itemID, orderID, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to serve item")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.WriteError(w, http.StatusNotFound, "item not found or cancelled")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) confirmPayment(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	branchID, err := parseBranchID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid branch id")
		return
	}
	orderID, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req PaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Method == "" {
		httputil.WriteError(w, http.StatusBadRequest, "method is required")
		return
	}
	if req.Amount == "" {
		httputil.WriteError(w, http.StatusBadRequest, "amount is required")
		return
	}

	switch req.Method {
	case "cash":
		h.confirmCashPayment(w, r, branchID, orderID, req)
	case "momo":
		h.confirmMoMoPayment(w, r, branchID, orderID, req)
	case "vietqr":
		// VietQR has its own cashier-confirm endpoint because the payment row
		// is only created at confirm time (no pending row, no provider call).
		httputil.WriteError(w, http.StatusUnprocessableEntity, "vietqr uses POST /payment/vietqr/confirm")
	default:
		httputil.WriteError(w, http.StatusUnprocessableEntity, "unsupported payment method")
	}
}

func (h *Handler) confirmCashPayment(w http.ResponseWriter, r *http.Request, branchID, orderID int64, req PaymentRequest) {
	claims := middleware.ClaimsFrom(r.Context())
	const q = `SELECT public.create_payment($1, $2, $3, $4, $5::NUMERIC(15,2), $6::UUID)`
	var resultJSON []byte
	if err := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), q,
			claims.TenantID, branchID, orderID, req.Method, req.Amount, claims.UserUUID,
		).Scan(&resultJSON)
	}); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to process payment")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(resultJSON))
}

// scanOrder scans an order row from a Rows result set (multiple rows query).
func scanOrder(rows pgx.Rows) (Order, error) {
	var o Order
	var tableID sql.NullInt64
	var paymentMethod sql.NullString
	var note sql.NullString
	var createdAt sql.NullTime
	err := rows.Scan(
		&o.ID, &o.TenantID, &o.BranchID, &tableID,
		&o.OrderNumber, &o.OrderType, &o.Status,
		&o.Subtotal, &o.TotalAmount,
		&paymentMethod, &o.PaymentStatus,
		&o.CustomerCount, &note, &o.CreatedBy, &createdAt,
	)
	if err != nil {
		return o, err
	}
	if tableID.Valid {
		o.TableID = &tableID.Int64
	}
	if paymentMethod.Valid {
		o.PaymentMethod = &paymentMethod.String
	}
	if note.Valid {
		o.Note = &note.String
	}
	if createdAt.Valid {
		o.CreatedAt = createdAt.Time.String()
	}
	return o, nil
}

// scanOrderRow scans an order from a single Row (QueryRow result).
func scanOrderRow(row pgx.Row) (Order, error) {
	var o Order
	var tableID sql.NullInt64
	var paymentMethod sql.NullString
	var note sql.NullString
	var createdAt sql.NullTime
	err := row.Scan(
		&o.ID, &o.TenantID, &o.BranchID, &tableID,
		&o.OrderNumber, &o.OrderType, &o.Status,
		&o.Subtotal, &o.TotalAmount,
		&paymentMethod, &o.PaymentStatus,
		&o.CustomerCount, &note, &o.CreatedBy, &createdAt,
	)
	if err != nil {
		return o, err
	}
	if tableID.Valid {
		o.TableID = &tableID.Int64
	}
	if paymentMethod.Valid {
		o.PaymentMethod = &paymentMethod.String
	}
	if note.Valid {
		o.Note = &note.String
	}
	if createdAt.Valid {
		o.CreatedAt = createdAt.Time.String()
	}
	return o, nil
}

// scanItem scans an order item from a Rows result set.
func scanItem(rows pgx.Rows) (OrderItem, error) {
	var item OrderItem
	var variantID sql.NullInt64
	var variantName sql.NullString
	var note sql.NullString
	err := rows.Scan(
		&item.ID, &item.OrderID, &item.MenuItemID, &variantID,
		&item.ItemName, &variantName, &item.Quantity,
		&item.UnitPrice, &item.Subtotal, &note, &item.Status,
	)
	if err != nil {
		return item, err
	}
	if variantID.Valid {
		item.VariantID = &variantID.Int64
	}
	if variantName.Valid {
		item.VariantName = &variantName.String
	}
	if note.Valid {
		item.Note = &note.String
	}
	return item, nil
}
