// Package payments serves the per-branch VietQR config + cashier-confirm
// endpoints that the POS calls when the customer pays by bank transfer.
// Admin payment-settings CRUD lives in handler/settings/payments_admin.go.
package payments

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
	paymentconfig "github.com/personal/comtammatu/backend/internal/payment/config"
)

// Handler serves /br/{branchId}/payments/* and /br/{branchId}/orders/{id}/payment/vietqr/* routes.
type Handler struct {
	pool    *pgxpool.Pool
	checker middleware.PermissionChecker
}

// New constructs a Handler. checker may be nil (skips ABAC — legacy mode).
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

// Routes mounts the per-branch payment routes under /br/{branchId}/payments.
// The order-scoped VietQR confirm endpoint is mounted separately in main.go
// so it can share the {branchId}/orders/{id} URL shape.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(h.perm("pos:use")).Get("/vietqr-config", h.getVietQRConfig)
	return r
}

func (h *Handler) getVietQRConfig(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if _, err := branchFromContext(r, claims.TenantID, h.pool); err != nil {
		httputil.WriteError(w, http.StatusNotFound, "branch not found")
		return
	}

	cfg, err := paymentconfig.Load(r.Context(), h.pool, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to load payment config")
		return
	}
	if !cfg.EnableVietQR {
		// Graceful fallback — same shape, but with enabled=false so the POS
		// can hide the VietQR button without a separate 404 branch.
		httputil.WriteJSON(w, http.StatusOK, map[string]any{
			"enabled":      false,
			"bank_code":    "",
			"account_no":   "",
			"account_name": "",
		})
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"enabled":      true,
		"bank_code":    cfg.VietQR.BankCode,
		"account_no":   cfg.VietQR.AccountNo,
		"account_name": cfg.VietQR.AccountName,
	})
}

// amountPattern matches NUMERIC(15,2) shape — up to 13 integer digits, up to
// 2 fractional digits, no leading sign. Mirrors the validation in
// settings/handler.go for pos_config.cash_float_default.
var amountPattern = regexp.MustCompile(`^\d{1,13}(\.\d{1,2})?$`)

// ConfirmVietQR handles POST /br/{branchId}/orders/{id}/payment/vietqr/confirm.
// Mounted standalone in main.go because the URL spans both payment + order
// scopes. The atomic side effects (insert payment, mark order paid, post GL,
// finalise paid order, enqueue receipt) all live inside the SQL RPC — we
// just bridge HTTP → RPC and surface the JSONB result verbatim.
func (h *Handler) ConfirmVietQR(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	branchID, err := branchFromContext(r, claims.TenantID, h.pool)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "branch not found")
		return
	}
	orderID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid order id")
		return
	}

	var req struct {
		Amount string `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !amountPattern.MatchString(req.Amount) {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "amount must be a non-negative decimal string with at most 2 fractional digits")
		return
	}

	// Run inside WithAuthContext so auth.uid() resolves to the caller's UUID.
	const q = `SELECT public.confirm_vietqr_payment($1, $2, $3, $4::NUMERIC(15,2), $5::UUID)`
	var resultJSON []byte
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), q,
			claims.TenantID, branchID, orderID, req.Amount, claims.UserUUID,
		).Scan(&resultJSON)
	})
	if rpcErr != nil {
		// confirm_vietqr_payment raises distinct SQLSTATE codes for "order
		// not found", "amount mismatch", "branch scope mismatch". Map the
		// well-known codes to HTTP so the cashier UI can show an actionable
		// message instead of a generic 500.
		var pgErr *pgconn.PgError
		if errors.As(rpcErr, &pgErr) {
			switch pgErr.Code {
			case "P0002": // no_data_found — order not found
				httputil.WriteError(w, http.StatusNotFound, pgErr.Message)
				return
			case "42501": // insufficient_privilege — branch scope mismatch
				httputil.WriteError(w, http.StatusForbidden, pgErr.Message)
				return
			case "22023", "P0001": // invalid_parameter_value or generic raise — amount mismatch etc.
				httputil.WriteError(w, http.StatusUnprocessableEntity, pgErr.Message)
				return
			case "28000": // not_authenticated — auth.uid() still NULL (shouldn't happen after BUG-02 fix)
				httputil.WriteError(w, http.StatusUnauthorized, "not authenticated")
				return
			}
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to confirm vietqr payment")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(resultJSON))
}

// branchFromContext validates that the {branchId} URL param exists and belongs
// to the caller's tenant. Returns the parsed branchID on success.
func branchFromContext(r *http.Request, tenantID int64, pool *pgxpool.Pool) (int64, error) {
	branchID, err := strconv.ParseInt(chi.URLParam(r, "branchId"), 10, 64)
	if err != nil {
		return 0, errors.New("invalid branch id")
	}
	var exists bool
	if err := pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM public.branches WHERE id = $1 AND tenant_id = $2)`,
		branchID, tenantID,
	).Scan(&exists); err != nil {
		return 0, err
	}
	if !exists {
		return 0, pgx.ErrNoRows
	}
	return branchID, nil
}
