package kds

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// Handler serves KDS endpoints.
type Handler struct{ pool *pgxpool.Pool }

// New constructs a Handler.
func New(pool *pgxpool.Pool) *Handler { return &Handler{pool: pool} }

// Routes returns a chi.Router with KDS sub-routes.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/tickets", h.listTickets)
	r.Patch("/tickets/{id}/ready", h.markReady)
	r.Patch("/tickets/{id}/recall", h.recall)
	return r
}

func (h *Handler) listTickets(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	branchIDStr := r.URL.Query().Get("branchId")
	if branchIDStr == "" {
		httputil.WriteError(w, http.StatusBadRequest, "branchId query param required")
		return
	}
	branchID, err := strconv.ParseInt(branchIDStr, 10, 64)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid branchId")
		return
	}

	const q = `
		SELECT id, tenant_id, branch_id, station_id, order_id, order_item_id,
		       status, bumped_at, created_at, updated_at
		FROM public.kds_tickets
		WHERE tenant_id = $1 AND branch_id = $2 AND status IN ('pending', 'preparing')
		ORDER BY created_at ASC`

	rows, err := h.pool.Query(r.Context(), q, claims.TenantID, branchID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch tickets")
		return
	}
	defer rows.Close()

	tickets := make([]Ticket, 0)
	for rows.Next() {
		var t Ticket
		var bumpedAt sql.NullTime
		var createdAt, updatedAt sql.NullTime
		if err := rows.Scan(&t.ID, &t.TenantID, &t.BranchID, &t.StationID,
			&t.OrderID, &t.OrderItemID, &t.Status, &bumpedAt, &createdAt, &updatedAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read ticket")
			return
		}
		if bumpedAt.Valid {
			s := bumpedAt.Time.String()
			t.BumpedAt = &s
		}
		if createdAt.Valid {
			t.CreatedAt = createdAt.Time.String()
		}
		if updatedAt.Valid {
			t.UpdatedAt = updatedAt.Time.String()
		}
		tickets = append(tickets, t)
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"tickets": tickets})
}

func (h *Handler) markReady(w http.ResponseWriter, r *http.Request) {
	h.updateStatus(w, r, "ready")
}

func (h *Handler) recall(w http.ResponseWriter, r *http.Request) {
	// "recalled" is not a valid DB status; map to "pending" (re-queue).
	h.updateStatus(w, r, "pending")
}

func (h *Handler) updateStatus(w http.ResponseWriter, r *http.Request, status string) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	branchIDStr := r.URL.Query().Get("branchId")
	if branchIDStr == "" {
		httputil.WriteError(w, http.StatusBadRequest, "branchId query param required")
		return
	}
	branchID, err := strconv.ParseInt(branchIDStr, 10, 64)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid branchId")
		return
	}

	const q = `UPDATE public.kds_tickets
		SET status = $1, bumped_at = now(), updated_at = now()
		WHERE id = $2 AND branch_id = $3 AND tenant_id = $4`

	tag, err := h.pool.Exec(r.Context(), q, status, id, branchID, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to update ticket")
		return
	}
	if tag.RowsAffected() == 0 {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "ticket not found")
			return
		}
		httputil.WriteError(w, http.StatusNotFound, "ticket not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
